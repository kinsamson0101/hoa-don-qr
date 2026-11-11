package main

import (
	"bytes"
	"encoding/json"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	hoadonqr "github.com/kinsamson0101/hoa-don-qr"
	"github.com/kinsamson0101/hoa-don-qr/internal/ai"
)

// Config is stored at %APPDATA%\hoa-don-qr\config.json (macOS: ~/Library/Application Support), mode 0600.
type Config struct {
	Keys     map[string]string `json:"keys"`
	Provider string            `json:"provider,omitempty"`
	Models   map[string]string `json:"models"`
	Note     string            `json:"note,omitempty"`

	mu sync.Mutex
}

func configPath() (string, error) {
	if p := os.Getenv("HDQR_CONFIG"); p != "" {
		return p, nil
	}
	d, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "hoa-don-qr", "config.json"), nil
}

func loadConfig(path string) (*Config, error) {
	c := &Config{Keys: map[string]string{}, Models: map[string]string{}}
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return c, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(b, c); err != nil {
		return nil, err
	}
	if c.Keys == nil {
		c.Keys = map[string]string{}
	}
	if c.Models == nil {
		c.Models = map[string]string{}
	}
	return c, nil
}

func (c *Config) save(path string) error {
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// sameOrigin blocks other websites open in the same browser from using this server (and the user's keys):
// the Host must be our 127.0.0.1 address (stops DNS rebinding) and a cross-site Origin / Sec-Fetch-Site is refused.
func sameOrigin(addr string, r *http.Request) bool {
	if r.Host != addr {
		return false
	}
	if o := r.Header.Get("Origin"); o != "" && o != "http://"+addr {
		return false
	}
	switch r.Header.Get("Sec-Fetch-Site") {
	case "", "same-origin", "none":
		return true
	}
	return false
}

func newServer(cfg *Config, cfgPath, addr string) http.Handler {
	mux := http.NewServeMux()
	web, _ := fs.Sub(hoadonqr.Web, ".")
	files := http.FileServer(http.FS(web))

	mux.HandleFunc("/local.js", func(w http.ResponseWriter, r *http.Request) {
		cfg.mu.Lock()
		has := map[string]bool{}
		for k, v := range cfg.Keys {
			has[k] = v != ""
		}
		cfg.mu.Unlock()
		b, _ := json.Marshal(map[string]any{"keys": has})
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write([]byte("window.HDQR_LOCAL = " + string(b) + ";\n"))
	})

	mux.HandleFunc("/api/settings", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOrigin(addr, r) || !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		var in struct{ Provider, Key, Model, Note string }
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		if _, ok := ai.ByID(in.Provider); !ok {
			http.Error(w, "unknown provider", http.StatusBadRequest)
			return
		}
		cfg.mu.Lock()
		if in.Key != "" {
			cfg.Keys[in.Provider] = strings.TrimSpace(in.Key)
		}
		if in.Model != "" {
			cfg.Models[in.Provider] = in.Model
			cfg.Provider = in.Provider
		}
		if in.Note != "" {
			cfg.Note = in.Note
		}
		err := cfg.save(cfgPath)
		cfg.mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	// /proxy/<host>/<path>: forward to an allow-listed AI host with the saved key.
	proxyClient := &http.Client{Timeout: 3 * time.Minute}
	mux.HandleFunc("/proxy/", func(w http.ResponseWriter, r *http.Request) {
		if !sameOrigin(addr, r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		rest := strings.TrimPrefix(r.URL.Path, "/proxy/")
		host, path, _ := strings.Cut(rest, "/")
		p, ok := ai.ByHost(host)
		if !ok {
			http.Error(w, "host not allowed", http.StatusForbidden)
			return
		}
		cfg.mu.Lock()
		key := cfg.Keys[p.ID]
		cfg.mu.Unlock()
		if key == "" {
			writeJSONError(w, http.StatusUnauthorized, "Chưa lưu khoá "+p.ID+" trên máy này. Mở Cài đặt, dán khoá.")
			return
		}
		target := p.Origin() + "/" + path
		if r.URL.RawQuery != "" {
			target += "?" + r.URL.RawQuery
		}
		// Read the whole body so the upstream call carries Content-Length (some APIs reject chunked uploads).
		body, err := io.ReadAll(io.LimitReader(r.Body, 40<<20))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		req, err := http.NewRequestWithContext(r.Context(), r.Method, target, bytes.NewReader(body))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		for _, h := range []string{"Content-Type", "anthropic-version", "anthropic-beta", "X-Title"} {
			if v := r.Header.Get(h); v != "" {
				req.Header.Set(h, v)
			}
		}
		p.SetKey(req.Header, key)
		res, err := proxyClient.Do(req)
		if err != nil {
			if r.Context().Err() != nil {
				return // the page cancelled (Đọc lại / timeout)
			}
			writeJSONError(w, http.StatusBadGateway, "Không gọi được "+host+": "+err.Error())
			return
		}
		defer res.Body.Close()
		w.Header().Set("Content-Type", res.Header.Get("Content-Type"))
		w.WriteHeader(res.StatusCode)
		_, _ = io.Copy(w, res.Body)
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Host != addr {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		files.ServeHTTP(w, r)
	})
	return mux
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"message": msg}})
}

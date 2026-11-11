// Package ai holds the provider table shared by the local proxy and the batch reader.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

// Provider describes how to reach one AI vendor and where its key goes.
type Provider struct {
	ID     string
	Host   string
	Base   string // path prefix of the API on Host
	header string // header that carries the key
	bearer bool
}

var Providers = []Provider{
	{ID: "gemini", Host: "generativelanguage.googleapis.com", Base: "/v1beta", header: "x-goog-api-key"},
	{ID: "claude", Host: "api.anthropic.com", Base: "/v1", header: "x-api-key"},
	{ID: "openai", Host: "api.openai.com", Base: "/v1", header: "Authorization", bearer: true},
	{ID: "deepseek", Host: "api.deepseek.com", Base: "", header: "Authorization", bearer: true},
	{ID: "openrouter", Host: "openrouter.ai", Base: "/api/v1", header: "Authorization", bearer: true},
}

// ByHost returns the provider for an API host (proxy allowlist).
func ByHost(host string) (Provider, bool) {
	for _, p := range Providers {
		if p.Host == host {
			return p, true
		}
	}
	return Provider{}, false
}

// ByID returns the provider with this id.
func ByID(id string) (Provider, bool) {
	for _, p := range Providers {
		if p.ID == id {
			return p, true
		}
	}
	return Provider{}, false
}

// keyHeaders lists every header any provider reads a key from; the proxy strips them all from browser requests.
var keyHeaders = []string{"x-goog-api-key", "x-api-key", "Authorization"}

// SetKey removes any key the caller sent and adds this provider's key.
func (p Provider) SetKey(h http.Header, key string) {
	for _, k := range keyHeaders {
		h.Del(k)
	}
	if p.bearer {
		h.Set(p.header, "Bearer "+key)
	} else {
		h.Set(p.header, key)
	}
}

// Origin is scheme://host for real calls; HDQR_UPSTREAM (tests only) points every provider at a mock server.
func (p Provider) Origin() string {
	if u := os.Getenv("HDQR_UPSTREAM"); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "https://" + p.Host
}

// Fields is what the AI reads from one invoice.
type Fields struct {
	Bank    string `json:"bank"`
	Account string `json:"account"`
	Holder  string `json:"holder"`
	Amount  string `json:"amount"`
	SoHD    string `json:"so_hd"`
	NCC     string `json:"ncc"`
	MST     string `json:"mst"`
	Ngay    string `json:"ngay"`
}

// Input is one invoice file, already shrunk for upload.
type Input struct {
	Mime string
	Data []byte
	Name string
}

// HTTPError carries the provider status so callers can decide to retry.
type HTTPError struct {
	Status int
	Msg    string
}

func (e *HTTPError) Error() string { return fmt.Sprintf("HTTP %d: %s", e.Status, e.Msg) }

// Retryable reports overload / rate-limit / timeout errors worth one more try.
func Retryable(err error) bool {
	var he *HTTPError
	if errors.As(err, &he) {
		switch he.Status {
		case 408, 429, 500, 502, 503, 504, 529:
			return true
		}
		return false
	}
	return errors.Is(err, context.DeadlineExceeded)
}

var client = &http.Client{}

func post(ctx context.Context, p Provider, key, path string, body any, out any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", p.Origin()+p.Base+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if p.ID == "claude" {
		req.Header.Set("anthropic-version", "2026-10-21")
	}
	p.SetKey(req.Header, key)
	res, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 10<<20))
	if res.StatusCode >= 300 {
		var e struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(raw, &e)
		msg := e.Error.Message
		if msg == "" {
			msg = strings.TrimSpace(string(raw))
		}
		return &HTTPError{Status: res.StatusCode, Msg: msg}
	}
	return json.Unmarshal(raw, out)
}

var fieldNames = []string{"bank", "account", "holder", "amount", "so_hd", "ncc", "mst", "ngay"}

func schema(upper bool) map[string]any {
	typ := func(s string) string {
		if upper {
			return strings.ToUpper(s)
		}
		return s
	}
	props := map[string]any{}
	for _, f := range fieldNames {
		props[f] = map[string]any{"type": typ("string")}
	}
	m := map[string]any{"type": typ("object"), "properties": props, "required": fieldNames}
	if !upper {
		m["additionalProperties"] = false
	}
	return m
}

var reGeminiThinks = regexp.MustCompile(`^gemini-([3-9]|\d\d)`)

// Read sends one invoice to the provider and returns the raw JSON text it answered.
func Read(ctx context.Context, p Provider, key, model string, in Input, prompt string) (string, error) {
	data := encode(in.Data)
	switch p.ID {
	case "gemini":
		gen := map[string]any{"temperature": 0, "responseMimeType": "application/json", "responseSchema": schema(true)}
		if reGeminiThinks.MatchString(model) {
			gen["thinkingConfig"] = map[string]any{"thinkingLevel": "low"}
		}
		body := map[string]any{
			"contents":         []any{map[string]any{"role": "user", "parts": []any{map[string]any{"inline_data": map[string]any{"mime_type": in.Mime, "data": data}}, map[string]any{"text": prompt}}}},
			"generationConfig": gen,
		}
		var out struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						Text    string `json:"text"`
						Thought bool   `json:"thought"`
					} `json:"parts"`
				} `json:"content"`
			} `json:"candidates"`
		}
		err := post(ctx, p, key, "/models/"+model+":generateContent", body, &out)
		var he *HTTPError
		if err != nil && errors.As(err, &he) && he.Status == 400 && strings.Contains(strings.ToLower(he.Msg), "thinking") {
			delete(gen, "thinkingConfig")
			err = post(ctx, p, key, "/models/"+model+":generateContent", body, &out)
		}
		if err != nil {
			return "", err
		}
		var sb strings.Builder
		if len(out.Candidates) > 0 {
			for _, pt := range out.Candidates[0].Content.Parts {
				if !pt.Thought {
					sb.WriteString(pt.Text)
				}
			}
		}
		return sb.String(), nil
	case "claude":
		block := map[string]any{"type": "image", "source": map[string]any{"type": "base64", "media_type": in.Mime, "data": data}}
		if in.Mime == "application/pdf" {
			block["type"] = "document"
		}
		body := map[string]any{"model": model, "max_tokens": 2000, "messages": []any{map[string]any{"role": "user", "content": []any{block, map[string]any{"type": "text", "text": prompt}}}}}
		var out struct {
			StopReason string `json:"stop_reason"`
			Content    []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		}
		if err := post(ctx, p, key, "/messages", body, &out); err != nil {
			return "", err
		}
		if out.StopReason == "refusal" {
			return "", errors.New("Claude từ chối đọc file này")
		}
		var sb strings.Builder
		for _, c := range out.Content {
			if c.Type == "text" {
				sb.WriteString(c.Text)
			}
		}
		return sb.String(), nil
	default: // OpenAI-compatible
		var part map[string]any
		url := "data:" + in.Mime + ";base64," + data
		if in.Mime == "application/pdf" {
			if p.ID == "deepseek" {
				return "", errors.New("DeepSeek không nhận PDF ở chế độ hàng loạt: chụp ảnh hoá đơn, hoặc dùng giao diện")
			}
			name := in.Name
			if name == "" {
				name = "hoa-don.pdf"
			}
			part = map[string]any{"type": "file", "file": map[string]any{"filename": name, "file_data": url}}
		} else {
			part = map[string]any{"type": "image_url", "image_url": map[string]any{"url": url}}
		}
		body := map[string]any{
			"model":           model,
			"messages":        []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "text", "text": prompt}, part}}},
			"response_format": map[string]any{"type": "json_object"},
		}
		var out struct {
			Choices []struct {
				Message struct {
					Content json.RawMessage `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}
		if err := post(ctx, p, key, "/chat/completions", body, &out); err != nil {
			return "", err
		}
		if len(out.Choices) == 0 {
			return "", nil
		}
		var s string
		if json.Unmarshal(out.Choices[0].Message.Content, &s) == nil {
			return s, nil
		}
		var parts []struct {
			Text string `json:"text"`
		}
		_ = json.Unmarshal(out.Choices[0].Message.Content, &parts)
		var sb strings.Builder
		for _, x := range parts {
			sb.WriteString(x.Text)
		}
		return sb.String(), nil
	}
}

var reJSON = regexp.MustCompile(`(?s)\{.*\}`)

// ParseFields accepts plain JSON, fenced JSON, or JSON inside prose.
func ParseFields(text string) (Fields, error) {
	var f Fields
	t := strings.TrimSpace(text)
	if json.Unmarshal([]byte(t), &f) == nil {
		return f, nil
	}
	if m := reJSON.FindString(t); m != "" && json.Unmarshal([]byte(m), &f) == nil {
		return f, nil
	}
	return f, errors.New("AI trả lời không đúng dạng JSON")
}

// ReadWithRetry: per-call timeout, one retry after 2 s when the provider is busy or slow.
func ReadWithRetry(ctx context.Context, p Provider, key, model string, in Input, prompt string, perCall time.Duration) (Fields, error) {
	var last error
	for try := 0; try < 2; try++ {
		if try > 0 {
			select {
			case <-ctx.Done():
				return Fields{}, ctx.Err()
			case <-time.After(2 * time.Second):
			}
		}
		c, cancel := context.WithTimeout(ctx, perCall)
		text, err := Read(c, p, key, model, in, prompt)
		cancel()
		if err == nil {
			return ParseFields(text)
		}
		last = err
		if !Retryable(err) {
			break
		}
	}
	if errors.Is(last, context.DeadlineExceeded) {
		return Fields{}, fmt.Errorf("AI không trả lời sau %d giây", int(perCall.Seconds()))
	}
	return Fields{}, last
}

package main

import (
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/makiuchi-d/gozxing"
	gzqr "github.com/makiuchi-d/gozxing/qrcode"

	hoadonqr "github.com/kinsamson0101/hoa-don-qr"
	"github.com/kinsamson0101/hoa-don-qr/internal/ai"
)

func TestBanksAndFindBank(t *testing.T) {
	banks, err := hoadonqr.Banks()
	if err != nil || len(banks) < 50 {
		t.Fatalf("Banks() = %d, %v", len(banks), err)
	}
	for in, bin := range map[string]string{"Vietcombank": "970436", "VCB": "970436", "Ngân hàng TMCP Quân đội (MB)": "970422", "970415": "970415"} {
		b := findBank(banks, in)
		if b == nil || b.Bin != bin {
			t.Errorf("findBank(%q) = %+v, want %s", in, b, bin)
		}
	}
}

func TestFillNote(t *testing.T) {
	got := fillNote("TT HD {so_hd} {ncc} {ngay}", ai.Fields{SoHD: "0001234", NCC: "Điện lực", Ngay: "5/11/2026"})
	if got != "TT HD 0001234 Dien luc 051126" {
		t.Errorf("fillNote = %q", got)
	}
}

func TestShrinkBigPhoto(t *testing.T) {
	dir := t.TempDir()
	img := image.NewRGBA(image.Rect(0, 0, 4000, 3000))
	for y := 0; y < 3000; y++ {
		for x := 0; x < 4000; x++ {
			v := uint8(200 + (x*7+y*13)%40)
			img.Set(x, y, color.RGBA{v, v - 5, v - 15, 255})
		}
	}
	p := filepath.Join(dir, "photo.jpg")
	f, _ := os.Create(p)
	_ = jpeg.Encode(f, img, &jpeg.Options{Quality: 95})
	f.Close()
	st, _ := os.Stat(p)
	in, err := shrink(p)
	if err != nil {
		t.Fatal(err)
	}
	cfg, _, err := image.DecodeConfig(strings.NewReader(string(in.Data)))
	if err != nil || max(cfg.Width, cfg.Height) != maxSide || len(in.Data) >= int(st.Size()) {
		t.Fatalf("shrink: %dx%d, %d bytes from %d, err %v", cfg.Width, cfg.Height, len(in.Data), st.Size(), err)
	}
	t.Logf("photo 4000x3000: %d -> %d bytes", st.Size(), len(in.Data))
}

// Mock Gemini: the proxy must add the saved key, and the batch must turn the answer into a decodable QR.
func mockGemini(t *testing.T, calls *int32) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(calls, 1)
		if r.Header.Get("x-goog-api-key") != "AIzaSAVED" {
			w.WriteHeader(401)
			_, _ = io.WriteString(w, `{"error":{"message":"bad key"}}`)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/models") {
			_, _ = io.WriteString(w, `{"models":[{"name":"models/gemini-9-flash","supportedGenerationMethods":["generateContent"]}]}`)
			return
		}
		if r.ContentLength <= 0 {
			t.Errorf("POST without Content-Length (chunked): %d", r.ContentLength)
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		gc := body["generationConfig"].(map[string]any)
		if gc["thinkingConfig"] == nil {
			t.Errorf("no thinkingConfig sent for gemini-9-flash")
		}
		ans, _ := json.Marshal(map[string]string{"bank": "Vietcombank", "account": "0011004455667", "holder": "CONG TY ABC", "amount": "1.250.000", "so_hd": "0001234", "ncc": "ABC", "mst": "0101", "ngay": "10/11/2026"})
		_ = json.NewEncoder(w).Encode(map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"parts": []any{map[string]any{"text": string(ans)}}}}}})
	}))
}

func TestProxyAddsKeyAndBlocksOtherSites(t *testing.T) {
	var calls int32
	up := mockGemini(t, &calls)
	defer up.Close()
	t.Setenv("HDQR_UPSTREAM", up.URL)
	cfgPath := filepath.Join(t.TempDir(), "config.json")
	cfg := &Config{Keys: map[string]string{"gemini": "AIzaSAVED"}, Models: map[string]string{}}
	srv := httptest.NewServer(nil)
	addr := strings.TrimPrefix(srv.URL, "http://")
	srv.Config.Handler = newServer(cfg, cfgPath, addr)
	defer srv.Close()

	req, _ := http.NewRequest("GET", srv.URL+"/proxy/generativelanguage.googleapis.com/v1beta/models?pageSize=1000", nil)
	req.Header.Set("x-goog-api-key", "local")
	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("proxy same-origin: %v %v", res.StatusCode, err)
	}
	req, _ = http.NewRequest("POST", srv.URL+"/proxy/generativelanguage.googleapis.com/v1beta/models/gemini-9-flash:generateContent",
		io.NopCloser(strings.NewReader(`{"generationConfig":{"thinkingConfig":{"thinkingLevel":"low"}}}`)))
	req.ContentLength = -1 // browsers' fetch bodies reach the proxy without a known length in the worst case
	req.Header.Set("Content-Type", "application/json")
	res, err = http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != 200 {
		t.Fatalf("proxy POST: %v %v", res.StatusCode, err)
	}
	req, _ = http.NewRequest("GET", srv.URL+"/proxy/generativelanguage.googleapis.com/v1beta/models", nil)
	req.Header.Set("Origin", "https://evil.example")
	res, _ = http.DefaultClient.Do(req)
	if res.StatusCode != 403 {
		t.Errorf("cross-site proxy call: %d, want 403", res.StatusCode)
	}
	req, _ = http.NewRequest("GET", srv.URL+"/proxy/evil.example/x", nil)
	res, _ = http.DefaultClient.Do(req)
	if res.StatusCode != 403 {
		t.Errorf("non-allow-listed host: %d, want 403", res.StatusCode)
	}
	res, _ = http.Get(srv.URL + "/local.js")
	b, _ := io.ReadAll(res.Body)
	if !strings.Contains(string(b), `"gemini":true`) || strings.Contains(string(b), "AIzaSAVED") {
		t.Errorf("local.js = %s", b)
	}
	res, _ = http.Get(srv.URL + "/")
	b, _ = io.ReadAll(res.Body)
	if res.StatusCode != 200 || !strings.Contains(string(b), "local.js") {
		t.Errorf("index: %d", res.StatusCode)
	}
	// settings save the key to the file, never back to the page
	req, _ = http.NewRequest("POST", srv.URL+"/api/settings", strings.NewReader(`{"provider":"claude","key":"sk-ant-x","model":"claude-haiku-5-5"}`))
	req.Header.Set("Content-Type", "application/json")
	res, _ = http.DefaultClient.Do(req)
	saved, _ := os.ReadFile(cfgPath)
	if res.StatusCode != 204 || !strings.Contains(string(saved), "sk-ant-x") {
		t.Errorf("settings: %d %s", res.StatusCode, saved)
	}
}

func TestBatchWritesDecodableQR(t *testing.T) {
	var calls int32
	up := mockGemini(t, &calls)
	defer up.Close()
	t.Setenv("HDQR_UPSTREAM", up.URL)
	dir := t.TempDir()
	pngBytes, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
	_ = os.WriteFile(filepath.Join(dir, "hd1.png"), pngBytes, 0o644)
	_ = os.WriteFile(filepath.Join(dir, "hd2.png"), pngBytes, 0o644) // same invoice number: must not overwrite
	cfg := &Config{Keys: map[string]string{"gemini": "AIzaSAVED"}, Models: map[string]string{"gemini": "gemini-9-flash"}, Provider: "gemini"}
	if err := runBatch(cfg, dir, "", "", "", io.Discard); err != nil {
		t.Fatal(err)
	}
	f, err := os.Open(filepath.Join(dir, "qr", "QR-hd1.png"))
	if err != nil {
		t.Fatal(err)
	}
	img, err := png.Decode(f)
	f.Close()
	if err != nil {
		t.Fatal(err)
	}
	bmp, _ := gozxing.NewBinaryBitmapFromImage(img)
	res, err := gzqr.NewQRCodeReader().Decode(bmp, nil)
	if err != nil {
		t.Fatal("QR does not decode:", err)
	}
	txt := res.GetText()
	for _, want := range []string{"970436", "0011004455667", "54071250000", "TT HD 0001234 ABC"} {
		if !strings.Contains(txt, want) {
			t.Errorf("QR text %q lacks %q", txt, want)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "qr", "QR-hd2.png")); err != nil {
		t.Error("second invoice QR missing:", err)
	}
	cf, _ := os.Open(filepath.Join(dir, "qr", "ket-qua.csv"))
	recs, err := csv.NewReader(cf).ReadAll()
	cf.Close()
	if err != nil || len(recs) != 3 || recs[1][11] != txt || recs[0][0] != string([]byte{0xEF, 0xBB, 0xBF})+"file" {
		t.Errorf("csv: %v %v", recs, err)
	}
}

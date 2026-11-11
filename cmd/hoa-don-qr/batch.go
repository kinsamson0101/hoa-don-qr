package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/skip2/go-qrcode"
	"golang.org/x/image/draw"

	hoadonqr "github.com/kinsamson0101/hoa-don-qr"
	"github.com/kinsamson0101/hoa-don-qr/internal/ai"
	"github.com/kinsamson0101/hoa-don-qr/internal/vietqr"
)

const maxSide = 1600

// prompt mirrors PROMPT in app.js; keep the two in step.
func prompt(banks []hoadonqr.Bank) string {
	names := make([]string, len(banks))
	for i, b := range banks {
		names[i] = b.Short
	}
	return strings.Join([]string{
		"Bạn đọc hoá đơn / phiếu yêu cầu thanh toán của Việt Nam. Chỉ trả về 1 object JSON, không giải thích.",
		"Các khoá: bank, account, holder, amount, so_hd, ncc, mst, ngay (đều là chuỗi).",
		"Lấy thông tin TÀI KHOẢN NHẬN TIỀN của BÊN BÁN (người bán, nhà cung cấp), không phải bên mua.",
		"bank: tên ngắn ngân hàng nhận, chọn đúng 1 tên trong danh sách: " + strings.Join(names, ", ") + ".",
		"account: chỉ chữ số của số tài khoản. holder: tên chủ tài khoản. amount: tổng tiền phải thanh toán (đã gồm thuế), chỉ chữ số, đơn vị đồng.",
		"so_hd: số hoá đơn. ncc: tên ngắn bên bán, tối đa 3 từ, bỏ \"Công ty TNHH/Cổ phần\". mst: mã số thuế bên bán. ngay: ngày hoá đơn dd/mm/yyyy.",
		"Không thấy trường nào thì để chuỗi rỗng. Không đoán số tài khoản: mã khách hàng, số điện thoại, mã số thuế không phải số tài khoản.",
	}, "\n")
}

var (
	reFoldDrop = regexp.MustCompile(`ngan hang|thuong mai|co phan|tmcp|tnhh mtv|bank|chi nhanh.*$`)
	reNonAlnum = regexp.MustCompile(`[^a-z0-9]`)
	reBin6     = regexp.MustCompile(`\b(\d{6})\b`)
	reDate     = regexp.MustCompile(`(\d{1,2})\D(\d{1,2})\D(\d{2,4})`)
	reTplField = regexp.MustCompile(`\{(so_hd|ncc|mst|ngay)\}`)
)

func fold(s string) string {
	s = strings.ToLower(vietqr.Fold(s))
	return reNonAlnum.ReplaceAllString(reFoldDrop.ReplaceAllString(s, " "), "")
}

// findBank mirrors findBank in app.js: BIN, then exact short name / code, then partial name.
func findBank(banks []hoadonqr.Bank, text string) *hoadonqr.Bank {
	if text == "" {
		return nil
	}
	if m := reBin6.FindStringSubmatch(text); m != nil {
		for i := range banks {
			if banks[i].Bin == m[1] {
				return &banks[i]
			}
		}
	}
	f := fold(text)
	if f == "" {
		return nil
	}
	for i := range banks {
		if fold(banks[i].Short) == f || fold(banks[i].Code) == f {
			return &banks[i]
		}
	}
	for i := range banks {
		s := fold(banks[i].Short)
		if len(s) >= 3 && strings.Contains(f, s) {
			return &banks[i]
		}
	}
	for i := range banks {
		n := fold(banks[i].Name)
		if n != "" && (strings.Contains(n, f) || strings.Contains(f, n)) {
			return &banks[i]
		}
	}
	return nil
}

func ddmmyy(s string) string {
	m := reDate.FindStringSubmatch(s)
	if m == nil {
		return ""
	}
	pad := func(x string) string { return ("0" + x)[len(x)-1:] }
	return pad(m[1]) + pad(m[2]) + m[3][len(m[3])-2:]
}

func fillNote(tpl string, f ai.Fields) string {
	return vietqr.CleanNote(reTplField.ReplaceAllStringFunc(tpl, func(k string) string {
		switch k {
		case "{so_hd}":
			return f.SoHD
		case "{ncc}":
			return f.NCC
		case "{mst}":
			return f.MST
		}
		return ddmmyy(f.Ngay)
	}))
}

// shrink re-encodes large photos to <=1600 px JPEG; PDFs and small images pass through.
func shrink(path string) (ai.Input, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return ai.Input{}, err
	}
	ext := strings.ToLower(filepath.Ext(path))
	if ext == ".pdf" {
		return ai.Input{Mime: "application/pdf", Data: b, Name: filepath.Base(path)}, nil
	}
	mime := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}[ext]
	img, _, err := image.Decode(bytes.NewReader(b))
	if err != nil {
		return ai.Input{Mime: mime, Data: b, Name: filepath.Base(path)}, nil // let the AI try the original
	}
	w, h := img.Bounds().Dx(), img.Bounds().Dy()
	k := float64(maxSide) / float64(max(w, h))
	if k >= 1 && len(b) <= 1<<20 {
		return ai.Input{Mime: mime, Data: b, Name: filepath.Base(path)}, nil
	}
	if k > 1 {
		k = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, int(float64(w)*k), int(float64(h)*k)))
	draw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Over, nil)
	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: 85}); err != nil {
		return ai.Input{}, err
	}
	if out.Len() >= len(b) {
		return ai.Input{Mime: mime, Data: b, Name: filepath.Base(path)}, nil
	}
	return ai.Input{Mime: "image/jpeg", Data: out.Bytes(), Name: filepath.Base(path)}, nil
}

type row struct {
	file    string
	f       ai.Fields
	bank    *hoadonqr.Bank
	note    string
	payload string
	status  string
	secs    float64
}

func runBatch(cfg *Config, dir, provID, model, noteTpl string, log io.Writer) error {
	if provID == "" {
		provID = cfg.Provider
	}
	if provID == "" {
		provID = "gemini"
	}
	p, ok := ai.ByID(provID)
	if !ok {
		return fmt.Errorf("không biết hãng %q", provID)
	}
	key := cfg.Keys[p.ID]
	if key == "" {
		return fmt.Errorf("chưa có khoá %s: chạy hoa-don-qr (không có --dir), mở Cài đặt và dán khoá trước", p.ID)
	}
	if model == "" {
		model = cfg.Models[p.ID]
	}
	if model == "" {
		return fmt.Errorf("chưa chọn model %s: chọn trên giao diện một lần, hoặc thêm --model", p.ID)
	}
	if noteTpl == "" {
		noteTpl = cfg.Note
	}
	if noteTpl == "" {
		noteTpl = "TT HD {so_hd} {ncc}"
	}
	banks, err := hoadonqr.Banks()
	if err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var files []string
	for _, e := range entries {
		switch strings.ToLower(filepath.Ext(e.Name())) {
		case ".png", ".jpg", ".jpeg", ".webp", ".pdf":
			if !e.IsDir() {
				files = append(files, filepath.Join(dir, e.Name()))
			}
		}
	}
	if len(files) == 0 {
		return fmt.Errorf("không có ảnh hay PDF nào trong %s", dir)
	}
	outDir := filepath.Join(dir, "qr")
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}
	fmt.Fprintf(log, "Đọc %d hoá đơn bằng %s · %s (2 file cùng lúc)\n", len(files), p.ID, model)

	pr := prompt(banks)
	rows := make([]row, len(files))
	sem := make(chan struct{}, 2)
	var wg sync.WaitGroup
	var mu sync.Mutex
	for i, path := range files {
		wg.Add(1)
		go func(i int, path string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			t0 := time.Now()
			r := row{file: filepath.Base(path)}
			in, err := shrink(path)
			if err == nil {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
				r.f, err = ai.ReadWithRetry(ctx, p, key, model, in, pr, 45*time.Second)
				cancel()
			}
			r.secs = time.Since(t0).Seconds()
			if err != nil {
				r.status = "Lỗi: " + err.Error()
			} else {
				r.bank = findBank(banks, r.f.Bank)
				r.note = fillNote(noteTpl, r.f)
				switch {
				case r.bank == nil:
					r.status = "Thiếu ngân hàng, gõ tay trên giao diện"
				case strings.TrimSpace(r.f.Account) == "":
					r.status = "Hoá đơn không ghi số tài khoản bên bán"
				default:
					r.payload, err = vietqr.Build(r.bank.Bin, regexp.MustCompile(`\D`).ReplaceAllString(r.f.Account, ""), r.f.Amount, r.note)
					if err != nil {
						r.status = "Lỗi: " + err.Error()
					} else if err := qrcode.WriteFile(r.payload, qrcode.Medium, 512, filepath.Join(outDir, qrName(r))); err != nil {
						r.status = "Lỗi ghi ảnh: " + err.Error()
					} else {
						r.status = "OK · kiểm lại số TK và số tiền"
					}
				}
			}
			rows[i] = r
			mu.Lock()
			fmt.Fprintf(log, "  %-40s %5.1fs  %s\n", r.file, r.secs, r.status)
			mu.Unlock()
		}(i, path)
	}
	wg.Wait()
	sort.SliceStable(rows, func(a, b int) bool { return rows[a].file < rows[b].file })
	csvPath := filepath.Join(outDir, "ket-qua.csv")
	if err := writeCSV(csvPath, rows); err != nil {
		return err
	}
	fmt.Fprintf(log, "Xong. Ảnh QR và bảng kết quả: %s\n", outDir)
	return nil
}

var reUnsafe = regexp.MustCompile(`[^\w-]+`)

// qrName follows the source file name: unique in the folder, and easy to match back to the invoice.
func qrName(r row) string {
	return "QR-" + reUnsafe.ReplaceAllString(strings.TrimSuffix(r.file, filepath.Ext(r.file)), "_") + ".png"
}

func writeCSV(path string, rows []row) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, _ = f.Write([]byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM: Excel shows Vietnamese marks correctly only with it
	w := csv.NewWriter(f)
	_ = w.Write([]string{"file", "ngan_hang", "bin", "so_tk", "chu_tk", "so_tien", "so_hd", "ben_ban", "mst", "ngay", "noi_dung_ck", "ma_qr", "anh_qr", "trang_thai", "giay"})
	for _, r := range rows {
		bank, bin, img := r.f.Bank, "", ""
		if r.bank != nil {
			bank, bin = r.bank.Short, r.bank.Bin
		}
		if r.payload != "" {
			img = qrName(r)
		}
		_ = w.Write([]string{r.file, bank, bin, r.f.Account, r.f.Holder, vietqr.CleanAmount(r.f.Amount), r.f.SoHD, r.f.NCC, r.f.MST, r.f.Ngay, r.note, r.payload, img, r.status, fmt.Sprintf("%.1f", r.secs)})
	}
	w.Flush()
	return w.Error()
}

// hoa-don-qr: desktop build. Serves the same page as the website on 127.0.0.1 and keeps AI keys in a file on
// this machine; the page calls the AI through this program, which adds the key. With --dir it reads a whole
// folder of invoices without a browser and writes QR images plus a CSV.
package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"time"
)

var version = "dev"

func main() {
	dir := flag.String("dir", "", "đọc mọi hoá đơn (ảnh, PDF) trong thư mục này, ghi mã QR và file CSV vào <dir>\\qr")
	prov := flag.String("provider", "", "hãng AI cho --dir (gemini, claude, openai, deepseek, openrouter); mặc định: hãng chọn lần cuối trên giao diện")
	model := flag.String("model", "", "model cho --dir; mặc định: model chọn lần cuối trên giao diện")
	note := flag.String("note", "", "mẫu nội dung chuyển khoản cho --dir, ví dụ \"TT HD {so_hd} {ncc}\"")
	port := flag.Int("port", 0, "cổng trên 127.0.0.1 (0 = tự chọn)")
	noBrowser := flag.Bool("no-browser", false, "không tự mở trình duyệt")
	showVersion := flag.Bool("version", false, "in phiên bản")
	flag.Parse()

	if *showVersion {
		fmt.Println("hoa-don-qr", version)
		return
	}
	cfgPath, err := configPath()
	if err != nil {
		fail(err)
	}
	cfg, err := loadConfig(cfgPath)
	if err != nil {
		fail(err)
	}
	if *dir != "" {
		if err := runBatch(cfg, *dir, *prov, *model, *note, os.Stdout); err != nil {
			fail(err)
		}
		return
	}

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		fail(err)
	}
	addr := ln.Addr().String()
	url := "http://" + addr + "/"
	srv := &http.Server{Handler: newServer(cfg, cfgPath, addr), ReadHeaderTimeout: 10 * time.Second}
	fmt.Printf("Hoá đơn ra QR đang chạy tại %s\nKhoá AI lưu ở %s (chỉ trên máy này)\nĐóng cửa sổ này để tắt.\n", url, cfgPath)
	if !*noBrowser {
		openBrowser(url)
	}
	go func() {
		c := make(chan os.Signal, 1)
		signal.Notify(c, os.Interrupt)
		<-c
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()
	if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
		fail(err)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "Lỗi:", err)
	os.Exit(1)
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		fmt.Println("Mở trình duyệt và vào", url)
	}
}

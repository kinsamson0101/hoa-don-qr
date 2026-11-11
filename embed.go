// Package hoadonqr embeds the web page so the desktop build serves the exact same UI as the website.
package hoadonqr

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed index.html style.css app.js providers.js vietqr.js banks.js local.js vendor/qrcode.js
var Web embed.FS

// Bank is one entry of banks.js (NAPAS BIN list).
type Bank struct {
	Bin   string `json:"bin"`
	Short string `json:"short"`
	Code  string `json:"code"`
	Name  string `json:"name"`
}

// Banks parses the JSON array inside banks.js, so the web page and the desktop build share one list.
func Banks() ([]Bank, error) {
	b, err := Web.ReadFile("banks.js")
	if err != nil {
		return nil, err
	}
	s := string(b)
	i := strings.Index(s, "var BANKS = ")
	j := strings.Index(s, "];")
	if i < 0 || j < i {
		return nil, fmt.Errorf("banks.js: BANKS array not found")
	}
	var out []Bank
	if err := json.Unmarshal([]byte(s[i+len("var BANKS = "):j+1]), &out); err != nil {
		return nil, fmt.Errorf("banks.js: %w", err)
	}
	return out, nil
}

// Package vietqr builds VietQR (NAPAS 247) transfer payloads. Port of vietqr.js; both are tested against the
// same published vectors.
package vietqr

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

const (
	napasGUID      = "A000000727"
	serviceAccount = "QRIBFTTA"
)

func tlv(id, v string) string {
	if len(v) > 99 {
		panic("field " + id + " longer than 99")
	}
	return fmt.Sprintf("%s%02d%s", id, len(v), v)
}

// CRC16 is CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), upper-case hex.
func CRC16(s string) string {
	crc := uint16(0xffff)
	for i := 0; i < len(s); i++ {
		crc ^= uint16(s[i]) << 8
		for b := 0; b < 8; b++ {
			if crc&0x8000 != 0 {
				crc = crc<<1 ^ 0x1021
			} else {
				crc <<= 1
			}
		}
	}
	return fmt.Sprintf("%04X", crc)
}

var (
	reNoteBad = regexp.MustCompile(`[^A-Za-z0-9 .,\-_/]`)
	reSpaces  = regexp.MustCompile(`\s+`)
	reNonDig  = regexp.MustCompile(`\D`)
	reBin     = regexp.MustCompile(`^\d{6}$`)
	reAccount = regexp.MustCompile(`^[A-Za-z0-9]{1,19}$`)
)

// Fold removes Vietnamese marks: "Đơn giá" -> "Don gia".
func Fold(s string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(s) {
		switch {
		case unicode.Is(unicode.Mn, r):
		case r == 'đ':
			b.WriteRune('d')
		case r == 'Đ':
			b.WriteRune('D')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// CleanNote keeps what bank apps accept in a transfer note: plain ASCII letters, digits, space . , - _ /
func CleanNote(s string) string {
	s = strings.NewReplacer("–", "-", "—", "-").Replace(Fold(s))
	s = reNoteBad.ReplaceAllString(s, " ")
	return strings.TrimSpace(reSpaces.ReplaceAllString(s, " "))
}

// CleanAmount keeps digits and drops leading zeros.
func CleanAmount(s string) string { return strings.TrimLeft(reNonDig.ReplaceAllString(s, ""), "0") }

// Build returns the VietQR string. Static ("11") without amount, dynamic ("12") with amount.
func Build(bin, account, amount, note string) (string, error) {
	account = strings.NewReplacer(" ", "", ".", "", "-", "").Replace(account)
	if !reBin.MatchString(bin) {
		return "", fmt.Errorf("bank BIN must be 6 digits")
	}
	if !reAccount.MatchString(account) {
		return "", fmt.Errorf("account number must be 1-19 letters or digits")
	}
	amount = CleanAmount(amount)
	if len(amount) > 13 {
		return "", fmt.Errorf("amount is too large")
	}
	note = CleanNote(note)
	if len(note) > 50 {
		note = strings.TrimSpace(note[:50])
	}
	merchant := tlv("00", napasGUID) + tlv("01", tlv("00", bin)+tlv("01", account)) + tlv("02", serviceAccount)
	init := "11"
	if amount != "" {
		init = "12"
	}
	out := tlv("00", "01") + tlv("01", init) + tlv("38", merchant) + tlv("53", "704")
	if amount != "" {
		out += tlv("54", amount)
	}
	out += tlv("58", "VN")
	if note != "" {
		out += tlv("62", tlv("08", note))
	}
	out += "6304"
	return out + CRC16(out), nil
}

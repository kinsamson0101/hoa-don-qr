package vietqr

import "testing"

// Same known-good strings as test/vietqr.test.js (published in the vietnam-qr-pay README).
var known = []struct{ bin, account, amount, note, want string }{
	{"970416", "257678859", "", "", "00020101021138530010A0000007270123000697041601092576788590208QRIBFTTA53037045802VN6304AE9F"},
	{"970416", "257678859", "10000", "Chuyen tien", "00020101021238530010A0000007270123000697041601092576788590208QRIBFTTA53037045405100005802VN62150811Chuyen tien630453E6"},
	{"970416", "257678859", "999999", "Cam on nhe", "00020101021238530010A0000007270123000697041601092576788590208QRIBFTTA530370454069999995802VN62140810Cam on nhe6304E786"},
}

func TestKnownVectors(t *testing.T) {
	for _, k := range known {
		got, err := Build(k.bin, k.account, k.amount, k.note)
		if err != nil || got != k.want {
			t.Errorf("Build(%v) = %q, %v; want %q", k, got, err, k.want)
		}
	}
}

func TestCleanNote(t *testing.T) {
	cases := map[string]string{
		"Thanh toán hoá đơn số 12 — Đà Nẵng": "Thanh toan hoa don so 12 - Da Nang",
		"TT  HD #0001234 (ABC)":              "TT HD 0001234 ABC",
	}
	for in, want := range cases {
		if got := CleanNote(in); got != want {
			t.Errorf("CleanNote(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRejectsBadInput(t *testing.T) {
	if _, err := Build("97041", "1", "", ""); err == nil {
		t.Error("5-digit BIN accepted")
	}
	if _, err := Build("970416", "", "", ""); err == nil {
		t.Error("empty account accepted")
	}
}

"""Draw a fake Vietnamese invoice for demos and tests. All names and numbers are made up."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

F = "C:/Windows/Fonts/"
def font(name, size):
    return ImageFont.truetype(F + name, size)

W, H = 1240, 1500
im = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(im)
reg, bold = "segoeui.ttf", "segoeuib.ttf"
d.text((W // 2, 70), "HOÁ ĐƠN GIÁ TRỊ GIA TĂNG", font=font(bold, 46), fill="#b3261e", anchor="mm")
d.text((W // 2, 120), "Ký hiệu: 1C26TMA    Số: 0001234    Ngày 05 tháng 11 năm 2026", font=font(reg, 26), fill="black", anchor="mm")
y = 180
seller = [
    ("Đơn vị bán hàng:", "CÔNG TY TNHH VĂN PHÒNG PHẨM MINH AN"),
    ("Mã số thuế:", "0312345678"),
    ("Địa chỉ:", "12 Nguyễn Trãi, Phường Bến Thành, TP. Hồ Chí Minh"),
    ("Số tài khoản:", "0011001234567 tại Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)"),
]
buyer = [
    ("Tên đơn vị mua:", "CÔNG TY CỔ PHẦN THƯƠNG MẠI BÌNH MINH"),
    ("Mã số thuế:", "0109876543"),
    ("Số tài khoản:", "19033334444555 tại Techcombank"),
]
for rows in (seller, buyer):
    for k, v in rows:
        d.text((60, y), k, font=font(bold, 24), fill="black")
        d.text((280, y), v, font=font(reg, 24), fill="black")
        y += 42
    y += 18
    d.line((60, y, W - 60, y), fill="#999", width=2)
    y += 24
cols = [60, 130, 640, 760, 900, 1180]
head = ["STT", "Tên hàng hoá, dịch vụ", "ĐVT", "SL", "Đơn giá", ""]
d.rectangle((60, y, W - 60, y + 46), fill="#eee")
for x, t in zip(cols, head):
    d.text((x + 8, y + 10), t, font=font(bold, 22), fill="black")
d.text((W - 68, y + 10), "Thành tiền", font=font(bold, 22), fill="black", anchor="ra")
y += 56
items = [("1", "Giấy in A4 Double A 80gsm", "Ram", "10", "85.000", "850.000"),
         ("2", "Bút bi Thiên Long TL-027", "Thùng", "1", "263.182", "263.182")]
for it in items:
    for x, t in zip(cols, it[:5]):
        d.text((x + 8, y), t, font=font(reg, 22), fill="black")
    d.text((W - 68, y), it[5], font=font(reg, 22), fill="black", anchor="ra")
    y += 40
y += 10
d.line((60, y, W - 60, y), fill="#999", width=2)
y += 20
for k, v, b in [("Cộng tiền hàng:", "1.113.182", False), ("Thuế suất GTGT 10%, tiền thuế:", "111.318", False),
                ("Phí vận chuyển:", "25.500", False), ("TỔNG CỘNG TIỀN THANH TOÁN:", "1.250.000", True)]:
    d.text((520, y), k, font=font(bold if b else reg, 26), fill="black")
    d.text((W - 68, y), v, font=font(bold if b else reg, 26), fill="black", anchor="ra")
    y += 44
d.text((60, y + 10), "Số tiền viết bằng chữ: Một triệu hai trăm năm mươi nghìn đồng chẵn.", font=font(reg, 24), fill="black")
d.text((W // 2, H - 60), "MẪU GIẢ ĐỂ THỬ CÔNG CỤ — KHÔNG CÓ GIÁ TRỊ", font=font(bold, 24), fill="#b3261e", anchor="mm")
out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("hoa-don-mau.png"))
im.save(out)
print(out)

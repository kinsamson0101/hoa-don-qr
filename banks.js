// Bank BIN list from https://api.vietqr.io/v2/banks, fetched 2026-11-11 (76 banks).
// Refresh: node tools/update-banks.js
(function (root) {
  var BANKS = [
    {
      "bin": "970415",
      "short": "VietinBank",
      "code": "ICB",
      "name": "Ngân hàng TMCP Công thương Việt Nam"
    },
    {
      "bin": "970436",
      "short": "Vietcombank",
      "code": "VCB",
      "name": "Ngân hàng TMCP Ngoại Thương Việt Nam"
    },
    {
      "bin": "970418",
      "short": "BIDV",
      "code": "BIDV",
      "name": "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam"
    },
    {
      "bin": "970405",
      "short": "Agribank",
      "code": "VBA",
      "name": "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam"
    },
    {
      "bin": "970448",
      "short": "OCB",
      "code": "OCB",
      "name": "Ngân hàng TMCP Phương Đông"
    },
    {
      "bin": "970422",
      "short": "MBBank",
      "code": "MB",
      "name": "Ngân hàng TMCP Quân đội"
    },
    {
      "bin": "970407",
      "short": "Techcombank",
      "code": "TCB",
      "name": "Ngân hàng TMCP Kỹ thương Việt Nam"
    },
    {
      "bin": "970416",
      "short": "ACB",
      "code": "ACB",
      "name": "Ngân hàng TMCP Á Châu"
    },
    {
      "bin": "970432",
      "short": "VPBank",
      "code": "VPB",
      "name": "Ngân hàng TMCP Việt Nam Thịnh Vượng"
    },
    {
      "bin": "970423",
      "short": "TPBank",
      "code": "TPB",
      "name": "Ngân hàng TMCP Tiên Phong"
    },
    {
      "bin": "970403",
      "short": "Sacombank",
      "code": "STB",
      "name": "Ngân hàng TMCP Sài Gòn Tài Lộc"
    },
    {
      "bin": "970437",
      "short": "HDBank",
      "code": "HDB",
      "name": "Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh"
    },
    {
      "bin": "970454",
      "short": "VietCapitalBank",
      "code": "VCCB",
      "name": "Ngân hàng TMCP Bản Việt"
    },
    {
      "bin": "970429",
      "short": "SCB",
      "code": "SCB",
      "name": "Ngân hàng TMCP Sài Gòn"
    },
    {
      "bin": "970441",
      "short": "VIB",
      "code": "VIB",
      "name": "Ngân hàng TMCP Quốc tế Việt Nam"
    },
    {
      "bin": "970443",
      "short": "SHB",
      "code": "SHB",
      "name": "Ngân hàng TMCP Sài Gòn - Hà Nội"
    },
    {
      "bin": "970431",
      "short": "Eximbank",
      "code": "EIB",
      "name": "Ngân hàng TMCP Xuất Nhập khẩu Việt Nam"
    },
    {
      "bin": "970426",
      "short": "MSB",
      "code": "MSB",
      "name": "Ngân hàng TMCP Hàng Hải"
    },
    {
      "bin": "546034",
      "short": "CAKE",
      "code": "CAKE",
      "name": "TMCP Việt Nam Thịnh Vượng - Ngân hàng số CAKE by VPBank"
    },
    {
      "bin": "546035",
      "short": "Ubank",
      "code": "Ubank",
      "name": "TMCP Việt Nam Thịnh Vượng - Ngân hàng số Ubank by VPBank"
    },
    {
      "bin": "963388",
      "short": "Timo",
      "code": "TIMO",
      "name": "Ngân hàng số Timo by Ban Viet Bank (Timo by Ban Viet Bank)"
    },
    {
      "bin": "971005",
      "short": "ViettelMoney",
      "code": "VTLMONEY",
      "name": "Tổng Công ty Dịch vụ số Viettel - Chi nhánh tập đoàn công nghiệp viễn thông Quân Đội"
    },
    {
      "bin": "971011",
      "short": "VNPTMoney",
      "code": "VNPTMONEY",
      "name": "Trung tâm dịch vụ tài chính số VNPT- Chi nhánh Tổng công ty truyền thông (VNPT Fintech)"
    },
    {
      "bin": "970400",
      "short": "SaigonBank",
      "code": "SGICB",
      "name": "Ngân hàng TMCP Sài Gòn Công Thương"
    },
    {
      "bin": "970409",
      "short": "BacABank",
      "code": "BAB",
      "name": "Ngân hàng TMCP Bắc Á"
    },
    {
      "bin": "971133",
      "short": "PVcomBank Pay",
      "code": "PVDB",
      "name": "Ngân hàng số PVcomBank"
    },
    {
      "bin": "971025",
      "short": "MoMo",
      "code": "momo",
      "name": "CTCP Dịch Vụ Di Động Trực Tuyến"
    },
    {
      "bin": "970412",
      "short": "PVcomBank",
      "code": "PVCB",
      "name": "Ngân hàng TMCP Đại Chúng Việt Nam"
    },
    {
      "bin": "970414",
      "short": "MBV",
      "code": "MBV",
      "name": "Ngân hàng TNHH MTV Việt Nam Hiện Đại"
    },
    {
      "bin": "970419",
      "short": "NCB",
      "code": "NCB",
      "name": "Ngân hàng TMCP Quốc Dân"
    },
    {
      "bin": "970424",
      "short": "ShinhanBank",
      "code": "SHBVN",
      "name": "Ngân hàng TNHH MTV Shinhan Việt Nam"
    },
    {
      "bin": "970425",
      "short": "ABBANK",
      "code": "ABB",
      "name": "Ngân hàng TMCP An Bình"
    },
    {
      "bin": "970427",
      "short": "VietABank",
      "code": "VAB",
      "name": "Ngân hàng TMCP Việt Á"
    },
    {
      "bin": "970428",
      "short": "NamABank",
      "code": "NAB",
      "name": "Ngân hàng TMCP Nam Á"
    },
    {
      "bin": "970430",
      "short": "PGBank",
      "code": "PGB",
      "name": "Ngân hàng TMCP Thịnh vượng và Phát triển"
    },
    {
      "bin": "970433",
      "short": "VietBank",
      "code": "VIETBANK",
      "name": "Ngân hàng TMCP Việt Nam Thương Tín"
    },
    {
      "bin": "970438",
      "short": "BaoVietBank",
      "code": "BVB",
      "name": "Ngân hàng TMCP Bảo Việt"
    },
    {
      "bin": "970440",
      "short": "SeABank",
      "code": "SEAB",
      "name": "Ngân hàng TMCP Đông Nam Á"
    },
    {
      "bin": "970446",
      "short": "COOPBANK",
      "code": "COOPBANK",
      "name": "Ngân hàng Hợp tác xã Việt Nam"
    },
    {
      "bin": "970449",
      "short": "LPBank",
      "code": "LPB",
      "name": "Ngân hàng TMCP Lộc Phát Việt Nam"
    },
    {
      "bin": "970452",
      "short": "KienLongBank",
      "code": "KLB",
      "name": "Ngân hàng TMCP Kiên Long"
    },
    {
      "bin": "668888",
      "short": "KBank",
      "code": "KBank",
      "name": "Ngân hàng Đại chúng TNHH Kasikornbank"
    },
    {
      "bin": "970466",
      "short": "KEBHanaHCM",
      "code": "KEBHANAHCM",
      "name": "Ngân hàng KEB Hana – Chi nhánh Thành phố Hồ Chí Minh"
    },
    {
      "bin": "970467",
      "short": "KEBHANAHN",
      "code": "KEBHANAHN",
      "name": "Ngân hàng KEB Hana – Chi nhánh Hà Nội"
    },
    {
      "bin": "977777",
      "short": "MAFC",
      "code": "MAFC",
      "name": "Công ty Tài chính TNHH MTV Mirae Asset (Việt Nam) "
    },
    {
      "bin": "999888",
      "short": "VBSP",
      "code": "VBSP",
      "name": "Ngân hàng Chính sách Xã hội"
    },
    {
      "bin": "963668",
      "short": "BNP HN",
      "code": "BNP HN",
      "name": "Ngân hàng BNP Paribas – Chi nhánh Hà Nội"
    },
    {
      "bin": "555666",
      "short": "BIDC",
      "code": "BIDC",
      "name": "Ngân hàng Đầu Tư Và Phát Triển Campuchia - Chi nhánh Hà Nội"
    },
    {
      "bin": "963666",
      "short": "BNP HCM",
      "code": "BNP HCM",
      "name": "Ngân hàng BNP Paribas – Chi nhánh Thành phố Hồ Chí Minh"
    },
    {
      "bin": "971101",
      "short": "ZaloPay",
      "code": "ZALOPAY",
      "name": "Ví điện tử ZaloPay"
    },
    {
      "bin": "963688",
      "short": "BOCHK",
      "code": "BOCHK",
      "name": "Ngân hàng Bank of China (Hong Kong) Limited – Chi nhánh Hồ Chí Minh"
    },
    {
      "bin": "970465",
      "short": "BSP",
      "code": "BSP",
      "name": "Ngân hàng SinoPac - Chi nhánh Thành phố Hồ Chí Minh"
    },
    {
      "bin": "168999",
      "short": "CUBHCM",
      "code": "CUBHCM",
      "name": "Ngân hàng Cathay United Bank – Chi nhánh Hồ Chí Minh"
    },
    {
      "bin": "963686",
      "short": "ESUN",
      "code": "ESUN",
      "name": "Ngân hàng Thương mại TNHH E.SUN – Chi nhánh Đồng Nai (ESUNBANK)"
    },
    {
      "bin": "963669",
      "short": "ICBC",
      "code": "ICBC",
      "name": "Ngân hàng Công thương Trung Quốc – Chi nhánh thành phố Hà Nội"
    },
    {
      "bin": "971032",
      "short": "MVAS",
      "code": "MVAS",
      "name": "Trung tâm Dịch vụ số Mobifone – Chi nhánh Tổng Công ty viễn thông Mobifone"
    },
    {
      "bin": "963326",
      "short": "TNEX",
      "code": "TNEX",
      "name": "TNEX by MSB"
    },
    {
      "bin": "458761",
      "short": "HSBC",
      "code": "HSBC",
      "name": "Ngân hàng TNHH MTV HSBC (Việt Nam)"
    },
    {
      "bin": "970442",
      "short": "HongLeong",
      "code": "HLBVN",
      "name": "Ngân hàng TNHH MTV Hong Leong Việt Nam"
    },
    {
      "bin": "970455",
      "short": "IBKHN",
      "code": "IBK - HN",
      "name": "Ngân hàng Công nghiệp Hàn Quốc - Chi nhánh Hà Nội"
    },
    {
      "bin": "970456",
      "short": "IBKHCM",
      "code": "IBK - HCM",
      "name": "Ngân hàng Công nghiệp Hàn Quốc - Chi nhánh TP. Hồ Chí Minh"
    },
    {
      "bin": "970434",
      "short": "IndovinaBank",
      "code": "IVB",
      "name": "Ngân hàng TNHH Indovina"
    },
    {
      "bin": "970406",
      "short": "Vikki",
      "code": "Vikki",
      "name": "Ngân hàng TNHH Một thành viên số Vikki"
    },
    {
      "bin": "801011",
      "short": "Nonghyup",
      "code": "NHB HN",
      "name": "Ngân hàng Nonghyup - Chi nhánh Hà Nội"
    },
    {
      "bin": "796500",
      "short": "DBSBank",
      "code": "DBS",
      "name": "DBS Bank Ltd - Chi nhánh Thành phố Hồ Chí Minh"
    },
    {
      "bin": "970439",
      "short": "PublicBank",
      "code": "PBVN",
      "name": "Ngân hàng TNHH MTV Public Việt Nam"
    },
    {
      "bin": "970410",
      "short": "StandardChartered",
      "code": "SCVN",
      "name": "Ngân hàng TNHH MTV Standard Chartered Bank Việt Nam"
    },
    {
      "bin": "533948",
      "short": "Citibank",
      "code": "CITIBANK",
      "name": "Ngân hàng Citibank, N.A. - Chi nhánh Hà Nội"
    },
    {
      "bin": "422589",
      "short": "CIMB",
      "code": "CIMB",
      "name": "Ngân hàng TNHH MTV CIMB Việt Nam"
    },
    {
      "bin": "970458",
      "short": "UnitedOverseas",
      "code": "UOB",
      "name": "Ngân hàng United Overseas - Chi nhánh TP. Hồ Chí Minh"
    },
    {
      "bin": "970444",
      "short": "CBBank",
      "code": "CBB",
      "name": "Ngân hàng Thương mại trách nhiệm hữu hạn một thành viên Ngoại thương Công nghệ số (Vietcombank Neo Limited)"
    },
    {
      "bin": "970408",
      "short": "GPBank",
      "code": "GPB",
      "name": "Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu"
    },
    {
      "bin": "970421",
      "short": "VRB",
      "code": "VRB",
      "name": "Ngân hàng Liên doanh Việt - Nga"
    },
    {
      "bin": "970457",
      "short": "Woori",
      "code": "WVN",
      "name": "Ngân hàng TNHH MTV Woori Việt Nam"
    },
    {
      "bin": "970462",
      "short": "KookminHN",
      "code": "KBHN",
      "name": "Ngân hàng Kookmin - Chi nhánh Hà Nội"
    },
    {
      "bin": "970463",
      "short": "KookminHCM",
      "code": "KBHCM",
      "name": "Ngân hàng Kookmin - Chi nhánh Thành phố Hồ Chí Minh"
    }
  ];
  if (typeof module === "object" && module.exports) module.exports = BANKS; else root.BANKS = BANKS;
})(this);

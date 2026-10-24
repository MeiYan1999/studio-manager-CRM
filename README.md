# 📸 Studio Manager — Web CRM quản lý studio chụp ảnh

Ứng dụng web CRM hoàn chỉnh dành cho studio chụp ảnh: quản lý khách hàng, lịch chụp, đơn hàng & công nợ, gói dịch vụ, nhân sự và thống kê kinh doanh. Giao diện tiếng Việt, không cần cài đặt, không cần server — mở là chạy.

## ✨ Tính năng

### 📊 Tổng quan (Dashboard)
- Doanh thu tháng này & so sánh với tháng trước
- Số lịch chụp tháng, khách hàng mới, công nợ phải thu
- Biểu đồ doanh thu 6 tháng gần nhất
- Lịch chụp 7 ngày tới và đơn hàng gần đây

### 📅 Lịch chụp
- Xem **lịch tháng** (đặt lịch nhanh bằng cách bấm vào ngày) hoặc **danh sách**
- Luồng trạng thái đầy đủ: Chờ xác nhận → Đã xác nhận → Đang chụp → Đang hậu kỳ → Đã trả ảnh (kèm timeline trực quan)
- Phân công nhiếp ảnh gia, địa điểm, giờ chụp, thời lượng
- Bộ lọc theo trạng thái, tìm kiếm

### 💰 Đơn hàng & Thanh toán
- Tạo đơn từ gói dịch vụ có sẵn + tùy chỉnh từng dòng (album thêm, phóng ảnh, trang điểm...)
- Chiết khấu, tiền cọc, thanh toán từng phần — tự tính còn lại
- Thanh toán tiến độ với thanh tiến trình
- **In hóa đơn** định dạng A4 sẵn sàng giao khách
- Quản lý công nợ theo khách hàng

### 👥 Khách hàng
- Hồ sơ đầy đủ: liên hệ, ghi chú, lịch sử chụp & mua hàng
- Thống kê nhanh: số lịch chụp, tổng chi tiêu, công nợ
- Phân loại khách lẻ / doanh nghiệp, tìm kiếm & lọc

### 🗂 Bảng công việc (Kanban kiểu Trello)
- Bảng kanban với các cột tùy chỉnh (mặc định: Cần làm → Đang thực hiện → Chờ duyệt → Hoàn thành)
- **Kéo & thả thẻ** giữa các cột, sắp xếp thứ tự thẻ ngay trong cột
- Mỗi thẻ: người phụ trách, hạn chót (tự tô màu đỏ khi trễ, vàng khi đến hạn), độ ưu tiên, mô tả, liên kết tới lịch chụp
- Thêm / đổi tên / xóa cột (thẻ trong cột bị xóa tự chuyển sang cột kế tiếp)
- Lọc bảng theo nhân sự

### 👗 Trang phục • Concept • Mượn đồ
- **Kho trang phục**: váy cưới, vest, áo dài, hanbok... theo size/màu; tự tính *Sẵn có = Tổng − Đang mượn*
- **Concept**: quản lý bộ dựng concept (Hàn Quốc, Vintage...) kèm phí sử dụng, trạng thái Sẵn sàng/Bảo trì
- **Mượn đồ**: phiếu mượn cho khách hoặc nhân viên, liên kết lịch chụp, tiền cọc, hạn trả — **tự trừ/hồi kho**, cảnh báo **quá hạn** ( tô đỏ + đếm số ngày trễ), ghi nhận trả chỉ với 1 nút
- Đồ mượn hiển thị ngay trong chi tiết lịch chụp

### 🔐 Đăng nhập & Phân quyền
- **Đăng ký tài khoản quản trị** ở lần sử dụng đầu tiên; sau đó đăng nhập bằng tài khoản đó
- Admin tạo tài khoản đăng nhập cho từng nhân viên trong **Hệ thống → Tài khoản & Quyền**
- **Mẫu quyền nhanh**: Quản trị (toàn quyền) / Lễ tân / Nhiếp ảnh gia / Hậu kỳ — hoặc tùy chỉnh tick từng phân hệ
- Mỗi tài khoản **chỉ thấy và dùng được** những phân hệ được cấp; gõ trực tiếp URL phân hệ không có quyền cũng bị chặn
- **Ép đổi mật khẩu lần đầu**: tài khoản do admin tạo / được cấp lại mật khẩu sẽ phải tự đặt mật khẩu riêng ngay sau khi đăng nhập (badge "Cần đổi MK")
- Khóa/mở khóa tài khoản, chống tự khóa chính mình, luôn giữ ≥ 1 quản trị hoạt động
- Mật khẩu được băm (SHA-256) trước khi lưu; phiên đăng nhập lưu riêng, có nút Đăng xuất

### 📜 Nhật ký thao tác
- Ghi lại **ai đã làm gì, lúc nào**: đăng nhập/đăng xuất, thêm/sửa/xóa khách hàng, lịch chụp, đơn hàng, thu tiền, công việc, kho trang phục, phiếu mượn, tài khoản, dữ liệu...
- Xem trong **Hệ thống → Nhật ký thao tác** (riêng quyền); lọc theo người dùng / loại hành động, tìm kiếm, giới hạn 500 bản ghi gần nhất

### 🖥 Chế độ server (nhiều máy dùng chung) — Node.js + PostgreSQL
- Mặc định app chạy **độc lập** (localStorage) — không cần cài gì
- Khi cần nhiều máy/cùng dữ liệu: khởi động backend, app **tự dò và chuyển sang chế độ server**
  (đăng nhập xác thực phía server, dữ liệu lưu PostgreSQL, localStorage chỉ là cache offline)

```bash
# 1) Cài & khởi động PostgreSQL, tạo database (chạy một lần)
brew install postgresql@16
brew services start postgresql@16
createdb studio_manager

# 2) Khởi động backend
cd server
npm install
npm start            # → http://localhost:8090

# 3) Mở http://localhost:8090 từ bất kỳ máy nào trong LAN
#    Máy đầu tiên sẽ đăng ký tài khoản quản trị; các máy sau đăng nhập bình thường
```

- Biến môi trường: `PORT` (mặc định 8090), `DATABASE_URL` (mặc định `postgresql://localhost:5432/studio_manager`)
- Lưu ý: đồng bộ theo kiểu "bản ghi mới nhất thắng" (last-write-wins) — đủ dùng cho team nhỏ;
  khởi động lại server sẽ yêu cầu đăng nhập lại (session trong bộ nhớ)

### 💰 Tài chính & Lương
- **Báo cáo tháng**: doanh thu (đã thu) vs chi phí, lợi nhuận, lương chưa trả + biểu đồ 6 tháng
- **Chi phí**: quản lý theo loại (thuê studio, quảng cáo, đồ nghề, điện nước...)
- **Lương tự động**: mỗi nhân sự có lương cơ bản + % hoa hồng — bấm "Tính lương tự động" là hệ thống tính từ các buổi chụp nhân sự đó phụ trách trong tháng (gắn với đơn hàng); đánh dấu đã trả

### 📄 Hợp đồng thông minh
- Tạo hợp đồng gắn khách hàng & lịch chụp; **lịch thanh toán tự sinh** theo tỷ lệ (50/50, 30/40/30, 40/40/20, 30/70) với hạn thanh toán tự gắn ngày chụp
- **Sinh 7 điều khoản mẫu** trong 1 nút (cọc, hủy lịch, giao ảnh, bản quyền...) — chỉnh sửa tự do
- **Phân tích thông minh**: cảnh báo quá hạn thu, chưa thu cọc, chờ ký lâu, đã thu đủ
- Tick từng đợt thu ngay trên hợp đồng; **in hợp đồng** định dạng A4 đầy đủ 2 chữ ký

### 🌐 Cổng khách hàng
- Mỗi buổi chụp có **link riêng** (không cần tài khoản): khách xem tiến độ 5 bước, trạng thái thanh toán và **tự tick chọn ảnh cần chỉnh sửa** — chọn xong lưu, studio nhận ngay
- Quản lý trong chi tiết buổi chụp → "Thư viện & cổng KH": sinh danh sách ảnh, mở/khóa chọn ảnh, copy link
- Chạy cùng backend: link mở được từ máy khác (endpoint public `/api/portal/:token`)

### ⏰ Chấm công nhân viên
- **Nút điểm danh vào/ra** ngay trên thanh trên (tài khoản cần được liên kết nhân sự trong Tài khoản & Quyền)
- Tự tính **giờ làm**, đánh dấu **đi muộn / về sớm** theo giờ làm việc cấu hình trong Cài đặt (mặc định 9:00–18:00)
- Phân hệ **Chấm công**: xem theo ngày (mọi nhân sự, ai chưa điểm danh, thống kê muộn) hoặc **theo tháng** (ngày có mặt, tổng giờ, giờ TB/ngày, số lần muộn)
- Quản trị chấm bổ sung / sửa tay cho nhân sự quên điểm danh; mọi thao tác ghi nhật ký

### 📦 Gói dịch vụ & 👤 Nhân sự
- Quản lý bảng giá theo loại (Cưới, Gia đình, Chân dung, Sản phẩm, Sự kiện...)
- Ekip: vai trò (nhiếp ảnh gia / hậu kỳ / trợ lý), trạng thái làm việc, lịch được phân công

### ⚙️ Cài đặt & Dữ liệu
- Thông tin studio (hiện trên hóa đơn)
- **Xuất / Nhập backup JSON**, khôi phục dữ liệu mẫu, xóa dữ liệu

## 🚀 Cách chạy

**Cách 1 — Mở trực tiếp:**
> Bấm đúp vào file `index.html` (hoặc kéo vào trình duyệt).

**Cách 2 — Chạy qua server local (khuyên dùng):**
```bash
cd photo-studio-crm   # hoặc thư mục chứa project
python3 -m http.server 8080
# Mở http://localhost:8080
```

## 💾 Dữ liệu nằm ở đâu?

Toàn bộ dữ liệu lưu trong **localStorage của trình duyệt** trên máy bạn — không gửi lên internet. 
⚠️ Xóa lịch sử/dữ liệu trình duyệt sẽ mất dữ liệu → nên dùng chức năng **Xuất dữ liệu** (Cài đặt) để backup định kỳ.

Lần đầu mở app sẽ tự nạp **dữ liệu mẫu** để bạn xem cách hoạt động; vào **Cài đặt → Xóa toàn bộ dữ liệu** để bắt đầu với dữ liệu thật của studio.

## 📁 Cấu trúc

```
├── index.html      # Khung ứng dụng + bộ icon SVG
├── css/styles.css  # Design system (màu, component, responsive)
└── js/app.js       # Toàn bộ logic: state, views, modal, lịch, hóa đơn...
```

## 🗃 Mô hình dữ liệu

| Đối tượng | Trường chính |
|---|---|
| Customer | name, type (lẻ/DN), phone, email, address, notes |
| Package | name, category, price, hours, includes, active |
| Booking | customerId, packageId, date, startTime, hours, location, photographerId, status |
| Order | code, customerId, bookingId, items[], discount, paidAmount, status |
| Staff | name, role, phone, email, active |
| TaskColumn | name (cột kanban) |
| Task | columnId, title, desc, assigneeId, dueDate, priority, bookingId |
| Outfit | name, category, size, color, qty, note |
| Concept | name, desc, fee, status (ready/maintenance) |
| Loan | outfitId, qty, borrowerType, customerId/staffId, bookingId, borrowDate, dueDate, returnDate, deposit |
| User | username, passHash, name, staffId, preset, perms[], active, lastLogin |

## 🗺 Lộ trình gợi ý (phát triển tiếp)

- [ ] Backend thật: Node.js/Express hoặc Next.js + PostgreSQL, đồng bộ nhiều thiết bị
- [ ] Upload & giao ảnh cho khách theo từng booking
- [ ] Nhắc lịch tự động qua Zalo OA / SMS / email
- [ ] Báo cáo nâng cao: doanh thu theo gói, theo nhiếp ảnh gia, nguồn khách
- [ ] Đa chi nhánh studio

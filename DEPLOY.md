# 🚀 Đưa Studio Manager lên mạng (trở thành trang web online)

App của bạn có **2 cách up web**, tùy nhu cầu:

---

## Cách A — Web tĩnh (nhanh nhất, miễn phí, ~5 phút) ⚡

Giao diện + toàn bộ tính năng chạy online, **dữ liệu lưu trong trình duyệt của từng người** (localStorage).

**Phù hợp:** dùng 1 máy chính, gửi khách xem demo, landing trang quản lý cá nhân.
**Hạn chế:** dữ liệu KHÔNG đồng bộ giữa các máy; link cổng khách hàng chỉ hoạt động trên chính máy đó.

### Các bước (Vercel — miễn phí)

1. Tạo tài khoản [GitHub](https://github.com) → tạo repo mới (VD: `studio-manager`)
2. Upload mã nguồn (thư mục này) vào repo:
   ```bash
   git init && git add . && git commit -m "Studio Manager CRM"
   git remote add origin https://github.com/<user>/studio-manager.git
   git push -u origin main
   ```
3. Vào [vercel.com](https://vercel.com) → **Add New Project** → chọn repo vừa đẩy → **Deploy**
4. Xong! nhận link dạng `https://studio-manager.vercel.app` (Netlify, Cloudflare Pages, GitHub Pages làm tương tự)

---

## Cách B — Full online: nhiều máy dùng chung dữ liệu (khuyên dùng) 🏢

Chạy kèm backend Node.js + PostgreSQL → **đăng nhập từ bất kỳ máy nào, dữ liệu chung, cổng khách hàng online thật**.

**Phù hợp:** studio nhiều nhân viên, khách tự mở link chọn ảnh từ điện thoại của họ.

### B1. Tạo database PostgreSQL miễn phí (2 phút)

1. Vào [neon.tech](https://neon.tech) → đăng ký → **Create Project**
2. Copy **Connection string** (dạng `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`) — đây là `DATABASE_URL`

### B2. Đăng backend (Render — miễn phí)

1. Đẩy code lên GitHub như Cách A
2. Vào [render.com](https://render.com) → **New + → Web Service** → chọn repo
3. Cấu hình:
   - **Build Command:** `cd server && npm install`
   - **Start Command:** `node server/server.js`
4. Mục **Environment** → thêm biến: `DATABASE_URL` = chuỗi connection ở B1
5. **Create Web Service** → chờ ~2 phút → nhận link `https://studio-manager.onrender.com`

(Railway.app làm tương tự; hoặc VPS riêng: cài Node + Postgres rồi `cd server && npm install && npm start`)

### B3. Dùng

- Mở link Render: app **tự dò backend** và chuyển chế độ server
- Lần đầu sẽ hiện **Đăng ký tài khoản quản trị** → tạo admin → tạo tài khoản nhân viên
- Link cổng khách hàng giờ gửi qua Zalo là khách mở được thật (từ điện thoại khách)
- Vercel/Render cho phép **gắn tên miền riêng** (VD: `quanly.tenstudio.vn`) trong Settings → Custom Domain

---

## Lưu ý quan trọng

- Máy chủ Render miễn phí "ngủ" sau 15 phút không dùng → lần mở sau mất ~30–60 giây khởi động lại (phiên đăng nhập sẽ yêu cầu đăng nhập lại). Nâng gói trả phí ($7/th) nếu cần chạy liên tục.
- **Backup định kỳ:** Cài đặt → Sao lưu & Khôi phục → bật tự động backup, hoặc xuất file JSON thủ công trước khi up web.
- Muốn nâng cấp sau này (upload ảnh thật, AI, SePay đối soát tự động) — mọi thứ viết thêm vào `server/`, cấu trúc đã sẵn sàng.

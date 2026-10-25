/* ============================================================
   STUDIO MANAGER — Ứng dụng quản lý studio chụp ảnh
   SPA thuần JS, dữ liệu lưu trong localStorage
   ============================================================ */
'use strict';

/* ================= HELPERS ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMoney = n => new Intl.NumberFormat('vi-VN').format(Math.round(+n || 0)) + '₫';
const fmtShort = n => {
  n = +n || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + ' tỷ';
  if (n >= 1e6) return Math.round(n / 1e6) + ' tr';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n);
};

const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toISO(new Date());
const dOff = n => { const d = new Date(); d.setDate(d.getDate() + n); return toISO(d); };
const fmtDate = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const WD = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const WD_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const weekday = iso => WD[new Date(iso + 'T00:00:00').getDay()];
const weekdayShort = iso => WD_SHORT[new Date(iso + 'T00:00:00').getDay()];
const fmtDateLong = iso => iso ? `${weekday(iso)}, ${fmtDate(iso)}` : '—';

const icon = (name, cls = '') => `<svg class="icon ${cls}"><use href="#i-${name}"/></svg>`;
const initials = name => String(name || '?').trim().split(/\s+/).map(w => w[0]).slice(-2).join('').toUpperCase();
const shortName = full => { const p = String(full || '').trim().split(/\s+/); return p.length > 1 ? p[p.length - 1] : (p[0] || ''); };

const byId = (arr, id) => arr.find(x => x.id === id);
const custName = id => (byId(state.customers, id) || {}).name || '—';
const pkgName = id => (byId(state.packages, id) || {}).name || '—';
const staffName = id => (byId(state.staff, id) || {}).name || '—';

function computeEnd(start, hours) {
  if (!start) return '';
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + Math.round((+hours || 0) * 60);
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

/* ================= CONSTANTS ================= */
const BK_STATUS = {
  pending:   { label: 'Chờ xác nhận' },
  confirmed: { label: 'Đã xác nhận' },
  shooting:  { label: 'Đang chụp' },
  editing:   { label: 'Đang hậu kỳ' },
  delivered: { label: 'Đã trả ảnh' },
  cancelled: { label: 'Đã hủy' },
};
const FLOW = ['pending', 'confirmed', 'shooting', 'editing', 'delivered'];
const NEXT_ACTION = {
  pending: ['confirmed', 'Xác nhận lịch chụp'],
  confirmed: ['shooting', 'Bắt đầu chụp'],
  shooting: ['editing', 'Chụp xong, chuyển hậu kỳ'],
  editing: ['delivered', 'Đã trả ảnh cho khách'],
};
const ORDER_STATUS = { draft: 'Nháp', confirmed: 'Đã xác nhận', completed: 'Hoàn thành', cancelled: 'Đã hủy' };
const CATS = ['Cưới', 'Gia đình', 'Chân dung', 'Sản phẩm', 'Sự kiện', 'Khác'];
const CAT_CLS = { 'Cưới': 'b-cat-cuoi', 'Gia đình': 'b-cat-giadinh', 'Chân dung': 'b-cat-chandung', 'Sản phẩm': 'b-cat-sanpham', 'Sự kiện': 'b-cat-sukien', 'Khác': 'b-cat-khac' };
const ROLES = { photographer: 'Thợ Chụp', editor: 'Hậu kỳ', assistant: 'Sale Onl', stylist: 'Stylist', saleoff: 'Sale Off', manager: 'Quản lý' };

// Ca làm việc — giờ chuẩn để tính đi muộn / về sớm theo từng nhân sự
const SHIFTS = {
  ca1: { short: 'Ca 1', label: 'Ca 1 (7:30–17:30)', start: '07:30', end: '17:30' },
  normal: { short: 'Ca thường', label: 'Ca thường (8:30–18:30)', start: '08:30', end: '18:30' },
  ca2: { short: 'Ca 2', label: 'Ca 2 (9:00–19:00)', start: '09:00', end: '19:00' },
};
const shiftOf = s => SHIFTS[(s && s.shift) || 'normal'] || SHIFTS.normal;

// ---- Nhật ký cập nhật (changelog) ----
const APP_VERSION = '3.7';
const CL_KIND = { new: ['✨ mới', 'b-delivered'], fix: ['🐛 sửa lỗi', 'b-unpaid'], ui: ['🎨 giao diện', 'b-deposit'], imp: ['⚡ nâng cấp', 'b-confirmed'] };
const CHANGELOG = [
  { v: '3.7', d: '26/10/2026', items: [['ui', 'Tạo Album thành 3 bước gọn: dán link Google Drive → nhập số ảnh (tự sinh mã A01…) → copy link thả tim ❤ gửi khách'], ['new', 'Cổng khách nhúng khung xem ảnh Google Drive thật ngay trên trang thả tim (Drive chia sẻ kiểu ai-có-link)']] },
  { v: '3.6', d: '26/10/2026', items: [['new', 'Chấm công di chuyển chi nhánh: GPS ghi cả lúc thoát ca; nếu vào ca không ở chi nhánh nào thì ngày công ghi nhận theo chi nhánh khớp GPS thoát ca — hiện nhãn "Làm tại: Chi nhánh…" và 2 dòng vị trí Vào/Ra kèm bản đồ']] },
  { v: '3.5', d: '26/10/2026', items: [['ui', 'Thanh trên: đồng hồ Việt Nam chạy từng giây (giờ:phút:giây + thứ, ngày/tháng/năm) cạnh 2 nút "Vào ca làm" / "Thoát ca làm" luôn hiển thị — nút không khả dụng tự mờ đi']] },
  { v: '3.4', d: '26/10/2026', items: [['ui', 'Tinh chỉnh toàn diện theo taste-skill: bảng màu stone ấm + than + 1 accent vàng (bỏ tím mặc định), nút lún nhẹ khi bấm, đổi trang có chuyển động cascade, header bảng chữ in hoa giãn dòng, focus ring rõ, modal mờ nền pop spring']] },
  { v: '3.3', d: '26/10/2026', items: [['new', 'Cổng thanh toán SePay: webhook biến động số dư — giao dịch về hiện ngay trong Thu chi, tự đối soát đơn (khớp mã ĐH/số tiền), toast + thông báo tiền về'], ['new', 'Nhắn Tin kiểu Pancake: phân loại hội thoại (Chờ trả lời/Đã trả lời/Xong), gắn thẻ khách (Khách mới, Đã báo giá, Chờ cọc…), quản lý mẫu tin nhắn riêng']] },
  { v: '3.2', d: '26/10/2026', items: [['new', 'Mục Nhắn Tin: hội thoại Zalo / Facebook Fanpage — danh sách trò chuyện, bong bóng chat, mẫu trả lời nhanh, gửi link chọn ảnh cho khách, kết nối kênh (chờ token OA/Fanpage)']] },
  { v: '3.1', d: '26/10/2026', items: [['new', 'Mục "Nhật ký cập nhật" trong Hệ thống — xem app đã thay đổi gì theo từng phiên bản']] },
  { v: '3.0', d: '26/10/2026', items: [['new', 'Đính kèm ảnh (biên lai, hóa đơn, chứng từ) cho Thu chi, Chi phí và Đơn hàng — tự nén nhẹ, xem phóng to, tối đa 4 ảnh']] },
  { v: '2.9', d: '26/10/2026', items: [['new', 'Trang "Chia ca làm việc" riêng — bảng tuần kiểu Excel (nhân sự × 7 ngày), điền ca mặc định cả tuần, ghi chú nhanh từng ô'], ['fix', 'Lỗi múi giờ làm lệch ngày đầu tuần trong lịch chia ca']] },
  { v: '2.8', d: '25/10/2026', items: [['new', 'Chia ca: Ca 1 (7:30–17:30), Ca thường (8:30–18:30), Ca 2 (9:00–19:00) — tính muộn/về sớm theo ca từng người'], ['new', 'Nút Vào ca / Thoát ca thay cho điểm danh'], ['new', 'Bảng Hoạt động: biết ai đang online, ai offline theo thời gian thực']] },
  { v: '2.7', d: '25/10/2026', items: [['new', 'Chấm công định vị GPS — ghi vị trí vào/ra ca, so khoảng cách tới chi nhánh gần nhất, cảnh báo xa studio']] },
  { v: '2.6', d: '25/10/2026', items: [['new', 'Quản lý Thu chi (sổ quỹ): giao dịch thu/chi theo danh mục, hình thức, tồn quỹ tích lũy, lọc tháng']] },
  { v: '2.5', d: '25/10/2026', items: [['new', 'Vai trò nhân sự mới: Thợ Chụp, Sale Onl, Stylist, Sale Off'], ['new', 'Lọc theo từng tháng trong năm cho Đơn hàng & Khách hàng kèm badge tổng kết'], ['ui', 'Dashboard làm mới phong cách black & gold sang trọng']] },
  { v: '2.4', d: '25/10/2026', items: [['imp', 'Đồng bộ đa máy thật sự: phiên đăng nhập lưu database (không mất khi server restart), tự kéo dữ liệu mới mỗi 15 giây'], ['fix', 'Máy mới không còn bị bắt "tạo tài khoản lần đầu"; tự kết nối lại khi server Render thức dậy'], ['fix', 'Lỗi server không đọc JSON body khiến mọi lưu online thất bại âm thầm']] },
  { v: '2.3', d: '24/10/2026', items: [['new', 'Lọc Ảnh kiểu Snappic: dán mã mọi định dạng (Excel/Zalo/có-không đuôi file), 4 nút copy 1 chạm, lọc RAW/JPG, tự tạo thư mục con']] },
  { v: '2.2', d: '24/10/2026', items: [['new', 'Cổng khách hàng online thật: khách mở link từ điện thoại, nhập PIN, thả tim chọn ảnh, ghi chú yêu cầu sửa'], ['new', 'Hướng dẫn deploy lên Vercel/Render/Neon (DEPLOY.md) + chuyển dữ liệu máy lên server']] },
  { v: '2.1', d: '24/10/2026', items: [['new', '"Album Khách Chọn" và "Lọc Ảnh" thành 2 mục riêng trong menu Quản lý']] },
  { v: '2.0', d: '24/10/2026', items: [['new', 'Tạo Album kiểu Snappic: quét thư mục ảnh gốc, số ảnh gói & giá phụ thu, watermark, PIN, lời chào khách'], ['new', 'Thanh toán QR VietQR: khách báo "đã chuyển khoản", admin duyệt']] },
  { v: '1.9', d: '10/2026', items: [['new', 'Đa chi nhánh: quản lý chi nhánh 1/2/3…, lọc toàn hệ thống theo chi nhánh, nhân sự chỉ thấy dữ liệu chi nhánh mình']] },
  { v: '1.8', d: '10/2026', items: [['new', 'Cấu hình thông báo từng loại + hộp thư thông báo ngay trong app']] },
  { v: '1.7', d: '10/2026', items: [['new', 'Trang Cài đặt mới: phòng ban, mục tiêu doanh số từng nhân sự, backup tự động hàng ngày, nhập khách từ Excel, AI key, SePay']] },
  { v: '1.6', d: '10/2026', items: [['new', 'Chấm công nhân viên: điểm danh vào/ra, giờ làm, đi muộn'], ['new', 'Lương theo giờ × giờ chấm công; xuất bảng chấm công Excel/PDF']] },
  { v: '1.5', d: '10/2026', items: [['new', 'Tài chính: báo cáo doanh thu, chi phí, tính lương + hoa hồng tự động'], ['new', 'Hợp đồng thông minh: lịch thanh toán tự sinh, điều khoản mẫu, cảnh báo, in'], ['new', 'Cổng khách hàng xem tiến độ & chọn ảnh online']] },
  { v: '1.4', d: '10/2026', items: [['new', 'Đăng nhập/đăng ký, tài khoản từng nhân viên, phân quyền từng phân hệ'], ['new', 'Buộc đổi mật khẩu lần đầu đăng nhập, nhật ký thao tác (ai làm gì, lúc nào)'], ['ui', 'Đổi thương hiệu Memento CRM → Studio Manager']] },
  { v: '1.3', d: '10/2026', items: [['new', 'Bảng công việc Kanban kéo-thả kiểu Trello'], ['new', 'Trang phục, Concept và Mượn đồ tự trừ tồn kho']] },
  { v: '1.2', d: '10/2026', items: [['imp', 'Backend Node.js + PostgreSQL tùy chọn để nhiều máy dùng chung dữ liệu']] },
  { v: '1.1', d: '10/2026', items: [['fix', 'Sửa lỗi đăng ký trùng tên đăng nhập, lỗi mã đơn hàng, giữ phiên làm việc ổn định hơn']] },
  { v: '1.0', d: '10/2026', items: [['new', 'Phiên bản đầu tiên: Khách hàng, Lịch chụp (lịch/tháng), Đơn hàng & thanh toán, Gói dịch vụ, Nhân sự, Tổng quan']] },
];

// Ca hiệu lực của nhân sự vào 1 ngày: ca chia riêng trong lịch > ca mặc định của người đó
function effShift(s, date) {
  const plan = (state.shiftPlan || {})[date] || {};
  return SHIFTS[plan[s.id]] || shiftOf(s);
}

const TITLES = {
  dashboard: ['Tổng quan', 'Bức tranh kinh doanh của studio'],
  bookings:  ['Lịch chụp', 'Quản lý lịch hẹn và tiến trình chụp'],
  orders:    ['Đơn hàng', 'Hợp đồng, thanh toán và công nợ'],
  finance:   ['Tài chính & Lương', 'Doanh thu, chi phí và tính lương tự động'],
  contracts: ['Hợp đồng', 'Hợp đồng thông minh — lịch thanh toán & điều khoản tự sinh'],
  tasks:     ['Bảng công việc', 'Kanban — kéo thả thẻ để cập nhật tiến độ'],
  attendance:['Chấm công', 'Điểm danh, giờ làm và thống kê chấm công nhân sự'],
  shiftplan: ['Chia ca làm việc', 'Xếp ca theo ngày cho toàn bộ nhân viên — kiểu bảng Excel'],
  albums:   ['Album Khách Chọn', 'Tạo link album để khách thả tim chọn ảnh online'],
  photofilter: ['Lọc Ảnh', 'Lọc file ảnh gốc theo mã khách chọn sang thư mục riêng'],
  wardrobe:  ['Trang phục & Concept', 'Kho trang phục, concept chụp và phiếu mượn đồ'],
  accounts:  ['Tài khoản & Quyền', 'Tạo tài khoản đăng nhập và phân quyền cho nhân viên'],
  notifications: ['Cấu hình thông báo', 'Nhận thông báo khi có hoạt động mới'],
  logs:      ['Nhật ký thao tác', 'Ai đã làm gì và lúc nào'],
  changelog: ['Nhật ký cập nhật', 'App đã cập nhật & thay đổi những gì theo từng phiên bản'],
  chats:    ['Nhắn Tin', 'Hội thoại Zalo / Facebook Fanpage — trả lời khách ngay trong app'],
  customers: ['Khách hàng', 'Danh sách khách hàng & lịch sử'],
  packages:  ['Gói dịch vụ', 'Bảng giá các gói chụp của studio'],
  staff:     ['Nhân sự', 'Ekip nhiếp ảnh gia và hậu kỳ'],
  settings:  ['Cài đặt', 'Thông tin studio và dữ liệu'],
};

/* ================= STATE & STORAGE ================= */
const LS_KEY = 'mementoCRM_v1'; // giữ nguyên khóa cũ để không mất dữ liệu người dùng
let state = null;
let currentView = 'dashboard';
let calY = new Date().getFullYear();
let calM = new Date().getMonth();
const viewState = {
  customers: { q: '', type: 'all', month: '' },
  bookings: { mode: 'calendar', q: '', status: 'all' },
  orders: { q: '', pay: 'all', month: '' },
  tasks: { assignee: 'all' },
  wardrobe: { tab: 'items', q: '', cat: 'all', loanQ: '', loanStatus: 'all' },
  logs: { q: '', user: 'all', action: 'all' },
  finance: { tab: 'report', month: monthKey(0) },
  contracts: { q: '', status: 'all' },
  attendance: { tab: 'day', date: todayStr(), month: monthKey(0) },
  albums: { q: '' },
  filter: { bookingId: '' },
};

function blankState() {
  return {
    customers: [], packages: [], bookings: [], orders: [], staff: [],
    taskColumns: [], tasks: [],
    outfits: [], concepts: [], loans: [],
    users: [],
    logs: [],
    expenses: [], payrolls: [], contracts: [], cash: [], shiftPlan: {}, shiftNotes: {}, chats: [], msgTemplates: [], payments: [],
    attendance: [],
    departments: [], roleGroups: [],
    notifications: [],
    branches: [],
    contractSeq: 1,
    orderSeq: 1,
    settings: { studioName: 'Studio Manager', phone: '', email: '', address: '', workStart: '09:00', workEnd: '18:00', pushOn: false, autoBackup: false, lastBackupAt: '', aiApiKey: '', bank: { code: '', accountNo: '', accountName: '' } },
  };
}

/* ---- Chế độ server (tùy chọn): Node.js + PostgreSQL, nhiều máy dùng chung ---- */
let SERVER_MODE = false;
let API_TOKEN = localStorage.getItem('mementoCRM_token') || '';
let __serverHasUsers = null, __serverStudioName = ''; // hỏi server: đã có tài khoản chưa (máy mới chưa đăng nhập)
let __saveTimer = null, __stateDirty = false;

async function detectServer() {
  // 2 lượt: server Render free có thể đang "ngủ" và cần chờ thức dậy (lỗi mạng/timeout mới thử lại)
  for (let i = 0; i < 2; i++) {
    if (i) await new Promise(r => setTimeout(r, 2500));
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch('/api/ping', { signal: ctl.signal });
      clearTimeout(t);
      const j = await r.json().catch(() => null);
      SERVER_MODE = !!(j && j.ok);
      return; // có phản hồi (dù 404/HTML) → kết luận được, không thử lại
    } catch (e) { }
  }
  SERVER_MODE = false;
}

async function loadFromServer() {
  const r = await fetch('/api/state?token=' + encodeURIComponent(API_TOKEN));
  if (!r.ok) { const e = new Error('state ' + r.status); e.status = r.status; throw e; }
  return await r.json();
}

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch (e) { toast('Không lưu được dữ liệu (bộ nhớ đầy?)', 'error'); }
  if (SERVER_MODE && API_TOKEN) {
    __stateDirty = true;
    clearTimeout(__saveTimer);
    __saveTimer = setTimeout(pushState, 500);
  }
}

let __galleryTouchedAt = 0; // studio vừa sửa album thì 3 phút đầu ưu tiên bản local
let __lastVer = null, __pollTimer = null, __seenPayIds = new Set();

// Chế độ online: tự kéo dữ liệu mới từ server mỗi 15 giây (máy khác sửa → máy này cập nhật)
let __presenceList = {}; // userId -> lastSeen ISO
let __hbTimer = null;

async function heartbeat() {
  if (!SERVER_MODE || !API_TOKEN) return;
  try {
    await fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: API_TOKEN }) });
  } catch (e) { }
  refreshPresence();
}

async function refreshPresence() {
  if (!SERVER_MODE || !API_TOKEN) { paintPresence(); return; }
  try {
    const r = await fetch('/api/presence?token=' + encodeURIComponent(API_TOKEN));
    if (!r.ok) return;
    const j = await r.json();
    __presenceList = {};
    (j.list || []).forEach(x => __presenceList[x.userId] = x.lastSeen);
    paintPresence();
  } catch (e) { }
}

function lastSeenText(iso) {
  if (!iso) return 'chưa thấy hoạt động';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 180) return 'đang hoạt động';
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' phút trước';
  if (s < 86400) return Math.round(s / 3600) + ' giờ trước';
  return 'ngày ' + fmtDate(String(iso).slice(0, 10));
}

function paintPresence() {
  const box = document.getElementById('presenceBox');
  if (!box) return;
  const me = currentUser();
  if (!SERVER_MODE) {
    box.innerHTML = `<div class="card" style="padding:14px 18px;margin-bottom:16px;display:flex;gap:10px;align-items:center">
      <span class="pres-chip on"><span class="dot"></span>${esc(me ? me.username : '')}<i>đang hoạt động</i></span>
      <span class="cell-sub">Phiên bản trên máy — mở bản online (nhiều máy) mới thấy ai đang hoạt động, ai offline.</span></div>`;
    return;
  }
  const users = state.users.filter(u => u.active);
  const isOn = u => { const t = __presenceList[u.id]; return !!t && (Date.now() - new Date(t).getTime()) < 180000; };
  const online = users.filter(isOn).length;
  box.innerHTML = `<div class="card" style="padding:14px 18px;margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <h3 style="font-size:14.5px;font-weight:700">Hoạt động</h3>
      <span class="badge ${online ? 'b-confirmed' : 'b-inactive'}">${online}/${users.length} đang online</span>
      <span class="cell-sub">cập nhật mỗi phút · online = hoạt động trong 3 phút gần nhất</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${users.map(u => { const on = isOn(u); return `<span class="pres-chip ${on ? 'on' : ''}" title="${esc(u.name)} — ${lastSeenText(__presenceList[u.id])}"><span class="dot"></span>${esc(u.username)}<i>${on ? 'online' : lastSeenText(__presenceList[u.id])}</i></span>`; }).join('')}
    </div></div>`;
}

function startServerPoll() {
  if (!SERVER_MODE || !API_TOKEN || __pollTimer) return;
  heartbeat();
  if (!__hbTimer) __hbTimer = setInterval(heartbeat, 60000);
  __pollTimer = setInterval(async () => {
    if (__stateDirty || !API_TOKEN) return; // đang chờ đẩy dữ liệu lên — kéo sau
    try {
      const r = await fetch('/api/state-version?token=' + encodeURIComponent(API_TOKEN));
      if (r.status === 401) { clearInterval(__pollTimer); __pollTimer = null; logout(); return; }
      if (!r.ok) return;
      const j = await r.json();
      if (!j.v) return;
      if (__lastVer && String(j.v) !== String(__lastVer)) {
        const st = await loadFromServer();
        // Giao dịch SePay mới → hiện thông báo nổi trên màn hình
        const payIds = ((st && st.payments) || []).map(p => p.id);
        if (__seenPayIds.size) {
          payIds.filter(id => !__seenPayIds.has(id)).slice(-3).forEach(id => {
            const p = (st.payments || []).find(x => x.id === id);
            if (p) toast(`💰 ${fmtMoney(p.amount)} vừa chuyển khoản — ${p.orderId ? (byId(st.orders, p.orderId) || {}).code || 'đã khớp đơn' : 'chưa khớp đơn, kiểm tra Thu chi'}`);
          });
        }
        payIds.forEach(id => __seenPayIds.add(id));
        adoptState(st);
        __lastVer = j.v;
        const mr = document.getElementById('modalRoot');
        const authShown = document.getElementById('authScreen').classList.contains('show');
        if (!authShown && (!mr || !mr.childElementCount) && currentUser()) render();
      } else if (!__lastVer) __lastVer = j.v;
    } catch (e) { }
  }, 15000);
}

async function pushState() {
  if (!__stateDirty) return;
  __stateDirty = false;
  // Gộp lựa chọn ❤ + ghi chú mà KHÁCH vừa bấm ở cổng khách hàng (tránh bị đè mất khi nhân viên lưu)
  if (Date.now() - __galleryTouchedAt > 180000) {
    try {
      const r = await fetch('/api/state?token=' + encodeURIComponent(API_TOKEN));
      if (r.ok) {
        const st = await r.json();
        ((st && st.bookings) || []).forEach(sb => {
          if (!sb.gallery || !sb.portalToken) return;
          const lb = state.bookings.find(x => x.id === sb.id);
          if (!lb || !lb.gallery) return;
          const sp = {}; (sb.gallery.photos || []).forEach(p => sp[p.id] = p);
          (lb.gallery.photos || []).forEach(p => {
            if (sp[p.id]) { p.selected = !!sp[p.id].selected; if (sp[p.id].note !== undefined) p.note = sp[p.id].note; }
          });
        });
      }
    } catch (e) { }
  }
  try {
    const r = await fetch('/api/state', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: API_TOKEN, state }),
    });
    const j = await r.json().catch(() => null);
    if (j && j.v) __lastVer = j.v;
    if (!r.ok && r.status !== 401) { __stateDirty = true; toast('⚠ Dữ liệu chưa đồng bộ lên server — sẽ thử lại khi bạn thao tác tiếp', 'error'); }
  } catch (e) { __stateDirty = true; }
}

function flushStateBeacon() {
  if (__stateDirty && SERVER_MODE && API_TOKEN && navigator.sendBeacon) {
    try {
      navigator.sendBeacon('/api/state', new Blob([JSON.stringify({ token: API_TOKEN, state })], { type: 'application/json' }));
      __stateDirty = false;
    } catch (e) { }
  }
}

/* Đổi thương hiệu Memento → Studio Manager cho dữ liệu cũ (chỉ khi còn giữ giá trị mẫu cũ)
   + cấp quyền Nhật ký cho các tài khoản quản trị cũ */
function migrateLegacy(parsed) {
  const p = parsed || {};
  let changed = false;
  if (state.settings.studioName === 'Memento Studio') { state.settings.studioName = 'Studio Manager'; changed = true; }
  if (state.settings.email === 'hello@mementostudio.vn') { state.settings.email = 'hello@studiomanager.vn'; changed = true; }
  state.staff.forEach(s => {
    if (/@mementostudio\.vn$/i.test(s.email || '')) {
      s.email = s.email.replace(/@mementostudio\.vn$/i, '@studiomanager.vn');
      changed = true;
    }
  });
  if (!Array.isArray(p.logs)) { state.logs = []; changed = true; }
  if (!Array.isArray(p.expenses)) { state.expenses = seedExpenses(); changed = true; }
  if (!Array.isArray(p.cash)) { state.cash = seedCash(); changed = true; }
  if (!p.shiftPlan) { state.shiftPlan = {}; changed = true; }
  if (!p.shiftNotes) { state.shiftNotes = {}; changed = true; }
  if (!Array.isArray(p.chats)) { state.chats = seedChats(); changed = true; }
  if (!Array.isArray(p.msgTemplates) || !p.msgTemplates.length) { state.msgTemplates = MSG_TEMPLATES.slice(); changed = true; }
  if (!Array.isArray(p.payments)) { state.payments = []; changed = true; }
  state.chats.forEach(c => {
    if (!c.status) { const last = (c.msgs[c.msgs.length - 1] || {}).from; c.status = last === 'me' ? 'replied' : 'pending'; changed = true; }
    if (!Array.isArray(c.tags)) { c.tags = []; changed = true; }
  });
  (state.users || []).forEach(u => { if (Array.isArray(u.perms) && u.perms.includes('shifts') && !u.perms.includes('shiftplan')) { u.perms.push('shiftplan'); changed = true; } });
  if (!Array.isArray(p.contracts)) { state.contracts = seedContracts(); state.contractSeq = 1003; changed = true; }
  else if (!p.contractSeq) state.contractSeq = 1003;
  if (!Array.isArray(p.payrolls)) { state.payrolls = []; changed = true; }
  if (!Array.isArray(p.attendance)) { state.attendance = seedAttendance(); changed = true; }
  if (!Array.isArray(p.departments)) { state.departments = []; changed = true; }
  if (!Array.isArray(p.roleGroups)) { state.roleGroups = []; changed = true; }
  if (!Array.isArray(p.notifications)) { state.notifications = []; changed = true; }
  if (!state.settings.notif) { state.settings.notif = defaultNotif(); changed = true; }
  if (!Array.isArray(p.branches) || !p.branches.length) {
    state.branches = seedBranches();
    ['bookings', 'staff', 'orders', 'expenses'].forEach(k => (state[k] || []).forEach(x => { if (!x.branchId) x.branchId = 'br1'; }));
    changed = true;
  }
  if (state.settings.workStart === undefined) { state.settings.workStart = '09:00'; changed = true; }
  if (state.settings.workEnd === undefined) { state.settings.workEnd = '18:00'; changed = true; }
  const SAL_DEF = { s1: [12000000, 5], s2: [10000000, 5], s3: [7000000, 0], s4: [9000000, 0] };
  state.staff.forEach(s => {
    const d0 = SAL_DEF[s.id] || [0, 0];
    if (s.salary === undefined) { s.salary = d0[0]; changed = true; }
    if (s.commissionPct === undefined) { s.commissionPct = d0[1]; changed = true; }
    if (s.payMode === undefined) {
      s.payMode = 'monthly'; s.hourlyRate = 0;
      if (s.id === 's3') { s.payMode = 'hourly'; s.hourlyRate = 45000; s.salary = 0; }
      changed = true;
    }
  });
  (state.users || []).forEach(u => {
    if (Array.isArray(u.perms) && u.perms.includes('accounts')) {
      ['logs', 'finance', 'contracts', 'attendance', 'notifications', 'albums', 'photofilter', 'shiftplan', 'changelog', 'chats'].forEach(pm => {
        if (!u.perms.includes(pm)) { u.perms.push(pm); changed = true; }
      });
    }
  });
  if (changed) save();
}

function adoptState(parsed) {
  const noTasks = !Array.isArray(parsed.taskColumns);
  const noWardrobe = !Array.isArray(parsed.outfits);
  state = Object.assign(blankState(), parsed);
  state.settings = Object.assign(blankState().settings, parsed.settings || {});
  if (noTasks) {
    state.taskColumns = defaultTaskColumns();
    state.tasks = sampleTasks();
  }
  if (noWardrobe) {
    state.outfits = seedOutfits();
    state.concepts = seedConcepts();
    state.loans = seedLoans();
  }
  if (!Array.isArray(parsed.users)) state.users = [];
  migrateLegacy(parsed);
  if (noTasks || noWardrobe) save();
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.customers)) { adoptState(parsed); return; }
    }
  } catch (e) { /* dữ liệu hỏng → dùng dữ liệu mẫu */ }
  state = seedData();
  save();
}

/* ================= SEED DATA ================= */
function seedData() {
  const customers = [
    { id: 'c1', name: 'Nguyễn Minh Anh', type: 'individual', phone: '0901 234 567', email: 'minhanh@gmail.com', address: '12 Lê Lợi, Q.1, TP.HCM', notes: 'Khách VIP — thích tông ảnh pastel.', createdAt: dOff(-120) },
    { id: 'c2', name: 'Trần Quốc Bảo', type: 'individual', phone: '0913 456 789', email: 'quocbao@gmail.com', address: '45 Nguyễn Văn Trỗi, Phú Nhuận', notes: '', createdAt: dOff(-95) },
    { id: 'c3', name: 'Lê Thị Hồng Nhung', type: 'individual', phone: '0978 321 654', email: 'nhung.le@gmail.com', address: '8 Trần Hưng Đạo, Q.5', notes: 'Cần xuất hóa đơn VAT.', createdAt: dOff(-80) },
    { id: 'c4', name: 'Phạm Đức Thịnh', type: 'individual', phone: '0903 777 888', email: 'ducthinh@gmail.com', address: '23 Điện Biên Phủ, Bình Thạnh', notes: '', createdAt: dOff(-60) },
    { id: 'c5', name: 'Hoàng Thu Hà', type: 'individual', phone: '0918 222 333', email: 'thuha@gmail.com', address: '56 Xô Viết Nghệ Tĩnh, Bình Thạnh', notes: 'Khách quen, chụp gia đình định kỳ.', createdAt: dOff(-45) },
    { id: 'c6', name: 'Cty TNHH Đạt Phát', type: 'company', phone: '0935 123 456', email: 'contact@datphat.vn', address: '101 Tân Sơn Nhì, Tân Phú', notes: 'Đối tác thương mại điện tử — chụp sản phẩm theo đợt.', createdAt: dOff(-50) },
    { id: 'c7', name: 'Ngô Bảo Châu', type: 'individual', phone: '0966 555 444', email: 'baochau@gmail.com', address: '34 Ba Tháng Hai, Q.10', notes: '', createdAt: dOff(-30) },
    { id: 'c8', name: 'Đặng Khánh Linh', type: 'individual', phone: '0948 999 111', email: 'khanhlinh@gmail.com', address: '78 Ung Văn Khiêm, Bình Thạnh', notes: 'Cưới tháng 12 — khách quan tâm album da.', createdAt: dOff(-18) },
    { id: 'c9', name: 'Bùi Tiến Dũng', type: 'individual', phone: '0907 654 987', email: 'tiendung@gmail.com', address: '9 Pasteur, Q.3', notes: '', createdAt: dOff(-6) },
    { id: 'c10', name: 'Cty Hoa Phượng Đỏ', type: 'company', phone: '0916 321 123', email: 'marketing@hoaphuong.vn', address: '220 Điện Biên Phủ, Q.1', notes: 'Chụp sự kiện khai trương chi nhánh.', createdAt: dOff(-3) },
  ];

  const packages = [
    { id: 'p1', name: 'Cưới — Eternal Love', category: 'Cưới', price: 15000000, hours: 8, active: true, includes: '200 ảnh chỉnh sửa cao cấp|Album da cao cấp 30×30|Phóng ảnh 60×90|2 nhiếp ảnh gia|Trang điểm & làm tóc cô dâu|Đồ phông & phụ kiện' },
    { id: 'p2', name: 'Cưới — Sweet Moments', category: 'Cưới', price: 8500000, hours: 6, active: true, includes: '120 ảnh chỉnh sửa|Album premium 25×30|Phóng ảnh 40×60|1 nhiếp ảnh gia|Trang điểm cô dâu' },
    { id: 'p3', name: 'Gia đình — Home Sweet Home', category: 'Gia đình', price: 2500000, hours: 2, active: true, includes: '60 ảnh chỉnh sửa|1 bộ ảnh treo tường 30×40|Tối đa 6 thành viên|Backdrop đa dạng' },
    { id: 'p4', name: 'Chân dung — Portrait Pro', category: 'Chân dung', price: 800000, hours: 1, active: true, includes: '20 ảnh chỉnh sửa|5 ảnh retouch cấp cao|Tối đa 2 trang phục|Dùng cho CV & LinkedIn' },
    { id: 'p5', name: 'Sản phẩm — E-commerce Basic', category: 'Sản phẩm', price: 1500000, hours: 2, active: true, includes: '20 ảnh sản phẩm|Tẩy phông trắng|Chỉnh màu chuẩn web|Bàn chụp chuyên dụng' },
    { id: 'p6', name: 'Sự kiện — Event Coverage', category: 'Sự kiện', price: 5000000, hours: 4, active: true, includes: '150 ảnh chỉnh sửa|2 nhiếp ảnh gia|Ảnh gửi nhanh trong 24h|Video highlight 60s' },
    { id: 'p7', name: 'Mẹ & Bé — Mom & Baby', category: 'Gia đình', price: 3200000, hours: 2, active: true, includes: '50 ảnh chỉnh sửa|Đạo cụ & trang phục baby|Phòng chụp riêng ấm áp' },
    { id: 'p8', name: 'Thời trang — Lookbook', category: 'Chân dung', price: 6000000, hours: 5, active: true, includes: '80 ảnh chỉnh sửa|Set dựng concept|1 ekip 3 người|Gợi ý concept theo thương hiệu' },
  ];

  const staff = [
    { id: 's1', name: 'Lê Hoàng Nam', role: 'photographer', phone: '0912 345 678', email: 'nam.le@studiomanager.vn', active: true, salary: 12000000, commissionPct: 5 },
    { id: 's2', name: 'Phạm Thu Trang', role: 'photographer', phone: '0987 654 321', email: 'trang.pt@studiomanager.vn', active: true, salary: 10000000, commissionPct: 5, branchId: 'br2' },
    { id: 's3', name: 'Đỗ Minh Quân', role: 'assistant', phone: '0905 111 222', email: 'quan.dm@studiomanager.vn', active: true, salary: 0, commissionPct: 0, payMode: 'hourly', hourlyRate: 45000 },
    { id: 's4', name: 'Vũ Hà Chi', role: 'editor', phone: '0936 888 999', email: 'chi.vh@studiomanager.vn', active: true, salary: 9000000, commissionPct: 0 },
  ];

  const bookings = [
    { id: 'b1', customerId: 'c1', packageId: 'p1', date: dOff(-45), startTime: '07:30', hours: 8, location: 'Đà Lạt (ngoại cảnh)', photographerId: 's1', status: 'delivered', notes: 'Bộ ảnh cưới chính, khách ưu tiên ánh sáng sớm.', createdAt: dOff(-52) },
    { id: 'b2', customerId: 'c5', packageId: 'p3', date: dOff(-30), startTime: '09:00', hours: 2, location: 'Studio 1', photographerId: 's2', status: 'delivered', notes: '', createdAt: dOff(-36) },
    { id: 'b3', customerId: 'c7', packageId: 'p4', date: dOff(-18), startTime: '15:00', hours: 1, location: 'Studio 2', photographerId: 's1', status: 'delivered', notes: '', createdAt: dOff(-24) },
    { id: 'b4', customerId: 'c6', packageId: 'p5', date: dOff(-12), startTime: '10:00', hours: 2, location: 'Phòng chụp sản phẩm', photographerId: 's2', status: 'delivered', notes: 'Bộ 40 sản phẩm nến thơm.', createdAt: dOff(-20) },
    { id: 'b5', customerId: 'c4', packageId: 'p7', date: dOff(-10), startTime: '09:30', hours: 2, location: 'Phòng Mẹ & Bé', photographerId: 's2', status: 'delivered', notes: '', createdAt: dOff(-16) },
    { id: 'b6', customerId: 'c10', packageId: 'p6', date: dOff(-7), startTime: '18:00', hours: 4, location: 'White Palace, Q.10', photographerId: 's1', status: 'cancelled', notes: 'Khách dời lịch, chưa chốt lại.', createdAt: dOff(-14) },
    { id: 'b7', customerId: 'c8', packageId: 'p2', date: dOff(-5), startTime: '06:00', hours: 6, location: 'Biển Vũng Tàu (ngoại cảnh)', photographerId: 's1', status: 'editing', notes: 'Bình minh + hoàng hôn, 2 buổi.', createdAt: dOff(-30) },
    { id: 'b8', customerId: 'c3', packageId: 'p8', date: dOff(-2), startTime: '13:00', hours: 5, location: 'Studio Concept', photographerId: 's2', status: 'editing', notes: 'Lookbook BST thu đông cho shop thời trang.', createdAt: dOff(-12) },
    { id: 'b9', customerId: 'c7', packageId: 'p4', date: dOff(0), startTime: '14:00', hours: 1, location: 'Studio 2', photographerId: 's1', status: 'confirmed', notes: 'Chụp ảnh profile mới.', createdAt: dOff(-4) },
    { id: 'b10', customerId: 'c5', packageId: 'p3', date: dOff(2), startTime: '09:00', hours: 2, location: 'Studio 1', photographerId: 's2', status: 'confirmed', notes: 'Gia đình 3 thế hệ, 8 người.', createdAt: dOff(-5) },
    { id: 'b11', customerId: 'c9', packageId: 'p2', date: dOff(4), startTime: '06:30', hours: 6, location: 'Đà Lạt (ngoại cảnh)', photographerId: 's1', status: 'pending', notes: 'Cần tư vấn trang phục cưới.', createdAt: dOff(-3) },
    { id: 'b12', customerId: 'c3', packageId: 'p4', date: dOff(7), startTime: '16:00', hours: 1, location: 'Studio 2', photographerId: 's2', status: 'pending', notes: 'Chân dung cặp đôi.', createdAt: dOff(-1) },
    { id: 'b13', customerId: 'c10', packageId: 'p6', date: dOff(9), startTime: '17:00', hours: 4, location: 'Showroom Hoa Phượng Đỏ, Q.1', photographerId: 's1', status: 'confirmed', notes: 'Khai trương chi nhánh mới.', createdAt: dOff(-2) },
    { id: 'b14', customerId: 'c6', packageId: 'p5', date: dOff(12), startTime: '10:00', hours: 3, location: 'Phòng chụp sản phẩm', photographerId: 's2', status: 'pending', notes: 'BST giáng sinh — khoảng 60 SKU.', createdAt: dOff(-2) },
    { id: 'b15', customerId: 'c2', packageId: 'p1', date: dOff(16), startTime: '07:00', hours: 8, location: 'Hội An (ngoại cảnh)', photographerId: 's1', status: 'confirmed', notes: 'Cưới chính — cần đặt vé máy bay sớm.', createdAt: dOff(-9) },
    { id: 'b16', customerId: 'c8', packageId: 'p7', date: dOff(21), startTime: '09:30', hours: 2, location: 'Phòng Mẹ & Bé', photographerId: 's2', status: 'pending', notes: '', createdAt: dOff(-1) },
    { id: 'b17', customerId: 'c1', packageId: 'p3', date: dOff(25), startTime: '15:00', hours: 2, location: 'Studio 1', photographerId: 's2', status: 'pending', notes: 'Ảnh gia đình đón Tết.', createdAt: dOff(0) },
  ];

  const b7 = bookings.find(b => b.id === 'b7');
  b7.portalToken = 'linh2026';
  b7.gallery = {
    allowSelect: true,
    photos: Array.from({ length: 12 }, (_, i) => ({ id: 'gp' + (i + 1), code: 'A' + pad(i + 1), name: 'Ảnh chụp ' + pad(i + 1), selected: i < 3 })),
  };
  bookings.forEach(b => { if (!b.branchId) b.branchId = 'br1'; });
  ['b10', 'b12', 'b13'].forEach(id => { const x = bookings.find(b => b.id === id); if (x) x.branchId = 'br2'; });

  const orders = [
    { id: 'o10', code: 'DH-0992', customerId: 'c2', bookingId: null, items: [{ name: 'Thời trang — Lookbook', qty: 1, price: 6000000 }], discount: 0, paidAmount: 6000000, status: 'completed', notes: 'Lookbook shop thời trang nam.', createdAt: dOff(-150) },
    { id: 'o11', code: 'DH-0993', customerId: 'c3', bookingId: null, items: [{ name: 'Chân dung — Portrait Pro', qty: 1, price: 800000 }, { name: 'Ảnh chỉnh sửa thêm', qty: 5, price: 50000 }], discount: 0, paidAmount: 1050000, status: 'completed', notes: '', createdAt: dOff(-125) },
    { id: 'o12', code: 'DH-0994', customerId: 'c1', bookingId: null, items: [{ name: 'Mẹ & Bé — Mom & Baby', qty: 1, price: 3200000 }], discount: 0, paidAmount: 3200000, status: 'completed', notes: '', createdAt: dOff(-100) },
    { id: 'o13', code: 'DH-0995', customerId: 'c6', bookingId: null, items: [{ name: 'Sản phẩm — E-commerce Basic', qty: 3, price: 1500000 }], discount: 0, paidAmount: 4500000, status: 'completed', notes: 'Đợt chụp tháng 7.', createdAt: dOff(-80) },
    { id: 'o14', code: 'DH-0996', customerId: 'c4', bookingId: null, items: [{ name: 'Gia đình — Home Sweet Home', qty: 1, price: 2500000 }], discount: 0, paidAmount: 2500000, status: 'completed', notes: '', createdAt: dOff(-60) },
    { id: 'o15', code: 'DH-0997', customerId: 'c5', bookingId: null, items: [{ name: 'Chân dung — Portrait Pro', qty: 2, price: 800000 }], discount: 0, paidAmount: 1600000, status: 'completed', notes: '', createdAt: dOff(-42) },
    { id: 'o16', code: 'DH-0998', customerId: 'c2', bookingId: null, items: [{ name: 'Sự kiện — Event Coverage', qty: 1, price: 5000000 }], discount: 0, paidAmount: 5000000, status: 'completed', notes: 'Tiệc sinh nhật công ty.', createdAt: dOff(-28) },
    { id: 'o17', code: 'DH-0999', customerId: 'c7', bookingId: null, items: [{ name: 'Sản phẩm — E-commerce Basic', qty: 1, price: 1500000 }], discount: 0, paidAmount: 1500000, status: 'completed', notes: '', createdAt: dOff(-15) },
    { id: 'o1', code: 'DH-1001', customerId: 'c1', bookingId: 'b1', items: [{ name: 'Cưới — Eternal Love', qty: 1, price: 15000000 }, { name: 'Album thêm 30 trang', qty: 1, price: 2000000 }, { name: 'Phóng ảnh 60×90', qty: 1, price: 800000 }], discount: 300000, paidAmount: 17500000, status: 'completed', notes: '', createdAt: dOff(-45) },
    { id: 'o2', code: 'DH-1002', customerId: 'c5', bookingId: 'b2', items: [{ name: 'Gia đình — Home Sweet Home', qty: 1, price: 2500000 }, { name: 'Ảnh chỉnh sửa thêm', qty: 10, price: 50000 }], discount: 0, paidAmount: 3000000, status: 'completed', notes: '', createdAt: dOff(-30) },
    { id: 'o3', code: 'DH-1003', customerId: 'c7', bookingId: 'b3', items: [{ name: 'Chân dung — Portrait Pro', qty: 1, price: 800000 }], discount: 0, paidAmount: 800000, status: 'completed', notes: '', createdAt: dOff(-18) },
    { id: 'o4', code: 'DH-1004', customerId: 'c6', bookingId: 'b4', items: [{ name: 'Sản phẩm — E-commerce Basic', qty: 2, price: 1500000 }], discount: 0, paidAmount: 1500000, status: 'completed', notes: 'Còn nợ 1 đợt chụp.', createdAt: dOff(-12) },
    { id: 'o5', code: 'DH-1005', customerId: 'c4', bookingId: 'b5', items: [{ name: 'Mẹ & Bé — Mom & Baby', qty: 1, price: 3200000 }], discount: 0, paidAmount: 3200000, status: 'completed', notes: '', createdAt: dOff(-10) },
    { id: 'o6', code: 'DH-1006', customerId: 'c8', bookingId: 'b7', items: [{ name: 'Cưới — Sweet Moments', qty: 1, price: 8500000 }, { name: 'Trang điểm & làm tóc', qty: 1, price: 1000000 }], discount: 500000, paidAmount: 4500000, status: 'confirmed', notes: 'Đã cọc 50%.', createdAt: dOff(-5) },
    { id: 'o7', code: 'DH-1007', customerId: 'c9', bookingId: 'b11', items: [{ name: 'Cưới — Sweet Moments', qty: 1, price: 8500000 }], discount: 0, paidAmount: 0, status: 'confirmed', notes: 'Chưa cọc, nhắc trước 3 ngày.', createdAt: dOff(-3) },
    { id: 'o8', code: 'DH-1008', customerId: 'c3', bookingId: 'b12', items: [{ name: 'Chân dung — Portrait Pro', qty: 2, price: 800000 }], discount: 0, paidAmount: 0, status: 'confirmed', notes: '', createdAt: dOff(-1) },
    { id: 'o9', code: 'DH-1009', customerId: 'c10', bookingId: 'b13', items: [{ name: 'Sự kiện — Event Coverage', qty: 1, price: 5000000 }], discount: 0, paidAmount: 2500000, status: 'confirmed', notes: 'Cọc 50%, còn lại sau sự kiện.', createdAt: dOff(-2) },
  ];

  return {
    customers, packages, bookings, orders, staff,
    taskColumns: defaultTaskColumns(), tasks: sampleTasks(),
    outfits: seedOutfits(), concepts: seedConcepts(), loans: seedLoans(),
    users: [],
    logs: [],
    expenses: seedExpenses(), payrolls: [], contracts: seedContracts(), cash: seedCash(),
    attendance: seedAttendance(),
    departments: [
      { id: 'dp1', name: 'Kinh doanh & CSKH' },
      { id: 'dp2', name: 'Nhiếp ảnh' },
      { id: 'dp3', name: 'Hậu kỳ' },
    ],
    roleGroups: [],
    notifications: [],
    branches: seedBranches(),
    contractSeq: 1003,
    orderSeq: 1010,
    settings: {
      studioName: 'Studio Manager',
      phone: '028 3822 1188',
      email: 'hello@studiomanager.vn',
      address: '45 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
      workStart: '09:00',
      workEnd: '18:00',
      pushOn: false,
      autoBackup: false,
      lastBackupAt: '',
      aiApiKey: '',
      bank: { code: 'TCB', accountNo: '19036812345678', accountName: 'CONG TY TNHH STUDIO MANAGER' },
    },
  };
}

/* ================= TOAST & MODAL ================= */
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${icon(type === 'success' ? 'check' : 'alert')}<span>${esc(msg)}</span>`;
  $('#toastRoot').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2600);
}

function openModal(html, size = '') {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal ${size}" onclick="event.stopPropagation()">${html}</div>`;
  root.classList.add('show');
  root.onclick = () => closeModal();
}

function closeModal() {
  const root = $('#modalRoot');
  root.classList.remove('show');
  root.innerHTML = '';
}

let __confirmCb = null;
function confirmDialog(title, msg, okLabel, onOk, danger = true) {
  __confirmCb = onOk;
  openModal(`
    <div class="modal-body" style="text-align:center; padding:32px 28px 24px;">
      <div class="empty-icon" style="margin:0 auto 14px; ${danger ? 'background:#fef2f2;color:#ef4444;' : 'background:#eef2ff;color:#6366f1;'}">${icon('alert')}</div>
      <h3 style="font-size:16px;font-weight:800;margin-bottom:6px;">${esc(title)}</h3>
      <p style="font-size:13px;color:var(--text-2);line-height:1.55;">${msg}</p>
    </div>
    <div class="modal-foot" style="justify-content:center;border:none;padding-top:0;">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" onclick="runConfirm()">${esc(okLabel || 'Xác nhận')}</button>
    </div>`, 'sm');
}
function runConfirm() {
  const cb = __confirmCb; __confirmCb = null;
  closeModal();
  if (cb) cb();
}

/* ================= ROUTER & RENDER ================= */
const VIEWS = {
  dashboard: { html: dashboardView },
  bookings: { html: bookingsView },
  orders: { html: ordersView },
  finance: { html: financeView },
  contracts: { html: contractsView },
  tasks: { html: tasksView },
  attendance: { html: attendanceView },
  shiftplan: { html: shiftplanView },
  albums: { html: albumsView },
  photofilter: { html: photofilterView },
  wardrobe: { html: wardrobeView },
  accounts: { html: accountsView },
  notifications: { html: notificationsView },
  logs: { html: logsView },
  changelog: { html: changelogView },
  chats: { html: chatsView },
  customers: { html: customersView },
  packages: { html: packagesView },
  staff: { html: staffView },
  settings: { html: settingsView },
};

function navigate(view) {
  if (!VIEWS[view] || !can(view)) return;
  currentView = view;
  document.body.classList.remove('nav-open');
  if (location.hash !== '#' + view) location.hash = view;
  render();
  window.scrollTo(0, 0);
}

function toggleSidebar() { document.body.classList.toggle('nav-open'); }

function render() {
  if (!currentUser()) return;
  if (!can(currentView)) currentView = firstView() || 'dashboard';
  renderNav();
  fillBranchSel();
  const t = TITLES[currentView] || ['', ''];
  $('#pageTitle').textContent = t[0];
  $('#pageSub').textContent = t[1];
  $('#sideStudioName').textContent = state.settings.studioName;
  $('#view').innerHTML = VIEWS[currentView].html();
  renderTopbarAttendance();
  if (location.hash !== '#' + currentView) {
    try { history.replaceState(null, '', '#' + currentView); } catch (e) { /* file:// */ }
  }
}

/* ================= BUSINESS CALC ================= */
const orderSubtotal = o => o.items.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);
const orderTotal = o => Math.max(0, orderSubtotal(o) - (+o.discount || 0));
const orderRemaining = o => Math.max(0, orderTotal(o) - (+o.paidAmount || 0));
function payStatus(o) {
  const total = orderTotal(o);
  if (total <= 0) return 'unpaid';
  if ((+o.paidAmount || 0) >= total) return 'paid';
  return (+o.paidAmount || 0) > 0 ? 'deposit' : 'unpaid';
}
const PAY_LABEL = { paid: 'Đã thanh toán', deposit: 'Đã cọc', unpaid: 'Chưa thanh toán' };

function monthKey(offset = 0) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function revenueOfMonth(key) {
  return state.orders
    .filter(o => o.status !== 'cancelled' && (o.createdAt || '').startsWith(key) && branchMatch(o))
    .reduce((s, o) => s + (+o.paidAmount || 0), 0);
}
function spentOf(custId) {
  return state.orders.filter(o => o.customerId === custId && o.status !== 'cancelled')
    .reduce((s, o) => s + orderTotal(o), 0);
}
function debtOf(custId) {
  return state.orders.filter(o => o.customerId === custId && o.status !== 'cancelled')
    .reduce((s, o) => s + orderRemaining(o), 0);
}
function totalDebt() {
  return state.orders.filter(o => o.status !== 'cancelled' && branchMatch(o)).reduce((s, o) => s + orderRemaining(o), 0);
}
function upcomingBookings(days = 7) {
  const from = todayStr(), to = dOff(days);
  return state.bookings
    .filter(b => b.status !== 'cancelled' && b.date >= from && b.date <= to && branchMatch(b))
    .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
}
function orderOfBooking(bookingId) { return state.orders.find(o => o.bookingId === bookingId) || null; }

/* ================= VIEW: DASHBOARD ================= */
function dashboardView() {
  const key = monthKey(0);
  const revThis = revenueOfMonth(key);
  const revPrev = revenueOfMonth(monthKey(-1));
  const delta = revPrev > 0 ? Math.round((revThis - revPrev) / revPrev * 100) : null;
  const bkMonth = state.bookings.filter(b => (b.date || '').startsWith(key) && b.status !== 'cancelled' && branchMatch(b)).length;
  const newCust = state.customers.filter(c => (c.createdAt || '').startsWith(key)).length;
  const debt = totalDebt();
  const upcoming = upcomingBookings(7).slice(0, 6);
  const recentOrders = [...state.orders].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const k = monthKey(-i);
    months.push({ label: 'T' + (+k.split('-')[1]), val: revenueOfMonth(k) });
  }
  const maxRev = Math.max(...months.map(m => m.val), 1);

  const hr = new Date().getHours();
  const hello = hr < 11 ? 'Chào buổi sáng' : hr < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const cu = currentUser() || { name: 'Studio' };
  const dToday = todayStr();
  const bkToday = state.bookings.filter(b => b.date === dToday && b.status !== 'cancelled' && branchMatch(b));
  const heroLine = bkToday.length
    ? `Hôm nay có <b>${bkToday.length} buổi chụp</b>${bkToday[0].startTime ? ' · bắt đầu lúc ' + esc(bkToday[0].startTime) : ''} — ${esc(custName(bkToday[0].customerId))}`
    : 'Hôm nay không có lịch chụp — cả studio yên bình.';

  return `
  <div class="dash-hero">
    <div class="dash-hero-txt">
      <div class="dash-kicker">${esc(state.settings.studioName)} · ${WD[new Date().getDay()]}, ${fmtDate(dToday)}</div>
      <h2>${hello}, ${esc(cu.name || 'Studio')} 👋</h2>
      <div class="dash-hero-line">${icon('camera')} ${heroLine}</div>
    </div>
    <div class="dash-hero-actions">
      <button class="btn btn-gold" onclick="openCustomerModal()">${icon('plus')} Khách hàng</button>
      <button class="btn btn-dark-ghost" onclick="openBookingModal()">${icon('calendar')} Lịch chụp</button>
      <button class="btn btn-dark-ghost" onclick="navigate('finance')">${icon('money')} Tài chính</button>
    </div>
  </div>

  <div class="stat-grid">
    ${statCard('money', 'tint-indigo', fmtMoney(revThis), 'Doanh thu tháng này',
      delta === null ? `<span class="stat-sub muted">${icon('clock')} Tháng ${key.split('-')[1]}/${key.split('-')[0]}</span>`
      : `<span class="stat-sub ${delta >= 0 ? 'up' : 'down'}">${icon(delta >= 0 ? 'arrow-up' : 'arrow-down')} ${Math.abs(delta)}% so với tháng trước</span>`)}
    ${statCard('calendar', 'tint-blue', bkMonth, 'Lịch chụp tháng này', `<span class="stat-sub muted">${upcoming.length} lịch trong 7 ngày tới</span>`)}
    ${statCard('users', 'tint-green', newCust, 'Khách hàng mới', `<span class="stat-sub muted">Tổng cộng ${state.customers.length} khách</span>`)}
    ${statCard('alert', 'tint-red', fmtMoney(debt), 'Công nợ phải thu', `<span class="stat-sub muted">${state.orders.filter(o => o.status !== 'cancelled' && orderRemaining(o) > 0).length} đơn chưa thanh toán đủ</span>`)}
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-head"><h3>Doanh thu 6 tháng gần nhất</h3><span class="right badge b-deposit">Đã thu</span></div>
      <div class="card-pad">
        <div class="chart">
          ${months.map((m, i) => `
          <div class="bar-col" title="${m.label}: ${fmtMoney(m.val)}">
            <div class="bar-val${i === months.length - 1 ? ' cur' : ''}">${m.val > 0 ? fmtShort(m.val) : ''}</div>
            <div class="bar${i === months.length - 1 ? ' cur' : ''}" style="height:${Math.max(3, Math.round(m.val / maxRev * 100))}%"></div>
            <div class="bar-lbl">${m.label}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Lịch chụp sắp tới</h3><span class="right badge b-confirmed">7 ngày tới</span></div>
      ${upcoming.length ? upcoming.map(b => {
        const [y, m, d] = b.date.split('-');
        return `
        <div class="upcoming-item">
          <div class="upcoming-date"><div class="d">${+d}</div><div class="m">T${+m}</div></div>
          <div class="upcoming-info">
            <b>${esc(custName(b.customerId))} — ${esc(pkgName(b.packageId))}</b>
            <span>${icon('clock')} ${b.startTime || '?'}${b.hours ? ' · ' + b.hours + 'h' : ''} &nbsp;${icon('pin')} ${esc(b.location || '—')}</span>
          </div>
          <span class="badge b-${b.status}">${BK_STATUS[b.status].label}</span>
        </div>`;
      }).join('') : `<div class="empty">${iconWrap('calendar')}<h4>Không có lịch chụp nào</h4><p>7 ngày tới rảnh rang.</p></div>`}
    </div>
  </div>

  <div class="card list-wrap">
    <div class="card-head"><h3>Đơn hàng gần đây</h3>
      <button class="right btn btn-ghost btn-sm" onclick="navigate('orders')">Xem tất cả</button>
    </div>
    <div class="table-wrap">
    <table>
      <thead><tr><th>Mã ĐH</th><th>Khách hàng</th><th>Ngày tạo</th><th class="ta-r">Tổng tiền</th><th class="ta-r">Còn lại</th><th>Thanh toán</th><th></th></tr></thead>
      <tbody>
      ${recentOrders.map(o => `
        <tr>
          <td class="cell-main">${esc(o.code)}</td>
          <td>${esc(custName(o.customerId))}</td>
          <td class="money-muted">${fmtDate(o.createdAt)}</td>
          <td class="money ta-r">${fmtMoney(orderTotal(o))}</td>
          <td class="${orderRemaining(o) > 0 ? 'money-red' : 'money-muted'} ta-r">${fmtMoney(orderRemaining(o))}</td>
          <td><span class="badge b-${payStatus(o)}">${PAY_LABEL[payStatus(o)]}</span></td>
          <td class="cell-actions"><button class="icon-btn" title="Xem chi tiết" onclick="viewOrder('${o.id}')">${icon('eye')}</button></td>
        </tr>`).join('') || emptyRow(7, 'Chưa có đơn hàng nào')}
      </tbody>
    </table>
    </div>
  </div>`;
}

function statCard(ic, tint, val, label, sub) {
  return `<div class="card stat-card ${tint}">
    <div class="stat-icon ${tint}">${icon(ic)}</div>
    <div class="stat-label">${label}</div>
    <div class="stat-val">${val}</div>
    ${sub || ''}
  </div>`;
}
function iconWrap(ic) { return `<div class="empty-icon">${icon(ic)}</div>`; }
function emptyRow(colspan, msg, btnHtml = '') {
  return `<tr><td colspan="${colspan}" class="td-empty"><div class="empty" style="padding:12px 0;">${iconWrap('search')}<h4>${esc(msg)}</h4>${btnHtml}</div></td></tr>`;
}

/* ================= VIEW: CUSTOMERS ================= */
function customersView() {
  return `
  <div class="toolbar">
    <div class="search-box">${icon('search')}<input class="input" id="custSearch" placeholder="Tìm theo tên, SĐT, email..." value="${esc(viewState.customers.q)}" oninput="onCustomerSearch(this.value)"></div>
    <select class="select" style="width:auto" onchange="viewState.customers.type=this.value;renderCustRows()">
      <option value="all" ${viewState.customers.type === 'all' ? 'selected' : ''}>Tất cả khách</option>
      <option value="individual" ${viewState.customers.type === 'individual' ? 'selected' : ''}>Cá nhân</option>
      <option value="company" ${viewState.customers.type === 'company' ? 'selected' : ''}>Doanh nghiệp</option>
    </select>
    <select class="select" style="width:auto" title="Xem theo tháng" onchange="viewState.customers.month=this.value;renderCustRows()">
      ${monthOptions(viewState.customers.month, state.customers.map(c => c.createdAt))}
    </select>
    <span class="badge b-khac" id="custSum">${custSumText()}</span>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openCustomerModal()">${icon('plus')} Thêm khách hàng</button>
  </div>
  <div class="card list-wrap">
    <div class="table-wrap">
    <table>
      <thead><tr><th>Khách hàng</th><th>Số điện thoại</th><th>Email</th><th class="ta-c">Lịch chụp</th><th class="ta-r">Tổng chi tiêu</th><th class="ta-c">Thao tác</th></tr></thead>
      <tbody id="custRows">${custRows()}</tbody>
    </table>
    </div>
  </div>`;
}

// Dropdown chọn tháng (từ dữ liệu thật + năm hiện tại), 'YYYY-MM' hoặc '' = tất cả
function monthOptions(sel, dates) {
  const ys = [...new Set([...dates.map(d => (d || '').slice(0, 4)).filter(Boolean), String(new Date().getFullYear())])].sort().reverse();
  let html = `<option value="" ${!sel ? 'selected' : ''}>Mọi tháng</option>`;
  ys.forEach(y => { for (let m = 12; m >= 1; m--) { const v = y + '-' + String(m).padStart(2, '0'); html += `<option value="${v}" ${sel === v ? 'selected' : ''}>Tháng ${m}/${y}</option>`; } });
  return html;
}

function custFiltered() {
  const { q, type, month } = viewState.customers;
  const ql = q.trim().toLowerCase();
  return state.customers
    .filter(c => type === 'all' || c.type === type)
    .filter(c => !month || (c.createdAt || '').startsWith(month))
    .filter(c => !ql || [c.name, c.phone, c.email, c.address].some(v => String(v || '').toLowerCase().includes(ql)))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function custSumText() {
  const list = custFiltered();
  const spend = list.reduce((s, c) => s + spentOf(c.id), 0);
  return `${list.length} khách${viewState.customers.month ? ' trong tháng ' + (+viewState.customers.month.slice(5)) + '/' + viewState.customers.month.slice(0, 4) : ''} · chi tiêu ${fmtShort(spend)}₫`;
}

function custRows() {
  const list = custFiltered();
  if (!list.length) return emptyRow(6, viewState.customers.month ? 'Không có khách hàng nào trong tháng này' : 'Không tìm thấy khách hàng nào');
  return list.map(c => {
    const bks = state.bookings.filter(b => b.customerId === c.id).length;
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:11px;">
        <div class="avatar" style="width:34px;height:34px;font-size:11.5px;">${esc(initials(c.name))}</div>
        <div><a class="link" onclick="viewCustomer('${c.id}')">${esc(c.name)}</a>
          <div class="cell-sub">${c.type === 'company' ? 'Doanh nghiệp' : 'Khách lẻ'}</div></div>
      </div></td>
      <td class="money-muted">${esc(c.phone || '—')}</td>
      <td class="money-muted">${esc(c.email || '—')}</td>
      <td class="ta-c money-muted">${bks}</td>
      <td class="money ta-r">${fmtMoney(spentOf(c.id))}</td>
      <td class="cell-actions ta-c">
        <button class="icon-btn" title="Xem" onclick="viewCustomer('${c.id}')">${icon('eye')}</button>
        <button class="icon-btn" title="Sửa" onclick="openCustomerModal('${c.id}')">${icon('edit')}</button>
        <button class="icon-btn danger" title="Xóa" onclick="deleteCustomer('${c.id}')">${icon('trash')}</button>
      </td>
    </tr>`;
  }).join('');
}

function onCustomerSearch(v) {
  viewState.customers.q = v;
  renderCustRows();
}

function renderCustRows() {
  const tb = $('#custRows'); if (tb) tb.innerHTML = custRows();
  const sum = $('#custSum'); if (sum) sum.textContent = custSumText();
}

function openCustomerModal(id) {
  const c = id ? byId(state.customers, id) : null;
  const opt = (val, sel) => `<option value="${val}" ${sel ? 'selected' : ''}>${val === 'individual' ? 'Khách lẻ (cá nhân)' : 'Doanh nghiệp'}</option>`;
  openModal(`
    <div class="modal-head"><h3>${c ? 'Sửa khách hàng' : 'Thêm khách hàng'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field"><label>Họ và tên / Tên công ty <span class="req">*</span></label><input class="input" name="name" required value="${esc(c ? c.name : '')}" placeholder="VD: Nguyễn Văn A"></div>
      <div class="field"><label>Loại khách</label><select class="select" name="type">${opt('individual', !c || c.type === 'individual')}${opt('company', c && c.type === 'company')}</select></div>
      <div class="field"><label>Số điện thoại <span class="req">*</span></label><input class="input" name="phone" required value="${esc(c ? c.phone : '')}" placeholder="09xx xxx xxx"></div>
      <div class="field"><label>Email</label><input class="input" name="email" type="email" value="${esc(c ? c.email : '')}" placeholder="email@domain.com"></div>
      <div class="field full"><label>Địa chỉ</label><input class="input" name="address" value="${esc(c ? c.address : '')}" placeholder="Số nhà, đường, quận..."></div>
      <div class="field full"><label>Ghi chú</label><textarea class="textarea" name="notes" placeholder="Sở thích, yêu cầu riêng của khách...">${esc(c ? c.notes : '')}</textarea></div>
    </form>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveCustomer('${id || ''}')">${icon('check')} Lưu</button>
    </div>`);
  setTimeout(() => { const el = $('#frm [name=name]'); if (el) el.focus(); }, 60);
}

function saveCustomer(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const data = {
    name: fd.get('name').trim(), type: fd.get('type'), phone: fd.get('phone').trim(),
    email: fd.get('email').trim(), address: fd.get('address').trim(), notes: fd.get('notes').trim(),
  };
  if (id) {
    Object.assign(byId(state.customers, id), data);
    toast('Đã cập nhật thông tin khách hàng');
  } else {
    state.customers.push(Object.assign({ id: uid(), createdAt: todayStr() }, data));
    toast('Đã thêm khách hàng mới');
  }
  logAction(id ? 'update' : 'create', 'customer', data.name);
  save(); closeModal(); render();
}

function viewCustomer(id) {
  const c = byId(state.customers, id);
  if (!c) return;
  const bks = state.bookings.filter(b => b.customerId === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const ords = state.orders.filter(o => o.customerId === id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  openModal(`
    <div class="modal-head">
      <div class="profile-head" style="flex:1">
        <div class="avatar avatar-lg">${esc(initials(c.name))}</div>
        <div class="info">
          <h2>${esc(c.name)} ${c.type === 'company' ? '<span class="badge b-role-manager">' + icon('briefcase') + ' Doanh nghiệp</span>' : ''}</h2>
          <div class="sub">Khách hàng từ ${fmtDate(c.createdAt)}</div>
        </div>
      </div>
      <button class="icon-btn" onclick="closeModal()">${icon('x')}</button>
    </div>
    <div class="modal-body">
      <div class="mini-stats">
        <div class="mini-stat"><div class="v">${bks.length}</div><div class="k">Lịch chụp</div></div>
        <div class="mini-stat"><div class="v" style="color:var(--primary-600)">${fmtShort(spentOf(id))}</div><div class="k">Tổng chi tiêu</div></div>
        <div class="mini-stat"><div class="v" style="color:${debtOf(id) > 0 ? 'var(--red)' : 'var(--green)'}">${fmtShort(debtOf(id))}</div><div class="k">Công nợ</div></div>
      </div>

      <div class="section-title">Thông tin liên hệ</div>
      <div class="info-grid">
        ${infoItem('phone', 'Điện thoại', c.phone)}
        ${infoItem('mail', 'Email', c.email)}
        ${infoItem('pin', 'Địa chỉ', c.address, true)}
        ${infoItem('edit', 'Ghi chú', c.notes, true)}
      </div>

      <div class="section-title">Lịch chụp (${bks.length})</div>
      ${bks.length ? `<div class="table-wrap"><table style="min-width:480px">
        <thead><tr><th>Ngày</th><th>Gói</th><th>Trạng thái</th><th></th></tr></thead>
        <tbody>${bks.slice(0, 5).map(b => `<tr>
          <td>${fmtDate(b.date)} <span class="cell-sub">${b.startTime || ''}</span></td>
          <td>${esc(pkgName(b.packageId))}</td>
          <td><span class="badge b-${b.status}">${BK_STATUS[b.status].label}</span></td>
          <td><button class="icon-btn" onclick="viewBooking('${b.id}')" title="Xem">${icon('eye')}</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<p style="font-size:13px;color:var(--text-3)">Chưa có lịch chụp.</p>'}

      <div class="section-title">Đơn hàng (${ords.length})</div>
      ${ords.length ? `<div class="table-wrap"><table style="min-width:480px">
        <thead><tr><th>Mã ĐH</th><th>Ngày</th><th class="ta-r">Tổng</th><th>Thanh toán</th><th></th></tr></thead>
        <tbody>${ords.slice(0, 5).map(o => `<tr>
          <td class="cell-main">${esc(o.code)}</td>
          <td>${fmtDate(o.createdAt)}</td>
          <td class="money ta-r">${fmtMoney(orderTotal(o))}</td>
          <td><span class="badge b-${payStatus(o)}">${PAY_LABEL[payStatus(o)]}</span></td>
          <td><button class="icon-btn" onclick="viewOrder('${o.id}')" title="Xem">${icon('eye')}</button></td>
        </tr>`).join('')}</tbody></table></div>` : '<p style="font-size:13px;color:var(--text-3)">Chưa có đơn hàng.</p>'}
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger" onclick="closeModal();deleteCustomer('${c.id}')">${icon('trash')} Xóa</button>
      <button class="btn btn-ghost" onclick="closeModal();openBookingModal(null,null,'${c.id}')">${icon('calendar')} Đặt lịch chụp</button>
      <button class="btn btn-primary" onclick="closeModal();openCustomerModal('${c.id}')">${icon('edit')} Sửa</button>
    </div>`, 'lg');
}

function infoItem(ic, k, v, full = false, raw = false) {
  const val = raw ? v : (v ? esc(v) : '<span style="color:var(--text-3);font-weight:400">—</span>');
  return `<div class="info-item" ${full ? 'style="grid-column:1/-1"' : ''}>${icon(ic)}
    <div><div class="k">${k}</div><div class="v">${val}</div></div></div>`;
}

function deleteCustomer(id) {
  const c = byId(state.customers, id);
  if (!c) return;
  const nb = state.bookings.filter(b => b.customerId === id).length;
  const no = state.orders.filter(o => o.customerId === id).length;
  if (nb || no) {
    toast(`Không thể xóa: khách đang có ${nb} lịch chụp và ${no} đơn hàng`, 'error');
    return;
  }
  confirmDialog('Xóa khách hàng?', `Bạn có chắc muốn xóa khách hàng <b>${esc(c.name)}</b>? Hành động này không thể hoàn tác.`, 'Xóa', () => {
    state.customers = state.customers.filter(x => x.id !== id);
    logAction('delete', 'customer', c.name);
    save(); render(); toast('Đã xóa khách hàng');
  });
}

/* ================= VIEW: BOOKINGS ================= */
function bookingsView() {
  const vs = viewState.bookings;
  const toolbar = `
  <div class="toolbar">
    <div class="pill-toggle">
      <button class="${vs.mode === 'calendar' ? 'active' : ''}" onclick="viewState.bookings.mode='calendar';render()">${icon('calendar')} Lịch</button>
      <button class="${vs.mode === 'list' ? 'active' : ''}" onclick="viewState.bookings.mode='list';render()">${icon('receipt')} Danh sách</button>
    </div>
    ${vs.mode === 'list' ? `
    <div class="search-box">${icon('search')}<input class="input" placeholder="Tìm khách hàng, gói, địa điểm..." value="${esc(vs.q)}" oninput="viewState.bookings.q=this.value;renderBkRows()"></div>
    <select class="select" style="width:auto" onchange="viewState.bookings.status=this.value;renderBkRows()">
      <option value="all" ${vs.status === 'all' ? 'selected' : ''}>Mọi trạng thái</option>
      ${Object.entries(BK_STATUS).map(([k, v]) => `<option value="${k}" ${vs.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
    </select>` : ''}
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openBookingModal()">${icon('plus')} Thêm lịch chụp</button>
  </div>`;
  return toolbar + (vs.mode === 'calendar' ? calendarHtml() : bookingsListHtml());
}

function calendarHtml() {
  const first = new Date(calY, calM, 1);
  const lead = (first.getDay() + 6) % 7; // thứ 2 = 0
  const dim = new Date(calY, calM + 1, 0).getDate();
  const dimPrev = new Date(calY, calM, 0).getDate();
  const today = todayStr();
  const mk = `${calY}-${pad(calM + 1)}`;
  const monthBks = state.bookings.filter(b => (b.date || '').startsWith(mk) && branchMatch(b));

  let cells = '';
  for (let i = lead - 1; i >= 0; i--) cells += `<div class="cal-day other"><div class="dnum">${dimPrev - i}</div></div>`;
  for (let d = 1; d <= dim; d++) {
    const iso = `${calY}-${pad(calM + 1)}-${pad(d)}`;
    const dayBks = monthBks.filter(b => b.date === iso)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    const chips = dayBks.slice(0, 3).map(b =>
      `<button class="chip chip-${b.status}" title="${esc(custName(b.customerId))} — ${esc(pkgName(b.packageId))}" onclick="event.stopPropagation();viewBooking('${b.id}')">${b.startTime ? b.startTime + ' ' : ''}${esc(shortName(custName(b.customerId)))}</button>`).join('');
    const more = dayBks.length > 3 ? `<button class="chip chip-more" onclick="event.stopPropagation();openDayModal('${iso}')">+${dayBks.length - 3} khác</button>` : '';
    cells += `<div class="cal-day ${iso === today ? 'today' : ''}" title="Bấm để đặt lịch ngày ${fmtDate(iso)}" onclick="openBookingModal(null,'${iso}')">
      <div class="dnum">${d}</div><div class="chips">${chips}${more}</div></div>`;
  }
  const trail = (7 - (lead + dim) % 7) % 7;
  for (let i = 1; i <= trail; i++) cells += `<div class="cal-day other"><div class="dnum">${i}</div></div>`;

  return `
  <div class="card cal-card">
    <div class="cal-toolbar">
      <button class="icon-btn" onclick="calShift(-1)" title="Tháng trước">${icon('chev-l')}</button>
      <div class="cal-title">Tháng ${calM + 1}, ${calY}</div>
      <button class="icon-btn" onclick="calShift(1)" title="Tháng sau">${icon('chev-r')}</button>
      <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="calGoToday()">Hôm nay</button>
      <span class="right badge b-confirmed" style="margin-left:auto">${monthBks.length} lịch chụp trong tháng</span>
    </div>
    <div class="cal-head"><div>T2</div><div>T3</div><div>T4</div><div>T5</div><div>T6</div><div>T7</div><div>CN</div></div>
    <div class="cal-grid">${cells}</div>
  </div>`;
}

function calShift(n) { calM += n; if (calM < 0) { calM = 11; calY--; } if (calM > 11) { calM = 0; calY++; } render(); }
function calGoToday() { const d = new Date(); calY = d.getFullYear(); calM = d.getMonth(); render(); }

function openDayModal(iso) {
  const bks = state.bookings.filter(b => b.date === iso)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  openModal(`
    <div class="modal-head"><h3>${fmtDateLong(iso)}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body" style="display:grid;gap:9px">
      ${bks.map(b => `
      <div style="display:flex;align-items:center;gap:12px;border:1px solid var(--border);border-radius:12px;padding:11px 14px;cursor:pointer" onclick="viewBooking('${b.id}')">
        <b style="font-size:13px;min-width:44px">${b.startTime || '--:--'}</b>
        <div style="flex:1;min-width:0">
          <b style="font-size:13.5px;display:block">${esc(custName(b.customerId))}</b>
          <span class="cell-sub">${esc(pkgName(b.packageId))} · ${esc(b.location || '—')}</span>
        </div>
        <span class="badge b-${b.status}">${BK_STATUS[b.status].label}</span>
      </div>`).join('')}
      <button class="btn btn-ghost btn-block" style="margin-top:4px" onclick="closeModal();openBookingModal(null,'${iso}')">${icon('plus')} Thêm lịch chụp ngày ${fmtDate(iso)}</button>
    </div>`, 'sm');
}

function bookingsListHtml() {
  return `
  <div class="card list-wrap">
    <div class="table-wrap">
    <table>
      <thead><tr><th>Ngày</th><th>Giờ</th><th>Khách hàng</th><th>Gói dịch vụ</th><th>Địa điểm</th><th>Thợ Chụp</th><th>Trạng thái</th><th class="ta-c">Thao tác</th></tr></thead>
      <tbody id="bkRows">${bkRows()}</tbody>
    </table>
    </div>
  </div>`;
}

function bkRows() {
  const { q, status } = viewState.bookings;
  const ql = q.trim().toLowerCase();
  const list = state.bookings
    .filter(b => status === 'all' || b.status === status)
    .filter(b => branchMatch(b))
    .filter(b => !ql || [custName(b.customerId), pkgName(b.packageId), b.location].some(v => String(v || '').toLowerCase().includes(ql)))
    .sort((a, b) => (b.date + (b.startTime || '')).localeCompare(a.date + (a.startTime || '')));
  if (!list.length) return emptyRow(8, 'Không có lịch chụp phù hợp');
  return list.map(b => `<tr>
    <td><div class="cell-main">${fmtDate(b.date)}</div><div class="cell-sub">${weekdayShort(b.date)}</div></td>
    <td class="money-muted">${b.startTime || '--:--'}${b.hours ? '–' + computeEnd(b.startTime, b.hours) : ''}</td>
    <td class="cell-main">${esc(custName(b.customerId))}</td>
    <td class="money-muted">${esc(pkgName(b.packageId))}</td>
    <td class="money-muted">${esc(b.location || '—')}</td>
    <td class="money-muted">${esc(b.photographerId ? staffName(b.photographerId) : '—')}</td>
    <td><span class="badge b-${b.status}">${BK_STATUS[b.status].label}</span></td>
    <td class="cell-actions ta-c">
      <button class="icon-btn" title="Xem" onclick="viewBooking('${b.id}')">${icon('eye')}</button>
      <button class="icon-btn" title="Thư viện &amp; thả tim chọn ảnh (cổng khách hàng)" onclick="openGalleryModal('${b.id}')">${icon('camera')}</button>
      <button class="icon-btn" title="Sửa" onclick="openBookingModal('${b.id}')">${icon('edit')}</button>
      <button class="icon-btn danger" title="Xóa" onclick="deleteBooking('${b.id}')">${icon('trash')}</button>
    </td>
  </tr>`).join('');
}

function renderBkRows() { $('#bkRows').innerHTML = bkRows(); }

function openBookingModal(id, dateStr, customerId) {
  const b = id ? byId(state.bookings, id) : null;
  const custOpts = state.customers.map(c => `<option value="${c.id}" ${(b ? b.customerId === c.id : customerId === c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const pkgOpts = state.packages.filter(p => p.active).map(p => `<option value="${p.id}" ${b && b.packageId === p.id ? 'selected' : ''}>${esc(p.name)} — ${fmtMoney(p.price)}</option>`).join('');
  const staffOpts = state.staff.filter(s => s.active && branchMatch(s)).map(s => `<option value="${s.id}" ${b && b.photographerId === s.id ? 'selected' : ''}>${esc(s.name)} (${ROLES[s.role]})</option>`).join('');
  const stOpts = Object.entries(BK_STATUS).map(([k, v]) => `<option value="${k}" ${(b ? b.status === k : k === 'pending') ? 'selected' : ''}>${v.label}</option>`).join('');

  openModal(`
    <div class="modal-head"><h3>${b ? 'Sửa lịch chụp' : 'Thêm lịch chụp'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field"><label>Khách hàng <span class="req">*</span></label><select class="select" name="customerId" required><option value="">— Chọn khách —</option>${custOpts}</select></div>
      <div class="field"><label>Gói dịch vụ <span class="req">*</span></label><select class="select" name="packageId" required onchange="autoDur(this)"><option value="">— Chọn gói —</option>${pkgOpts}</select></div>
      <div class="field"><label>Ngày chụp <span class="req">*</span></label><input class="input" type="date" name="date" required value="${b ? b.date : (dateStr || todayStr())}"></div>
      <div class="field"><label>Giờ bắt đầu</label><input class="input" type="time" name="startTime" value="${b ? (b.startTime || '09:00') : '09:00'}"></div>
      <div class="field"><label>Thời lượng (giờ)</label><input class="input" type="number" name="hours" min="0.5" step="0.5" value="${b ? (b.hours || 2) : 2}"></div>
      <div class="field"><label>Thợ Chụp</label><select class="select" name="photographerId"><option value="">— Chưa phân công —</option>${staffOpts}</select></div>
      <div class="field"><label>Chi nhánh</label><select class="select" name="branchId">${state.branches.map(x => `<option value="${x.id}" ${(b ? b.branchId === x.id : x.id === curBranchId()) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="field full"><label>Địa điểm</label><input class="input" name="location" value="${esc(b ? b.location : '')}" placeholder="Studio 1, Đà Lạt, nhà khách..."></div>
      <div class="field"><label>Trạng thái</label><select class="select" name="status">${stOpts}</select></div>
      <div class="field full"><label>Ghi chú</label><textarea class="textarea" name="notes" placeholder="Yêu cầu riêng của buổi chụp...">${esc(b ? b.notes : '')}</textarea></div>
    </form>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveBooking('${id || ''}')">${icon('check')} Lưu</button>
    </div>`);
}

function autoDur(sel) {
  const p = byId(state.packages, sel.value);
  if (p && $('#frm [name=hours]')) $('#frm [name=hours]').value = p.hours || 2;
}

function saveBooking(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const data = {
    customerId: fd.get('customerId'), packageId: fd.get('packageId'),
    date: fd.get('date'), startTime: fd.get('startTime') || '',
    hours: +fd.get('hours') || 0, photographerId: fd.get('photographerId') || '',
    location: fd.get('location').trim(), status: fd.get('status'), notes: fd.get('notes').trim(),
    branchId: fd.get('branchId') || curBranchId(),
  };
  if (id) {
    Object.assign(byId(state.bookings, id), data);
    toast('Đã cập nhật lịch chụp');
  } else {
    state.bookings.push(Object.assign({ id: uid(), createdAt: todayStr() }, data));
    toast('Đã thêm lịch chụp mới');
  }
  logAction(id ? 'update' : 'create', 'booking', custName(data.customerId) + ' · ' + fmtDate(data.date));
  if (!id) pushNotif('booking', '📅 Lịch hẹn mới: ' + custName(data.customerId), pkgName(data.packageId) + ' — ' + fmtDate(data.date) + (data.startTime ? ' ' + data.startTime : ''));
  save(); closeModal(); render();
}

function viewBooking(id) {
  const b = byId(state.bookings, id);
  if (!b) return;
  const cust = byId(state.customers, b.customerId);
  const linkedOrder = orderOfBooking(id);
  const next = NEXT_ACTION[b.status];
  const idx = FLOW.indexOf(b.status);
  const timeline = FLOW.map((st, i) => `
    <div class="step ${i < idx ? 'done' : ''} ${i === idx ? 'current' : ''}">
      <div class="dot">${i < idx ? '✓' : i + 1}</div><div class="lbl">${BK_STATUS[st].label}</div>
    </div>`).join('');

  openModal(`
    <div class="modal-head">
      <div style="flex:1">
        <h3 style="font-size:16px;font-weight:800">${esc(custName(b.customerId))} — ${esc(pkgName(b.packageId))}</h3>
        <div style="display:flex;gap:7px;margin-top:7px">
          <span class="badge b-${b.status}">${BK_STATUS[b.status].label}</span>
          ${linkedOrder ? `<span class="badge b-paid">${icon('receipt')} ${esc(linkedOrder.code)}</span>` : ''}
        </div>
      </div>
      <button class="icon-btn" onclick="closeModal()">${icon('x')}</button>
    </div>
    <div class="modal-body">
      ${b.status === 'cancelled'
        ? `<div class="cancel-banner">${icon('alert')} Lịch chụp này đã bị hủy.${b.notes ? ' Ghi chú: ' + esc(b.notes) : ''}</div>`
        : `<div class="timeline" style="margin-bottom:18px">${timeline}</div>`}
      <div class="info-grid">
        ${infoItem('calendar', 'Ngày chụp', fmtDateLong(b.date))}
        ${infoItem('clock', 'Thời gian', b.startTime ? `${b.startTime} – ${computeEnd(b.startTime, b.hours)} (${b.hours}h)` : '—')}
        ${infoItem('package', 'Gói dịch vụ', pkgName(b.packageId))}
        ${infoItem('pin', 'Địa điểm', b.location)}
        ${infoItem('user', 'Thợ Chụp', b.photographerId ? staffName(b.photographerId) : 'Chưa phân công')}
        ${infoItem('phone', 'Điện thoại khách', cust ? cust.phone : '—')}
        ${b.notes ? infoItem('edit', 'Ghi chú', b.notes, true) : ''}
      </div>
      ${(function () {
        const bkLoans = state.loans.filter(l => l.bookingId === id);
        if (!bkLoans.length) return '';
        return `<div class="section-title">Đồ mượn cho buổi chụp (${bkLoans.length})</div>
        <div style="display:grid;gap:7px">
          ${bkLoans.map(l => {
            const st = loanStatus(l);
            const item = byId(state.outfits, l.outfitId) || {};
            return `<div style="display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:10px;padding:9px 12px">
              <div style="flex:1;min-width:0"><b style="font-size:13px">${esc(item.name || 'Đồ đã xóa')}</b> <span class="money-muted">× ${l.qty}</span>
                <div class="cell-sub">Mượn ${fmtDate(l.borrowDate)} → ${l.returnDate ? 'đã trả ' + fmtDate(l.returnDate) : 'hạn trả ' + fmtDate(l.dueDate)}</div></div>
              <span class="badge ${LOAN_BADGE[st]}">${LOAN_STATUS[st]}</span>
            </div>`;
          }).join('')}
        </div>`;
      })()}
    </div>
    <div class="modal-foot" style="flex-wrap:wrap">
      <button class="btn btn-danger" onclick="closeModal();deleteBooking('${b.id}')">${icon('trash')} Xóa</button>
      ${next ? `<button class="btn btn-ghost" style="color:var(--primary-600);border-color:#c7d2fe" onclick="setBookingStatus('${b.id}','${next[0]}')">${icon('check')} ${next[1]}</button>` : ''}
      <button class="btn btn-ghost" onclick="openGalleryModal('${b.id}')">${icon('camera')} Thư viện &amp; cổng KH</button>
      <a class="btn btn-ghost" href="${gcalUrl(b)}" target="_blank" rel="noopener" title="Thêm vào Google Calendar">${icon('calendar')} GCal</a>
      ${b.status !== 'cancelled' && !linkedOrder ? `<button class="btn btn-ghost" onclick="closeModal();openOrderModal(null,'${b.id}')">${icon('receipt')} Tạo đơn hàng</button>` : ''}
      <button class="btn btn-primary" onclick="closeModal();openBookingModal('${b.id}')">${icon('edit')} Sửa</button>
    </div>`, 'lg');
}

function setBookingStatus(id, status) {
  const b = byId(state.bookings, id);
  if (!b) return;
  b.status = status;
  logAction('status', 'booking', custName(b.customerId) + ' · ' + fmtDate(b.date) + ' → ' + BK_STATUS[status].label);
  if (status === 'delivered') pushNotif('ready', '📸 Ảnh đã sẵn sàng: ' + custName(b.customerId), pkgName(b.packageId) + ' — ' + fmtDate(b.date) + ' đã chuyển sang "Đã trả ảnh"');
  save(); render();
  toast(`Đã chuyển trạng thái: ${BK_STATUS[status].label}`);
  viewBooking(id);
}

function deleteBooking(id) {
  const b = byId(state.bookings, id);
  if (!b) return;
  const linked = orderOfBooking(id);
  if (linked) { toast(`Không thể xóa: lịch này đã có đơn hàng ${linked.code}`, 'error'); return; }
  confirmDialog('Xóa lịch chụp?', `Xóa buổi chụp của <b>${esc(custName(b.customerId))}</b> ngày ${fmtDate(b.date)}?`, 'Xóa', () => {
    state.bookings = state.bookings.filter(x => x.id !== id);
    logAction('delete', 'booking', custName(b.customerId) + ' · ' + fmtDate(b.date));
    save(); render(); toast('Đã xóa lịch chụp');
  });
}

/* ================= VIEW: TASK BOARD (KANBAN) ================= */
const PRI = {
  high:   { label: 'Cao',    cls: 'k-pri-high' },
  normal: { label: 'Thường', cls: 'k-pri-normal' },
  low:    { label: 'Thấp',   cls: 'k-pri-low' },
};

function defaultTaskColumns() {
  return [
    { id: 'tc-todo', name: 'Cần làm' },
    { id: 'tc-doing', name: 'Đang thực hiện' },
    { id: 'tc-review', name: 'Chờ duyệt' },
    { id: 'tc-done', name: 'Hoàn thành' },
  ];
}

function sampleTasks() {
  return [
    { id: 't1', columnId: 'tc-doing', title: 'Chỉnh sửa bộ ảnh cưới — Nguyễn Minh Anh', desc: '200 ảnh, ưu tiên tông pastel theo yêu cầu khách.', assigneeId: 's4', dueDate: dOff(2), priority: 'high', bookingId: 'b1', createdAt: dOff(-3) },
    { id: 't2', columnId: 'tc-todo', title: 'Đặt vé máy bay Hội An cho lịch cưới', desc: 'Book vé cho 2 NAG + hành lý đồ nghề, khởi hành 08/11.', assigneeId: 's1', dueDate: dOff(3), priority: 'high', bookingId: 'b15', createdAt: dOff(-1) },
    { id: 't3', columnId: 'tc-todo', title: 'Chuẩn bị đạo cụ chụp gia đình 3 thế hệ', desc: 'Bàn ghế gỗ, khung ảnh, backdrop tông ấm.', assigneeId: 's3', dueDate: dOff(1), priority: 'normal', bookingId: 'b10', createdAt: dOff(-1) },
    { id: 't4', columnId: 'tc-todo', title: 'Thiết kế layout album 30×30 — Đặng Khánh Linh', desc: '', assigneeId: 's4', dueDate: dOff(6), priority: 'normal', bookingId: 'b7', createdAt: dOff(0) },
    { id: 't5', columnId: 'tc-review', title: 'Gửi ảnh chân dung CV cho Ngô Bảo Châu', desc: 'Khách đã nhắn 2 lần — gửi ngay hôm nay.', assigneeId: 's1', dueDate: dOff(-1), priority: 'high', bookingId: 'b3', createdAt: dOff(-4) },
    { id: 't6', columnId: 'tc-review', title: 'Duyệt concept lookbook BST thu đông', desc: 'Chọn 3/8 concept gửi khách duyệt.', assigneeId: 's2', dueDate: dOff(0), priority: 'normal', bookingId: 'b8', createdAt: dOff(-2) },
    { id: 't7', columnId: 'tc-done', title: 'Bàn giao bộ ảnh sản phẩm nến thơm', desc: 'Đã gửi link Google Drive cho khách.', assigneeId: 's2', dueDate: dOff(-3), priority: 'normal', bookingId: 'b4', createdAt: dOff(-8) },
  ];
}

function dueChipHtml(iso) {
  if (!iso) return '';
  const today = todayStr();
  let cls = 'k-due', label = fmtDate(iso);
  if (iso < today) { cls = 'k-due-over'; label = 'Trễ · ' + fmtDate(iso); }
  else if (iso === today) { cls = 'k-due-today'; label = 'Hôm nay'; }
  else if (iso === dOff(1)) { cls = 'k-due-soon'; label = 'Mai'; }
  return `<span class="k-chip ${cls}">${icon('clock')} ${label}</span>`;
}

function taskCardHtml(t) {
  const pri = PRI[t.priority] || PRI.normal;
  const asg = t.assigneeId ? byId(state.staff, t.assigneeId) : null;
  const bk = t.bookingId ? byId(state.bookings, t.bookingId) : null;
  return `
  <div class="kanban-card" draggable="true" data-id="${t.id}" title="${esc(t.desc || t.title)}"
       onclick="openTaskModal('${t.id}')"
       ondragstart="taskDragStart(event,'${t.id}')" ondragend="taskDragEnd(event)">
    <div class="card-title">${esc(t.title)}</div>
    <div class="card-meta">
      <span class="k-chip ${pri.cls}">${pri.label}</span>
      ${dueChipHtml(t.dueDate)}
      ${bk ? `<span class="k-chip k-link" title="${esc(custName(bk.customerId))} — ${esc(pkgName(bk.packageId))}" onclick="event.stopPropagation();viewBooking('${bk.id}')">${icon('camera')} ${fmtDate(bk.date)}</span>` : ''}
      ${asg ? `<div class="avatar card-assignee" title="Giao cho ${esc(asg.name)}">${esc(initials(asg.name))}</div>` : ''}
    </div>
  </div>`;
}

function tasksView() {
  const f = viewState.tasks.assignee;
  const colsHtml = state.taskColumns.map(col => {
    const vis = state.tasks.filter(t => t.columnId === col.id && (f === 'all' || t.assigneeId === f));
    return `
    <div class="kanban-col" id="kcol-${col.id}">
      <div class="k-col-head">
        <span class="k-col-name">${esc(col.name)}</span>
        <span class="k-col-count">${vis.length}</span>
        <div class="k-col-actions">
          <button class="icon-btn" title="Thêm thẻ" onclick="openTaskModal(null,'${col.id}')">${icon('plus')}</button>
          <button class="icon-btn" title="Đổi tên cột" onclick="openColumnModal('${col.id}')">${icon('edit')}</button>
          <button class="icon-btn danger" title="Xóa cột" onclick="deleteColumn('${col.id}')">${icon('trash')}</button>
        </div>
      </div>
      <div class="kanban-list" id="klist-${col.id}" ondragover="taskDragOver(event,'${col.id}')" ondrop="taskDrop(event,'${col.id}')">
        ${vis.map(taskCardHtml).join('')}
        ${vis.length ? '' : '<div class="k-empty-hint">Kéo thẻ vào đây hoặc bấm "Thêm thẻ"</div>'}
        <button class="k-add-card" onclick="openTaskModal(null,'${col.id}')">${icon('plus')} Thêm thẻ</button>
      </div>
    </div>`;
  }).join('');

  const staffOpts = '<option value="all">Tất cả nhân sự</option>' +
    state.staff.filter(s => s.active).map(s => `<option value="${s.id}" ${f === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');

  return `
  <div class="toolbar">
    <span style="font-size:13px;color:var(--text-2)">Kéo và thả thẻ giữa các cột để cập nhật tiến độ</span>
    <div class="spacer"></div>
    <select class="select" style="width:auto" onchange="viewState.tasks.assignee=this.value;render()">${staffOpts}</select>
    <button class="btn btn-primary" onclick="openTaskModal()">${icon('plus')} Thêm công việc</button>
  </div>
  <div class="kanban-board">
    ${colsHtml}
    <div class="k-add-col">
      <button class="k-add-col-btn" onclick="openColumnModal()">${icon('plus')} Thêm cột</button>
    </div>
  </div>`;
}

/* ---- Kéo & thả thẻ (HTML5 Drag & Drop) ---- */
let __dragTaskId = null;

function taskDragStart(e, id) {
  __dragTaskId = id;
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', id); } catch (err) { /* trình duyệt cũ */ }
  const card = e.target.closest('.kanban-card');
  if (card) card.classList.add('dragging');
}

function taskDragEnd() {
  __dragTaskId = null;
  $$('.kanban-card.dragging').forEach(c => c.classList.remove('dragging'));
  const ph = $('#kanban-ph');
  if (ph) ph.remove();
  $$('.kanban-col').forEach(c => c.classList.remove('drag-over'));
}

function taskDragOver(e, colId) {
  if (!__dragTaskId) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const list = $('#klist-' + colId);
  if (!list) return;
  $$('.kanban-col').forEach(c => c.classList.toggle('drag-over', c.id === 'kcol-' + colId));

  let ph = $('#kanban-ph');
  if (!ph) { ph = document.createElement('div'); ph.id = 'kanban-ph'; ph.className = 'kanban-placeholder'; }
  const cards = [...list.querySelectorAll('.kanban-card')];
  let ref = null;
  for (const card of cards) {
    if (card.classList.contains('dragging')) continue;
    const r = card.getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) { ref = card; break; }
  }
  if (ref) list.insertBefore(ph, ref);
  else {
    const addBtn = list.querySelector('.k-add-card');
    if (addBtn) list.insertBefore(ph, addBtn); else list.appendChild(ph);
  }
}

function taskDrop(e, colId) {
  e.preventDefault();
  const id = __dragTaskId || (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
  if (!id) return;
  const list = $('#klist-' + colId);
  const ph = $('#kanban-ph');
  let localIndex = 0;
  if (ph && ph.parentElement === list) {
    let node = ph.nextElementSibling, after = null;
    while (node) {
      if (node.classList && node.classList.contains('kanban-card') && node.dataset.id !== id) { after = node; break; }
      node = node.nextElementSibling;
    }
    const others = [...list.querySelectorAll('.kanban-card')].filter(c => c.dataset.id !== id);
    localIndex = after ? others.findIndex(c => c === after) : others.length;
    if (localIndex < 0) localIndex = others.length;
  }
  moveTask(id, colId, localIndex);
  const mt = byId(state.tasks, id);
  logAction('move', 'task', (mt ? mt.title : id) + ' → ' + ((byId(state.taskColumns, colId) || {}).name || ''));
  __dragTaskId = null;
  save();
  render();
  toast('Đã di chuyển thẻ');
}

function moveTask(taskId, columnId, localIndex) {
  const t = byId(state.tasks, taskId);
  if (!t) return;
  const others = state.tasks.filter(x => x.id !== taskId);
  const colTasks = others.filter(x => x.columnId === columnId);
  const idx = Math.max(0, Math.min(localIndex, colTasks.length));
  t.columnId = columnId;
  if (idx >= colTasks.length) {
    if (!colTasks.length) others.push(t);
    else {
      const last = colTasks[colTasks.length - 1];
      others.splice(others.findIndex(x => x.id === last.id) + 1, 0, t);
    }
  } else {
    others.splice(others.findIndex(x => x.id === colTasks[idx].id), 0, t);
  }
  state.tasks = others;
}

/* ---- Form thẻ công việc ---- */
function openTaskModal(id, columnId) {
  const t = id ? byId(state.tasks, id) : null;
  const colSel = state.taskColumns.map(c => {
    const sel = t ? t.columnId === c.id : (columnId ? columnId === c.id : c.id === state.taskColumns[0].id);
    return `<option value="${c.id}" ${sel ? 'selected' : ''}>${esc(c.name)}</option>`;
  }).join('');
  const staffOpts = '<option value="">— Chưa giao —</option>' +
    state.staff.filter(s => s.active).map(s => `<option value="${s.id}" ${t && t.assigneeId === s.id ? 'selected' : ''}>${esc(s.name)} (${ROLES[s.role]})</option>`).join('');
  const priOpts = Object.entries(PRI).map(([k, v]) => `<option value="${k}" ${(t ? t.priority === k : k === 'normal') ? 'selected' : ''}>${v.label}</option>`).join('');
  const bkOpts = '<option value="">— Không liên kết —</option>' +
    [...state.bookings].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(b => `<option value="${b.id}" ${t && t.bookingId === b.id ? 'selected' : ''}>${fmtDate(b.date)} — ${esc(custName(b.customerId))} (${esc(pkgName(b.packageId))})</option>`).join('');

  openModal(`
    <div class="modal-head"><h3>${t ? 'Sửa công việc' : 'Thêm công việc'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field full"><label>Tiêu đề <span class="req">*</span></label><input class="input" name="title" required value="${esc(t ? t.title : '')}" placeholder="VD: Chỉnh sửa bộ ảnh cưới..."></div>
      <div class="field full"><label>Mô tả</label><textarea class="textarea" name="desc" placeholder="Chi tiết công việc...">${esc(t ? t.desc : '')}</textarea></div>
      <div class="field"><label>Cột</label><select class="select" name="columnId">${colSel}</select></div>
      <div class="field"><label>Giao cho</label><select class="select" name="assigneeId">${staffOpts}</select></div>
      <div class="field"><label>Hạn chót</label><input class="input" type="date" name="dueDate" value="${t ? (t.dueDate || '') : ''}"></div>
      <div class="field"><label>Độ ưu tiên</label><select class="select" name="priority">${priOpts}</select></div>
      <div class="field full"><label>Liên kết lịch chụp</label><select class="select" name="bookingId">${bkOpts}</select></div>
    </form>
    <div class="modal-foot">
      ${t ? `<button class="btn btn-danger" onclick="closeModal();deleteTask('${t.id}')">${icon('trash')} Xóa</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveTask('${id || ''}')">${icon('check')} Lưu</button>
    </div>`);
  setTimeout(() => { const el = $('#frm [name=title]'); if (el) el.focus(); }, 60);
}

function saveTask(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const data = {
    title: fd.get('title').trim(),
    desc: fd.get('desc').trim(),
    columnId: fd.get('columnId'),
    assigneeId: fd.get('assigneeId') || '',
    dueDate: fd.get('dueDate') || '',
    priority: fd.get('priority'),
    bookingId: fd.get('bookingId') || '',
  };
  if (id) {
    Object.assign(byId(state.tasks, id), data);
    toast('Đã cập nhật công việc');
  } else {
    state.tasks.push(Object.assign({ id: uid(), createdAt: todayStr() }, data));
    toast('Đã thêm công việc');
  }
  logAction(id ? 'update' : 'create', 'task', data.title);
  save(); closeModal(); render();
}

function deleteTask(id) {
  const t = byId(state.tasks, id);
  if (!t) return;
  confirmDialog('Xóa công việc?', `Xóa thẻ <b>${esc(t.title)}</b>?`, 'Xóa', () => {
    state.tasks = state.tasks.filter(x => x.id !== id);
    logAction('delete', 'task', t.title);
    save(); render(); toast('Đã xóa công việc');
  });
}

/* ---- Quản lý cột ---- */
function openColumnModal(id) {
  const col = id ? byId(state.taskColumns, id) : null;
  openModal(`
    <div class="modal-head"><h3>${col ? 'Đổi tên cột' : 'Thêm cột mới'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="field"><label>Tên cột <span class="req">*</span></label><input class="input" id="colName" value="${esc(col ? col.name : '')}" placeholder="VD: Cần làm"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveColumn('${id || ''}')">${icon('check')} Lưu</button>
    </div>`, 'sm');
  setTimeout(() => { const el = $('#colName'); if (el) el.focus(); }, 60);
}

function saveColumn(id) {
  const name = $('#colName').value.trim();
  if (!name) { toast('Vui lòng nhập tên cột', 'error'); return; }
  if (id) {
    byId(state.taskColumns, id).name = name;
    toast('Đã đổi tên cột');
  } else {
    state.taskColumns.push({ id: uid(), name });
    toast('Đã thêm cột mới');
  }
  logAction(id ? 'update' : 'create', 'column', name);
  save(); closeModal(); render();
}

function deleteColumn(id) {
  const col = byId(state.taskColumns, id);
  if (!col) return;
  if (state.taskColumns.length <= 1) { toast('Phải giữ lại ít nhất một cột', 'error'); return; }
  const n = state.tasks.filter(t => t.columnId === id).length;
  const fallbackCol = state.taskColumns.find(c => c.id !== id);
  confirmDialog(`Xóa cột "${col.name}"?`,
    `Cột <b>${esc(col.name)}</b> sẽ bị xóa.${n ? ` <b>${n} thẻ</b> trong cột sẽ được chuyển sang cột <b>${esc(fallbackCol.name)}</b>.` : ''}`,
    'Xóa cột', () => {
    state.tasks.forEach(t => { if (t.columnId === id) t.columnId = fallbackCol.id; });
    state.taskColumns = state.taskColumns.filter(c => c.id !== id);
    logAction('delete', 'column', col.name);
    save(); render(); toast('Đã xóa cột');
    });
}

/* ================= VIEW: WARDROBE (TRANG PHỤC • CONCEPT • MƯỢN ĐỒ) ================= */
const OUTFIT_CATS = ['Váy cưới', 'Váy dạ hội', 'Vest & Suit', 'Áo dài', 'Hanbok', 'Thời trang', 'Trẻ em', 'Phụ kiện', 'Khác'];
const OUTFIT_SIZES = ['Freesize', 'S', 'M', 'L', 'XL', 'XXL'];
const CONCEPT_STATUS = { ready: 'Sẵn sàng', maintenance: 'Bảo trì' };
const LOAN_STATUS = { borrowing: 'Đang mượn', overdue: 'Quá hạn', returned: 'Đã trả' };
const LOAN_BADGE = { borrowing: 'b-confirmed', overdue: 'b-unpaid', returned: 'b-delivered' };

const activeLoansOf = outfitId => state.loans.filter(l => l.outfitId === outfitId && !l.returnDate);
const borrowedQty = outfitId => activeLoansOf(outfitId).reduce((s, l) => s + (+l.qty || 0), 0);
const availableQty = o => Math.max(0, (+o.qty || 0) - borrowedQty(o.id));
function loanStatus(l) {
  if (l.returnDate) return 'returned';
  return (l.dueDate && l.dueDate < todayStr()) ? 'overdue' : 'borrowing';
}
const loanBorrower = l => l.borrowerType === 'staff' ? staffName(l.staffId) : custName(l.customerId);

function seedOutfits() {
  return [
    { id: 'w1', name: 'Váy cưới trắng công chúa', category: 'Váy cưới', size: 'L', color: 'Trắng', qty: 3, note: 'Đường cắt xòe, kèm khuyên váy.' },
    { id: 'w2', name: 'Váy cưới ren đuôi cá', category: 'Váy cưới', size: 'M', color: 'Trắng ngà', qty: 2, note: '' },
    { id: 'w3', name: 'Vest đen tỷ phú', category: 'Vest & Suit', size: 'L', color: 'Đen', qty: 4, note: 'Kèm nơ + giày da size 41.' },
    { id: 'w4', name: 'Vest xám than', category: 'Vest & Suit', size: 'M', color: 'Xám than', qty: 3, note: '' },
    { id: 'w5', name: 'Áo dài truyền thống đỏ', category: 'Áo dài', size: 'M', color: 'Đỏ', qty: 5, note: 'Bộ đôi, thêu rồng phượng.' },
    { id: 'w6', name: 'Áo dài cách tân pastel', category: 'Áo dài', size: 'M', color: 'Hồng pastel', qty: 3, note: '' },
    { id: 'w7', name: 'Hanbok truyền thống', category: 'Hanbok', size: 'Freesize', color: 'Trắng hồng', qty: 4, note: 'Có đủ chima jeogori nam + nữ.' },
    { id: 'w8', name: 'Váy dạ hội đỏ nhung', category: 'Váy dạ hội', size: 'S', color: 'Đỏ nhung', qty: 2, note: '' },
    { id: 'w9', name: 'Đầm fantasy trẻ em', category: 'Trẻ em', size: 'Freesize', color: 'Trắng', qty: 3, note: 'Cho bé 4–10 tuổi.' },
    { id: 'w10', name: 'Voan cưới & vương miện', category: 'Phụ kiện', size: 'Freesize', color: 'Trắng', qty: 6, note: '' },
    { id: 'w11', name: 'Bó hoa lụa cưới', category: 'Phụ kiện', size: 'Freesize', color: 'Kem', qty: 5, note: '' },
  ];
}

function seedConcepts() {
  return [
    { id: 'cp1', name: 'Concept Hàn Quốc', status: 'ready', fee: 500000, desc: 'Backdrop trắng, cửa sổ giả, hoa tươi thay mỗi tuần. Phù hợp ảnh cưới, chân dung tông pastel.' },
    { id: 'cp2', name: 'Concept Vintage Paris', status: 'ready', fee: 800000, desc: 'Tông nâu cổ điển, xe đạp cổ, vali da, đèn Edison. Nên chụp kèm áo dài / vest cổ điển.' },
    { id: 'cp3', name: 'Concept Đồng Quê', status: 'ready', fee: 500000, desc: 'Rơm, mây tre, nón lá, đèn lồng. Tốt nhất vào buổi chiều.' },
    { id: 'cp4', name: 'Concept Studio Tối Giản', status: 'ready', fee: 300000, desc: 'Phông đen/trắng, đèn chuyên nghiệp. Phù hợp chân dung CV, ảnh sản phẩm.' },
    { id: 'cp5', name: 'Concept Cinderella', status: 'maintenance', fee: 1000000, desc: 'Cầu thang trang trí, long tràng pha lê, đèn dây lung linh. Đang thay bộ đèn mới, dự kiến mở lại tuần sau.' },
    { id: 'cp6', name: 'Concept Sân Thượng Hoàng Hôn', status: 'ready', fee: 700000, desc: 'Terrace, đèn string light, ghế mây. Khung giờ đẹp: 16:30–17:30.' },
  ];
}

function seedLoans() {
  return [
    { id: 'l1', outfitId: 'w1', qty: 1, borrowerType: 'customer', customerId: 'c8', staffId: '', bookingId: 'b7', borrowDate: dOff(-6), dueDate: dOff(1), returnDate: '', deposit: 1000000, notes: 'Mượn cho buổi cưới ngoại cảnh Vũng Tàu.', createdAt: dOff(-6) },
    { id: 'l2', outfitId: 'w3', qty: 1, borrowerType: 'customer', customerId: 'c9', staffId: '', bookingId: 'b11', borrowDate: dOff(-1), dueDate: dOff(4), returnDate: '', deposit: 0, notes: '', createdAt: dOff(-1) },
    { id: 'l3', outfitId: 'w7', qty: 2, borrowerType: 'customer', customerId: 'c5', staffId: '', bookingId: 'b10', borrowDate: dOff(-2), dueDate: dOff(0), returnDate: '', deposit: 0, notes: 'Chụp gia đình — mẹ và con gái.', createdAt: dOff(-2) },
    { id: 'l4', outfitId: 'w8', qty: 1, borrowerType: 'customer', customerId: 'c7', staffId: '', bookingId: '', borrowDate: dOff(-10), dueDate: dOff(-3), returnDate: '', deposit: 500000, notes: 'Đã nhắc trả đồ 2 lần.', createdAt: dOff(-10) },
    { id: 'l5', outfitId: 'w10', qty: 2, borrowerType: 'customer', customerId: 'c4', staffId: '', bookingId: 'b5', borrowDate: dOff(-12), dueDate: dOff(-9), returnDate: dOff(-9), deposit: 0, notes: 'Đã trả đủ, đồ nguyên vẹn.', createdAt: dOff(-12) },
    { id: 'l6', outfitId: 'w4', qty: 1, borrowerType: 'staff', customerId: '', staffId: 's1', bookingId: '', borrowDate: dOff(-3), dueDate: dOff(2), returnDate: '', deposit: 0, notes: 'Mượn đi chụp ngoại cảnh cho khách.', createdAt: dOff(-3) },
    { id: 'l7', outfitId: 'w6', qty: 1, borrowerType: 'customer', customerId: 'c3', staffId: '', bookingId: '', borrowDate: dOff(-20), dueDate: dOff(-15), returnDate: dOff(-14), deposit: 300000, notes: '', createdAt: dOff(-20) },
  ];
}

function wardrobeView() {
  const v = viewState.wardrobe;
  const od = state.loans.filter(l => loanStatus(l) === 'overdue').length;
  const tab = (t, label) => `<button class="${v.tab === t ? 'active' : ''}" onclick="viewState.wardrobe.tab='${t}';render()">${label}</button>`;
  let body = '';
  if (v.tab === 'concepts') body = conceptsTab();
  else if (v.tab === 'loans') body = loansTab();
  else body = outfitsTab();
  return `
  <div class="toolbar">
    <div class="pill-toggle">
      ${tab('items', 'Trang phục')}
      ${tab('concepts', 'Concept')}
      ${tab('loans', `Mượn đồ${od ? ` · <span style="color:var(--red)">${od} trễ</span>` : ''}`)}
    </div>
  </div>
  ${body}`;
}

/* ---- Tab: Trang phục ---- */
function outfitsTab() {
  const v = viewState.wardrobe;
  return `
  <div class="toolbar" style="margin-bottom:12px">
    <div class="search-box">${icon('search')}<input class="input" placeholder="Tìm trang phục..." value="${esc(v.q)}" oninput="viewState.wardrobe.q=this.value;renderOutfitRows()"></div>
    <select class="select" style="width:auto" onchange="viewState.wardrobe.cat=this.value;renderOutfitRows()">
      <option value="all">Mọi loại</option>
      ${OUTFIT_CATS.map(c => `<option ${v.cat === c ? 'selected' : ''}>${c}</option>`).join('')}
    </select>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openOutfitModal()">${icon('plus')} Thêm trang phục</button>
  </div>
  <div class="card list-wrap">
    <div class="table-wrap">
    <table>
      <thead><tr><th>Trang phục</th><th>Size</th><th>Màu</th><th class="ta-c">Sẵn có / Tổng</th><th>Ghi chú</th><th class="ta-c">Thao tác</th></tr></thead>
      <tbody id="outfitRows">${outfitRows()}</tbody>
    </table>
    </div>
  </div>`;
}

function outfitRows() {
  const { q, cat } = viewState.wardrobe;
  const ql = q.trim().toLowerCase();
  const list = state.outfits
    .filter(o => cat === 'all' || o.category === cat)
    .filter(o => !ql || [o.name, o.color, o.note].some(v => String(v || '').toLowerCase().includes(ql)))
    .sort((a, b) => a.category.localeCompare(b.category, 'vi') || a.name.localeCompare(b.name, 'vi'));
  if (!list.length) return emptyRow(6, 'Không có trang phục phù hợp');
  return list.map(o => {
    const bw = borrowedQty(o.id), avail = availableQty(o);
    return `<tr>
      <td><div class="cell-main">${esc(o.name)}</div><span class="badge b-cat-khac">${esc(o.category)}</span></td>
      <td class="money-muted">${esc(o.size || '—')}</td>
      <td class="money-muted">${esc(o.color || '—')}</td>
      <td class="ta-c"><span class="${avail === 0 ? 'stock-out' : ''}" style="font-weight:800">${avail}</span><span class="money-muted"> / ${o.qty}</span>
        <div class="cell-sub">${bw > 0 ? bw + ' đang mượn' : 'Sẵn kho'}</div></td>
      <td class="money-muted" style="max-width:230px">${esc(o.note || '—')}</td>
      <td class="cell-actions ta-c">
        <button class="icon-btn" title="Sửa" onclick="openOutfitModal('${o.id}')">${icon('edit')}</button>
        <button class="icon-btn danger" title="Xóa" onclick="deleteOutfit('${o.id}')">${icon('trash')}</button>
      </td>
    </tr>`;
  }).join('');
}
function renderOutfitRows() { $('#outfitRows').innerHTML = outfitRows(); }

function openOutfitModal(id) {
  const o = id ? byId(state.outfits, id) : null;
  const catOpts = OUTFIT_CATS.map(c => `<option ${o && o.category === c ? 'selected' : ''}>${c}</option>`).join('');
  const sizeOpts = OUTFIT_SIZES.map(s => `<option ${o && o.size === s ? 'selected' : ''}>${s}</option>`).join('');
  openModal(`
    <div class="modal-head"><h3>${o ? 'Sửa trang phục' : 'Thêm trang phục'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field full"><label>Tên trang phục <span class="req">*</span></label><input class="input" name="name" required value="${esc(o ? o.name : '')}" placeholder="VD: Váy cưới trắng công chúa"></div>
      <div class="field"><label>Loại</label><select class="select" name="category">${catOpts}</select></div>
      <div class="field"><label>Size</label><select class="select" name="size">${sizeOpts}</select></div>
      <div class="field"><label>Màu</label><input class="input" name="color" value="${esc(o ? o.color : '')}" placeholder="Trắng, đỏ..."></div>
      <div class="field"><label>Số lượng <span class="req">*</span></label><input class="input" name="qty" type="number" min="1" step="1" required value="${o ? o.qty : 1}"></div>
      <div class="field full"><label>Ghi chú</label><textarea class="textarea" name="note" placeholder="Kèm phụ kiện gì, tình trạng...">${esc(o ? o.note : '')}</textarea></div>
    </form>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveOutfit('${id || ''}')">${icon('check')} Lưu</button>
    </div>`);
  setTimeout(() => { const el = $('#frm [name=name]'); if (el) el.focus(); }, 60);
}

function saveOutfit(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const data = {
    name: fd.get('name').trim(), category: fd.get('category'), size: fd.get('size'),
    color: fd.get('color').trim(), qty: Math.max(1, Math.round(+fd.get('qty') || 1)),
    note: fd.get('note').trim(),
  };
  if (id) {
    Object.assign(byId(state.outfits, id), data);
    toast('Đã cập nhật trang phục');
  } else {
    state.outfits.push(Object.assign({ id: uid() }, data));
    toast('Đã thêm trang phục vào kho');
  }
  logAction(id ? 'update' : 'create', 'outfit', data.name);
  save(); closeModal(); render();
}

function deleteOutfit(id) {
  const o = byId(state.outfits, id);
  if (!o) return;
  const used = state.loans.filter(l => l.outfitId === id).length;
  if (used) { toast(`Không thể xóa: đang có ${used} phiếu mượn dùng trang phục này`, 'error'); return; }
  confirmDialog('Xóa trang phục?', `Xóa <b>${esc(o.name)}</b> khỏi kho?`, 'Xóa', () => {
    state.outfits = state.outfits.filter(x => x.id !== id);
    logAction('delete', 'outfit', o.name);
    save(); render(); toast('Đã xóa trang phục');
  });
}

/* ---- Tab: Concept ---- */
function conceptsTab() {
  const ready = state.concepts.filter(c => c.status === 'ready').length;
  return `
  <div class="toolbar" style="margin-bottom:12px">
    <span style="font-size:13px;color:var(--text-2)">${ready}/${state.concepts.length} concept sẵn sàng</span>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openConceptModal()">${icon('plus')} Thêm concept</button>
  </div>
  <div class="pkg-grid">
    ${state.concepts.map(c => `
    <div class="card pkg-card ${c.status === 'ready' ? '' : 'off'}">
      <div class="pkg-top">
        <div class="pkg-name">${esc(c.name)}</div>
        <span class="badge ${c.status === 'ready' ? 'b-delivered' : 'b-pending'}">${CONCEPT_STATUS[c.status]}</span>
      </div>
      <div class="pkg-price">${c.fee ? fmtMoney(c.fee) : 'Miễn phí'}</div>
      <div class="pkg-dur">Phí sử dụng concept</div>
      <p style="font-size:12.5px;color:var(--text-2);line-height:1.6;flex:1">${esc(c.desc || '')}</p>
      <div class="pkg-foot">
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="openConceptModal('${c.id}')">${icon('edit')} Sửa</button>
        <button class="btn btn-danger btn-sm" onclick="deleteConcept('${c.id}')">${icon('trash')}</button>
      </div>
    </div>`).join('') || `<div class="card empty" style="grid-column:1/-1">${iconWrap('package')}<h4>Chưa có concept nào</h4><p>Thêm bộ concept đầu tiên cho studio.</p><button class="btn btn-primary" onclick="openConceptModal()">${icon('plus')} Thêm concept</button></div>`}
  </div>`;
}

function openConceptModal(id) {
  const c = id ? byId(state.concepts, id) : null;
  const stOpts = Object.entries(CONCEPT_STATUS).map(([k, v]) => `<option value="${k}" ${(c ? c.status === k : k === 'ready') ? 'selected' : ''}>${v}</option>`).join('');
  openModal(`
    <div class="modal-head"><h3>${c ? 'Sửa concept' : 'Thêm concept'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field full"><label>Tên concept <span class="req">*</span></label><input class="input" name="name" required value="${esc(c ? c.name : '')}" placeholder="VD: Concept Hàn Quốc"></div>
      <div class="field"><label>Phí sử dụng (₫)</label><input class="input" name="fee" type="number" min="0" step="1000" value="${c ? c.fee : 0}"></div>
      <div class="field"><label>Trạng thái</label><select class="select" name="status">${stOpts}</select></div>
      <div class="field full"><label>Mô tả</label><textarea class="textarea" name="desc" placeholder="Backdrop, đạo cụ, gợi ý trang phục phù hợp...">${esc(c ? c.desc : '')}</textarea></div>
    </form>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveConcept('${id || ''}')">${icon('check')} Lưu</button>
    </div>`);
  setTimeout(() => { const el = $('#frm [name=name]'); if (el) el.focus(); }, 60);
}

function saveConcept(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const data = {
    name: fd.get('name').trim(), fee: Math.round(+fd.get('fee') || 0),
    status: fd.get('status'), desc: fd.get('desc').trim(),
  };
  if (id) {
    Object.assign(byId(state.concepts, id), data);
    toast('Đã cập nhật concept');
  } else {
    state.concepts.push(Object.assign({ id: uid() }, data));
    toast('Đã thêm concept mới');
  }
  logAction(id ? 'update' : 'create', 'concept', data.name);
  save(); closeModal(); render();
}

function deleteConcept(id) {
  const c = byId(state.concepts, id);
  if (!c) return;
  confirmDialog('Xóa concept?', `Xóa concept <b>${esc(c.name)}</b>?`, 'Xóa', () => {
    state.concepts = state.concepts.filter(x => x.id !== id);
    logAction('delete', 'concept', c.name);
    save(); render(); toast('Đã xóa concept');
  });
}

/* ---- Tab: Mượn đồ ---- */
function loansTab() {
  const v = viewState.wardrobe;
  return `
  <div class="toolbar" style="margin-bottom:12px">
    <div class="search-box">${icon('search')}<input class="input" placeholder="Tìm theo đồ hoặc người mượn..." value="${esc(v.loanQ)}" oninput="viewState.wardrobe.loanQ=this.value;renderLoanRows()"></div>
    <select class="select" style="width:auto" onchange="viewState.wardrobe.loanStatus=this.value;renderLoanRows()">
      <option value="all" ${v.loanStatus === 'all' ? 'selected' : ''}>Mọi trạng thái</option>
      <option value="borrowing" ${v.loanStatus === 'borrowing' ? 'selected' : ''}>Đang mượn</option>
      <option value="overdue" ${v.loanStatus === 'overdue' ? 'selected' : ''}>Quá hạn</option>
      <option value="returned" ${v.loanStatus === 'returned' ? 'selected' : ''}>Đã trả</option>
    </select>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openLoanModal()">${icon('plus')} Tạo phiếu mượn</button>
  </div>
  <div class="card list-wrap">
    <div class="table-wrap">
    <table>
      <thead><tr><th>Đồ mượn</th><th>Người mượn</th><th>Lịch chụp</th><th>Mượn ngày</th><th>Hạn trả</th><th>Trạng thái</th><th class="ta-c">Thao tác</th></tr></thead>
      <tbody id="loanRows">${loanRows()}</tbody>
    </table>
    </div>
  </div>`;
}

function loanRows() {
  const { loanQ, loanStatus: ls } = viewState.wardrobe;
  const ql = loanQ.trim().toLowerCase();
  const rank = { overdue: 0, borrowing: 1, returned: 2 };
  const list = state.loans
    .filter(l => ls === 'all' || loanStatus(l) === ls)
    .filter(l => !ql || [(byId(state.outfits, l.outfitId) || {}).name, loanBorrower(l)].some(v => String(v || '').toLowerCase().includes(ql)))
    .sort((a, b) => (rank[loanStatus(a)] - rank[loanStatus(b)]) || (b.borrowDate || '').localeCompare(a.borrowDate || ''));
  if (!list.length) return emptyRow(7, 'Không có phiếu mượn phù hợp');
  const today = todayStr();
  return list.map(l => {
    const st = loanStatus(l);
    const o = byId(state.outfits, l.outfitId) || {};
    const bk = l.bookingId ? byId(state.bookings, l.bookingId) : null;
    const lateDays = st === 'overdue' ? Math.round((new Date(today) - new Date(l.dueDate)) / 864e5) : 0;
    return `<tr class="${st === 'overdue' ? 'row-overdue' : ''}">
      <td><div class="cell-main">${esc(o.name || 'Đồ đã xóa')} <span class="money-muted">× ${l.qty}</span></div><div class="cell-sub">${esc(o.category || '')}</div></td>
      <td><div class="cell-main">${esc(loanBorrower(l))}</div><div class="cell-sub">${l.borrowerType === 'staff' ? 'Nhân viên' : 'Khách hàng'}</div></td>
      <td>${bk ? `<a class="link" onclick="viewBooking('${bk.id}')">${fmtDate(bk.date)}</a><div class="cell-sub">${esc(custName(bk.customerId))}</div>` : '<span class="money-muted">—</span>'}</td>
      <td class="money-muted">${fmtDate(l.borrowDate)}</td>
      <td><span class="${st === 'overdue' ? 'loan-late' : 'money-muted'}">${fmtDate(l.dueDate)}</span>${lateDays > 0 ? `<div class="cell-sub" style="color:var(--red)">trễ ${lateDays} ngày</div>` : ''}</td>
      <td><span class="badge ${LOAN_BADGE[st]}">${LOAN_STATUS[st]}</span>${l.returnDate ? `<div class="cell-sub">trả ${fmtDate(l.returnDate)}</div>` : l.deposit ? `<div class="cell-sub">cọc ${fmtMoney(l.deposit)}</div>` : ''}</td>
      <td class="cell-actions ta-c">
        ${st !== 'returned' ? `<button class="icon-btn" title="Ghi nhận đã trả" onclick="returnLoan('${l.id}')">${icon('check')}</button>` : ''}
        <button class="icon-btn" title="Sửa" onclick="openLoanModal('${l.id}')">${icon('edit')}</button>
        <button class="icon-btn danger" title="Xóa" onclick="deleteLoan('${l.id}')">${icon('trash')}</button>
      </td>
    </tr>`;
  }).join('');
}
function renderLoanRows() { $('#loanRows').innerHTML = loanRows(); }

function openLoanModal(id) {
  const l = id ? byId(state.loans, id) : null;
  const type = l ? l.borrowerType : 'customer';
  const availOf = o => availableQty(o) + (l && !l.returnDate && l.outfitId === o.id ? (+l.qty || 0) : 0);
  const outfitOpts = state.outfits.map(o =>
    `<option value="${o.id}" ${l && l.outfitId === o.id ? 'selected' : ''}>${esc(o.name)} — còn ${availOf(o)}</option>`).join('');
  const custOpts = state.customers.map(c => `<option value="${c.id}" ${l && l.customerId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const staffOpts = state.staff.map(s => `<option value="${s.id}" ${l && l.staffId === s.id ? 'selected' : ''}>${esc(s.name)} (${ROLES[s.role]})</option>`).join('');

  openModal(`
    <div class="modal-head"><h3>${l ? 'Sửa phiếu mượn' : 'Tạo phiếu mượn đồ'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field full"><label>Trang phục <span class="req">*</span></label><select class="select" name="outfitId" required>${outfitOpts}</select></div>
      <div class="field"><label>Số lượng <span class="req">*</span></label><input class="input" name="qty" type="number" min="1" step="1" required value="${l ? l.qty : 1}"></div>
      <div class="field"><label>Tiền cọc (₫)</label><input class="input" name="deposit" type="number" min="0" step="100000" value="${l ? l.deposit : 0}"></div>
      <div class="field"><label>Người mượn là</label>
        <select class="select" name="borrowerType" onchange="onBorrowerTypeChange()">
          <option value="customer" ${type === 'customer' ? 'selected' : ''}>Khách hàng</option>
          <option value="staff" ${type === 'staff' ? 'selected' : ''}>Nhân viên</option>
        </select></div>
      <div class="field" id="loanCustBox" style="${type === 'customer' ? '' : 'display:none'}"><label>Khách hàng <span class="req">*</span></label>
        <select class="select" name="customerId" onchange="onLoanCustChange()">${custOpts}</select></div>
      <div class="field" id="loanStaffBox" style="${type === 'staff' ? '' : 'display:none'}"><label>Nhân viên <span class="req">*</span></label>
        <select class="select" name="staffId">${staffOpts}</select></div>
      <div class="field full"><label>Liên kết lịch chụp</label><select class="select" name="bookingId"></select></div>
      <div class="field"><label>Ngày mượn <span class="req">*</span></label><input class="input" type="date" name="borrowDate" required value="${l ? l.borrowDate : todayStr()}"></div>
      <div class="field"><label>Hạn trả <span class="req">*</span></label><input class="input" type="date" name="dueDate" required value="${l ? l.dueDate : dOff(3)}"></div>
      <div class="field"><label>Ngày trả (nếu đã trả)</label><input class="input" type="date" name="returnDate" value="${l ? (l.returnDate || '') : ''}"><div class="form-hint">Bỏ trống nếu đang mượn</div></div>
      <div class="field full"><label>Ghi chú</label><textarea class="textarea" name="notes">${esc(l ? l.notes : '')}</textarea></div>
    </form>
    <div class="modal-foot">
      ${l ? `<button class="btn btn-danger" onclick="closeModal();deleteLoan('${l.id}')">${icon('trash')} Xóa</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveLoan('${id || ''}')">${icon('check')} Lưu</button>
    </div>`, 'lg');

  refreshLoanBookingOptions(l ? l.bookingId : null);
}

function onBorrowerTypeChange() {
  const type = $('#frm [name=borrowerType]').value;
  $('#loanCustBox').style.display = type === 'customer' ? '' : 'none';
  $('#loanStaffBox').style.display = type === 'staff' ? '' : 'none';
  refreshLoanBookingOptions(null);
}

function onLoanCustChange() { refreshLoanBookingOptions(null); }

function refreshLoanBookingOptions(selectedId) {
  const sel = $('#frm [name=bookingId]');
  if (!sel) return;
  const type = $('#frm [name=borrowerType]').value;
  const custId = ($('#frm [name=customerId]') || {}).value || '';
  let list = [...state.bookings];
  if (type === 'customer' && custId) list = list.filter(b => b.customerId === custId);
  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  sel.innerHTML = '<option value="">— Không liên kết —</option>' + list.map(b =>
    `<option value="${b.id}" ${selectedId === b.id ? 'selected' : ''}>${fmtDate(b.date)} — ${esc(custName(b.customerId))} (${esc(pkgName(b.packageId))})</option>`).join('');
}

function saveLoan(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const type = fd.get('borrowerType');
  const outfit = byId(state.outfits, fd.get('outfitId'));
  if (!outfit) { toast('Vui lòng chọn trang phục', 'error'); return; }
  const qty = Math.max(1, Math.round(+fd.get('qty') || 1));
  const old = id ? byId(state.loans, id) : null;
  const returnDate = fd.get('returnDate') || '';
  if (!returnDate) {
    const avail = availableQty(outfit) + (old && !old.returnDate && old.outfitId === outfit.id ? (+old.qty || 0) : 0);
    if (qty > avail) { toast(`Chỉ còn ${avail} "${outfit.name}" sẵn có`, 'error'); return; }
  }
  const data = {
    outfitId: outfit.id, qty, borrowerType: type,
    customerId: type === 'customer' ? (fd.get('customerId') || '') : '',
    staffId: type === 'staff' ? (fd.get('staffId') || '') : '',
    bookingId: fd.get('bookingId') || '',
    borrowDate: fd.get('borrowDate') || todayStr(),
    dueDate: fd.get('dueDate') || '',
    returnDate,
    deposit: Math.round(+fd.get('deposit') || 0),
    notes: fd.get('notes').trim(),
  };
  if (type === 'customer' && !data.customerId) { toast('Vui lòng chọn khách hàng mượn đồ', 'error'); return; }
  if (type === 'staff' && !data.staffId) { toast('Vui lòng chọn nhân viên mượn đồ', 'error'); return; }
  if (id) {
    Object.assign(byId(state.loans, id), data);
    toast('Đã cập nhật phiếu mượn');
  } else {
    state.loans.push(Object.assign({ id: uid(), createdAt: todayStr() }, data));
    toast('Đã tạo phiếu mượn — trừ kho thành công');
  }
  logAction(id ? 'update' : 'create', 'loan',
    outfit.name + ' × ' + qty + ' — ' + (type === 'staff' ? staffName(data.staffId) : custName(data.customerId)));
  save(); closeModal(); render();
}

function returnLoan(id) {
  const l = byId(state.loans, id);
  if (!l || l.returnDate) return;
  l.returnDate = todayStr();
  logAction('update', 'loan', ((byId(state.outfits, l.outfitId) || {}).name || '') + ' — ghi nhận trả đồ');
  save(); render();
  toast('Đã ghi nhận trả đồ — kho được cập nhật');
}

function deleteLoan(id) {
  const l = byId(state.loans, id);
  if (!l) return;
  confirmDialog('Xóa phiếu mượn?', `Xóa phiếu mượn <b>${esc((byId(state.outfits, l.outfitId) || {}).name || '')}</b> của ${esc(loanBorrower(l))}?`, 'Xóa', () => {
    state.loans = state.loans.filter(x => x.id !== id);
    logAction('delete', 'loan', (byId(state.outfits, l.outfitId) || {}).name + ' — ' + loanBorrower(l));
    save(); render(); toast('Đã xóa phiếu mượn');
  });
}

/* ================= VIEW: ORDERS ================= */
function ordersView() {
  const vs = viewState.orders;
  return `
  <div class="toolbar">
    <div class="search-box">${icon('search')}<input class="input" placeholder="Tìm mã ĐH, khách hàng..." value="${esc(vs.q)}" oninput="viewState.orders.q=this.value;renderOrderRows()"></div>
    <select class="select" style="width:auto" onchange="viewState.orders.pay=this.value;renderOrderRows()">
      <option value="all" ${vs.pay === 'all' ? 'selected' : ''}>Mọi trạng thái TT</option>
      <option value="paid" ${vs.pay === 'paid' ? 'selected' : ''}>Đã thanh toán</option>
      <option value="deposit" ${vs.pay === 'deposit' ? 'selected' : ''}>Đã cọc</option>
      <option value="unpaid" ${vs.pay === 'unpaid' ? 'selected' : ''}>Chưa thanh toán</option>
    </select>
    <select class="select" style="width:auto" title="Xem theo tháng" onchange="viewState.orders.month=this.value;renderOrderRows()">
      ${monthOptions(vs.month, state.orders.map(o => o.createdAt))}
    </select>
    <span class="badge b-deposit" id="orderSum">${orderSumText()}</span>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openOrderModal()">${icon('plus')} Tạo đơn hàng</button>
  </div>
  <div class="card list-wrap">
    <div class="table-wrap">
    <table>
      <thead><tr><th>Mã ĐH</th><th>Khách hàng</th><th>Dịch vụ</th><th>Ngày tạo</th><th class="ta-r">Tổng tiền</th><th class="ta-r">Còn lại</th><th>Thanh toán</th><th class="ta-c">Thao tác</th></tr></thead>
      <tbody id="orderRows">${orderRows()}</tbody>
    </table>
    </div>
  </div>`;
}

function orderFiltered() {
  const { q, pay, month } = viewState.orders;
  const ql = q.trim().toLowerCase();
  return state.orders
    .filter(o => pay === 'all' || payStatus(o) === pay)
    .filter(o => branchMatch(o))
    .filter(o => !month || (o.createdAt || '').startsWith(month))
    .filter(o => !ql || [o.code, custName(o.customerId)].some(v => String(v || '').toLowerCase().includes(ql)))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function orderSumText() {
  const list = orderFiltered();
  const rev = list.reduce((s, o) => s + orderTotal(o), 0);
  const remain = list.reduce((s, o) => s + orderRemaining(o), 0);
  return `${list.length} đơn${viewState.orders.month ? ' tháng ' + (+viewState.orders.month.slice(5)) + '/' + viewState.orders.month.slice(0, 4) : ''} · thu ${fmtShort(rev)}₫${remain > 0 ? ' · còn ' + fmtShort(remain) + '₫' : ''}`;
}

function orderRows() {
  const list = orderFiltered();
  if (!list.length) return emptyRow(8, viewState.orders.month ? 'Không có đơn hàng nào trong tháng này' : 'Không có đơn hàng phù hợp');
  return list.map(o => {
    const main = o.items[0] ? o.items[0].name : '—';
    const more = o.items.length > 1 ? ` +${o.items.length - 1}` : '';
    return `<tr>
      <td class="cell-main">${esc(o.code)}</td>
      <td>${esc(custName(o.customerId))}</td>
      <td class="money-muted">${esc(main)}${more ? `<span class="cell-sub">(${more} mục)</span>` : ''}</td>
      <td class="money-muted">${fmtDate(o.createdAt)}</td>
      <td class="money ta-r">${fmtMoney(orderTotal(o))}</td>
      <td class="${orderRemaining(o) > 0 ? 'money-red' : 'money-muted'} ta-r">${fmtMoney(orderRemaining(o))}</td>
      <td><span class="badge b-${payStatus(o)}">${PAY_LABEL[payStatus(o)]}</span></td>
      <td class="cell-actions ta-c">
        <button class="icon-btn" title="Xem" onclick="viewOrder('${o.id}')">${icon('eye')}</button>
        <button class="icon-btn" title="In hóa đơn" onclick="printOrder('${o.id}')">${icon('printer')}</button>
        <button class="icon-btn" title="Thanh toán QR" onclick="openQrPayModal('${o.id}')">${icon('card')}</button>
        <button class="icon-btn" title="Sửa" onclick="openOrderModal('${o.id}')">${icon('edit')}</button>
        <button class="icon-btn danger" title="Xóa" onclick="deleteOrder('${o.id}')">${icon('trash')}</button>
      </td>
    </tr>`;
  }).join('');
}

function renderOrderRows() {
  const tb = $('#orderRows'); if (tb) tb.innerHTML = orderRows();
  const sum = $('#orderSum'); if (sum) sum.textContent = orderSumText();
}

function itemRowHtml(item = { name: '', qty: 1, price: 0 }, pkgId = '') {
  return `<div class="item-row" data-pkg="${pkgId}">
    <input class="input oi-name" value="${esc(item.name)}" placeholder="Tên dịch vụ / sản phẩm">
    <input class="input oi-qty" type="number" min="1" step="1" value="${+item.qty || 1}" oninput="recalcOrderTotals()">
    <input class="input oi-price" type="number" min="0" step="1000" value="${+item.price || 0}" oninput="recalcOrderTotals()">
    <div class="item-total">0₫</div>
    <button type="button" class="icon-btn danger" title="Xóa dòng" onclick="this.closest('.item-row').remove();recalcOrderTotals()">${icon('trash')}</button>
  </div>`;
}

function openOrderModal(id, bookingId) {
  const o = id ? byId(state.orders, id) : null;
  const bk = bookingId ? byId(state.bookings, bookingId) : null;

  let itemsHtml = '';
  let custSel = '';
  let bkSel = '<option value="">— Không liên kết —</option>';
  if (o) {
    itemsHtml = o.items.map(it => itemRowHtml(it)).join('');
    custSel = o.customerId;
    bkSel += bookingOptions(o.customerId, o.bookingId);
  } else if (bk) {
    custSel = bk.customerId;
    const p = byId(state.packages, bk.packageId);
    itemsHtml = itemRowHtml({ name: p ? p.name : '', qty: 1, price: p ? p.price : 0 }, bk.packageId);
    bkSel += bookingOptions(bk.customerId, bk.id);
  } else {
    itemsHtml = itemRowHtml();
  }

  const custOpts = state.customers.map(c => `<option value="${c.id}" ${custSel === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const pkgOpts = state.packages.filter(p => p.active).map(p => `<option value="${p.id}">${esc(p.name)} — ${fmtMoney(p.price)}</option>`).join('');
  const stOpts = Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}" ${(o ? o.status === k : k === 'confirmed') ? 'selected' : ''}>${v}</option>`).join('');

  openModal(`
    <div class="modal-head"><h3>${o ? 'Sửa đơn hàng ' + esc(o.code) : 'Tạo đơn hàng mới'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="form-grid" style="margin-bottom:14px">
        <div class="field"><label>Khách hàng <span class="req">*</span></label>
          <select class="select" id="oCust" required onchange="onOrderCustChange()">${custOpts}</select></div>
        <div class="field"><label>Lịch chụp liên quan</label>
          <select class="select" id="oBooking">${bkSel}</select></div>
      </div>

      <div class="field" style="margin-bottom:8px"><label>Chọn nhanh gói dịch vụ</label>
        <select class="select" onchange="applyOrderPackage(this.value)"><option value="">— Thêm gói vào đơn —</option>${pkgOpts}</select></div>

      <div class="items-editor">
        <div class="items-head"><div>Dịch vụ / sản phẩm</div><div>Số lượng</div><div>Đơn giá (₫)</div><div style="text-align:right">Thành tiền</div><div></div></div>
        <div id="orderItems">${itemsHtml}</div>
        <div class="items-add"><button type="button" class="btn btn-ghost btn-sm" onclick="addItemRow()">${icon('plus')} Thêm dòng</button></div>
      </div>

      <div class="form-grid" style="margin-top:14px">
        <div class="field"><label>Chiết khấu (₫)</label><input class="input" id="oDiscount" type="number" min="0" step="1000" value="${o ? (+o.discount || 0) : 0}" oninput="recalcOrderTotals()"></div>
        <div class="field"><label>Đã thanh toán (₫)</label><input class="input" id="oPaid" type="number" min="0" step="1000" value="${o ? (+o.paidAmount || 0) : 0}" oninput="recalcOrderTotals()"></div>
        <div class="field"><label>Trạng thái đơn</label><select class="select" id="oStatus">${stOpts}</select></div>
        <div class="field full"><label>Ghi chú</label><textarea class="textarea" id="oNotes" placeholder="Điều khoản, ghi chú thanh toán...">${esc(o ? o.notes : '')}</textarea></div>
        ${attBlockHtml()}
      </div>

      <div class="totals-box" style="margin-top:14px">
        <div class="totals-row"><span>Tạm tính</span><b id="oSubtotal">0₫</b></div>
        <div class="totals-row grand"><span>Tổng cộng</span><b id="oTotal">0₫</b></div>
        <div class="totals-row"><span>Còn lại</span><b id="oRemaining" style="color:var(--red)">0₫</b></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveOrder('${id || ''}')">${icon('check')} Lưu đơn hàng</button>
    </div>`, 'lg');

  attInit(o && o.photos);
  recalcOrderTotals();
}

function bookingOptions(custId, selectedId) {
  return state.bookings
    .filter(b => b.customerId === custId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(b => `<option value="${b.id}" ${selectedId === b.id ? 'selected' : ''}>${fmtDate(b.date)} — ${esc(pkgName(b.packageId))}</option>`)
    .join('');
}

function onOrderCustChange() {
  const custId = $('#oCust').value;
  $('#oBooking').innerHTML = '<option value="">— Không liên kết —</option>' + bookingOptions(custId, null);
}

function applyOrderPackage(pkgId) {
  if (!pkgId) return;
  const p = byId(state.packages, pkgId);
  if (!p) return;
  const existing = $(`#orderItems .item-row[data-pkg="${pkgId}"]`);
  if (existing) existing.remove();
  $('#orderItems').insertAdjacentHTML('beforeend', itemRowHtml({ name: p.name, qty: 1, price: p.price }, pkgId));
  recalcOrderTotals();
}

function addItemRow() {
  $('#orderItems').insertAdjacentHTML('beforeend', itemRowHtml());
  const rows = $$('#orderItems .item-row');
  rows[rows.length - 1].querySelector('.oi-name').focus();
}

function recalcOrderTotals() {
  let sub = 0;
  $$('#orderItems .item-row').forEach(row => {
    const qty = +row.querySelector('.oi-qty').value || 0;
    const price = +row.querySelector('.oi-price').value || 0;
    const t = qty * price;
    sub += t;
    row.querySelector('.item-total').textContent = fmtMoney(t);
  });
  const disc = +($('#oDiscount') ? $('#oDiscount').value : 0) || 0;
  const paid = +($('#oPaid') ? $('#oPaid').value : 0) || 0;
  const total = Math.max(0, sub - disc);
  const remain = Math.max(0, total - paid);
  if ($('#oSubtotal')) $('#oSubtotal').textContent = fmtMoney(sub);
  if ($('#oTotal')) $('#oTotal').textContent = fmtMoney(total);
  if ($('#oRemaining')) { $('#oRemaining').textContent = fmtMoney(remain); $('#oRemaining').style.color = remain > 0 ? 'var(--red)' : 'var(--green)'; }
}

function saveOrder(id) {
  const custId = $('#oCust').value;
  if (!custId) { toast('Vui lòng chọn khách hàng', 'error'); return; }
  const items = [];
  $$('#orderItems .item-row').forEach(row => {
    const name = row.querySelector('.oi-name').value.trim();
    const qty = +row.querySelector('.oi-qty').value || 0;
    const price = +row.querySelector('.oi-price').value || 0;
    if (name && qty > 0) items.push({ name, qty, price: Math.round(price) });
  });
  if (!items.length) { toast('Đơn hàng cần ít nhất một dịch vụ', 'error'); return; }

  const data = {
    customerId: custId,
    bookingId: $('#oBooking').value || null,
    items,
    discount: Math.round(+$('#oDiscount').value || 0),
    paidAmount: Math.round(+$('#oPaid').value || 0),
    status: $('#oStatus').value,
    notes: $('#oNotes').value.trim(),
    photos: __attTemp.slice(),
  };

  if (id) {
    Object.assign(byId(state.orders, id), data);
    toast('Đã cập nhật đơn hàng');
  } else {
    const code = 'DH-' + (state.orderSeq++);
    state.orders.push(Object.assign({ id: uid(), code, createdAt: todayStr(), branchId: (data.bookingId ? ((byId(state.bookings, data.bookingId) || {}).branchId || curBranchId()) : curBranchId()) }, data));
    toast('Đã tạo đơn hàng ' + code);
  }
  logAction(id ? 'update' : 'create', 'order',
    (id ? byId(state.orders, id).code : 'DH-' + (state.orderSeq - 1)) + ' — ' + custName(data.customerId) + ' (' + fmtMoney(orderTotal({ items: items, discount: data.discount })) + ')');
  save(); closeModal(); render();
}

function viewOrder(id) {
  const o = byId(state.orders, id);
  if (!o) return;
  const total = orderTotal(o), paid = +o.paidAmount || 0, remain = orderRemaining(o);
  const pct = total > 0 ? Math.min(100, Math.round(paid / total * 100)) : 0;
  const bk = o.bookingId ? byId(state.bookings, o.bookingId) : null;

  openModal(`
    <div class="modal-head">
      <div style="flex:1">
        <h3 style="font-size:16px;font-weight:800">Đơn hàng ${esc(o.code)}</h3>
        <div style="display:flex;gap:7px;margin-top:7px">
          <span class="badge b-${payStatus(o)}">${PAY_LABEL[payStatus(o)]}</span>
          <span class="badge b-${o.status}">${ORDER_STATUS[o.status]}</span>
        </div>
      </div>
      <button class="icon-btn" onclick="closeModal()">${icon('x')}</button>
    </div>
    <div class="modal-body">
      <div class="info-grid" style="margin-bottom:16px">
        ${infoItem('user', 'Khách hàng', `<a class="link" onclick="closeModal();viewCustomer('${o.customerId}')">${esc(custName(o.customerId))}</a>`, false, true)}
        ${infoItem('calendar', 'Ngày tạo', fmtDate(o.createdAt))}
        ${bk ? infoItem('camera', 'Lịch chụp', `${fmtDate(bk.date)} — ${esc(pkgName(bk.packageId))}`) : ''}
        ${infoItem('clock', 'Ngày chụp', bk ? fmtDate(bk.date) : '')}
      </div>

      <div class="section-title">Chi tiết dịch vụ</div>
      <div class="table-wrap"><table style="min-width:460px">
        <thead><tr><th>Dịch vụ / sản phẩm</th><th class="ta-c">SL</th><th class="ta-r">Đơn giá</th><th class="ta-r">Thành tiền</th></tr></thead>
        <tbody>${o.items.map(it => `<tr>
          <td>${esc(it.name)}</td><td class="ta-c money-muted">${it.qty}</td>
          <td class="ta-r money-muted">${fmtMoney(it.price)}</td>
          <td class="ta-r money">${fmtMoney(it.qty * it.price)}</td></tr>`).join('')}
        </tbody>
      </table></div>

      <div class="totals-box" style="margin-top:14px">
        <div class="totals-row"><span>Tạm tính</span><b>${fmtMoney(orderSubtotal(o))}</b></div>
        ${o.discount ? `<div class="totals-row"><span>Chiết khấu</span><b style="color:var(--red)">−${fmtMoney(o.discount)}</b></div>` : ''}
        <div class="totals-row grand"><span>Tổng cộng</span><b>${fmtMoney(total)}</b></div>
      </div>

      <div class="section-title">Thanh toán</div>
      <div class="pay-progress"><div style="width:${pct}%"></div></div>
      <div class="pay-legend"><span>Đã thu <b>${fmtMoney(paid)}</b> (${pct}%)</span><span>Còn lại <b style="color:${remain > 0 ? 'var(--red)' : 'var(--green)'}">${fmtMoney(remain)}</b></span></div>
      ${o.qrPending ? `<div class="cancel-banner" style="margin-top:12px;border-color:#fde68a;background:#fffbeb">${icon('clock')} Khách báo <b>đã QR chuyển khoản ${fmtMoney(o.qrPending.amount)}</b> lúc ${fmtDateTime(o.qrPending.ts)} — <a class="link" onclick="openQrPayModal('${o.id}')">duyệt ngay</a></div>` : ''}
      ${o.notes ? `<div class="cancel-banner" style="margin-top:14px">${icon('edit')} ${esc(o.notes)}</div>` : ''}
      ${o.photos && o.photos.length ? `<div class="section-title" style="margin-top:16px">Ảnh đính kèm (${o.photos.length})</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${o.photos.map(p => `<img src="${p}" onclick="viewPhotosOf('order','${o.id}')" style="width:76px;height:76px;object-fit:cover;border-radius:10px;cursor:zoom-in;border:1px solid var(--border)">`).join('')}</div>` : ''}
    </div>
    <div class="modal-foot" style="flex-wrap:wrap">
      <button class="btn btn-danger" onclick="closeModal();deleteOrder('${o.id}')">${icon('trash')} Xóa</button>
      ${remain > 0 && o.status !== 'cancelled' ? `<button class="btn btn-ghost" style="color:var(--green);border-color:#a7f3d0" onclick="markOrderPaid('${o.id}')">${icon('check')} Thanh toán đủ</button>` : ''}
      ${remain > 0 && o.status !== 'cancelled' ? `<button class="btn btn-ghost" onclick="openPaymentModal('${o.id}')">${icon('money')} Ghi nhận thanh toán</button>` : ''}
      <button class="btn btn-ghost" onclick="openQrPayModal('${o.id}')">${icon('card')} QR thanh toán</button>
      <button class="btn btn-ghost" onclick="printOrder('${o.id}')">${icon('printer')} In hóa đơn</button>
      <button class="btn btn-primary" onclick="closeModal();openOrderModal('${o.id}')">${icon('edit')} Sửa</button>
    </div>`, 'lg');
}

function openPaymentModal(id) {
  const o = byId(state.orders, id);
  if (!o) return;
  const remain = orderRemaining(o);
  openModal(`
    <div class="modal-head"><h3>Ghi nhận thanh toán — ${esc(o.code)}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text-2);margin-bottom:14px">Số tiền còn lại: <b style="color:var(--red)">${fmtMoney(remain)}</b></p>
      <div class="field"><label>Số tiền khách thanh toán thêm (₫)</label>
        <input class="input" id="payAmount" type="number" min="0" step="1000" max="${remain}" value="${remain}">
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="savePayment('${id}')">${icon('check')} Xác nhận</button>
    </div>`, 'sm');
}

function savePayment(id) {
  const o = byId(state.orders, id);
  if (!o) return;
  const amt = Math.max(0, Math.round(+$('#payAmount').value || 0));
  if (!amt) { toast('Vui lòng nhập số tiền', 'error'); return; }
  o.paidAmount = Math.min(orderTotal(o), (+o.paidAmount || 0) + amt);
  if (orderRemaining(o) === 0 && o.status === 'confirmed') o.status = 'completed';
  logAction('pay', 'order', o.code + ': thu thêm ' + fmtMoney(amt));
  pushNotif('payment', '💰 Khách thanh toán ' + fmtMoney(amt), o.code + ' — ' + custName(o.customerId));
  save(); render();
  toast(`Đã ghi nhận ${fmtMoney(amt)} cho đơn ${o.code}`);
  viewOrder(id);
}

function markOrderPaid(id) {
  const o = byId(state.orders, id);
  if (!o) return;
  o.paidAmount = orderTotal(o);
  if (o.status === 'confirmed') o.status = 'completed';
  logAction('pay', 'order', o.code + ': thanh toán đủ ' + fmtMoney(orderTotal(o)));
  pushNotif('payment', '✅ Thanh toán đủ ' + fmtMoney(orderTotal(o)), o.code + ' — ' + custName(o.customerId));
  save(); render();
  toast(`Đơn ${o.code} đã thanh toán đủ`);
  viewOrder(id);
}

function deleteOrder(id) {
  const o = byId(state.orders, id);
  if (!o) return;
  confirmDialog('Xóa đơn hàng?', `Xóa đơn hàng <b>${esc(o.code)}</b> của ${esc(custName(o.customerId))}?`, 'Xóa', () => {
    state.orders = state.orders.filter(x => x.id !== id);
    logAction('delete', 'order', o.code + ' — ' + custName(o.customerId));
    save(); render(); toast('Đã xóa đơn hàng');
  });
}

/* ================= IN HÓA ĐƠN ================= */
function printOrder(id) {
  const o = byId(state.orders, id);
  if (!o) return;
  const st = state.settings;
  const rows = o.items.map((it, i) => `<tr>
    <td style="text-align:center">${i + 1}</td><td>${esc(it.name)}</td>
    <td style="text-align:center">${it.qty}</td>
    <td style="text-align:right">${fmtMoney(it.price)}</td>
    <td style="text-align:right">${fmtMoney(it.qty * it.price)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Hóa đơn ${esc(o.code)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Be Vietnam Pro', -apple-system, 'Segoe UI', Arial, sans-serif; color:#111; padding:36px 40px; font-size:13px; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #6366f1; padding-bottom:16px; margin-bottom:22px; }
  .studio h1 { font-size:20px; color:#4f46e5; margin-bottom:4px; }
  .studio p { font-size:11.5px; color:#555; line-height:1.6; }
  .doc { text-align:right; }
  .doc h2 { font-size:16px; text-transform:uppercase; letter-spacing:1px; }
  .doc p { font-size:12px; color:#555; margin-top:4px; }
  table { width:100%; border-collapse:collapse; margin:14px 0 20px; }
  th, td { border:1px solid #ddd; padding:8px 10px; font-size:12.5px; }
  th { background:#f4f5fb; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#444; }
  .cust { background:#fafbff; border:1px solid #e4e6f4; border-radius:8px; padding:12px 16px; display:flex; gap:40px; font-size:12.5px; }
  .cust b { display:block; margin-bottom:3px; }
  .totals { margin-left:auto; width:290px; }
  .totals div { display:flex; justify-content:space-between; padding:5px 0; font-size:13px; }
  .totals .grand { border-top:2px solid #6366f1; margin-top:6px; padding-top:9px; font-weight:800; font-size:15px; color:#4f46e5; }
  .note { font-size:11.5px; color:#666; margin-top:18px; font-style:italic; }
  .sign { display:flex; justify-content:space-between; margin-top:44px; }
  .sign div { text-align:center; font-size:12px; width:220px; }
  .sign .line { margin-top:56px; border-top:1px solid #999; padding-top:5px; color:#777; font-size:11px; }
  @media print { body { padding:16px 20px; } }
</style></head><body>
  <div class="head">
    <div class="studio">
      <h1>${esc(st.studioName)}</h1>
      <p>${esc(st.address)}<br>Điện thoại: ${esc(st.phone)} · Email: ${esc(st.email)}</p>
    </div>
    <div class="doc">
      <h2>Hóa đơn dịch vụ</h2>
      <p>Số: <b>${esc(o.code)}</b><br>Ngày: ${fmtDate(o.createdAt)}</p>
    </div>
  </div>
  <div class="cust">
    <div><b>Khách hàng</b>${esc(custName(o.customerId))}</div>
    <div><b>Điện thoại</b>${esc((byId(state.customers, o.customerId) || {}).phone || '—')}</div>
    <div><b>Địa chỉ</b>${esc((byId(state.customers, o.customerId) || {}).address || '—')}</div>
  </div>
  <table>
    <thead><tr><th style="width:36px;text-align:center">#</th><th>Dịch vụ / sản phẩm</th><th style="width:50px;text-align:center">SL</th><th style="width:110px;text-align:right">Đơn giá</th><th style="width:130px;text-align:right">Thành tiền</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Tạm tính</span><b>${fmtMoney(orderSubtotal(o))}</b></div>
    ${o.discount ? `<div><span>Chiết khấu</span><b>−${fmtMoney(o.discount)}</b></div>` : ''}
    <div class="grand"><span>Tổng cộng</span><span>${fmtMoney(orderTotal(o))}</span></div>
    <div><span>Đã thanh toán</span><b>${fmtMoney(o.paidAmount)}</b></div>
    <div><span>Còn lại</span><b>${fmtMoney(orderRemaining(o))}</b></div>
  </div>
  ${o.notes ? `<p class="note">Ghi chú: ${esc(o.notes)}</p>` : ''}
  <div class="sign">
    <div>Người nhận hàng<div class="line">(Ký, ghi rõ họ tên)</div></div>
    <div> Đại diện studio<div class="line">(Ký, ghi rõ họ tên)</div></div>
  </div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
</body></html>`;
  try {
    const w = window.open('', '_blank', 'width=860,height=1000');
    if (!w) { toast('Trình duyệt đã chặn cửa sổ in — hãy cho phép popup', 'error'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
  } catch (e) {
    toast('Không mở được cửa sổ in', 'error');
  }
}

/* ================= VIEW: PACKAGES ================= */
function packagesView() {
  const list = state.packages.slice().sort((a, b) => (+a.price) - (+b.price));
  return `
  <div class="toolbar">
    <span style="font-size:13px;color:var(--text-2)">${state.packages.filter(p => p.active).length} gói đang hoạt động</span>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openPackageModal()">${icon('plus')} Thêm gói dịch vụ</button>
  </div>
  <div class="pkg-grid">
    ${list.map(p => `
    <div class="card pkg-card ${p.active ? '' : 'off'}">
      <div class="pkg-top">
        <div class="pkg-name">${esc(p.name)}</div>
        <span class="badge ${CAT_CLS[p.category] || 'b-cat-khac'}">${esc(p.category)}</span>
      </div>
      <div class="pkg-price">${fmtMoney(p.price)}</div>
      <div class="pkg-dur">${icon('clock')} ${p.hours} giờ / buổi</div>
      <ul class="pkg-includes">
        ${String(p.includes || '').split('|').filter(Boolean).map(x => `<li>${esc(x.trim())}</li>`).join('')}
      </ul>
      <div class="pkg-foot">
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="openPackageModal('${p.id}')">${icon('edit')} Sửa</button>
        <button class="btn btn-danger btn-sm" onclick="deletePackage('${p.id}')">${icon('trash')}</button>
      </div>
    </div>`).join('') || `<div class="card empty" style="grid-column:1/-1">${iconWrap('package')}<h4>Chưa có gói dịch vụ</h4><p>Tạo gói đầu tiên để bắt đầu bán.</p><button class="btn btn-primary" onclick="openPackageModal()">${icon('plus')} Thêm gói dịch vụ</button></div>`}
  </div>`;
}

function openPackageModal(id) {
  const p = id ? byId(state.packages, id) : null;
  const catOpts = CATS.map(c => `<option value="${c}" ${p && p.category === c ? 'selected' : ''}>${c}</option>`).join('');
  openModal(`
    <div class="modal-head"><h3>${p ? 'Sửa gói dịch vụ' : 'Thêm gói dịch vụ'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field full"><label>Tên gói <span class="req">*</span></label><input class="input" name="name" required value="${esc(p ? p.name : '')}" placeholder="VD: Cưới — Eternal Love"></div>
      <div class="field"><label>Loại</label><select class="select" name="category">${catOpts}</select></div>
      <div class="field"><label>Giá (₫) <span class="req">*</span></label><input class="input" name="price" type="number" min="0" step="1000" required value="${p ? p.price : ''}" placeholder="15000000"></div>
      <div class="field"><label>Thời lượng (giờ)</label><input class="input" name="hours" type="number" min="0.5" step="0.5" value="${p ? p.hours : 2}"></div>
      <div class="field"><label>Trạng thái</label>
        <div class="checkbox-row" style="padding-top:9px"><input type="checkbox" id="pkgActive" ${!p || p.active ? 'checked' : ''}><label for="pkgActive">Đang bán</label></div>
      </div>
      <div class="field full"><label>Danh mục bao gồm</label>
        <textarea class="textarea" name="includes" placeholder="Mỗi hạng mục một dòng, phân cách bằng dấu |">${esc(p ? p.includes : '')}</textarea>
        <div class="form-hint">VD: 200 ảnh chỉnh sửa | Album 30×30 | Phóng ảnh 60×90</div>
      </div>
    </form>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="savePackage('${id || ''}')">${icon('check')} Lưu</button>
    </div>`);
}

function savePackage(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const data = {
    name: fd.get('name').trim(), category: fd.get('category'),
    price: Math.round(+fd.get('price') || 0), hours: +fd.get('hours') || 1,
    includes: fd.get('includes').trim(), active: $('#pkgActive').checked,
  };
  if (id) {
    Object.assign(byId(state.packages, id), data);
    toast('Đã cập nhật gói dịch vụ');
  } else {
    state.packages.push(Object.assign({ id: uid() }, data));
    toast('Đã thêm gói dịch vụ mới');
  }
  save(); closeModal(); render();
}

function deletePackage(id) {
  const p = byId(state.packages, id);
  if (!p) return;
  const used = state.bookings.filter(b => b.packageId === id).length;
  if (used) { toast(`Không thể xóa: gói đang được dùng trong ${used} lịch chụp`, 'error'); return; }
  confirmDialog('Xóa gói dịch vụ?', `Xóa gói <b>${esc(p.name)}</b>?`, 'Xóa', () => {
    state.packages = state.packages.filter(x => x.id !== id);
    save(); render(); toast('Đã xóa gói dịch vụ');
  });
}

/* ================= VIEW: STAFF ================= */
function staffView() {
  const list = state.staff.filter(s => branchMatch(s));
  return `
  <div class="toolbar">
    <span style="font-size:13px;color:var(--text-2)">${list.length} thành viên ekip</span>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openStaffModal()">${icon('plus')} Thêm nhân sự</button>
  </div>
  <div class="card list-wrap">
    <div class="table-wrap">
    <table>
      <thead><tr><th>Nhân sự</th><th>Vai trò</th><th>Số điện thoại</th><th>Email</th><th class="ta-c">Lịch chụp tới</th><th class="ta-c">Thao tác</th></tr></thead>
      <tbody>
      ${list.map(s => {
        const upcoming = state.bookings.filter(b => b.photographerId === s.id && b.date >= todayStr() && b.status !== 'cancelled').length;
        return `<tr>
          <td><div style="display:flex;align-items:center;gap:11px;">
            <div class="avatar" style="width:34px;height:34px;font-size:11.5px;">${esc(initials(s.name))}</div>
            <div class="cell-main">${esc(s.name)} ${s.active ? '' : '<span class="badge b-inactive">Nghỉ</span>'}</div>
          </div></td>
          <td><span class="badge b-role-${s.role}">${ROLES[s.role]}</span></td>
          <td class="money-muted">${esc(s.phone || '—')}</td>
          <td class="money-muted">${esc(s.email || '—')}</td>
          <td class="ta-c money-muted">${upcoming}</td>
          <td class="cell-actions ta-c">
            <button class="icon-btn" title="Sửa" onclick="openStaffModal('${s.id}')">${icon('edit')}</button>
            <button class="icon-btn danger" title="Xóa" onclick="deleteStaff('${s.id}')">${icon('trash')}</button>
          </td>
        </tr>`;
      }).join('') || emptyRow(6, 'Chưa có nhân sự')}
      </tbody>
    </table>
    </div>
  </div>`;
}

function openStaffModal(id) {
  const s = id ? byId(state.staff, id) : null;
  const roleOpts = Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${s && s.role === k ? 'selected' : ''}>${v}</option>`).join('');
  openModal(`
    <div class="modal-head"><h3>${s ? 'Sửa nhân sự' : 'Thêm nhân sự'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field"><label>Họ và tên <span class="req">*</span></label><input class="input" name="name" required value="${esc(s ? s.name : '')}"></div>
      <div class="field"><label>Vai trò</label><select class="select" name="role">${roleOpts}</select></div>
      <div class="field"><label>Ca làm việc</label><select class="select" name="shift">${Object.entries(SHIFTS).map(([k, v]) => `<option value="${k}" ${s && s.shift === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select><div class="form-hint">Giờ chuẩn để tính đi muộn / về sớm khi chấm công</div></div>
      <div class="field"><label>Bộ phận</label><select class="select" name="deptId"><option value="">— Chưa gán —</option>${state.departments.map(d => `<option value="${d.id}" ${s && s.deptId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Chi nhánh</label><select class="select" name="branchId">${state.branches.map(x => `<option value="${x.id}" ${(s ? s.branchId === x.id : x.id === curBranchId()) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Mục tiêu doanh số / tháng (₫)</label><input class="input" name="target" type="number" min="0" step="1000000" value="${s ? (+s.target || 0) : 0}"></div>
      <div class="field"><label>Số điện thoại</label><input class="input" name="phone" value="${esc(s ? s.phone : '')}"></div>
      <div class="field"><label>Email</label><input class="input" name="email" type="email" value="${esc(s ? s.email : '')}"></div>
      <div class="field"><label>Cách tính lương</label><select class="select" name="payMode">
        <option value="monthly" ${!s || s.payMode !== 'hourly' ? 'selected' : ''}>Lương cố định / tháng</option>
        <option value="hourly" ${s && s.payMode === 'hourly' ? 'selected' : ''}>Lương theo giờ (chấm công)</option>
      </select></div>
      <div class="field"><label>Lương cố định / tháng (₫)</label><input class="input" name="salary" type="number" min="0" step="500000" value="${s ? (+s.salary || 0) : 0}"></div>
      <div class="field"><label>Lương theo giờ (₫/h)</label><input class="input" name="hourlyRate" type="number" min="0" step="1000" value="${s ? (+s.hourlyRate || 0) : 0}"><div class="form-hint">Tháng đó: giờ chấm công × lương giờ</div></div>
      <div class="field"><label>Hoa hồng doanh thu (%)</label><input class="input" name="commissionPct" type="number" min="0" max="100" step="0.5" value="${s ? (+s.commissionPct || 0) : 0}"><div class="form-hint">Tính trên tổng đơn hàng của buổi chụp nhân sự này phụ trách</div></div>
      <div class="field"><label>Trạng thái</label>
        <div class="checkbox-row" style="padding-top:9px"><input type="checkbox" id="staffActive" ${!s || s.active ? 'checked' : ''}><label for="staffActive">Đang làm việc</label></div>
      </div>
    </form>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveStaff('${id || ''}')">${icon('check')} Lưu</button>
    </div>`);
}

function saveStaff(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const data = {
    name: fd.get('name').trim(), role: fd.get('role'), shift: fd.get('shift'),
    deptId: fd.get('deptId') || '', target: Math.round(+fd.get('target') || 0),
    branchId: fd.get('branchId') || curBranchId(),
    phone: fd.get('phone').trim(), email: fd.get('email').trim(),
    salary: Math.round(+fd.get('salary') || 0), commissionPct: +fd.get('commissionPct') || 0,
    payMode: fd.get('payMode') || 'monthly', hourlyRate: Math.round(+fd.get('hourlyRate') || 0),
    active: $('#staffActive').checked,
  };
  if (id) {
    Object.assign(byId(state.staff, id), data);
    toast('Đã cập nhật nhân sự');
  } else {
    state.staff.push(Object.assign({ id: uid() }, data));
    toast('Đã thêm nhân sự');
  }
  save(); closeModal(); render();
}

function deleteStaff(id) {
  const s = byId(state.staff, id);
  if (!s) return;
  const used = state.bookings.filter(b => b.photographerId === id).length;
  if (used) { toast(`Không thể xóa: đang phân công trong ${used} lịch chụp`, 'error'); return; }
  confirmDialog('Xóa nhân sự?', `Xóa <b>${esc(s.name)}</b> khỏi ekip?`, 'Xóa', () => {
    state.staff = state.staff.filter(x => x.id !== id);
    save(); render(); toast('Đã xóa nhân sự');
  });
}

/* ================= VIEW: SETTINGS ================= */
function settingsView() {
  const st = state.settings;
  const card = (ic, tint, title, desc, btnHtml = '', soon = false) => `
    <div class="card pkg-card" ${soon ? 'style="opacity:.62"' : ''}>
      <div class="pkg-top"><div class="pkg-name">${title}</div>${soon ? '<span class="badge b-pending">Sắp ra mắt</span>' : ''}</div>
      <div class="stat-icon ${tint}" style="margin-bottom:10px">${icon(ic)}</div>
      <p style="font-size:12.5px;color:var(--text-2);line-height:1.6;flex:1">${desc}</p>
      ${btnHtml ? `<div class="pkg-foot">${btnHtml}</div>` : ''}
    </div>`;
  const group = (name, cards) => `<div style="flex:1;min-width:290px"><div class="nav-group" style="padding-left:2px">${name}</div><div style="display:grid;gap:12px">${cards}</div></div>`;
  const wrap = (html) => `<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">${html}</div>`;
  const btn = (label, fn) => `<button class="btn btn-ghost btn-sm" style="flex:1" onclick="${fn}">${label}</button>`;

  const deptCount = state.departments.length;
  const roleCount = Object.keys(PERM_PRESETS).length - 1 + state.roleGroups.length;
  return wrap(
    group('Cấu hình vận hành',
      card('camera', 'tint-indigo', 'Thông tin Studio', 'Tên, liên hệ, địa chỉ (in trên hóa đơn &amp; hợp đồng) và giờ làm việc chuẩn.', btn('Cấu hình', 'openStudioModal()'))
      + card('users', 'tint-blue', `Danh sách bộ phận (${deptCount})`, 'Quản lý phòng ban / bộ phận của studio; gắn nhân sự vào bộ phận ở màn Nhân sự.', btn('Quản lý', 'openDeptsModal()'))
      + card('pin', 'tint-violet', `Quản lý chi nhánh (${state.branches.length})`, 'Tạo và quản lý chi nhánh 1, 2, 3... — mỗi chi nhánh có lịch chụp, nhân sự, chi phí riêng; lọc nhanh bằng bộ chọn trên thanh trên.', btn('Quản lý', 'openBranchesModal()'))
      + card('alert', 'tint-cyan', 'Thông báo đẩy (Web Push)', st.pushOn
          ? `Đang bật — trình duyệt sẽ nhận thông báo khi có lịch chụp hôm nay.`
          : 'Nhận thông báo trên desktop về lịch chụp hôm nay khi đăng nhập.', `<div style="display:flex;gap:6px"><button class="btn ${st.pushOn ? 'btn-danger' : 'btn-primary'} btn-sm" style="flex:1" onclick="togglePush()">${st.pushOn ? 'Tắt' : 'Bật thông báo'}</button>${st.pushOn ? btn('Thử', 'testPush()') : ''}</div>`)
    )
    + group('Tài chính & Thanh toán',
      card('money', 'tint-green', 'Mục tiêu doanh số', 'Đặt mục tiêu doanh thu tháng cho từng nhân sự và theo dõi tiến độ tự động từ đơn hàng.', btn('Thiết lập', 'openTargetsModal()'))
      + card('card', 'tint-green', 'Thanh toán QR (VietQR)', `Tài khoản nhận tiền: <b>${bankCfg().accountNo ? bankLabel(bankCfg()) + ' · ' + esc(bankCfg().accountNo) : 'chưa cấu hình'}</b>. Sinh QR đúng số tiền + mã đơn — khách quét chuyển khoản bằng app ngân hàng.`, btn('Cấu hình', 'openBankQrModal()'))
      + card('card', 'tint-red', 'Kết nối SePay (biến động số dư)', 'Nhận biến động số dư ngân hàng theo thời gian thực — giao dịch nào về sẽ hiện ngay trong mục Thu chi, tự đối soát đơn hàng.', btn('Mở', 'openSepayModal()'))
    )
    + group('Dữ liệu & Tích hợp',
      card('download', 'tint-violet', 'Sao lưu & Khôi phục', `Xuất/nhập backup JSON, khôi phục dữ liệu mẫu, xóa dữ liệu. Tự động tải backup mỗi ngày.${st.autoBackup && st.lastBackupAt ? '<br>Lần cuối: ' + fmtDate(st.lastBackupAt) : ''}`, btn('Mở', 'openBackupModal()'))
      + card('upload', 'tint-amber', 'Khởi tạo nhanh bằng Excel', 'Nhập khách hàng hàng loạt từ file Excel/CSV (tải mẫu sẵn, mở bằng Excel).', btn('Nhập dữ liệu', 'openCsvImportModal()'))
      + card('package', 'tint-amber', 'Dữ liệu Sumanage', 'Nhập đơn hàng, khách hàng từ file Excel hệ thống Sumanage.', '', true)
      + card('refresh', 'tint-cyan', 'Quản lý AI (API Key)', 'Lưu API key cho các tính năng AI trong tương lai (soạn hợp đồng, gợi ý phản hồi khách).', btn('Cấu hình', 'openAiKeyModal()'))
    )
    + group('Bảo mật & Nhân sự',
      card('lock', 'tint-indigo', `Nhóm quyền (${roleCount})`, 'Các mẫu quyền có sẵn và nhóm quyền tùy chỉnh — dùng khi tạo tài khoản nhân viên.', btn('Quản lý', 'openRolesModal()'))
    )
  );
}

function openStudioModal() {
  const st = state.settings;
  openModal(`
    <div class="modal-head"><h3>Thông tin Studio</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frmStudio" class="modal-body form-grid" onsubmit="return false;">
      <div class="field full"><label>Tên studio</label><input class="input" name="studioName" value="${esc(st.studioName)}"></div>
      <div class="field"><label>Điện thoại</label><input class="input" name="phone" value="${esc(st.phone)}"></div>
      <div class="field"><label>Email</label><input class="input" name="email" value="${esc(st.email)}"></div>
      <div class="field full"><label>Địa chỉ</label><input class="input" name="address" value="${esc(st.address)}"></div>
      <div class="field"><label>Giờ làm việc — giờ vào</label><input class="input" type="time" name="workStart" value="${esc(st.workStart || '09:00')}"></div>
      <div class="field"><label>Giờ làm việc — giờ ra</label><input class="input" type="time" name="workEnd" value="${esc(st.workEnd || '18:00')}"></div>
      <div class="field full" style="background:#f8fafc;border:1px solid var(--border);border-radius:12px;padding:12px 14px">
        <label style="font-weight:700">📍 Vị trí chấm công (GPS)</label>
        <p style="font-size:11.5px;color:var(--text-3);margin:4px 0 8px">Đây là vị trí <b>mặc định</b> cho nhân sự chưa gán chi nhánh. Mỗi chi nhánh cấu hình vị trí riêng trong <b>Hệ thống → Chi nhánh</b>. Khi chấm công, app so với vị trí gần nhất.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input class="input" name="studioLat" style="max-width:130px" placeholder="Vĩ độ (lat)" value="${st.studioLat || ''}">
          <input class="input" name="studioLng" style="max-width:130px" placeholder="Kinh độ (lng)" value="${st.studioLng || ''}">
          <input class="input" name="studioRadius" type="number" min="50" step="50" style="max-width:110px" title="Bán kính cho phép (mét)" value="${st.studioRadius || 200}">
          <button type="button" class="btn btn-ghost btn-sm" onclick="fillStudioGeo()">${icon('pin')} Lấy vị trí hiện tại</button>
          <span class="cell-sub">bán kính m</span>
        </div>
      </div>
    </form>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveStudioInfo()">${icon('check')} Lưu</button>
    </div>`);
}

async function fillStudioGeo() {
  toast('Đang lấy vị trí GPS…');
  const g = await getPunchGeo();
  if (!g) { toast('Không lấy được vị trí — kiểm tra quyền vị trí của trình duyệt', 'error'); return; }
  $('#frmStudio [name=studioLat]').value = g.lat;
  $('#frmStudio [name=studioLng]').value = g.lng;
  toast('Đã lấy toạ độ ✓ — bấm Lưu để áp dụng');
}

function saveStudioInfo() {
  const fd = new FormData($('#frmStudio'));
  state.settings.studioName = fd.get('studioName').trim() || 'Studio';
  state.settings.phone = fd.get('phone').trim();
  state.settings.email = fd.get('email').trim();
  state.settings.address = fd.get('address').trim();
  state.settings.workStart = fd.get('workStart') || '09:00';
  state.settings.workEnd = fd.get('workEnd') || '18:00';
  state.settings.studioLat = fd.get('studioLat').trim() || '';
  state.settings.studioLng = fd.get('studioLng').trim() || '';
  state.settings.studioRadius = +fd.get('studioRadius') || 200;
  document.title = state.settings.studioName + ' — CRM';
  logAction('update', 'settings', 'Thông tin studio');
  save(); closeModal(); render(); toast('Đã lưu cài đặt');
}

/* ---- Bộ phận ---- */
function openDeptsModal() {
  const rows = state.departments.map(d => `
    <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:10px;padding:10px 13px;margin-bottom:7px">
      <b style="flex:1;font-size:13.5px">${esc(d.name)}</b>
      <span class="badge b-cat-khac">${state.staff.filter(s => s.deptId === d.id).length} nhân sự</span>
      <button class="icon-btn danger" onclick="deleteDept('${d.id}')">${icon('trash')}</button>
    </div>`).join('');
  openModal(`
    <div class="modal-head"><h3>Danh sách bộ phận</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      ${rows || '<p style="font-size:13px;color:var(--text-3)">Chưa có bộ phận nào.</p>'}
      <div style="display:flex;gap:8px;margin-top:10px">
        <input class="input" id="deptName" placeholder="Tên bộ phận mới — VD: Hậu kỳ, Kinh doanh...">
        <button class="btn btn-primary" onclick="addDept()">${icon('plus')} Thêm</button>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Đóng</button></div>`, 'sm');
}

function addDept() {
  const name = $('#deptName').value.trim();
  if (!name) { toast('Nhập tên bộ phận', 'error'); return; }
  state.departments.push({ id: uid(), name });
  logAction('create', 'settings', 'Bộ phận: ' + name);
  save(); openDeptsModal(); toast('Đã thêm bộ phận');
}

function deleteDept(id) {
  const d = byId(state.departments, id);
  if (!d) return;
  const used = state.staff.filter(s => s.deptId === id).length;
  if (used) { toast(`Không thể xóa: ${used} nhân sự đang thuộc bộ phận này`, 'error'); return; }
  state.departments = state.departments.filter(x => x.id !== id);
  logAction('delete', 'settings', 'Bộ phận: ' + d.name);
  save(); openDeptsModal(); toast('Đã xóa bộ phận');
}

/* ---- Thông báo đẩy ---- */
async function togglePush() {
  if (state.settings.pushOn) {
    state.settings.pushOn = false; save(); render(); toast('Đã tắt thông báo đẩy');
    return;
  }
  let perm = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; } }
  if (perm !== 'granted') { toast('Trình duyệt từ chối quyền thông báo — kiểm tra cài đặt site', 'error'); return; }
  state.settings.pushOn = true;
  save(); render();
  testPush();
}

function pushNotify(title, body) {
  try { if (state.settings.pushOn && typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title, { body }); } catch (e) { }
}

function testPush() { pushNotify(state.settings.studioName, '✅ Thông báo đẩy hoạt động — bạn sẽ nhận nhắc lịch chụp khi đăng nhập!'); }

function notifyTodayBookings() {
  const t = upcomingBookings(0).filter(b => b.date === todayStr() && b.status !== 'cancelled');
  if (t.length) pushNotify('📅 Hôm nay có ' + t.length + ' buổi chụp', t.slice(0, 3).map(b => b.startTime + ' ' + custName(b.customerId)).join(', '));
}

/* ---- Mục tiêu doanh số ---- */
function staffMonthRevenue(staffId, month) {
  const bkIds = state.bookings.filter(b => b.photographerId === staffId && (b.date || '').startsWith(month) && b.status !== 'cancelled').map(b => b.id);
  return state.orders.filter(o => o.bookingId && bkIds.includes(o.bookingId) && o.status !== 'cancelled').reduce((t, o) => t + orderTotal(o), 0);
}

function openTargetsModal() {
  const m = monthKey(0);
  const rows = state.staff.filter(s => s.active).map(s => {
    const rev = staffMonthRevenue(s.id, m);
    const pct = s.target ? Math.min(100, Math.round(rev / s.target * 100)) : 0;
    return `<tr>
      <td><div class="cell-main">${esc(s.name)}</div></td>
      <td><input class="input" style="width:130px" type="number" min="0" step="1000000" value="${+s.target || 0}" data-stid="${s.id}"></td>
      <td class="money-green ta-r">${fmtMoney(rev)}</td>
      <td style="min-width:110px"><div class="pay-progress" style="margin:0"><div style="width:${pct}%"></div></div><div class="cell-sub ta-r">${pct}%</div></td>
    </tr>`;
  }).join('');
  openModal(`
    <div class="modal-head"><h3>Mục tiêu doanh số — tháng ${m.slice(5)}/${m.slice(0, 4)}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body table-wrap">
      <table style="min-width:520px"><thead><tr><th>Nhân sự</th><th>Mục tiêu (₫/tháng)</th><th class="ta-r">Đã đạt</th><th>Tiến độ</th></tr></thead>
      <tbody id="targetRows">${rows}</tbody></table>
      <div class="form-hint" style="margin-top:8px">Doanh số tính từ đơn hàng của các buổi chụp nhân sự phụ trách trong tháng hiện tại.</div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="saveTargets()">${icon('check')} Lưu mục tiêu</button></div>`, 'lg');
}

function saveTargets() {
  $$('#targetRows input').forEach(inp => {
    const s = byId(state.staff, inp.dataset.stid);
    if (s) s.target = Math.round(+inp.value || 0);
  });
  logAction('update', 'settings', 'Mục tiêu doanh số nhân sự');
  save(); closeModal(); toast('Đã lưu mục tiêu doanh số');
}

/* ---- Sao lưu & Khôi phục ---- */
function openBackupModal() {
  const st = state.settings;
  openModal(`
    <div class="modal-head"><h3>Sao lưu & Khôi phục</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="checkbox-row" style="margin-bottom:6px"><input type="checkbox" id="bkAuto" ${st.autoBackup ? 'checked' : ''} onchange="state.settings.autoBackup=this.checked;save();toast(this.checked?'Đã bật tự động backup hằng ngày':'Đã tắt tự động backup')"><label for="bkAuto"><b>Tự động tải backup JSON mỗi ngày</b> (lần mở app đầu tiên trong ngày)</label></div>
      ${st.lastBackupAt ? `<p style="font-size:12px;color:var(--text-3);margin:4px 0 10px">Lần backup cuối: ${fmtDateTime(st.lastBackupAt)}</p>` : ''}
      <div class="data-action">${iconWrap('download')}<div class="txt" style="flex:1"><b>Xuất dữ liệu (backup)</b><span>Tải toàn bộ dữ liệu dạng JSON</span></div><button class="btn btn-ghost btn-sm" onclick="exportData()">Xuất file</button></div>
      <div class="data-action">${iconWrap('upload')}<div class="txt" style="flex:1"><b>Nhập dữ liệu</b><span>Khôi phục từ file backup JSON</span></div><button class="btn btn-ghost btn-sm" onclick="closeModal();$('#importFile').click()">Chọn file</button></div>
      <div class="data-action">${iconWrap('refresh')}<div class="txt" style="flex:1"><b>Khôi phục dữ liệu mẫu</b><span>Thay bằng bộ dữ liệu mẫu ban đầu</span></div><button class="btn btn-ghost btn-sm" onclick="resetData()">Khôi phục</button></div>
      <div class="data-action">${iconWrap('trash')}<div class="txt" style="flex:1"><b>Xóa toàn bộ dữ liệu</b><span>Bắt đầu lại — không khôi phục được</span></div><button class="btn btn-danger btn-sm" onclick="clearAll()">Xóa hết</button></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Đóng</button></div>`);
}

function autoBackupIfNeeded() {
  const st = state.settings;
  if (!st.autoBackup) return;
  const last = st.lastBackupAt ? new Date(st.lastBackupAt) : new Date(0);
  if (Date.now() - last.getTime() < 24 * 3600 * 1000) return;
  try {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `autobackup-studio-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    st.lastBackupAt = new Date().toISOString();
    save();
    toast('Đã tự động backup dữ liệu hôm nay ✓');
  } catch (e) { }
}

/* ---- Nhập Excel/CSV ---- */
function openCsvImportModal() {
  openModal(`
    <div class="modal-head"><h3>Khởi tạo nhanh bằng Excel</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:12px">Nhập <b>khách hàng</b> hàng loạt từ file Excel/CSV. Mỗi dòng: <b>Tên; Điện thoại; Email; Địa chỉ</b> (dấu chấm phẩy, bỏ qua dòng tiêu đề).</p>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="btn btn-ghost btn-sm" onclick="downloadCsvTemplate()">Tải file mẫu</button>
        <button class="btn btn-primary btn-sm" style="flex:1" onclick="$('#csvFile').click()">Chọn file Excel/CSV</button>
      </div>
      <div id="csvResult"></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Đóng</button></div>`, 'sm');
}

function downloadCsvTemplate() {
  const csv = '\uFEFF' + 'Tên;Điện thoại;Email;Địa chỉ\r\nNguyễn Văn A;0901234567;a@gmail.com;Q.1\r\nTrần Thị B;0907654321;b@gmail.com;Q.3';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'mau-khach-hang.csv';
  a.click(); URL.revokeObjectURL(a.href);
}

function doImportCsv(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let added = 0, skipped = 0;
    String(reader.result).replace(/^\uFEFF/, '').split(/\r?\n/).forEach(line => {
      if (!line.trim()) return;
      const cols = line.split(/[;,\t]/).map(c => c.trim().replace(/^"|"$/g, ''));
      const name = cols[0] || '';
      if (!name || /tên/i.test(name)) { if (cols[0]) skipped++; return; }
      if (state.customers.some(c => c.phone && cols[1] && c.phone.replace(/\s/g, '') === cols[1].replace(/\s/g, ''))) { skipped++; return; }
      state.customers.push({ id: uid(), name, type: 'individual', phone: cols[1] || '', email: cols[2] || '', address: cols[3] || '', notes: 'Nhập từ Excel', createdAt: todayStr() });
      added++;
    });
    logAction('data', 'customer', `Nhập Excel: thêm ${added}, bỏ qua ${skipped}`);
    save();
    const box = $('#csvResult');
    if (box) box.innerHTML = `<div class="auth-error" style="background:#ecfdf5;border-color:#a7f3d0;color:#047857">${icon('check')} Đã thêm ${added} khách hàng, bỏ qua ${skipped} dòng (trùng hoặc tiêu đề)</div>`;
    toast(`Đã nhập ${added} khách hàng từ Excel`);
  };
  reader.readAsText(file, 'UTF-8');
}

/* ---- Nhóm quyền tùy chỉnh ---- */
function presetOptionsHtml(selected) {
  let html = Object.entries(PERM_PRESETS).map(([k, v]) => `<option value="${k}" ${selected === k ? 'selected' : ''}>${v.label}</option>`).join('');
  html += state.roleGroups.map(g => `<option value="g:${g.id}" ${selected === 'g:' + g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
  return html;
}

function openRolesModal() {
  const rows = state.roleGroups.map(g => `
    <div style="border:1px solid var(--border);border-radius:10px;padding:10px 13px;margin-bottom:7px">
      <div style="display:flex;align-items:center;gap:10px">
        <b style="flex:1;font-size:13.5px">${esc(g.name)}</b>
        <button class="icon-btn danger" onclick="deleteRoleGroup('${g.id}')">${icon('trash')}</button>
      </div>
      <div class="cell-sub" style="margin-top:4px">${g.perms.map(p => (PERM_MODULES.find(m => m[0] === p) || ['', p])[1]).join(' · ')}</div>
    </div>`).join('');
  const builtIn = Object.entries(PERM_PRESETS).filter(([k]) => k !== 'custom').map(([, v]) => `<span class="badge b-cat-khac" style="margin:2px">${v.label}</span>`).join(' ');
  openModal(`
    <div class="modal-head"><h3>Nhóm quyền</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <p style="font-size:12px;color:var(--text-3);margin-bottom:6px">Mẫu có sẵn:</p>
      <div style="margin-bottom:12px">${builtIn}</div>
      <p style="font-size:12px;color:var(--text-3);margin-bottom:6px">Nhóm tùy chỉnh:</p>
      ${rows || '<p style="font-size:13px;color:var(--text-3);margin-bottom:8px">Chưa có nhóm tùy chỉnh nào.</p>'}
      <button class="btn btn-primary btn-sm" onclick="openRoleGroupModal()">${icon('plus')} Thêm nhóm quyền mới</button>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Đóng</button></div>`);
}

function openRoleGroupModal(id) {
  const g = id ? byId(state.roleGroups, id) : null;
  openModal(`
    <div class="modal-head"><h3>${g ? 'Sửa nhóm quyền' : 'Thêm nhóm quyền'}</h3><button class="icon-btn" onclick="openRolesModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="field"><label>Tên nhóm <span class="req">*</span></label><input class="input" id="rgName" value="${esc(g ? g.name : '')}" placeholder="VD: Cộng tác viên"></div>
      <div class="field"><label>Quyền truy cập</label><div class="perm-grid">
        ${PERM_MODULES.map(([k, lbl]) => `<label class="perm-check"><input type="checkbox" class="perm-cb" value="${k}" ${g && g.perms.includes(k) ? 'checked' : ''}><span>${lbl}</span></label>`).join('')}
      </div></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="openRolesModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveRoleGroup('${id || ''}')">${icon('check')} Lưu</button>
    </div>`, 'sm');
}

function saveRoleGroup(id) {
  const name = $('#rgName').value.trim();
  if (!name) { toast('Nhập tên nhóm', 'error'); return; }
  const perms = $$('.perm-cb').filter(cb => cb.checked).map(cb => cb.value);
  if (!perms.length) { toast('Chọn ít nhất một phân hệ', 'error'); return; }
  if (id) { Object.assign(byId(state.roleGroups, id), { name, perms }); }
  else state.roleGroups.push({ id: uid(), name, perms });
  logAction(id ? 'update' : 'create', 'user', 'Nhóm quyền: ' + name);
  save(); openRolesModal(); toast('Đã lưu nhóm quyền');
}

function deleteRoleGroup(id) {
  const g = byId(state.roleGroups, id);
  if (!g) return;
  state.roleGroups = state.roleGroups.filter(x => x.id !== id);
  logAction('delete', 'user', 'Nhóm quyền: ' + g.name);
  save(); openRolesModal(); toast('Đã xóa nhóm quyền');
}

/* ---- AI API Key ---- */
function openAiKeyModal() {
  openModal(`
    <div class="modal-head"><h3>Quản lý AI — API Key</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="field"><label>API Key (dùng chung)</label><input class="input" id="aiKey" type="password" value="${esc(state.settings.aiApiKey || '')}" placeholder="sk-..."></div>
      <div class="form-hint">Được lưu ngay trên máy bạn (localStorage). Dành cho các tính năng AI sắp có: soạn hợp đồng thông minh hơn, gợi ý phản hồi khách.</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveAiKey()">${icon('check')} Lưu</button>
    </div>`, 'sm');
}

function saveAiKey() {
  state.settings.aiApiKey = $('#aiKey').value.trim();
  logAction('update', 'settings', 'API Key AI');
  save(); closeModal(); toast('Đã lưu API key');
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup-studio-crm-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  logAction('data', 'system', 'Xuất backup JSON');
  save();
  toast('Đã xuất file backup');
}

function doImport(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.customers) || !Array.isArray(parsed.orders)) throw new Error('invalid');
      state = Object.assign(blankState(), parsed);
      state.settings = Object.assign(blankState().settings, parsed.settings || {});
      if (!Array.isArray(parsed.taskColumns)) {
        state.taskColumns = defaultTaskColumns();
        state.tasks = sampleTasks();
      }
      if (!Array.isArray(parsed.outfits)) {
        state.outfits = seedOutfits();
        state.concepts = seedConcepts();
        state.loans = seedLoans();
      }
      if (!Array.isArray(parsed.users)) state.users = [];
      migrateLegacy(parsed);
      save(); render(); toast('Đã nhập dữ liệu từ backup');
      logAction('data', 'system', 'Nhập backup từ file JSON');
      const su = currentUser();
      if (!su || !byId(state.users, su.id)) {
        // Đẩy dữ liệu lên server TRƯỚC khi đăng xuất (tránh mất dữ liệu vừa nhập trên bản online)
        if (SERVER_MODE) { try { await pushState(); } catch (e) { } }
        logout();
      }
    } catch (e) {
      toast('File không hợp lệ — cần file backup JSON của app', 'error');
    }
  };
  reader.readAsText(file);
}

function resetData() {
  confirmDialog('Khôi phục dữ liệu mẫu?', 'Toàn bộ dữ liệu hiện tại sẽ bị <b>thay thế</b> bằng bộ dữ liệu mẫu. Nên xuất backup trước.', 'Khôi phục', () => {
    state = seedData(); save(); render();
    logAction('data', 'system', 'Khôi phục dữ liệu mẫu');
    save(); render();
    toast('Đã khôi phục dữ liệu mẫu');
  }, false);
}

function clearAll() {
  confirmDialog('Xóa toàn bộ dữ liệu?', 'Mọi khách hàng, lịch chụp, đơn hàng... sẽ bị xóa vĩnh viễn. Hành động này <b>không thể hoàn tác</b>.', 'Xóa hết', () => {
    state = blankState(); save();
    logAction('data', 'system', 'Xóa toàn bộ dữ liệu');
    save(); render();
    toast('Đã xóa toàn bộ dữ liệu');
  });
}

/* ================= AUTH & PHÂN QUYỀN ================= */
const SESSION_KEY = 'mementoCRM_session';
let __currentUserId = null;

const PERM_MODULES = [
  ['dashboard', 'Tổng quan'],
  ['bookings', 'Lịch chụp'],
  ['orders', 'Đơn hàng'],
  ['finance', 'Tài chính & Lương'],
  ['contracts', 'Hợp đồng'],
  ['tasks', 'Bảng công việc'],
  ['attendance', 'Chấm công'],
  ['shiftplan', 'Chia ca làm việc'],
  ['albums', 'Album Khách Chọn'],
  ['photofilter', 'Lọc Ảnh'],
  ['wardrobe', 'Trang phục & Mượn đồ'],
  ['customers', 'Khách hàng'],
  ['packages', 'Gói dịch vụ'],
  ['staff', 'Nhân sự'],
  ['accounts', 'Tài khoản & Quyền'],
  ['notifications', 'Thông báo'],
  ['logs', 'Nhật ký thao tác'],
  ['changelog', 'Nhật ký cập nhật'],
  ['chats', 'Nhắn Tin'],
  ['settings', 'Cài đặt'],
];
const ALL_PERMS = PERM_MODULES.map(m => m[0]);
const PERM_PRESETS = {
  admin:        { label: 'Quản trị', perms: ALL_PERMS },
  reception:    { label: 'Lễ tân', perms: ['dashboard', 'bookings', 'orders', 'customers', 'tasks', 'wardrobe', 'attendance', 'notifications', 'albums', 'photofilter'] },
  photographer: { label: 'Thợ Chụp', perms: ['dashboard', 'bookings', 'tasks', 'wardrobe'] },
  editor:       { label: 'Hậu kỳ', perms: ['dashboard', 'tasks'] },
  custom:       { label: 'Tùy chỉnh', perms: null },
};
const NAV = [
  { group: 'Quản lý', items: [
    ['dashboard', 'Tổng quan', 'dashboard'],
    ['bookings', 'Lịch chụp', 'calendar'],
    ['orders', 'Đơn hàng', 'receipt'],
    ['finance', 'Tài chính & Lương', 'card'],
    ['contracts', 'Hợp đồng', 'receipt'],
    ['tasks', 'Bảng công việc', 'board'],
    ['attendance', 'Chấm công', 'clock'],
    ['shiftplan', 'Chia ca làm việc', 'calendar'],
    ['albums', 'Album Khách Chọn', 'camera'],
    ['photofilter', 'Lọc Ảnh', 'package'],
    ['wardrobe', 'Trang phục & Concept', 'shirt'],
  ]},
  { group: 'Danh mục', items: [
    ['customers', 'Khách hàng', 'users'],
    ['packages', 'Gói dịch vụ', 'package'],
    ['staff', 'Nhân sự', 'user'],
  ]},
  { group: 'Hệ thống', items: [
    ['accounts', 'Tài khoản & Quyền', 'lock'],
    ['notifications', 'Thông báo', 'alert'],
    ['logs', 'Nhật ký thao tác', 'clock'],
    ['changelog', 'Nhật ký cập nhật', 'arrow-up'],
    ['chats', 'Nhắn Tin', 'mail'],
    ['settings', 'Cài đặt', 'settings'],
  ]},
];

const currentUser = () => byId(state.users, __currentUserId) || null;
const can = perm => { const u = currentUser(); return !!u && !!u.active && u.perms.includes(perm); };
function firstView() {
  const order = ['dashboard', 'bookings', 'orders', 'tasks', 'wardrobe', 'customers', 'packages', 'staff', 'accounts', 'settings'];
  return order.find(v => can(v)) || null;
}

function renderNav() {
  let html = '';
  NAV.forEach(g => {
    const items = g.items.filter(it => can(it[0]));
    if (!items.length) return;
    html += `<div class="nav-group">${g.group}</div>` +
      items.map(it => `<a class="nav-item ${currentView === it[0] ? 'active' : ''}" data-view="${it[0]}" onclick="navigate('${it[0]}')"><svg class="icon"><use href="#i-${it[2]}"/></svg>${it[1]}</a>`).join('');
  });
  $('#navRoot').innerHTML = html;
}

async function hashPassword(pw) {
  const s = 'mcrm:' + pw;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'x' + h.toString(16);
  }
}

function presetShortLabel(u) {
  if (u.preset && u.preset.startsWith('g:')) {
    const g = byId(state.roleGroups, u.preset.slice(2));
    return g ? g.name : 'Nhóm đã xóa';
  }
  if (u.preset && u.preset !== 'custom' && PERM_PRESETS[u.preset]) return PERM_PRESETS[u.preset].label;
  return 'Tùy chỉnh · ' + u.perms.length + ' quyền';
}

function showAuth() {
  $('#authScreen').classList.add('show');
  renderAuthForm();
}

function renderAuthForm(err = '') {
  const box = $('#authBox');
  $('#authStudioName').textContent = (SERVER_MODE && __serverStudioName) || state.settings.studioName;
  // Chế độ server: căn cứ theo SERVER (máy mới localStorage trống nhưng server đã có tài khoản)
  const showRegister = SERVER_MODE && __serverHasUsers !== null ? !__serverHasUsers : !state.users.length;
  if (showRegister) {
    box.innerHTML = `
      <h2 class="auth-h">Tạo tài khoản quản trị</h2>
      <p class="auth-sub">Lần đầu sử dụng — hãy tạo tài khoản quản trị viên (đầy đủ quyền) cho studio.</p>
      ${err ? `<div class="auth-error">${icon('alert')} ${esc(err)}</div>` : ''}
      <form onsubmit="authRegister();return false;">
        <div class="field"><label>Tên hiển thị</label><input class="input" id="rgName" required placeholder="VD: Quản lý studio" autocomplete="name"></div>
        <div class="field"><label>Tên đăng nhập</label><input class="input" id="rgUser" required placeholder="VD: admin" autocomplete="username"></div>
        <div class="field"><label>Mật khẩu</label><input class="input" id="rgPass" type="password" required placeholder="Tối thiểu 4 ký tự" autocomplete="new-password"></div>
        <div class="field"><label>Nhập lại mật khẩu</label><input class="input" id="rgPass2" type="password" required autocomplete="new-password"></div>
        <button class="btn btn-primary btn-block" type="submit">${icon('check')} Tạo tài khoản &amp; bắt đầu</button>
      </form>`;
    setTimeout(() => { const el = $('#rgName'); if (el) el.focus(); }, 60);
  } else {
    box.innerHTML = `
      <h2 class="auth-h">Đăng nhập</h2>
      <p class="auth-sub">Chào mừng trở lại — ${esc(state.settings.studioName)}</p>
      ${err ? `<div class="auth-error">${icon('alert')} ${esc(err)}</div>` : ''}
      <form onsubmit="authLogin();return false;">
        <div class="field"><label>Tên đăng nhập</label><input class="input" id="lgUser" required autocomplete="username"></div>
        <div class="field"><label>Mật khẩu</label><input class="input" id="lgPass" type="password" required autocomplete="current-password"></div>
        <button class="btn btn-primary btn-block" type="submit">${icon('check')} Đăng nhập</button>
      </form>`;
    setTimeout(() => { const el = $('#lgUser'); if (el) el.focus(); }, 60);
  }
}

async function authLogin() {
  const username = $('#lgUser').value.trim().toLowerCase();
  const pass = $('#lgPass').value;
  let u = state.users.find(x => x.username.toLowerCase() === username);
  if (SERVER_MODE) {
    try {
      const r = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { renderAuthForm(j.error || 'Đăng nhập thất bại'); return; }
      API_TOKEN = j.token;
      localStorage.setItem('mementoCRM_token', j.token);
      try { adoptState(await loadFromServer()); } catch (e) { renderAuthForm('Không tải được dữ liệu từ máy chủ'); return; }
      u = byId(state.users, j.userId) || u;
    } catch (e) { renderAuthForm('Không kết nối được máy chủ'); return; }
  } else {
    const hash = await hashPassword(pass);
    if (!u || u.passHash !== hash) { renderAuthForm('Tên đăng nhập hoặc mật khẩu không đúng'); return; }
  }
  if (!u) { renderAuthForm('Không tìm thấy tài khoản'); return; }
  if (!u.active) { renderAuthForm('Tài khoản đã bị khóa — liên hệ quản trị viên'); return; }
  u.lastLogin = todayStr();
  logAction('login', 'user', u.username, u);
  save();
  startServerPoll();
  startApp(u.id, true);
}

async function authRegister() {
  // Chế độ server: nếu server ĐÃ có tài khoản thì không cho đăng ký nữa (tránh tạo account ma trên máy lẻ)
  if (SERVER_MODE) {
    try {
      const r = await fetch('/api/has-users');
      if (r.ok && (await r.json()).users > 0) { renderAuthForm('Máy chủ đã có tài khoản — vui lòng đăng nhập bằng tài khoản hiện có'); return; }
    } catch (e) { }
  }
  const name = $('#rgName').value.trim();
  const username = $('#rgUser').value.trim().toLowerCase();
  const pw = $('#rgPass').value;
  const pw2 = $('#rgPass2').value;
  if (pw.length < 4) { renderAuthForm('Mật khẩu tối thiểu 4 ký tự'); return; }
  if (pw !== pw2) { renderAuthForm('Hai mật khẩu không khớp nhau'); return; }
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) { renderAuthForm('Tên đăng nhập: 3–20 ký tự, chỉ chữ thường, số, dấu . và _'); return; }
  if (state.users.some(x => x.username === username)) { renderAuthForm('Tên đăng nhập đã tồn tại'); return; }
  state.users.push({
    id: uid(), username, passHash: await hashPassword(pw), name,
    staffId: '', preset: 'admin', perms: ALL_PERMS.slice(),
    active: true, lastLogin: todayStr(), createdAt: todayStr(),
  });
  logAction('create', 'user', username + ' (quản trị đầu tiên)', state.users[0]);
  save();
  if (SERVER_MODE) { try { await pushState(); } catch (e) { } } // chắc chắn tài khoản lên server rồi mới vào app
  startApp(state.users[0].id, false);
  toast('Đã tạo tài khoản quản trị — chào mừng!');
}

function startApp(userId, greet) {
  __currentUserId = userId;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
  $('#authScreen').classList.remove('show');
  closeModal();
  document.title = state.settings.studioName + ' — CRM';
  updateAuthUI();
  const h = (location.hash || '').replace('#', '');
  currentView = (VIEWS[h] && can(h)) ? h : (firstView() || 'dashboard');
  if (location.hash !== '#' + currentView) location.hash = currentView;
  render();
  const cu = currentUser();
  if (cu && cu.mustChangePwd) showChangePwd();
  else if (greet) toast('Xin chào ' + cu.name + '!');
  notifyTodayBookings();
  dailyNotifCheck();
  autoBackupIfNeeded();
}

function updateAuthUI() {
  const u = currentUser();
  if (!u) return;
  $('#sideAvatarTxt').textContent = initials(u.name);
  $('#sideUserName').textContent = u.name;
  $('#sideUserRole').textContent = presetShortLabel(u);
}

function logout() {
  const u = currentUser();
  if (u) { logAction('logout', 'user', u.username, u); save(); }
  if (__pollTimer) { clearInterval(__pollTimer); __pollTimer = null; }
  if (__hbTimer) { clearInterval(__hbTimer); __hbTimer = null; }
  if (SERVER_MODE && API_TOKEN) { try { fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: API_TOKEN }) }).catch(() => { }); } catch (e) { } }
  localStorage.removeItem(SESSION_KEY);
  API_TOKEN = '';
  localStorage.removeItem('mementoCRM_token');
  __currentUserId = null;
  __lastVer = null;
  closeModal();
  showAuth();
}

/* ================= VIEW: ACCOUNTS (TÀI KHOẢN & QUYỀN) ================= */
function accountsView() {
  return `
  <div class="toolbar">
    <span style="font-size:13px;color:var(--text-2)">${state.users.length} tài khoản · ${state.users.filter(u => u.active).length} đang hoạt động</span>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openUserModal()">${icon('plus')} Thêm tài khoản</button>
  </div>
  <div class="card list-wrap">
    <div class="table-wrap">
    <table>
      <thead><tr><th>Tài khoản</th><th>Tên hiển thị</th><th>Nhân sự</th><th>Quyền</th><th>Trạng thái</th><th>Đăng nhập cuối</th><th class="ta-c">Thao tác</th></tr></thead>
      <tbody>
      ${state.users.map(u => {
        const self = currentUser() && currentUser().id === u.id;
        const permNames = u.perms.map(p => (PERM_MODULES.find(m => m[0] === p) || ['', p])[1]).join(', ');
        return `<tr ${self ? 'style="background:#f5f6ff"' : ''}>
          <td><div class="cell-main">${esc(u.username)} ${self ? '<span class="badge b-confirmed">Bạn</span>' : ''} ${u.mustChangePwd ? '<span class="badge b-pending">Cần đổi MK</span>' : ''}</div></td>
          <td>${esc(u.name)}</td>
          <td class="money-muted">${u.staffId ? esc(staffName(u.staffId)) : '—'}${u.branchId ? `<div class="cell-sub">📍 ${esc(branchName(u.branchId))}</div>` : ''}</td>
          <td><span class="badge b-role-manager" title="${esc(permNames)}">${esc(presetShortLabel(u))}</span>
            <div class="cell-sub">${u.perms.length}/${ALL_PERMS.length} phân hệ</div></td>
          <td><span class="badge ${u.active ? 'b-delivered' : 'b-inactive'}">${u.active ? 'Hoạt động' : 'Đã khóa'}</span></td>
          <td class="money-muted">${u.lastLogin ? fmtDate(u.lastLogin) : '—'}</td>
          <td class="cell-actions ta-c">
            <button class="icon-btn" title="Sửa" onclick="openUserModal('${u.id}')">${icon('edit')}</button>
            <button class="icon-btn" title="${u.active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}" onclick="toggleUserActive('${u.id}')">${icon(u.active ? 'lock' : 'check')}</button>
            <button class="icon-btn danger" title="Xóa" onclick="deleteUser('${u.id}')">${icon('trash')}</button>
          </td>
        </tr>`;
      }).join('') || emptyRow(7, 'Chưa có tài khoản nào')}
      </tbody>
    </table>
    </div>
  </div>`;
}

function openUserModal(id) {
  const u = id ? byId(state.users, id) : null;
  const preset = u ? (u.preset || 'custom') : 'reception';
  const presetOpts = presetOptionsHtml(preset);
  const staffOpts = '<option value="">— Không liên kết —</option>' +
    state.staff.map(s => `<option value="${s.id}" ${u && u.staffId === s.id ? 'selected' : ''}>${esc(s.name)} (${ROLES[s.role]})</option>`).join('');
  const initialPerms = u ? u.perms : (PERM_PRESETS[preset] && PERM_PRESETS[preset].perms || (preset.startsWith('g:') ? ((byId(state.roleGroups, preset.slice(2)) || {}).perms || []) : []));
  openModal(`
    <div class="modal-head"><h3>${u ? 'Sửa tài khoản' : 'Thêm tài khoản'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field"><label>Tên hiển thị <span class="req">*</span></label><input class="input" name="name" required value="${esc(u ? u.name : '')}" placeholder="VD: Lê Hoàng Nam"></div>
      <div class="field"><label>Tên đăng nhập <span class="req">*</span></label><input class="input" name="username" required value="${esc(u ? u.username : '')}" placeholder="VD: nam.le"></div>
      <div class="field full"><label>Mật khẩu ${u ? '' : '<span class="req">*</span>'}</label>
        <input class="input" name="password" type="password" ${u ? '' : 'required'} autocomplete="new-password" placeholder="${u ? 'Để trống = giữ mật khẩu hiện tại' : 'Tối thiểu 4 ký tự'}"></div>
      <div class="field"><label>Nhân sự liên kết</label><select class="select" name="staffId">${staffOpts}</select></div>
      <div class="field"><label>Chi nhánh phụ trách</label><select class="select" name="userBranchId">
        <option value="">— Toàn hệ thống (xem mọi chi nhánh) —</option>
        ${state.branches.map(x => `<option value="${x.id}" ${u && u.branchId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
      </select><div class="form-hint">Chọn chi nhánh để giới hạn: tài khoản chỉ thấy dữ liệu chi nhánh đó</div></div>
      <div class="field"><label>Mẫu quyền</label><select class="select" name="preset" onchange="applyPreset(this.value)">${presetOpts}</select></div>
      <div class="field full"><label>Quyền truy cập phân hệ</label>
        <div class="perm-grid">
          ${PERM_MODULES.map(([k, lbl]) => `
          <label class="perm-check"><input type="checkbox" class="perm-cb" value="${k}" ${initialPerms.includes(k) ? 'checked' : ''} onchange="$('#frm [name=preset]').value='custom'"><span>${lbl}</span></label>`).join('')}
        </div>
        <div class="form-hint">Tài khoản chỉ nhìn thấy và dùng được những phân hệ được chọn</div>
      </div>
      <div class="field full"><div class="checkbox-row"><input type="checkbox" id="userActive" ${!u || u.active ? 'checked' : ''}><label for="userActive">Tài khoản đang hoạt động</label></div></div>
    </form>
    <div class="modal-foot">
      ${u ? `<button class="btn btn-danger" onclick="closeModal();deleteUser('${u.id}')">${icon('trash')} Xóa</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveUser('${id || ''}')">${icon('check')} Lưu</button>
    </div>`, 'lg');
  setTimeout(() => { const el = $('#frm [name=name]'); if (el) el.focus(); }, 60);
}

function applyPreset(key) {
  const perms = (key && key.startsWith('g:'))
    ? ((byId(state.roleGroups, key.slice(2)) || {}).perms || null)
    : (PERM_PRESETS[key] && PERM_PRESETS[key].perms);
  if (!perms) return;
  $$('#frm .perm-cb').forEach(cb => { cb.checked = perms.includes(cb.value); });
}

async function saveUser(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const name = fd.get('name').trim();
  const username = fd.get('username').trim().toLowerCase();
  const password = fd.get('password');
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) { toast('Tên đăng nhập: 3–20 ký tự, chỉ chữ thường, số, dấu . và _', 'error'); return; }
  if (state.users.some(x => x.username === username && x.id !== id)) { toast('Tên đăng nhập đã tồn tại', 'error'); return; }
  if (password && password.length < 4) { toast('Mật khẩu tối thiểu 4 ký tự', 'error'); return; }
  const perms = $$('#frm .perm-cb').filter(cb => cb.checked).map(cb => cb.value);
  if (!perms.length) { toast('Chọn ít nhất một phân hệ cho tài khoản', 'error'); return; }
  const active = $('#userActive').checked;

  const self = currentUser();
  if (id && self && self.id === id && (!active || !perms.includes('accounts'))) {
    toast('Không thể tự khóa hoặc tự gỡ quyền quản trị của chính bạn', 'error'); return;
  }
  const target = id ? byId(state.users, id) : null;
  if (target && target.active && target.perms.includes('accounts') && (!active || !perms.includes('accounts'))) {
    const others = state.users.filter(x => x.id !== id && x.active && x.perms.includes('accounts')).length;
    if (!others) { toast('Phải giữ lại ít nhất một tài khoản quản trị đang hoạt động', 'error'); return; }
  }

  const data = { name, username, staffId: fd.get('staffId') || '', branchId: fd.get('userBranchId') || '', preset: fd.get('preset'), perms, active };
  if (id) {
    const t = byId(state.users, id);
    Object.assign(t, data);
    if (password) {
      t.passHash = await hashPassword(password);
      if (self && self.id !== id) t.mustChangePwd = true; // admin cấp lại MK cho người khác → ép đổi
    }
    if (self && self.id === id) updateAuthUI();
    logAction('update', 'user', username + (password ? ' (đặt lại mật khẩu)' : ''));
    toast('Đã cập nhật tài khoản');
  } else {
    if (!password) { toast('Vui lòng nhập mật khẩu', 'error'); return; }
    state.users.push(Object.assign({ id: uid(), passHash: await hashPassword(password), mustChangePwd: true, lastLogin: '', createdAt: todayStr() }, data));
    logAction('create', 'user', username + ' — quyền: ' + perms.length + ' phân hệ');
    toast('Đã tạo tài khoản ' + username);
  }
  save(); closeModal(); render();
}

function toggleUserActive(id) {
  const u = byId(state.users, id);
  if (!u) return;
  const self = currentUser();
  if (self && self.id === id && u.active) { toast('Không thể tự khóa tài khoản của chính bạn', 'error'); return; }
  if (u.active && u.perms.includes('accounts')) {
    const others = state.users.filter(x => x.id !== id && x.active && x.perms.includes('accounts')).length;
    if (!others) { toast('Phải giữ lại ít nhất một tài khoản quản trị', 'error'); return; }
  }
  u.active = !u.active;
  logAction('update', 'user', u.username + (u.active ? ': mở khóa' : ': khóa tài khoản'));
  save(); render();
  toast(u.active ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản');
}

function deleteUser(id) {
  const u = byId(state.users, id);
  if (!u) return;
  const self = currentUser();
  if (self && self.id === id) { toast('Không thể xóa tài khoản đang đăng nhập', 'error'); return; }
  if (u.active && u.perms.includes('accounts')) {
    const others = state.users.filter(x => x.id !== id && x.active && x.perms.includes('accounts')).length;
    if (!others) { toast('Phải giữ lại ít nhất một tài khoản quản trị', 'error'); return; }
  }
  confirmDialog('Xóa tài khoản?', `Xóa tài khoản <b>${esc(u.username)}</b> (${esc(u.name)})? Người này sẽ không thể đăng nhập nữa.`, 'Xóa', () => {
    state.users = state.users.filter(x => x.id !== id);
    logAction('delete', 'user', u.username);
    save(); render(); toast('Đã xóa tài khoản');
  });
}

/* ================= THANH TOÁN QR (VietQR) ================= */
const QR_BANKS = [['VCB', 'Vietcombank'], ['TCB', 'Techcombank'], ['BID', 'BIDV'], ['CTG', 'VietinBank'], ['MB', 'MB Bank'], ['ACB', 'ACB'], ['VPB', 'VPBank'], ['TPB', 'TPBank'], ['VIB', 'VIB'], ['AGR', 'Agribank'], ['SHB', 'SHB'], ['HDB', 'HDBank'], ['OCB', 'OCB'], ['MSB', 'MSB'], ['SCB', 'SCB']];
const bankCfg = () => state.settings.bank || {};
const bankLabel = c => (QR_BANKS.find(b => b[0] === (c || {}).code) || ['', ''])[1] || '—';

function qrImageUrl(amount, content) {
  const b = bankCfg();
  return `https://img.vietqr.io/image/${b.code}-${b.accountNo}-compact.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(b.accountName || '')}`;
}

function openBankQrModal() {
  const b = bankCfg();
  openModal(`
    <div class="modal-head"><h3>Tài khoản nhận thanh toán (QR)</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="field"><label>Ngân hàng</label><select class="select" id="qBank">${QR_BANKS.map(([c, n]) => `<option value="${c}" ${b.code === c ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label>Số tài khoản <span class="req">*</span></label><input class="input" id="qAccNo" value="${esc(b.accountNo || '')}" placeholder="Số TK nhận tiền"></div>
      <div class="field"><label>Tên chủ tài khoản</label><input class="input" id="qAccName" value="${esc(b.accountName || '')}" placeholder="VD: NGUYEN VAN A"></div>
      <div class="form-hint">Dùng để sinh mã QR chuyển khoản (chuẩn VietQR) — khách quét bằng app ngân hàng bất kỳ.</div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="saveBankQr()">${icon('check')} Lưu</button></div>`, 'sm');
}

function saveBankQr() {
  const no = $('#qAccNo').value.trim();
  if (!no) { toast('Nhập số tài khoản nhận tiền', 'error'); return; }
  state.settings.bank = { code: $('#qBank').value, accountNo: no, accountName: $('#qAccName').value.trim().toUpperCase() };
  logAction('update', 'settings', 'Tài khoản QR: ' + bankLabel(state.settings.bank) + ' ' + no);
  save(); closeModal(); toast('Đã lưu tài khoản nhận thanh toán');
}

function openQrPayModal(orderId) {
  const o = byId(state.orders, orderId);
  if (!o) return;
  const b = bankCfg();
  if (!b.accountNo) {
    toast('Chưa cấu hình tài khoản nhận tiền — mở Cài đặt → Thanh toán QR', 'error');
    return;
  }
  const remain = orderRemaining(o);
  const amount = remain > 0 ? remain : orderTotal(o);
  const content = o.code;
  const pend = o.qrPending;
  openModal(`
    <div class="modal-head"><h3>Thanh toán QR — ${esc(o.code)}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body" style="text-align:center">
      <div style="display:flex;justify-content:center;margin-bottom:10px"><span class="badge ${pend ? 'b-pending' : payStatus(o) === 'paid' ? 'b-delivered' : 'b-unpaid'}">${pend ? '⏳ Chờ xác nhận chuyển khoản' : PAY_LABEL[payStatus(o)]}</span></div>
      <img src="${qrImageUrl(amount, content)}" alt="QR thanh toán" style="width:250px;max-width:100%;border:1px solid var(--border);border-radius:14px;background:#fff;padding:8px" crossorigin="anonymous">
      <div class="info-grid" style="text-align:left;margin-top:14px">
        ${infoItem('card', 'Ngân hàng', bankLabel(b) + ' · ' + esc(b.accountNo))}
        ${infoItem('user', 'Chủ TK', b.accountName)}
        ${infoItem('money', 'Số tiền', '<b style="color:var(--primary-600)">' + fmtMoney(amount) + '</b>', false, true)}
        ${infoItem('edit', 'Nội dung CK', '<b>' + esc(content) + '</b> (mã đơn hàng)', false, true)}
      </div>
      ${pend ? `<div class="cancel-banner" style="margin-top:12px">${icon('clock')} Khách báo đã chuyển <b>${fmtMoney(pend.amount)}</b> lúc ${fmtDateTime(pend.ts)} — quản trị duyệt để ghi nhận.</div>` : ''}
    </div>
    <div class="modal-foot" style="flex-wrap:wrap;justify-content:center">
      ${pend
        ? `<button class="btn btn-ghost" onclick="cancelQrPending('${o.id}')">Bỏ báo chuyển</button>
           <button class="btn btn-primary" onclick="approveQrPayment('${o.id}')">${icon('check')} Duyệt — đã nhận tiền</button>`
        : (orderRemaining(o) > 0
          ? `<button class="btn btn-primary" onclick="claimQrPaid('${o.id}',${amount})">${icon('check')} Tôi đã chuyển khoản</button>`
          : `<span class="money-green">Đơn này đã thanh toán đủ ✓</span>`)}
      <button class="btn btn-ghost" onclick="closeModal();viewOrder('${o.id}')">Xem đơn</button>
    </div>`, 'sm');
}

function claimQrPaid(orderId, amount) {
  const o = byId(state.orders, orderId);
  if (!o) return;
  o.qrPending = { amount, ts: new Date().toISOString(), by: (currentUser() || {}).username || 'khách' };
  logAction('update', 'order', o.code + ': khách báo đã chuyển khoản QR ' + fmtMoney(amount));
  pushNotif('payment', '⏳ Chờ duyệt chuyển khoản ' + fmtMoney(amount), o.code + ' — ' + custName(o.customerId) + ' báo đã QR chuyển khoản');
  save(); closeModal(); render();
  openQrPayModal(orderId);
  toast('Đã ghi nhận — chờ quản trị viên xác nhận');
}

function approveQrPayment(orderId) {
  const o = byId(state.orders, orderId);
  if (!o || !o.qrPending) return;
  const amt = Math.min(orderTotal(o) - (+o.paidAmount || 0), o.qrPending.amount);
  o.paidAmount = (+o.paidAmount || 0) + Math.max(0, amt);
  if (orderRemaining(o) === 0 && o.status === 'confirmed') o.status = 'completed';
  delete o.qrPending;
  logAction('pay', 'order', o.code + ': duyệt QR + ' + fmtMoney(amt));
  pushNotif('payment', '✅ Đã duyệt chuyển khoản ' + fmtMoney(amt), o.code + ' — ' + custName(o.customerId));
  save(); closeModal(); render();
  toast('Đã ghi nhận thanh toán QR ' + fmtMoney(amt));
}

function cancelQrPending(orderId) {
  const o = byId(state.orders, orderId);
  if (!o) return;
  delete o.qrPending;
  save(); closeModal(); render();
  toast('Đã bỏ báo chuyển khoản');
}


let __branchSel = localStorage.getItem('mementoCRM_branch') || 'all';
const branchMatch = x => __branchSel === 'all' || !__branchSel || (x && x.branchId) === __branchSel || (__branchSel !== 'all' && x && x.branchId === __branchSel);
const branchName = id => (byId(state.branches, id) || {}).name || '—';
const curBranchId = () => (__branchSel !== 'all' && __branchSel) || ((state.branches[0] || {}).id || '');

function setBranch(v) {
  const u = currentUser();
  const restricted = !!(u && u.branchId && byId(state.branches, u.branchId));
  if (restricted && v !== u.branchId) {
    toast('Tài khoản của bạn chỉ được xem dữ liệu chi nhánh ' + branchName(u.branchId), 'error');
    fillBranchSel();
    return;
  }
  __branchSel = v || 'all';
  localStorage.setItem('mementoCRM_branch', __branchSel);
  render();
  toast(__branchSel === 'all' ? 'Đang xem: Tất cả chi nhánh' : 'Đang xem: ' + branchName(__branchSel));
}

function fillBranchSel() {
  const sel = $('#branchSel');
  if (!sel) return;
  const u = currentUser();
  const restricted = !!(u && u.branchId && byId(state.branches, u.branchId));
  if (restricted) {
    __branchSel = u.branchId;
    localStorage.setItem('mementoCRM_branch', __branchSel);
  }
  const opts = restricted ? state.branches.filter(b => b.id === u.branchId) : state.branches;
  sel.innerHTML = (restricted ? '' : `<option value="all">🏢 Tất cả chi nhánh</option>`) +
    opts.map(b => `<option value="${b.id}" ${__branchSel === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  sel.style.display = state.branches.length ? '' : 'none';
  sel.disabled = restricted;
  sel.title = restricted ? 'Tài khoản của bạn bị giới hạn ở chi nhánh này' : 'Lọc dữ liệu theo chi nhánh';
}

function seedBranches() {
  return [
    { id: 'br1', name: 'Chi nhánh 1 — Trụ sở Q.1', phone: '028 3822 1188', address: '45 Nguyễn Huệ, Quận 1, TP.HCM', active: true },
    { id: 'br2', name: 'Chi nhánh 2 — Thủ Đức', phone: '028 3722 3344', address: '12 Kha Vạn Cân, Thủ Đức, TP.HCM', active: true },
  ];
}

function openBranchesModal() {
  const rows = state.branches.map(b => {
    const st = state.staff.filter(s => s.branchId === b.id).length;
    const bk = state.bookings.filter(x => x.branchId === b.id).length;
    return `<div style="border:1px solid var(--border);border-radius:10px;padding:11px 13px;margin-bottom:7px">
      <div style="display:flex;align-items:center;gap:10px">
        <b style="flex:1;font-size:13.5px">${esc(b.name)}</b>
        <button class="icon-btn" title="Sửa" onclick="openBranchModal('${b.id}')">${icon('edit')}</button>
        <button class="icon-btn danger" title="Xóa" onclick="deleteBranch('${b.id}')">${icon('trash')}</button>
      </div>
      <div class="cell-sub" style="margin-top:3px">${esc(b.address || '')}${b.phone ? ' · ' + esc(b.phone) : ''} — <b>${st}</b> nhân sự, <b>${bk}</b> lịch chụp</div>
    </div>`;
  }).join('');
  openModal(`
    <div class="modal-head"><h3>Quản lý chi nhánh</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      ${rows || '<p style="font-size:13px;color:var(--text-3)">Chưa có chi nhánh nào.</p>'}
      <button class="btn btn-primary btn-sm btn-block" style="margin-top:8px" onclick="openBranchModal()">${icon('plus')} Thêm chi nhánh mới</button>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Đóng</button></div>`, 'sm');
}

function openBranchModal(id) {
  const b = id ? byId(state.branches, id) : null;
  openModal(`
    <div class="modal-head"><h3>${b ? 'Sửa chi nhánh' : 'Thêm chi nhánh'}</h3><button class="icon-btn" onclick="openBranchesModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="field"><label>Tên chi nhánh <span class="req">*</span></label><input class="input" id="brName" value="${esc(b ? b.name : '')}" placeholder="VD: Chi nhánh 3 — Bình Dương"></div>
      <div class="field"><label>Điện thoại</label><input class="input" id="brPhone" value="${esc(b ? b.phone : '')}"></div>
      <div class="field"><label>Địa chỉ</label><input class="input" id="brAddress" value="${esc(b ? b.address : '')}"></div>
      <div class="field" style="background:#f8fafc;border:1px solid var(--border);border-radius:12px;padding:12px 14px">
        <label style="font-weight:700">📍 Vị trí chấm công GPS của chi nhánh</label>
        <p style="font-size:11.5px;color:var(--text-3);margin:4px 0 8px">Đứng TẠI chi nhánh rồi bấm "Lấy vị trí hiện tại" là chuẩn nhất. Nhân viên gán chi nhánh này chấm công gần toạ độ này sẽ hiện ✓ trong phạm vi.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input class="input" id="brLat" style="max-width:120px" placeholder="Vĩ độ (lat)" value="${b && b.lat ? b.lat : ''}">
          <input class="input" id="brLng" style="max-width:120px" placeholder="Kinh độ (lng)" value="${b && b.lng ? b.lng : ''}">
          <input class="input" id="brRadius" type="number" min="50" step="50" style="max-width:100px" title="Bán kính cho phép (mét)" value="${b && b.radius ? b.radius : 200}">
          <button type="button" class="btn btn-ghost btn-sm" onclick="fillBranchGeo()">${icon('pin')} Lấy vị trí hiện tại</button>
          <span class="cell-sub">bán kính m</span>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="openBranchesModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveBranch('${id || ''}')">${icon('check')} Lưu</button>
    </div>`, 'sm');
}

async function fillBranchGeo() {
  toast('Đang lấy vị trí GPS…');
  const g = await getPunchGeo();
  if (!g) { toast('Không lấy được vị trí — kiểm tra quyền vị trí của trình duyệt', 'error'); return; }
  $('#brLat').value = g.lat;
  $('#brLng').value = g.lng;
  toast('Đã lấy toạ độ ✓ — bấm Lưu để áp dụng');
}

function saveBranch(id) {
  const name = $('#brName').value.trim();
  if (!name) { toast('Nhập tên chi nhánh', 'error'); return; }
  const data = { name, phone: $('#brPhone').value.trim(), address: $('#brAddress').value.trim(), lat: $('#brLat').value.trim(), lng: $('#brLng').value.trim(), radius: +$('#brRadius').value || 200 };
  if (id) Object.assign(byId(state.branches, id), data);
  else state.branches.push(Object.assign({ id: uid(), active: true }, data));
  logAction(id ? 'update' : 'create', 'settings', 'Chi nhánh: ' + name);
  save(); fillBranchSel(); openBranchesModal(); toast('Đã lưu chi nhánh');
}

function deleteBranch(id) {
  const b = byId(state.branches, id);
  if (!b) return;
  if (state.branches.length <= 1) { toast('Phải giữ lại ít nhất một chi nhánh', 'error'); return; }
  const used = state.staff.filter(s => s.branchId === id).length + state.bookings.filter(x => x.branchId === id).length;
  if (used) { toast(`Không thể xóa: chi nhánh đang có dữ liệu (${used} bản ghi)`, 'error'); return; }
  state.branches = state.branches.filter(x => x.id !== id);
  if (__branchSel === id) setBranch('all');
  logAction('delete', 'settings', 'Chi nhánh: ' + b.name);
  save(); fillBranchSel(); openBranchesModal(); toast('Đã xóa chi nhánh');
}


const NOTIF_TYPES = {
  booking:  { label: 'Thông báo khi có lịch hẹn mới', ic: 'calendar', tint: 'tint-blue', desc: 'Khi lễ tân/khách tạo buổi chụp mới trong hệ thống' },
  payment:  { label: 'Thông báo khi khách đặt cọc / thanh toán', ic: 'money', tint: 'tint-green', desc: 'Khi ghi nhận thu tiền trên đơn hàng hoặc hợp đồng' },
  ready:    { label: 'Thông báo khi hạng mục / ảnh đã sẵn sàng', ic: 'camera', tint: 'tint-violet', desc: 'Khi buổi chụp chuyển sang "Đã trả ảnh" hoặc hoàn thành hậu kỳ' },
  overdue:  { label: 'Thông báo quá hạn (trả đồ, thu tiền)', ic: 'alert', tint: 'tint-red', desc: 'Kiểm tra mỗi ngày khi mở ứng dụng' },
  daily:    { label: 'Báo cáo hàng ngày', ic: 'receipt', tint: 'tint-indigo', desc: 'Tổng hợp doanh thu và lịch chụp gửi đầu ngày' },
};

function defaultNotif() {
  return { master: true, daily: false, dailyTo: [], booking: true, payment: true, ready: true, overdue: true, lastDaily: '' };
}

function notifyCfg() {
  if (!state.settings.notif) state.settings.notif = defaultNotif();
  return state.settings.notif;
}

function pushNotif(type, title, body) {
  const cfg = notifyCfg();
  if (!cfg.master || !cfg[type]) return;
  state.notifications = state.notifications || [];
  state.notifications.unshift({ id: uid(), ts: new Date().toISOString(), type, title, body, read: false });
  if (state.notifications.length > 100) state.notifications.length = 100;
  save();
  renderTopbarAttendance(); // cập nhật chuông
  pushNotify(title, body);
}

function unreadCount() { return (state.notifications || []).filter(n => !n.read).length; }

function notificationsView() {
  const cfg = notifyCfg();
  const sw = (key) => `<label class="switch"><input type="checkbox" ${cfg[key] ? 'checked' : ''} onchange="notifyCfg()['${key}']=this.checked;save();render();toast('Đã ${cfg[key] ? 'tắt' : 'bật'}: ${esc(NOTIF_TYPES[key].label)}')"><span class="track"></span></label>`;
  const users = state.users.filter(u => u.active);
  const inbox = (state.notifications || []).slice(0, 30);
  return `
  <div class="card" style="overflow:hidden">
    <div class="notif-hero">
      <div class="stat-icon tint-indigo">${icon('alert')}</div>
      <div style="flex:1">
        <h3>Cấu hình thông báo</h3>
        <p>Nhận thông báo khi có hoạt động mới</p>
      </div>
      <span class="badge ${cfg.master ? 'b-delivered' : 'b-inactive'}" style="font-size:12px;padding:6px 14px">${cfg.master ? 'Đang bật' : 'Đang tắt'}</span>
      <label class="switch"><input type="checkbox" ${cfg.master ? 'checked' : ''} onchange="notifyCfg().master=this.checked;save();render()"><span class="track"></span></label>
    </div>
    ${['booking', 'payment', 'ready', 'overdue'].map(k => `
    <div class="notif-row">
      <div class="ic ${NOTIF_TYPES[k].tint}">${icon(NOTIF_TYPES[k].ic)}</div>
      <div class="txt"><b>${NOTIF_TYPES[k].label}</b><span>${NOTIF_TYPES[k].desc}</span></div>
      ${sw(k)}
    </div>`).join('')}
    <div class="notif-row">
      <div class="ic ${NOTIF_TYPES.daily.tint}">${icon(NOTIF_TYPES.daily.ic)}</div>
      <div class="txt"><b>${NOTIF_TYPES.daily.label}</b><span>${NOTIF_TYPES.daily.desc}</span>
        ${cfg.daily ? `<div class="notif-recipients">${users.map(u => `<span class="badge ${cfg.dailyTo.includes(u.username) ? 'b-confirmed' : 'b-inactive'}" style="cursor:pointer" onclick="toggleDailyTo('${u.username}')">${esc(u.username)} ✓</span>`).join('')}</div>` : ''}
      </div>
      ${sw('daily')}
    </div>
  </div>

  <div class="card list-wrap" style="margin-top:16px;overflow:hidden">
    <div class="card-head"><h3>Hộp thông báo (${inbox.length})</h3>
      <button class="right btn btn-ghost btn-sm" onclick="markAllRead()">Đánh dấu đã đọc tất cả</button>
    </div>
    ${inbox.map(n => `
    <div class="inbox-item ${n.read ? '' : 'unread'}" onclick="this.classList.remove('unread');markRead('${n.id}')">
      <div class="ic ${(NOTIF_TYPES[n.type] || NOTIF_TYPES.booking).tint}">${icon((NOTIF_TYPES[n.type] || NOTIF_TYPES.booking).ic)}</div>
      <div class="txt"><b>${esc(n.title)}</b><span>${esc(n.body)}</span></div>
      <span class="time">${fmtDateTime(n.ts)}</span>
    </div>`).join('') || `<div class="empty">${iconWrap('alert')}<h4>Chưa có thông báo nào</h4><p>Các hoạt động mới sẽ hiện tại đây.</p></div>`}
  </div>`;
}

function toggleDailyTo(username) {
  const cfg = notifyCfg();
  cfg.dailyTo = cfg.dailyTo.includes(username) ? cfg.dailyTo.filter(u => u !== username) : [...cfg.dailyTo, username];
  save(); render();
}

function markRead(id) { const n = byId(state.notifications || [], id); if (n) { n.read = true; save(); renderTopbarAttendance(); } }
function markAllRead() { (state.notifications || []).forEach(n => n.read = true); save(); render(); }

/* Báo cáo ngày + kiểm tra quá hạn, chạy 1 lần/ngày khi mở app */
function dailyNotifCheck() {
  const cfg = notifyCfg();
  const today = todayStr();
  if (cfg.lastDaily === today) return;
  cfg.lastDaily = today;
  if (cfg.overdue) {
    const lateLoans = state.loans.filter(l => !l.returnDate && l.dueDate && l.dueDate < today);
    if (lateLoans.length) pushNotif('overdue', '⚠ ' + lateLoans.length + ' phiếu mượn quá hạn', lateLoans.slice(0, 3).map(l => (byId(state.outfits, l.outfitId) || {}).name + ' — ' + loanBorrower(l)).join(', '));
    const dueContract = state.contracts.filter(c => c.status !== 'cancelled' && c.schedule.some(r => !r.paid && r.dueDate && r.dueDate < today));
    if (dueContract.length) pushNotif('overdue', '⚠ ' + dueContract.length + ' hợp đồng quá hạn thu', dueContract.map(c => c.code + ' — ' + custName(c.customerId)).join(', '));
  }
  if (cfg.daily) {
    const t = state.bookings.filter(b => b.date === today && b.status !== 'cancelled');
    pushNotif('daily', '📊 Báo cáo ngày ' + fmtDate(today), 'Hôm nay có ' + t.length + ' buổi chụp' + (t.length ? ': ' + t.slice(0, 3).map(b => b.startTime + ' ' + custName(b.customerId)).join(', ') : ''));
  }
  save();
}


/* ================= ALBUM KHÁCH CHỌN & LỌC ẢNH ================= */
function copyText(t, msg) {
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast(msg || 'Đã copy')).catch(() => toast(t, 'error'));
  else toast(t, 'error');
}

function albumsView() {
  const ql = viewState.albums.q.trim().toLowerCase();
  const list = state.bookings.filter(b => branchMatch(b))
    .filter(b => !ql || [custName(b.customerId), pkgName(b.packageId)].some(v => String(v || '').toLowerCase().includes(ql)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `
  <div class="toolbar">
    <div class="search-box">${icon('search')}<input class="input" placeholder="Tìm khách hàng, gói chụp..." value="${esc(viewState.albums.q)}" oninput="viewState.albums.q=this.value;render()"></div>
    <div class="spacer"></div>
    <span style="font-size:12.5px;color:var(--text-2)">${list.filter(b => b.gallery && b.gallery.photos.length).length}/${list.length} buổi chụp đã có album</span>
  </div>
  <div class="card list-wrap"><div class="table-wrap">
  <table>
    <thead><tr><th>Khách hàng</th><th>Buổi chụp</th><th>Album</th><th>PIN</th><th>Link cổng khách</th><th class="ta-c">Thao tác</th></tr></thead>
    <tbody>
    ${list.map(b => {
      const g = b.gallery || {};
      const has = g.photos && g.photos.length;
      const sel = has ? g.photos.filter(p => p.selected).length : 0;
      const url = location.origin + location.pathname + '#portal-' + (b.portalToken || '');
      return `<tr>
        <td><div class="cell-main">${esc(custName(b.customerId))}</div><div class="cell-sub">${fmtDate(b.date)}</div></td>
        <td class="money-muted">${esc(pkgName(b.packageId))}</td>
        <td>${has ? `<b>${g.photos.length}</b> ảnh · <b style="color:#e11d48">❤ ${sel}</b>${g.includedQty ? ' / gói ' + g.includedQty : ''}${sel && g.extraPrice && sel > (g.includedQty || 0) ? `<div class="cell-sub" style="color:var(--red)">phụ thu +${fmtMoney((sel - (g.includedQty || 0)) * g.extraPrice)}</div>` : ''}` : '<span class="money-muted">— chưa tạo —</span>'}</td>
        <td>${g.pin ? '<span class="badge b-pending">🔒 ' + esc(g.pin) + '</span>' : '<span class="money-muted">—</span>'}</td>
        <td>${b.portalToken ? `<input class="input" readonly value="${esc(url)}" style="font-size:11px;padding:5px 8px" onclick="this.select()">` : '<span class="money-muted">—</span>'}</td>
        <td class="cell-actions ta-c">
          <button class="icon-btn" title="${has ? 'Sửa album' : 'Tạo album'}" onclick="openGalleryModal('${b.id}')">${icon(has ? 'edit' : 'plus')}</button>
          ${b.portalToken ? `<button class="icon-btn" title="Copy link" onclick="copyText('${url}','Đã copy link cổng khách hàng')">${icon('receipt')}</button>
          <button class="icon-btn" title="Mở cổng" onclick="openPortalNow('${b.id}')">${icon('eye')}</button>` : ''}
        </td>
      </tr>`;
    }).join('') || emptyRow(6, 'Không có buổi chụp phù hợp')}
    </tbody>
  </table></div></div>
  <p style="font-size:12px;color:var(--text-3);margin-top:10px">Bấm ➕ để tạo album cho buổi chụp (quét ảnh từ thư mục / sinh mã mẫu, đặt PIN, số ảnh gói &amp; giá ảnh thêm) — rồi copy link gửi khách qua Zalo.</p>`;
}

function pfParseCodes(raw, mode) {
  const toks = String(raw || '').split(/[\s,;\n\r\t]+/).filter(Boolean)
    .map(t => t.replace(/\.(jpe?g|png|tiff?|heic|webp|arw|cr2|cr3|nef|dng|raw)$/i, ''));
  const set = [...new Set(toks.filter(t => t.length))];
  if (mode !== 'digits') return set;
  return [...new Set(set.map(t => (t.match(/\d+/g) || []).join('')).filter(Boolean))];
}

function pfMatch(base, code, mode) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (mode === 'digits') { const d = base.match(/\d+/g); return !!d && d.some(x => Number(x) === Number(code)); }
  return new RegExp('(^|[^A-Za-z0-9])' + esc(code) + '($|[^A-Za-z0-9])').test(base);
}

const PF_EXT = {
  all: /\.(jpe?g|png|tiff?|heic|webp|arw|cr2|cr3|nef|dng|raw)$/i,
  raw: /\.(arw|cr2|cr3|nef|dng|raw|tiff?)$/i,
  jpg: /\.(jpe?g|png|heic|webp)$/i,
};
const PF_EXT_LABEL = { all: 'Tất cả (RAW & JPG)', raw: 'Chỉ lấy RAW', jpg: 'Chỉ lấy JPG/PNG' };

function pfCopyFormat(kind) {
  const codes = pfParseCodes(viewState.filter.codes, viewState.filter.mode);
  if (!codes.length) { toast('Chưa có mã nào để copy', 'error'); return; }
  const text = kind === 'line' ? codes.join('\n') : kind === 'comma' ? codes.join(', ') : kind === 'space' ? codes.join(' ') : codes.map(c => c + '.JPG').join('\n');
  copyText(text, 'Đã copy ' + codes.length + ' mã (' + ({ line: 'xuống dòng', comma: 'dấu phẩy', space: 'dấu cách', ext: 'có đuôi file' })[kind] + ')');
}

async function pf2PickOrigin() {
  try { __pfOrigin = await window.showDirectoryPicker({ mode: 'readwrite' }); }
  catch (e) { if (e.name !== 'AbortError') toast('Không mở được thư mục: ' + e.message, 'error'); }
  render();
}

async function pf2PickDest() {
  try { __pfDest = await window.showDirectoryPicker({ mode: 'readwrite' }); render(); }
  catch (e) { if (e.name !== 'AbortError') toast('Không mở được thư mục: ' + e.message, 'error'); }
}

async function pf2Start() {
  const v = viewState.filter;
  const codes = pfParseCodes(v.codes, v.mode);
  if (!codes.length) { toast('Chưa có mã ảnh hợp lệ nào', 'error'); return; }
  if (!__pfOrigin) { toast('Chọn thư mục ảnh gốc trước', 'error'); return; }
  let dest = __pfDest;
  if (v.subInOrigin) {
    try { dest = await __pfOrigin.getDirectoryHandle(v.subName || 'Anh khach chon', { create: true }); }
    catch (e) { toast('Không tạo được thư mục con: ' + e.message, 'error'); return; }
  }
  if (!dest) { toast('Chọn thư mục lưu ảnh lọc ra', 'error'); return; }
  const files = [];
  try {
    for await (const [name, h] of __pfOrigin.entries()) {
      if (h.kind === 'file' && PF_EXT[v.ext].test(name)) files.push({ name, h });
    }
  } catch (e) { toast('Không đọc được thư mục gốc: ' + e.message, 'error'); return; }
  const matched = files.filter(f => codes.some(c => pfMatch(f.name.replace(/\.[^.]+$/, ''), c, v.mode)));
  let ok = 0, fail = 0;
  for (const f of matched) {
    try {
      const fh = await dest.getFileHandle(f.name, { create: true });
      const w = await fh.createWritable();
      await w.write(await f.h.getFile());
      await w.close();
      ok++;
    } catch (e) { fail++; }
  }
  const b = byId(state.bookings, v.bookingId);
  logAction('data', 'portal', `Lọc ảnh: ${ok} file (${codes.length} mã) → "${dest.name}"${b ? ' — ' + custName(b.customerId) : ''}`);
  pushNotif('ready', '📁 Lọc xong ' + ok + ' ảnh', (b ? custName(b.customerId) : codes.length + ' mã') + ' — copy sang "' + dest.name + '"');
  save();
  const box = $('#pf2Result');
  if (box) box.innerHTML = `<div class="auth-error" style="display:flex;background:#ecfdf5;border-color:#a7f3d0;color:#047857;font-size:13px">
    ✓ Đã copy <b>&nbsp;${ok}&nbsp;</b> file vào "<b>${esc(dest.name)}</b>" — quét ${files.length} file ${PF_EXT_LABEL[v.ext].toLowerCase()}, khớp ${matched.length}/${codes.length} mã${fail ? `, lỗi ${fail}` : ''}.<br>
    <span style="font-size:11.5px;opacity:.8">${matched.slice(0, 8).map(f => esc(f.name)).join(' · ')}${matched.length > 8 ? ' ...' : ''}</span></div>`;
  toast(`Đã lọc ${ok} ảnh vào "${dest.name}"`);
}

function photofilterView() {
  const v = viewState.filter;
  if (!v.mode) v.mode = 'alnum';
  if (!v.ext) v.ext = 'all';
  if (v.subInOrigin === undefined) v.subInOrigin = true;
  if (!v.subName) v.subName = 'Anh khach chon';
  const cands = state.bookings.filter(b => branchMatch(b) && b.gallery && b.gallery.photos.length)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!v.bookingId || !cands.some(b => b.id === v.bookingId)) v.bookingId = (cands.find(b => b.gallery.photos.some(p => p.selected)) || cands[0] || {}).id || '';
  const selBk = byId(state.bookings, v.bookingId);
  const codes = pfParseCodes(v.codes, v.mode);
  const step = (n, color, t, badge) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
    <div style="width:30px;height:30px;border-radius:50%;background:${color};color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none">${n}</div>
    <b style="font-size:15px;flex:1">${t}</b>${badge || ''}</div>`;
  const tg = (group, key, val, label, ic) => `<button class="btn btn-sm ${val === v[key] ? 'btn-primary' : 'btn-ghost'}" onclick="viewState.filter['${key}']='${group}';render()">${icon(ic)} ${label}</button>`;
  const hasDir = window.showDirectoryPicker;
  setTimeout(() => { const c = pfParseCodes(v.codes, v.mode); const el = $('#pf2Count'); if (el) el.textContent = c.length + ' mã hợp lệ'; }, 0);
  return `
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="card" style="padding:18px 20px;flex:1;min-width:320px">
      ${step(1, 'var(--primary)', 'Mã Ảnh Khách Chọn Để Lọc', `<span class="badge b-cat-khac" id="pf2Count">${codes.length} mã hợp lệ</span>`)}
      <div class="field"><label>Chọn Nguồn Khách Hàng / Album:</label>
        <select class="select" onchange="pfSourceChange(this.value)">
          ${cands.map(x => `<option value="${x.id}" ${x.id === v.bookingId ? 'selected' : ''}>${esc(custName(x.customerId))} · ${fmtDate(x.date)} — ❤ ${x.gallery.photos.filter(p => p.selected).length}/${x.gallery.photos.length} ảnh</option>`).join('') || '<option value="">— Chưa có album nào —</option>'}
        </select></div>
      <div class="field"><label>Chế độ lựa chọn: <span style="font-weight:400;color:var(--text-3);font-size:11.5px">tự động nhận diện với file gốc</span></label>
        <div class="pill-toggle">
          ${tg('alnum', 'mode', v.mode, 'Chữ và số', 'receipt')}
          ${tg('digits', 'mode', v.mode, 'Chỉ lấy số', 'package')}
        </div></div>
      <div class="field"><label>4 định dạng sao chép tức thì (1 chạm):</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="pfCopyFormat('line')">${icon('receipt')} Xuống dòng</button>
          <button class="btn btn-ghost btn-sm" onclick="pfCopyFormat('comma')">${icon('receipt')} Dấu phẩy</button>
          <button class="btn btn-ghost btn-sm" onclick="pfCopyFormat('space')">${icon('receipt')} Dấu cách</button>
          <button class="btn btn-ghost btn-sm" onclick="pfCopyFormat('ext')">${icon('receipt')} Có đuôi file</button>
        </div></div>
      <div class="field"><label>Danh Sách Mã Cần Lọc:</label>
        <textarea class="textarea" style="min-height:150px;font-family:monospace;font-size:12.5px" placeholder="Dán mã ảnh vào đây hoặc chọn Album ở trên (hỗ trợ mọi định dạng: Excel, Zalo, xuống dòng, dấu phẩy, dấu cách, có/không đuôi .jpg, .cr3, số thứ tự...)" oninput="viewState.filter.codes=this.value;const c=pfParseCodes(this.value,viewState.filter.mode);const el=document.getElementById('pf2Count');if(el)el.textContent=c.length+' mã hợp lệ'">${esc(v.codes)}</textarea></div>
      <div class="form-hint">💡 Hệ thống tự động so khớp thông minh bất kể bạn dán mã dạng chữ+số hay chỉ số, có hay không đuôi file.</div>
    </div>
    <div class="card" style="padding:18px 20px;flex:1;min-width:320px">
      ${step(2, 'var(--green)', 'Cấu Hình Thư Mục Trên Máy Tính')}
      ${hasDir ? `
      <div style="background:#f8fafc;border:1px solid var(--border);border-radius:12px;padding:13px 15px;margin-bottom:12px">
        <b style="font-size:12px">THƯ MỤC ẢNH GỐC (CHỨA RAW, JPG...)</b>
        <div class="cell-sub" style="margin:4px 0 10px">Chọn thư mục ảnh từ thẻ nhớ hoặc ổ cứng / NAS để công cụ quét</div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="pf2PickOrigin()">${icon('pin')} Chọn thư mục ảnh gốc trên PC</button>
          <i style="font-size:12px;color:var(--text-3)">${__pfOrigin ? '✓ ' + esc(__pfOrigin.name) : 'Chưa chọn thư mục nào'}</i>
        </div>
      </div>
      <div style="background:#f8fafc;border:1px solid var(--border);border-radius:12px;padding:13px 15px;margin-bottom:12px">
        <b style="font-size:12px">THƯ MỤC LƯU ẢNH ĐƯỢC LỌC RA</b>
        <div class="checkbox-row" style="margin-top:8px"><input type="checkbox" id="pfSubIn" ${v.subInOrigin ? 'checked' : ''} onchange="viewState.filter.subInOrigin=this.checked;render()"><label for="pfSubIn"><b>Tạo thư mục ảnh khách chọn ở trong thư mục gốc</b> (mặc định khuyên dùng)</label></div>
        <div class="cell-sub" style="margin:2px 0 8px 25px">Tự động tạo folder con bên trong thư mục gốc để gom toàn bộ ảnh đã lọc</div>
        ${v.subInOrigin
          ? `<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12.5px;font-weight:600">Tên thư mục con:</span><input class="input" style="max-width:220px" value="${esc(v.subName)}" oninput="viewState.filter.subName=this.value"></div>`
          : `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="pf2PickDest()">${icon('download')} Chọn thư mục lưu ảnh lọc ra</button><i style="font-size:12px;color:var(--text-3)">${__pfDest ? '✓ ' + esc(__pfDest.name) : 'Chưa chọn thư mục nào'}</i></div>`}
      </div>
      <div class="field"><label>Định dạng file cần lọc:</label>
        <div class="pill-toggle">
          ${tg('all', 'ext', v.ext, PF_EXT_LABEL.all, 'package')}
          ${tg('raw', 'ext', v.ext, PF_EXT_LABEL.raw, 'camera')}
          ${tg('jpg', 'ext', v.ext, PF_EXT_LABEL.jpg, 'receipt')}
        </div></div>
      <div id="pf2Result" style="margin-bottom:10px"></div>
      <button class="btn btn-primary btn-block" style="padding:13px;text-transform:uppercase;letter-spacing:.03em;${codes.length && __pfOrigin ? '' : 'opacity:.45;pointer-events:none'}" onclick="pf2Start()">▶ Bắt đầu lọc ảnh từ máy tính</button>
      <p style="font-size:11.5px;color:var(--text-3);margin-top:10px">Sẽ copy những file khớp mã (${v.mode === 'digits' ? 'theo số' : 'chữ và số'}) — giữ nguyên file gốc, không di chuyển.</p>
      ` : `
      <div class="field"><label>Trình duyệt không hỗ trợ đọc thư mục</label>
        <p style="font-size:12.5px;color:var(--text-2);line-height:1.6">Cần <b>Chrome/Edge</b> trên máy tính. Phương án thay thế:</p>
        <button class="btn btn-primary btn-block" style="margin-top:8px" onclick="pfDownloadBat('${v.bookingId}')">${icon('download')} Tải script lọc Windows (.bat)</button>
      </div>`}
    </div>
  </div>`;
}

function pfSourceChange(bid) {
  viewState.filter.bookingId = bid;
  const b = byId(state.bookings, bid);
  if (b && b.gallery) {
    const sel = b.gallery.photos.filter(p => p.selected).map(p => p.code);
    if (sel.length) viewState.filter.codes = sel.join('\n');
  }
  render();
}

const toMin = t => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const attOf = (staffId, date) => state.attendance.find(a => a.staffId === staffId && a.date === date) || null;

function workedHours(rec) {
  if (!rec || !rec.in || !rec.out) return 0;
  return Math.max(0, Math.round((toMin(rec.out) - toMin(rec.in)) / 15) * 15 / 60);
}

function attStatus(rec, sh) {
  if (!rec || !rec.in) return { label: 'Chưa vào ca', cls: 'b-inactive' };
  const S = sh || shiftOf(null);
  const late = toMin(rec.in) > toMin(S.start);
  const early = rec.out && toMin(rec.out) < toMin(S.end);
  if (!rec.out) return late ? { label: 'Muộn · đang trong ca', cls: 'b-pending' } : { label: 'Đang trong ca', cls: 'b-confirmed' };
  if (late || early) {
    const parts = [];
    if (late) parts.push('đi muộn');
    if (early) parts.push('về sớm');
    return { label: parts.join(', '), cls: 'b-pending' };
  }
  return { label: 'Đúng giờ', cls: 'b-delivered' };
}

function seedAttendance() {
  const recs = [];
  const mk = (staffId, off, inT, outT, note) => recs.push({ id: uid() + '-' + off + staffId, staffId, date: dOff(off), in: inT, out: outT || '', note: note || '', createdAt: dOff(off) });
  mk('s1', 0, '08:52', '');
  mk('s2', 0, '09:10', '', 'Kẹt xe');
  mk('s4', 0, '08:45', '17:30', '');
  for (let d = 1; d <= 9; d++) {
    mk('s1', -d, d % 3 === 0 ? '09:12' : '08:50', d % 4 === 0 ? '17:40' : '18:05');
    mk('s2', -d, d % 2 === 0 ? '08:58' : '09:20', '18:00');
    if (d % 5 !== 4) mk('s3', -d, '08:40', '17:35');
    mk('s4', -d, '08:47', d % 3 === 1 ? '16:50' : '18:10', d % 3 === 1 ? 'Có việc gia đình' : '');
  }
  return recs;
}

/* ---- Nút điểm danh cá nhân trên thanh trên ---- */
/* ---- Đồng hồ Việt Nam chạy thực + nút Vào ca / Thoát ca ---- */
let __clockTimer = null;
function startLiveClock() {
  const paint = () => {
    const el = document.getElementById('liveClock');
    if (!el) return;
    const d = new Date();
    el.innerHTML = `<b>${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</b><i>${WD[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}</i>`;
  };
  paint();
  if (!__clockTimer) __clockTimer = setInterval(paint, 1000);
}

function renderTopbarAttendance() {
  const box = $('#attWidget');
  if (!box) return;
  const u = currentUser();
  if (!u) { box.innerHTML = ''; return; }
  const un = unreadCount();
  const bell = can('notifications')
    ? `<span class="bell-wrap" style="display:inline-flex;align-items:center"><button class="icon-btn" title="Thông báo" onclick="navigate('notifications')"><svg class="icon"><use href="#i-alert"/></svg></button>${un ? `<span class="bell-dot">${un > 9 ? '9+' : un}</span>` : ''}</span>`
    : '';
  const clock = `<span class="live-clock" id="liveClock"></span>`;
  if (!u.staffId) { box.innerHTML = `${clock}${bell}<button class="punch-btn done" style="cursor:pointer" title="Tài khoản chưa liên kết nhân sự — bấm để mở trang gán liên kết" onclick="toast('Gán \"Liên kết nhân sự\" cho tài khoản này để bật nút chấm công');navigate('accounts')">${icon('clock')} Chấm công — bấm để gán nhân sự</button>`; startLiveClock(); return; }
  const rec = attOf(u.staffId, todayStr());
  const btnIn = `<button class="punch-btn in" ${rec ? 'disabled' : ''} onclick="selfPunch()" title="${rec ? 'Đã vào ca lúc ' + rec.in : 'Ghi giờ chấm công vào ca (kèm GPS)'}">▶ Vào ca làm</button>`;
  const btnOut = rec && !rec.out
    ? `<button class="punch-btn out" onclick="selfPunch()" title="Ghi giờ về — kèm GPS">■ Thoát ca làm</button>`
    : `<button class="punch-btn out" disabled title="${rec && rec.out ? 'Đã thoát ca ' + rec.out : 'Chưa vào ca'}">■ Thoát ca làm</button>`;
  const done = rec && rec.out ? `<span class="punch-time">✓ ${rec.in}–${rec.out} · ${workedHours(rec)}h</span>` : (rec ? `<span class="punch-time">trong ca từ ${rec.in}</span>` : '');
  box.innerHTML = `${clock}${done}${btnIn}${btnOut}${bell}`;
  startLiveClock();
}

/* ---- GPS khi chấm công ---- */
function getPunchGeo() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy || 0) }),
      () => res(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

function geoDistKm(a, b) {
  if (!a || !b) return null;
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.pow(Math.sin(dLng / 2), 2);
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function studioGeo() {
  const st = state.settings;
  return (+st.studioLat && +st.studioLng) ? { lat: +st.studioLat, lng: +st.studioLng, radius: +st.studioRadius || 200 } : null;
}

// Mọi vị trí chấm công hợp lệ: từng chi nhánh + vị trí mặc định (settings)
function geoTargets() {
  const t = [];
  (state.branches || []).forEach(b => { if (+b.lat && +b.lng) t.push({ name: b.name, lat: +b.lat, lng: +b.lng, radius: +b.radius || 200 }); });
  const d = studioGeo();
  if (d) t.push(Object.assign({ name: 'Vị trí mặc định' }, d));
  return t;
}

// Vị trí chuẩn gần nhất với toạ độ chấm công (để so khoảng cách)
function nearestGeoTarget(geo) {
  let best = null;
  geoTargets().forEach(t => { const d = geoDistKm(geo, t); if (d !== null && (!best || d < best.d)) best = { name: t.name, radius: t.radius, d }; });
  return best;
}

function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m) + ' m'; }

// Nơi làm việc trong ngày: ưu tiên chi nhánh khớp GPS VÀO ca; nếu vào ca không ở chi nhánh nào → dùng chi nhánh khớp GPS THOÁT ca
function recBranch(rec) {
  if (!rec) return null;
  const ok = geo => { const nt = geo ? nearestGeoTarget(geo) : null; return (nt && nt.d * 1000 <= nt.radius) ? nt : null; };
  return (ok(rec.inGeo) || ok(rec.outGeo) || {}).name || null;
}

function attGeoCell(r) {
  const line = (geo, lbl) => {
    if (!geo) return '';
    const nt = nearestGeoTarget(geo);
    const okM = nt && nt.d * 1000 <= nt.radius;
    return `<div style="display:flex;gap:5px;align-items:center;margin-top:2px;flex-wrap:wrap">
      <span class="cell-sub" style="flex:none;font-weight:800">${lbl}</span>
      <a class="link" style="font-size:10.5px" href="https://maps.google.com/?q=${geo.lat},${geo.lng}" target="_blank" rel="noopener" title="Xem trên bản đồ">${icon('pin')} ${geo.lat}, ${geo.lng}</a>
      ${nt ? `<span style="font-size:10px;font-weight:700;color:${okM ? 'var(--green)' : 'var(--red)'}">${okM ? '✓' : '⚠'} ${fmtDist(nt.d * 1000)}${okM ? ' · ' + esc(nt.name) : ' · xa ' + esc(nt.name)}</span>` : ''}
    </div>`;
  };
  const br = recBranch(r);
  return ((r.inGeo || r.outGeo) ? line(r.inGeo, 'Vào') + line(r.outGeo, 'Ra') : '<span class="cell-sub">—</span>')
    + (br ? `<div style="margin-top:4px"><span class="badge b-confirmed" title="Chi nhánh xác định theo GPS chấm công">Làm tại: ${esc(br)}</span></div>` : '');
}

function geoCellHtml(geo) {
  if (!geo) return '<span class="cell-sub">—</span>';
  const map = `<a class="link" href="https://maps.google.com/?q=${geo.lat},${geo.lng}" target="_blank" rel="noopener">${icon('pin')} ${geo.lat}, ${geo.lng}</a>`;
  const nt = nearestGeoTarget(geo);
  if (!nt) return map;
  const m = nt.d * 1000;
  const ok = m <= nt.radius;
  return map + `<div class="cell-sub" style="color:${ok ? 'var(--green)' : 'var(--red)'}">${ok ? '✓' : '⚠'} ${fmtDist(m)} — ${ok ? 'tại ' : 'xa '}${esc(nt.name)}</div>`;
}

async function selfPunch() {
  const u = currentUser();
  if (!u) return;
  if (!u.staffId) { toast('Tài khoản của bạn chưa liên kết nhân sự — quản trị viên sửa trong Tài khoản & Quyền', 'error'); return; }
  toast('Đang lấy vị trí GPS…');
  const geo = await getPunchGeo();
  const now = new Date();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const nt = geo ? nearestGeoTarget(geo) : null;
  const where = geo
    ? (nt ? ' · 📍 ' + fmtDist(nt.d * 1000) + (nt.d * 1000 <= nt.radius ? ' — tại ' + nt.name : ' — xa ' + nt.name) : ' · 📍 đã ghi vị trí')
    : ' · (không lấy được GPS)';
  const rec = attOf(u.staffId, todayStr());
  if (!rec) {
    state.attendance.push({ id: uid(), staffId: u.staffId, date: todayStr(), in: time, out: '', note: 'Tự chấm công' + (geo ? '' : ' (không có GPS)'), inGeo: geo || undefined, createdAt: todayStr() });
    logAction('create', 'attendance', staffName(u.staffId) + ' VÀO CA ' + time + (geo ? ' (có GPS)' : ' (không GPS)'));
    toast('Đã VÀO CA lúc ' + time + ' 👋' + where);
  } else if (!rec.out) {
    rec.out = time;
    rec.outGeo = geo || undefined;
    logAction('update', 'attendance', staffName(u.staffId) + ' THOÁT CA ' + time + ' (' + workedHours(rec) + ' giờ)');
    // Vào ca không ở chi nhánh nào nhưng thoát ca ở chi nhánh → ghi nhận làm tại chi nhánh đó
    let extra = '';
    if (geo) {
      const inB = recBranch({ inGeo: rec.inGeo });
      const outB = nearestGeoTarget(geo);
      if (outB && outB.d * 1000 <= outB.radius && outB.name !== inB) extra = ' — ghi nhận làm tại ' + outB.name;
    }
    toast('Đã THOÁT CA lúc ' + time + ' — làm việc ' + workedHours(rec) + ' giờ hôm nay' + where + extra);
  } else { toast('Hôm nay bạn đã chấm công đủ rồi ✓', 'error'); return; }
  save(); renderTopbarAttendance(); render();
}

/* ---- Phân hệ quản lý chấm công ---- */
/* ---- Chia ca làm việc theo tuần (kiểu bảng Excel) ---- */
const spISO = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function spWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Thứ 2 = đầu tuần
  return spISO(d);
}
function spAddDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return spISO(d);
}

function shiftplanView() {
  const vs = viewState.shiftplan = viewState.shiftplan || { week: spWeekStart(todayStr()) };
  const list = state.staff.filter(s => s.active && branchMatch(s));
  const days = Array.from({ length: 7 }, (_, i) => spAddDays(vs.week, i));
  const cellCls = k => k === 'ca1' ? 'sp-ca1' : k === 'ca2' ? 'sp-ca2' : k === 'off' ? 'sp-off' : 'sp-normal';
  const cellVal = (date, s) => ((state.shiftPlan || {})[date] || {})[s.id] || '';
  const countFor = (date, key) => list.filter(s => {
    const v = cellVal(date, s);
    if (key === 'work') return v !== 'off'; // ô trống = làm ca mặc định → vẫn tính
    return v === key;
  }).length;
  const wkBtn = (lbl, n) => `<button class="btn btn-ghost btn-sm" onclick="viewState.shiftplan.week=spAddDays(viewState.shiftplan.week,${n * 7});render()">${lbl}</button>`;
  return `
  <div class="toolbar">
    <span style="font-size:13px;color:var(--text-2)">${list.length} nhân sự · tuần ${fmtDate(vs.week)} → ${fmtDate(days[6])}</span>
    ${wkBtn('‹ Tuần trước', -1)}
    <button class="btn btn-ghost btn-sm" onclick="viewState.shiftplan.week=spWeekStart(todayStr());render()">Tuần này</button>
    ${wkBtn('Tuần sau ›', 1)}
    <div class="spacer"></div>
    <button class="btn btn-ghost btn-sm" title="Điền ca mặc định của từng người vào các ô trống cả tuần" onclick="spFillDefaults('${vs.week}')">${icon('refresh')} Điền ca mặc định cả tuần</button>
    <button class="btn btn-ghost btn-sm" title="Xóa hết phân ca của tuần này (về ca mặc định)" onclick="spClearWeek('${vs.week}')">${icon('trash')} Xóa lịch tuần</button>
  </div>
  <div class="card list-wrap"><div class="table-wrap" style="overflow-x:auto">
  <table class="sp-table">
    <thead><tr>
      <th style="min-width:150px">Tên</th><th style="min-width:110px">Vị trí</th>
      ${days.map(d => `<th class="ta-c ${d === todayStr() ? 'sp-today' : ''}">${d.slice(8)}/${d.slice(5, 7)}<div class="cell-sub">${WD_SHORT[new Date(d + 'T00:00:00').getDay()]}</div></th>`).join('')}
    </tr></thead>
    <tbody>
    ${list.map(s => `<tr>
      <td><div class="cell-main">${esc(s.name)}</div></td>
      <td><span class="badge b-role-${s.role}">${ROLES[s.role]}</span></td>
      ${days.map(d => `<td class="ta-c sp-cell ${d === todayStr() ? 'sp-today' : ''}">
        <select class="select sp-sel ${cellCls(cellVal(d, s))}" onchange="spSet('${d}','${s.id}',this.value)" title="${esc(s.name)} · ${fmtDate(d)}">
          ${['', 'ca1', 'normal', 'ca2', 'off'].map(k => {
            const sh = k ? SHIFTS[k] : null;
            const def = !k ? shiftOf(s) : null;
            return `<option value="${k}" ${cellVal(d, s) === k ? 'selected' : ''}>${k === '' ? '· ' + def.short + ' (mặc định)' : k === 'off' ? 'Nghỉ' : sh.label}</option>`;
          }).join('')}
        </select>
        <input class="sp-note" placeholder="ghi chú…" title="Ghi chú nhanh — VD: Đổ rác, Quét lau tầng 2" value="${esc((((state.shiftNotes || {})[d]) || {})[s.id] || '')}" oninput="spSetNote('${d}','${s.id}',this.value)">
      </td>`).join('')}
    </tr>`).join('') || emptyRow(9, 'Chưa có nhân sự đang hoạt động')}
    </tbody>
    <tfoot><tr>
      <td colspan="2" class="ta-r money-muted">Số người làm:</td>
      ${days.map(d => `<td class="ta-c"><b>${countFor(d, 'work')}</b> người<div class="cell-sub">C1 ${countFor(d, 'ca1')} · C2 ${countFor(d, 'ca2')}</div></td>`).join('')}
    </tr></tfoot>
  </table></div></div>
  <p style="font-size:12px;color:var(--text-3);margin-top:10px">Chọn ca cho từng người từng ngày. Ô <b>· Ca (mặc định)</b> nghĩa là dùng ca gán trong hồ sơ nhân sự. Chấm công và tính muộn/về sớm tự theo ca đã chia của ngày đó.</p>`;
}

function spSet(date, staffId, val) {
  state.shiftPlan = state.shiftPlan || {};
  if (!state.shiftPlan[date]) state.shiftPlan[date] = {};
  if (val) state.shiftPlan[date][staffId] = val; else delete state.shiftPlan[date][staffId];
  const s = byId(state.staff, staffId);
  const lbl = val ? SHIFTS[val].short : 'mặc định';
  logAction('update', 'shift', (s ? s.name : staffId) + ' · ' + fmtDate(date) + ' → ' + lbl);
  save();
  // vẽ lại màu ô mà không render cả trang (giữ focus)
  render();
}

let __noteTimer = null;
function spSetNote(date, staffId, val) {
  state.shiftNotes = state.shiftNotes || {};
  if (!state.shiftNotes[date]) state.shiftNotes[date] = {};
  if (val.trim()) state.shiftNotes[date][staffId] = val.trim();
  else delete state.shiftNotes[date][staffId];
  clearTimeout(__noteTimer);
  __noteTimer = setTimeout(() => save(), 600); // lưu trễ — không render lại để không mất con trỏ đang gõ
}

function spFillDefaults(week) {
  if (!confirm('Điền ca mặc định của từng nhân sự vào tất cả ô trống của tuần này?')) return;
  for (let i = 0; i < 7; i++) {
    const d = spAddDays(week, i);
    state.shiftPlan[d] = state.shiftPlan[d] || {};
    state.staff.filter(s => s.active).forEach(s => { if (!state.shiftPlan[d][s.id]) state.shiftPlan[d][s.id] = s.shift || 'normal'; });
  }
  logAction('data', 'shift', 'Điền ca mặc định cho tuần từ ' + fmtDate(week));
  save(); render(); toast('Đã điền ca mặc định cả tuần');
}

function spClearWeek(week) {
  if (!confirm('Xóa hết phân ca riêng của tuần này? (nhân sự quay về ca mặc định)')) return;
  for (let i = 0; i < 7; i++) delete state.shiftPlan[spAddDays(week, i)];
  logAction('delete', 'shift', 'Xóa lịch ca tuần từ ' + fmtDate(week));
  save(); render(); toast('Đã xóa lịch tuần');
}

function attendanceView() {
  const v = viewState.attendance;
  const tab = (t, label) => `<button class="${v.tab === t ? 'active' : ''}" onclick="viewState.attendance.tab='${t}';render()">${label}</button>`;
  const body = v.tab === 'month' ? attendanceMonthTab() : attendanceDayTab();
  setTimeout(refreshPresence, 80);
  return `
  <div id="presenceBox"></div>
  <div class="toolbar">
    <div class="pill-toggle">${tab('day', 'Theo ngày')}${tab('month', 'Tháng này')}</div>
    ${v.tab === 'month'
      ? `<input class="input" type="month" style="width:auto" value="${v.month}" onchange="viewState.attendance.month=this.value;render()">`
      : `<input class="input" type="date" style="width:auto" value="${v.date}" onchange="viewState.attendance.date=this.value;render()">`}
  </div>
  ${body}`;
}

function attendanceDayTab() {
  const date = viewState.attendance.date;
  const list = state.staff.filter(s => s.active && branchMatch(s));
  const done = list.filter(s => attOf(s.id, date)).length;
  return `
  <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
    ${statCard('clock', 'tint-blue', done + '/' + list.length, 'Nhân sự đã vào ca', `<span class="stat-sub muted">${weekday(date)}, ${fmtDate(date)} · giờ chuẩn theo ca từng người</span>`)}
    ${statCard('alert', 'tint-amber', list.filter(s => { const r = attOf(s.id, date); return r && toMin(r.in) > toMin(effShift(s, date).start); }).length, 'Đi muộn (theo ca)', '')}
    ${statCard('user', 'tint-cyan', list.length - done, 'Chưa điểm danh', '')}
  </div>
  <div class="card list-wrap"><div class="table-wrap">
  <table>
    <thead><tr><th>Nhân sự</th><th>Vào ca</th><th>Thoát ca</th><th class="ta-r">Giờ làm</th><th>Trạng thái</th><th>Vị trí chấm công</th><th>Ghi chú</th><th class="ta-c">Thao tác</th></tr></thead>
    <tbody>
    ${list.map(s => {
      const r = attOf(s.id, date);
      const sh = effShift(s, date);
      const st = attStatus(r, sh);
      return `<tr>
        <td><div class="cell-main">${esc(s.name)}</div><div class="cell-sub">${ROLES[s.role] || ''} · ${sh.short} (${sh.start}–${sh.end})</div></td>
        <td class="${r && toMin(r.in) > toMin(sh.start) ? 'loan-late' : 'money-muted'}">${r ? r.in : '—'}</td>
        <td class="${r && r.out && toMin(r.out) < toMin(sh.end) ? 'loan-late' : 'money-muted'}">${r && r.out ? r.out : '—'}</td>
        <td class="money ta-r">${r && r.out ? workedHours(r) + 'h' : '—'}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
        <td style="max-width:215px;font-size:11px">${r ? attGeoCell(r) : '<span class="cell-sub">—</span>'}</td>
        <td class="money-muted" style="max-width:180px">${r && r.note ? esc(r.note) : '—'}</td>
        <td class="cell-actions ta-c"><button class="icon-btn" title="${r ? 'Sửa' : 'Chấm bổ sung'}" onclick="openAttendanceModal('${s.id}','${date}')">${icon(r ? 'edit' : 'plus')}</button></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div></div>`;
}

function attendanceMonthTab() {
  const month = viewState.attendance.month;
  const list = state.staff.filter(s => s.active && branchMatch(s));
  const rows = list.map(s => {
    const recs = state.attendance.filter(a => a.staffId === s.id && (a.date || '').startsWith(month));
    const hours = recs.reduce((t, r) => t + workedHours(r), 0);
    const lates = recs.filter(r => toMin(r.in) > toMin(effShift(s, r.date).start)).length;
    const noOut = recs.filter(r => !r.out).length;
    return { s, days: recs.length, hours, lates, noOut };
  });
  return `
  <div class="toolbar" style="margin-bottom:12px">
    <span style="font-size:13px;color:var(--text-2)">Bảng chấm công tháng ${month.split('-')[1]}/${month.split('-')[0]}</span>
    <div class="spacer"></div>
    <button class="btn btn-ghost btn-sm" onclick="exportAttendanceExcel()">${icon('download')} Xuất Excel</button>
    <button class="btn btn-ghost btn-sm" onclick="printAttendanceMonth()">${icon('printer')} Xuất PDF</button>
  </div>
  <div class="card list-wrap"><div class="table-wrap">
  <table>
    <thead><tr><th>Nhân sự</th><th class="ta-c">Ngày có mặt</th><th class="ta-r">Tổng giờ làm</th><th class="ta-r">Giờ TB/ngày</th><th class="ta-c">Số lần muộn</th><th class="ta-c">Chưa chấm ra</th></tr></thead>
    <tbody>
    ${rows.map(r => `<tr>
      <td><div class="cell-main">${esc(r.s.name)}</div><div class="cell-sub">${ROLES[r.s.role] || ''}</div></td>
      <td class="ta-c money-muted">${r.days}</td>
      <td class="money ta-r">${Math.round(r.hours * 10) / 10}h</td>
      <td class="money-muted ta-r">${r.days ? (Math.round(r.hours / r.days * 10) / 10) + 'h' : '—'}</td>
      <td class="ta-c ${r.lates ? 'loan-late' : 'money-muted'}">${r.lates}</td>
      <td class="ta-c money-muted">${r.noOut}</td>
    </tr>`).join('') || emptyRow(6, 'Chưa có dữ liệu chấm công')}
    </tbody>
  </table></div></div>
  <p style="font-size:12px;color:var(--text-3);margin-top:10px">Thống kê tháng ${month.split('-')[1]}/${month.split('-')[0]} — giờ làm chuẩn ${state.settings.workStart}–${state.settings.workEnd} (đổi trong Cài đặt).</p>`;
}

function openAttendanceModal(staffId, date) {
  const s = byId(state.staff, staffId);
  const r = attOf(staffId, date);
  openModal(`
    <div class="modal-head"><h3>${r ? 'Sửa chấm công' : 'Chấm bổ sung'} — ${esc(s ? s.name : '')}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field"><label>Ngày</label><input class="input" type="date" name="date" value="${date}" readonly style="background:#f8fafc"></div>
      <div class="field"><label>Giờ vào</label><input class="input" type="time" name="in" value="${r ? r.in : ''}"></div>
      <div class="field"><label>Giờ ra</label><input class="input" type="time" name="out" value="${r ? (r.out || '') : ''}"></div>
      <div class="field"><label>Ghi chú</label><input class="input" name="note" value="${esc(r ? r.note : '')}" placeholder="Lý do muộn, nghỉ bù..."></div>
    </form>
    <div class="modal-foot">
      ${r ? `<button class="btn btn-danger" onclick="deleteAttendance('${r.id}')">${icon('trash')} Xóa</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveAttendance('${staffId}','${date}')">${icon('check')} Lưu</button>
    </div>`, 'sm');
}

function saveAttendance(staffId, date) {
  const f = $('#frm');
  const fd = new FormData(f);
  const data = { in: fd.get('in') || '', out: fd.get('out') || '', note: fd.get('note').trim() };
  if (!data.in && !data.out) { toast('Cần nhập giờ vào hoặc giờ ra', 'error'); return; }
  let r = attOf(staffId, date);
  if (r) { Object.assign(r, data); logAction('update', 'attendance', staffName(staffId) + ' ' + fmtDate(date)); }
  else { r = { id: uid(), staffId, date, ...data, createdAt: todayStr() }; state.attendance.push(r); logAction('create', 'attendance', staffName(staffId) + ' ' + fmtDate(date) + ' (quản trị chấm)'); }
  save(); closeModal(); render();
  toast('Đã lưu chấm công ' + staffName(staffId));
}

function deleteAttendance(id) {
  const r = byId(state.attendance, id);
  if (!r) return;
  confirmDialog('Xóa bản chấm công?', `Xóa chấm công của <b>${esc(staffName(r.staffId))}</b> ngày ${fmtDate(r.date)}?`, 'Xóa', () => {
    state.attendance = state.attendance.filter(x => x.id !== id);
    logAction('delete', 'attendance', staffName(r.staffId) + ' ' + fmtDate(r.date));
    save(); render(); toast('Đã xóa bản chấm công');
  });
}

/* ---- Xuất bảng chấm công tháng ---- */
function attMonthData() {
  const month = viewState.attendance.month;
  const st = state.settings;
  return {
    month,
    summary: state.staff.filter(s => s.active).map(s => {
      const recs = state.attendance.filter(a => a.staffId === s.id && (a.date || '').startsWith(month));
      const h = recs.reduce((t, r) => t + workedHours(r), 0);
      return { name: s.name, days: recs.length, hours: Math.round(h * 10) / 10,
        avg: recs.length ? Math.round(h / recs.length * 10) / 10 : 0,
        lates: recs.filter(r => toMin(r.in) > toMin(effShift(s, r.date).start)).length };
    }),
    detail: state.staff.filter(s => s.active).flatMap(s =>
      state.attendance.filter(a => a.staffId === s.id && (a.date || '').startsWith(month))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .map(a => ({ name: s.name, date: a.date, in: a.in, out: a.out || '', hours: a.out ? workedHours(a) : '', status: attStatus(a, shiftOf(s)).label, note: a.note || '' }))
    ),
  };
}

function exportAttendanceExcel() {
  const d = attMonthData();
  const rows = [
    ['BẢNG CHẤM CÔNG THÁNG ' + d.month.split('-')[1] + '/' + d.month.split('-')[0] + ' — ' + state.settings.studioName],
    ['NHÂN SỰ', 'NGÀY', 'GIỜ VÀO', 'GIỜ RA', 'GIỜ LÀM', 'TRẠNG THÁI', 'GHI CHÚ'],
    ...d.detail.map(r => [r.name, fmtDate(r.date), r.in, r.out, r.hours, r.status, r.note]),
    [],
    ['TỔNG HỢP', 'NGÀY CÓ MẶT', 'TỔNG GIỜ', 'GIỜ TB/NGÀY', 'SỐ LẦN MUỘN'],
    ...d.summary.map(r => [r.name, r.days, r.hours, r.avg, r.lates]),
  ];
  const csv = '\uFEFF' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'cham-cong-' + d.month + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  logAction('data', 'attendance', 'Xuất Excel bảng chấm công tháng ' + d.month);
  save();
  toast('Đã xuất Excel (file CSV mở được bằng Excel) tháng ' + d.month);
}

function printAttendanceMonth() {
  const d = attMonthData();
  const st = state.settings;
  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Chấm công ${d.month}</title>
<style>body{font-family:'Be Vietnam Pro',Arial,sans-serif;color:#111;padding:30px 36px;font-size:12.5px}
h1{font-size:16px;text-align:center;color:#4f46e5;margin-bottom:2px}
p.sub{text-align:center;color:#555;font-size:12px;margin-bottom:18px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ddd;padding:6px 9px}
th{background:#f4f5fb;font-size:11px;text-transform:uppercase}
h2{font-size:13px;margin:6px 0}
tfoot td{font-weight:700;background:#fafbff}</style></head><body>
<h1>BẢNG CHẤM CÔNG THÁNG ${d.month.split('-')[1]}/${d.month.split('-')[0]}</h1>
<p class="sub">${esc(st.studioName)} · Giờ làm chuẩn: ${st.workStart}–${st.workEnd}</p>
<h2>Tổng hợp</h2>
<table><thead><tr><th>Nhân sự</th><th>Ngày có mặt</th><th>Tổng giờ</th><th>Giờ TB/ngày</th><th>Số lần muộn</th></tr></thead>
<tbody>${d.summary.map(r => `<tr><td>${esc(r.name)}</td><td style="text-align:center">${r.days}</td><td style="text-align:right">${r.hours}h</td><td style="text-align:center">${r.avg}h</td><td style="text-align:center">${r.lates}</td></tr>`).join('')}</tbody></table>
<h2>Chi tiết điểm danh</h2>
<table><thead><tr><th>Nhân sự</th><th>Ngày</th><th>Vào</th><th>Ra</th><th>Giờ làm</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead>
<tbody>${d.detail.map(r => `<tr><td>${esc(r.name)}</td><td>${fmtDate(r.date)}</td><td>${r.in}</td><td>${r.out || '—'}</td><td style="text-align:right">${r.hours === '' ? '—' : r.hours + 'h'}</td><td>${r.status}</td><td>${esc(r.note)}</td></tr>`).join('')}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`;
  try {
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) { toast('Trình duyệt đã chặn cửa sổ in — hãy cho phép popup', 'error'); return; }
    w.document.write(html); w.document.close(); w.focus();
  } catch (e) { toast('Không mở được cửa sổ in', 'error'); }
}

/* ================= TÀI CHÍNH & LƯƠNG ================= */
const EXP_CATS = ['Thuê studio', 'Nhân sự', 'Quảng cáo', 'Đồ nghề & thiết bị', 'Điện nước', 'Vận chuyển', 'Khác'];
const monthExpenses = key => state.expenses.filter(e => (e.date || '').startsWith(key) && branchMatch(e)).reduce((s, e) => s + (+e.amount || 0), 0);

function seedExpenses() {
  return [
    { id: 'e1', date: dOff(-95), category: 'Thuê studio', amount: 8000000, note: 'Thuê mặt bằng tháng 7' },
    { id: 'e2', date: dOff(-90), category: 'Quảng cáo', amount: 2500000, note: 'Quảng cáo Facebook' },
    { id: 'e3', date: dOff(-65), category: 'Thuê studio', amount: 8000000, note: 'Thuê mặt bằng tháng 8' },
    { id: 'e4', date: dOff(-60), category: 'Đồ nghề & thiết bị', amount: 12500000, note: 'Mua đèn flash + softbox' },
    { id: 'e5', date: dOff(-45), category: 'Điện nước', amount: 1800000, note: '' },
    { id: 'e6', date: dOff(-35), category: 'Thuê studio', amount: 8000000, note: 'Thuê mặt bằng tháng 9' },
    { id: 'e7', date: dOff(-30), category: 'Quảng cáo', amount: 3000000, note: 'Ads + Google Maps' },
    { id: 'e8', date: dOff(-12), category: 'Thuê studio', amount: 8000000, note: 'Thuê mặt bằng tháng 10' },
    { id: 'e9', date: dOff(-8), category: 'Vận chuyển', amount: 2200000, note: 'Xe ngoại cảnh Vũng Tàu' },
    { id: 'e10', date: dOff(-3), category: 'Đồ nghề & thiết bị', amount: 4500000, note: 'Thay 2 bóng đèn studio' },
  ];
}

const CASH_CATS_IN = ['Thu đơn hàng', 'Tiền cọc', 'Bán phụ kiện / ảnh thêm', 'Thu khác'];
const CASH_CATS_OUT = ['Lương & thưởng', 'Thuê studio / nhà', 'Quảng cáo', 'Đồ nghề & thiết bị', 'Điện nước', 'Vận chuyển', 'Chi hộ khách', 'Chi khác'];
const CASH_METHODS = ['Tiền mặt', 'Chuyển khoản', 'QR', 'Thẻ'];

function seedCash() {
  return [
    { id: 'cf1', type: 'out', date: dOff(-12), amount: 8000000, cat: 'Thuê studio / nhà', method: 'Chuyển khoản', note: 'Thuê mặt bằng tháng 10', orderId: '', by: 'admin' },
    { id: 'cf2', type: 'out', date: dOff(-9), amount: 3200000, cat: 'Quảng cáo', method: 'Chuyển khoản', note: 'Ads tháng 10', orderId: '', by: 'admin' },
    { id: 'cf3', type: 'in', date: dOff(-8), amount: 5000000, cat: 'Tiền cọc', method: 'QR', note: 'Cọc buổi chụp gia đình', orderId: 'o15', by: 'admin' },
    { id: 'cf4', type: 'in', date: dOff(-6), amount: 7500000, cat: 'Thu đơn hàng', method: 'Chuyển khoản', note: 'Thanh toán đủ gói Mom & Baby', orderId: 'o13', by: 'admin' },
    { id: 'cf5', type: 'out', date: dOff(-5), amount: 1500000, cat: 'Đồ nghề & thiết bị', method: 'Tiền mặt', note: 'Mua thẻ nhớ + pin', orderId: '', by: 'admin' },
    { id: 'cf6', type: 'in', date: dOff(-3), amount: 450000, cat: 'Bán phụ kiện / ảnh thêm', method: 'Tiền mặt', note: 'Bán album thêm cho khách', orderId: '', by: 'admin' },
    { id: 'cf7', type: 'out', date: dOff(-2), amount: 2200000, cat: 'Vận chuyển', method: 'Tiền mặt', note: 'Xe đi ngoại cảnh', orderId: '', by: 'admin' },
    { id: 'cf8', type: 'in', date: dOff(-1), amount: 3000000, cat: 'Tiền cọc', method: 'QR', note: 'Cọc gói chụp sản phẩm', orderId: 'o16', by: 'admin' },
  ];
}

function financeView() {
  const v = viewState.finance;
  const tab = (t, label) => `<button class="${v.tab === t ? 'active' : ''}" onclick="viewState.finance.tab='${t}';render()">${label}</button>`;
  const monthInput = `<input class="input" type="month" style="width:auto" value="${v.month}" onchange="viewState.finance.month=this.value;render()">`;
  let body = '';
  if (v.tab === 'expenses') body = expensesTab();
  else if (v.tab === 'payroll') body = payrollTab();
  else if (v.tab === 'cash') body = cashTab();
  else body = reportTab();
  return `
  <div class="toolbar">
    <div class="pill-toggle">${tab('report', 'Báo cáo')}${tab('cash', 'Thu chi')}${tab('expenses', 'Chi phí')}${tab('payroll', 'Lương')}</div>
    ${monthInput}
  </div>
  ${body}`;
}

function reportTab() {
  const key = viewState.finance.month;
  const rev = revenueOfMonth(key);
  const exp = monthExpenses(key);
  const salDue = state.payrolls.filter(p => p.month === key && !p.paid).reduce((s, p) => s + (+p.total || 0), 0);
  const profit = rev - exp;
  const months = [];
  for (let i = 5; i >= 0; i--) { const k = monthKey(-i); months.push({ label: 'T' + (+k.split('-')[1]), rev: revenueOfMonth(k), exp: monthExpenses(k) }); }
  const maxV = Math.max(...months.map(m => Math.max(m.rev, m.exp)), 1);
  return `
  <div class="stat-grid">
    ${statCard('money', 'tint-indigo', fmtMoney(rev), 'Doanh thu tháng (đã thu)', '')}
    ${statCard('card', 'tint-red', fmtMoney(exp), 'Chi phí tháng', '')}
    ${statCard('money', 'tint-green', fmtMoney(profit), 'Lợi nhuận (trước lương)', `<span class="stat-sub ${profit >= 0 ? 'up' : 'down'}">${profit >= 0 ? icon('arrow-up') : icon('arrow-down')} ${Math.abs(rev ? Math.round(profit / rev * 100) : 0)}% doanh thu</span>`)}
    ${statCard('user', 'tint-amber', fmtMoney(salDue), 'Lương chưa trả trong tháng', '')}
  </div>
  <div class="card">
    <div class="card-head"><h3>Doanh thu vs Chi phí — 6 tháng</h3>
      <span class="right" style="display:flex;gap:10px;font-size:11.5px;color:var(--text-2)">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--primary);margin-right:4px"></span>Doanh thu</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#f87171;margin-right:4px"></span>Chi phí</span>
      </span>
    </div>
    <div class="card-pad">
      <div class="chart">
        ${months.map(m => `
        <div class="bar-col" title="${m.label}: doanh thu ${fmtMoney(m.rev)} / chi phí ${fmtMoney(m.exp)}">
          <div style="display:flex;gap:4px;flex:1;align-items:flex-end;justify-content:center;width:100%">
            <div class="bar" style="height:${Math.max(3, Math.round(m.rev / maxV * 100))}%;width:42%;max-width:22px;background:linear-gradient(180deg,var(--violet),var(--primary))"></div>
            <div class="bar" style="height:${Math.max(3, Math.round(m.exp / maxV * 100))}%;width:42%;max-width:22px;background:#f87171"></div>
          </div>
          <div class="bar-lbl">${m.label}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

/* ---- Đính kèm ảnh (biên lai chi, thu chi, hóa đơn) ---- */
const ATT_MAX = 4;
let __attTemp = [];
const attInit = photos => { __attTemp = (photos || []).slice(0, ATT_MAX); attPaint(); };

/* ---- Nhắn Tin (Zalo / Facebook Fanpage) ---- */
const CHAN = {
  zalo: { label: 'Zalo', color: '#0068FF', bg: '#e7f0ff' },
  fb: { label: 'Facebook', color: '#0866FF', bg: '#e7efff' },
  web: { label: 'Web', color: '#059669', bg: '#e6f7f1' },
};
// Phân loại + thẻ hội thoại (kiểu Pancake)
const CHAT_STATUS = {
  pending: { label: 'Chờ trả lời', color: '#b45309', bg: '#fef3c7' },
  replied: { label: 'Đã trả lời', color: '#1d4ed8', bg: '#dbeafe' },
  done:    { label: 'Xong', color: '#047857', bg: '#d1fae5' },
};
const CHAT_TAGS = ['Khách mới', 'Đã báo giá', 'Chờ cọc', 'Đã chốt lịch', 'Khách VIP', 'Hỏi lại sau', 'Spam'];
const MSG_TEMPLATES = [
  'Xin chào {name}! Studio cảm ơn bạn đã quan tâm dịch vụ chụp 📸',
  'Dạ báo giá gói {gói} hiện tại là …đ — đã bao gồm …Bạn cần em gửi chi tiết không ạ?',
  'Bạn ơi đặt cọc giúp studio 30% để giữ lịch nhé — có QR chuyển khoản em gửi ngay.',
  'Ảnh của bạn đã hậu kỳ xong, xem trước tại link album của studio nhé ❤',
  'Cảm ơn bạn đã sử dụng dịch vụ! Nhớ đánh giá 5⭐ giúp studio nha 🥰',
];
let __openChat = null;

function seedChats() {
  const t = Date.now(), mm = n => new Date(t - n * 60000).toISOString();
  return [
    { id: uid(), channel: 'zalo', name: 'Nguyễn Ngọc Anh', phone: '0901 222 333', lastRead: mm(1), status: 'pending', tags: ['Đã báo giá'],
      msgs: [
        { from: 'them', text: 'Chào studio, mình muốn hỏi gói chụp gia đình 4 người giá bao nhiêu ạ?', ts: mm(24) },
        { from: 'me', text: 'Chào chị Anh 👋 Gói gia đình 4 người là 3.500.000đ — gồm 60 ảnh chỉnh sửa, 1 bộ áo và album 20×30. Chị đặt lịch tuần này studio ưu tiên tặng thêm 5 ảnh ạ!', ts: mm(21) },
        { from: 'them', text: 'A ơi cho em hỏi giá gói chụp mẹ và bé với ạ, bé nhà em được 8 tháng', ts: mm(3) },
      ] },
    { id: uid(), channel: 'fb', name: 'Trần Minh Quân', phone: '0938 555 111', lastRead: mm(60), status: 'replied', tags: ['Chờ cọc'],
      msgs: [
        { from: 'them', text: 'Fanpage ơi, tháng 11 còn lịch chụp couples không?', ts: mm(150) },
        { from: 'me', text: 'Dạ còn anh nhé! Anh ghim lịch thứ 7 hoặc CN đều được ạ 📅', ts: mm(140) },
        { from: 'them', text: 'OK để anh bàn với người yêu rồi chốt nhé', ts: mm(138) },
      ] },
    { id: uid(), channel: 'zalo', name: 'Lê Thị Hồng Vân', phone: '0977 888 999', lastRead: mm(200), status: 'done', tags: ['Khách VIP'],
      msgs: [
        { from: 'them', text: 'Ảnh đã nhận rồi, đẹp lắm ạ, cảm ơn studio nhiều!', ts: mm(400) },
        { from: 'me', text: 'Studio rất vui khi chị hài lòng ạ 🥰 Nhớ đánh giá 5⭐ giúp studio nhé chị!', ts: mm(395) },
      ] },
  ];
}

function chatUnread(c) {
  return c.msgs.filter(m => m.from === 'them' && (!c.lastRead || m.ts > c.lastRead)).length;
}

function msgTime(ts) {
  const d = new Date(ts), now = new Date();
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (d.toDateString() === now.toDateString()) return hm;
  return fmtDate(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())) + ' ' + hm;
}

function chatsView() {
  const v = viewState.chats = viewState.chats || { q: '', chan: 'all', tag: '', status: '' };
  const list = state.chats
    .filter(c => v.chan === 'all' || c.channel === v.chan)
    .filter(c => !v.tag || (c.tags || []).includes(v.tag))
    .filter(c => !v.status || c.status === v.status)
    .filter(c => !v.q || [c.name, c.phone].some(x => String(x || '').toLowerCase().includes(v.q.trim().toLowerCase())))
    .sort((a, b) => (b.msgs[b.msgs.length - 1] || {}).ts.localeCompare((a.msgs[a.msgs.length - 1] || {}).ts));
  const cur = __openChat && state.chats.find(c => c.id === __openChat);
  const totalUnread = state.chats.reduce((s, c) => s + chatUnread(c), 0);
  const pending = state.chats.filter(c => c.status === 'pending').length;
  const chanBtn = k => `<button class="${v.chan === k ? 'active' : ''}" onclick="viewState.chats.chan='${k}';render()">${k === 'all' ? 'Tất cả' : CHAN[k].label}</button>`;
  const tagChipHtml = (t, i) => `<span class="msg-tag" style="background:${i === undefined ? '#f1f5f9' : ['#fef3c7', '#dbeafe', '#d1fae5', '#ede9fe', '#fce7f3', '#e0f2fe', '#f1f5f9'][i % 7]}">${esc(t)}</span>`;
  return `
  <div class="toolbar">
    <div class="pill-toggle">${chanBtn('all')}${chanBtn('zalo')}${chanBtn('fb')}${chanBtn('web')}</div>
    <select class="select" style="width:auto" title="Lọc theo phân loại" onchange="viewState.chats.status=this.value;render()">
      <option value="">Mọi trạng thái</option>
      ${Object.entries(CHAT_STATUS).map(([k, s]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${s.label}${state.chats.filter(c => c.status === k).length ? ' (' + state.chats.filter(c => c.status === k).length + ')' : ''}</option>`).join('')}
    </select>
    <select class="select" style="width:auto" title="Lọc theo thẻ" onchange="viewState.chats.tag=this.value;render()">
      <option value="">Mọi thẻ</option>
      ${CHAT_TAGS.map(t => `<option value="${t}" ${v.tag === t ? 'selected' : ''}>🏷 ${t}</option>`).join('')}
    </select>
    <span class="badge b-unpaid">${totalUnread} chưa đọc</span>
    <span class="badge" style="background:${CHAT_STATUS.pending.bg};color:${CHAT_STATUS.pending.color}">${pending} chờ trả lời</span>
    <div class="spacer"></div>
    <button class="btn btn-ghost" onclick="openTemplatesModal()" title="Quản lý mẫu tin nhắn">${icon('receipt')} Mẫu tin nhắn</button>
    <button class="btn btn-ghost" onclick="openChatConnModal()" title="Kết nối Fanpage / Zalo OA">${icon('card')} Kết nối kênh</button>
    <button class="btn btn-primary" onclick="openChatModal()">${icon('plus')} Hội thoại mới</button>
  </div>
  <div class="msg-layout">
    <div class="msg-list card">
      <div style="padding:10px 12px;border-bottom:1px solid var(--border-soft)">
        <div class="search-box">${icon('search')}<input class="input" placeholder="Tìm khách hàng, SĐT…" value="${esc(v.q)}" oninput="viewState.chats.q=this.value;render()"></div>
      </div>
      ${list.map(c => {
        const u = chatUnread(c), last = c.msgs[c.msgs.length - 1] || {};
        const ch = CHAN[c.channel] || CHAN.web;
        const st = CHAT_STATUS[c.status] || CHAT_STATUS.pending;
        return `<div class="msg-row ${cur && cur.id === c.id ? 'cur' : ''}" onclick="openChat('${c.id}')">
          <div class="avatar" style="background:${ch.bg};color:${ch.color};flex:none">${esc(initials(c.name))}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px">
              <b style="font-size:13px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name)}</b>
              <span class="msg-status" style="background:${st.bg};color:${st.color}">${st.label}</span>
              <span class="cell-sub" style="flex:none">${msgTime(last.ts || '')}</span>
              ${u ? `<span class="msg-dot">${u}</span>` : ''}
            </div>
            <div class="cell-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${last.from === 'me' ? 'Bạn: ' : ''}${esc((last.text || '').slice(0, 46))}</div>
            ${(c.tags || []).length ? `<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">${c.tags.slice(0, 2).map(t => `<span class="msg-tag">${esc(t)}</span>`).join('')}${c.tags.length > 2 ? `<span class="msg-tag" style="background:#f1f5f9">+${c.tags.length - 2}</span>` : ''}</div>` : ''}
          </div>
        </div>`;
      }).join('') || `<div style="padding:30px;text-align:center" class="cell-sub">Chưa có hội thoại nào</div>`}
    </div>
    <div class="msg-pane card">
      ${cur ? chatPaneHtml(cur) : `<div style="padding:60px 20px;text-align:center;color:var(--text-3)">
        <div class="stat-icon tint-indigo" style="margin:0 auto 12px">${icon('mail')}</div>
        Chọn một hội thoại bên trái để xem và trả lời tin nhắn</div>`}
    </div>
  </div>`;
}

function chatPaneHtml(c) {
  const ch = CHAN[c.channel] || CHAN.web;
  const cust = (c.customerId && byId(state.customers, c.customerId)) || null;
  const st = c.status || 'pending';
  return `
  <div class="msg-head">
    <div class="avatar" style="background:${ch.bg};color:${ch.color}">${esc(initials(c.name))}</div>
    <div style="flex:1;min-width:0">
      <b style="font-size:13.5px">${esc(c.name)}</b>
      <div class="cell-sub">${ch.label}${c.phone ? ' · ' + esc(c.phone) : ''}${cust ? ' · đã liên kết khách hàng' : ''}</div>
      <div style="display:flex;gap:4px;margin-top:5px;flex-wrap:wrap">
        ${(c.tags || []).map(t => `<span class="msg-tag">${esc(t)} <a style="color:inherit;margin-left:2px" onclick="toggleChatTag('${c.id}','${esc(t)}')">×</a></span>`).join('')}
        <a class="msg-tag msg-tag-add" onclick="openTagsModal('${c.id}')">＋ thẻ</a>
      </div>
    </div>
    <select class="select" style="width:auto;font-size:11.5px;font-weight:700;color:${(CHAT_STATUS[st] || CHAT_STATUS.pending).color};background:${(CHAT_STATUS[st] || CHAT_STATUS.pending).bg}" onchange="setChatStatus('${c.id}',this.value)" title="Phân loại hội thoại">
      ${Object.entries(CHAT_STATUS).map(([k, s]) => `<option value="${k}" ${st === k ? 'selected' : ''}>${s.label}</option>`).join('')}
    </select>
    ${c.phone ? `<a class="btn btn-ghost btn-sm" style="text-decoration:none" target="_blank" rel="noopener" href="https://zalo.me/${(c.phone || '').replace(/\s/g, '')}" title="Mở Zalo">${icon('phone')} Zalo</a>` : ''}
    <button class="btn btn-ghost btn-sm" onclick="linkChatCustomer('${c.id}')">${icon('users')}</button>
    <button class="icon-btn danger" title="Xóa hội thoại" onclick="deleteChat('${c.id}')">${icon('trash')}</button>
  </div>
  <div class="msg-stream" id="msgStream">
    ${c.msgs.map(m => `
    <div class="msg-b ${m.from === 'me' ? 'me' : ''}">
      <div class="bubble">${esc(m.text)}</div>
      <div class="cell-sub" style="font-size:10px;margin-top:3px">${msgTime(m.ts)}</div>
    </div>`).join('')}
  </div>
  <div class="msg-tools">
    <select class="select" style="max-width:190px;font-size:11.5px" onchange="if(this.value){$('#msgInput').value=this.value.replace('{name}','${esc((c.name || '').split(' ').slice(-1)[0] || '')}');this.value='';$('#msgInput').focus()}">
      <option value="">⚡ Mẫu trả lời nhanh…</option>
      ${(state.msgTemplates || []).map(t => `<option value="${esc(t)}">${esc(t.slice(0, 42))}…</option>`).join('')}
    </select>
    ${cust ? `<button class="btn btn-ghost btn-sm" onclick="sendChatLink('${c.id}','customer')" title="Gửi link cổng chọn ảnh cho khách">📷 Gửi link chọn ảnh</button>` : ''}
  </div>
  <div class="msg-input-row">
    <input class="input" id="msgInput" placeholder="Nhập tin nhắn… (Enter để gửi)" onkeydown="if(event.key==='Enter')sendChatMsg('${c.id}')">
    <button class="btn btn-primary" onclick="sendChatMsg('${c.id}')">${icon('check')} Gửi</button>
  </div>`;
}

function setChatStatus(id, st) {
  const c = byId(state.chats, id);
  if (!c) return;
  c.status = st;
  save(); render();
}

function toggleChatTag(id, tag) {
  const c = byId(state.chats, id);
  if (!c) return;
  c.tags = (c.tags || []).filter(t => t !== tag);
  save(); render();
}

function openTagsModal(id) {
  const c = byId(state.chats, id);
  if (!c) return;
  const tags = c.tags || [];
  openModal(`
    <div class="modal-head"><h3>Gắn thẻ — ${esc(c.name)}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${CHAT_TAGS.map(t => {
          const on = tags.includes(t);
          return `<button class="btn btn-sm ${on ? 'btn-primary' : 'btn-ghost'}" onclick="(function(){var c=byId(state.chats,'${id}');c.tags=c.tags||[];var i=c.tags.indexOf('${esc(t)}');i>=0?c.tags.splice(i,1):c.tags.push('${esc(t)}');save();openTagsModal('${id}')})()">${on ? '✓ ' : ''}${esc(t)}</button>`;
        }).join('')}
      </div>
      <p class="form-hint" style="margin-top:10px">Bấm để gắn/bỏ thẻ. Lọc nhanh theo thẻ ở danh sách bên trái.</p>
    </div>
    <div class="modal-foot"><button class="btn btn-primary" onclick="closeModal();render()">Xong</button></div>`, 'sm');
}

function openTemplatesModal() {
  openModal(`
    <div class="modal-head"><h3>Mẫu tin nhắn</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <p style="font-size:12.5px;color:var(--text-2);margin-bottom:10px">Mỗi dòng là một mẫu. Dùng <b>{name}</b> để tự điền tên khách (VD: "Chào {name}!"). Hiện trong danh sách ⚡ Mẫu trả lời nhanh khi chat.</p>
      <textarea class="textarea" id="tplList" style="min-height:260px;font-size:12.5px" placeholder="Mỗi dòng một mẫu tin nhắn…">${esc((state.msgTemplates || []).join('\n'))}</textarea>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" onclick="saveTemplates()">${icon('check')} Lưu mẫu</button>
    </div>`, 'sm');
}

function saveTemplates() {
  state.msgTemplates = ($('#tplList').value || '').split('\n').map(s => s.trim()).filter(Boolean);
  logAction('update', 'chat', 'Cập nhật ' + state.msgTemplates.length + ' mẫu tin nhắn');
  save(); closeModal(); render();
  toast('Đã lưu ' + state.msgTemplates.length + ' mẫu tin nhắn');
}

function openChat(id) {
  __openChat = id;
  const c = byId(state.chats, id);
  if (c) c.lastRead = new Date().toISOString();
  save();
  render();
  setTimeout(() => { const s = $('#msgStream'); if (s) s.scrollTop = s.scrollHeight; }, 60);
}

function sendChatMsg(id) {
  const c = byId(state.chats, id);
  const inp = $('#msgInput');
  const text = (inp.value || '').trim();
  if (!c || !text) return;
  c.msgs.push({ from: 'me', text, ts: new Date().toISOString() });
  c.lastRead = new Date().toISOString();
  if (c.status !== 'done') c.status = 'replied';
  logAction('create', 'chat', 'Trả lời ' + c.name + ' (' + (CHAN[c.channel] || CHAN.web).label + ')');
  save(); render();
  setTimeout(() => { const s = $('#msgStream'); if (s) s.scrollTop = s.scrollHeight; }, 60);
}

function sendChatLink(id, kind) {
  const c = byId(state.chats, id);
  const cust = c && byId(state.customers, c.customerId);
  if (!c || !cust) return;
  const bk = state.bookings.filter(b => b.customerId === cust.id && b.portalToken).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const url = bk ? location.origin + '/#portal-' + bk.portalToken : null;
  const text = url
    ? `Ảnh hậu kỳ của bạn đã sẵn sàng! Vui lòng thả tim ❤ chọn ảnh cần chỉnh sửa tại: ${url} (mã PIN albums hỏi studio nếu cần ạ)`
    : 'Ảnh sẽ được studio gửi link chọn sau khi hậu kỳ xong ạ!';
  c.msgs.push({ from: 'me', text, ts: new Date().toISOString() });
  save(); render();
  toast(url ? 'Đã thêm tin nhắn kèm link chọn ảnh' : 'Đã thêm tin nhắn (chưa có album nào có link)');
  setTimeout(() => { const s = $('#msgStream'); if (s) s.scrollTop = s.scrollHeight; }, 60);
}

function openChatModal(id) {
  const c = id ? byId(state.chats, id) : null;
  openModal(`
    <div class="modal-head"><h3>${c ? 'Sửa hội thoại' : 'Hội thoại mới'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field"><label>Tên khách <span class="req">*</span></label><input class="input" name="name" required value="${esc(c ? c.name : '')}"></div>
      <div class="field"><label>Số điện thoại / Zalo</label><input class="input" name="phone" value="${esc(c ? c.phone : '')}" placeholder="09xx xxx xxx"></div>
      <div class="field full"><label>Kênh</label><select class="select" name="channel">
        ${Object.entries(CHAN).map(([k, v]) => `<option value="${k}" ${c && c.channel === k ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select></div>
      <div class="field full"><label>Tin nhắn gần nhất từ khách (nếu có)</label><input class="input" name="msg" placeholder="Dán nội dung tin khách nhắn gần nhất…"></div>
    </form>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveChat('${id || ''}')">${icon('check')} Lưu</button>
    </div>`);
}

function saveChat(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  if (id) {
    const c = byId(state.chats, id);
    Object.assign(c, { name: fd.get('name').trim(), phone: fd.get('phone').trim(), channel: fd.get('channel') });
  } else {
    state.chats.push({ id: uid(), channel: fd.get('channel'), name: fd.get('name').trim(), phone: fd.get('phone').trim(), customerId: '', lastRead: '', msgs: fd.get('msg').trim() ? [{ from: 'them', text: fd.get('msg').trim(), ts: new Date().toISOString() }] : [] });
    __openChat = state.chats[state.chats.length - 1].id;
  }
  save(); closeModal(); render();
  toast('Đã lưu hội thoại');
}

function deleteChat(id) {
  const c = byId(state.chats, id);
  if (!c) return;
  confirmDialog('Xóa hội thoại?', `Xóa hội thoại với <b>${esc(c.name)}</b>? Toàn bộ tin nhắn sẽ mất.`, 'Xóa', () => {
    state.chats = state.chats.filter(x => x.id !== id);
    if (__openChat === id) __openChat = null;
    save(); render(); toast('Đã xóa hội thoại');
  });
}

function linkChatCustomer(chatId) {
  const c = byId(state.chats, chatId);
  if (!c) return;
  openModal(`
    <div class="modal-head"><h3>Liên kết khách hàng</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="field"><label>Chọn khách hàng trong danh sách</label>
        <select class="select" id="linkCust">
          <option value="">— Chưa liên kết —</option>
          ${state.customers.map(x => `<option value="${x.id}" ${c.customerId === x.id ? 'selected' : ''}>${esc(x.name)}${x.phone ? ' · ' + esc(x.phone) : ''}</option>`).join('')}
        </select></div>
      <p class="form-hint">Liên kết để gửi link chọn ảnh, xem lịch sử chụp ngay từ hội thoại.</p>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" onclick="(function(){var v=document.getElementById('linkCust').value;byId(state.chats,'${chatId}').customerId=v;save();closeModal();render();toast(v?'Đã liên kết':'Đã bỏ liên kết')})()">${icon('check')} Lưu</button>
    </div>`, 'sm');
}

function openChatConnModal() {
  const st = state.settings.chat = state.settings.chat || {};
  openModal(`
    <div class="modal-head"><h3>Kết nối kênh nhắn tin</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <div style="background:#f8fafc;border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px">
        <b style="font-size:13px">💬 Zalo Official Account (OA)</b>
        <p style="font-size:12px;color:var(--text-2);line-height:1.6;margin:6px 0 8px">Nhận & trả lời tin nhắn Zalo ngay trong app. Cần: <b>OA ID</b> và <b>Access Token</b> từ Zalo OA (business.zalo.me → Quản trị OA → API/Token).</p>
        <input class="input" id="connZaloOa" placeholder="OA ID" value="${esc(st.zaloOaId || '')}" style="margin-bottom:6px">
        <input class="input" id="connZaloTk" placeholder="Access Token" value="${esc(st.zaloToken || '')}">
      </div>
      <div style="background:#f8fafc;border:1px solid var(--border);border-radius:12px;padding:14px">
        <b style="font-size:13px">📘 Facebook Fanpage</b>
        <p style="font-size:12px;color:var(--text-2);line-height:1.6;margin:6px 0 8px">Nhận & trả lời tin nhắn Fanpage. Cần: <b>Page ID</b> và <b>Page Access Token</b> (developers.facebook.com → tạo app → Messenger → lấy token trang). Webhook server đã sẵn sàng.</p>
        <input class="input" id="connFbPage" placeholder="Page ID" value="${esc(st.fbPageId || '')}" style="margin-bottom:6px">
        <input class="input" id="connFbTk" placeholder="Page Access Token" value="${esc(st.fbToken || '')}">
      </div>
      <p class="form-hint" style="margin-top:10px">Lưu token ở đây trước — khi bạn có token (cần đăng ký Zalo OA / Facebook Developer), báo tôi để tôi bật phần nhận & gửi tin thật trên server. Chưa có token vẫn dùng được ngay: hội thoại thủ công + nút mở Zalo trực tiếp.</p>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" onclick="saveChatConn()">${icon('check')} Lưu kết nối</button>
    </div>`, 'sm');
}

function saveChatConn() {
  state.settings.chat = {
    zaloOaId: $('#connZaloOa').value.trim(), zaloToken: $('#connZaloTk').value.trim(),
    fbPageId: $('#connFbPage').value.trim(), fbToken: $('#connFbTk').value.trim(),
  };
  logAction('update', 'settings', 'Cấu hình kết nối Zalo/Fanpage');
  save(); closeModal(); toast('Đã lưu cấu hình kết nối — sau khi deploy backend sẽ nhận tin thật');
}

/* ---- SePay: cổng thanh toán — giao dịch hiện trên màn hình ---- */
function openSepayModal() {
  const st = state.settings.sepay = state.settings.sepay || {};
  const hook = location.origin + '/api/sepay-webhook' + (st.secret ? '?secret=' + encodeURIComponent(st.secret) : '');
  openModal(`
    <div class="modal-head"><h3>Kết nối SePay — biến động số dư ngân hàng</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <div class="auth-error" style="display:flex;background:#eff6ff;border-color:#bfdbfe;color:#1e40af;font-size:12.5px;line-height:1.6">
        ℹ️ Cách hoạt động: khách chuyển khoản → SePay gửi webhook về app → giao dịch <b>hiện ngay</b> ở Tài chính → Thu chi, tự cộng tiền vào đơn nếu khớp mã ĐH hoặc đúng số tiền còn lại.</div>
      <div class="field"><label>1️⃣ Đăng ký & liên kết ngân hàng tại sepay.vn (miễn phí)</label>
        <p class="form-hint">Tạo tài khoản sepay.vn → thêm tài khoản ngân hàng của studio → bật thông báo biến động (SMS/Web/API).</p></div>
      <div class="field"><label>2️⃣ Tạo Webhook trỏ về app — dán URL này</label>
        <div style="display:flex;gap:8px">
          <input class="input" id="spHook" readonly value="${esc(hook)}" onclick="this.select()">
          <button class="btn btn-ghost btn-sm" onclick="copyText(document.getElementById('spHook').value,'Đã copy URL webhook')">${icon('receipt')} Copy</button>
        </div>
        <p class="form-hint">sepay.vn → Webhook → Thêm → dán URL trên → Loại giao dịch: <b>Cash in / tiền vào</b>.</p></div>
      <div class="field"><label>3️⃣ Mã bí mật (secret) — bắt buộc khớp nếu điền</label>
        <input class="input" id="spSecret" placeholder="VD: studiouuid123 (tùy bạn đặt)" value="${esc(st.secret || '')}">
        <p class="form-hint">Nếu điền, thêm <b>?secret=mã_của_bạn</b> vào cuối URL webhook ở bước 2. Để trống nếu không cần.</p></div>
      <p class="form-hint">⚠️ Webhook cần server online (bản Render) — trên localhost sẽ không nhận được từ SePay.</p>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" onclick="saveSepay()">${icon('check')} Lưu cấu hình</button>
    </div>`, 'sm');
}

function saveSepay() {
  state.settings.sepay = { secret: $('#spSecret').value.trim() };
  logAction('update', 'settings', 'Cấu hình SePay webhook');
  save(); closeModal(); openSepayModal();
  toast('Đã lưu — copy lại URL webhook mới (có secret) dán vào sepay.vn');
}

function deletePayment(pid) {
  const p = byId(state.payments, pid);
  if (!p || !confirm(`Xóa giao dịch ${fmtMoney(p.amount)} (${p.bank}) khỏi danh sách? Đơn hàng đã cộng tiền sẽ giữ nguyên.`)) return;
  state.payments = state.payments.filter(x => x.id !== pid);
  save(); render(); toast('Đã xóa giao dịch khỏi danh sách');
}

function applyPayment(pid, orderId) {  const p = byId(state.payments, pid), o = byId(state.orders, orderId);
  if (!p || !o) return;
  o.paidAmount = (+o.paidAmount || 0) + (+p.amount || 0);
  p.orderId = orderId; p.auto = true;
  state.cash.push({ id: uid(), type: 'in', date: (p.ts || '').slice(0, 10), amount: +p.amount || 0, cat: 'Thu đơn hàng', method: 'Chuyển khoản', note: 'SePay — ' + (o.code || ''), orderId: o.id, by: (currentUser() || {}).name || '', photos: [] });
  logAction('pay', 'order', o.code + ' đối soát SePay +' + fmtMoney(p.amount));
  save(); closeModal(); render();
  toast('Đã cộng ' + fmtMoney(p.amount) + ' vào ' + o.code);
}

function openLinkPaymentModal(pid) {
  const p = byId(state.payments, pid);
  if (!p) return;
  openModal(`
    <div class="modal-head"><h3>Liên kết giao dịch vào đơn</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      <p style="font-size:13px;margin-bottom:10px"><b>${fmtMoney(p.amount)}</b> · ${esc(p.bank)} · ${esc((p.content || '').slice(0, 80))}</p>
      <div class="field"><label>Chọn đơn hàng</label>
        <select class="select" id="payOrd">
          ${state.orders.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 80).map(o => `<option value="${o.id}">${esc(o.code)} — ${esc(custName(o.customerId))} (còn ${fmtMoney(orderRemaining(o))})</option>`).join('')}
        </select></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" onclick="applyPayment('${pid}', document.getElementById('payOrd').value)">${icon('check')} Cộng vào đơn</button>
    </div>`, 'sm');
}

function compressImageFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, 1100 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => rej(new Error('đọc ảnh lỗi'));
      img.src = r.result;
    };
    r.onerror = () => rej(new Error('đọc file lỗi'));
    r.readAsDataURL(file);
  });
}

function attBlockHtml() {
  return `<div class="field full"><label>📷 Ảnh đính kèm — biên lai, hóa đơn, chứng từ (tối đa ${ATT_MAX} ảnh)</label>
    <div id="attBox" class="att-box"></div>
    <input type="file" id="attInput" accept="image/*" multiple style="display:none" onchange="attAddFiles(this)">
  </div>`;
}

function attPaint() {
  const box = $('#attBox'); if (!box) return;
  box.innerHTML = __attTemp.map((d, i) => `
    <div class="att-thumb"><img src="${d}" onclick="attView(${i})" alt="ảnh ${i + 1}">
    <button type="button" class="att-x" title="Xóa ảnh" onclick="attRemove(${i})">×</button></div>`).join('') +
    (__attTemp.length < ATT_MAX ? `<button type="button" class="att-add" onclick="$('#attInput').click()">${icon('camera')} Thêm ảnh</button>` : '');
}

async function attAddFiles(input) {
  const files = [...(input.files || [])];
  input.value = '';
  const room = ATT_MAX - __attTemp.length;
  if (files.length > room) toast('Tối đa ' + ATT_MAX + ' ảnh — chỉ thêm ' + Math.max(0, room) + ' ảnh đầu', 'error');
  for (const f of files.slice(0, room)) {
    try { __attTemp.push(await compressImageFile(f)); }
    catch (e) { toast('Không đọc được ảnh: ' + f.name, 'error'); }
  }
  attPaint();
}

function attRemove(i) { __attTemp.splice(i, 1); attPaint(); }

function attView(i) {
  if (!__attTemp[i]) return;
  openModal(`<div class="modal-head"><h3>Ảnh đính kèm ${i + 1}/${__attTemp.length}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body" style="text-align:center"><img src="${__attTemp[i]}" style="max-width:100%;border-radius:12px"></div>`, 'lg');
}

function viewPhotos(photos) {
  const list = photos || [];
  if (!list.length) return;
  openModal(`<div class="modal-head"><h3>Ảnh đính kèm (${list.length})</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
  <div class="modal-body" style="text-align:center">
    <img id="attBig" src="${list[0]}" style="max-width:100%;border-radius:12px">
    ${list.length > 1 ? `<div style="display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap">${list.map(p => `<img src="${p}" onclick="document.getElementById('attBig').src=this.src" style="width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border)">`).join('')}</div>` : ''}
  </div>`, 'lg');
}

function viewPhotosOf(kind, id) {
  const r = kind === 'cash' ? byId(state.cash, id) : kind === 'expense' ? byId(state.expenses, id) : byId(state.orders, id);
  viewPhotos(r && r.photos);
}

/* ---- Quản lý Thu chi (sổ quỹ) ---- */
function cashFiltered() {
  const m = viewState.finance.month;
  return (state.cash || [])
    .filter(x => !m || (x.date || '').startsWith(m))
    .filter(x => viewState.finance.cashType === 'all' || viewState.finance.cashType === undefined || x.type === viewState.finance.cashType)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function cashTab() {
  const list = cashFiltered();
  const month = viewState.finance.month;
  const tin = list.filter(x => x.type === 'in').reduce((s, x) => s + (+x.amount || 0), 0);
  const tout = list.filter(x => x.type === 'out').reduce((s, x) => s + (+x.amount || 0), 0);
  const allIn = (state.cash || []).filter(x => x.type === 'in').reduce((s, x) => s + (+x.amount || 0), 0);
  const allOut = (state.cash || []).filter(x => x.type === 'out').reduce((s, x) => s + (+x.amount || 0), 0);
  const t = viewState.finance.cashType || 'all';
  const tf = k => `<button class="${t === k ? 'active' : ''}" onclick="viewState.finance.cashType='${k}';render()">${{ all: 'Tất cả', in: 'Thu', out: 'Chi' }[k]}</button>`;
  return `
  <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
    <div class="card stat-card tint-green"><div class="stat-label">Tiền thu ${month ? '· tháng ' + (+month.slice(5)) + '/' + month.slice(0, 4) : ''}</div><div class="stat-val" style="color:var(--green)">+${fmtMoney(tin)}</div></div>
    <div class="card stat-card tint-red"><div class="stat-label">Tiền chi ${month ? '· tháng ' + (+month.slice(5)) + '/' + month.slice(0, 4) : ''}</div><div class="stat-val" style="color:var(--red)">−${fmtMoney(tout)}</div></div>
    <div class="card stat-card ${tin - tout >= 0 ? 'tint-green' : 'tint-red'}"><div class="stat-label">Chênh lệch tháng</div><div class="stat-val">${tin - tout >= 0 ? '+' : '−'}${fmtMoney(Math.abs(tin - tout))}</div></div>
    <div class="card stat-card tint-indigo"><div class="stat-label">Tồn quỹ tích lũy (thu − chi)</div><div class="stat-val">${fmtMoney(allIn - allOut)}</div><div class="cell-sub">tổng ${state.cash.length} giao dịch</div></div>
  </div>
  <div class="toolbar">
    <div class="pill-toggle">${tf('all')}${tf('in')}${tf('out')}</div>
    <span class="badge b-deposit">💳 ${(state.payments || []).length} giao dịch SePay</span>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openCashModal()">${icon('plus')} Giao dịch thu/chi</button>
  </div>
  ${(state.payments || []).length ? `
  <div class="card list-wrap" style="margin-bottom:14px">
    <div class="card-head"><h3>Giao dịch chuyển khoản tự động (SePay)</h3><span class="right badge b-confirmed">đối soát theo mã ĐH / số tiền</span></div>
    <div class="table-wrap" style="max-height:260px;overflow-y:auto">
    <table>
      <thead><tr><th>Thời gian</th><th>Ngân hàng</th><th>Nội dung chuyển khoản</th><th class="ta-r">Số tiền</th><th>Đơn hàng</th><th></th></tr></thead>
      <tbody>
      ${state.payments.slice().reverse().slice(0, 30).map(p => {
        const o = p.orderId ? byId(state.orders, p.orderId) : null;
        return `<tr>
          <td class="money-muted">${fmtDateTime(p.ts)}</td>
          <td><span class="badge b-cat-khac">${esc(p.bank)}</span></td>
          <td class="money-muted" style="max-width:260px">${esc((p.content || '').slice(0, 80))}</td>
          <td class="money ta-r" style="color:var(--green)">+${fmtMoney(p.amount)}</td>
          <td>${o ? `<a class="link" onclick="viewOrder('${o.id}')">${esc(o.code)}</a> ${p.auto ? '<span class="badge b-delivered">tự khớp</span>' : ''}` : '<span class="badge b-unpaid">chưa khớp</span>'}</td>
          <td class="cell-actions ta-c">${!o ? `<button class="btn btn-ghost btn-sm" onclick="openLinkPaymentModal('${p.id}')">Liên kết đơn</button>` : ''}<button class="icon-btn danger" title="Xóa giao dịch này" onclick="deletePayment('${p.id}')">${icon('trash')}</button></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
    </div>
  </div>` : ''}
  <div class="card list-wrap">
    <div class="table-wrap">
    <table>
      <thead><tr><th>Ngày</th><th>Loại</th><th>Danh mục</th><th>Hình thức</th><th>Liên kết</th><th>Ghi chú</th><th class="ta-r">Số tiền</th><th class="ta-c">Thao tác</th></tr></thead>
      <tbody>
      ${list.map(x => {
        const o = x.orderId ? byId(state.orders, x.orderId) : null;
        return `<tr>
          <td class="money-muted">${fmtDate(x.date)}</td>
          <td><span class="badge ${x.type === 'in' ? 'b-paid' : 'b-unpaid'}">${x.type === 'in' ? '↓ Thu' : '↑ Chi'}</span></td>
          <td class="cell-main">${esc(x.cat)}</td>
          <td class="money-muted">${esc(x.method || '—')}</td>
          <td>${o ? `<a class="link" onclick="viewOrder('${o.id}')">${esc(o.code)}</a>` : '<span class="cell-sub">—</span>'}</td>
          <td class="money-muted">${esc(x.note || '—')}${x.photos && x.photos.length ? ` <a class="link" style="font-size:11px" onclick="viewPhotosOf('cash','${x.id}')">📷 ${x.photos.length} ảnh</a>` : ''}</td>
          <td class="money ta-r" style="color:${x.type === 'in' ? 'var(--green)' : 'var(--red)'}">${x.type === 'in' ? '+' : '−'}${fmtMoney(+x.amount || 0)}</td>
          <td class="cell-actions ta-c">
            <button class="icon-btn" title="Sửa" onclick="openCashModal('${x.id}')">${icon('edit')}</button>
            <button class="icon-btn danger" title="Xóa" onclick="deleteCash('${x.id}')">${icon('trash')}</button>
          </td>
        </tr>`;
      }).join('') || emptyRow(8, 'Chưa có giao dịch thu chi nào trong tháng này')}
      </tbody>
    </table>
    </div>
  </div>`;
}

function openCashModal(id) {
  const x = id ? byId(state.cash, id) : null;
  const type = x ? x.type : 'in';
  const catOpts = (cats, sel) => cats.map(c => `<option value="${esc(c)}" ${sel === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const orderOpts = state.orders.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 60)
    .map(o => `<option value="${o.id}" ${x && x.orderId === o.id ? 'selected' : ''}>${esc(o.code)} — ${esc(custName(o.customerId))}</option>`).join('');
  openModal(`
    <div class="modal-head"><h3>${x ? 'Sửa giao dịch' : 'Ghi giao dịch thu/chi'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field full">
        <label>Loại giao dịch</label>
        <div class="pill-toggle">
          <button type="button" id="cashTypeIn" class="${type === 'in' ? 'active' : ''}" onclick="cashPickType('in')">${icon('arrow-down')} Tiền thu</button>
          <button type="button" id="cashTypeOut" class="${type === 'out' ? 'active' : ''}" onclick="cashPickType('out')">${icon('arrow-up')} Tiền chi</button>
        </div>
        <input type="hidden" name="type" value="${type}">
      </div>
      <div class="field"><label>Ngày <span class="req">*</span></label><input class="input" type="date" name="date" required value="${esc(x ? x.date : todayStr())}"></div>
      <div class="field"><label>Số tiền <span class="req">*</span></label><input class="input" type="number" min="0" step="1000" name="amount" required value="${x ? (+x.amount || '') : ''}" placeholder="VD: 500000"></div>
      <div class="field full"><label>Danh mục</label><select class="select" name="cat" id="cashCat">
        <optgroup label="Thu">${catOpts(CASH_CATS_IN, x ? x.cat : '')}</optgroup>
        <optgroup label="Chi">${catOpts(CASH_CATS_OUT, x ? x.cat : '')}</optgroup>
      </select></div>
      <div class="field"><label>Hình thức</label><select class="select" name="method">${CASH_METHODS.map(m => `<option ${x && x.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="field"><label>Liên kết đơn hàng</label><select class="select" name="orderId"><option value="">— Không —</option>${orderOpts}</select></div>
      <div class="field full"><label>Ghi chú</label><input class="input" name="note" value="${esc(x ? x.note || '' : '')}" placeholder="Nội dung giao dịch..."></div>
      ${attBlockHtml()}
    </form>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveCash('${id || ''}')">${icon('check')} Lưu giao dịch</button>
    </div>`);
  attInit(x && x.photos);
}

function cashPickType(t) {
  $('#frm [name=type]').value = t;
  $('#cashTypeIn').classList.toggle('active', t === 'in');
  $('#cashTypeOut').classList.toggle('active', t === 'out');
  const sel = $('#cashCat');
  const grp = t === 'in' ? 0 : 1;
  sel.selectedIndex = [...sel.options].findIndex(o => o.parentElement === sel.getElementsByTagName('optgroup')[grp]);
}

function saveCash(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const data = {
    type: fd.get('type'), date: fd.get('date'), amount: +fd.get('amount') || 0,
    cat: fd.get('cat') || 'Khác', method: fd.get('method'), orderId: fd.get('orderId') || '',
    note: fd.get('note').trim(), photos: __attTemp.slice(),
  };
  const u = currentUser();
  if (id) {
    Object.assign(byId(state.cash, id), data);
    logAction('update', 'cash', `${data.type === 'in' ? 'Thu' : 'Chi'} ${fmtMoney(data.amount)} — ${data.cat}`);
  } else {
    state.cash.push(Object.assign({ id: uid(), by: u ? u.name : '' }, data));
    logAction('create', 'cash', `${data.type === 'in' ? 'Thu' : 'Chi'} ${fmtMoney(data.amount)} — ${data.cat}`);
  }
  save(); closeModal(); render();
  toast('Đã lưu giao dịch ' + (data.type === 'in' ? 'thu' : 'chi') + ' ' + fmtMoney(data.amount));
}

function deleteCash(id) {
  const x = byId(state.cash, id);
  if (!x || !confirm(`Xóa giao dịch ${x.type === 'in' ? 'thu' : 'chi'} ${fmtMoney(x.amount)} (${x.cat})?`)) return;
  state.cash = state.cash.filter(c => c.id !== id);
  logAction('delete', 'cash', `${x.type === 'in' ? 'Thu' : 'Chi'} ${fmtMoney(x.amount)} — ${x.cat}`);
  save(); render();
}

function expensesTab() {
  const list = state.expenses.filter(e => branchMatch(e)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `
  <div class="toolbar" style="margin-bottom:12px">
    <span style="font-size:13px;color:var(--text-2)">${list.length} khoản chi · tổng ${fmtMoney(list.reduce((s, e) => s + (+e.amount || 0), 0))}</span>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openExpenseModal()">${icon('plus')} Thêm chi phí</button>
  </div>
  <div class="card list-wrap"><div class="table-wrap">
  <table>
    <thead><tr><th>Ngày</th><th>Loại</th><th class="ta-r">Số tiền</th><th>Ghi chú</th><th class="ta-c">Thao tác</th></tr></thead>
    <tbody>
    ${list.map(e => `<tr>
      <td class="money-muted">${fmtDate(e.date)}</td>
      <td><span class="badge b-cat-khac">${esc(e.category)}</span></td>
      <td class="money-red ta-r">${fmtMoney(e.amount)}</td>
      <td class="money-muted">${esc(e.note || '—')}${e.photos && e.photos.length ? ` <a class="link" style="font-size:11px" onclick="viewPhotosOf('expense','${e.id}')">📷 ${e.photos.length} ảnh</a>` : ''}</td>
      <td class="cell-actions ta-c">
        <button class="icon-btn" onclick="openExpenseModal('${e.id}')">${icon('edit')}</button>
        <button class="icon-btn danger" onclick="deleteExpense('${e.id}')">${icon('trash')}</button>
      </td></tr>`).join('') || emptyRow(5, 'Chưa có chi phí nào')}
    </tbody>
  </table></div></div>`;
}

function openExpenseModal(id) {
  const e = id ? byId(state.expenses, id) : null;
  openModal(`
    <div class="modal-head"><h3>${e ? 'Sửa chi phí' : 'Thêm chi phí'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field"><label>Ngày <span class="req">*</span></label><input class="input" type="date" name="date" required value="${e ? e.date : todayStr()}"></div>
      <div class="field"><label>Số tiền (₫) <span class="req">*</span></label><input class="input" type="number" min="0" step="1000" name="amount" required value="${e ? e.amount : ''}"></div>
      <div class="field"><label>Loại</label><select class="select" name="category">${EXP_CATS.map(c => `<option ${e && e.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Chi nhánh</label><select class="select" name="branchId">${state.branches.map(x => `<option value="${x.id}" ${(e ? e.branchId === x.id : x.id === curBranchId()) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="field full"><label>Ghi chú</label><input class="input" name="note" value="${esc(e ? e.note : '')}"></div>
      ${attBlockHtml()}
    </form>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveExpense('${id || ''}')">${icon('check')} Lưu</button>
    </div>`);
  attInit(e && e.photos);
}

function saveExpense(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const data = { date: fd.get('date'), amount: Math.round(+fd.get('amount') || 0), category: fd.get('category'), note: fd.get('note').trim(), branchId: fd.get('branchId') || curBranchId(), photos: __attTemp.slice() };
  if (id) { Object.assign(byId(state.expenses, id), data); logAction('update', 'expense', data.category + ' ' + fmtMoney(data.amount)); }
  else { state.expenses.push(Object.assign({ id: uid() }, data)); logAction('create', 'expense', data.category + ' ' + fmtMoney(data.amount)); }
  save(); closeModal(); render();
  toast(id ? 'Đã cập nhật chi phí' : 'Đã thêm chi phí');
}

function deleteExpense(id) {
  const e = byId(state.expenses, id);
  if (!e) return;
  confirmDialog('Xóa chi phí?', `Xóa khoản <b>${esc(e.category)}</b> ${fmtMoney(e.amount)} ngày ${fmtDate(e.date)}?`, 'Xóa', () => {
    state.expenses = state.expenses.filter(x => x.id !== id);
    logAction('delete', 'expense', e.category + ' ' + fmtMoney(e.amount));
    save(); render(); toast('Đã xóa chi phí');
  });
}

function payrollTab() {
  const month = viewState.finance.month;
  const rows = state.payrolls.filter(p => p.month === month);
  const totalDue = rows.filter(r => !r.paid).reduce((s, r) => s + r.total, 0);
  const totalPaid = rows.filter(r => r.paid).reduce((s, r) => s + r.total, 0);
  return `
  <div class="toolbar" style="margin-bottom:12px">
    <span style="font-size:13px;color:var(--text-2)">Lương = lương cơ bản + hoa hồng doanh thu các buổi chụp nhân sự phụ trách</span>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="computePayroll('${month}')">${icon('refresh')} Tính lương tự động</button>
  </div>
  <div class="card list-wrap"><div class="table-wrap">
  <table>
    <thead><tr><th>Nhân sự</th><th class="ta-r">Lương (cơ bản / giờ công)</th><th class="ta-r">Doanh thu phụ trách</th><th class="ta-r">Hoa hồng</th><th class="ta-r">Tổng nhận</th><th>Trạng thái</th><th class="ta-c">Thao tác</th></tr></thead>
    <tbody>
    ${rows.map(p => { const s = byId(state.staff, p.staffId) || {}; return `<tr>
      <td><div class="cell-main">${esc(s.name || '—')}</div><div class="cell-sub">${ROLES[s.role] || ''}${s.commissionPct ? ' · ' + s.commissionPct + '%' : ''}</div></td>
      <td class="money-muted ta-r">${s.payMode === 'hourly' ? fmtMoney(s.hourlyRate) + '/h × ' + (p.hours || 0) + 'h<br><b style="color:var(--text)">' + fmtMoney(p.base) + '</b>' : fmtMoney(p.base)}</td>
      <td class="money-muted ta-r">${fmtMoney(p.commissionBase)}</td>
      <td class="money-green ta-r">${fmtMoney(p.commission)}</td>
      <td class="money ta-r">${fmtMoney(p.total)}</td>
      <td><span class="badge ${p.paid ? 'b-delivered' : 'b-unpaid'}">${p.paid ? 'Đã trả' : 'Chưa trả'}</span></td>
      <td class="cell-actions ta-c"><button class="icon-btn" title="${p.paid ? 'Bỏ đánh dấu đã trả' : 'Đánh dấu đã trả'}" onclick="togglePayrollPaid('${p.id}')">${icon('check')}</button></td>
    </tr>`; }).join('') || `<tr><td colspan="7" class="td-empty"><div class="empty">${iconWrap('user')}<h4>Chưa tính lương tháng này</h4><p>Bấm "Tính lương tự động" để hệ thống tính từ dữ liệu lịch chụp &amp; đơn hàng.</p></div></td></tr>`}
    </tbody>
  </table></div></div>
  ${rows.length ? `<p style="font-size:12.5px;color:var(--text-2);margin-top:10px">Tháng này: đã trả <b>${fmtMoney(totalPaid)}</b> · chưa trả <b style="color:var(--red)">${fmtMoney(totalDue)}</b></p>` : ''}`;
}

function computePayroll(month) {
  state.staff.filter(s => s.active && branchMatch(s)).forEach(s => {
    const bkIds = state.bookings.filter(b => b.photographerId === s.id && (b.date || '').startsWith(month) && b.status !== 'cancelled').map(b => b.id);
    const cb = state.orders.filter(o => o.bookingId && bkIds.includes(o.bookingId) && o.status !== 'cancelled').reduce((t, o) => t + orderTotal(o), 0);
    const com = Math.round(cb * (+s.commissionPct || 0) / 100);
    let base = +s.salary || 0, hours = 0;
    if (s.payMode === 'hourly') {
      hours = state.attendance.filter(a => a.staffId === s.id && (a.date || '').startsWith(month)).reduce((t, r) => t + workedHours(r), 0);
      base = Math.round(hours * (+s.hourlyRate || 0));
    }
    let p = state.payrolls.find(x => x.month === month && x.staffId === s.id);
    if (!p) { p = { id: uid(), month, staffId: s.id, paid: false, paidDate: '' }; state.payrolls.push(p); }
    Object.assign(p, { base, hours, commissionBase: cb, commission: com, total: base + com });
  });
  logAction('data', 'payroll', 'Tính lương tự động tháng ' + month);
  save(); render();
  toast('Đã tính lương ' + state.staff.filter(s => s.active).length + ' nhân sự cho tháng ' + month.slice(5) + '/' + month.slice(0, 4));
}

function togglePayrollPaid(id) {
  const p = byId(state.payrolls, id);
  if (!p) return;
  p.paid = !p.paid;
  p.paidDate = p.paid ? todayStr() : '';
  logAction('update', 'payroll', staffName(p.staffId) + (p.paid ? ': đã trả lương ' + fmtMoney(p.total) : ': mở lại'));
  save(); render();
  toast(p.paid ? 'Đã đánh dấu trả lương' : 'Đã mở lại');
}

/* ================= HỢP ĐỒNG THÔNG MINH ================= */
const CONTRACT_STATUS = { draft: 'Nháp', pending: 'Chờ ký', signed: 'Đã ký', completed: 'Hoàn thành', cancelled: 'Đã hủy' };
const CS_PRESETS = [['50/50', [50, 50]], ['30/40/30', [30, 40, 30]], ['40/40/20', [40, 40, 20]], ['30/70', [30, 70]]];

function buildSchedule(total, presetKey, bookingDate) {
  const preset = (CS_PRESETS.find(p => p[0] === presetKey) || CS_PRESETS[1])[1];
  const labels = preset.length === 2 ? ['Đặt cọc', 'Thanh toán còn lại'] : ['Đặt cọc', 'Sau buổi chụp', 'Giao ảnh & sản phẩm'];
  const mid = bookingDate || dOff(14);
  const dues = [todayStr(), mid, (() => { const d = new Date(mid + 'T00:00:00'); d.setDate(d.getDate() + 14); return toISO(d); })()];
  return preset.map((pct, i) => ({ label: `${labels[i]} (${pct}%)`, amount: Math.round(total * pct / 100), dueDate: dues[i] || '', paid: false }));
}

function genContractTerms(custName, service, total, depositAmount) {
  return [
    `1. Studio cam kết cung cấp dịch vụ "${service}" đúng chất lượng và tiến độ đã thỏa thuận với khách hàng ${custName}.`,
    `2. Khách hàng đặt cọc ${fmtMoney(depositAmount)} để giữ lịch; tiền cọc không hoàn lại nếu hủy lịch trước ít hơn 7 ngày.`,
    `3. Số tiền còn lại thanh toán đúng theo Lịch thanh toán đính kèm hợp đồng này.`,
    `4. Thời gian giao ảnh chỉnh sửa: 10–14 ngày làm việc kể từ buổi chụp; album & phóng ảnh: 20–30 ngày làm việc.`,
    `5. Studio được sử dụng một phần ảnh thành phẩm cho mục đích quảng bá, trừ khi khách hàng có yêu cầu riêng bằng văn bản.`,
    `6. Việc đổi lịch chụp cần báo trước ít nhất 48 giờ và phụ thuộc khả năng sắp xếp của studio.`,
    `7. Hai bên cam kết thực hiện đúng các điều khoản; mọi tranh chấp thỏa thuận trên tinh thần hợp tác.`,
  ].join('\n');
}

function seedContracts() {
  return [
    { id: 'ct1', code: 'HD-1001', customerId: 'c8', bookingId: 'b7', service: 'Cưới — Sweet Moments + trang điểm', total: 9000000,
      schedule: [{ label: 'Đặt cọc (50%)', amount: 4500000, dueDate: dOff(-30), paid: true }, { label: 'Sau buổi chụp (40%)', amount: 3600000, dueDate: dOff(-4), paid: false }, { label: 'Giao ảnh & sản phẩm (10%)', amount: 900000, dueDate: dOff(6), paid: false }],
      terms: genContractTerms('Đặng Khánh Linh', 'Cưới — Sweet Moments', 9000000, 4500000), status: 'signed', createdAt: dOff(-32) },
    { id: 'ct2', code: 'HD-1002', customerId: 'c2', bookingId: 'b15', service: 'Cưới — Eternal Love (ngoại cảnh Hội An)', total: 15000000,
      schedule: [{ label: 'Đặt cọc (30%)', amount: 4500000, dueDate: dOff(-9), paid: true }, { label: 'Sau buổi chụp (40%)', amount: 6000000, dueDate: dOff(17), paid: false }, { label: 'Giao ảnh & album (30%)', amount: 4500000, dueDate: dOff(31), paid: false }],
      terms: '', status: 'pending', createdAt: dOff(-9) },
  ];
}

const contractPaid = c => c.schedule.reduce((s, r) => s + (r.paid ? r.amount : 0), 0);
const contractRemaining = c => Math.max(0, c.total - contractPaid(c));

function contractsView() {
  const v = viewState.contracts;
  const ql = v.q.trim().toLowerCase();
  const list = [...state.contracts]
    .filter(c => v.status === 'all' || c.status === v.status)
    .filter(c => !ql || [c.code, custName(c.customerId), c.service].some(x => String(x || '').toLowerCase().includes(ql)))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return `
  <div class="toolbar">
    <div class="search-box">${icon('search')}<input class="input" placeholder="Tìm hợp đồng, khách hàng..." value="${esc(v.q)}" oninput="viewState.contracts.q=this.value;render()"></div>
    <select class="select" style="width:auto" onchange="viewState.contracts.status=this.value;render()">
      <option value="all" ${v.status === 'all' ? 'selected' : ''}>Mọi trạng thái</option>
      ${Object.entries(CONTRACT_STATUS).map(([k, l]) => `<option value="${k}" ${v.status === k ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <div class="spacer"></div>
    <button class="btn btn-primary" onclick="openContractModal()">${icon('plus')} Tạo hợp đồng</button>
  </div>
  <div class="card list-wrap"><div class="table-wrap">
  <table>
    <thead><tr><th>Mã HĐ</th><th>Khách hàng</th><th>Dịch vụ</th><th class="ta-r">Tổng</th><th class="ta-r">Đã thu</th><th>Tiến độ</th><th>Trạng thái</th><th class="ta-c">Thao tác</th></tr></thead>
    <tbody>
    ${list.map(c => `<tr>
      <td class="cell-main">${esc(c.code)}</td>
      <td>${esc(custName(c.customerId))}</td>
      <td class="money-muted" style="max-width:210px">${esc(c.service || '—')}</td>
      <td class="money ta-r">${fmtMoney(c.total)}</td>
      <td class="money-green ta-r">${fmtMoney(contractPaid(c))}</td>
      <td style="min-width:90px"><div class="pay-progress" style="margin:0"><div style="width:${c.total ? Math.min(100, Math.round(contractPaid(c) / c.total * 100)) : 0}%"></div></div></td>
      <td><span class="badge b-${c.status === 'signed' ? 'confirmed' : c.status === 'completed' ? 'delivered' : c.status === 'cancelled' ? 'cancelled' : c.status === 'pending' ? 'pending' : 'draft'}">${CONTRACT_STATUS[c.status]}</span></td>
      <td class="cell-actions ta-c">
        <button class="icon-btn" title="Xem" onclick="viewContract('${c.id}')">${icon('eye')}</button>
        <button class="icon-btn" title="In hợp đồng" onclick="printContract('${c.id}')">${icon('printer')}</button>
        <button class="icon-btn" title="Sửa" onclick="openContractModal('${c.id}')">${icon('edit')}</button>
        <button class="icon-btn danger" title="Xóa" onclick="deleteContract('${c.id}')">${icon('trash')}</button>
      </td></tr>`).join('') || emptyRow(8, 'Chưa có hợp đồng nào')}
    </tbody>
  </table></div></div>`;
}

function openContractModal(id) {
  const c = id ? byId(state.contracts, id) : null;
  const custOpts = state.customers.map(x => `<option value="${x.id}" ${c && c.customerId === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const preset = c ? (c.schedule.length === 2 ? '50/50' : c.schedule.some(r => r.label.includes('40')) ? '40/40/20' : '30/40/30') : '30/40/30';
  openModal(`
    <div class="modal-head"><h3>${c ? 'Sửa hợp đồng ' + esc(c.code) : 'Tạo hợp đồng thông minh'}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <form id="frm" class="modal-body form-grid" onsubmit="return false;">
      <div class="field"><label>Khách hàng <span class="req">*</span></label><select class="select" name="customerId" required onchange="onContractCustChange()">${custOpts}</select></div>
      <div class="field"><label>Lịch chụp liên kết</label><select class="select" name="bookingId" id="ctBooking"></select></div>
      <div class="field full"><label>Dịch vụ / gói <span class="req">*</span></label><input class="input" name="service" required value="${esc(c ? c.service : '')}" placeholder="VD: Cưới — Eternal Love"></div>
      <div class="field"><label>Tổng giá trị (₫) <span class="req">*</span></label><input class="input" name="total" type="number" min="0" step="1000" required value="${c ? c.total : ''}" oninput="refreshSchedulePreview()"></div>
      <div class="field"><label>Lịch thanh toán thông minh</label>
        <select class="select" name="preset" onchange="refreshSchedulePreview()">
          ${CS_PRESETS.map(([k]) => `<option value="${k}" ${preset === k ? 'selected' : ''}>${k}</option>`).join('')}
        </select></div>
      <div class="field full"><label>Xem trước lịch thanh toán</label>
        <div class="totals-box" id="ctPreview" style="margin:0"></div></div>
      <div class="field full"><label>Điều khoản hợp đồng</label>
        <textarea class="textarea" name="terms" id="ctTerms" style="min-height:120px" placeholder="Bấm nút bên dưới để sinh điều khoản mẫu...">${esc(c ? c.terms : '')}</textarea>
        <button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="fillContractTerms()">⚙ Sinh điều khoản mẫu tự động</button></div>
      <div class="field"><label>Trạng thái</label><select class="select" name="status">
        ${Object.entries(CONTRACT_STATUS).map(([k, l]) => `<option value="${k}" ${(c ? c.status === k : k === 'pending') ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>
    </form>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="saveContract('${id || ''}')">${icon('check')} Lưu hợp đồng</button>
    </div>`, 'lg');
  onContractCustChange(c ? c.bookingId : null);
  refreshSchedulePreview();
}

function onContractCustChange(selId) {
  const custId = $('#frm [name=customerId]').value;
  const list = [...state.bookings].filter(b => b.customerId === custId).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('#ctBooking').innerHTML = '<option value="">— Không liên kết —</option>' + list.map(b =>
    `<option value="${b.id}" ${selId === b.id ? 'selected' : ''}>${fmtDate(b.date)} — ${esc(pkgName(b.packageId))}</option>`).join('');
}

function refreshSchedulePreview() {
  const total = +($('#frm [name=total]').value) || 0;
  const preset = $('#frm [name=preset]').value;
  const rows = buildSchedule(total, preset, null);
  $('#ctPreview').innerHTML = rows.map(r =>
    `<div class="totals-row"><span>${r.label}${r.dueDate ? ' · hạn ' + fmtDate(r.dueDate) : ''}</span><b>${fmtMoney(r.amount)}</b></div>`).join('');
}

function fillContractTerms() {
  const custId = $('#frm [name=customerId]').value;
  const total = +($('#frm [name=total]').value) || 0;
  const preset = $('#frm [name=preset]').value;
  const sched = buildSchedule(total, preset, null);
  $('#ctTerms').value = genContractTerms(custName(custId), $('#frm [name=service]').value || 'dịch vụ chụp ảnh', total, sched[0].amount);
  toast('Đã sinh 7 điều khoản mẫu — có thể chỉnh sửa thêm');
}

async function saveContract(id) {
  const f = $('#frm');
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  const total = Math.round(+fd.get('total') || 0);
  const data = {
    customerId: fd.get('customerId'), bookingId: $('#ctBooking').value || '',
    service: fd.get('service').trim(), total,
    schedule: buildSchedule(total, fd.get('preset'), $('#ctBooking').value ? byId(state.bookings, $('#ctBooking').value).date : null),
    terms: fd.get('terms'), status: fd.get('status'),
  };
  if (id) {
    const old = byId(state.contracts, id);
    old.schedule.forEach((r, i) => { if (data.schedule[i]) data.schedule[i].paid = r.paid; });
    Object.assign(old, data);
    logAction('update', 'contract', old.code + ' — ' + custName(old.customerId));
    toast('Đã cập nhật hợp đồng');
  } else {
    const code = 'HD-' + (state.contractSeq++);
    state.contracts.push(Object.assign({ id: uid(), code, createdAt: todayStr() }, data));
    logAction('create', 'contract', code + ' — ' + custName(data.customerId) + ' ' + fmtMoney(total));
    toast('Đã tạo hợp đồng ' + code);
  }
  save(); closeModal(); render();
}

function contractAlerts(c) {
  const alerts = [];
  const today = todayStr();
  c.schedule.forEach(r => { if (!r.paid && r.dueDate && r.dueDate < today) alerts.push(`Quá hạn thu: <b>${esc(r.label)}</b> (${fmtDate(r.dueDate)}) — ${fmtMoney(r.amount)}`); });
  if (c.status === 'signed' && c.schedule.length && !c.schedule[0].paid) alerts.push('Hợp đồng đã ký nhưng <b>chưa thu cọc</b>.');
  if (c.status === 'pending' && c.createdAt && c.createdAt <= dOff(-14)) alerts.push('Hợp đồng chờ ký hơn 2 tuần — nên nhắc khách.');
  if (contractRemaining(c) === 0 && c.status === 'signed') alerts.push('Đã thu đủ — có thể chuyển trạng thái <b>Hoàn thành</b>.');
  return alerts;
}

function viewContract(id) {
  const c = byId(state.contracts, id);
  if (!c) return;
  const alerts = contractAlerts(c);
  openModal(`
    <div class="modal-head">
      <div style="flex:1"><h3 style="font-size:16px;font-weight:800">Hợp đồng ${esc(c.code)}</h3>
        <div style="display:flex;gap:7px;margin-top:7px"><span class="badge b-${c.status}">${CONTRACT_STATUS[c.status]}</span>
        <span class="badge b-cat-khac">${fmtDate(c.createdAt)}</span></div></div>
      <button class="icon-btn" onclick="closeModal()">${icon('x')}</button>
    </div>
    <div class="modal-body">
      <div class="info-grid" style="margin-bottom:14px">
        ${infoItem('user', 'Khách hàng', custName(c.customerId))}
        ${infoItem('camera', 'Lịch chụp', c.bookingId ? fmtDate((byId(state.bookings, c.bookingId) || {}).date) : '—')}
        ${infoItem('package', 'Dịch vụ', c.service, true)}
      </div>
      <div class="section-title">Lịch thanh toán thông minh</div>
      ${c.schedule.map((r, i) => `
      <div style="display:flex;align-items:center;gap:10px;border:1px solid ${!r.paid && r.dueDate && r.dueDate < todayStr() ? '#fecaca;background:#fff5f5' : 'var(--border)'};border-radius:10px;padding:10px 13px;margin-bottom:7px">
        <div style="flex:1"><b style="font-size:13px">${esc(r.label)}</b>
          <div class="cell-sub">Hạn ${fmtDate(r.dueDate)}${r.paid ? ' · đã thu' : ''}</div></div>
        <b style="font-size:13px">${fmtMoney(r.amount)}</b>
        <button class="btn ${r.paid ? 'btn-ghost' : 'btn-primary'} btn-sm" onclick="contractTogglePaid('${c.id}',${i})">${r.paid ? 'Bỏ thu' : 'Đã thu'}</button>
      </div>`).join('')}
      <div class="totals-box"><div class="totals-row"><span>Đã thu</span><b class="money-green">${fmtMoney(contractPaid(c))}</b></div>
        <div class="totals-row grand"><span>Còn lại</span><b style="color:${contractRemaining(c) > 0 ? 'var(--red)' : 'var(--green)'}">${fmtMoney(contractRemaining(c))}</b></div></div>
      ${alerts.length ? `<div class="section-title">⚠ Phân tích thông minh</div>${alerts.map(a => `<div class="cancel-banner" style="margin:0 0 7px">${icon('alert')}<span>${a}</span></div>`).join('')}` : ''}
      ${c.terms ? `<div class="section-title">Điều khoản</div><div style="font-size:12.5px;color:var(--text-2);line-height:1.7;white-space:pre-line">${esc(c.terms)}</div>` : ''}
    </div>
    <div class="modal-foot" style="flex-wrap:wrap">
      <button class="btn btn-danger" onclick="closeModal();deleteContract('${c.id}')">${icon('trash')} Xóa</button>
      <button class="btn btn-ghost" onclick="printContract('${c.id}')">${icon('printer')} In hợp đồng</button>
      <button class="btn btn-primary" onclick="closeModal();openContractModal('${c.id}')">${icon('edit')} Sửa</button>
    </div>`, 'lg');
}

function contractTogglePaid(cid, idx) {
  const c = byId(state.contracts, cid);
  if (!c || !c.schedule[idx]) return;
  const r = c.schedule[idx];
  r.paid = !r.paid;
  logAction(r.paid ? 'pay' : 'update', 'contract', c.code + ': ' + r.label + (r.paid ? ' — đã thu ' + fmtMoney(r.amount) : ' — bỏ thu'));
  if (r.paid) pushNotif('payment', '💰 Thu theo hợp đồng ' + fmtMoney(r.amount), c.code + ' — ' + r.label + ' — ' + custName(c.customerId));
  if (contractRemaining(c) === 0 && c.status === 'signed') c.status = 'completed';
  save(); render();
  viewContract(cid);
}

function deleteContract(id) {
  const c = byId(state.contracts, id);
  if (!c) return;
  confirmDialog('Xóa hợp đồng?', `Xóa hợp đồng <b>${esc(c.code)}</b> của ${esc(custName(c.customerId))}?`, 'Xóa', () => {
    state.contracts = state.contracts.filter(x => x.id !== id);
    logAction('delete', 'contract', c.code);
    save(); render(); toast('Đã xóa hợp đồng');
  });
}

function printContract(id) {
  const c = byId(state.contracts, id);
  if (!c) return;
  const st = state.settings;
  const terms = (c.terms || '').split('\n').filter(Boolean).map(t => `<p>${esc(t)}</p>`).join('');
  const schedRows = c.schedule.map(r => `<tr><td>${esc(r.label)}</td><td>${fmtDate(r.dueDate)}</td><td style="text-align:right">${fmtMoney(r.amount)}</td><td style="text-align:center">${r.paid ? 'Đã thu' : 'Chưa'}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Hợp đồng ${esc(c.code)}</title>
<style>body{font-family:'Be Vietnam Pro',Arial,sans-serif;color:#111;padding:36px 42px;font-size:13px}
h1{font-size:17px;text-align:center;text-transform:uppercase;letter-spacing:1px;color:#4f46e5}
.sub{text-align:center;font-size:12px;color:#555;margin-bottom:20px}
.head{display:flex;justify-content:space-between;border-bottom:2px solid #6366f1;padding-bottom:12px;margin-bottom:16px;font-size:12px;line-height:1.7}
table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ddd;padding:7px 10px;font-size:12px}
th{background:#f4f5fb;text-align:left}
.grand{font-weight:800;color:#4f46e5}
.terms p{margin:0 0 8px;line-height:1.65}
.sign{display:flex;justify-content:space-between;margin-top:52px}.sign div{text-align:center;width:230px;font-size:12px}
.sign .line{margin-top:54px;border-top:1px solid #999;padding-top:5px;color:#777;font-size:11px}</style></head><body>
<h1>Hợp đồng cung cấp dịch vụ chụp ảnh</h1>
<p class="sub">Số: ${esc(c.code)} · Ngày lập: ${fmtDate(c.createdAt)}</p>
<div class="head"><div><b>Bên A — ${esc(st.studioName)}</b><br>${esc(st.address)}<br>ĐT: ${esc(st.phone)}</div>
<div><b>Bên B — ${esc(custName(c.customerId))}</b><br>${esc((byId(state.customers, c.customerId) || {}).phone || '')}<br>${esc((byId(state.customers, c.customerId) || {}).address || '')}</div></div>
<p><b>Dịch vụ:</b> ${esc(c.service)}</p>
<p><b>Tổng giá trị:</b> <span class="grand">${fmtMoney(c.total)}</span></p>
<table><thead><tr><th>Lịch thanh toán</th><th>Hạn</th><th style="text-align:right">Số tiền</th><th>Trạng thái</th></tr></thead><tbody>${schedRows}</tbody></table>
<div class="terms"><h3>Điều khoản</h3>${terms || '<p>(Theo thỏa thuận riêng của hai bên)</p>'}</div>
<div class="sign"><div>Bên A<div class="line">(Ký, ghi rõ họ tên)</div></div><div>Bên B<div class="line">(Ký, ghi rõ họ tên)</div></div></div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`;
  try {
    const w = window.open('', '_blank', 'width=880,height=1000');
    if (!w) { toast('Trình duyệt đã chặn cửa sổ in — hãy cho phép popup', 'error'); return; }
    w.document.write(html); w.document.close(); w.focus();
  } catch (e) { toast('Không mở được cửa sổ in', 'error'); }
}

/* ================= CỔNG KHÁCH HÀNG ================= */
function driveFolderId(url) {
  const s = String(url || '');
  let m = s.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders|folderview\?id=)\/?([A-Za-z0-9_-]{10,})/);
  if (!m) m = s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : '';
}

function openGalleryModal(bookingId) {
  const b = byId(state.bookings, bookingId);
  if (!b) return;
  if (!b.gallery) b.gallery = { allowSelect: true, photos: [] };
  if (!b.portalToken) b.portalToken = uid();
  const g = b.gallery;
  const cust = byId(state.customers, b.customerId) || {};
  const selCount = g.photos.filter(p => p.selected).length;
  const url = location.origin + location.pathname + '#portal-' + b.portalToken;
  const did = driveFolderId(g.sourceUrl || '');
  openModal(`
    <div class="modal-head"><h3>Tạo Link Chọn Ảnh ❤ — ${esc(custName(b.customerId))}</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body" style="max-height:66vh;overflow-y:auto">
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="flex:1.4;min-width:300px">
          <div class="field"><label>${icon('pin')} BƯỚC 1 — Dán link thư mục Google Drive chứa ảnh</label>
            <input class="input" id="galSource" style="font-size:13px" value="${esc(g.sourceUrl || '')}" placeholder="https://drive.google.com/drive/folders/..." oninput="galDriveHint(this.value)">
            <div class="form-hint" id="galDriveHint">${did ? '✓ Link Drive hợp lệ — khách sẽ xem được ảnh ngay trong link chọn' : 'Trên Drive: chuột phải thư mục ảnh → Chia sẻ → "Ai có link" → Copy link'}</div>
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" onclick="scanIntoGallery('${b.id}')" title="Lấy mã ảnh từ thư mục máy/NAS thay vì gõ">${icon('refresh')} Quét mã ảnh từ thư mục máy</button>
            </div>
          </div>
          <div class="field"><label>${icon('package')} BƯỚC 2 — Số lượng ảnh để khách thả tim</label>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px">
              ${[20, 30, 40, 50, 80, 100].map(n => `<button class="btn btn-sm ${(g.photos.length || 30) === n ? 'btn-primary' : 'btn-ghost'}" style="padding:5px 11px" onclick="$('#galCount').value=${n};galGenPreview()">${n}</button>`).join('')}
            </div>
            <input class="input" id="galCount" type="number" min="1" max="500" value="${g.photos.length || 30}" oninput="galGenPreview()" style="width:110px">
            <div class="form-hint">Mã ảnh tự sinh A01, A02… khớp tên file trên Drive (đặt tên file A01.jpg, A02.jpg… để lọc ảnh sau này)</div>
          </div>
          <details style="margin-top:6px">
            <summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:var(--text-2)">⚙ Tuỳ chọn nâng cao (PIN, giá ảnh thêm, lời chào…)</summary>
            <div style="margin-top:10px">
              <div class="form-grid">
                <div class="field"><label>Tiêu đề album</label><input class="input" id="galTitle" value="${esc(g.title || '')}" placeholder="VD: Album Cưới — ${esc(shortName(cust.name || ''))}"></div>
                <div class="field"><label>Mã PIN mở album</label><input class="input" id="galPin" inputmode="numeric" maxlength="6" value="${esc(g.pin || '')}" placeholder="Trống = không cần PIN"></div>
                <div class="field"><label>Số ảnh gói (0 = ∞)</label><input class="input" id="galQty" type="number" min="0" value="${+g.includedQty || 0}"></div>
                <div class="field"><label>Giá ảnh thêm (₫/ảnh)</label><input class="input" id="galPrice" type="number" min="0" step="10000" value="${+g.extraPrice || 0}"></div>
              </div>
              <div class="checkbox-row" style="margin:6px 0"><input type="checkbox" id="galWatermark" ${g.watermark ? 'checked' : ''}><label for="galWatermark">Watermark tên studio</label></div>
              <div class="checkbox-row" style="margin:6px 0"><input type="checkbox" id="galAllow" ${g.allowSelect !== false ? 'checked' : ''}><label for="galAllow">Bật thả tim chọn ảnh ❤</label></div>
              <div class="checkbox-row" style="margin:6px 0"><input type="checkbox" id="galNotes" ${g.allowNotes !== false ? 'checked' : ''}><label for="galNotes">Cho khách ghi chú từng ảnh</label></div>
              <div class="checkbox-row" style="margin:6px 0"><input type="checkbox" id="galSubmit" ${g.allowSubmit !== false ? 'checked' : ''}><label for="galSubmit">Nút "Gửi Studio"</label></div>
              <div class="checkbox-row" style="margin:6px 0"><input type="checkbox" id="galDownload" ${g.allowDownload ? 'checked' : ''}><label for="galDownload">Cho khách mở thư mục Drive gốc</label></div>
              <div class="field"><label>Lời chào khách</label><textarea class="textarea" id="galGreeting" style="min-height:56px" placeholder="Chào anh chị! Thả tim ${+g.includedQty || 30} ảnh ưng ý nhất nhé ạ...">${esc(g.greeting || '')}</textarea></div>
            </div>
          </details>
        </div>
        <div style="flex:1;min-width:250px">
          <div class="card" style="padding:15px;position:sticky;top:0;border-color:#fde68a;background:#fffbeb">
            <div class="cell-main" style="margin-bottom:10px">${icon('camera')} BƯỚC 3 — Gửi link này cho khách</div>
            <div style="display:flex;gap:6px"><input class="input" id="galUrl" readonly value="${esc(url)}" style="font-size:11.5px">
            <button class="btn btn-primary btn-sm" style="flex:none" onclick="copyPortalUrl()">${icon('receipt')} Copy</button></div>
            <button class="btn btn-ghost btn-sm btn-block" style="margin-top:8px" onclick="openPortalNow('${b.id}')">👁 Xem thử trang khách sẽ thấy</button>
            <div class="cell-sub" style="margin-top:10px">Khách đã tim <b style="color:#e11d48">${selCount}</b>/${g.photos.length || '?'} ảnh${g.pin ? ' · 🔒 PIN' : ''}</div>
            <div class="photo-grid" style="grid-template-columns:repeat(4,1fr);max-height:150px;overflow-y:auto;padding:2px;margin-top:6px">
              ${g.photos.slice(0, 60).map(p => `<div class="photo-tile ${p.selected ? 'sel' : ''}" style="padding:5px 2px"><div class="pc" style="font-size:10px">${esc(p.code)}</div></div>`).join('')}
            </div>
            <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" style="flex:1" onclick="copySelectedCodes('${b.id}')">${icon('receipt')} Copy mã đã tim</button>
              <button class="btn btn-ghost btn-sm" style="flex:1" onclick="openPhotoFilterTool('${b.id}')">${icon('download')} Lọc ảnh gốc</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
      <button class="btn btn-primary" onclick="saveGallery('${b.id}')">${icon('check')} Tạo Link Chọn Ảnh</button>
    </div>`, 'lg');
}

function galDriveHint(v) {
  const el = $('#galDriveHint');
  if (el) el.innerHTML = driveFolderId(v) ? '✓ Link Drive hợp lệ — khách sẽ xem được ảnh ngay trong link chọn' : 'Chưa nhận dạng được thư mục Drive — kiểm tra link dạng drive.google.com/drive/folders/…';
}
function galGenPreview() { /* cập nhật số trên nút lưu khi đổi số lượng */ const el = document.querySelector('#modalRoot .modal-foot .btn-primary'); if (el) el.innerHTML = `${icon('check')} Tạo Link Chọn Ảnh (${Math.min(500, Math.max(1, +(($('#galCount') || {}).value || 30)))} ảnh)`; }

async function scanIntoGallery(bookingId) {
  const b = byId(state.bookings, bookingId);
  if (!b || !window.showDirectoryPicker) { toast('Cần Chrome/Edge và chọn thư mục ảnh gốc trên máy/NAS', 'error'); return; }
  try {
    const dir = await window.showDirectoryPicker({ mode: 'read' });
    const photos = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file' && /\.(jpe?g|png|tiff?|heic|webp|arw|cr2|cr3|nef|dng|raw)$/i.test(name)) {
        const base = name.replace(/\.[^.]+$/, '');
        photos.push({ id: uid(), code: base.slice(0, 24), name: name.slice(0, 26), selected: false });
        if (photos.length >= 500) break;
      }
    }
    if (!photos.length) { toast('Không tìm thấy file ảnh trong thư mục này', 'error'); return; }
    b.gallery.photos = photos;
    b.gallery.sourceUrl = $('#galSource') ? $('#galSource').value.trim() : (b.gallery.sourceUrl || '');
    b.gallery.allowSelect = true;
    logAction('update', 'portal', 'Quét ' + photos.length + ' ảnh vào album ' + custName(b.customerId));
    save(); openGalleryModal(bookingId);
    toast('Đã quét ' + photos.length + ' ảnh vào album');
  } catch (e) { if (e.name !== 'AbortError') toast('Lỗi quét thư mục: ' + e.message, 'error'); }
}

function copySelectedCodes(bookingId) {
  const b = byId(state.bookings, bookingId);
  const codes = (b.gallery.photos || []).filter(p => p.selected).map(p => p.code);
  if (!codes.length) { toast('Khách chưa chọn ảnh nào', 'error'); return; }
  const text = codes.join(', ');
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Đã copy ' + codes.length + ' mã ảnh: ' + (codes.length > 8 ? codes.slice(0, 8).join(', ') + '...' : text))).catch(() => toast(text, 'error'));
  else toast(text, 'error');
}

/* ---- Công cụ lọc file ảnh gốc (NAS/thư mục local) → thư mục khách chọn ---- */
let __pfOrigin = null, __pfDest = null, __pfBookingId = null;

async function openPhotoFilterTool(bookingId) {
  __pfBookingId = bookingId;
  openModal(`
    <div class="modal-head"><h3>Lọc ảnh gốc → thư mục khách chọn</h3><button class="icon-btn" onclick="closeModal()">${icon('x')}</button></div>
    <div class="modal-body">
      ${window.showDirectoryPicker ? `
      <p style="font-size:12.5px;color:var(--text-2);line-height:1.65;margin-bottom:12px">Chọn <b>thư mục ảnh gốc</b> trên NAS/ổ mạng (hoặc thư mục tải xuống từ Google Drive) và <b>thư mục đích</b> — hệ thống sẽ copy những file khớp mã ảnh khách đã tim ❤ sang thư mục đích.</p>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="pfPickOrigin()">${icon('package')} 1. Chọn thư mục ảnh gốc</button>
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="pfPickDest()">${icon('download')} 2. Chọn thư mục đích</button>
      </div>
      <div id="pfInfo" class="k-empty-hint" style="margin-bottom:10px">Chưa chọn thư mục nào.</div>
      <button class="btn btn-primary btn-block" onclick="pfCopyPhotos()">${icon('check')} 3. Copy ảnh khách đã chọn</button>
      ` : `
      <p style="font-size:13px;color:var(--text-2);line-height:1.7">Trình duyệt này không hỗ trợ truy cập thư mục trực tiếp (cần <b>Chrome / Edge</b> trên máy tính). Cách thay thế:</p>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="copySelectedCodes('${bookingId}')">${icon('receipt')} Copy mã ảnh đã chọn</button>
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="pfDownloadBat('${bookingId}')">${icon('download')} Tải script lọc (Windows)</button>
      </div>
      <div class="form-hint" style="margin-top:10px">Script .bat chạy trên máy chứa ảnh gốc: tạo thư mục "Khach chon" và copy các file khớp mã ảnh. Trên Mac dùng lệnh copy mã ảnh + Finder.</div>
      `}
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Đóng</button></div>`, 'sm');
  if (window.showDirectoryPicker) await pfRefreshInfo();
}

async function pfPickOrigin() {
  try { __pfOrigin = await window.showDirectoryPicker({ mode: 'read' }); await pfRefreshInfo(); }
  catch (e) { if (e.name !== 'AbortError') toast('Không mở được thư mục: ' + e.message, 'error'); }
}

async function pfPickDest() {
  try { __pfDest = await window.showDirectoryPicker({ mode: 'readwrite' }); await pfRefreshInfo(); }
  catch (e) { if (e.name !== 'AbortError') toast('Không mở được thư mục: ' + e.message, 'error'); }
}

async function pfScan(origin, codes) {
  const files = [];
  try {
    for await (const [name, handle] of origin.entries()) {
      if (handle.kind === 'file' && /\.(jpe?g|png|tiff?|heic|webp|arw|cr2|cr3|nef|dng|raw)$/i.test(name)) files.push({ name, handle });
    }
  } catch (e) { }
  const matched = files.filter(f => {
    const base = f.name.replace(/\.[^.]+$/, '');
    return codes.some(c => new RegExp('(^|[^A-Za-z0-9])' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^A-Za-z0-9])').test(base));
  });
  return { total: files.length, matched };
}

async function pfRefreshInfo() {
  const box = $('#pfInfo');
  if (!box) return;
  const b = byId(state.bookings, __pfBookingId);
  const codes = ((b && b.gallery && b.gallery.photos) || []).filter(p => p.selected).map(p => p.code);
  let html = `Khách đã tim ❤ <b>${codes.length}</b> ảnh${codes.length ? ': ' + codes.slice(0, 10).join(', ') + (codes.length > 10 ? '...' : '') : ''}.<br>`;
  if (__pfOrigin) {
    const scan = await pfScan(__pfOrigin, codes);
    html += `Thư mục gốc <b>${esc(__pfOrigin.name)}</b>: ${scan.total} file ảnh — <b style="color:var(--green)">${scan.matched.length} khớp mã</b>.<br>`;
  } else html += 'Chưa chọn thư mục gốc.<br>';
  html += __pfDest ? `Thư mục đích: <b>${esc(__pfDest.name)}</b>` : 'Chưa chọn thư mục đích.';
  box.innerHTML = html;
  box.style.display = 'block';
  box.style.textAlign = 'left';
}

async function pfCopyPhotos() {
  const b = byId(state.bookings, __pfBookingId);
  const codes = ((b && b.gallery && b.gallery.photos) || []).filter(p => p.selected).map(p => p.code);
  if (!codes.length) { toast('Khách chưa chọn ảnh nào', 'error'); return; }
  if (!__pfOrigin || !__pfDest) { toast('Chọn đủ thư mục gốc và thư mục đích trước', 'error'); return; }
  const scan = await pfScan(__pfOrigin, codes);
  if (!scan.matched.length) { toast('Không tìm thấy file nào khớp mã ảnh trong thư mục gốc', 'error'); return; }
  let ok = 0, fail = 0;
  for (const f of scan.matched) {
    try {
      const fh = await __pfDest.getFileHandle(f.name, { create: true });
      const w = await fh.createWritable();
      await w.write(await f.handle.getFile());
      await w.close();
      ok++;
    } catch (e) { fail++; }
  }
  logAction('data', 'portal', `Lọc ${ok} ảnh gốc → thư mục khách chọn (${custName(b.customerId)})`);
  pushNotif('ready', '📁 Đã lọc ' + ok + ' ảnh khách chọn', custName(b.customerId) + ' — copy từ ' + __pfOrigin.name + ' sang ' + __pfDest.name);
  save();
  toast(`Đã copy ${ok} ảnh${fail ? ', lỗi ' + fail : ''} sang "${__pfDest.name}"`);
  await pfRefreshInfo();
}

function pfDownloadBat(bookingId) {
  const b = byId(state.bookings, bookingId);
  const codes = ((b && b.gallery && b.gallery.photos) || []).filter(p => p.selected).map(p => p.code);
  if (!codes.length) { toast('Khách chưa chọn ảnh nào', 'error'); return; }
  const find = codes.map(c => `("${c}.*")`).join(' ');
  const bat = `@echo off\r\nchcp 65001 >nul\r\nrem Studio Manager - Loc anh khach chon - ${esc(b ? custName(b.customerId) : '')}\r\nrem Dat file .bat nay vao thu muc chua anh GOC roi chay di double-click\r\nif not exist "Khach chon" mkdir "Khach chon"\r\nfor %%f in (${find}) do copy "%%f" "Khach chon\\" >nul\r\necho Da copy ${codes.length} anh vao thu muc "Khach chon"\r\npause\r\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bat], { type: 'text/plain' }));
  a.download = 'loc-anh-khach-chon.bat';
  a.click(); URL.revokeObjectURL(a.href);
  toast('Đã tải script — đặt vào thư mục ảnh gốc rồi chạy');
}

function genGalleryPhotos(bookingId) {
  const b = byId(state.bookings, bookingId);
  const n = Math.min(500, Math.max(1, +$('#galCount').value || 40));
  b.gallery.photos = Array.from({ length: n }, (_, i) => ({ id: uid(), code: 'A' + pad(i + 1), name: 'Ảnh ' + pad(i + 1), selected: false }));
  toast('Đã sinh ' + n + ' ảnh — bấm Lưu để cập nhật');
  saveGallery(bookingId, true);
}

function gallerySyncCount(bookingId) {
  const b = byId(state.bookings, bookingId);
  const sel = $$('#modalRoot .photo-tile.sel').length;
  const el = $('#galSelCount');
  if (el) el.textContent = sel;
}

function saveGallery(bookingId, reopen) {
  const b = byId(state.bookings, bookingId);
  const g = b.gallery;
  g.allowSelect = $('#galAllow') ? $('#galAllow').checked : g.allowSelect;
  g.title = $('#galTitle') ? $('#galTitle').value.trim() : (g.title || '');
  g.includedQty = Math.max(0, Math.round(+($('#galQty') ? $('#galQty').value : g.includedQty) || 0));
  g.extraPrice = Math.max(0, Math.round(+($('#galPrice') ? $('#galPrice').value : g.extraPrice) || 0));
  g.pin = $('#galPin') ? ($('#galPin').value || '').replace(/\D/g, '').slice(0, 6) : (g.pin || '');
  g.watermark = $('#galWatermark') ? $('#galWatermark').checked : !!g.watermark;
  g.allowDownload = $('#galDownload') ? $('#galDownload').checked : !!g.allowDownload;
  g.allowNotes = $('#galNotes') ? $('#galNotes').checked : g.allowNotes !== false;
  g.allowSubmit = $('#galSubmit') ? $('#galSubmit').checked : g.allowSubmit !== false;
  g.greeting = $('#galGreeting') ? $('#galGreeting').value.trim() : (g.greeting || '');
  const srcEl = $('#galSource');
  if (srcEl) { g.sourceUrl = srcEl.value.trim(); g.driveId = driveFolderId(g.sourceUrl); }
  // Chưa có mã ảnh → tự sinh theo số lượng đã nhập
  if (!b.gallery.photos.length && $('#galCount')) {
    const n = Math.min(500, Math.max(1, +$('#galCount').value || 30));
    b.gallery.photos = Array.from({ length: n }, (_, i) => ({ id: uid(), code: 'A' + pad(i + 1), name: 'Ảnh ' + pad(i + 1), selected: false }));
  }
  const tiles = $$('#modalRoot .photo-tile');
  if (tiles.length) {
    const selCodes = new Set($$('#modalRoot .photo-tile.sel').map(t => t.querySelector('.pc').textContent));
    b.gallery.photos.forEach(p => { p.selected = selCodes.has(p.code); });
  }
  logAction('update', 'portal', custName(b.customerId) + ' — thư viện & cổng KH');
  __galleryTouchedAt = Date.now();
  save();
  if (!reopen) { closeModal(); render(); toast('Đã lưu thư viện & link cổng khách hàng'); }
  else { closeModal(); openGalleryModal(bookingId); }
}

function copyPortalUrl() {
  const url = $('#galUrl').value;
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Đã sao chép link')).catch(() => toast(url, 'error'));
  else toast(url, 'error');
}

function openPortalNow(bookingId) {
  const b = byId(state.bookings, bookingId);
  location.hash = 'portal-' + b.portalToken;
}

let __portalRemote = null; // {token, data} — portal đang xem từ server (máy không có dữ liệu local)

const driveEmbedHtml = (g, d) => {
  const id = g.driveId || driveFolderId(g.sourceUrl || '');
  if (!id) return '';
  return `<div class="portal-card">
    <h3>📁 Ảnh của bạn (Google Drive)</h3>
    <p style="font-size:12.5px;color:var(--text-2);margin-bottom:10px">Duyệt ảnh thật trong khung dưới — thấy ảnh nào ưng thì xuống phần <b>Thả tim ❤</b> bấm chọn mã ảnh tương ứng nhé${g.allowDownload ? ` · <a class="link" href="${esc(g.sourceUrl)}" target="_blank" rel="noopener">mở thư mục Drive</a>` : ''}.</p>
    <iframe src="https://drive.google.com/embeddedfolderview?id=${esc(id)}#grid" style="width:100%;height:460px;border:1px solid var(--border);border-radius:12px;background:#fafaf9" loading="lazy" title="Ảnh Google Drive"></iframe>
  </div>`;
};

async function renderPortalScreen(token) {
  const b = state.bookings.find(x => x.portalToken === token);
  const body = $('#portalBody');
  if (!b && SERVER_MODE) return renderPortalRemote(token);
  if (!b) {
    body.innerHTML = `<div class="portal-hero"><h1>${esc(state.settings.studioName)}</h1><p>Cổng khách hàng</p></div>
      <div class="portal-wrap"><div class="portal-card" style="text-align:center;padding:40px">${iconWrap('alert')}<h4 style="margin-top:10px">Liên kết không hợp lệ hoặc đã hết hạn</h4>
      <button class="btn btn-primary" style="margin-top:16px" onclick="location.hash='dashboard'">Về trang chủ</button></div></div>`;
    return;
  }
  // Cổng PIN — mở khóa theo phiên (sessionStorage)
  if (b.gallery && b.gallery.pin && sessionStorage.getItem('portalPinOk_' + token) !== '1') {
    body.innerHTML = `
    <div class="portal-hero"><h1>${esc(state.settings.studioName)}</h1><p>Album của ${esc(custName(b.customerId))}</p></div>
    <div class="portal-wrap" style="max-width:380px">
      <div class="portal-card" style="text-align:center">
        <div class="stat-icon tint-indigo" style="margin:0 auto 12px">${icon('lock')}</div>
        <h3>Nhập mã PIN để xem album</h3>
        <p style="font-size:12.5px;color:var(--text-2);margin:8px 0 14px">Mã PIN do studio cung cấp (4–6 số)</p>
        <div class="auth-error" id="pinErr" style="display:none"></div>
        <input class="input" id="portalPin" inputmode="numeric" maxlength="6" style="text-align:center;font-size:22px;letter-spacing:.4em;font-weight:800" placeholder="••••" onkeydown="if(event.key==='Enter')portalTryPin('${token}')">
        <button class="btn btn-primary btn-block" style="margin-top:12px" onclick="portalTryPin('${token}')">Mở album</button>
      </div>
    </div>`;
    setTimeout(() => { const el = $('#portalPin'); if (el) el.focus(); }, 60);
    return;
  }
  const idx = FLOW.indexOf(b.status);
  const cust = byId(state.customers, b.customerId) || {};
  const o = orderOfBooking(b.id);
  const photos = (b.gallery && b.gallery.photos) || [];
  const allowSelect = b.gallery && b.gallery.allowSelect;
  const selCount = photos.filter(p => p.selected).length;
  body.innerHTML = `
  <div class="portal-hero"><h1>${esc(state.settings.studioName)}</h1><p>Cổng khách hàng — cập nhật trực tiếp</p></div>
  <div class="portal-wrap">
    <div class="portal-msg" id="portalMsg"></div>
    ${(b.gallery.greeting && allowSelect) ? `<div class="portal-card" style="background:#eef2ff;border-color:#c7d2fe;font-size:13px;line-height:1.7">💌 <b>${esc(state.settings.studioName)}</b> gửi lời chào:<br>${esc(b.gallery.greeting)}</div>` : ''}
    <div class="portal-card">
      <h3>Xin chào ${esc(cust.name || 'quý khách')} 👋</h3>
      <p style="font-size:13px;color:var(--text-2);line-height:1.7">
        Buổi chụp <b>${esc(pkgName(b.packageId))}</b> — ${fmtDateLong(b.date)}${b.startTime ? ', ' + b.startTime : ''}<br>
        Địa điểm: ${esc(b.location || '—')}</p>
      <div class="p-steps" style="margin-top:14px">
        ${FLOW.map((st, i) => `<div class="p-step ${i < idx ? 'done' : ''} ${i === idx ? 'cur' : ''}"><div class="d">${i < idx ? '✓' : i + 1}</div>${BK_STATUS[st].label}</div>`).join('')}
      </div>
      ${b.status === 'cancelled' ? `<div class="cancel-banner" style="margin-top:12px">${icon('alert')} Buổi chụp này đã bị hủy.</div>` : ''}
    </div>
    ${o ? `<div class="portal-card"><h3>Thanh toán</h3>
      <div class="pay-progress"><div style="width:${orderTotal(o) ? Math.min(100, Math.round((+o.paidAmount || 0) / orderTotal(o) * 100)) : 0}%"></div></div>
      <div class="pay-legend"><span>Đã thanh toán <b>${fmtMoney(+o.paidAmount || 0)}</b></span><span>Còn lại <b style="color:${orderRemaining(o) > 0 ? 'var(--red)' : 'var(--green)'}">${fmtMoney(orderRemaining(o))}</b></span></div>
    </div>` : ''}
    ${driveEmbedHtml(b.gallery)}
    <div class="portal-card">
      <h3>${b.gallery.title ? esc(b.gallery.title) : 'Chọn ảnh cần chỉnh sửa'} ${photos.length ? `(${selCount}/${photos.length}${b.gallery.includedQty ? ' · gói ' + b.gallery.includedQty : ''} đã chọn)` : ''}</h3>
      ${b.gallery.includedQty && selCount > b.gallery.includedQty ? `<div class="auth-error" style="display:flex;background:#fffbeb;border-color:#fde68a;color:#92400e">⚠ Bạn đã chọn vượt ${selCount - b.gallery.includedQty} ảnh so với gói${b.gallery.extraPrice ? ' — phụ thu ' + fmtMoney((selCount - b.gallery.includedQty) * b.gallery.extraPrice) : ''}. Có thể bỏ bớt tim nếu muốn.</div>` : ''}
      ${photos.length ? (allowSelect
        ? `<p style="font-size:12.5px;color:var(--text-2);margin-bottom:12px">Bấm <b>❤ thả tim</b> vào ảnh bạn thích${b.gallery.allowNotes !== false ? ', có thể <b>✎ ghi chú yêu cầu sửa</b> cho từng ảnh' : ''} rồi bấm <b>Gửi Studio</b>.</p>
           <div class="photo-grid">${photos.map(p => `
           <div class="photo-tile ${p.selected ? 'sel' : ''}" data-pid="${p.id}" onclick="this.classList.toggle('sel');this.querySelector('.tick').textContent=this.classList.contains('sel')?'❤ đã chọn':''">
             ${b.gallery.watermark ? `<div class="wm">© ${esc(state.settings.studioName)}</div>` : ''}
             <div class="pc">${esc(p.code)}</div><div class="pn">${esc(p.name)}</div><div class="tick">${p.selected ? '❤' + (p.note ? ' 📝' : '') + ' đã chọn' : ''}</div>
             ${b.gallery.allowNotes !== false ? `<div style="font-size:10px;margin-top:2px"><a class="link" style="font-size:10px" onclick="event.stopPropagation();portalPhotoNote('${token}','${p.id}')">✎ ghi chú sửa</a>${p.note ? `<div class="cell-sub" style="font-size:9.5px;margin-top:2px">${esc(p.note)}</div>` : ''}</div>` : ''}
           </div>`).join('')}</div>
           <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
             <button class="btn btn-ghost" style="flex:1" onclick="portalCopyCodes('${token}')">${icon('receipt')} Copy mã ảnh đã chọn</button>
             ${b.gallery.allowSubmit !== false ? `<button class="btn btn-primary" style="flex:1" onclick="portalSaveSelection('${token}')">${icon('check')} Gửi Studio</button>` : ''}
             ${b.gallery.allowDownload && /^https?:/.test(b.gallery.sourceUrl || '') ? `<a class="btn btn-ghost" style="flex:1;text-decoration:none" href="${esc(b.gallery.sourceUrl)}" target="_blank" rel="noopener">${icon('download')} Tải ảnh gốc</a>` : ''}
           </div>
           ${b.gallery.sourceUrl && !/^https?:/.test(b.gallery.sourceUrl) && b.gallery.allowDownload ? `<div class="cell-sub" style="text-align:center;margin-top:8px">Ảnh gốc: ${esc(b.gallery.sourceUrl)}</div>` : ''}`
        : `<p style="font-size:12.5px;color:var(--text-2)">Danh sách ảnh đã sẵn sàng. Studio sẽ mở tính năng chọn ảnh khi hậu kỳ xong — bạn vui lòng quay lại sau nhé.</p>
           <div class="photo-grid" style="opacity:.65">${photos.map(p => `<div class="photo-tile"><div class="pc">${esc(p.code)}</div><div class="pn">${esc(p.name)}</div></div>`).join('')}</div>`)
      : `<p style="font-size:12.5px;color:var(--text-2)">Ảnh sẽ được studio cập nhật sau buổi chụp. Bạn có thể theo dõi tiến độ ở trên.</p>`}
    </div>
    <div style="text-align:center"><button class="btn btn-ghost" onclick="location.hash='dashboard'">Về trang chủ studio</button></div>
  </div>`;
}

/* ---- Portal chế độ online: máy khách không có dữ liệu local → tải từ server ---- */
async function renderPortalRemote(token) {
  const body = $('#portalBody');
  body.innerHTML = `<div class="portal-hero"><h1>${esc(state.settings.studioName)}</h1><p>Cổng khách hàng</p></div>
    <div class="portal-wrap"><div class="portal-card" style="text-align:center;padding:40px">${iconWrap('refresh')}<p style="margin-top:10px;font-size:13px;color:var(--text-2)">Đang tải album…</p></div></div>`;
  let d;
  try {
    const r = await fetch('/api/portal/' + encodeURIComponent(token));
    if (!r.ok) throw new Error('link');
    d = await r.json();
  } catch (e) {
    __portalRemote = null;
    body.innerHTML = `<div class="portal-hero"><h1>${esc(state.settings.studioName)}</h1><p>Cổng khách hàng</p></div>
      <div class="portal-wrap"><div class="portal-card" style="text-align:center;padding:40px">${iconWrap('alert')}<h4 style="margin-top:10px">Liên kết không hợp lệ hoặc đã hết hạn</h4>
      <button class="btn btn-primary" style="margin-top:16px" onclick="location.hash='dashboard'">Về trang chủ</button></div></div>`;
    return;
  }
  __portalRemote = { token, data: d };
  const g = d.gallery || {};
  if (g.pin && sessionStorage.getItem('portalPinOk_' + token) !== '1') {
    body.innerHTML = `
    <div class="portal-hero"><h1>${esc(d.studioName)}</h1><p>Album của ${esc(d.customerName)}</p></div>
    <div class="portal-wrap" style="max-width:380px">
      <div class="portal-card" style="text-align:center">
        <div class="stat-icon tint-indigo" style="margin:0 auto 12px">${icon('lock')}</div>
        <h3>Nhập mã PIN để xem album</h3>
        <p style="font-size:12.5px;color:var(--text-2);margin:8px 0 14px">Mã PIN do studio cung cấp (4–6 số)</p>
        <div class="auth-error" id="pinErr" style="display:none"></div>
        <input class="input" id="portalPin" inputmode="numeric" maxlength="6" style="text-align:center;font-size:22px;letter-spacing:.4em;font-weight:800" placeholder="••••" onkeydown="if(event.key==='Enter')portalTryPin('${token}')">
        <button class="btn btn-primary btn-block" style="margin-top:12px" onclick="portalTryPin('${token}')">Mở album</button>
      </div>
    </div>`;
    setTimeout(() => { const el = $('#portalPin'); if (el) el.focus(); }, 60);
    return;
  }
  const idx = FLOW.indexOf(d.status);
  const photos = g.photos || [];
  const selCount = photos.filter(p => p.selected).length;
  const allowSelect = g.allowSelect;
  const remain = d.pay ? d.pay.total - d.pay.paid : 0;
  body.innerHTML = `
  <div class="portal-hero"><h1>${esc(d.studioName)}</h1><p>Cổng khách hàng — cập nhật trực tiếp</p></div>
  <div class="portal-wrap">
    <div class="portal-msg" id="portalMsg"></div>
    ${(g.greeting && allowSelect) ? `<div class="portal-card" style="background:#eef2ff;border-color:#c7d2fe;font-size:13px;line-height:1.7">💌 <b>${esc(d.studioName)}</b> gửi lời chào:<br>${esc(g.greeting)}</div>` : ''}
    <div class="portal-card">
      <h3>Xin chào ${esc(d.customerName || 'quý khách')} 👋</h3>
      <p style="font-size:13px;color:var(--text-2);line-height:1.7">
        Buổi chụp <b>${esc(d.pkgName)}</b> — ${fmtDateLong(d.date)}${d.startTime ? ', ' + d.startTime : ''}<br>
        Địa điểm: ${esc(d.location || '—')}</p>
      <div class="p-steps" style="margin-top:14px">
        ${FLOW.map((st, i) => `<div class="p-step ${i < idx ? 'done' : ''} ${i === idx ? 'cur' : ''}"><div class="d">${i < idx ? '✓' : i + 1}</div>${BK_STATUS[st].label}</div>`).join('')}
      </div>
      ${d.status === 'cancelled' ? `<div class="cancel-banner" style="margin-top:12px">${icon('alert')} Buổi chụp này đã bị hủy.</div>` : ''}
    </div>
    ${d.pay ? `<div class="portal-card"><h3>Thanh toán</h3>
      <div class="pay-progress"><div style="width:${d.pay.total ? Math.min(100, Math.round(d.pay.paid / d.pay.total * 100)) : 0}%"></div></div>
      <div class="pay-legend"><span>Đã thanh toán <b>${fmtMoney(d.pay.paid)}</b></span><span>Còn lại <b style="color:${remain > 0 ? 'var(--red)' : 'var(--green)'}">${fmtMoney(remain)}</b></span></div>
    </div>` : ''}
    ${driveEmbedHtml(g)}
    <div class="portal-card">
      <h3>${g.title ? esc(g.title) : 'Chọn ảnh cần chỉnh sửa'} ${photos.length ? `(${selCount}/${photos.length}${g.includedQty ? ' · gói ' + g.includedQty : ''} đã chọn)` : ''}</h3>
      ${g.includedQty && selCount > g.includedQty ? `<div class="auth-error" style="display:flex;background:#fffbeb;border-color:#fde68a;color:#92400e">⚠ Bạn đã chọn vượt ${selCount - g.includedQty} ảnh so với gói${g.extraPrice ? ' — phụ thu ' + fmtMoney((selCount - g.includedQty) * g.extraPrice) : ''}. Có thể bỏ bớt tim nếu muốn.</div>` : ''}
      ${photos.length ? (allowSelect
        ? `<p style="font-size:12.5px;color:var(--text-2);margin-bottom:12px">Bấm <b>❤ thả tim</b> vào ảnh bạn thích${g.allowNotes !== false ? ', có thể <b>✎ ghi chú yêu cầu sửa</b> cho từng ảnh' : ''} rồi bấm <b>Gửi Studio</b>.</p>
           <div class="photo-grid">${photos.map(p => `
           <div class="photo-tile ${p.selected ? 'sel' : ''}" data-pid="${p.id}" onclick="this.classList.toggle('sel');this.querySelector('.tick').textContent=this.classList.contains('sel')?'❤ đã chọn':''">
             ${g.watermark ? `<div class="wm">© ${esc(d.studioName)}</div>` : ''}
             <div class="pc">${esc(p.code)}</div><div class="pn">${esc(p.name)}</div><div class="tick">${p.selected ? '❤' + (p.note ? ' 📝' : '') + ' đã chọn' : ''}</div>
             ${g.allowNotes !== false ? `<div style="font-size:10px;margin-top:2px"><a class="link" style="font-size:10px" onclick="event.stopPropagation();portalRemoteNote('${token}','${p.id}')">✎ ghi chú sửa</a>${p.note ? `<div class="cell-sub" style="font-size:9.5px;margin-top:2px">${esc(p.note)}</div>` : ''}</div>` : ''}
           </div>`).join('')}</div>
           <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
             <button class="btn btn-ghost" style="flex:1" onclick="portalRemoteCopy('${token}')">${icon('receipt')} Copy mã ảnh đã chọn</button>
             ${g.allowSubmit !== false ? `<button class="btn btn-primary" style="flex:1" onclick="portalRemoteSubmit('${token}')">${icon('check')} Gửi Studio</button>` : ''}
             ${g.allowDownload && /^https?:/.test(g.sourceUrl || '') ? `<a class="btn btn-ghost" style="flex:1;text-decoration:none" href="${esc(g.sourceUrl)}" target="_blank" rel="noopener">${icon('download')} Tải ảnh gốc</a>` : ''}
           </div>`
        : `<p style="font-size:12.5px;color:var(--text-2)">Danh sách ảnh đã sẵn sàng. Studio sẽ mở tính năng chọn ảnh khi hậu kỳ xong — bạn vui lòng quay lại sau nhé.</p>
           <div class="photo-grid" style="opacity:.65">${photos.map(p => `<div class="photo-tile"><div class="pc">${esc(p.code)}</div><div class="pn">${esc(p.name)}</div></div>`).join('')}</div>`)
      : `<p style="font-size:12.5px;color:var(--text-2)">Ảnh sẽ được studio cập nhật sau buổi chụp. Bạn có thể theo dõi tiến độ ở trên.</p>`}
    </div>
    <div style="text-align:center"><button class="btn btn-ghost" onclick="location.hash='dashboard'">Về trang chủ studio</button></div>
  </div>`;
}

function portalRemotePhotos() {
  return (__portalRemote && __portalRemote.data.gallery && __portalRemote.data.gallery.photos) || [];
}

function portalRemoteCopy(token) {
  const ids = $$('#portalBody .photo-tile.sel').map(t => t.dataset.pid);
  const codes = portalRemotePhotos().filter(p => ids.includes(p.id)).map(p => p.code);
  if (!codes.length) { const msg = $('#portalMsg'); msg.style.display = 'block'; msg.style.background = '#fef2f2'; msg.style.borderColor = '#fecaca'; msg.style.color = '#b91c1c'; msg.textContent = 'Bạn chưa thả tim ảnh nào — bấm vào ảnh để chọn nhé!'; return; }
  const text = codes.join(', ');
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => { });
  const msg = $('#portalMsg');
  msg.style.display = 'block'; msg.style.background = '#ecfdf5'; msg.style.borderColor = '#a7f3d0'; msg.style.color = '#047857';
  msg.textContent = '✓ Đã copy ' + codes.length + ' mã ảnh: ' + text;
}

async function portalRemoteSubmit(token) {
  const ids = $$('#portalBody .photo-tile.sel').map(t => t.dataset.pid);
  try {
    const r = await fetch('/api/portal-select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ids }) });
    if (!r.ok) throw new Error('lưu');
    const msg = $('#portalMsg');
    if (msg) { msg.style.display = 'block'; msg.style.background = '#ecfdf5'; msg.style.borderColor = '#a7f3d0'; msg.style.color = '#047857'; msg.textContent = '✓ Đã lưu ' + ids.length + ' ảnh bạn chọn — studio đã nhận được!'; }
    document.querySelector('.portal-wrap').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { toast('Không gửi được — kiểm tra mạng rồi thử lại', 'error'); }
}

async function portalRemoteNote(token, pid) {
  const p = portalRemotePhotos().find(x => x.id === pid);
  if (!p) return;
  const v = prompt('Yêu cầu sửa ảnh ' + p.code + ' (VD: làm mờ sau, crop mặt...):', p.note || '');
  if (v === null) return;
  p.note = v.trim();
  const tile = document.querySelector('#portalBody .photo-tile[data-pid="' + pid + '"]');
  const ids = $$('#portalBody .photo-tile.sel').map(t => t.dataset.pid);
  if (v.trim()) {
    if (tile) { tile.classList.add('sel'); const t = tile.querySelector('.tick'); if (t) t.innerHTML = '❤ 📝'; }
    if (!ids.includes(pid)) ids.push(pid);
  }
  fetch('/api/portal-select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ids, notes: { [pid]: v.trim() } }) }).catch(() => { });
}

function portalTryPin(token) {
  const b = state.bookings.find(x => x.portalToken === token);
  const val = ($('#portalPin').value || '').replace(/\D/g, '');
  const err = $('#pinErr');
  const pin = b ? ((b.gallery && b.gallery.pin) || '')
    : (__portalRemote && __portalRemote.token === token && __portalRemote.data.gallery ? (__portalRemote.data.gallery.pin || '') : null);
  if (pin === null || val !== pin) {
    err.style.display = 'flex';
    err.textContent = 'Mã PIN không đúng — thử lại nhé';
    $('#portalPin').value = '';
    return;
  }
  sessionStorage.setItem('portalPinOk_' + token, '1');
  if (b) renderPortalScreen(token); else renderPortalRemote(token);
}

/* ---- Ghi chú yêu cầu sửa ảnh + Google Calendar ---- */
function portalPhotoNote(token, pid) {
  const b = state.bookings.find(x => x.portalToken === token);
  if (!b) return;
  const p = (b.gallery.photos || []).find(x => x.id === pid);
  if (!p) return;
  const v = prompt('Yêu cầu sửa ảnh ' + p.code + ' (VD: làm mờ sau,_crop mặt...):', p.note || '');
  if (v === null) return;
  p.note = v.trim();
  p.selected = true;
  save();
  const tick = document.querySelector('#portalBody .photo-tile[data-pid="' + pid + '"]');
  if (tick) { tick.classList.add('sel'); const t = tick.querySelector('.tick'); if (t) t.innerHTML = '❤' + (p.note ? ' 📝' : ''); }
}

function gcalUrl(b) {
  const d = (b.date || todayStr()).replace(/-/g, '');
  const st = (b.startTime || '09:00').replace(':', '') + '00';
  const [eh, em] = computeEnd(b.startTime || '09:00', b.hours || 1).split(':').map(Number);
  const en = pad(eh) + pad(em) + '00';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: state.settings.studioName + ' — ' + custName(b.customerId),
    dates: d + 'T' + st + '/' + d + 'T' + en,
    details: 'Gói: ' + pkgName(b.packageId) + ' · Địa điểm: ' + (b.location || '') + ' · Thợ chụp: ' + (b.photographerId ? staffName(b.photographerId) : ''),
    location: b.location || '',
  });
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

function portalCopyCodes(token) {
  const b = state.bookings.find(x => x.portalToken === token);
  if (!b) return;
  const ids = $$('#portalBody .photo-tile.sel').map(t => t.dataset.pid);
  const codes = (b.gallery.photos || []).filter(p => ids.includes(p.id)).map(p => p.code);
  if (!codes.length) { const msg = $('#portalMsg'); msg.style.display = 'block'; msg.style.background = '#fef2f2'; msg.style.borderColor = '#fecaca'; msg.style.color = '#b91c1c'; msg.textContent = 'Bạn chưa thả tim ảnh nào — bấm vào ảnh để chọn nhé!'; return; }
  const text = codes.join(', ');
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => { });
  const msg = $('#portalMsg');
  msg.style.display = 'block'; msg.style.background = '#ecfdf5'; msg.style.borderColor = '#a7f3d0'; msg.style.color = '#047857';
  msg.textContent = '✓ Đã copy ' + codes.length + ' mã ảnh: ' + text;
}

function portalSaveSelection(token) {
  const b = state.bookings.find(x => x.portalToken === token);
  if (!b) return;
  const ids = $$('#portalBody .photo-tile.sel').map(t => t.dataset.pid);
  (b.gallery.photos || []).forEach(p => { p.selected = ids.includes(p.id); });
  save();
  if (SERVER_MODE) {
    fetch('/api/portal-select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ids }) }).catch(() => { });
  }
  const msg = $('#portalMsg');
  if (msg) { msg.style.display = 'block'; msg.textContent = '✓ Đã lưu ' + ids.length + ' ảnh bạn chọn — studio đã nhận được!'; }
  document.querySelector('.portal-wrap').scrollIntoView({ behavior: 'smooth' });
}


const LOG_ACTIONS = {
  login: ['Đăng nhập', 'b-confirmed'], logout: ['Đăng xuất', 'b-inactive'],
  create: ['Thêm mới', 'b-delivered'], update: ['Cập nhật', 'b-confirmed'],
  delete: ['Xóa', 'b-unpaid'], pay: ['Thu tiền', 'b-delivered'],
  move: ['Di chuyển', 'b-deposit'], status: ['Đổi trạng thái', 'b-editing'],
  data: ['Dữ liệu', 'b-pending'],
};
const ENTITY_LABEL = {
  user: 'Tài khoản', customer: 'Khách hàng', booking: 'Lịch chụp', order: 'Đơn hàng',
  task: 'Công việc', column: 'Cột công việc', outfit: 'Trang phục', concept: 'Concept',
  loan: 'Phiếu mượn', settings: 'Cài đặt', system: 'Hệ thống',
  expense: 'Chi phí', payroll: 'Lương', contract: 'Hợp đồng', portal: 'Cổng KH', attendance: 'Chấm công', cash: 'Thu chi', chat: 'Nhắn tin',
};

function logAction(action, entity, target, user) {
  if (!Array.isArray(state.logs)) state.logs = [];
  const u = user || currentUser();
  state.logs.push({
    id: uid(), ts: new Date().toISOString(),
    userId: u ? u.id : '', username: u ? u.username : 'system',
    action, entity, target: String(target || ''),
  });
  if (state.logs.length > 500) state.logs.splice(0, state.logs.length - 500);
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function changelogView() {
  return `
  <div class="card" style="padding:20px 24px;margin-bottom:16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:linear-gradient(135deg,#18181B,#27272A);border:1px solid #3F3F46;color:#FAFAFA">
    <div style="width:46px;height:46px;border-radius:14px;background:linear-gradient(180deg,#FBBF24,#D97706);display:flex;align-items:center;justify-content:center;color:#18181B">${icon('camera')}</div>
    <div style="flex:1;min-width:200px">
      <div style="font-size:10.5px;font-weight:700;letter-spacing:.12em;color:#F59E0B;text-transform:uppercase">Studio Manager</div>
      <div style="font-size:19px;font-weight:800">Phiên bản ${APP_VERSION} — ${CHANGELOG[0].d}</div>
    </div>
    <span class="cell-sub" style="color:#A1A1AA">${CHANGELOG.reduce((n, r) => n + r.items.length, 0)} thay đổi · ${CHANGELOG.length} phiên bản</span>
  </div>
  ${CHANGELOG.map((r, i) => `
  <div class="card cl-card ${i === 0 ? 'cl-latest' : ''}" style="padding:16px 20px;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span class="cl-ver">${r.v}</span>
      ${i === 0 ? '<span class="badge b-delivered">phiên bản hiện tại</span>' : ''}
      <span class="cell-sub" style="margin-left:auto">${r.d}</span>
    </div>
    <ul class="cl-list">
      ${r.items.map(([kind, txt]) => `<li><span class="badge ${CL_KIND[kind] ? CL_KIND[kind][1] : 'b-khac'}" style="flex:none">${CL_KIND[kind] ? CL_KIND[kind][0] : kind}</span><span>${esc(txt)}</span></li>`).join('')}
    </ul>
  </div>`).join('')}`;
}

function logsView() {
  const v = viewState.logs;
  const usernames = [...new Set(state.logs.map(l => l.username))];
  const ql = v.q.trim().toLowerCase();
  const list = [...state.logs].reverse()
    .filter(l => v.user === 'all' || l.username === v.user)
    .filter(l => v.action === 'all' || l.action === v.action)
    .filter(l => !ql || [l.target, l.username, ENTITY_LABEL[l.entity]].some(x => String(x || '').toLowerCase().includes(ql)))
    .slice(0, 200);
  return `
  <div class="toolbar">
    <div class="search-box">${icon('search')}<input class="input" placeholder="Tìm trong nhật ký..." value="${esc(v.q)}" oninput="viewState.logs.q=this.value;renderLogRows()"></div>
    <select class="select" style="width:auto" onchange="viewState.logs.user=this.value;renderLogRows()">
      <option value="all">Mọi người dùng</option>
      ${usernames.map(un => `<option ${v.user === un ? 'selected' : ''}>${esc(un)}</option>`).join('')}
    </select>
    <select class="select" style="width:auto" onchange="viewState.logs.action=this.value;renderLogRows()">
      <option value="all">Mọi hành động</option>
      ${Object.entries(LOG_ACTIONS).map(([k, val]) => `<option value="${k}" ${v.action === k ? 'selected' : ''}>${val[0]}</option>`).join('')}
    </select>
    <div class="spacer"></div>
    <button class="btn btn-danger btn-sm" onclick="clearLogs()">${icon('trash')} Xóa nhật ký</button>
  </div>
  <div class="card list-wrap">
    <div class="table-wrap">
    <table>
      <thead><tr><th>Thời gian</th><th>Người dùng</th><th>Hành động</th><th>Đối tượng</th><th>Nội dung</th></tr></thead>
      <tbody id="logRows">${logRows()}</tbody>
    </table>
    </div>
  </div>`;
}

function logRows() {
  const v = viewState.logs;
  const usernames = [...new Set(state.logs.map(l => l.username))];
  const ql = v.q.trim().toLowerCase();
  const list = [...state.logs].reverse()
    .filter(l => v.user === 'all' || l.username === v.user)
    .filter(l => v.action === 'all' || l.action === v.action)
    .filter(l => !ql || [l.target, l.username, ENTITY_LABEL[l.entity]].some(x => String(x || '').toLowerCase().includes(ql)))
    .slice(0, 200);
  if (!list.length) return emptyRow(5, 'Chưa có nhật ký nào');
  return list.map(l => {
    const a = LOG_ACTIONS[l.action] || [l.action, 'b-inactive'];
    return `<tr>
      <td class="money-muted" style="white-space:nowrap">${fmtDateTime(l.ts)}</td>
      <td class="cell-main">${esc(l.username)}</td>
      <td><span class="badge ${a[1]}">${a[0]}</span></td>
      <td class="money-muted">${ENTITY_LABEL[l.entity] || l.entity}</td>
      <td>${esc(l.target)}</td>
    </tr>`;
  }).join('');
}
function renderLogRows() { $('#logRows').innerHTML = logRows(); }

function clearLogs() {
  confirmDialog('Xóa toàn bộ nhật ký?', 'Mọi ghi chép thao tác sẽ bị xóa vĩnh viễn.', 'Xóa hết', () => {
    state.logs = [];
    save(); render(); toast('Đã xóa nhật ký');
  });
}

/* ---- Ép đổi mật khẩu lần đầu / khi admin cấp lại ---- */
function showChangePwd() {
  const u = currentUser();
  if (!u) return;
  $('#pwdUser').textContent = u.username;
  $('#cpError').style.display = 'none';
  $('#cpPass').value = ''; $('#cpPass2').value = '';
  $('#pwdScreen').classList.add('show');
  setTimeout(() => { const el = $('#cpPass'); if (el) el.focus(); }, 60);
}

async function submitChangePwd() {
  const u = currentUser();
  if (!u) return;
  const p1 = $('#cpPass').value, p2 = $('#cpPass2').value;
  const err = $('#cpError');
  const fail = m => { err.textContent = m; err.style.display = 'flex'; };
  if (p1.length < 4) return fail('Mật khẩu tối thiểu 4 ký tự');
  if (p1 !== p2) return fail('Hai mật khẩu không khớp nhau');
  u.passHash = await hashPassword(p1);
  u.mustChangePwd = false;
  logAction('update', 'user', u.username + ' đổi mật khẩu bắt buộc lần đầu');
  save();
  $('#pwdScreen').classList.remove('show');
  toast('Đã đặt mật khẩu mới — chào mừng ' + u.name + '!');
}

/* ================= INIT ================= */
async function init() {
  await detectServer();
  if (SERVER_MODE && !API_TOKEN) {
    try {
      const r = await fetch('/api/has-users');
      if (r.ok) { const j = await r.json(); __serverHasUsers = j.users > 0; __serverStudioName = j.studioName || ''; }
    } catch (e) { }
  }
  let loaded = false;
  if (SERVER_MODE && API_TOKEN) {
    try { adoptState(await loadFromServer()); loaded = true; }
    catch (e) {
      if (e && e.status === 401) {
        // Server còn sống nhưng phiên hết hạn → vào lại màn đăng nhập (KHÔNG rơi chế độ offline)
        localStorage.removeItem(SESSION_KEY); API_TOKEN = '';
      } else SERVER_MODE = false; // chỉ offline khi server không phản hồi (mạng/đang ngủ)
    }
  }
  if (!loaded) load();
  const d = new Date();
  calY = d.getFullYear(); calM = d.getMonth();
  document.title = state.settings.studioName + ' — CRM';
  // (đồng hồ live ở topbar tự chạy — startLiveClock trong renderTopbarAttendance)

  let sid = null;
  try { sid = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { sid = null; }
  const u = sid ? byId(state.users, sid.userId) : null;
  if (u && u.active) { startApp(u.id, false); startServerPoll(); }
  else { localStorage.removeItem(SESSION_KEY); showAuth(); }

  // Server có thể đang ngủ (Render free) → thử lại nền mỗi 10 giây; khi thức dậy thì đổi sang form Đăng nhập
  if (!SERVER_MODE && !state.users.length) {
    (async () => {
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 10000));
        try {
          const r2 = await fetch('/api/ping');
          const j = await r2.json().catch(() => null);
          if (j && j.ok) {
            SERVER_MODE = true;
            try {
              const h = await fetch('/api/has-users');
              if (h.ok) { const hj = await h.json(); __serverHasUsers = hj.users > 0; __serverStudioName = hj.studioName || ''; }
            } catch (e) { }
            renderAuthForm();
            return;
          }
        } catch (e) { }
      }
    })();
  }

  window.addEventListener('hashchange', () => {
    const v = (location.hash || '').replace('#', '');
    if (v.startsWith('portal-')) {
      closeModal();
      $('#authScreen').classList.remove('show');
      $('#portalScreen').classList.add('show');
      renderPortalScreen(v.slice(7));
      return;
    }
    $('#portalScreen').classList.remove('show');
    if (VIEWS[v] && v !== currentView && can(v)) { currentView = v; render(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  window.addEventListener('beforeunload', flushStateBeacon);

  const h0 = (location.hash || '').replace('#', '');
  if (h0.startsWith('portal-')) {
    $('#portalScreen').classList.add('show');
    renderPortalScreen(h0.slice(7));
    return;
  }
}

init();

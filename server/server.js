/* ============================================================
   STUDIO MANAGER — Backend Node.js + PostgreSQL
   Chạy nhiều máy dùng chung dữ liệu:
     cd server && npm install && npm start  →  http://localhost:8090
   Cần PostgreSQL đang chạy và database trống tên studio_manager:
     brew install postgresql && brew services start postgresql
     createdb studio_manager
   Đổi chuỗi kết nối qua biến môi trường DATABASE_URL nếu cần.
   ============================================================ */
'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const PORT = process.env.PORT || 8090;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/studio_manager';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: /sslmode=require|neon\.tech|render\.com/.test(DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
});
const app = express();
app.use(express.json({ limit: '10mb' })); // đọc JSON body cho mọi API POST (lỗi từng quên dòng này → không lưu gì được lên server)

// Phiên đăng nhập lưu trong DATABASE — sống qua mọi lần server khởi động lại (Render free hay restart)
async function authUser(req) {
  const token = (req.body && req.body.token) || req.query.token;
  if (!token) return null;
  try {
    const r = await pool.query('SELECT user_id FROM sessions WHERE token = $1', [token]);
    return r.rows[0] ? r.rows[0].user_id : null;
  } catch (e) { return null; }
}

// Phải trùng tiền tố băm với frontend (js/app.js → hashPassword)
function sha256(s) {
  return crypto.createHash('sha256').update('mcrm:' + s).digest('hex');
}

async function getState() {
  const r = await pool.query('SELECT data FROM app_state WHERE id = 1');
  return r.rows[0] ? r.rows[0].data : null;
}

async function setState(data) {
  const r = await pool.query(
    `INSERT INTO app_state (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()
     RETURNING updated_at`,
    [JSON.stringify(data)]
  );
  return r.rows[0] ? r.rows[0].updated_at : null;
}

// ---- API ----

// Frontend dùng endpoint này để tự dò có đang chạy chế độ server hay không
app.get('/api/ping', (req, res) => res.json({ ok: true, mode: 'server', time: new Date().toISOString() }));

// Máy mới chưa đăng nhập cần biết server đã có tài khoản chưa (hiện Đăng nhập thay vì Đăng ký)
app.get('/api/has-users', async (req, res) => {
  try {
    const st = await getState();
    res.json({
      ok: true,
      users: (st && Array.isArray(st.users)) ? st.users.length : 0,
      studioName: ((st && st.settings) || {}).studioName || '',
    });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ: ' + e.message }); }
});

// Đăng nhập: kiểm tra mật khẩu PHÍA SERVER, cấp token
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const st = await getState();
    const users = (st && st.users) || [];
    const u = users.find(x => String(x.username || '').toLowerCase() === String(username || '').toLowerCase());
    if (!u || u.passHash !== sha256(String(password || ''))) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    if (!u.active) return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
    const token = crypto.randomUUID();
    await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, u.id]);
    res.json({ ok: true, token, userId: u.id });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi máy chủ: ' + e.message });
  }
});

app.post('/api/logout', async (req, res) => {
  const token = (req.body && req.body.token) || req.query.token;
  if (token) { try { await pool.query('DELETE FROM sessions WHERE token = $1', [token]); } catch (e) { } }
  res.json({ ok: true });
});

// Lấy toàn bộ dữ liệu (đã đăng nhập)
app.get('/api/state', async (req, res) => {
  if (!(await authUser(req))) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try { res.json((await getState()) || {}); }
  catch (e) { res.status(500).json({ error: 'Lỗi máy chủ: ' + e.message }); }
});

// Phiên bản dữ liệu (nhẹ) — các máy poll để biết khi nào cần kéo dữ liệu mới
app.get('/api/state-version', async (req, res) => {
  if (!(await authUser(req))) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const r = await pool.query('SELECT updated_at FROM app_state WHERE id = 1');
    res.json({ ok: true, v: r.rows[0] ? r.rows[0].updated_at : null });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ: ' + e.message }); }
});

// Lưu toàn bộ dữ liệu (đã đăng nhập).
// Ngoại lệ bootstrap: khi server CHƯA có tài khoản nào thì cho phép ghi không token
// (để máy đầu tiên đăng ký tài khoản quản trị).
app.post('/api/state', async (req, res) => {
  try {
    const st = await getState();
    const noUsersYet = !st || !Array.isArray(st.users) || st.users.length === 0;
    const body = req.body || {};
    if (!body.state || !Array.isArray(body.state.customers)) {
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }
    if (!(await authUser(req)) && !noUsersYet) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const v = await setState(body.state);
    res.json({ ok: true, v });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi máy chủ: ' + e.message });
  }
});

// ---- Cổng khách hàng — public, truy cập theo token (không cần đăng nhập) ----
app.get('/api/portal/:token', async (req, res) => {
  try {
    const st = await getState();
    const b = ((st && st.bookings) || []).find(x => x.portalToken === req.params.token);
    if (!b) return res.status(404).json({ error: 'Liên kết không hợp lệ' });
    const cust = (st.customers || []).find(c => c.id === b.customerId) || {};
    const pkg = (st.packages || []).find(p => p.id === b.packageId) || {};
    const o = (st.orders || []).find(x => x.bookingId === b.id);
    const total = o ? Math.max(0, o.items.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0) - (+o.discount || 0)) : 0;
    res.json({
      studioName: ((st || {}).settings || {}).studioName || 'Studio',
      customerName: cust.name || '', pkgName: pkg.name || '',
      date: b.date, startTime: b.startTime, location: b.location, status: b.status,
      gallery: b.gallery || { photos: [], allowSelect: false },
      pay: o ? { paid: +o.paidAmount || 0, total } : null,
    });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ: ' + e.message }); }
});

app.post('/api/portal-select', async (req, res) => {
  try {
    const st = await getState();
    const body = req.body || {};
    const b = ((st && st.bookings) || []).find(x => x.portalToken === body.token);
    if (!b) return res.status(404).json({ error: 'Liên kết không hợp lệ' });
    const ids = body.ids || [];
    const notes = body.notes || {};
    ((b.gallery && b.gallery.photos) || []).forEach(p => {
      p.selected = ids.includes(p.id);
      if (Object.prototype.hasOwnProperty.call(notes, p.id)) p.note = String(notes[p.id] || '').slice(0, 300);
    });
    await setState(st);
    res.json({ ok: true, selected: ids.length });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ: ' + e.message }); }
});

// Ai đang hoạt động — app gửi heartbeat mỗi phút, lưu DB
app.post('/api/presence', async (req, res) => {
  const uid2 = await authUser(req);
  if (!uid2) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    await pool.query(`INSERT INTO presence (user_id, last_seen) VALUES ($1, now())
      ON CONFLICT (user_id) DO UPDATE SET last_seen = now()`, [uid2]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ: ' + e.message }); }
});

app.get('/api/presence', async (req, res) => {
  if (!(await authUser(req))) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const r = await pool.query('SELECT user_id, last_seen FROM presence');
    res.json({ ok: true, list: r.rows.map(x => ({ userId: x.user_id, lastSeen: x.last_seen })) });
  } catch (e) { res.status(500).json({ error: 'Lỗi máy chủ: ' + e.message }); }
});

// ---- Phục vụ frontend (thư mục gốc của project) ----
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

(async () => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS app_state (
      id int PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
      token text PRIMARY KEY,
      user_id text NOT NULL,
      created_at timestamptz DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS presence (
      user_id text PRIMARY KEY,
      last_seen timestamptz DEFAULT now()
    )`);
    app.listen(PORT, () => {
      console.log('');
      console.log('  ✅ Studio Manager server đang chạy:');
      console.log(`     • Máy này:   http://localhost:${PORT}`);
      console.log(`     • Máy khác:  http://<IP-máy-này>:${PORT} (cùng WiFi/LAN)`);
      console.log(`     • PostgreSQL: ${DATABASE_URL}`);
      console.log('');
    });
  } catch (e) {
    console.error('');
    console.error('  ❌ Không kết nối được PostgreSQL:', e.message);
    console.error('     Hãy cài và khởi động PostgreSQL rồi tạo database:');
    console.error('       brew install postgresql@16');
    console.error('       brew services start postgresql@16');
    console.error('       createdb studio_manager');
    console.error('     (hoặc đặt biến môi trường DATABASE_URL trỏ tới server có sẵn)');
    console.error('');
    process.exit(1);
  }
})();

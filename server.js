/**
 * WIN.X.KING — Server v4.0
 * Firebase Firestore storage — data never wipes
 * Plans: 299 / 599 / 999 / 1499
 */

const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 10000;
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

// ══════════════════════════════════════════════════════════════
// FIREBASE INIT — reads FIREBASE_SERVICE_ACCOUNT env var
// ══════════════════════════════════════════════════════════════
let db = null;

function initFirebase() {
  try {
    const admin = require('firebase-admin');
    if (admin.apps.length > 0) { db = admin.firestore(); return true; }

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
    if (!raw) { console.error('❌ FIREBASE_SERVICE_ACCOUNT not set'); return false; }

    const sa = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    db = admin.firestore();
    console.log('✅ Firebase connected:', sa.project_id);
    return true;
  } catch(e) {
    console.error('❌ Firebase init failed:', e.message);
    return false;
  }
}

const FB_OK = initFirebase();

// ══════════════════════════════════════════════════════════════
// DB HELPERS
// ══════════════════════════════════════════════════════════════
const COL = {
  pwd:   () => db.collection('wxk_passwords'),
  meta:  (doc) => db.collection('wxk_meta').doc(doc),
};

async function getPwd(code) {
  if (!db) return null;
  try { const s = await COL.pwd().doc(code).get(); return s.exists ? { ...s.data(), code: s.id } : null; } catch(e) { return null; }
}
async function savePwd(code, data) { await COL.pwd().doc(code).set(data, { merge: true }); }
async function getMeta(doc) {
  try { const s = await COL.meta(doc).get(); return s.exists ? s.data() : null; } catch(e) { return null; }
}
async function setMeta(doc, data) { await COL.meta(doc).set(data); }

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
const rl = {};
function rateLimit(ip, key, max, ms) {
  const k = ip + ':' + key, now = Date.now();
  if (!rl[k] || now - rl[k].s > ms) { rl[k] = { c: 1, s: now }; return false; }
  return ++rl[k].c > max;
}
setInterval(() => { const n = Date.now(); Object.keys(rl).forEach(k => { if (n - rl[k].s > 600000) delete rl[k]; }); }, 600000);

function getIP(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown'; }
function auth(req) { const p = process.env.ADMIN_PASS; return !!(p && req.headers['x-pass'] === p); }

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) { if (i === 4) s += '-'; s += c[Math.floor(Math.random() * c.length)]; }
  return s;
}

// ══════════════════════════════════════════════════════════════
// PLANS
// Plan 299  → 7 days,  2 locations, 2 single + 8 spot = 20 total per plan
// Plan 599  → 15 days, 3 locations, 2 single + 8 spot = 30 total per plan
// Plan 999  → 30 days, 4 locations, 2 single + 8 spot = 40 total per plan
// Plan 1499 → 60 days, 4 locations, 2 single + 8 spot + 4 extra single = 44 total
// ══════════════════════════════════════════════════════════════
const PLANS = {
  '299':  { price: 299,  days: 7,  locations: 2, label: 'SILVER',  extraSingle: 0 },
  '599':  { price: 599,  days: 15, locations: 3, label: 'GOLD',    extraSingle: 0 },
  '999':  { price: 999,  days: 30, locations: 4, label: 'DIAMOND', extraSingle: 0 },
  '1499': { price: 1499, days: 60, locations: 4, label: 'ROYAL',   extraSingle: 4 },
};

// ══════════════════════════════════════════════════════════════
// PUBLIC: / health check
// ══════════════════════════════════════════════════════════════
app.get('/', (req, res) => res.json({ ok: true, status: 'WIN.X.KING v4', firebase: FB_OK ? 'connected' : 'not configured' }));

// ══════════════════════════════════════════════════════════════
// PUBLIC: /access — login with code
// ══════════════════════════════════════════════════════════════
app.post('/access', async (req, res) => {
  if (!FB_OK) return res.status(503).json({ ok: false, msg: 'Server configuration error' });
  const ip = getIP(req);
  if (rateLimit(ip, 'access', 10, 60000)) return res.json({ ok: false, msg: 'Bahut zyada attempts. 1 min ruko.' });

  const { code, deviceId } = req.body;
  if (!code) return res.json({ ok: false, msg: 'Code daalo' });
  const clean = code.trim().toUpperCase();

  try {
    const pwd = await getPwd(clean);
    if (!pwd) return res.json({ ok: false, msg: 'Galat code — Telegram pe contact karo' });
    const now = Date.now();

    if (!pwd.used) {
      if (pwd.expiry < now) return res.json({ ok: false, msg: 'Code expire ho gaya — naya lo' });
      const userExpiry = now + (pwd.days * 86400000);
      await savePwd(clean, { used: true, activatedAt: now, userExpiry, deviceId: deviceId || null, sessionActive: true, lastSeen: now });
      const today = await getMeta('today');
      const ad    = await getMeta('ad');
      const plan  = PLANS[String(pwd.price)] || PLANS['999'];
      return res.json({ ok: true, daysLeft: pwd.days, plan, hasPrediction: !!today, prediction: today || null, ad: (ad && ad.enabled) ? ad : null });
    }

    // Re-login
    if (pwd.deviceId && deviceId && pwd.deviceId !== deviceId)
      return res.json({ ok: false, msg: 'Ye code doosre phone pe use ho chuka hai. Naya lo — Telegram pe aao' });
    if (!pwd.userExpiry || pwd.userExpiry < now)
      return res.json({ ok: false, msg: 'Access expire ho gaya — naya code lo' });

    const upd = { sessionActive: true, lastSeen: now };
    if (!pwd.deviceId && deviceId) upd.deviceId = deviceId;
    await savePwd(clean, upd);

    const daysLeft = Math.ceil((pwd.userExpiry - now) / 86400000);
    const plan  = PLANS[String(pwd.price)] || PLANS['999'];
    const today = await getMeta('today');
    const ad    = await getMeta('ad');
    return res.json({ ok: true, daysLeft, plan, hasPrediction: !!today, prediction: today || null, ad: (ad && ad.enabled) ? ad : null });
  } catch(e) {
    console.error('/access:', e.message);
    return res.status(500).json({ ok: false, msg: 'Server error. Dobara try karo.' });
  }
});

// ══════════════════════════════════════════════════════════════
// PUBLIC: /verify — silent session check
// ══════════════════════════════════════════════════════════════
app.post('/verify', async (req, res) => {
  if (!FB_OK) return res.json({ ok: false });
  if (rateLimit(getIP(req), 'verify', 20, 60000)) return res.json({ ok: false });
  const { code, deviceId } = req.body;
  if (!code) return res.json({ ok: false });
  const clean = code.trim().toUpperCase();

  try {
    const pwd = await getPwd(clean);
    if (!pwd || !pwd.used) return res.json({ ok: false, msg: 'Session expire — dobara login karo' });
    const now = Date.now();
    if (pwd.sessionActive === false) return res.json({ ok: false, msg: 'Session expire — dobara login karo' });
    if (!pwd.userExpiry || pwd.userExpiry < now) return res.json({ ok: false, msg: 'Access expire ho gaya — naya code lo' });
    if (pwd.deviceId && deviceId && pwd.deviceId !== deviceId) return res.json({ ok: false, msg: 'Device mismatch' });

    await savePwd(clean, { lastSeen: now });
    const daysLeft = Math.ceil((pwd.userExpiry - now) / 86400000);
    const plan  = PLANS[String(pwd.price)] || PLANS['999'];
    const today = await getMeta('today');
    const ad    = await getMeta('ad');
    return res.json({ ok: true, daysLeft, plan, hasPrediction: !!today, prediction: today || null, ad: (ad && ad.enabled) ? ad : null });
  } catch(e) {
    return res.status(500).json({ ok: false });
  }
});

app.get('/ad', async (req, res) => {
  const ad = await getMeta('ad');
  res.json({ ok: true, ad: (ad && ad.enabled) ? ad : null });
});

// ══════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════
app.get('/admin/data', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false, msg: 'Password galat hai' });
  if (!FB_OK) return res.status(503).json({ ok: false, msg: 'Firebase not configured' });
  try {
    const [snap, today, ad, stats] = await Promise.all([
      COL.pwd().get(), getMeta('today'), getMeta('ad'), getMeta('stats')
    ]);
    const passwords = snap.docs.map(d => ({ ...d.data(), code: d.id }));
    const now = Date.now();
    return res.json({
      ok: true, passwords,
      today: today || null, ad: ad || null,
      sold: stats?.sold || passwords.filter(p => p.used).length,
      revenue: stats?.revenue || 0,
      active: passwords.filter(p => p.used && p.userExpiry > now).length,
    });
  } catch(e) {
    console.error('/admin/data:', e.message);
    return res.status(500).json({ ok: false, msg: 'Firebase error: ' + e.message });
  }
});

// Set today's prediction — plan-wise locations
app.post('/admin/predict', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  const { locations, extraSingle } = req.body;
  // locations = array of { name, single:[n,n], spot:[n,n,n,n,n,n,n,n] }
  // extraSingle = [n,n,n,n] for Royal plan only
  try {
    const pred = {
      date: new Date().toLocaleDateString('en-IN'),
      locations: locations || [],
      extraSingle: extraSingle || [],
      savedAt: Date.now(),
    };
    await setMeta('today', pred);
    res.json({ ok: true, prediction: pred });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

app.delete('/admin/today', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  try { await COL.meta('today').delete(); res.json({ ok: true }); } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// Generate access code
app.post('/admin/pwd', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  const { name = 'User', price = 999 } = req.body;
  const plan = PLANS[String(price)] || PLANS['999'];
  try {
    const code = genCode(), now = Date.now();
    await COL.pwd().doc(code).set({
      code, name, price: plan.price, days: plan.days,
      createdAt: now, expiry: now + (30 * 86400000),
      used: false, userExpiry: null, deviceId: null,
      sessionActive: false, activatedAt: null, lastSeen: null,
    });
    const stats = await getMeta('stats') || { sold: 0, revenue: 0 };
    await setMeta('stats', { sold: (stats.sold || 0) + 1, revenue: (stats.revenue || 0) + plan.price });
    res.json({ ok: true, code, price: plan.price, days: plan.days, label: plan.label, name });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

app.delete('/admin/pwd/:code', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  try { await COL.pwd().doc(req.params.code.toUpperCase()).delete(); res.json({ ok: true }); } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

app.post('/admin/logout/:code', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  try {
    const pwd = await getPwd(req.params.code.toUpperCase());
    if (!pwd) return res.json({ ok: false, msg: 'Code nahi mila' });
    await savePwd(req.params.code.toUpperCase(), { sessionActive: false, deviceId: null });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

app.get('/admin/ad', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  const ad = await getMeta('ad'); res.json({ ok: true, ad: ad || null });
});

app.post('/admin/ad', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  const { enabled, text, link, label } = req.body;
  try {
    const ad = { enabled: !!enabled, text: text || '', link: link || '', label: label || 'Contact Karo', updatedAt: Date.now() };
    await setMeta('ad', ad); res.json({ ok: true, ad });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

app.delete('/admin/ad', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  try { await COL.meta('ad').delete(); res.json({ ok: true }); } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

app.use((req, res) => res.status(404).json({ ok: false, msg: 'Not found' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WIN.X.KING v4 | Port:${PORT} | Firebase:${FB_OK ? 'OK' : 'NOT SET'} | AdminPass:${process.env.ADMIN_PASS ? 'SET' : 'NOT SET'}`);
});

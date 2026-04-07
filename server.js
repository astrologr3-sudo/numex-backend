/**
 * WIN.X.KING — Server v4.1 (FIXED)
 * Firebase Firestore — permanent storage
 * Plans: 299/599/999/1499
 *
 * FIREBASE SETUP:
 * Render env var: FIREBASE_SERVICE_ACCOUNT = (paste entire JSON content of service account file)
 * Render env var: ADMIN_PASS = your admin password
 */

const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 10000;
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

// ══════════════════════════════════════════════════════════════
// FIREBASE INIT
// ══════════════════════════════════════════════════════════════
let db = null;

function initFirebase() {
  try {
    const admin = require('firebase-admin');
    if (admin.apps.length > 0) { db = admin.firestore(); return true; }
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
    if (!raw) { console.error('❌ FIREBASE_SERVICE_ACCOUNT env var not set'); return false; }
    const sa = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    db = admin.firestore();
    console.log('✅ Firebase OK:', sa.project_id);
    return true;
  } catch(e) {
    console.error('❌ Firebase init error:', e.message);
    return false;
  }
}
const FB_OK = initFirebase();

// ══════════════════════════════════════════════════════════════
// DB HELPERS
// ══════════════════════════════════════════════════════════════
function COL_pwd()       { return db.collection('wxk_passwords'); }
function DOC_meta(name)  { return db.collection('wxk_meta').doc(name); }

async function getPwd(code) {
  if (!db) return null;
  try {
    const s = await COL_pwd().doc(code).get();
    return s.exists ? { ...s.data(), code: s.id } : null;
  } catch(e) { return null; }
}
async function savePwd(code, data) {
  await COL_pwd().doc(code).set(data, { merge: true });
}
async function getMeta(name) {
  try {
    const s = await DOC_meta(name).get();
    return s.exists ? s.data() : null;
  } catch(e) { return null; }
}
async function setMeta(name, data) {
  await DOC_meta(name).set(data);
}

// ══════════════════════════════════════════════════════════════
// PLANS
// ══════════════════════════════════════════════════════════════
const PLANS = {
  '299':  { price: 299,  days: 7,  locations: 2, label: 'SILVER'  },
  '599':  { price: 599,  days: 15, locations: 3, label: 'GOLD'    },
  '999':  { price: 999,  days: 30, locations: 4, label: 'DIAMOND' },
  '1499': { price: 1499, days: 60, locations: 4, label: 'ROYAL'   },
};

// Prediction key per plan label (must match user-app.html)
const PLAN_KEY = { SILVER: 'plan299', GOLD: 'plan599', DIAMOND: 'plan999', ROYAL: 'plan1499' };

// ══════════════════════════════════════════════════════════════
// RATE LIMITING
// ══════════════════════════════════════════════════════════════
const rl = {};
function rateLimit(ip, key, max, ms) {
  const k = ip + ':' + key, now = Date.now();
  if (!rl[k] || now - rl[k].s > ms) { rl[k] = { c: 1, s: now }; return false; }
  return ++rl[k].c > max;
}
setInterval(() => {
  const n = Date.now();
  Object.keys(rl).forEach(k => { if (n - rl[k].s > 600000) delete rl[k]; });
}, 600000);

function getIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress || 'unknown';
}

function auth(req) {
  const p = process.env.ADMIN_PASS;
  if (!p) return false; // ADMIN_PASS must be set in Render
  return req.headers['x-pass'] === p;
}

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) { if (i === 4) s += '-'; s += c[Math.floor(Math.random() * c.length)]; }
  return s;
}

// ══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ══════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({ ok: true, status: 'WIN.X.KING v4.1', firebase: FB_OK ? 'OK' : 'NOT SET' });
});

// ══════════════════════════════════════════════════════════════
// PUBLIC: /access — user enters code
// ══════════════════════════════════════════════════════════════
app.post('/access', async (req, res) => {
  if (!FB_OK) return res.status(503).json({ ok: false, msg: 'Server config error' });
  const ip = getIP(req);
  if (rateLimit(ip, 'access', 10, 60000))
    return res.json({ ok: false, msg: 'Bahut zyada attempts. 1 min ruko.' });

  const { code, deviceId } = req.body;
  if (!code) return res.json({ ok: false, msg: 'Code daalo' });
  // Normalize: remove all non-alphanum, uppercase, insert dash at position 4
  const raw = code.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
  const clean = raw.length === 8 ? raw.slice(0,4) + '-' + raw.slice(4) : code.trim().toUpperCase();

  try {
    const pwd = await getPwd(clean);
    if (!pwd) return res.json({ ok: false, msg: 'Galat code — Telegram pe contact karo' });

    const now = Date.now();
    const plan = PLANS[String(pwd.price)] || PLANS['999'];

    if (!pwd.used) {
      // First activation
      if (pwd.expiry < now)
        return res.json({ ok: false, msg: 'Code expire ho gaya — naya lo' });

      const userExpiry = now + (pwd.days * 86400000);
      await savePwd(clean, {
        used: true, activatedAt: now, userExpiry,
        deviceId: deviceId || null, sessionActive: true, lastSeen: now,
      });

      const [today, ad] = await Promise.all([getMeta('today'), getMeta('ad')]);
      const prediction = buildPrediction(today, plan.label);
      return res.json({
        ok: true, daysLeft: pwd.days, plan,
        hasPrediction: !!prediction, prediction,
        ad: (ad && ad.enabled) ? ad : null,
      });
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
    const [today, ad] = await Promise.all([getMeta('today'), getMeta('ad')]);
    const prediction = buildPrediction(today, plan.label);
    return res.json({
      ok: true, daysLeft, plan,
      hasPrediction: !!prediction, prediction,
      ad: (ad && ad.enabled) ? ad : null,
    });
  } catch(e) {
    console.error('/access error:', e.message);
    return res.status(500).json({ ok: false, msg: 'Server error. Dobara try karo.' });
  }
});

// ══════════════════════════════════════════════════════════════
// PUBLIC: /verify — silent session refresh
// ══════════════════════════════════════════════════════════════
app.post('/verify', async (req, res) => {
  if (!FB_OK) return res.json({ ok: false });
  if (rateLimit(getIP(req), 'verify', 20, 60000)) return res.json({ ok: false });

  const { code, deviceId } = req.body;
  if (!code) return res.json({ ok: false });
  const raw2 = code.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
  const clean = raw2.length === 8 ? raw2.slice(0,4) + '-' + raw2.slice(4) : code.trim().toUpperCase();

  try {
    const pwd = await getPwd(clean);
    if (!pwd || !pwd.used) return res.json({ ok: false, msg: 'Session expire — dobara login karo' });
    const now = Date.now();
    if (pwd.sessionActive === false) return res.json({ ok: false, msg: 'Session expire — dobara login karo' });
    if (!pwd.userExpiry || pwd.userExpiry < now) return res.json({ ok: false, msg: 'Access expire ho gaya — naya code lo' });
    if (pwd.deviceId && deviceId && pwd.deviceId !== deviceId) return res.json({ ok: false, msg: 'Device mismatch' });

    await savePwd(clean, { lastSeen: now });
    const daysLeft = Math.ceil((pwd.userExpiry - now) / 86400000);
    const plan = PLANS[String(pwd.price)] || PLANS['999'];
    const [today, ad] = await Promise.all([getMeta('today'), getMeta('ad')]);
    const prediction = buildPrediction(today, plan.label);
    return res.json({
      ok: true, daysLeft, plan,
      hasPrediction: !!prediction, prediction,
      ad: (ad && ad.enabled) ? ad : null,
    });
  } catch(e) {
    return res.status(500).json({ ok: false });
  }
});

// ══════════════════════════════════════════════════════════════
// HELPER: build prediction object for user
// today = full prediction doc from Firebase
// planLabel = 'SILVER' | 'GOLD' | 'DIAMOND' | 'ROYAL'
// Returns: { date, locations:[], extraSingle:[] } or null
// ══════════════════════════════════════════════════════════════
function buildPrediction(today, planLabel) {
  if (!today) return null;
  const pk = PLAN_KEY[planLabel] || 'plan999';
  const planData = today[pk];
  if (!planData || !planData.locations || !planData.locations.length) return null;
  return {
    date:        today.date,
    locations:   planData.locations,
    extraSingle: planLabel === 'ROYAL' ? (today.extraSingle || []) : [],
  };
}

// Public ad
app.get('/ad', async (req, res) => {
  const ad = await getMeta('ad');
  res.json({ ok: true, ad: (ad && ad.enabled) ? ad : null });
});

// ══════════════════════════════════════════════════════════════
// ADMIN: /admin/data
// ══════════════════════════════════════════════════════════════
app.get('/admin/data', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false, msg: 'Password galat hai' });
  if (!FB_OK) return res.status(503).json({ ok: false, msg: 'Firebase not configured' });
  try {
    const [snap, today, ad, stats] = await Promise.all([
      COL_pwd().get(), getMeta('today'), getMeta('ad'), getMeta('stats')
    ]);
    const passwords = snap.docs.map(d => ({ ...d.data(), code: d.id }));
    const now = Date.now();
    return res.json({
      ok: true, passwords,
      today: today || null,
      ad: ad || null,
      sold:    stats?.sold    || passwords.filter(p => p.used).length,
      revenue: stats?.revenue || 0,
      active:  passwords.filter(p => p.used && p.userExpiry > now).length,
    });
  } catch(e) {
    console.error('/admin/data error:', e.message);
    return res.status(500).json({ ok: false, msg: 'Firebase error: ' + e.message });
  }
});

// ══════════════════════════════════════════════════════════════
// ADMIN: /admin/predict — save plan-wise predictions
// Admin sends: { plan299, plan599, plan999, plan1499, extraSingle }
// Each plan: { locations: [ { name, single:[], spots:[[],[]] } ] }
// ══════════════════════════════════════════════════════════════
app.post('/admin/predict', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  const { plan299, plan599, plan999, plan1499, extraSingle } = req.body;
  try {
    const pred = {
      date:       new Date().toLocaleDateString('en-IN'),
      plan299:    plan299  || null,
      plan599:    plan599  || null,
      plan999:    plan999  || null,
      plan1499:   plan1499 || null,
      extraSingle: (extraSingle || []).slice(0, 4),
      savedAt:    Date.now(),
    };
    await setMeta('today', pred);
    res.json({ ok: true, prediction: pred });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// ADMIN: clear prediction
app.delete('/admin/today', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  try { await DOC_meta('today').delete(); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// ADMIN: /admin/pwd — generate access code
// Admin sends: { name, price } — price = 299|599|999|1499
// ══════════════════════════════════════════════════════════════
app.post('/admin/pwd', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  const { name = 'User', price = 999 } = req.body;
  const plan = PLANS[String(price)] || PLANS['999'];
  try {
    const code = genCode(), now = Date.now();
    await COL_pwd().doc(code).set({
      code, name,
      price: plan.price, days: plan.days, label: plan.label,
      createdAt: now,
      expiry: now + (30 * 86400000), // 30-day window to activate
      used: false, userExpiry: null, deviceId: null,
      sessionActive: false, activatedAt: null, lastSeen: null,
    });
    const stats = await getMeta('stats') || { sold: 0, revenue: 0 };
    await setMeta('stats', { sold: (stats.sold || 0) + 1, revenue: (stats.revenue || 0) + plan.price });
    res.json({ ok: true, code, price: plan.price, days: plan.days, label: plan.label, name });
  } catch(e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// ADMIN: delete code
app.delete('/admin/pwd/:code', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  try {
    await COL_pwd().doc(req.params.code.toUpperCase()).delete();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ADMIN: force logout user
app.post('/admin/logout/:code', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  try {
    const pwd = await getPwd(req.params.code.toUpperCase());
    if (!pwd) return res.json({ ok: false, msg: 'Code nahi mila' });
    await savePwd(req.params.code.toUpperCase(), { sessionActive: false, deviceId: null });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ADMIN: get ad
app.get('/admin/ad', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  const ad = await getMeta('ad');
  res.json({ ok: true, ad: ad || null });
});

// ADMIN: save ad
app.post('/admin/ad', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  const { enabled, text, link, label } = req.body;
  try {
    const ad = { enabled: !!enabled, text: text || '', link: link || '', label: label || 'Contact Karo', updatedAt: Date.now() };
    await setMeta('ad', ad);
    res.json({ ok: true, ad });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ADMIN: delete ad
app.delete('/admin/ad', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok: false });
  try { await DOC_meta('ad').delete(); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// 404
app.use((req, res) => res.status(404).json({ ok: false, msg: 'Not found' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WIN.X.KING v4.1 | Port:${PORT} | Firebase:${FB_OK ? 'OK' : 'NOT CONFIGURED'} | Admin:${process.env.ADMIN_PASS ? 'SET' : 'NOT SET — SET ADMIN_PASS IN RENDER!'}`);
});

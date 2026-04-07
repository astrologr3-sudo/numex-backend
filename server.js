const express = require('express');
const cors    = require('cors');
const app     = express();
const PORT    = process.env.PORT || 10000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

// ─── FIREBASE INIT ────────────────────────────────────────
let db = null;
(function() {
  try {
    const admin = require('firebase-admin');
    if (admin.apps.length > 0) { db = admin.firestore(); return; }
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
    if (!raw) { console.error('❌ FIREBASE_SERVICE_ACCOUNT not set in Render!'); return; }
    const sa = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    db = admin.firestore();
    console.log('✅ Firebase connected:', sa.project_id);
  } catch(e) {
    console.error('❌ Firebase init FAILED:', e.message);
  }
})();

// ─── DB REFS ──────────────────────────────────────────────
const COL  = () => db.collection('wxk_passwords');
const META = (n) => db.collection('wxk_meta').doc(n);

// ─── DB HELPERS ───────────────────────────────────────────

async function getPwd(code) {
  const s = await COL().doc(code).get();
  if (!s.exists) return null;
  return { ...s.data(), code: s.id };
}

async function savePwd(code, data) {
  await COL().doc(code).set(data, { merge: true });
}

async function getMeta(name) {
  try {
    const s = await META(name).get();
    if (!s.exists) return null;
    const d = s.data();
    if (name === 'today' && d && d._json) {
      try { return JSON.parse(d._json); } catch(e) { return null; }
    }
    return d;
  } catch(e) {
    console.error('[getMeta]', name, e.message);
    return null;
  }
}

async function setMeta(name, data) {
  await META(name).set(data);
}

// ─── PLANS ────────────────────────────────────────────────
const PLANS = {
  '299':  { price: 299,  days: 7,  locations: 2, label: 'SILVER'  },
  '599':  { price: 599,  days: 15, locations: 3, label: 'GOLD'    },
  '999':  { price: 999,  days: 30, locations: 4, label: 'DIAMOND' },
  '1499': { price: 1499, days: 60, locations: 4, label: 'ROYAL'   },
};
const PLAN_KEY = { SILVER:'plan299', GOLD:'plan599', DIAMOND:'plan999', ROYAL:'plan1499' };

// ─── HELPERS ──────────────────────────────────────────────
function auth(req) {
  const p = process.env.ADMIN_PASS;
  if (!p) { console.error('❌ ADMIN_PASS not set in Render! Set it in Environment variables.'); return false; }
  return req.headers['x-pass'] === p;
}

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) { if (i === 4) s += '-'; s += c[Math.floor(Math.random() * c.length)]; }
  return s;
}

// BUG FIX: Code normalize karo — dono formats support karo
// 'ABCDEFGH' (8 chars, no hyphen) → 'ABCD-EFGH'
// 'ABCD-EFGH' (9 chars, with hyphen) → 'ABCD-EFGH' (same)
function normalizeCode(raw) {
  if (!raw) return '';
  let code = raw.trim().toUpperCase().replace(/\s/g, '');
  // Remove any hyphens first, then re-insert at position 4
  const clean = code.replace(/-/g, '');
  if (clean.length === 8) {
    return clean.substring(0, 4) + '-' + clean.substring(4, 8);
  }
  // If already in XXXX-XXXX format (length 9)
  if (code.length === 9 && code[4] === '-') {
    return code;
  }
  // Fallback: return as-is (will fail getPwd with not found)
  return code;
}

function buildPrediction(today, planLabel) {
  if (!today) return null;
  const pk = PLAN_KEY[planLabel] || 'plan999';
  const pd = today[pk];
  if (!pd || !pd.locations || !pd.locations.length) return null;
  return {
    date:        today.date,
    locations:   pd.locations,
    extraSingle: planLabel === 'ROYAL' ? (today.extraSingle || []) : [],
  };
}

const _rl = {};
function rateLimit(ip, key, max, ms) {
  const k = ip+':'+key, now = Date.now();
  if (!_rl[k] || now - _rl[k].s > ms) { _rl[k] = { c:1, s:now }; return false; }
  return ++_rl[k].c > max;
}
setInterval(() => { const n = Date.now(); Object.keys(_rl).forEach(k => { if (n-_rl[k].s > 600000) delete _rl[k]; }); }, 600000);

function getIP(req) {
  return (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

// ─── HEALTH ───────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    ok: true, status: 'WIN.X.KING v4.3',
    firebase: db ? 'CONNECTED' : 'NOT CONFIGURED — Set FIREBASE_SERVICE_ACCOUNT in Render',
    adminPass: process.env.ADMIN_PASS ? 'SET' : 'NOT SET — Set ADMIN_PASS in Render',
  });
});

// ─── PUBLIC: /access ──────────────────────────────────────
app.post('/access', async (req, res) => {
  if (!db) return res.status(503).json({ ok:false, msg:'Server config error — Admin se contact karo' });
  if (rateLimit(getIP(req), 'access', 10, 60000))
    return res.json({ ok:false, msg:'Bahut zyada attempts. 1 min ruko.' });

  const { code, deviceId } = req.body;
  if (!code) return res.json({ ok:false, msg:'Code daalo' });

  // BUG FIX: Normalize code — ABCDEFGH aur ABCD-EFGH dono work karenge
  const clean = normalizeCode(code);
  console.log('[/access] Raw:', code, '→ Normalized:', clean);

  try {
    const pwd = await getPwd(clean);

    if (!pwd) return res.json({ ok:false, msg:'Galat code — Telegram pe contact karo' });

    const now  = Date.now();
    const plan = PLANS[String(pwd.price)] || PLANS['999'];

    if (!pwd.used) {
      // First activation
      if (pwd.expiry < now) return res.json({ ok:false, msg:'Code expire ho gaya — naya lo' });
      const userExpiry = now + (pwd.days * 86400000);
      await savePwd(clean, { used:true, activatedAt:now, userExpiry, deviceId:deviceId||null, sessionActive:true, lastSeen:now });
      const [today, ad] = await Promise.all([getMeta('today'), getMeta('ad')]);
      const prediction  = buildPrediction(today, plan.label);
      return res.json({ ok:true, daysLeft:pwd.days, plan, hasPrediction:!!prediction, prediction, ad:(ad&&ad.enabled)?ad:null });
    }

    // Re-login
    if (pwd.deviceId && deviceId && pwd.deviceId !== deviceId)
      return res.json({ ok:false, msg:'Ye code doosre phone pe use ho chuka hai. Naya lo — Telegram pe aao' });
    if (!pwd.userExpiry || pwd.userExpiry < now)
      return res.json({ ok:false, msg:'Access expire ho gaya — naya code lo' });

    const upd = { sessionActive:true, lastSeen:now };
    if (!pwd.deviceId && deviceId) upd.deviceId = deviceId;
    await savePwd(clean, upd);

    const daysLeft    = Math.ceil((pwd.userExpiry - now) / 86400000);
    const [today, ad] = await Promise.all([getMeta('today'), getMeta('ad')]);
    const prediction  = buildPrediction(today, plan.label);
    return res.json({ ok:true, daysLeft, plan, hasPrediction:!!prediction, prediction, ad:(ad&&ad.enabled)?ad:null });

  } catch(e) {
    console.error('[/access] REAL ERROR for code:', clean, '→', e.message);
    return res.status(500).json({ ok:false, msg:'Server error: ' + e.message });
  }
});

// ─── PUBLIC: /verify ──────────────────────────────────────
app.post('/verify', async (req, res) => {
  if (!db) return res.json({ ok:false });
  const { code, deviceId } = req.body;
  if (!code) return res.json({ ok:false });

  // BUG FIX: Normalize code here too
  const clean = normalizeCode(code);

  try {
    const pwd = await getPwd(clean);
    if (!pwd || !pwd.used)           return res.json({ ok:false, msg:'Session expire — dobara login karo' });
    if (pwd.sessionActive === false) return res.json({ ok:false, msg:'Session expire — dobara login karo' });
    const now = Date.now();
    if (!pwd.userExpiry || pwd.userExpiry < now) return res.json({ ok:false, msg:'Access expire ho gaya' });
    if (pwd.deviceId && deviceId && pwd.deviceId !== deviceId) return res.json({ ok:false, msg:'Device mismatch' });
    await savePwd(clean, { lastSeen:now });
    const daysLeft    = Math.ceil((pwd.userExpiry - now) / 86400000);
    const plan        = PLANS[String(pwd.price)] || PLANS['999'];
    const [today, ad] = await Promise.all([getMeta('today'), getMeta('ad')]);
    const prediction  = buildPrediction(today, plan.label);
    return res.json({ ok:true, daysLeft, plan, hasPrediction:!!prediction, prediction, ad:(ad&&ad.enabled)?ad:null });
  } catch(e) {
    console.error('[/verify] ERROR:', e.message);
    return res.json({ ok:false });
  }
});

// Public ad
app.get('/ad', async (req, res) => {
  const ad = await getMeta('ad');
  res.json({ ok:true, ad:(ad&&ad.enabled)?ad:null });
});

// ─── ADMIN: data ──────────────────────────────────────────
app.get('/admin/data', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false, msg:'Password galat hai' });
  if (!db)        return res.status(503).json({ ok:false, msg:'Firebase not configured' });
  try {
    const [snap, today, ad, stats] = await Promise.all([COL().get(), getMeta('today'), getMeta('ad'), getMeta('stats')]);
    const passwords = snap.docs.map(d => ({ ...d.data(), code:d.id }));
    const now = Date.now();
    return res.json({ ok:true, passwords, today:today||null, ad:ad||null,
      sold:stats?.sold||passwords.filter(p=>p.used).length,
      revenue:stats?.revenue||0,
      active:passwords.filter(p=>p.used&&p.userExpiry>now).length });
  } catch(e) {
    console.error('[/admin/data] ERROR:', e.message);
    return res.status(500).json({ ok:false, msg:'Firebase error: '+e.message });
  }
});

// ─── ADMIN: generate code ─────────────────────────────────
app.post('/admin/pwd', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false, msg:'Unauthorized' });
  if (!db)        return res.status(503).json({ ok:false, msg:'Firebase not configured' });
  const { name='User', price=999 } = req.body;
  const plan = PLANS[String(price)] || PLANS['999'];
  try {
    const code = genCode(), now = Date.now();
    await COL().doc(code).set({
      code, name, price:plan.price, days:plan.days, label:plan.label,
      createdAt:now, expiry:now+(30*86400000),
      used:false, userExpiry:null, deviceId:null, sessionActive:false, activatedAt:null, lastSeen:null,
    });
    const stats = await getMeta('stats') || { sold:0, revenue:0 };
    await setMeta('stats', { sold:(stats.sold||0)+1, revenue:(stats.revenue||0)+plan.price });
    console.log('[/admin/pwd] Code created:', code, plan.label, '₹'+plan.price);
    res.json({ ok:true, code, price:plan.price, days:plan.days, label:plan.label, name });
  } catch(e) {
    console.error('[/admin/pwd] ERROR:', e.message);
    res.status(500).json({ ok:false, msg:'Firebase error: '+e.message });
  }
});

// ADMIN: delete code
app.delete('/admin/pwd/:code', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false });
  try { await COL().doc(normalizeCode(req.params.code)).delete(); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ ok:false, msg:e.message }); }
});

// ADMIN: force logout
app.post('/admin/logout/:code', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false });
  try {
    const code = normalizeCode(req.params.code);
    const pwd  = await getPwd(code);
    if (!pwd) return res.json({ ok:false, msg:'Code nahi mila' });
    await savePwd(code, { sessionActive:false, deviceId:null });
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, msg:e.message }); }
});

// ─── ADMIN: save prediction ───────────────────────────────
app.post('/admin/predict', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false });
  if (!db)        return res.status(503).json({ ok:false, msg:'Firebase not configured' });
  const { plan299, plan599, plan999, plan1499, extraSingle } = req.body;
  try {
    const pred = {
      date:        new Date().toLocaleDateString('en-IN'),
      plan299:     plan299  || null,
      plan599:     plan599  || null,
      plan999:     plan999  || null,
      plan1499:    plan1499 || null,
      extraSingle: (extraSingle||[]).slice(0,4),
      savedAt:     Date.now(),
    };
    await setMeta('today', { _json: JSON.stringify(pred), savedAt: pred.savedAt });
    console.log('[/admin/predict] Saved for date:', pred.date);
    res.json({ ok:true, prediction:pred });
  } catch(e) {
    console.error('[/admin/predict] ERROR:', e.message);
    res.status(500).json({ ok:false, msg:e.message });
  }
});

// ADMIN: clear prediction
app.delete('/admin/today', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false });
  try { await META('today').delete(); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ ok:false, msg:e.message }); }
});

// ADMIN: get ad
app.get('/admin/ad', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false });
  const ad = await getMeta('ad');
  res.json({ ok:true, ad:ad||null });
});

// ADMIN: save ad
app.post('/admin/ad', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false });
  const { enabled, text, link, label } = req.body;
  try {
    const ad = { enabled:!!enabled, text:text||'', link:link||'', label:label||'Contact Karo', updatedAt:Date.now() };
    await setMeta('ad', ad);
    res.json({ ok:true, ad });
  } catch(e) { res.status(500).json({ ok:false, msg:e.message }); }
});

// ADMIN: delete ad
app.delete('/admin/ad', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false });
  try { await META('ad').delete(); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ ok:false, msg:e.message }); }
});

// ─── ADMIN: debug ─────────────────────────────────────────
app.get('/admin/debug', async (req, res) => {
  if (!auth(req) && req.query.p !== process.env.ADMIN_PASS)
    return res.status(401).json({ ok:false });
  if (!db) return res.json({ ok:false, firebase:'NOT CONFIGURED' });
  try {
    await META('_debug').set({ ts:Date.now() }, { merge:true });
    const cnt = await COL().count().get();
    return res.json({ ok:true, firebase:'CONNECTED', totalCodes:cnt.data().count, adminPass:process.env.ADMIN_PASS?'SET':'NOT SET' });
  } catch(e) {
    return res.json({ ok:false, error:e.message, fix:'Firebase Console → Firestore Database → Create database' });
  }
});

// 404
app.use((req, res) => res.status(404).json({ ok:false, msg:'Not found' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WIN.X.KING v4.3 | Port:${PORT} | Firebase:${db?'OK':'NOT SET'} | Admin:${process.env.ADMIN_PASS?'SET':'NOT SET'}`);
});

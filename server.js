/**
 * WIN.X.KING Server v4.4
 *
 * BUGS FIXED:
 * 1. "Galat code" even for valid codes → proper error logging added, normalize code
 * 2. Expiry ab plan ke hisaab se hogi (7/15/30/60 din)
 * 3. Code normalize — ABCDEFGH aur ABCD-EFGH dono kaam karenge
 *
 * Render env vars needed:
 *   FIREBASE_SERVICE_ACCOUNT = paste full JSON of service account file
 *   ADMIN_PASS = your admin password
 */

const express = require('express');
const cors    = require('cors');
const app     = express();
const PORT    = process.env.PORT || 10000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

// ─── FIREBASE INIT ────────────────────────────────────────
let db = null;
let firebaseError = null;

(function() {
  try {
    const admin = require('firebase-admin');
    if (admin.apps.length > 0) { db = admin.firestore(); return; }
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
    if (!raw.trim()) {
      firebaseError = 'FIREBASE_SERVICE_ACCOUNT env var is empty or not set';
      console.error('❌', firebaseError);
      return;
    }
    let sa;
    try {
      sa = JSON.parse(raw);
    } catch(pe) {
      firebaseError = 'FIREBASE_SERVICE_ACCOUNT is not valid JSON: ' + pe.message;
      console.error('❌', firebaseError);
      return;
    }
    if (!sa.project_id) {
      firebaseError = 'FIREBASE_SERVICE_ACCOUNT JSON missing project_id field';
      console.error('❌', firebaseError);
      return;
    }
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    db = admin.firestore();
    console.log('✅ Firebase connected — project:', sa.project_id);
  } catch(e) {
    firebaseError = e.message;
    console.error('❌ Firebase init FAILED:', e.message);
  }
})();

// ─── DB REFS ──────────────────────────────────────────────
const COL  = () => db.collection('wxk_passwords');
const META = (n) => db.collection('wxk_meta').doc(n);

// ─── DB HELPERS ───────────────────────────────────────────
async function getPwd(code) {
  const snap = await COL().doc(code).get();
  if (!snap.exists) return null;
  return { ...snap.data(), code: snap.id };
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
  if (!p) {
    console.error('❌ ADMIN_PASS not set in Render!');
    return false;
  }
  return req.headers['x-pass'] === p;
}

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) { if (i === 4) s += '-'; s += c[Math.floor(Math.random() * c.length)]; }
  return s;
}

// Code normalize — ABCDEFGH aur ABCD-EFGH dono kaam karte hain
function normalizeCode(raw) {
  if (!raw) return '';
  // Uppercase, whitespace hata do
  const str = String(raw).trim().toUpperCase();
  // Sirf valid chars rakho (no hyphen yet)
  const clean = str.replace(/[^A-Z0-9]/g, '');
  if (clean.length === 8) {
    // Standard: insert hyphen at position 4
    return clean.substring(0, 4) + '-' + clean.substring(4, 8);
  }
  // Agar already XXXX-XXXX format mein hai
  if (str.length === 9 && str[4] === '-') {
    return str;
  }
  // Fallback
  return str;
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
setInterval(() => {
  const n = Date.now();
  Object.keys(_rl).forEach(k => { if (n - _rl[k].s > 600000) delete _rl[k]; });
}, 600000);

function getIP(req) {
  return (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

// ─── HEALTH ───────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    ok: true,
    status: 'WIN.X.KING v4.4',
    firebase: db ? 'CONNECTED' : ('FAILED — ' + (firebaseError || 'unknown error')),
    adminPass: process.env.ADMIN_PASS ? 'SET' : 'NOT SET',
  });
});

// ─── PUBLIC: /access ──────────────────────────────────────
app.post('/access', async (req, res) => {
  // Firebase check
  if (!db) {
    console.error('[/access] Firebase not connected:', firebaseError);
    return res.status(503).json({ ok:false, msg:'Server config error — Admin se contact karo. Firebase: ' + (firebaseError||'not connected') });
  }

  if (rateLimit(getIP(req), 'access', 10, 60000))
    return res.json({ ok:false, msg:'Bahut zyada attempts. 1 min ruko.' });

  const { code, deviceId } = req.body;
  if (!code) return res.json({ ok:false, msg:'Code daalo' });

  const clean = normalizeCode(code);
  console.log('[/access] Raw input:', JSON.stringify(code), '→ Normalized:', clean, '| deviceId:', deviceId||'none');

  if (!clean || clean.length !== 9) {
    return res.json({ ok:false, msg:'Code format galat hai — XXXX-XXXX format mein daalo' });
  }

  try {
    const pwd = await getPwd(clean);
    console.log('[/access] Firestore result for', clean, ':', pwd ? 'FOUND (used='+pwd.used+')' : 'NOT FOUND');

    if (!pwd) return res.json({ ok:false, msg:'Galat code — Telegram pe contact karo' });

    const now  = Date.now();
    const plan = PLANS[String(pwd.price)] || PLANS['999'];
    console.log('[/access] Plan resolved:', plan.label, '₹'+plan.price, pwd.days+'d');

    if (!pwd.used) {
      // First time activation
      if (pwd.expiry && pwd.expiry < now) {
        return res.json({ ok:false, msg:'Code expire ho gaya — naya lo' });
      }
      // BUG FIX: userExpiry = plan ke days ke hisaab se (7/15/30/60 din)
      const userExpiry = now + (pwd.days * 86400000);
      await savePwd(clean, {
        used:          true,
        activatedAt:   now,
        userExpiry:    userExpiry,
        deviceId:      deviceId || null,
        sessionActive: true,
        lastSeen:      now,
      });
      const [today, ad] = await Promise.all([getMeta('today'), getMeta('ad')]);
      const prediction  = buildPrediction(today, plan.label);
      console.log('[/access] First activation OK:', clean, plan.label, 'daysLeft:', pwd.days);
      return res.json({
        ok: true,
        daysLeft: pwd.days,
        plan,
        hasPrediction: !!prediction,
        prediction,
        ad: (ad && ad.enabled) ? ad : null,
      });
    }

    // Re-login (already activated)
    if (pwd.deviceId && deviceId && pwd.deviceId !== deviceId) {
      return res.json({ ok:false, msg:'Ye code doosre phone pe use ho chuka hai. Naya lo — Telegram pe aao' });
    }
    if (!pwd.userExpiry || pwd.userExpiry < now) {
      return res.json({ ok:false, msg:'Access expire ho gaya — naya code lo' });
    }

    const upd = { sessionActive:true, lastSeen:now };
    if (!pwd.deviceId && deviceId) upd.deviceId = deviceId;
    await savePwd(clean, upd);

    const daysLeft    = Math.ceil((pwd.userExpiry - now) / 86400000);
    const [today, ad] = await Promise.all([getMeta('today'), getMeta('ad')]);
    const prediction  = buildPrediction(today, plan.label);
    console.log('[/access] Re-login OK:', clean, plan.label, 'daysLeft:', daysLeft);
    return res.json({
      ok: true,
      daysLeft,
      plan,
      hasPrediction: !!prediction,
      prediction,
      ad: (ad && ad.enabled) ? ad : null,
    });

  } catch(e) {
    console.error('[/access] FIRESTORE ERROR for code:', clean, '→', e.message, e.stack);
    return res.status(500).json({ ok:false, msg:'Server error: ' + e.message });
  }
});

// ─── PUBLIC: /verify ──────────────────────────────────────
app.post('/verify', async (req, res) => {
  if (!db) return res.json({ ok:false });
  const { code, deviceId } = req.body;
  if (!code) return res.json({ ok:false });

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
  if (!db)        return res.status(503).json({ ok:false, msg:'Firebase not connected: ' + (firebaseError||'unknown') });
  try {
    const [snap, today, ad, stats] = await Promise.all([
      COL().get(), getMeta('today'), getMeta('ad'), getMeta('stats')
    ]);
    const passwords = snap.docs.map(d => ({ ...d.data(), code:d.id }));
    const now = Date.now();
    return res.json({
      ok: true,
      passwords,
      today: today || null,
      ad: ad || null,
      sold: stats?.sold || passwords.filter(p=>p.used).length,
      revenue: stats?.revenue || 0,
      active: passwords.filter(p=>p.used && p.userExpiry > now).length,
    });
  } catch(e) {
    console.error('[/admin/data] ERROR:', e.message);
    return res.status(500).json({ ok:false, msg:'Firebase error: '+e.message });
  }
});

// ─── ADMIN: generate code ─────────────────────────────────
// BUG FIX: expiry ab plan ke hisaab se — Silver 7d, Gold 15d, Diamond 30d, Royal 60d
// expiry = activation window (kitne din mein pehli baar use karna hai)
// userExpiry = actual plan duration (pehli baar use karne ke baad kitne din chalega)
app.post('/admin/pwd', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false, msg:'Unauthorized' });
  if (!db)        return res.status(503).json({ ok:false, msg:'Firebase not connected: ' + (firebaseError||'unknown') });
  const { name='User', price=999 } = req.body;
  const plan = PLANS[String(price)] || PLANS['999'];
  try {
    const code = genCode();
    const now  = Date.now();
    // Activation window = plan.days + 30 extra days (itne din mein use karo, baad mein expire)
    // Code activate karne ke baad plan.days ka access milega
    const activationWindow = 30 * 24 * 60 * 60 * 1000; // 30 din mein activate karna padega
    await COL().doc(code).set({
      code,
      name,
      price:         plan.price,
      days:          plan.days,
      label:         plan.label,
      createdAt:     now,
      expiry:        now + activationWindow,   // 30 din mein activate karo, warna expire
      used:          false,
      userExpiry:    null,
      deviceId:      null,
      sessionActive: false,
      activatedAt:   null,
      lastSeen:      null,
    });
    const stats = await getMeta('stats') || { sold:0, revenue:0 };
    await setMeta('stats', { sold:(stats.sold||0)+1, revenue:(stats.revenue||0)+plan.price });
    console.log('[/admin/pwd] Code created:', code, plan.label, '₹'+plan.price, plan.days+'d');
    res.json({ ok:true, code, price:plan.price, days:plan.days, label:plan.label, name });
  } catch(e) {
    console.error('[/admin/pwd] ERROR:', e.message);
    res.status(500).json({ ok:false, msg:'Firebase error: '+e.message });
  }
});

// ADMIN: delete code
app.delete('/admin/pwd/:code', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false });
  try {
    await COL().doc(normalizeCode(req.params.code)).delete();
    res.json({ ok:true });
  } catch(e) {
    res.status(500).json({ ok:false, msg:e.message });
  }
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
  } catch(e) {
    res.status(500).json({ ok:false, msg:e.message });
  }
});

// ─── ADMIN: save prediction ───────────────────────────────
app.post('/admin/predict', async (req, res) => {
  if (!auth(req)) return res.status(401).json({ ok:false });
  if (!db)        return res.status(503).json({ ok:false, msg:'Firebase not connected' });
  const { plan299, plan599, plan999, plan1499, extraSingle } = req.body;
  try {
    const pred = {
      date:        new Date().toLocaleDateString('en-IN'),
      plan299:     plan299  || null,
      plan599:     plan599  || null,
      plan999:     plan999  || null,
      plan1499:    plan1499 || null,
      extraSingle: (extraSingle || []).slice(0, 4),
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

// ─── ADMIN: debug — Firestore test karo ───────────────────
// Test karo: https://your-server.onrender.com/admin/debug?p=YOUR_ADMIN_PASS
app.get('/admin/debug', async (req, res) => {
  const passOk = (process.env.ADMIN_PASS && req.query.p === process.env.ADMIN_PASS)
              || auth(req);
  if (!passOk) return res.status(401).json({ ok:false, msg:'Pass galat' });

  const info = {
    ok: false,
    serverVersion: 'v4.4',
    firebase: db ? 'CONNECTED' : ('FAILED — ' + (firebaseError||'unknown')),
    adminPass: process.env.ADMIN_PASS ? 'SET' : 'NOT SET',
    firebaseError: firebaseError || null,
  };

  if (!db) return res.json(info);

  try {
    // Firestore write/read test
    await META('_debug').set({ ts:Date.now() }, { merge:true });
    const cnt = await COL().count().get();
    info.ok = true;
    info.firestoreWrite = 'OK';
    info.totalCodes = cnt.data().count;

    // Test ek specific code dhoondho
    const testCode = req.query.code;
    if (testCode) {
      const norm = normalizeCode(testCode);
      const doc  = await getPwd(norm);
      info.codeTest = {
        input:      testCode,
        normalized: norm,
        found:      !!doc,
        data:       doc ? { used:doc.used, price:doc.price, label:doc.label, days:doc.days } : null,
      };
    }
  } catch(e) {
    info.firestoreError = e.message;
    info.fix = 'Firebase Console → Firestore Database → Create database, ya Rules check karo';
  }

  return res.json(info);
});

// 404
app.use((req, res) => res.status(404).json({ ok:false, msg:'Not found' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WIN.X.KING v4.4 | Port:${PORT} | Firebase:${db?'OK':'FAILED'} | Admin:${process.env.ADMIN_PASS?'SET':'NOT SET'}`);
});

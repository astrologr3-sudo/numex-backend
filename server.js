// ═══════════════════════════════════════════════════════════
// NUMEX.AI BACKEND — Express Server
// Deploy on: Railway.app (free)
// ═══════════════════════════════════════════════════════════
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'NUMEXADMIN2026';
const DATA_FILE = './data.json';

app.use(cors({
  origin: '*',
  methods: ['GET','POST','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','x-admin-secret']
}));
app.options('*', cors()); // Handle preflight
app.use(express.json());

// ── DATA STORE (JSON file — no database needed) ─────────────
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch(e) {}
  return {
    history: [],        // [{fb,gb,gl,ds}] — historical data
    passwords: [],      // [{code,days,user,expiry,used,activatedAt}]
    todayPrediction: null, // {fb,gb,gl,ds,baki,spot,family,date}
    totalSold: 0,
    revenue: 0
  };
}

function saveData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

// ── FAMILY MAP ──────────────────────────────────────────────
const FAMILY = {
  0:[0,55,5,50],1:[1,6,56,51],2:[2,7,57,52],3:[3,8,58,53],4:[4,9,59,54],
  5:[0,5,50,55],6:[1,6,56,51],7:[2,7,57,52],8:[3,8,58,53],9:[4,9,59,54],
  10:[10,15,60,65],11:[11,16,61,66],12:[12,17,62,67],13:[13,18,63,68],14:[14,19,64,69],
  15:[15,65,10,60],16:[11,16,61,66],17:[12,17,62,67],18:[13,18,63,68],19:[14,19,64,69],
  20:[20,25,70,75],21:[21,26,71,76],22:[22,27,72,77],23:[23,28,73,78],24:[24,29,74,79],
  25:[20,25,70,75],26:[21,26,71,76],27:[22,27,72,77],28:[23,28,73,78],29:[24,29,74,79],
  30:[30,35,80,85],31:[31,36,81,86],32:[32,37,82,87],33:[33,38,83,88],34:[34,39,84,89],
  35:[30,35,80,85],36:[31,36,81,86],37:[32,37,82,87],38:[33,38,83,88],39:[34,39,84,89],
  40:[40,45,90,95],41:[41,46,91,96],42:[42,47,92,97],43:[43,48,93,98],44:[44,49,94,99],
  45:[40,45,90,95],46:[41,46,91,96],47:[42,47,92,97],48:[43,48,92,97],49:[44,49,94,99],
  50:[0,5,55,50],51:[51,56,1,6],52:[52,57,2,7],53:[53,58,3,8],54:[54,59,4,9],
  55:[55,0,5,50],56:[51,56,1,6],57:[52,57,2,7],58:[53,58,3,8],59:[54,59,4,9],
  60:[60,65,15,10],61:[61,66,16,11],62:[12,17,62,67],63:[13,18,63,68],64:[14,64,19,69],
  65:[60,65,10,15],66:[61,66,16,11],67:[12,17,62,67],68:[13,18,63,68],69:[14,64,19,69],
  70:[20,25,70,75],71:[71,76,21,26],72:[72,77,22,27],73:[73,78,23,28],74:[74,79,24,29],
  75:[75,70,25,20],76:[76,71,26,21],77:[77,72,27,22],78:[78,73,28,23],79:[79,74,29,24],
  80:[80,85,30,35],81:[81,86,31,36],82:[82,87,32,37],83:[83,88,33,38],84:[84,89,34,39],
  85:[85,80,35,30],86:[86,81,36,31],87:[82,87,32,37],88:[83,88,33,38],89:[84,89,34,39],
  90:[90,95,40,45],91:[91,96,41,46],92:[92,97,42,47],93:[93,98,43,48],94:[94,99,44,49],
  95:[95,90,45,40],96:[96,91,41,46],97:[97,92,42,47],98:[98,93,43,48],99:[99,94,44,49]
};

function pad(n) { return String(n).padStart(2,'0'); }
function baki(n) { return (100-n)%100; }
function bakiSet(n) { const b=baki(n); return [b,(b+1)%100,(b-1+100)%100]; }
function getFam(n) { return FAMILY[n]||[]; }
function mirror(n) { const s=pad(n); return parseInt(s[1]+s[0]); }

// ── PREDICTION ENGINE (30 engines) ─────────────────────────
function predict(history, inputs) {
  const results = {};
  const locs = ['fb','gb','gl','ds'];

  locs.forEach(lk => {
    const inp = inputs[lk];
    if (inp === undefined || inp === null) return;

    // Build transition map
    const map = {};
    for (let i=0; i<history.length-1; i++) {
      const k=history[i][lk], v=history[i+1][lk];
      if (!map[k]) map[k]={};
      map[k][v] = (map[k][v]||0)+1;
    }

    const scores = {};
    const reasons = {};
    function add(num, pts, rsn) {
      if (num<0||num>99) return;
      scores[num] = (scores[num]||0)+pts;
      if (!reasons[num]) reasons[num]=[];
      if (rsn && reasons[num].indexOf(rsn)<0) reasons[num].push(rsn);
    }

    // E1: Direct map
    const direct = Object.entries(map[inp]||{}).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const isNew = direct.length===0;
    direct.forEach(([n,c])=>add(parseInt(n),c*15,'map'));

    // Proxy if new number
    if (isNew) {
      getFam(inp).forEach(f=>{
        if(f!==inp) Object.entries(map[f]||{}).forEach(([n,c])=>add(parseInt(n),c*8,'proxy'));
      });
      [inp-1,inp+1,inp-2,inp+2,inp-10,inp+10].forEach(nb=>{
        const nb2=((nb%100)+100)%100;
        Object.entries(map[nb2]||{}).forEach(([n,c])=>add(parseInt(n),c*5,'proxy-nb'));
      });
    }

    // E2: Gap sweet spot
    const lastSeen={};
    history.forEach((d,i)=>lastSeen[d[lk]]=i);
    const tot=history.length;
    Object.entries(lastSeen).forEach(([n,last])=>{
      const g=tot-1-last, num=parseInt(n);
      if(g>=4&&g<=8) add(num,8,'gap');
      else if(g>=9&&g<=12) add(num,4,'gap-near');
      else if(g>18) { scores[num]=(scores[num]||0)-8; }
    });

    // E3: Frequency due
    const appMap={};
    history.forEach((d,i)=>{ const n=d[lk]; if(!appMap[n])appMap[n]=[]; appMap[n].push(i); });
    Object.entries(appMap).forEach(([n,apps])=>{
      if(apps.length<2) return;
      const gaps=apps.slice(1).map((v,i)=>v-apps[i]);
      const avg=gaps.reduce((a,b)=>a+b,0)/gaps.length;
      const ds=tot-1-apps[apps.length-1];
      const due=avg-ds;
      const num=parseInt(n);
      if(due<=0) add(num,12,'DUE!');
      else if(due<=2) add(num,8,'freq');
      else if(due<=4) add(num,4,'freq-soon');
    });

    // E4: Family
    getFam(inp).forEach(f=>{ if(f!==inp) add(f,isNew?12:6,'family'); });

    // E5: Cross-location same-day
    locs.forEach(ol=>{
      if(ol===lk) return;
      const ov=inputs[ol];
      if(ov===undefined||ov===null) return;
      const sd={};
      history.forEach(d=>{ if(d[ol]===ov) sd[d[lk]]=(sd[d[lk]]||0)+1; });
      Object.entries(sd).forEach(([n,c])=>{ if(c>=2) add(parseInt(n),c*3,'cross'); });
    });

    // E6: Baki
    bakiSet(inp).forEach(b=>add(b,10,'baki'));

    // E7: Mirror
    const mir=mirror(inp);
    if(mir!==inp) {
      Object.entries(map[mir]||{}).forEach(([n,c])=>add(parseInt(n),c*8,'mirror'));
      add(mir,6,'mirror-self');
    }

    // E8: Chain 2-step
    Object.entries(map[inp]||{}).slice(0,4).forEach(([mid,c1])=>{
      Object.entries(map[parseInt(mid)]||{}).slice(0,3).forEach(([end,c2])=>{
        add(parseInt(end),Math.round(c1*c2*3),'chain2');
      });
    });

    // E9: Plus-minus
    const mapTop3 = Object.entries(map[inp]||{}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>parseInt(e[0]));
    [inp,...mapTop3].forEach(base=>{
      [1,7,18,21].forEach(sh=>{
        add((base+sh)%100,6,'pm+');
        add((base-sh+100)%100,6,'pm-');
      });
    });

    // E10: Repeat boost last 3
    history.slice(-3).forEach((d,i)=>add(d[lk],(3-i)*5,'repeat'));

    // E11: Position bias
    const pc={};
    history.forEach(d=>pc[d[lk]]=(pc[d[lk]]||0)+1);
    const posMax=Math.max(...Object.values(pc),1);
    Object.entries(pc).forEach(([n,c])=>add(parseInt(n),Math.round(c/posMax*10),'pos-bias'));

    // E12: Hot zone
    const zc=Array(10).fill(0);
    history.slice(-20).forEach(d=>zc[Math.floor(d[lk]/10)]++);
    const hz=zc.indexOf(Math.max(...zc));
    const hzMax=zc[hz]||1;
    zc.forEach((cnt,zi)=>{
      if(cnt>0) for(let n=zi*10;n<zi*10+10;n++) { if(scores[n]!==undefined) add(n,Math.round(cnt/hzMax*8),'hotzone'); }
    });

    // E13: Tens group
    const inpTens=Math.floor(inp/10)*10;
    for(let tn=inpTens;tn<inpTens+10;tn++) add(tn,5,'tens');

    // E14: Double confirm (map+baki)
    const bakiOfInp=new Set(bakiSet(inp));
    mapTop3.forEach(p=>{ if(bakiOfInp.has(p)) add(p,20,'★double'); });

    // E15: Triple confirm (map+baki+family)
    const famOfInp=new Set(getFam(inp));
    mapTop3.forEach(p=>{ if(bakiOfInp.has(p)&&famOfInp.has(p)) add(p,25,'★★triple'); });

    // E16: Weighted recent map
    for(let wi=0;wi<history.length-1;wi++){
      const ww=wi>=history.length-10?3:(wi>=history.length-20?2:1);
      const wk=history[wi][lk], wv=history[wi+1][lk];
      if(wk===inp) add(wv,ww*14,'w-recent');
    }

    // E17: Not-last-5
    const last5=new Set(history.slice(-5).map(d=>d[lk]));
    const seen610=new Set(history.slice(-15,-5).map(d=>d[lk]));
    seen610.forEach(n=>{ if(!last5.has(n)) add(n,7,'not-last5'); });

    // E18: Cross-next-day
    locs.forEach(ol=>{
      if(ol===lk) return;
      const ov=inputs[ol];
      if(ov===undefined||ov===null) return;
      const cn={};
      for(let ci=0;ci<history.length-1;ci++){
        if(history[ci][ol]===ov) cn[history[ci+1][lk]]=(cn[history[ci+1][lk]]||0)+1;
      }
      Object.entries(cn).forEach(([n,c])=>{ if(c>=2) add(parseInt(n),c*6,'cross-next'); });
    });

    // E19: Baki of map preds
    mapTop3.forEach(p=>bakiSet(p).forEach(b=>add(b,5,'baki-pred')));

    // E20: Family+baki mix
    getFam(inp).forEach(f=>{
      if(f!==inp) bakiSet(f).forEach(b=>{
        if(bakiOfInp.has(b)) add(b,12,'fam+baki');
        else add(b,4,'fam-baki');
      });
    });

    // E21: Same-row family (all 4 locations)
    locs.forEach(ol=>{ getFam(inputs[ol]||0).forEach(f=>add(f,4,'row-fam')); });

    // E22: Same-row baki (all 4 locations)
    locs.forEach(ol=>bakiSet(inputs[ol]||0).forEach(b=>add(b,3,'row-baki')));

    // E23: Loc sequence match (2+ same-day inputs match history)
    history.slice(0,-1).forEach((d,i)=>{
      let matches=0;
      locs.forEach(l=>{ if(d[l]===inputs[l]) matches++; });
      if(matches>=2) add(history[i+1][lk],matches*8,'seq-match');
    });

    // E24: Digit frequency
    const digitFreq=Array(10).fill(0);
    history.forEach(d=>{ const s=pad(d[lk]); digitFreq[parseInt(s[0])]++; digitFreq[parseInt(s[1])]++; });
    const inpDigits=new Set([parseInt(pad(inp)[0]),parseInt(pad(inp)[1])]);
    const dMax=Math.max(...digitFreq,1);
    for(let di=0;di<100;di++){
      const ds=pad(di);
      const d1=parseInt(ds[0]),d2=parseInt(ds[1]);
      if(inpDigits.has(d1)||inpDigits.has(d2)) add(di,Math.round((digitFreq[d1]+digitFreq[d2])/dMax*6),'digit');
    }

    // Sort and build result
    const sorted = Object.entries(scores)
      .map(([n,s])=>({num:parseInt(n),score:Math.round(s),reasons:reasons[parseInt(n)]||[]}))
      .filter(x=>x.score>0)
      .sort((a,b)=>b.score-a.score);

    const best3 = sorted.slice(0,3).map(x=>x.num);
    const spotNums = sorted.slice(3,6).map(x=>x.num);
    const famNums = [...new Set(getFam(inp))].filter(f=>best3.indexOf(f)<0).slice(0,3);
    const bakiNums = bakiSet(inp);

    // Dead numbers
    const lookback = Math.min(tot,Math.max(20,Math.floor(tot*0.6)));
    const recentSeen = new Set(history.slice(-lookback).map(d=>d[lk]));
    const stopNums = [];
    for(let i=0;i<100;i++) { if(!recentSeen.has(i)) stopNums.push(i); }

    results[lk] = {
      inp, isNew,
      best3,    // 3 pakke numbers
      spotNums, // 3 extra options
      famNums,  // family numbers
      bakiNums, // baki+±1
      stopNums: stopNums.slice(0,6),
      confidence: Math.min(95, best3.length>0 ? Math.round((sorted[0]?.score||0)/((sorted[1]?.score||1))*40+30) : 0)
    };
  });

  return results;
}

// ── PASSWORD UTILITIES ──────────────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let p='';
  for(let i=0;i<8;i++) {
    if(i===4) p+='-';
    p+=chars[Math.floor(Math.random()*chars.length)];
  }
  return p;
}

function adminAuth(req) {
  return req.headers['x-admin-secret']===ADMIN_SECRET;
}

// ── API ROUTES ──────────────────────────────────────────────

// Health check
app.get('/', (req,res) => res.json({status:'NUMEX.AI Backend Running', version:'1.0'}));

// ── USER API ──────────────────────────────────────────────

// Verify access code + get today's prediction
app.post('/api/access', (req,res) => {
  const { code } = req.body;
  if (!code) return res.json({ok:false,msg:'Code daalo'});

  const d = loadData();
  const now = Date.now();
  const clean = code.trim().toUpperCase();
  const pwd = d.passwords.find(p=>p.code===clean);

  if (!pwd) return res.json({ok:false,msg:'Galat code — dobara check karo ya WhatsApp karo'});
  if (pwd.expiry<now) return res.json({ok:false,msg:'Code expire ho gaya — naya code lo'});

  // First use: activate it and set user expiry
  if (!pwd.used) {
    pwd.used = true;
    pwd.activatedAt = now;
    pwd.userExpiry = now + (pwd.days*24*60*60*1000);
    saveData(d);
  }

  // Check user expiry
  if (pwd.userExpiry && pwd.userExpiry<now) {
    return res.json({ok:false,msg:'Access expire ho gaya ('+pwd.days+' din)— naya code lo. WhatsApp: +91-6375394105'});
  }

  const daysLeft = Math.ceil((pwd.userExpiry-now)/(24*60*60*1000));

  // Return today's prediction (if set by admin)
  const pred = d.todayPrediction;
  if (!pred) {
    return res.json({
      ok:true, daysLeft,
      hasPrediction:false,
      msg:'Aaj ki prediction abhi set nahi hui. Thodi der baad try karo.'
    });
  }

  return res.json({
    ok:true, daysLeft,
    hasPrediction:true,
    prediction: pred,
    date: pred.date
  });
});

// ── ADMIN API ─────────────────────────────────────────────

// Get all data
app.get('/api/admin/data', (req,res) => {
  if(!adminAuth(req)) return res.status(401).json({ok:false});
  const d=loadData();
  res.json({ok:true, passwords:d.passwords, history:d.history, totalSold:d.totalSold, revenue:d.revenue, todayPrediction:d.todayPrediction});
});

// Generate new password
app.post('/api/admin/password', (req,res) => {
  if(!adminAuth(req)) return res.status(401).json({ok:false});
  const {userName='User',days=15} = req.body;
  const d=loadData();
  const code=genCode();
  const now=Date.now();
  d.passwords.push({code,userName,days,createdAt:now,expiry:now+(30*24*60*60*1000),used:false,activatedAt:null,userExpiry:null});
  d.totalSold=(d.totalSold||0)+1;
  d.revenue=(d.revenue||0)+599;
  saveData(d);
  res.json({ok:true,code,days,userName});
});

// Delete password
app.delete('/api/admin/password/:code', (req,res) => {
  if(!adminAuth(req)) return res.status(401).json({ok:false});
  const d=loadData();
  d.passwords=d.passwords.filter(p=>p.code!==req.params.code);
  saveData(d);
  res.json({ok:true});
});

// Add history data
app.post('/api/admin/history', (req,res) => {
  if(!adminAuth(req)) return res.status(401).json({ok:false});
  const {rows} = req.body;  // array of {fb,gb,gl,ds}
  if(!Array.isArray(rows)) return res.json({ok:false,msg:'rows array chahiye'});
  const d=loadData();
  rows.forEach(r=>{
    const row={fb:parseInt(r.fb),gb:parseInt(r.gb),gl:parseInt(r.gl),ds:parseInt(r.ds)};
    if(!isNaN(row.fb)&&!isNaN(row.gb)&&!isNaN(row.gl)&&!isNaN(row.ds)) d.history.push(row);
  });
  saveData(d);
  res.json({ok:true,totalRows:d.history.length});
});

// Set today's input & compute prediction
app.post('/api/admin/predict', (req,res) => {
  if(!adminAuth(req)) return res.status(401).json({ok:false});
  const {fb,gb,gl,ds} = req.body;
  if([fb,gb,gl,ds].some(x=>x===undefined||x===null||isNaN(parseInt(x)))) {
    return res.json({ok:false,msg:'fb gb gl ds chahiye'});
  }
  const d=loadData();
  if(d.history.length<10) return res.json({ok:false,msg:'Kam se kam 10 rows history chahiye'});

  const inputs={fb:parseInt(fb),gb:parseInt(gb),gl:parseInt(gl),ds:parseInt(ds)};
  const pred=predict(d.history,inputs);

  // Add today's input to history
  d.history.push(inputs);

  // Store prediction for users
  d.todayPrediction={
    date: new Date().toLocaleDateString('en-IN'),
    inputs,
    fb: pred.fb,
    gb: pred.gb,
    gl: pred.gl,
    ds: pred.ds
  };

  saveData(d);
  res.json({ok:true, prediction:d.todayPrediction});
});

// Clear today's prediction (next day)
app.delete('/api/admin/prediction', (req,res) => {
  if(!adminAuth(req)) return res.status(401).json({ok:false});
  const d=loadData();
  d.todayPrediction=null;
  saveData(d);
  res.json({ok:true});
});

app.listen(PORT, ()=>console.log('NUMEX.AI Backend running on port '+PORT));

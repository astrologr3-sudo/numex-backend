const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 10000;
const PASS = process.env.ADMIN_PASS || 'NUMEX2026';
const DATA = './db.json';

app.use(cors({origin:'*'}));
app.use(express.json({limit:'10mb'}));

function load(){
  try{ if(fs.existsSync(DATA)) return JSON.parse(fs.readFileSync(DATA,'utf8')); }catch(e){}
  return {history:[],passwords:[],today:null,sold:0,revenue:0};
}
function save(d){ try{fs.writeFileSync(DATA,JSON.stringify(d));}catch(e){} }
function auth(req){ return req.headers['x-pass']===PASS; }

function pad(n){return String(n).padStart(2,'0');}
function bk(n){return(100-n)%100;}
function bkSet(n){const b=bk(n);return[b,(b+1)%100,(b-1+100)%100];}
const FAM={0:[0,55,5,50],1:[1,6,56,51],2:[2,7,57,52],3:[3,8,58,53],4:[4,9,59,54],5:[0,5,50,55],6:[1,6,56,51],7:[2,7,57,52],8:[3,8,58,53],9:[4,9,59,54],10:[10,15,60,65],11:[11,16,61,66],12:[12,17,62,67],13:[13,18,63,68],14:[14,19,64,69],15:[15,65,10,60],16:[11,16,61,66],17:[12,17,62,67],18:[13,18,63,68],19:[14,19,64,69],20:[20,25,70,75],21:[21,26,71,76],22:[22,27,72,77],23:[23,28,73,78],24:[24,29,74,79],25:[20,25,70,75],26:[21,26,71,76],27:[22,27,72,77],28:[23,28,73,78],29:[24,29,74,79],30:[30,35,80,85],31:[31,36,81,86],32:[32,37,82,87],33:[33,38,83,88],34:[34,39,84,89],35:[30,35,80,85],36:[31,36,81,86],37:[32,37,82,87],38:[33,38,83,88],39:[34,39,84,89],40:[40,45,90,95],41:[41,46,91,96],42:[42,47,92,97],43:[43,48,93,98],44:[44,49,94,99],45:[40,45,90,95],46:[41,46,91,96],47:[42,47,92,97],48:[43,48,92,97],49:[44,49,94,99],50:[0,5,55,50],51:[51,56,1,6],52:[52,57,2,7],53:[53,58,3,8],54:[54,59,4,9],55:[55,0,5,50],56:[51,56,1,6],57:[52,57,2,7],58:[53,58,3,8],59:[54,59,4,9],60:[60,65,15,10],61:[61,66,16,11],62:[12,17,62,67],63:[13,18,63,68],64:[14,64,19,69],65:[60,65,10,15],66:[61,66,16,11],67:[12,17,62,67],68:[13,18,63,68],69:[14,64,19,69],70:[20,25,70,75],71:[71,76,21,26],72:[72,77,22,27],73:[73,78,23,28],74:[74,79,24,29],75:[75,70,25,20],76:[76,71,26,21],77:[77,72,27,22],78:[78,73,28,23],79:[79,74,29,24],80:[80,85,30,35],81:[81,86,31,36],82:[82,87,32,37],83:[83,88,33,38],84:[84,89,34,39],85:[85,80,35,30],86:[86,81,36,31],87:[82,87,32,37],88:[83,88,33,38],89:[84,89,34,39],90:[90,95,40,45],91:[91,96,41,46],92:[92,97,42,47],93:[93,98,43,48],94:[94,99,44,49],95:[95,90,45,40],96:[96,91,41,46],97:[97,92,42,47],98:[98,93,43,48],99:[99,94,44,49]};
function getFam(n){return FAM[n]||[];}
function mir(n){const s=pad(n);return parseInt(s[1]+s[0]);}
function genCode(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let p='';for(let i=0;i<8;i++){if(i===4)p+='-';p+=c[Math.floor(Math.random()*c.length)];}return p;}

function predict(history,inputs){
  const res={};
  ['fb','gb','gl','ds'].forEach(lk=>{
    const inp=inputs[lk];if(inp==null)return;
    const map={};
    for(let i=0;i<history.length-1;i++){const k=history[i][lk],v=history[i+1][lk];if(!map[k])map[k]={};map[k][v]=(map[k][v]||0)+1;}
    const sc={};const rsn={};
    function add(n,p,r){if(n<0||n>99)return;sc[n]=(sc[n]||0)+p;if(!rsn[n])rsn[n]=[];if(r&&rsn[n].indexOf(r)<0)rsn[n].push(r);}
    const direct=Object.entries(map[inp]||{}).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const isNew=direct.length===0;
    direct.forEach(([n,c])=>add(parseInt(n),c*15,'map'));
    if(isNew){getFam(inp).forEach(f=>{if(f!==inp)Object.entries(map[f]||{}).forEach(([n,c])=>add(parseInt(n),c*8,'proxy'));});}
    const ls={};history.forEach((d,i)=>ls[d[lk]]=i);const tot=history.length;
    Object.entries(ls).forEach(([n,last])=>{const g=tot-1-last,num=parseInt(n);if(g>=4&&g<=8)add(num,8,'gap');else if(g>18)sc[num]=(sc[num]||0)-8;});
    getFam(inp).forEach(f=>{if(f!==inp)add(f,isNew?12:6,'fam');});
    bkSet(inp).forEach(b=>add(b,10,'baki'));
    const m2=mir(inp);if(m2!==inp)Object.entries(map[m2]||{}).forEach(([n,c])=>add(parseInt(n),c*8,'mir'));
    const mt3=Object.entries(map[inp]||{}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>parseInt(e[0]));
    [inp,...mt3].forEach(base=>[1,7,18,21].forEach(sh=>{add((base+sh)%100,6,'pm');add((base-sh+100)%100,6,'pm');}));
    history.slice(-3).forEach((d,i)=>add(d[lk],(3-i)*5,'rep'));
    const pc={};history.forEach(d=>pc[d[lk]]=(pc[d[lk]]||0)+1);
    const pm=Math.max(...Object.values(pc),1);
    Object.entries(pc).forEach(([n,c])=>add(parseInt(n),Math.round(c/pm*10),'pos'));
    for(let wi=0;wi<history.length-1;wi++){const ww=wi>=history.length-10?3:2;const wk=history[wi][lk],wv=history[wi+1][lk];if(wk===inp)add(wv,ww*14,'wr');}
    const sorted=Object.entries(sc).map(([n,s])=>({num:parseInt(n),score:Math.round(s),r:rsn[parseInt(n)]||[]})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    const best3=sorted.slice(0,3).map(x=>x.num);
    const spot=sorted.slice(3,6).map(x=>x.num);
    const fam=[...new Set(getFam(inp))].filter(f=>best3.indexOf(f)<0).slice(0,3);
    const lb=Math.min(tot,Math.max(20,Math.floor(tot*0.6)));
    const rs=new Set(history.slice(-lb).map(d=>d[lk]));
    const stop=[];for(let i=0;i<100;i++){if(!rs.has(i))stop.push(i);}
    res[lk]={inp,isNew,best3,spot,fam,baki:bkSet(inp),stop:stop.slice(0,6)};
  });
  return res;
}

// Routes
const USER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>NUMEX.AI — Premium Number Oracle</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');
:root{--bg:#000;--gold:#ffd700;--green:#00ff6a;--red:#ff3333;--cyan:#00ffe5;--accent:#39ff14;--fb:#ff6644;--gb:#44aaff;--gl:#44ff88;--ds:#ffcc00;--text:#c8ffd8;--text3:#3d7a4e;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--text);font-family:'Share Tech Mono',monospace;font-size:13px;min-height:100vh;}
body::after{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,255,106,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,106,0.02) 1px,transparent 1px);background-size:44px 44px;pointer-events:none;z-index:0;}

/* LOCK SCREEN */
.lock{position:fixed;inset:0;background:#000;z-index:999;display:flex;align-items:center;justify-content:center;padding:16px;}
.lock-box{border:2px solid var(--gold);border-radius:16px;padding:24px 20px;max-width:400px;width:100%;text-align:center;box-shadow:0 0 60px #ffd70033;background:#050300;}
.logo{font-family:'Orbitron',monospace;font-size:24px;font-weight:900;color:var(--gold);letter-spacing:4px;text-shadow:0 0 20px var(--gold);}
.logo-sub{font-size:9px;color:var(--text3);letter-spacing:3px;margin-bottom:18px;}
.qr-wrap{background:#fff;border-radius:10px;padding:10px;display:inline-block;margin-bottom:14px;}
.qr-wrap img{width:175px;height:175px;display:block;border-radius:4px;}
.price{font-family:'Orbitron',monospace;font-size:30px;font-weight:900;color:var(--gold);}
.days-txt{font-size:10px;color:var(--text3);letter-spacing:3px;margin-bottom:16px;}
.steps{background:#0a0600;border:1px solid #332200;border-radius:8px;padding:12px 14px;margin-bottom:16px;text-align:left;}
.step{font-size:11px;color:var(--text);padding:4px 0;border-bottom:1px solid #1a0f00;display:flex;gap:8px;}
.step:last-child{border-bottom:none;}
.step-n{color:var(--gold);font-family:'Orbitron',monospace;font-size:10px;min-width:18px;}
.code-label{font-size:10px;color:var(--text3);letter-spacing:2px;margin-bottom:6px;}
.code-input{width:100%;background:#0a0600;border:2px solid #332200;border-radius:6px;color:var(--gold);font-family:'Orbitron',monospace;font-size:20px;text-align:center;padding:10px;outline:none;letter-spacing:4px;margin-bottom:6px;transition:all .2s;}
.code-input:focus{border-color:var(--gold);box-shadow:0 0 15px #ffd70033;}
.code-input.shake{animation:shake .3s;}
@keyframes shake{0%,100%{transform:translateX(0);}25%{transform:translateX(-8px);}75%{transform:translateX(8px);}}
.err-msg{font-size:10px;color:var(--red);min-height:16px;margin-bottom:8px;}
.unlock-btn{width:100%;background:linear-gradient(135deg,#332200,#1a1000);border:2px solid var(--gold);color:var(--gold);font-family:'Orbitron',monospace;font-size:12px;letter-spacing:3px;padding:12px;border-radius:6px;cursor:pointer;margin-bottom:10px;transition:all .2s;}
.unlock-btn:hover{background:linear-gradient(135deg,#553300,#332200);box-shadow:0 0 20px #ffd70033;}
.wa-link{font-size:11px;color:var(--text3);}
.wa-link a{color:var(--green);text-decoration:none;}

/* MAIN APP */
.app{display:none;position:relative;z-index:1;min-height:100vh;}
header{background:#000;border-bottom:1px solid #1a1000;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;}
.h-logo{font-family:'Orbitron',monospace;font-size:14px;font-weight:900;color:var(--gold);letter-spacing:3px;}
.h-days{font-size:10px;color:var(--text3);}
.h-days span{color:var(--gold);}

.wrap{padding:12px;max-width:700px;margin:0 auto;}

/* PREDICTION CARDS */
.pred-title{font-family:'Orbitron',monospace;font-size:11px;letter-spacing:4px;color:var(--gold);text-align:center;margin:12px 0 6px;text-shadow:0 0 15px var(--gold);}
.pred-sub{text-align:center;font-size:9px;color:var(--text3);letter-spacing:2px;margin-bottom:14px;}
.pred-date{text-align:center;font-size:10px;color:var(--text3);margin-bottom:12px;}

.loc-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}
@media(min-width:500px){.loc-grid{grid-template-columns:repeat(4,1fr);}}
.loc-card{border-radius:10px;border:2px solid;padding:14px 10px;text-align:center;}
.loc-fb{background:#0d0300;border-color:var(--fb);}
.loc-gb{background:#00080d;border-color:var(--gb);}
.loc-gl{background:#000d03;border-color:var(--gl);}
.loc-ds{background:#0d0b00;border-color:var(--ds);}
.loc-name{font-family:'Orbitron',monospace;font-size:9px;letter-spacing:3px;margin-bottom:10px;}
.loc-fb .loc-name{color:var(--fb);} .loc-gb .loc-name{color:var(--gb);}
.loc-gl .loc-name{color:var(--gl);} .loc-ds .loc-name{color:var(--ds);}
.pk-row{display:flex;justify-content:center;gap:6px;margin-bottom:8px;}
.pk{border-radius:6px;border:2px solid;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px;}
.pk-big{width:58px;height:58px;}
.pk-sm{width:44px;height:44px;}
.pk .n{font-family:'Orbitron',monospace;font-weight:900;line-height:1;}
.pk-big .n{font-size:22px;}
.pk-sm .n{font-size:16px;}
.pk .l{font-size:7px;opacity:.7;margin-top:2px;}
.pk-fb{background:#1a0600;border-color:var(--fb);}  .pk-fb .n{color:var(--fb);}
.pk-gb{background:#001020;border-color:var(--gb);}  .pk-gb .n{color:var(--gb);}
.pk-gl{background:#001a06;border-color:var(--gl);}  .pk-gl .n{color:var(--gl);}
.pk-ds{background:#1a1400;border-color:var(--ds);}  .pk-ds .n{color:var(--ds);}
.extra-row{margin-top:6px;}
.extra-label{font-size:8px;color:#666;margin-bottom:3px;}
.chips{display:flex;justify-content:center;gap:3px;flex-wrap:wrap;}
.chip{font-family:'Orbitron',monospace;font-size:10px;padding:2px 5px;border-radius:3px;border:1px solid;}
.c-fb{color:var(--fb);border-color:var(--fb)44;background:var(--fb)11;}
.c-gb{color:var(--gb);border-color:var(--gb)44;background:var(--gb)11;}
.c-gl{color:var(--gl);border-color:var(--gl)44;background:var(--gl)11;}
.c-ds{color:var(--ds);border-color:var(--ds)44;background:var(--ds)11;}
.c-stop{color:var(--red);border-color:#44000044;background:#1a000011;text-decoration:line-through;opacity:.7;}

.section-box{background:#050300;border:1px solid #1a1000;border-radius:8px;padding:12px;margin-bottom:12px;}
.section-title{font-family:'Orbitron',monospace;font-size:9px;letter-spacing:3px;color:var(--gold);margin-bottom:10px;}

/* COMBINED BOX */
.combined-box{background:#050300;border:2px solid var(--gold);border-radius:10px;padding:14px;margin-bottom:14px;}
.combined-title{font-family:'Orbitron',monospace;font-size:10px;letter-spacing:3px;color:var(--gold);text-align:center;margin-bottom:10px;}
.combined-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;}
.combined-chip{font-family:'Orbitron',monospace;font-size:16px;font-weight:700;padding:6px 12px;border-radius:5px;border:2px solid;color:var(--gold);border-color:var(--gold);background:#1a1000;}
.combined-chip.strong{border-color:var(--accent);color:var(--accent);background:#0a1800;font-size:18px;}

/* NO PRED */
.no-pred{text-align:center;padding:40px 20px;color:var(--text3);}
.no-pred .icon{font-size:36px;margin-bottom:12px;}
.no-pred .msg{font-size:12px;line-height:1.8;}
.no-pred a{color:var(--green);}

/* LOADING */
.loading{display:none;position:fixed;inset:0;background:#000e;z-index:200;align-items:center;justify-content:center;}
.loading.show{display:flex;}
.loading-text{font-family:'Orbitron',monospace;color:var(--green);letter-spacing:4px;animation:blink 1s infinite;}
@keyframes blink{0%,100%{opacity:1;}50%{opacity:.3;}}

.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(20px);background:#050300;border:1px solid var(--gold);border-radius:6px;padding:8px 16px;font-size:11px;color:var(--gold);z-index:300;opacity:0;transition:all .3s;text-align:center;}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
</style>
</head>
<body>

<!-- LOADING -->
<div class="loading" id="loading"><div class="loading-text">LOADING...</div></div>
<div class="toast" id="toast"></div>

<!-- LOCK SCREEN -->
<div class="lock" id="lock">
  <div class="lock-box">
    <div class="logo">NUMEX.AI</div>
    <div class="logo-sub">4-LOCATION NUMBER ORACLE</div>
    <div class="qr-wrap">
      <img id="qrImg" alt="PhonePe QR">
    </div>
    <div class="price">₹599</div>
    <div class="days-txt">15 DIN KA FULL ACCESS</div>
    <div class="steps">
      <div class="step"><span class="step-n">1.</span><span>Upar QR code ko PhonePe/GPay/Paytm se scan karo</span></div>
      <div class="step"><span class="step-n">2.</span><span>₹599 pay karo — "Kirana store" ko</span></div>
      <div class="step"><span class="step-n">3.</span><span>Screenshot WhatsApp karo: <strong style="color:var(--green)">+91-6375394105</strong></span></div>
      <div class="step"><span class="step-n">4.</span><span>15 minute mein ACCESS CODE milega</span></div>
    </div>
    <div class="code-label">ACCESS CODE ENTER KARO</div>
    <input class="code-input" id="codeInput" type="text" maxlength="9" placeholder="XXXX-XXXX" autocapitalize="characters" autocomplete="off">
    <div class="err-msg" id="errMsg"></div>
    <button class="unlock-btn" onclick="tryUnlock()">🔓 UNLOCK KARO</button>
    <div class="wa-link">Help? <a href="https://wa.me/916375394105" target="_blank">WhatsApp: +91-6375394105</a></div>
  </div>
</div>

<!-- MAIN APP -->
<div class="app" id="app">
  <header>
    <div class="h-logo">NUMEX.AI</div>
    <div class="h-days">Access: <span id="daysLeft">—</span> din baaki</div>
  </header>

  <div class="wrap">
    <div class="pred-title">🎯 AAJ KE PAKKE NUMBERS</div>
    <div class="pred-sub">SIRF YE KHELO — BAAKI SOCHNE KI ZAROORAT NAHI</div>
    <div class="pred-date" id="predDate"></div>

    <!-- 4 LOCATION CARDS -->
    <div class="loc-grid" id="locGrid"></div>

    <!-- ALL COMBINED -->
    <div class="combined-box" id="combinedBox" style="display:none;">
      <div class="combined-title">🔥 ALL LOCATIONS — PAKKE NUMBERS (SPOT + FAMILY + BAKI)</div>
      <div class="combined-chips" id="combinedChips"></div>
    </div>

    <!-- NO PREDICTION -->
    <div class="no-pred" id="noPred" style="display:none;">
      <div class="icon">⏳</div>
      <div class="msg">
        Aaj ki prediction abhi set nahi hui.<br>
        Thodi der baad refresh karo.<br><br>
        <a href="https://wa.me/916375394105" target="_blank">WhatsApp karo: +91-6375394105</a>
      </div>
    </div>
  </div>
</div>

<script>
// ══════════════════════════════════════════════════════════
// NUMEX.AI USER APP — SERVER SE DATA LENA
// ══════════════════════════════════════════════════════════

// ⚠️ YE URL APNE RAILWAY SERVER SE REPLACE KARO
var SERVER_URL = 'https://nume-nh1j.onrender.com';

var ACCESS_KEY = 'numex_user_access';

function pad(n){return String(n).padStart(2,'0');}
function showToast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2500);}
function showLoad(){document.getElementById('loading').classList.add('show');}
function hideLoad(){document.getElementById('loading').classList.remove('show');}

// ── QR IMAGE EMBED ──────────────────────────────────────────
// Base64 embedded PhonePe QR
(function(){
  var img = document.getElementById('qrImg');
  img.src = 'data:image/jpeg;base64,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888888888s4MY08AIUsQAQoQEoMoYgco88888888MMcs8MM8888Ucss8c88ccs8888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888888/8QAPBEAAQMDAQMJBwMDAwUAAAAAAQIDBAAFETESFSETIDRRU1RxcqIQFCIwQEFSMkJhM4GRBiNDUGBigJD/2gAIAQIBAT8A/wCxwCogAZNRbO64Ap07I6qZtsRrRGT1mktoTokUW0K1SKdtsR3VvB6xUqzOt5U0dodVKSUkgjB+mQhTiwlIyTUC3Nx0hSxlfsmXBqKQFJJJqLdmn3NhSdknTmTrc3ISVJGF042ptZQoYI+ltEIIRyyx8StPbJityWylY8DUqK7Fdwf7GrZcA8kNOH4xoevmXeEHG+VQPiTr9JEZ5aQ2jrNJSEpAGgHskXOOw4W15yK31E/8qkXKA+2ULSr/ABW1sObTajwPA0xemeTSHQdqo0tmSkls6ewgKBB0NTGeRkOI+2eH0dkbBfWrqHtm2pMh0uBeDTiNhxSeo4qPZy8yhzlcbQqdb/dEoO3nNQovvTuxtY4VAge6bfx52vbfEYeQrrH0di1e9p0NSP67vmNW/obPlq+/oa8TVl6UfLzL7oz9HZHAH1J6xzJrZblOg/lVtuMdMdLbitkpq7y2H0oDa84NWXpR8vMvbgLyE9Q+jivci+2vqNJUFJChoR7Z9uTKG0k4WKVaZoONjNSIT0dKVOADNWXpR8vtUoJSSdBUx7lpDi/54fSWiaFI5FZ4jTm3xCi02QOANWUH3o+X23eaEI5FB+I6/SoWpCgpJwRUC5IfAQs4XzFJSoYIBFIabQcpQB7J9ybYSUIOV0talqKlHJP0wJByDUW7vNAJX8aaZukRwDK9k9RoPsq0cTRfZGriaeukRv8AftHqFSru86Clv4BRJJyT9Vk1kn6MNOHRBNFKk6gj2FtYGSkgfODTh0Qa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';
})();

// ── ACCESS MANAGEMENT ───────────────────────────────────────
function getStoredAccess(){
  try{
    var a=localStorage.getItem(ACCESS_KEY);
    if(!a)return null;
    var obj=JSON.parse(a);
    if(obj.expiry&&Date.now()<obj.expiry)return obj;
    localStorage.removeItem(ACCESS_KEY);
    return null;
  }catch(e){return null;}
}

function storeAccess(code,daysLeft){
  var expiry=Date.now()+(daysLeft*24*60*60*1000);
  localStorage.setItem(ACCESS_KEY,JSON.stringify({code:code,expiry:expiry,storedAt:Date.now()}));
}

function getDaysLeft(){
  var a=getStoredAccess();
  if(!a||!a.expiry)return 0;
  return Math.max(0,Math.ceil((a.expiry-Date.now())/(24*60*60*1000)));
}

// ── UNLOCK ──────────────────────────────────────────────────
async function tryUnlock(){
  var code=document.getElementById('codeInput').value.trim().toUpperCase();
  var errEl=document.getElementById('errMsg');
  if(!code){errEl.textContent='⚠ Code daalo pehle';return;}

  showLoad();
  errEl.textContent='';

  try{
    var r=await fetch(SERVER_URL+'/access',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code:code})
    });
    var d=await r.json();
    hideLoad();

    if(d.ok){
      storeAccess(code,d.daysLeft);
      errEl.style.color='var(--accent)';
      errEl.textContent='✓ Access mila! '+d.daysLeft+' din';
      setTimeout(function(){
        document.getElementById('lock').style.display='none';
        document.getElementById('app').style.display='block';
        document.getElementById('daysLeft').textContent=d.daysLeft;
        if(d.hasPrediction){
          renderPrediction(d.prediction);
        } else {
          document.getElementById('noPred').style.display='block';
        }
      },800);
    } else {
      errEl.style.color='var(--red)';
      errEl.textContent='❌ '+d.msg;
      document.getElementById('codeInput').classList.add('shake');
      setTimeout(function(){document.getElementById('codeInput').classList.remove('shake');},400);
    }
  }catch(e){
    hideLoad();
    errEl.style.color='var(--red)';
    errEl.textContent='❌ Server se connect nahi hua. Internet check karo.';
  }
}

// Allow Enter key
document.getElementById('codeInput').addEventListener('keydown',function(e){if(e.key==='Enter')tryUnlock();});
document.getElementById('codeInput').addEventListener('input',function(){this.value=this.value.toUpperCase();});

// ── RENDER PREDICTION ───────────────────────────────────────
function renderPrediction(pred){
  document.getElementById('predDate').textContent='📅 '+pred.date;

  var lcs=[
    {k:'fb',name:'FB',lc:'loc-fb',pc:'pk-fb',cc:'c-fb'},
    {k:'gb',name:'GB',lc:'loc-gb',pc:'pk-gb',cc:'c-gb'},
    {k:'gl',name:'GL',lc:'loc-gl',pc:'pk-gl',cc:'c-gl'},
    {k:'ds',name:'DS',lc:'loc-ds',pc:'pk-ds',cc:'c-ds'},
  ];

  var gridHtml='';
  var allPakke=new Set();
  var allSpot=new Set();

  lcs.forEach(function(lc){
    var r=pred[lc.k];
    if(!r){return;}
    var b3=r.best3||[];
    var spot=r.spotNums||[];
    var famNums=r.famNums||[];
    var bakiNums=r.bakiNums||[];
    var stop=r.stopNums||[];

    b3.forEach(function(n){allPakke.add(n);});
    spot.forEach(function(n){allSpot.add(n);});

    gridHtml+='<div class="loc-card '+lc.lc+'">';
    gridHtml+='<div class="loc-name">📍 '+lc.name+'</div>';

    // Best 3 numbers
    gridHtml+='<div class="pk-row">';
    b3.forEach(function(n,i){
      gridHtml+='<div class="pk '+(i===0?'pk-big':'pk-sm')+' '+lc.pc+'">'
        +'<div class="n">'+pad(n)+'</div>'
        +'<div class="l">'+(i===0?'BEST':i===1?'2ND':'3RD')+'</div>'
        +'</div>';
    });
    gridHtml+='</div>';

    // Baki
    if(bakiNums&&bakiNums.length){
      gridHtml+='<div class="extra-row"><div class="extra-label">baki+±1</div>';
      gridHtml+='<div class="chips">';
      bakiNums.forEach(function(n){gridHtml+='<span class="chip '+lc.cc+'">'+pad(n)+'</span>';});
      gridHtml+='</div></div>';
    }

    // Spot
    if(spot&&spot.length){
      gridHtml+='<div class="extra-row"><div class="extra-label">spot</div>';
      gridHtml+='<div class="chips">';
      spot.forEach(function(n){gridHtml+='<span class="chip '+lc.cc+'">'+pad(n)+'</span>';});
      gridHtml+='</div></div>';
    }

    // Family
    if(famNums&&famNums.length){
      gridHtml+='<div class="extra-row"><div class="extra-label">family</div>';
      gridHtml+='<div class="chips">';
      famNums.forEach(function(n){gridHtml+='<span class="chip '+lc.cc+'">'+pad(n)+'</span>';});
      gridHtml+='</div></div>';
    }

    // Stop
    if(stop&&stop.length){
      gridHtml+='<div class="extra-row"><div class="extra-label" style="color:var(--red);">⛔ stop</div>';
      gridHtml+='<div class="chips">';
      stop.slice(0,5).forEach(function(n){gridHtml+='<span class="chip c-stop">'+pad(n)+'</span>';});
      gridHtml+='</div></div>';
    }

    gridHtml+='</div>';
  });

  document.getElementById('locGrid').innerHTML=gridHtml;

  // Combined all pakke
  if(allPakke.size>0){
    var cbEl=document.getElementById('combinedBox');
    var chipsEl=document.getElementById('combinedChips');
    // Strong = in multiple locations
    var numCount={};
    allPakke.forEach(function(n){numCount[n]=(numCount[n]||0)+1;});
    allSpot.forEach(function(n){numCount[n]=(numCount[n]||0)+0.5;});
    var sortedAll=Array.from(new Set([...allPakke,...allSpot])).sort(function(a,b){return (numCount[b]||0)-(numCount[a]||0);});
    chipsEl.innerHTML=sortedAll.slice(0,16).map(function(n){
      var strong=allPakke.has(n)&&(numCount[n]||0)>=2;
      return '<span class="combined-chip'+(strong?' strong':'')+'">'+pad(n)+'</span>';
    }).join('');
    cbEl.style.display='block';
  }
}

// ── AUTO LOGIN IF ALREADY HAS ACCESS ───────────────────────
async function autoLogin(){
  var acc=getStoredAccess();
  if(!acc)return; // show lock screen

  showLoad();
  try{
    var r=await fetch(SERVER_URL+'/access',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code:acc.code})
    });
    var d=await r.json();
    hideLoad();

    if(d.ok){
      document.getElementById('lock').style.display='none';
      document.getElementById('app').style.display='block';
      document.getElementById('daysLeft').textContent=d.daysLeft;
      if(d.hasPrediction){
        renderPrediction(d.prediction);
      } else {
        document.getElementById('noPred').style.display='block';
      }
    } else {
      // Access expired
      localStorage.removeItem(ACCESS_KEY);
      hideLoad();
    }
  }catch(e){
    hideLoad();
    // Offline? Try cached data
    var dl=getDaysLeft();
    if(dl>0){
      document.getElementById('lock').style.display='none';
      document.getElementById('app').style.display='block';
      document.getElementById('daysLeft').textContent=dl;
      document.getElementById('noPred').style.display='block';
      showToast('Offline mode — cached access');
    }
  }
}

window.onload=function(){
  autoLogin();
};
</script>
</body>
</html>
`;

app.get('/',(req,res)=>{
  // If browser request (has Accept: text/html), serve the app
  const accept = req.headers['accept']||'';
  if(accept.includes('text/html')){
    res.setHeader('Content-Type','text/html');
    return res.send(USER_HTML);
  }
  // API request
  res.json({status:'NUMEX.AI OK',rows:load().history.length});
});

app.get('/app',(req,res)=>{
  res.setHeader('Content-Type','text/html');
  res.send(USER_HTML);
});

app.post('/access',(req,res)=>{
  const{code,deviceId}=req.body;
  if(!code)return res.json({ok:false,msg:'Code daalo'});
  const d=load();const now=Date.now();const clean=code.trim().toUpperCase();
  const pwd=d.passwords.find(p=>p.code===clean);
  if(!pwd)return res.json({ok:false,msg:'Galat code — Telegram pe contact karo: @KingNUMEX'});
  if(pwd.expiry<now)return res.json({ok:false,msg:'Code expire ho gaya — naya lo'});
  if(!pwd.used){
    pwd.used=true;pwd.activatedAt=now;pwd.userExpiry=now+(pwd.days*86400000);
    pwd.deviceId=deviceId||null;
    save(d);
  } else {
    if(pwd.deviceId&&deviceId&&pwd.deviceId!==deviceId){
      return res.json({ok:false,msg:'Ye code doosre phone pe already use ho chuka hai. Naya code lo — Telegram: @KingNUMEX'});
    }
    if(!pwd.deviceId&&deviceId){pwd.deviceId=deviceId;save(d);}
  }
  if(pwd.userExpiry<now)return res.json({ok:false,msg:'Access expire ho gaya — naya code lo: @KingNUMEX'});
  const dl=Math.ceil((pwd.userExpiry-now)/86400000);
  const pred=d.today;
  return res.json({ok:true,daysLeft:dl,hasPrediction:!!pred,prediction:pred||null});
});

app.get('/admin/data',(req,res)=>{if(!auth(req))return res.status(401).json({ok:false});return res.json({ok:true,...load()});});

app.post('/admin/pwd',(req,res)=>{
  if(!auth(req))return res.status(401).json({ok:false});
  const{name='User',days=15}=req.body;const d=load();const code=genCode();const now=Date.now();
  d.passwords.push({code,name,days,createdAt:now,expiry:now+(30*86400000),used:false,userExpiry:null});
  d.sold=(d.sold||0)+1;d.revenue=(d.revenue||0)+599;save(d);
  res.json({ok:true,code,days,name});
});

app.delete('/admin/pwd/:code',(req,res)=>{
  if(!auth(req))return res.status(401).json({ok:false});
  const d=load();d.passwords=d.passwords.filter(p=>p.code!==req.params.code);save(d);
  res.json({ok:true});
});

app.post('/admin/history',(req,res)=>{
  if(!auth(req))return res.status(401).json({ok:false});
  const{rows}=req.body;if(!Array.isArray(rows))return res.json({ok:false});
  const d=load();
  rows.forEach(r=>{const row={fb:parseInt(r.fb),gb:parseInt(r.gb),gl:parseInt(r.gl),ds:parseInt(r.ds)};if(![row.fb,row.gb,row.gl,row.ds].some(isNaN))d.history.push(row);});
  save(d);res.json({ok:true,total:d.history.length});
});

app.post('/admin/predict',(req,res)=>{
  if(!auth(req))return res.status(401).json({ok:false});
  const{fb,gb,gl,ds,manualNums,extraNums}=req.body;
  const d=load();
  // manualNums = {fb:{main:[],spot:[]}, gb:{...}, gl:{...}, ds:{...}}
  // extraNums = 8 numbers for all games
  const inp={fb:parseInt(fb)||0,gb:parseInt(gb)||0,gl:parseInt(gl)||0,ds:parseInt(ds)||0};
  const extra=(extraNums||[]).filter(n=>!isNaN(parseInt(n))&&parseInt(n)>=0&&parseInt(n)<=99).map(Number);
  // Build today's prediction from manual numbers only
  const locs=['fb','gb','gl','ds'];
  const pred={};
  locs.forEach(lk=>{
    const mn=(manualNums&&manualNums[lk])||{};
    const main=(mn.main||[]).filter(n=>!isNaN(n)&&n>=0&&n<=99).slice(0,2);
    const spot=(mn.spot||[]).filter(n=>!isNaN(n)&&n>=0&&n<=99).slice(0,4);
    pred[lk]={best3:main,spot:spot,fam:[],baki:[],stop:[]};
  });
  // Add to history
  if(!isNaN(inp.fb))d.history.push(inp);
  d.today={date:new Date().toLocaleDateString('en-IN'),inputs:inp,...pred,extraNums:extra};
  save(d);
  res.json({ok:true,prediction:d.today});
});

app.delete('/admin/today',(req,res)=>{
  if(!auth(req))return res.status(401).json({ok:false});
  const d=load();d.today=null;save(d);res.json({ok:true});
});


// Ad management
app.get('/admin/ad',(req,res)=>{
  if(!auth(req))return res.status(401).json({ok:false});
  const d=load();
  res.json({ok:true,ad:d.ad||null});
});

app.post('/admin/ad',(req,res)=>{
  if(!auth(req))return res.status(401).json({ok:false});
  const{enabled,text,link,label}=req.body;
  const d=load();
  d.ad={enabled:!!enabled,text:text||'',link:link||'',label:label||'Yahan Click Karo'};
  save(d);res.json({ok:true,ad:d.ad});
});

app.delete('/admin/ad',(req,res)=>{
  if(!auth(req))return res.status(401).json({ok:false});
  const d=load();d.ad=null;save(d);res.json({ok:true});
});

// User gets ad along with prediction
app.get('/ad',(req,res)=>{
  const d=load();
  const ad=d.ad&&d.ad.enabled?d.ad:null;
  res.json({ok:true,ad:ad});
});

app.listen(PORT,'0.0.0.0',()=>console.log('NUMEX running on '+PORT));

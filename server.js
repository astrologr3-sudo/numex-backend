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
app.get('/',(req,res)=>res.json({status:'NUMEX.AI OK',rows:load().history.length}));

app.post('/access',(req,res)=>{
  const{code}=req.body;if(!code)return res.json({ok:false,msg:'Code daalo'});
  const d=load();const now=Date.now();const clean=code.trim().toUpperCase();
  const pwd=d.passwords.find(p=>p.code===clean);
  if(!pwd)return res.json({ok:false,msg:'Galat code'});
  if(pwd.expiry<now)return res.json({ok:false,msg:'Code expire'});
  if(!pwd.used){pwd.used=true;pwd.activatedAt=now;pwd.userExpiry=now+(pwd.days*86400000);save(d);}
  if(pwd.userExpiry<now)return res.json({ok:false,msg:'Access expire — naya lo'});
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
  const{fb,gb,gl,ds}=req.body;
  const d=load();if(d.history.length<5)return res.json({ok:false,msg:'History add karo'});
  const inp={fb:parseInt(fb),gb:parseInt(gb),gl:parseInt(gl),ds:parseInt(ds)};
  const pred=predict(d.history,inp);
  d.history.push(inp);
  d.today={date:new Date().toLocaleDateString('en-IN'),inputs:inp,...pred};
  save(d);res.json({ok:true,prediction:d.today});
});

app.delete('/admin/today',(req,res)=>{
  if(!auth(req))return res.status(401).json({ok:false});
  const d=load();d.today=null;save(d);res.json({ok:true});
});

app.listen(PORT,'0.0.0.0',()=>console.log('NUMEX running on '+PORT));

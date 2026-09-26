const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-moi-en-prod-avec-une-longue-cle-aleatoire';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DATA_FILE = path.join(__dirname, 'data.json');

// ---------- DB ----------
let DB = { users: [], sessions: [], messages: [], progress: [], user_badges: [], xp_events: [] };
try { if (fs.existsSync(DATA_FILE)) DB = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); } catch(e){}
function saveDB(){ try{ fs.writeFileSync(DATA_FILE, JSON.stringify(DB,null,2)); }catch(e){} }

// ---------- CONST ----------
const LEVELS = [
  {level:1,name:'Trainee',xp:0},{level:2,name:'Rookie',xp:300},{level:3,name:'Junior',xp:800},
  {level:4,name:'Chatter',xp:1600},{level:5,name:'Closer',xp:2800},{level:6,name:'Senior',xp:4500},
  {level:7,name:'Elite',xp:7000},{level:8,name:'Leader',xp:10500}
];
function levelFor(xp){ let l=LEVELS[0]; for(let i=0;i<LEVELS.length;i++){ if(xp>=LEVELS[i].xp) l=LEVELS[i]; } return l; }

const VAULT = [
  {ref:'VAULT_01',label:'Set teasing 6 photos',min:8,max:15,tier:'soft'},
  {ref:'VAULT_02',label:'Set lingerie 12 photos',min:15,max:25,tier:'soft'},
  {ref:'VAULT_03',label:'Video shower 2m40',min:20,max:35,tier:'mid'},
  {ref:'VAULT_04',label:'Video gym 3m10',min:25,max:40,tier:'mid'},
  {ref:'VAULT_07',label:'Video JOI 7m30',min:50,max:85,tier:'premium'},
  {ref:'VAULT_08',label:'Bundle BestOf 18m',min:80,max:140,tier:'premium'},
  {ref:'VAULT_10',label:'Bundle VIP 30m+',min:150,max:400,tier:'vip'}
];
const MODULES = [
  {id:1,code:'M01',title:'Onboarding CRM',goal:'Lire la fiche',brief:'Lis la fiche avant d ecrire. Personnalise.',pool:['NEW','RETURNING'],diff:1,pass:60,reward:100},
  {id:2,code:'M02',title:'Accroche',goal:'Ouverture naturelle',brief:'Pas de copier-coller. Prouve que tu as lu.',pool:['NEW','COLD'],diff:1,pass:60,reward:120},
  {id:3,code:'M03',title:'Connexion',goal:'Creer du confort',brief:'Zero PPV sur ce module. Fais le parler.',pool:['COLD','ENGAGED'],diff:1,pass:65,reward:150},
  {id:4,code:'M04',title:'Decouverte',goal:'Qualifier',brief:'Decouvre 3 infos sans interrogatoire.',pool:['CURIOUS','SPENDER'],diff:2,pass:65,reward:180},
  {id:5,code:'M05',title:'Teasing',goal:'Creer le desir',brief:'Donne envie sans tout devoiler.',pool:['ENGAGED','CURIOUS'],diff:2,pass:65,reward:200},
  {id:6,code:'M06',title:'Timing PPV',goal:'Proposer au bon moment',brief:'Propose seulement sur signal fort.',pool:['ENGAGED','SPENDER'],diff:2,pass:70,reward:250},
  {id:7,code:'M07',title:'Objection Prix',goal:'Tenir le prix',brief:'Ne baisse jamais a la 1ere objection.',pool:['PRICE'],diff:2,pass:70,reward:250},
  {id:8,code:'M08',title:'Gratteur',goal:'Defendre la valeur',brief:'Refuse le gratuit sans agressivite.',pool:['FREE'],diff:2,pass:70,reward:280},
  {id:9,code:'M09',title:'Ghost',goal:'Relance',brief:'Le client ghost apres offre. Relance avec raison.',pool:['GHOST'],diff:3,pass:70,reward:300},
  {id:10,code:'M10',title:'Apres-vente',goal:'Fideliser',brief:'Gere le retour apres achat.',pool:['RETURNING','UNHAPPY'],diff:3,pass:70,reward:300},
  {id:11,code:'M11',title:'Client Difficile',goal:'Combo',brief:'Depensier + mefiant + presse.',pool:['TESTER','SPENDER','PRICE'],diff:3,pass:70,reward:400},
  {id:12,code:'M12',title:'EXAMEN FINAL',goal:'Conversation complete',brief:'Profil aleatoire, zero aide.',pool:['NEW','CURIOUS','FREE','PRICE','SPENDER','COLD','ENGAGED','RETURNING','GHOST','UNHAPPY','TESTER'],diff:3,pass:75,reward:600}
];
const PERSONAS = {
  NEW:{label:'Le Nouveau',first:['salut je viens d arriver','hello premiere fois ici'],base:[35,27,18,78],budget:[12,65],intent:''},
  CURIOUS:{label:'Le Curieux',first:['tu proposes quoi comme contenu ?','c est quoi la diff entre tes photos et videos ?'],base:[49,42,20,86],budget:[20,85],intent:'signal'},
  FREE:{label:'Gratteur',first:['tu peux envoyer un apercu gratuit ?','juste une photo gratuite stp'],base:[45,30,22,85],budget:[0,16],intent:'free'},
  PRICE:{label:'Sensible prix',first:['ca coute combien ?','j ai pas gros budget'],base:[55,40,30,75],budget:[14,37],intent:'price'},
  SPENDER:{label:'Depensier',first:['hey tu te souviens de ce que j aime ?','quoi de neuf depuis la derniere fois'],base:[61,54,29,68],budget:[85,260],intent:''},
  COLD:{label:'Froid',first:['salut','hey','yo'],base:[22,26,33,95],budget:[12,60],intent:''},
  ENGAGED:{label:'Tres engage',first:['content de te retrouver !','j ai vu ton dernier post'],base:[69,59,14,90],budget:[35,135],intent:''},
  RETURNING:{label:'Ancien client',first:['j avais achete la derniere fois','je suis de retour'],base:[55,61,23,76],budget:[40,170],intent:''},
  GHOST:{label:'Fantome post-offre',first:['salut tu as du nouveau ?','je passe voir'],base:[58,50,23,75],budget:[25,95],intent:''},
  UNHAPPY:{label:'Decu',first:['dernier media decevant','pas ce que tu avais decrit'],base:[27,20,65,57],budget:[20,90],intent:'unhappy'},
  TESTER:{label:'Testeur',first:['c etait quel prix la derniere fois ?','tes offres ont change ?'],base:[46,32,52,82],budget:[35,135],intent:''},
  RUSHED:{label:'Presse',first:['j ai 5 min tu as quoi ?','fais court stp'],base:[58,42,25,37],budget:[30,110],intent:'signal'}
};
const NAMES = ['Mike','Tom','Chris','David','Ryan','Alex','Sam','Nico','Marco','Julien','Dan','Paul'];
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function clamp(n,a,b){ if(a===undefined) a=0; if(b===undefined) b=100; return Math.max(a,Math.min(b,Math.round(n))); }

// ---------- AUTH ----------
function hashPw(pw, salt){ salt = salt || crypto.randomBytes(16).toString('hex'); const h=crypto.pbkdf2Sync(pw,salt,10000,64,'sha512').toString('hex'); return salt+':'+h; }
function verifyPw(pw, stored){ const parts=stored.split(':'); const s=parts[0]; const h=crypto.pbkdf2Sync(pw,s,10000,64,'sha512').toString('hex'); return h===parts[1]; }
function b64u(s){ return Buffer.from(s).toString('base64url'); }
function createToken(u){ const head=b64u(JSON.stringify({alg:'HS256'})); const pay=b64u(JSON.stringify({id:u.id,name:u.name,exp:Date.now()+30*24*3600*1000})); const sig=crypto.createHmac('sha256',JWT_SECRET).update(head+'.'+pay).digest('base64url'); return head+'.'+pay+'.'+sig; }
function verifyToken(t){ try{ const p=t.split('.'); const sig=crypto.createHmac('sha256',JWT_SECRET).update(p[0]+'.'+p[1]).digest('base64url'); if(sig!==p[2]) return null; const data=JSON.parse(Buffer.from(p[1],'base64url').toString()); if(data.exp<Date.now()) return null; return data; }catch(e){return null;} }

// ---------- PERSONA ENGINE ----------
function genPersona(pool, diff){
  const code = pick(pool);
  const base = PERSONAS[code] || PERSONAS.NEW;
  const budget = Math.round(base.budget[0] + Math.random()*(base.budget[1]-base.budget[0]));
  return {
    code: code, label: base.label,
    display_name: pick(NAMES) + (Math.random()>0.5 ? Math.floor(Math.random()*90) : ''),
    first: pick(base.first),
    budget: budget,
    intent: base.intent,
    state: { interest: clamp(base.base[0]+(diff==1?10:diff==3?-10:0)), trust: clamp(base.base[1]), suspicion: clamp(base.base[2]+(diff==3?12:0)), patience: clamp(base.base[3]), budget_left: budget, spent:0 }
  };
}

// Fallback local reply when no OpenAI key
function localReply(persona, state, history, userMsg, offer){
  const low = (userMsg||'').toLowerCase();
  let delta = {interest:0,trust:0,suspicion:0,patience:0};
  let signals = [];
  let purchase = {made:false,amount:0,ref:null};
  let status = 'active';
  let flags = [];
  let reply = '';

  if(offer){
    if(history.length < 4){ delta.interest-=12; delta.suspicion+=12; flags.push({type:'pitch_too_early',severity:'high',evidence:userMsg}); reply = pick(['deja une offre ? on vient de commencer','ca va vite la non ?']); }
    else if(offer.price > state.budget_left){ delta.interest-=5; signals.push('objection_raised'); reply = pick(['ca depasse mon budget la','trop cher pour moi aujourd hui','j ai pas ca maintenant']); }
    else if(state.interest < 55){ reply = pick(['je sais pas encore','laisse moi reflechir','pas sur']); delta.interest-=3; }
    else {
      if(Math.random() < 0.62){ purchase.made=true; purchase.amount=offer.price; purchase.ref=offer.ref; state.budget_left-=offer.price; state.spent+=offer.price; reply = pick(['ok je l ai pris','c est bon je viens de debloquer','je l ai achete']); status='converted'; }
      else { reply = pick(['ok ca me tente bien','ca a l air pas mal']); signals.push('ready_to_buy'); }
    }
  } else {
    if(low.includes('gratuit') || low.includes('gratuitement') || persona.intent==='free'){ signals.push('objection_raised'); }
    if(low.includes('prix') || low.includes('cher') || low.includes('combien')) signals.push('asks_price');
    if(low.includes('?')) delta.interest+=2;

    if(persona.code==='COLD'){ reply = pick(['ouais','ok','mdr','peut etre','je sais pas']); }
    else if(persona.code==='FREE'){ reply = pick(['tu peux pas envoyer un petit apercu ?','juste une photo pour voir ?','allez stp gratuit']); signals.push('asks_preview'); }
    else if(persona.code==='PRICE'){ reply = pick(['c est combien ?','tu peux faire moins ?','j ai que 20']); }
    else if(persona.code==='GHOST' && history.filter(m=>m.role==='chatter').length>=2 && Math.random()<0.6){ reply=''; status='ghosted'; }
    else if(state.interest>65){ reply = pick(['tu as quoi de dispo dans ce style ?','qu est ce que tu me conseillerais ?','je suis curieux la']); signals.push('asks_content'); }
    else { reply = pick(['ah ok je vois','je suis pose chez moi','ca depend de ce que tu as en tete','pas mal']); }

    if(low.length<4){ delta.interest-=3; }
    if(low.includes(persona.display_name.toLowerCase())){ delta.trust+=5; delta.interest+=3; flags.push({type:'good_personalization',severity:'low',evidence:userMsg}); }
  }

  if(state.interest<10) status='lost';
  if(state.patience<8) status='ghosted';

  return {reply:reply, typing: 800+Math.floor(Math.random()*2200), delta:delta, signals:signals, purchase:purchase, status:status, flags:flags};
}

async function llmReply(persona, state, history, systemExtra){
  if(!OPENAI_API_KEY) return null;
  try{
    const sys = 'Tu es un client OnlyFans simule. Tu incarnes UNIQUEMENT le client. Reponds en JSON strict: {"reply":string,"delta":{"interest":int,"trust":int,"suspicion":int,"patience":int},"signals":[],"purchase":{"made":bool,"amount":number},"status":"active|ghosted|lost|converted","flags":[]}. Persona: '+persona.label+' budget '+persona.budget+'$ etat '+JSON.stringify(state)+' '+systemExtra;
    const msgs = [{role:'system',content:sys}].concat(history.map(m=>({role: m.role==='sub'?'assistant':'user', content: m.content})).slice(-12));
    const r = await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+OPENAI_API_KEY},body:JSON.stringify({model:OPENAI_MODEL, temperature:0.9, response_format:{type:'json_object'}, messages:msgs})});
    const j = await r.json();
    const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if(!txt) return null;
    return JSON.parse(txt);
  }catch(e){ return null; }
}

// ---------- GRADING ----------
function gradeSession(session, msgs){
  const m = session.metrics || {offers:0, personal:0, early:0, pressure:0};
  let score = 60;
  if(m.personal>0) score+=10;
  if(m.early>0) score-=18;
  if(m.offers===0 && session.revenue===0) score-=5;
  if(session.revenue>0) score+=15;
  if(m.pressure>1) score-=15;
  score = clamp(score,0,100);
  const breakdown = {accroche: clamp(6+(m.personal?3:0)), connexion: clamp(10+(m.personal?3:0)), decouverte:10, desir:10, timing: clamp(10-(m.early?6:0)), presentation:10, objections:10, relance:5, naturel:5};
  let total = 0; Object.values(breakdown).forEach(v=> total+=v);
  // normalize to score
  const factor = score / (total||1);
  Object.keys(breakdown).forEach(k=> breakdown[k]=clamp(breakdown[k]*factor* (k==='accroche'?1:1.2),0, k==='accroche'?10:k==='relance'||k==='naturel'?5:k==='presentation'||k==='objections'?10:15));
  let sum = 0; Object.values(breakdown).forEach(v=> sum+=v);
  // adjust
  return {
    score_global: clamp(sum,0,100),
    breakdown: breakdown,
    points_forts: m.personal?['Personnalisation detectee']:['Conversation terminee'],
    points_a_ameliorer: m.early?['Offre trop precoce']:['Peut mieux faire sur le timing'],
    erreur_principale: {titre: m.early?'Vente trop rapide':'A ameliorer', citation: (msgs.find(x=>x.role==='chatter')||{content:''}).content.slice(0,80), explication:'Le client a ressenti de la precipitation.'},
    ce_qui_aurait_pu_etre_mieux_fait: [],
    conseil_prochaine_simulation: 'Rebondis sur 1 info perso avant de proposer.',
    verdict: sum>=75?'bon':sum>=55?'passable':'a_reprendre'
  };
}

// ---------- HTTP ----------
function json(res, code, obj){ res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}); res.end(JSON.stringify(obj)); }
function parseBody(req){ return new Promise(res=>{ let b=''; req.on('data',c=> b+=c); req.on('end',()=>{ try{ res(b?JSON.parse(b):{});}catch(e){res({});} }); }); }

const HTML = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OFM Trainer Fullstack</title>
<style>
:root{--bg:#0b0e14;--panel:#141922;--panel2:#1b2230;--line:#252c3a;--txt:#e6ebf4;--dim:#8b96ab;--acc:#7c5cff;--ok:#22c55e}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui;background:var(--bg);color:var(--txt)}
.hidden{display:none!important}.btn{border:0;border-radius:9px;padding:10px 16px;font-weight:600;cursor:pointer}
.btn.primary{background:var(--acc);color:#fff}.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--dim)}
input,textarea,select{background:var(--panel2);border:1px solid var(--line);color:var(--txt);padding:10px;border-radius:9px;width:100%}
.layout{display:grid;grid-template-columns:220px 1fr;min-height:100vh}.sidebar{background:var(--panel);border-right:1px solid var(--line);padding:18px}
.nav{padding:10px;border-radius:8px;color:var(--dim);cursor:pointer;margin-bottom:4px}.nav.active{background:var(--acc);color:#fff}
.topbar{padding:14px 20px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}
main{padding:22px}.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px}
.grid{display:grid;gap:12px}.g3{grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}.g4{grid-template-columns:repeat(4,1fr)}
.badge{font-size:11px;background:var(--panel2);padding:3px 8px;border-radius:20px;color:var(--dim)}
.chat{display:flex;flex-direction:column;height:70vh}.thread{flex:1;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:12px}
.msg{max-width:70%;padding:10px 14px;border-radius:14px;font-size:14px}.msg.sub{background:var(--panel2);align-self:flex-start}.msg.me{background:var(--acc);align-self:flex-end}
.vitem{padding:8px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:13px}.vitem:hover{border-color:var(--acc)}
.auth{height:100vh;display:grid;place-items:center}.auth-card{background:var(--panel);padding:28px;border-radius:14px;width:340px;display:flex;flex-direction:column;gap:10px;border:1px solid var(--line)}
</style></head><body>
<div id="auth" class="auth"><div class="auth-card"><h2>OFM TRAINER</h2><input id="a-name" placeholder="Nom (inscription)"><input id="a-email" placeholder="Email"><input id="a-pass" type="password" placeholder="Mot de passe"><button class="btn primary" onclick="doLogin()">Connexion</button><button class="btn ghost" onclick="doRegister()">Creer compte</button><div id="a-err" style="color:#ef4444;font-size:12px"></div><p style="font-size:11px;color:var(--dim)">Backend partage entre chatters. Donnees dans data.json</p></div></div>
<div id="app" class="hidden"><div class="layout"><aside class="sidebar"><div style="font-weight:800;letter-spacing:2px;margin-bottom:18px">OFM<span style="color:var(--acc)">TRAINER</span></div><div class="nav active" data-v="dash" onclick="go('dash')">Dashboard</div><div class="nav" data-v="modules" onclick="go('modules')">Modules</div><div class="nav" data-v="free" onclick="go('free')">Simulation libre</div><div class="nav" data-v="board" onclick="go('board')">Classement</div><div class="nav" data-v="history" onclick="go('history')">Historique</div><div id="xp-box" style="margin-top:20px;background:var(--panel2);padding:10px;border-radius:10px;font-size:12px"></div></aside><div><div class="topbar"><div id="page-title">Dashboard</div><button class="btn ghost" onclick="logout()">Logout</button></div><main id="view"></main></div></div></div>
<div id="sim" class="hidden" style="position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column"><div class="topbar"><button class="btn ghost" onclick="quitSim()">Quitter</button><div id="sim-title"></div><div><span id="sim-rev" style="color:var(--ok)">0 $</span> <button class="btn primary" onclick="endSim()">Terminer & Noter</button></div></div><div style="display:grid;grid-template-columns:1fr 300px;flex:1;overflow:hidden"><div class="chat"><div id="thread" class="thread"></div><div style="padding:10px;border-top:1px solid var(--line);display:flex;gap:8px"><textarea id="input" rows="2" placeholder="Ton message..."></textarea><button class="btn primary" onclick="sendMsg()">Envoyer</button></div><div id="ppv-bar" class="hidden" style="padding:8px;background:#2a1f3d">PPV: <span id="ppv-label"></span> <input id="ppv-price" type="number" style="width:80px"> $ <button class="btn ghost" onclick="clearPPV()">x</button></div></div><div style="background:var(--panel);border-left:1px solid var(--line);padding:12px;overflow:auto"><h4>Fiche</h4><div id="crm"></div><h4 style="margin-top:12px">Vault</h4><div id="vault"></div></div></div></div>
<div id="report" class="hidden" style="position:fixed;inset:0;background:rgba(0,0,0,.8);display:grid;place-items:center;padding:20px"><div class="card" style="max-width:700px;width:100%;max-height:90vh;overflow:auto" id="report-body"></div></div>
<div id="toasts" style="position:fixed;bottom:20px;right:20px"></div>
<script>
var API='';var TOKEN=localStorage.getItem('tok');var SESSION=null;var VAULT=[];var PPV=null;
function $(id){return document.getElementById(id);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function toast(m){var e=document.createElement('div');e.textContent=m;e.style.background='#1b2230';e.style.padding='10px 14px';e.style.borderRadius='8px';e.style.marginTop='8px';$('toasts').appendChild(e);setTimeout(function(){e.remove();},3500);}
function api(p,o){o=o||{};o.headers=o.headers||{};o.headers['Content-Type']='application/json';if(TOKEN)o.headers['Authorization']='Bearer '+TOKEN;return fetch(API+p,o).then(function(r){return r.json().then(function(d){if(!r.ok) throw new Error(d.error||'erreur');return d;});});}
function logout(){localStorage.removeItem('tok');location.reload();}
function doLogin(){api('/api/login',{method:'POST',body:JSON.stringify({email:$('a-email').value,password:$('a-pass').value})}).then(function(d){TOKEN=d.token;localStorage.setItem('tok',TOKEN);boot();}).catch(function(e){$('a-err').textContent=e.message;});}
function doRegister(){api('/api/register',{method:'POST',body:JSON.stringify({name:$('a-name').value,email:$('a-email').value,password:$('a-pass').value})}).then(function(d){TOKEN=d.token;localStorage.setItem('tok',TOKEN);boot();}).catch(function(e){$('a-err').textContent=e.message;});}
function boot(){api('/api/me').then(function(me){VAULT=me.vault||[];$('auth').classList.add('hidden');$('app').classList.remove('hidden');$('xp-box').innerHTML='Nv.'+me.level.level+' '+me.level.name+'<br>'+me.user.xp+' XP<br>Streak '+me.user.streak_days+'j';go('dash');}).catch(function(){localStorage.removeItem('tok');});}
function go(v){document.querySelectorAll('.nav').forEach(function(n){n.classList.remove('active');});var el=document.querySelector('[data-v="'+v+'"]');if(el)el.classList.add('active');$('page-title').textContent=v;render(v);}
function render(v){var view=$('view');if(v==='dash'){api('/api/me').then(function(me){view.innerHTML='<div class="grid g4"><div class="card"><div style="font-size:24px">'+me.stats.sessions+'</div><div style="color:#8b96ab;font-size:12px">Sessions</div></div><div class="card"><div style="font-size:24px">'+me.stats.avg_score+'/100</div><div style="color:#8b96ab;font-size:12px">Moyenne</div></div><div class="card"><div style="font-size:24px">'+me.stats.close_rate+'%</div><div style="color:#8b96ab;font-size:12px">Closing</div></div><div class="card"><div style="font-size:24px">'+Math.round(me.stats.revenue)+'$</div><div style="color:#8b96ab;font-size:12px">CA simule</div></div></div>';});}
if(v==='modules'){api('/api/modules').then(function(mods){var h='<div class="grid g3">';mods.forEach(function(m){h+='<div class="card"><span class="badge">'+m.code+'</span> <span class="badge">Diff '+m.difficulty+'</span><h3 style="margin:8px 0">'+esc(m.title)+'</h3><p style="color:#8b96ab;font-size:13px">'+esc(m.goal)+'</p><div style="margin:8px 0;font-size:12px">Best '+m.best_score+'/100 Pass '+m.pass_score+'</div><button class="btn primary" onclick="startSim('+m.id+',\\'training\\','+m.difficulty+')">Demarrer</button></div>';});h+='</div>';view.innerHTML=h;});}
if(v==='free'){view.innerHTML='<div class="card" style="max-width:400px"><h3>Simulation libre</h3><select id="f-mode"><option value="training">Entrainement</option><option value="exam">Examen</option><option value="hard">Difficile</option></select><select id="f-diff" style="margin-top:8px"><option value="1">Diff 1</option><option value="2" selected>Diff 2</option><option value="3">Diff 3</option></select><button class="btn primary" style="width:100%;margin-top:10px" onclick="startSim(null,$(\'f-mode\').value,parseInt($(\'f-diff\').value))">Lancer</button></div>';}
if(v==='board'){api('/api/leaderboard').then(function(l){var h='<div class="card"><table style="width:100%;font-size:13px"><tr><th>#</th><th>Nom</th><th>XP</th><th>Moy</th><th>CA</th></tr>';l.forEach(function(u,i){h+='<tr><td>'+(i+1)+'</td><td>'+esc(u.name)+'</td><td>'+u.xp+'</td><td>'+u.avg_score+'</td><td>'+Math.round(u.revenue)+'$</td></tr>';});h+='</table></div>';view.innerHTML=h;});}
if(v==='history'){api('/api/history').then(function(hs){var h='<div class="card"><table style="width:100%;font-size:13px"><tr><th>#</th><th>Module</th><th>Score</th><th>CA</th><th>Date</th></tr>';hs.forEach(function(s){h+='<tr><td>'+s.id+'</td><td>'+esc(s.module_title||'Libre')+'</td><td>'+(s.score||'-')+'</td><td>'+s.revenue+'$</td><td>'+s.started_at.slice(0,16)+'</td></tr>';});h+='</table></div>';view.innerHTML=h;});}
}
var selPPV=null;
function attachPPV(ref){var v=VAULT.find(function(x){return x.ref===ref;});if(!v)return;PPV={ref:ref,price:v.min};$('ppv-label').textContent=ref+' '+v.label;$('ppv-price').value=v.min;$('ppv-bar').classList.remove('hidden');}
function clearPPV(){PPV=null;$('ppv-bar').classList.add('hidden');}
function push(role,text){var d=document.createElement('div');d.className='msg '+(role==='sub'?'sub':'me');d.textContent=text;$('thread').appendChild(d);$('thread').scrollTop=1e9;}
function startSim(modId,mode,diff){api('/api/sessions',{method:'POST',body:JSON.stringify({module_id:modId,mode:mode,difficulty:diff})}).then(function(s){SESSION=s;$('sim').classList.remove('hidden');$('thread').innerHTML='';$('sim-title').textContent=s.module_title||'Libre';$('sim-rev').textContent='0 $';$('crm').innerHTML='Nom: '+esc(s.crm.display_name)+'<br>Anciennete: '+s.crm.tenure_days+'j<br>LTV: '+s.crm.ltv+'$<br>Note: '+esc(s.crm.notes);var vh='';VAULT.forEach(function(v){vh+='<div class="vitem" onclick="attachPPV(\\''+v.ref+'\\')"><b>'+v.ref+'</b> '+esc(v.label)+' '+v.min+'-'+v.max+'$</div>';});$('vault').innerHTML=vh;push('sub',s.first_message);});}
function quitSim(){if(confirm('Quitter sans noter ?')){$('sim').classList.add('hidden');SESSION=null;}}
function sendMsg(){var txt=$('input').value.trim();if(!txt||!SESSION)return;$('input').value='';var ppv=PPV?{ref:PPV.ref,price:parseInt($('ppv-price').value)||PPV.price}:null;push('me',txt+(ppv?' [PPV '+ppv.ref+' '+ppv.price+'$]':''));clearPPV();api('/api/sessions/'+SESSION.session_id+'/message',{method:'POST',body:JSON.stringify({content:txt,ppv:ppv})}).then(function(d){if(d.purchase&&d.purchase.made){push('sub','[SYSTEM] PPV debloque '+d.purchase.amount+'$');$('sim-rev').textContent=d.revenue+' $';}if(d.reply) push('sub',d.reply);if(d.status!=='active'){push('sub','[FIN] '+d.status);}});}
function endSim(){if(!SESSION)return;api('/api/sessions/'+SESSION.session_id+'/end',{method:'POST'}).then(function(r){$('report').classList.remove('hidden');$('report-body').innerHTML='<div style="font-size:48px;font-weight:900;text-align:center">'+r.score_global+'/100</div><p style="text-align:center;color:#8b96ab">+'+r.xp_earned+' XP | '+r.outcome+' | '+r.revenue+'$</p><h4>Detail</h4><div>'+Object.keys(r.breakdown||{}).map(function(k){return '<div style="display:flex;justify-content:space-between;border-bottom:1px solid #252c3a;padding:6px 0"><span>'+k+'</span><b>'+r.breakdown[k]+'</b></div>';}).join('')+'</div><p style="margin-top:12px;color:#8b96ab;font-size:12px">Client: '+esc(r.persona_reveal.archetype)+' Budget cache: '+r.persona_reveal.budget_ceiling+'$</p><button class="btn primary" style="width:100%;margin-top:12px" onclick="document.getElementById(\\'report\\').classList.add(\\'hidden\\');document.getElementById(\\'sim\\').classList.add(\\'hidden\\');go(\\'dash\\')">Fermer</button>';});}
if(TOKEN) boot();
</script></body></html>`;

const server = http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS'){ res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}); return res.end(); }
  const url = new URL(req.url,'http://localhost');
  const pathName = url.pathname;

  if(pathName==='/' && req.method==='GET'){ res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); return res.end(HTML); }

  // API
  if(pathName.startsWith('/api/')){
    const body = await parseBody(req);
    const auth = (req.headers['authorization']||'').replace('Bearer ','');
    const userToken = auth ? verifyToken(auth) : null;

    // register
    if(pathName==='/api/register' && req.method==='POST'){
      const {name,email,password}=body;
      if(!email||!password) return json(res,400,{error:'email/password requis'});
      if(DB.users.find(u=>u.email===email.toLowerCase())) return json(res,409,{error:'email deja utilise'});
      const id = Date.now();
      const u = {id:id, name:name||email.split('@')[0], email:email.toLowerCase(), password_hash:hashPw(password), xp:0, level:1, streak_days:0, last_active:''};
      DB.users.push(u); saveDB();
      return json(res,200,{token:createToken(u)});
    }
    if(pathName==='/api/login' && req.method==='POST'){
      const {email,password}=body;
      const u = DB.users.find(x=>x.email===(email||'').toLowerCase());
      if(!u||!verifyPw(password||'',u.password_hash)) return json(res,401,{error:'identifiants invalides'});
      return json(res,200,{token:createToken(u)});
    }

    if(!userToken) return json(res,401,{error:'unauthorized'});
    const curUser = DB.users.find(u=>u.id===userToken.id);
    if(!curUser) return json(res,401,{error:'user not found'});

    if(pathName==='/api/me' && req.method==='GET'){
      const lvl = levelFor(curUser.xp);
      const vault = VAULT;
      const stats = (()=>{ const sess=DB.sessions.filter(s=>s.user_id===curUser.id && s.status!=='active'); const avg = sess.length? Math.round(sess.reduce((a,b)=>a+(b.score||0),0)/sess.length):0; const rev = sess.reduce((a,b)=>a+(b.revenue||0),0); const sales = sess.filter(s=>s.outcome==='converted').length; return {sessions:sess.length, avg_score:avg, revenue:rev, close_rate: sess.length? Math.round(sales/sess.length*100):0}; })();
      return json(res,200,{user:curUser, level:lvl, vault:vault, stats:stats});
    }
    if(pathName==='/api/modules' && req.method==='GET'){
      const prog = DB.progress.filter(p=>p.user_id===curUser.id);
      const mods = MODULES.map(m=>{ const p=prog.find(x=>x.module_id===m.id); return {...m, best_score:p?.best_score||0, completed:!!p?.completed}; });
      return json(res,200,mods);
    }
    if(pathName==='/api/leaderboard' && req.method==='GET'){
      const board = DB.users.map(u=>{ const sess=DB.sessions.filter(s=>s.user_id===u.id && s.status!=='active'); const avg=sess.length?Math.round(sess.reduce((a,b)=>a+(b.score||0),0)/sess.length):0; const rev=sess.reduce((a,b)=>a+(b.revenue||0),0); return {name:u.name,xp:u.xp,avg_score:avg,revenue:rev}; }).sort((a,b)=>b.xp-a.xp).slice(0,30);
      return json(res,200,board);
    }
    if(pathName==='/api/history' && req.method==='GET'){
      const hs = DB.sessions.filter(s=>s.user_id===curUser.id).slice(-50).reverse().map(s=>({id:s.id, module_title: (MODULES.find(m=>m.id===s.module_id)||{}).title, score:s.score, revenue:s.revenue, started_at:s.started_at}));
      return json(res,200,hs);
    }
    if(pathName==='/api/sessions' && req.method==='POST'){
      const modId = body.module_id || null;
      const mode = body.mode || 'training';
      const diff = body.difficulty || 2;
      const mod = MODULES.find(m=>m.id===modId);
      const pool = mod? mod.pool : Object.keys(PERSONAS);
      const persona = genPersona(pool, diff);
      const sessId = Date.now();
      const sess = {id:sessId, user_id:curUser.id, module_id:modId, mode:mode, difficulty:diff, persona:persona, state:persona.state, status:'active', revenue:0, turns:0, score:0, outcome:'', started_at:new Date().toISOString(), metrics:{offers:0, personal:0, early:0, pressure:0}};
      DB.sessions.push(sess);
      const firstMsg = persona.first;
      DB.messages.push({id:Date.now(), session_id:sessId, role:'sub', content:firstMsg});
      saveDB();
      return json(res,200,{session_id:sessId, module_title: mod?.title||null, crm:{display_name:persona.display_name, tenure_days: Math.floor(Math.random()*200), ltv: Math.floor(Math.random()*500), notes: persona.label+' - budget cache '+persona.budget+'$'}, first_message:firstMsg});
    }
    // message
    const mMatch = pathName.match(/^\/api\/sessions\/(\d+)\/message$/);
    if(mMatch && req.method==='POST'){
      const sid = parseInt(mMatch[1]); const sess = DB.sessions.find(s=>s.id===sid && s.user_id===curUser.id);
      if(!sess) return json(res,404,{error:'session not found'});
      if(sess.status!=='active') return json(res,400,{error:'session ended'});
      const content = body.content||''; const ppv = body.ppv||null;
      DB.messages.push({id:Date.now(), session_id:sid, role:'chatter', content: content + (ppv? ' [PPV '+ppv.ref+' '+ppv.price+'$]':'' )});
      sess.turns++;
      if(content.toLowerCase().includes(curUser.name.toLowerCase()) || content.toLowerCase().includes(sess.persona.display_name.toLowerCase())) sess.metrics.personal++;
      if(ppv){ sess.metrics.offers++; if(sess.turns<3) sess.metrics.early++; }
      const hist = DB.messages.filter(m=>m.session_id===sid).map(m=>({role:m.role, content:m.content}));
      let ai = await llmReply(sess.persona, sess.state, hist, 'Mode '+sess.mode);
      let turn;
      if(ai && ai.reply!==undefined){ turn = {reply: ai.reply, delta: ai.delta||{interest:0,trust:0,suspicion:0,patience:0}, purchase: ai.purchase||{made:false}, status: ai.status||'active', flags: ai.flags||[]}; }
      else { turn = localReply(sess.persona, sess.state, hist, content, ppv); }
      // apply delta
      sess.state.interest = clamp(sess.state.interest + (turn.delta.interest||0));
      sess.state.trust = clamp(sess.state.trust + (turn.delta.trust||0));
      sess.state.suspicion = clamp(sess.state.suspicion + (turn.delta.suspicion||0));
      sess.state.patience = clamp(sess.state.patience + (turn.delta.patience||0));
      if(turn.purchase && turn.purchase.made){
        if(turn.purchase.amount <= sess.state.budget_left){ sess.state.budget_left-=turn.purchase.amount; sess.state.spent+=turn.purchase.amount; sess.revenue+=turn.purchase.amount; }
        else turn.purchase.made=false;
      }
      if(turn.reply) DB.messages.push({id:Date.now()+1, session_id:sid, role:'sub', content:turn.reply});
      if(turn.status && turn.status!=='active') sess.status = turn.status;
      if(sess.state.interest<8) sess.status='lost';
      saveDB();
      return json(res,200,{reply:turn.reply, purchase:turn.purchase, status:sess.status, revenue:sess.revenue});
    }
    const eMatch = pathName.match(/^\/api\/sessions\/(\d+)\/end$/);
    if(eMatch && req.method==='POST'){
      const sid = parseInt(eMatch[1]); const sess = DB.sessions.find(s=>s.id===sid && s.user_id===curUser.id);
      if(!sess) return json(res,404,{error:'not found'});
      const msgs = DB.messages.filter(m=>m.session_id===sid);
      const report = gradeSession(sess, msgs);
      sess.score = report.score_global;
      sess.outcome = sess.revenue>0?'converted': sess.status==='lost'?'lost':'no_sale';
      sess.status='ended';
      // XP
      const xp = Math.round(report.score_global*1.2 + (sess.revenue>0?60:0));
      curUser.xp+=xp;
      curUser.level = levelFor(curUser.xp).level;
      // progress
      if(sess.module_id){ let p=DB.progress.find(x=>x.user_id===curUser.id && x.module_id===sess.module_id); if(!p){p={user_id:curUser.id, module_id:sess.module_id, best_score:0, attempts:0, completed:false}; DB.progress.push(p);} p.attempts++; p.best_score=Math.max(p.best_score, report.score_global); const mod=MODULES.find(m=>m.id===sess.module_id); if(report.score_global >= (mod?.pass||60)) p.completed=true; }
      saveDB();
      return json(res,200,{...report, xp_earned:xp, revenue:sess.revenue, outcome:sess.outcome, persona_reveal:{archetype:sess.persona.label, budget_ceiling:sess.persona.budget}});
    }
    return json(res,404,{error:'not found'});
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, ()=> console.log('OFM Trainer running on http://localhost:'+PORT));

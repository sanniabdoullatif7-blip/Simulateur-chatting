const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-moi-en-prod-avec-une-longue-cle-aleatoire';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DATA_FILE = path.join(__dirname, 'data.json');

let DB = { users: [], sessions: [], messages: [], progress: [], user_badges: [], xp_events: [] };
try {
  if (fs.existsSync(DATA_FILE)) {
    DB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
} catch (e) { }
function saveDB() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2));
  } catch (e) { }
}

const LEVELS = [
  { level: 1, name: 'Trainee', xp: 0 },
  { level: 2, name: 'Rookie', xp: 300 },
  { level: 3, name: 'Junior', xp: 800 },
  { level: 4, name: 'Chatter', xp: 1600 },
  { level: 5, name: 'Closer', xp: 2800 },
  { level: 6, name: 'Senior', xp: 4500 },
  { level: 7, name: 'Elite', xp: 7000 },
  { level: 8, name: 'Leader', xp: 10500 }
];
function levelFor(xp) {
  let l = LEVELS[0];
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp) l = LEVELS[i];
  }
  return l;
}

const VAULT = [
  { ref: 'VAULT_01', label: 'Album teasing - 6 photos', min: 9, max: 15, tier: 'soft' },
  { ref: 'VAULT_02', label: 'Album lingerie - 12 photos', min: 15, max: 25, tier: 'soft' },
  { ref: 'VAULT_03', label: 'Vidéo courte - 2m40', min: 20, max: 35, tier: 'mid' },
  { ref: 'VAULT_04', label: 'Vidéo fitness - 3m10', min: 25, max: 40, tier: 'mid' },
  { ref: 'VAULT_05', label: 'Message audio personnalisé', min: 12, max: 25, tier: 'soft' },
  { ref: 'VAULT_06', label: 'Pack découverte - 3 médias', min: 35, max: 55, tier: 'mid' },
  { ref: 'VAULT_07', label: 'Vidéo JOI - 7m30', min: 50, max: 85, tier: 'premium' },
  { ref: 'VAULT_08', label: 'Bundle BestOf - 18m', min: 80, max: 140, tier: 'premium' },
  { ref: 'VAULT_10', label: 'Bundle VIP - 30m+', min: 150, max: 400, tier: 'vip' }
];

const MODULES = [
  { id: 1, code: 'M01', title: 'Onboarding & CRM', goal: 'Lire et exploiter la fiche abonné', brief: 'Lis la fiche avant d\'écrire. Prends au moins une information utile.', pool: ['NEW', 'RETURNING'], diff: 1, pass: 60, reward: 100 },
  { id: 2, code: 'M02', title: 'Réussir l\'accroche', goal: 'Ouverture naturelle et personnalisée', brief: 'Pas de message générique. Prouve que tu as bien lu sa réponse.', pool: ['NEW', 'COLD'], diff: 1, pass: 60, reward: 120 },
  { id: 3, code: 'M03', title: 'Créer une connexion', goal: 'Installer du confort sans vendre', brief: 'Zéro PPV sur ce module. Fais-le parler et crée une vraie connexion.', pool: ['COLD', 'ENGAGED'], diff: 1, pass: 65, reward: 150 },
  { id: 4, code: 'M04', title: 'Découverte du client', goal: 'Qualifier sans interrogatoire', brief: 'Découvre au moins une préférence sans poser 3 questions d\'affilée.', pool: ['CURIOUS', 'SPENDER'], diff: 2, pass: 65, reward: 180 },
  { id: 5, code: 'M05', title: 'Teasing & curiosité', goal: 'Créer le désir avant l\'offre', brief: 'Donne envie d\'en voir plus, sans tout dévoiler.', pool: ['ENGAGED', 'CURIOUS'], diff: 2, pass: 65, reward: 200 },
  { id: 6, code: 'M06', title: 'Timing du PPV', goal: 'Proposer au bon moment', brief: 'Propose uniquement sur des signaux d\'intérêt suffisants.', pool: ['ENGAGED', 'SPENDER'], diff: 2, pass: 70, reward: 250 },
  { id: 7, code: 'M07', title: 'Gestion de l\'objection prix', goal: 'Défendre la valeur sans baisser tout de suite', brief: 'Ne baisse jamais le prix à la première objection.', pool: ['PRICE'], diff: 2, pass: 70, reward: 250 },
  { id: 8, code: 'M08', title: 'Le gratteur (Freebie)', goal: 'Défendre la valeur sans agressivité', brief: 'Gère une demande de gratuit de manière naturelle.', pool: ['FREE'], diff: 2, pass: 70, reward: 280 },
  { id: 9, code: 'M09', title: 'Ghost après l\'offre', goal: 'Relance intelligente', brief: 'Le client disparaît après l\'offre. Fais une relance avec un vrai motif.', pool: ['GHOST'], diff: 3, pass: 70, reward: 300 },
  { id: 10, code: 'M10', title: 'Après-vente & fidélisation', goal: 'Maintenir la relation après un achat', brief: 'Prends en compte le retour du client après un achat fictif.', pool: ['RETURNING', 'UNHAPPY'], diff: 3, pass: 70, reward: 300 },
  { id: 11, code: 'M11', title: 'Client complexe (Hybride)', goal: 'Gérer plusieurs difficultés simultanément', brief: 'Combine plusieurs profils. S\'adapter sans perdre son naturel.', pool: ['TESTER', 'SPENDER', 'PRICE'], diff: 3, pass: 70, reward: 400 },
  { id: 12, code: 'M12', title: 'EXAMEN FINAL', goal: 'Conversation complète du début à la fin', brief: 'Profil aléatoire, aucune aide pendant l\'échange.', pool: ['NEW', 'CURIOUS', 'FREE', 'PRICE', 'SPENDER', 'COLD', 'ENGAGED', 'RETURNING', 'GHOST', 'UNHAPPY', 'TESTER'], diff: 3, pass: 75, reward: 600 }
];

const PERSONAS = {
  NEW: { label: 'Le Nouveau', first: ['salut je viens d\'arriver', 'hello première fois ici', 'je découvre un peu'], base: [35, 27, 18, 78], budget: [12, 65], intent: '' },
  CURIOUS: { label: 'Le Curieux', first: ['tu proposes quoi comme contenu ?', 'c\'est quoi la différence entre tes photos et vidéos ?', 'tu as quoi de disponible ?'], base: [49, 42, 20, 86], budget: [20, 85], intent: 'signal' },
  FREE: { label: 'Celui qui veut du gratuit', first: ['tu peux m\'envoyer un petit aperçu gratuit ?', 'juste une photo gratuite stp', 'on peut voir un exemple sans payer ?'], base: [45, 30, 22, 85], budget: [0, 16], intent: 'free' },
  PRICE: { label: 'Sensible au prix', first: ['ça coûte combien ?', 'j\'ai pas un gros budget aujourd\'hui', 'j\'aime bien mais je fais attention aux prix'], base: [55, 40, 30, 75], budget: [14, 37], intent: 'price' },
  SPENDER: { label: 'Le Dépensier', first: ['hey tu te souviens de ce que j\'aimais ?', 'quoi de neuf depuis mon dernier passage ?', 'je reviens voir s\'il y a du nouveau'], base: [61, 54, 29, 68], budget: [85, 260], intent: '' },
  COLD: { label: 'Le Client froid', first: ['salut', 'hey', 'yo', 'ça va'], base: [22, 26, 33, 95], budget: [12, 60], intent: '' },
  ENGAGED: { label: 'Très engagé', first: ['content de te retrouver !', 'j\'ai vu ton dernier post, ça m\'a bien plu', 'je suis là pour discuter un peu'], base: [69, 59, 14, 90], budget: [35, 135], intent: '' },
  RETURNING: { label: 'Ancien client', first: ['j\'avais acheté la dernière fois', 'je suis de retour, t\'as du nouveau ?', 'ça fait un moment depuis notre dernier échange'], base: [55, 61, 23, 76], budget: [40, 170], intent: '' },
  GHOST: { label: 'Disparaît après l\'offre', first: ['salut tu as du nouveau aujourd\'hui ?', 'je passe voir ce que tu proposes', 'j\'ai un peu de temps pour discuter'], base: [58, 50, 23, 75], budget: [25, 95], intent: '' },
  UNHAPPY: { label: 'Déçu', first: ['le dernier média ne ressemblait pas à la description', 'j\'étais un peu déçu par mon dernier achat', 'je voulais te dire que mon dernier achat m\'a laissé sur ma faim'], base: [27, 20, 65, 57], budget: [20, 90], intent: 'unhappy' },
  TESTER: { label: 'Testeur de cohérence', first: ['c\'était quel prix la dernière fois ?', 'tes offres ont changé ?', 'je vérifie juste pour voir si c\'est cohérent'], base: [46, 32, 52, 82], budget: [35, 135], intent: '' },
  RUSHED: { label: 'Pressé', first: ['j\'ai 5 minutes, tu as quoi ?', 'fais court stp', 'vite fait, tu proposes quoi ?'], base: [58, 42, 25, 37], budget: [30, 110], intent: 'signal' }
};

const NAMES = ['Mike', 'Tom', 'Chris', 'David', 'Ryan', 'Alex', 'Sam', 'Nico', 'Marco', 'Julien', 'Dan', 'Paul', 'Lucas', 'Max'];
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function clamp(n, a, b) { if (a === undefined) a = 0; if (b === undefined) b = 100; return Math.max(a, Math.min(b, Math.round(n))); }

function hashPw(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const h = crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex');
  return salt + ':' + h;
}
function verifyPw(pw, stored) {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const s = parts[0];
  const h = crypto.pbkdf2Sync(pw, s, 10000, 64, 'sha512').toString('hex');
  return h === parts[1];
}
function b64u(s) { return Buffer.from(s).toString('base64url'); }
function createToken(u) {
  const head = b64u(JSON.stringify({ alg: 'HS256' }));
  const pay = b64u(JSON.stringify({ id: u.id, name: u.name, exp: Date.now() + 30 * 24 * 3600 * 1000 }));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(head + '.' + pay).digest('base64url');
  return head + '.' + pay + '.' + sig;
}
function verifyToken(t) {
  try {
    const p = t.split('.');
    if (p.length !== 3) return null;
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(p[0] + '.' + p[1]).digest('base64url');
    if (sig !== p[2]) return null;
    const data = JSON.parse(Buffer.from(p[1], 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch (e) { return null; }
}

function genPersona(pool, diff) {
  const code = pick(pool);
  const base = PERSONAS[code] || PERSONAS.NEW;
  const budget = Math.round(base.budget[0] + Math.random() * (base.budget[1] - base.budget[0]));
  return {
    code: code, label: base.label,
    display_name: pick(NAMES) + (Math.random() > 0.5 ? Math.floor(Math.random() * 90) : ''),
    first: pick(base.first),
    budget: budget,
    intent: base.intent,
    state: { interest: clamp(base.base[0] + (diff == 1 ? 10 : diff == 3 ? -10 : 0)), trust: clamp(base.base[1]), suspicion: clamp(base.base[2] + (diff == 3 ? 12 : 0)), patience: clamp(base.base[3]), budget_left: budget, spent: 0 }
  };
}

function localReply(persona, state, history, userMsg, offer) {
  const low = (userMsg || '').toLowerCase();
  let delta = { interest: 0, trust: 0, suspicion: 0, patience: 0 };
  let signals = [];
  let purchase = { made: false, amount: 0, ref: null };
  let status = 'active';
  let flags = [];
  let reply = '';

  if (offer) {
    if (history.length < 4) {
      delta.interest -= 12; delta.suspicion += 12;
      flags.push({ type: 'pitch_too_early', severity: 'high', evidence: userMsg });
      reply = pick(['Déjà une offre ? On vient à peine de commencer à discuter.', 'Ça va un peu vite là pour moi.', 'On peut parler un peu avant l\'offre ?']);
    } else if (offer.price > state.budget_left) {
      delta.interest -= 5; signals.push('objection_raised');
      reply = pick(['Ça dépasse mon budget là.', 'C\'est trop cher pour moi aujourd\'hui.', 'Je n\'ai pas ça maintenant.']);
    } else if (state.interest < 55) {
      reply = pick(['Je sais pas encore...', 'Laisse-moi y réfléchir un peu.', 'Je ne suis pas encore décidé.']);
      delta.interest -= 2;
    } else {
      if (Math.random() < 0.62) {
        purchase.made = true; purchase.amount = offer.price; purchase.ref = offer.ref;
        state.budget_left -= offer.price; state.spent += offer.price;
        reply = pick(['Ok je l\'ai pris.', 'C\'est bon, je viens de le débloquer.', 'Je l\'ai acheté, merci.']);
        status = 'converted';
      } else {
        reply = pick(['Ça me tente bien là.', 'L\'idée me plaît.', 'Ça a l\'air pas mal.']);
        signals.push('ready_to_buy');
      }
    }
  } else {
    if (low.includes('gratuit') || low.includes('gratuitement')) signals.push('objection_raised');
    if (low.includes('prix') || low.includes('cher') || low.includes('combien')) signals.push('asks_price');
    if (low.includes('?')) delta.interest += 2;
    if (low.includes(persona.display_name.toLowerCase())) { delta.trust += 5; delta.interest += 3; flags.push({ type: 'good_personalization', severity: 'low', evidence: userMsg }); }

    if (persona.code === 'COLD') {
      reply = pick(['ouais', 'ok', 'mdr', 'peut-être', 'je sais pas']);
    } else if (persona.code === 'FREE') {
      reply = pick(['Tu peux pas m\'envoyer juste un petit aperçu ?', 'Juste une photo pour voir stp ?', 'Allez, un mini aperçu gratuit ?']);
      signals.push('asks_preview');
    } else if (persona.code === 'PRICE') {
      reply = pick(['C\'est combien ?', 'Tu peux faire moins ?', 'J\'ai que 20$ là.']);
    } else if (persona.code === 'GHOST' && history.filter(m => m.role === 'chatter').length >= 2 && Math.random() < 0.55) {
      reply = ''; status = 'ghosted';
    } else if (state.interest > 65) {
      reply = pick(['Tu as quoi de dispo dans ce style ?', 'Qu\'est-ce que tu me conseillerais ?', 'Je suis curieux là.']);
      signals.push('asks_content');
    } else {
      reply = pick(['Ah ok je vois.', 'Je suis posé, je peux discuter un peu.', 'Ça dépend un peu de ce que tu as en tête.', 'Pas mal.']);
    }
    if (low.length < 3) delta.interest -= 1;
  }

  if (state.interest < 8) status = 'lost';
  if (state.patience < 8) status = 'ghosted';

  return { reply: reply, typing: 800 + Math.floor(Math.random() * 2200), delta: delta, signals: signals, purchase: purchase, status: status, flags: flags };
}

async function llmReply(persona, state, history, systemExtra) {
  if (!OPENAI_API_KEY) return null;
  try {
    const sys = 'Tu es un client OnlyFans simulé. Incarne UNIQUEMENT le client (jamais l\'assistant). Réponds uniquement en JSON strict: {"reply":string,"delta":{"interest":number,"trust":number,"suspicion":number,"patience":number},"signals":[],"purchase":{"made":boolean,"amount":number,"ref":string},"status":"active|ghosted|lost|converted","flags":[]}. Persona: ' + persona.label + ', budget max ' + persona.budget + '$, état: ' + JSON.stringify(state) + ' ' + (systemExtra || '');
    const msgs = [{ role: 'system', content: sys }].concat(history.slice(-12).map(m => ({ role: m.role === 'sub' ? 'assistant' : 'user', content: m.content })));
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_API_KEY },
      body: JSON.stringify({ model: OPENAI_MODEL, temperature: 0.95, response_format: { type: 'json_object' }, messages: msgs })
    });
    const j = await r.json();
    const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!txt) return null;
    return JSON.parse(txt);
  } catch (e) { return null; }
}

function gradeSession(session, msgs) {
  const m = session.metrics || { offers: 0, personal: 0, early: 0, pressure: 0 };
  let score = 60;
  if (m.personal > 0) score += 10;
  if (m.early > 0) score -= 18;
  if (m.offers === 0 && session.revenue === 0) score -= 5;
  if (session.revenue > 0) score += 15;
  if (m.pressure > 1) score -= 15;
  score = clamp(score, 0, 100);
  const breakdown = { accroche: clamp(6 + (m.personal ? 3 : 0)), connexion: clamp(10 + (m.personal ? 3 : 0)), decouverte: 10, desir: 10, timing: clamp(10 - (m.early ? 6 : 0)), presentation: 10, objections: 10, relance: 5, naturel: 5 };
  let total = 0; Object.values(breakdown).forEach(v => total += v);
  const factor = score / (total || 1);
  Object.keys(breakdown).forEach(k => {
    let maxv = k === 'accroche' ? 10 : (k === 'relance' || k === 'naturel' ? 5 : (k === 'presentation' || k === 'objections' ? 10 : 15));
    breakdown[k] = clamp(breakdown[k] * factor * 1.05, 0, maxv);
  });
  let sum = 0; Object.values(breakdown).forEach(v => sum += v);
  sum = clamp(sum, 0, 100);
  return {
    score_global: sum,
    breakdown: breakdown,
    points_forts: m.personal ? ['Bonne personnalisation'] : ['Conversation terminée'],
    points_a_ameliorer: m.early ? ['Offre trop précoce'] : ['Peux affiner le timing'],
    erreur_principale: { titre: m.early ? 'Vente trop rapide' : 'À améliorer', citation: (msgs.find(x => x.role === 'chatter') || { content: '' }).content.slice(0, 90), explication: 'Le client a ressenti une précipitation dans l\'échange.' },
    ce_qui_aurait_pu_etre_mieux_fait: [],
    conseil_prochaine_simulation: 'Rebondis sur au moins une information personnelle avant de proposer un média.',
    verdict: sum >= 75 ? 'bon' : sum >= 55 ? 'passable' : 'a_reprendre'
  };
}

const HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OFM Trainer - Simulateur de Chatting</title>
<style>
:root{--bg:#0b0e14;--panel:#141922;--panel2:#1b2230;--line:#252c3a;--txt:#e6ebf4;--dim:#8b96ab;--acc:#7c5cff;--ok:#22c55e;--warn:#f59e0b;--danger:#ef4444}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--txt);overflow:hidden}
.hidden{display:none!important}.btn{border:0;border-radius:9px;padding:9px 16px;font-weight:600;cursor:pointer;transition:.15s;font-size:14px}
.btn.primary{background:var(--acc);color:#fff}.btn.primary:hover{filter:brightness(1.08)}.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--dim)}.btn.ghost:hover{border-color:var(--acc);color:var(--txt)}
input,textarea,select{background:var(--panel2);border:1px solid var(--line);color:var(--txt);padding:9px 10px;border-radius:9px;width:100%;font-size:14px;outline:none}input:focus,textarea:focus,select:focus{border-color:var(--acc)}
.layout{display:grid;grid-template-columns:220px 1fr;min-height:100vh;height:100vh}.sidebar{background:var(--panel);border-right:1px solid var(--line);padding:18px;display:flex;flex-direction:column;gap:6px}.brand{font-weight:900;letter-spacing:2px;margin-bottom:20px;font-size:15px}
.nav{padding:10px 12px;border-radius:8px;color:var(--dim);cursor:pointer;margin-bottom:4px;font-size:14px;user-select:none}.nav:hover{background:var(--panel2);color:var(--txt)}.nav.active{background:var(--acc);color:#fff}
.topbar{padding:12px 20px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;height:56px;background:var(--bg);z-index:2}
main{padding:20px;overflow:auto;height:calc(100vh - 56px)}.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px}
.grid{display:grid;gap:12px}.g3{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}.g4{grid-template-columns:repeat(4,1fr)}
.badge{font-size:11px;background:var(--panel2);padding:3px 8px;border-radius:20px;color:var(--dim);display:inline-block}
.chat{display:flex;flex-direction:column;height:100%}.thread{flex:1;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:14px;background:radial-gradient(ellipse at top,rgba(124,92,255,0.05),transparent 70%)}
.msg{max-width:78%;padding:9px 14px;border-radius:14px;font-size:14px;white-space:pre-wrap;word-wrap:break-word;line-height:1.5}.msg.sub{background:var(--panel2);align-self:flex-start;border-bottom-left-radius:6px}.msg.me{background:var(--acc);align-self:flex-end;border-bottom-right-radius:6px;color:#fff}.msg.sys{background:rgba(245,158,11,.15);color:#f5d08a;align-self:center;font-size:12px;border:1px solid rgba(245,158,11,.35)}
.vitem{padding:8px 9px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;cursor:pointer;font-size:12px;line-height:1.4}.vitem:hover{border-color:var(--acc);background:rgba(124,92,255,.08)}
.auth{height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at top,rgba(124,92,255,.12),transparent 70%)}.auth-card{background:var(--panel);padding:30px;border-radius:14px;width:360px;display:flex;flex-direction:column;gap:10px;border:1px solid var(--line);box-shadow:0 20px 80px -20px rgba(124,92,255,.4)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--dim);font-weight:600}
#sim{position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;z-index:10}#report{position:fixed;inset:0;background:rgba(0,0,0,.85);display:grid;place-items:center;padding:20px;z-index:20;backdrop-filter:blur(4px)}
#toasts{position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:30}
.toast{background:var(--panel2);padding:10px 14px;border-radius:10px;border:1px solid var(--line);box-shadow:0 10px 40px -10px rgba(0,0,0,.5);font-size:13px;animation:fade .25s ease}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:900px){.layout{grid-template-columns:1fr}.sidebar{position:absolute;left:0;top:0;bottom:0;width:220px;transform:translateX(-100%);transition:.2s;z-index:5}.layout.open .sidebar{transform:translateX(0)}.g4{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<div id="auth" class="auth">
  <div class="auth-card">
    <h2 style="margin-bottom:6px">OFM TRAINER</h2>
    <p style="color:var(--dim);font-size:13px;margin-bottom:6px">Simulateur d'entraînement au chatting</p>
    <input id="a-name" placeholder="Nom d'affichage (inscription uniquement)">
    <input id="a-email" type="email" placeholder="Email">
    <input id="a-pass" type="password" placeholder="Mot de passe">
    <button class="btn primary" onclick="doLogin()">Se connecter</button>
    <button class="btn ghost" onclick="doRegister()">Créer un compte</button>
    <div id="a-err" style="color:var(--danger);font-size:12px;min-height:16px"></div>
    <p style="font-size:11px;color:var(--dim);margin-top:4px">Le backend est partagé entre tous les chatters. Progression enregistrée sur le serveur.</p>
  </div>
</div>

<div id="app" class="hidden">
  <div class="layout" id="layout">
    <aside class="sidebar">
      <div class="brand">OFM<span style="color:var(--acc)">TRAINER</span></div>
      <div class="nav active" data-v="dash" onclick="go('dash')">📊 Tableau de bord</div>
      <div class="nav" data-v="modules" onclick="go('modules')">📚 Parcours (12 modules)</div>
      <div class="nav" data-v="free" onclick="go('free')">💬 Simulation libre</div>
      <div class="nav" data-v="board" onclick="go('board')">🏆 Classement</div>
      <div class="nav" data-v="history" onclick="go('history')">🕘 Historique</div>
      <div style="flex:1"></div>
      <div id="xp-box" style="background:var(--panel2);padding:10px;border-radius:10px;font-size:12px;line-height:1.5"></div>
    </aside>
    <div style="display:flex;flex-direction:column;height:100vh">
      <div class="topbar">
        <div style="display:flex;align-items:center;gap:10px">
          <button class="btn ghost" style="padding:6px 10px" onclick="toggleMenu()">☰</button>
          <div id="page-title">Tableau de bord</div>
        </div>
        <button class="btn ghost" onclick="logout()">Déconnexion</button>
      </div>
      <main id="view"></main>
    </div>
  </div>
</div>

<div id="sim" class="hidden">
  <div class="topbar">
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn ghost" onclick="quitSim()">← Quitter</button>
      <div id="sim-title"></div>
    </div>
    <div style="display:flex;gap:10px;align-items:center">
      <div style="color:var(--ok);font-weight:700"><span id="sim-rev">0</span> $ simulés</div>
      <button class="btn primary" onclick="endSim()">Terminer & Noter</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 320px;flex:1;overflow:hidden;height:calc(100vh - 56px)">
    <div class="chat" style="border-right:1px solid var(--line)">
      <div id="thread" class="thread"></div>
      <div style="padding:10px;border-top:1px solid var(--line);background:var(--panel);display:flex;flex-direction:column;gap:8px">
        <div id="ppv-bar" class="hidden" style="padding:8px 10px;background:rgba(124,92,255,.15);border:1px solid rgba(124,92,255,.4);border-radius:10px;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div>PPV joint : <span id="ppv-label"></span></div>
          <div style="display:flex;align-items:center;gap:6px">
            <input id="ppv-price" type="number" min="1" step="1" style="width:70px;padding:6px 8px">
            <span>$</span>
            <button class="btn ghost" style="padding:6px 8px" onclick="clearPPV()">Retirer</button>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <textarea id="input" rows="2" placeholder="Écris ton message ici... (Entrée pour envoyer, Maj+Entrée pour sauter une ligne)"></textarea>
          <button class="btn primary" style="align-self:flex-end" onclick="sendMsg()">Envoyer</button>
        </div>
        <div style="color:var(--dim);font-size:11px">Le client est simulé. Aucune transaction réelle n'a lieu.</div>
      </div>
    </div>
    <div style="background:var(--panel);padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px">
      <div class="card" style="margin:0">
        <h4 style="margin-bottom:8px">Fiche abonné</h4>
        <div id="crm" style="font-size:13px;line-height:1.8"></div>
      </div>
      <div class="card" style="margin:0;flex:1;overflow:auto">
        <h4 style="margin-bottom:8px">Vault · Médias fictifs</h4>
        <p style="color:var(--dim);font-size:12px;margin-bottom:8px">Clique pour joindre un PPV à ton message</p>
        <div id="vault"></div>
      </div>
    </div>
  </div>
</div>

<div id="report" class="hidden">
  <div class="card" style="max-width:760px;width:100%;max-height:90vh;overflow:auto">
    <div id="report-body"></div>
  </div>
</div>

<div id="toasts"></div>

<script>
var API='';var TOKEN=localStorage.getItem('tok');var SESSION=null;var VAULT=[];var PPV=null;
function $(id){return document.getElementById(id)}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function toast(m){var e=document.createElement('div');e.className='toast';e.textContent=m;$('toasts').appendChild(e);setTimeout(function(){e.remove()},3800)}
function api(p,o){o=o||{};o.headers=o.headers||{};o.headers['Content-Type']='application/json';if(TOKEN)o.headers['Authorization']='Bearer '+TOKEN;return fetch(API+p,o).then(function(r){return r.json().then(function(d){if(!r.ok) throw new Error(d.error||'Erreur');return d;});});}
function toggleMenu(){$('layout').classList.toggle('open')}
function logout(){localStorage.removeItem('tok');TOKEN=null;location.reload()}
function doLogin(){var e=$('a-email').value.trim(),pw=$('a-pass').value;api('/api/login',{method:'POST',body:JSON.stringify({email:e,password:pw})}).then(function(d){TOKEN=d.token;localStorage.setItem('tok',TOKEN);boot();}).catch(function(e){$('a-err').textContent=e.message})}
function doRegister(){var n=$('a-name').value.trim(),e=$('a-email').value.trim(),pw=$('a-pass').value;api('/api/register',{method:'POST',body:JSON.stringify({name:n,email:e,password:pw})}).then(function(d){TOKEN=d.token;localStorage.setItem('tok',TOKEN);boot();}).catch(function(e){$('a-err').textContent=e.message})}
function boot(){api('/api/me').then(function(me){VAULT=me.vault||[];$('auth').classList.add('hidden');$('app').classList.remove('hidden');var lvl=me.level||{};$('xp-box').innerHTML='Niveau '+lvl.level+' · '+esc(lvl.name)+'<br>'+me.user.xp+' XP<br>Série '+(me.user.streak_days||0)+' j';go('dash');}).catch(function(){localStorage.removeItem('tok');TOKEN=null})}
function go(v){document.querySelectorAll('.nav').forEach(function(n){n.classList.remove('active')});var el=document.querySelector('[data-v="'+v+'"]');if(el)el.classList.add('active');$('page-title').textContent=(v==='dash'?'Tableau de bord':v==='modules'?'Parcours de formation':v==='free'?'Simulation libre':v==='board'?'Classement':v==='history'?'Historique':'');$('layout').classList.remove('open');render(v)}
function render(v){var view=$('view');if(v==='dash'){api('/api/me').then(function(me){var s=me.stats||{};view.innerHTML='<div class="grid g4"><div class="card"><div style="font-size:26px;font-weight:800">'+(s.sessions||0)+'</div><div style="color:var(--dim);font-size:12px;margin-top:4px">Simulations terminées</div></div><div class="card"><div style="font-size:26px;font-weight:800">'+(s.avg_score||0)+'/100</div><div style="color:var(--dim);font-size:12px;margin-top:4px">Score moyen</div></div><div class="card"><div style="font-size:26px;font-weight:800">'+(s.close_rate||0)+'%</div><div style="color:var(--dim);font-size:12px;margin-top:4px">Taux de closing</div></div><div class="card"><div style="font-size:26px;font-weight:800">'+Math.round(s.revenue||0)+' $</div><div style="color:var(--dim);font-size:12px;margin-top:4px">CA simulé</div></div></div><div class="card" style="max-width:640px"><h3 style="margin-bottom:6px">Bienvenue '+esc(me.user.name)+'</h3><p style="color:var(--dim);font-size:14px;line-height:1.6">Progresse module par module pour débloquer le suivant. Le simulateur incarne un abonné réaliste (hésitant, méfiant ou dépensier selon le profil). À chaque échange, l\'intérêt évolue selon la qualité de ton approche.</p></div>'})}
if(v==='modules'){api('/api/modules').then(function(mods){var h='<div class="grid g3">';mods.forEach(function(m){h+='<div class="card"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><span class="badge">'+esc(m.code)+'</span><span class="badge">Difficulté '+m.difficulty+'/3</span>'+(m.completed?'<span class="badge" style="color:var(--ok)">Validé</span>':'')+'</div><h3 style="margin:4px 0 8px">'+esc(m.title)+'</h3><p style="color:var(--dim);font-size:13px;line-height:1.5;min-height:40px">'+esc(m.goal)+'</p><div style="margin:10px 0;font-size:12px;color:var(--dim)">Meilleur : '+(m.best_score||0)+'/100 · Seuil : '+(m.pass_score||m.pass||60)+'/100</div><button class="btn primary" style="width:100%" onclick="startSim('+m.id+',\'training\','+m.difficulty+')">S\'entraîner</button></div>';});h+='</div>';view.innerHTML=h})}
if(v==='free'){view.innerHTML='<div class="card" style="max-width:420px"><h3 style="margin-bottom:10px">Simulation libre</h3><label style="font-size:12px;color:var(--dim)">Mode</label><select id="f-mode"><option value="training">Entraînement · retour détaillé</option><option value="exam">Examen · note uniquement</option><option value="hard">Difficile · profils combinés</option></select><label style="font-size:12px;color:var(--dim);margin-top:10px;display:block">Difficulté</label><select id="f-diff"><option value="1">1 - Débutant</option><option value="2" selected>2 - Intermédiaire</option><option value="3">3 - Avancé</option></select><button class="btn primary" style="width:100%;margin-top:14px" onclick="startSim(null,$(\'f-mode\').value,parseInt($(\'f-diff\').value))">Démarrer la conversation</button><p style="color:var(--dim);font-size:12px;margin-top:10px;line-height:1.5">Le profil, son budget et son niveau d\'intérêt restent cachés jusqu\'à la fin de la simulation.</p></div>'}
if(v==='board'){api('/api/leaderboard').then(function(l){var h='<div class="card"><table><thead><tr><th>#</th><th>Nom</th><th>XP</th><th>Score moyen</th><th>CA simulé</th></tr></thead><tbody>';l.forEach(function(u,i){var medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);h+='<tr><td>'+medal+'</td><td>'+esc(u.name)+'</td><td>'+u.xp+'</td><td>'+(u.avg_score||0)+'/100</td><td>'+Math.round(u.revenue||0)+' $</td></tr>'});h+='</tbody></table></div>';view.innerHTML=h})}
if(v==='history'){api('/api/history').then(function(hs){var h='<div class="card"><table><thead><tr><th>ID</th><th>Exercice</th><th>Score</th><th>Ventes</th><th>CA</th><th>Date</th></tr></thead><tbody>';if(!hs.length){h+='<tr><td colspan="6" style="color:var(--dim);text-align:center">Aucune simulation terminée pour le moment</td></tr>'}hs.forEach(function(s){h+='<tr><td>#'+s.id+'</td><td>'+esc(s.module_title||'Simulation libre')+'</td><td>'+(s.score!==null&&s.score!==undefined?s.score+'/100':'-')+'</td><td>'+(s.sales||0)+'</td><td>'+Math.round(s.revenue||0)+' $</td><td>'+esc(s.started_at.slice(0,16).replace('T',' '))+'</td></tr>'});h+='</tbody></table></div>';view.innerHTML=h})}
}
function attachPPV(ref){var v=VAULT.find(function(x){return x.ref===ref});if(!v)return;PPV={ref:ref,price:v.min};$('ppv-label').textContent=v.ref+' · '+v.label;$('ppv-price').value=v.min;$('ppv-bar').classList.remove('hidden')}
function clearPPV(){PPV=null;$('ppv-bar').classList.add('hidden')}
function push(role,text){var d=document.createElement('div');d.className='msg '+(role==='sub'?'sub':role==='me'?'me':'sys');d.textContent=text;$('thread').appendChild(d);$('thread').scrollTop=$('thread').scrollHeight}
function startSim(modId,mode,diff){api('/api/sessions',{method:'POST',body:JSON.stringify({module_id:modId,mode:mode,difficulty:diff})}).then(function(s){SESSION=s;$('sim').classList.remove('hidden');$('thread').innerHTML='';$('sim-title').textContent=s.module_title||'Simulation libre';$('sim-rev').textContent='0';$('crm').innerHTML='<div>Nom : <b>'+esc(s.crm.display_name)+'</b></div><div>Ancienneté : '+s.crm.tenure_days+' j</div><div>Dépenses historiques (LTV) : '+s.crm.ltv+' $</div><div style="margin-top:8px;color:var(--dim)">'+esc(s.crm.notes)+'</div>';var vh='';VAULT.forEach(function(v){vh+='<div class="vitem" onclick="attachPPV(\''+v.ref+'\')"><b>'+v.ref+'</b> · '+esc(v.label)+'<div style="color:var(--dim)">'+v.min+'–'+v.max+' $</div></div>'});$('vault').innerHTML=vh;push('sub',s.first_message)})}
function quitSim(){if(confirm('Quitter cette simulation sans l\'évaluer ?')){$('sim').classList.add('hidden');SESSION=null;PPV=null;$('ppv-bar').classList.add('hidden')}}
function sendMsg(){var txt=$('input').value.replace(/\r\n/g,'\n');if(!txt.trim()||!SESSION)return;var content=txt.trim();$('input').value='';var ppv=null;if(PPV){var p=parseInt($('ppv-price').value)||PPV.price;if(p<1)p=PPV.price;ppv={ref:PPV.ref,price:p}};push('me',content+(ppv?' [PPV '+ppv.ref+' · '+ppv.price+' $]':''));clearPPV();api('/api/sessions/'+SESSION.session_id+'/message',{method:'POST',body:JSON.stringify({content:content,ppv:ppv})}).then(function(d){if(d.purchase&&d.purchase.made){push('sys','Achat fictif débloqué : '+d.purchase.ref+' · '+d.purchase.amount+' $')}if(d.reply){push('sub',d.reply)}if(d.status&&d.status!=='active'){push('sys','Fin de conversation · Statut : '+d.status)}if(d.revenue!==undefined){$('sim-rev').textContent=d.revenue}}).catch(function(e){toast(e.message)})}
function endSim(){if(!SESSION)return;api('/api/sessions/'+SESSION.session_id+'/end',{method:'POST'}).then(function(r){$('report').classList.remove('hidden');var bd=r.breakdown||{};var rows='';Object.keys(bd).forEach(function(k){var lab=k==='accroche'?'Accroche':k==='connexion'?'Création de connexion':k==='decouverte'?'Découverte du client':k==='desir'?'Création d\'intérêt':k==='timing'?'Timing de la proposition':k==='presentation'?'Présentation du média':k==='objections'?'Gestion des objections':k==='relance'?'Relance':k==='naturel'?'Naturel de la conversation':k;rows+='<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:8px 0;font-size:14px"><span>'+lab+'</span><b>'+Math.round(bd[k])+'</b></div>'});var pf=(r.points_forts||[]).map(function(x){return '<div style="background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.4);padding:8px 10px;border-radius:10px;margin-bottom:6px">'+esc(x)+'</div>'}).join('');var pa=(r.points_a_ameliorer||[]).map(function(x){return '<div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);padding:8px 10px;border-radius:10px;margin-bottom:6px">'+esc(x)+'</div>'}).join('');$('report-body').innerHTML='<h2 style="text-align:center;margin-bottom:4px">Rapport d\'évaluation</h2><div style="text-align:center;color:var(--dim);margin-bottom:16px">'+esc(r.outcome||'')+'</div><div style="font-size:56px;font-weight:900;text-align:center;line-height:1">'+Math.round(r.score_global)+'<span style="font-size:24px">/100</span></div><p style="text-align:center;color:var(--ok);font-weight:700;margin:8px 0 16px">+'+r.xp_earned+' XP</p><div class="card" style="margin:0 0 12px">'+rows+'</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="card" style="margin:0"><h4 style="margin-bottom:8px">Points forts</h4>'+pf+'</div><div class="card" style="margin:0"><h4 style="margin-bottom:8px">Points à améliorer</h4>'+pa+'</div></div><div class="card" style="margin:12px 0 0"><h4 style="margin-bottom:6px">Conseil pour la prochaine simulation</h4><p style="color:var(--dim);line-height:1.6;font-size:14px">'+esc(r.conseil_prochaine_simulation||'')+'</p><div style="margin-top:10px;font-size:12px;color:var(--dim)">Client rencontré : '+esc(r.persona_reveal?.archetype||'')+' · Budget maximal fictif : '+(r.persona_reveal?.budget_ceiling||0)+' $</div></div><button class="btn primary" style="width:100%;margin-top:14px" onclick="closeReport()">Fermer le rapport</button>'})}
function closeReport(){$('report').classList.add('hidden');$('sim').classList.add('hidden');SESSION=null;PPV=null;$('ppv-bar').classList.add('hidden');go('dash')}
document.addEventListener('keydown',function(e){if(e.target.id==='input'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg()}})
if(TOKEN){boot()}
</script>
</body>
</html>`;

function json(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(JSON.stringify(obj));
}
function parseBody(req) {
  return new Promise(res => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => {
      try { res(b ? JSON.parse(b) : {}); } catch (e) { res({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
    return res.end();
  }
  const url = new URL(req.url, 'http://localhost');
  const pathName = url.pathname;

  if (pathName === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML);
  }

  if (pathName.startsWith('/api/')) {
    const body = await parseBody(req);
    const auth = (req.headers['authorization'] || '').replace('Bearer ', '');
    const userToken = auth ? verifyToken(auth) : null;

    if (pathName === '/api/register' && req.method === 'POST') {
      const { name, email, password } = body;
      if (!email || !password) return json(res, 400, { error: 'Email et mot de passe requis' });
      if (DB.users.find(u => u.email === email.toLowerCase())) return json(res, 409, { error: 'Cet email est déjà utilisé' });
      const id = Date.now();
      const u = { id: id, name: (name || email.split('@')[0]).slice(0, 32), email: email.toLowerCase(), password_hash: hashPw(password), xp: 0, level: 1, streak_days: 0, last_active: '' };
      DB.users.push(u); saveDB();
      return json(res, 200, { token: createToken(u) });
    }
    if (pathName === '/api/login' && req.method === 'POST') {
      const { email, password } = body;
      const u = DB.users.find(x => x.email === (email || '').toLowerCase());
      if (!u || !verifyPw(password || '', u.password_hash)) return json(res, 401, { error: 'Identifiants invalides' });
      return json(res, 200, { token: createToken(u) });
    }

    if (!userToken) return json(res, 401, { error: 'Non autorisé' });
    const curUser = DB.users.find(u => u.id === userToken.id);
    if (!curUser) return json(res, 401, { error: 'Utilisateur introuvable' });

    if (pathName === '/api/me' && req.method === 'GET') {
      const lvl = levelFor(curUser.xp);
      const stats = (() => {
        const sess = DB.sessions.filter(s => s.user_id === curUser.id && s.status !== 'active');
        const avg = sess.length ? Math.round(sess.reduce((a, b) => a + (b.score || 0), 0) / sess.length) : 0;
        const rev = sess.reduce((a, b) => a + (b.revenue || 0), 0);
        const sales = sess.filter(s => s.outcome === 'converted').length;
        return { sessions: sess.length, avg_score: avg, revenue: rev, close_rate: sess.length ? Math.round(sales / sess.length * 100) : 0 };
      })();
      return json(res, 200, { user: curUser, level: lvl, vault: VAULT, stats: stats });
    }
    if (pathName === '/api/modules' && req.method === 'GET') {
      const prog = DB.progress.filter(p => p.user_id === curUser.id);
      const mods = MODULES.map(m => {
        const p = prog.find(x => x.module_id === m.id);
        return { ...m, best_score: p?.best_score || 0, completed: !!p?.completed, pass_score: m.pass };
      });
      return json(res, 200, mods);
    }
    if (pathName === '/api/leaderboard' && req.method === 'GET') {
      const board = DB.users.map(u => {
        const sess = DB.sessions.filter(s => s.user_id === u.id && s.status !== 'active');
        const avg = sess.length ? Math.round(sess.reduce((a, b) => a + (b.score || 0), 0) / sess.length) : 0;
        const rev = sess.reduce((a, b) => a + (b.revenue || 0), 0);
        return { name: u.name, xp: u.xp, avg_score: avg, revenue: rev };
      }).sort((a, b) => b.xp - a.xp).slice(0, 30);
      return json(res, 200, board);
    }
    if (pathName === '/api/history' && req.method === 'GET') {
      const hs = DB.sessions.filter(s => s.user_id === curUser.id).slice(-60).reverse().map(s => ({ id: s.id, module_title: (MODULES.find(m => m.id === s.module_id) || {}).title, score: s.score, revenue: s.revenue, sales: s.sales || 0, started_at: s.started_at }));
      return json(res, 200, hs);
    }
    if (pathName === '/api/sessions' && req.method === 'POST') {
      const modId = body.module_id || null;
      const mode = body.mode || 'training';
      const diff = body.difficulty || 2;
      const mod = MODULES.find(m => m.id === modId);
      const pool = mod ? mod.pool : Object.keys(PERSONAS);
      const persona = genPersona(pool, diff);
      const sessId = Date.now();
      const sess = { id: sessId, user_id: curUser.id, module_id: modId, mode: mode, difficulty: diff, persona: persona, state: { ...persona.state }, status: 'active', revenue: 0, sales: 0, turns: 0, score: 0, outcome: '', started_at: new Date().toISOString(), metrics: { offers: 0, personal: 0, early: 0, pressure: 0 } };
      DB.sessions.push(sess);
      const firstMsg = persona.first;
      DB.messages.push({ id: Date.now(), session_id: sessId, role: 'sub', content: firstMsg });
      saveDB();
      return json(res, 200, { session_id: sessId, module_title: mod?.title || null, crm: { display_name: persona.display_name, tenure_days: Math.floor(Math.random() * 240), ltv: Math.floor(Math.random() * 600), notes: persona.label + ' · Budget fictif masqué (' + persona.budget + '$ max)' }, first_message: firstMsg });
    }
    const mMatch = pathName.match(/^\/api\/sessions\/(\d+)\/message$/);
    if (mMatch && req.method === 'POST') {
      const sid = parseInt(mMatch[1]);
      const sess = DB.sessions.find(s => s.id === sid && s.user_id === curUser.id);
      if (!sess) return json(res, 404, { error: 'Session introuvable' });
      if (sess.status !== 'active') return json(res, 400, { error: 'Session terminée' });
      const content = body.content || '';
      const ppv = body.ppv || null;
      DB.messages.push({ id: Date.now(), session_id: sid, role: 'chatter', content: content + (ppv ? ' [PPV ' + ppv.ref + ' · ' + ppv.price + '$]' : '') });
      sess.turns++;
      const lowC = content.toLowerCase();
      if (lowC.includes(curUser.name.toLowerCase()) || lowC.includes(sess.persona.display_name.toLowerCase())) sess.metrics.personal++;
      if (ppv) { sess.metrics.offers++; if (sess.turns < 3) sess.metrics.early++; }
      const hist = DB.messages.filter(m => m.session_id === sid).map(m => ({ role: m.role, content: m.content }));
      let ai = await llmReply(sess.persona, sess.state, hist, 'Mode ' + sess.mode + ', difficulty ' + sess.difficulty);
      let turn;
      if (ai && ai.reply !== undefined) {
        turn = { reply: ai.reply, delta: ai.delta || { interest: 0, trust: 0, suspicion: 0, patience: 0 }, purchase: ai.purchase || { made: false }, status: ai.status || 'active', flags: ai.flags || [] };
      } else {
        turn = localReply(sess.persona, sess.state, hist, content, ppv);
      }
      sess.state.interest = clamp(sess.state.interest + (turn.delta.interest || 0));
      sess.state.trust = clamp(sess.state.trust + (turn.delta.trust || 0));
      sess.state.suspicion = clamp(sess.state.suspicion + (turn.delta.suspicion || 0));
      sess.state.patience = clamp(sess.state.patience + (turn.delta.patience || 0));
      if (turn.purchase && turn.purchase.made) {
        if (turn.purchase.amount <= sess.state.budget_left) {
          sess.state.budget_left -= turn.purchase.amount; sess.state.spent += turn.purchase.amount;
          sess.revenue += turn.purchase.amount; sess.sales = (sess.sales || 0) + 1;
        } else { turn.purchase.made = false; }
      }
      if (turn.reply) DB.messages.push({ id: Date.now() + 1, session_id: sid, role: 'sub', content: turn.reply });
      if (turn.status && turn.status !== 'active') sess.status = turn.status;
      if (sess.state.interest < 8) sess.status = 'lost';
      saveDB();
      return json(res, 200, { reply: turn.reply, purchase: turn.purchase, status: sess.status, revenue: sess.revenue });
    }
    const eMatch = pathName.match(/^\/api\/sessions\/(\d+)\/end$/);
    if (eMatch && req.method === 'POST') {
      const sid = parseInt(eMatch[1]);
      const sess = DB.sessions.find(s => s.id === sid && s.user_id === curUser.id);
      if (!sess) return json(res, 404, { error: 'Session introuvable' });
      const msgs = DB.messages.filter(m => m.session_id === sid);
      const report = gradeSession(sess, msgs);
      sess.score = report.score_global;
      sess.outcome = sess.revenue > 0 ? 'converted' : (sess.status === 'lost' ? 'lost' : 'no_sale');
      sess.status = 'ended';
      const xpEarn = Math.round(report.score_global * 1.25 + (sess.revenue > 0 ? 70 : 0));
      curUser.xp += xpEarn;
      curUser.level = levelFor(curUser.xp).level;
      if (sess.module_id) {
        let p = DB.progress.find(x => x.user_id === curUser.id && x.module_id === sess.module_id);
        if (!p) { p = { user_id: curUser.id, module_id: sess.module_id, best_score: 0, attempts: 0, completed: false }; DB.progress.push(p); }
        p.attempts++; p.best_score = Math.max(p.best_score, report.score_global);
        const mod = MODULES.find(m => m.id === sess.module_id);
        if (report.score_global >= (mod?.pass || 60)) p.completed = true;
      }
      saveDB();
      return json(res, 200, { ...report, xp_earned: xpEarn, revenue: sess.revenue, outcome: sess.outcome, persona_reveal: { archetype: sess.persona.label, budget_ceiling: sess.persona.budget } });
    }
    return json(res, 404, { error: 'Route API introuvable' });
  }

  res.writeHead(404); res.end('Not Found');
});

server.listen(PORT, () => console.log('OFM Trainer Fullstack démarré sur http://localhost:' + PORT));

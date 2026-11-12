(function () {
"use strict";
if (!window.React || !window.ReactDOM || !window.htm) { var a0 = document.getElementById('app'); if (a0) a0.textContent = 'Fichiers de l’app introuvables. Recharge la page.'; return; }
/* ---- 10-logic.js ---- */
/* ApexHQ — moteur de calcul (pur, sans DOM). Testé par test.js. */
const Apex = (() => {
  'use strict';

  /* ================= dates ================= */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const a = String(s).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const dow = s => parse(s).getDay();
  const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
  const range = (a, b) => { const o = []; let d = a, g = 0; while (d <= b && g++ < 3000) { o.push(d); d = addDays(d, 1); } return o; };
  const lundi = s => addDays(s, -((dow(s) + 6) % 7));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const num = v => typeof v === 'number' && isFinite(v);
  const fx = (v, d) => v.toFixed(d == null ? 1 : d).replace('.', ',');
  const sg = (v, d) => (v > 0 ? '+' : v < 0 ? '−' : '') + fx(Math.abs(v), d);
  const kgTxt = v => String(Math.round(v * 100) / 100).replace('.', ',');

  /* ================= profil & cibles ================= */
  const TYPES = ['Push', 'Pull', 'Legs', 'Upper', 'Lower'];
  const types = cfg => (cfg && Array.isArray(cfg.seanceTypes) && cfg.seanceTypes.length ? cfg.seanceTypes : TYPES);
  const DEFAULT_CFG = {
    v: 1,
    profil: { sexe: 'H', age: 25, taille: 175, poidsDepart: 75, dateDepart: iso(new Date()), poidsCible: 70, nap: 1.5 },
    cibles: {
      salle: { kcal: 2200, p: 150, g: 265, l: 60 },
      repos: { kcal: 2000, p: 150, g: 215, l: 60 },
      fibres: 30, eau: 2.5, pasMin: 10000, pasMax: 14000, sommeil: 7,
      planchers: { kcal: 1600, p: 140, l: 50 },
    },
    planning: { 1: 'Push', 2: 'Pull', 3: 'Legs', 4: 'Upper', 5: '', 6: 'Lower', 0: '' },
    photosJour: 0,
    aliments: {},
    exos: {},
    programme: null,
    repasModeles: null,
    focus: null,
    supps: null,
    seanceTypes: null,
    onboarded: null,
    q: null,
    claude: null,
  };
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const deep = (a, b) => { const o = Object.assign({}, a); for (const k in (b || {})) o[k] = isObj(a[k]) && isObj(b[k]) ? deep(a[k], b[k]) : b[k]; return o; };
  const mergeCfg = raw => deep(DEFAULT_CFG, raw || {});

  function seanceDuJour(cfg, j, date) {
    if (j && j.statut === 'repos') return '';
    if (j && j.seance) return j.seance;
    const pl0 = cfg.planning[dow(date)] || '', plan = pl0 && types(cfg).indexOf(pl0) >= 0 ? pl0 : '';
    if (j && j.statut === 'salle') return plan || types(cfg)[0];
    return plan;
  }
  function statutDuJour(cfg, j, date) {
    if (j && (j.statut === 'salle' || j.statut === 'repos')) return j.statut;
    return seanceDuJour(cfg, j, date) ? 'salle' : 'repos';
  }
  function cibleDuJour(cfg, j, date) {
    const statut = statutDuJour(cfg, j, date);
    const base = cfg.cibles[statut], pl = cfg.cibles.planchers;
    const kcal = Math.max(pl.kcal, base.kcal + ((j && j.ajust) || 0));
    const dk = kcal - base.kcal;
    let g = base.g + dk / 4, l = base.l;
    if (g < 80) { const manque = (80 - g) * 4; g = 80; l = Math.max(pl.l, l - manque / 9); }
    return { statut, kcal: Math.round(kcal), p: base.p, g: Math.round(g), l: Math.round(l), ajust: Math.round(dk), base: base.kcal, pMin: pl.p, lMin: pl.l };
  }
  function mifflin(p) { return 10 * p.poids + 6.25 * p.taille - 5 * p.age + (p.sexe === 'F' ? -161 : 5); }
  function bilanTheorique(cfg, poids) {
    const mb = mifflin({ poids: poids || cfg.profil.poidsDepart, taille: cfg.profil.taille, age: cfg.profil.age, sexe: cfg.profil.sexe });
    const dej = mb * (cfg.profil.nap || 1.5);
    let nSalle = 0; for (let i = 0; i < 7; i++) if (cfg.planning[i]) nSalle++;
    const moy = (nSalle * cfg.cibles.salle.kcal + (7 - nSalle) * cfg.cibles.repos.kcal) / 7;
    const def = dej - moy;
    return { mb, dej, moy, def, pct: def / dej * 100, kgSem: def * 7 / 7700, nSalle };
  }

  /* ================= aliments =================
     Valeurs pour 100 g (Ciqual moyennes, poids CRU sauf mention). u = [unité, grammes].
     r = rôle dans le recalage : P protéines, G glucides, L lipides, '' neutre. */
  const FOODS = {};
  const F = (id, n, c, r, k, p, g, l, f, d, u, etq) => { FOODS[id] = { id, n, c, r, k, p, g, l, f, d, u: u || null, etq: etq ? 1 : 0 }; };
  // protéines
  F('poulet', 'Blanc de poulet', 'prot', 'P', 110, 23.5, 0, 1.6, 0, 180);
  F('dinde', 'Escalope de dinde', 'prot', 'P', 105, 24, 0, 1, 0, 180);
  F('bh5', 'Steak haché 5 %', 'prot', 'P', 125, 21, 0, 5, 0, 150);
  F('boeuf', 'Bœuf maigre (rumsteck)', 'prot', 'P', 125, 22, 0, 4, 0, 150);
  F('cheval', 'Viande de cheval', 'prot', 'P', 110, 21.5, 0.5, 2.5, 0, 180);
  F('saumon', 'Saumon', 'prot', 'P', 200, 20, 0, 13.5, 0, 130);
  F('cabillaud', 'Cabillaud', 'prot', 'P', 78, 18, 0, 0.7, 0, 200);
  F('thon', 'Thon au naturel (égoutté)', 'prot', 'P', 110, 25.5, 0, 0.8, 0, 1, ['boîte', 112]);
  F('crevettes', 'Crevettes cuites', 'prot', 'P', 94, 21.4, 0, 0.9, 0, 150);
  F('oeuf', 'Œuf entier', 'prot', 'P', 140, 12.7, 0.3, 9.8, 0, 3, ['œuf', 53]);
  F('blanc', 'Blanc d’œuf', 'prot', 'P', 48, 10.5, 0.7, 0.1, 0, 150);
  F('jambon', 'Jambon blanc dégraissé', 'prot', 'P', 107, 20.5, 0.6, 2.5, 0, 2, ['tranche', 40]);
  // laitages
  F('skyr', 'Skyr nature', 'lait', 'P', 60, 10.5, 3.8, 0.2, 0, 200);
  F('fb0', 'Fromage blanc 0 %', 'lait', 'P', 48, 7.6, 4, 0.2, 0, 250);
  F('lait', 'Lait demi-écrémé', 'lait', '', 46, 3.3, 4.8, 1.5, 0, 200);
  F('emmental', 'Emmental / comté râpé', 'lait', 'L', 380, 27.5, 0.5, 29.5, 0, 20);
  F('vqr', 'Vache qui rit', 'lait', 'L', 240, 10.5, 6.5, 19, 0, 1, ['portion', 17]);
  // suppléments (à caler sur l'étiquette)
  F('clearwhey', 'Clear Whey Isolate (Prozis)', 'supp', '', 352, 85, 1, 0.3, 0, 1, ['dose 25 g', 25], 1);
  F('wheychoco', 'Whey Ultimate Chocolate (Prozis)', 'supp', '', 385, 76, 7, 6, 2, 1, ['dose 30 g', 30], 1);
  F('barre', 'Barre protéinée', 'supp', '', 358, 33, 33, 12, 7, 1, ['barre 60 g', 60], 1);
  // féculents
  F('riz', 'Riz basmati', 'feck', 'G', 350, 7.5, 77.5, 0.8, 1.4, 80);
  F('pates', 'Pâtes', 'feck', 'G', 356, 12.5, 71, 1.8, 3, 80);
  F('gnocchi', 'Gnocchi', 'feck', 'G', 165, 4, 35, 0.8, 1.5, 180);
  F('pdt', 'Pommes de terre', 'feck', 'G', 80, 2, 16.5, 0.1, 2, 300);
  F('patate', 'Patate douce', 'feck', 'G', 86, 1.6, 18, 0.1, 3, 250);
  F('avoine', 'Flocons d’avoine', 'feck', 'G', 370, 13.5, 59, 7, 10, 60);
  F('pain', 'Pain complet', 'feck', 'G', 247, 9, 43, 3, 7, 2, ['tranche', 30]);
  F('galette', 'Galette de riz', 'feck', 'G', 385, 8, 81, 3, 3, 3, ['galette', 9]);
  F('wrap', 'Wrap de blé', 'feck', 'G', 305, 8.5, 51, 6.5, 2.5, 1, ['wrap', 60]);
  F('lentilles', 'Lentilles cuites', 'feck', 'G', 113, 8.3, 16.5, 0.5, 4.2, 150);
  F('miel', 'Miel', 'feck', '', 327, 0.4, 81, 0, 0, 10);
  // fruits
  F('banane', 'Banane', 'fruit', 'G', 90, 1.1, 20, 0.2, 2, 1, ['banane', 120]);
  F('pomme', 'Pomme', 'fruit', 'G', 53, 0.3, 11.7, 0.2, 2, 1, ['pomme', 150]);
  F('kiwi', 'Kiwi', 'fruit', 'G', 60, 1.1, 11, 0.6, 2.4, 1, ['kiwi', 80]);
  F('fruitsrouges', 'Fruits rouges', 'fruit', '', 45, 1, 8, 0.3, 4, 100);
  // légumes
  F('brocoli', 'Brocoli', 'leg', '', 30, 3, 2.5, 0.5, 3, 200);
  F('haricots', 'Haricots verts', 'leg', '', 30, 2, 4, 0.2, 3.5, 200);
  F('courgette', 'Courgette', 'leg', '', 17, 1.2, 2, 0.2, 1.1, 200);
  F('epinards', 'Épinards', 'leg', '', 23, 2.8, 1, 0.4, 2.5, 200);
  F('tomate', 'Tomate', 'leg', '', 19, 0.9, 2.8, 0.2, 1.2, 150);
  F('carotte', 'Carotte', 'leg', '', 38, 0.8, 6.5, 0.2, 2.7, 150);
  F('poivron', 'Poivron', 'leg', '', 26, 0.9, 4.5, 0.2, 1.8, 200);
  F('salade', 'Salade verte', 'leg', '', 14, 1.3, 1.2, 0.2, 1.5, 80);
  F('poelee', 'Poêlée de légumes nature', 'leg', '', 45, 2, 5.5, 0.8, 3, 250);
  F('champignons', 'Champignons', 'leg', '', 22, 3, 1, 0.3, 1.5, 150);
  // lipides
  F('huile', 'Huile d’olive', 'lip', 'L', 900, 0, 0, 100, 0, 8);
  F('amandes', 'Amandes', 'lip', 'L', 615, 21, 8, 53, 10, 20);
  F('noix', 'Noix', 'lip', 'L', 700, 14.5, 7, 67, 6.7, 20);
  F('cajou', 'Noix de cajou', 'lip', 'L', 600, 18, 27, 47, 3.5, 20);
  F('beurrecac', 'Beurre de cacahuète', 'lip', 'L', 615, 26, 12, 50, 7, 15);
  F('avocat', 'Avocat', 'lip', 'L', 205, 1.6, 0.8, 20.6, 3.6, 80);
  F('chocolat', 'Chocolat noir 85 %', 'lip', 'L', 600, 10, 20, 49, 13, 1, ['carré', 10]);
  // écarts (valeurs par portion : u = 100 g « virtuels » → q = nombre de portions)
  const E = (id, n, k, p, g, l, f, u) => F(id, n, 'ecart', '', k, p, g, l, f, 1, [u || 'portion', 100]);
  E('bigmac', 'Big Mac', 505, 26.5, 42, 25.5, 3, 'burger');
  E('cheese', 'Cheeseburger', 300, 16, 30, 12.5, 2, 'burger');
  E('mcchicken', 'McChicken', 440, 19, 40, 22, 2, 'burger');
  E('royal', 'Royal Cheese', 520, 30, 37, 27, 3, 'burger');
  E('frites', 'Frites moyennes', 335, 4, 42, 16.5, 4, 'portion');
  E('fritesp', 'Petite frite', 230, 3, 29, 11.5, 3, 'portion');
  E('nuggets', 'Nuggets ×6', 260, 16, 17, 13.5, 1, 'boîte');
  E('sundae', 'Sundae caramel', 330, 6, 57, 8.5, 0, 'pot');
  E('pizza', 'Pizza (part ~120 g)', 300, 12.5, 37, 11, 2, 'part');
  E('kebab', 'Kebab (sandwich)', 800, 40, 65, 40, 5, 'kebab');
  E('tacos', 'Tacos M (1 viande)', 950, 48, 85, 45, 5, 'tacos');
  E('burgerresto', 'Burger resto + frites', 1100, 45, 95, 58, 7, 'menu');
  E('sushi', 'Sushi nigiri', 50, 2.7, 7, 1.2, 0.2, 'pièce');
  E('croissant', 'Croissant', 185, 3.5, 20.5, 10, 1, 'pièce');
  E('painchoc', 'Pain au chocolat', 280, 5, 31, 15, 2, 'pièce');
  E('glace', 'Glace (2 boules)', 200, 3.5, 26, 9, 0.5, 'coupe');
  E('biere', 'Bière 25 cl', 105, 0.8, 7.5, 0, 0, 'verre');
  E('vin', 'Vin 12 cl', 85, 0.1, 1, 0, 0, 'verre');
  E('cocktail', 'Cocktail / shot sucré', 170, 0, 17, 0, 0, 'verre');
  E('soda', 'Soda 33 cl', 139, 0, 35, 0, 0, 'canette');

  const CATS = [['prot', 'Protéines'], ['lait', 'Laitages'], ['feck', 'Féculents'], ['fruit', 'Fruits'], ['leg', 'Légumes'], ['lip', 'Lipides'], ['supp', 'Suppléments'], ['ecart', 'Écarts'], ['perso', 'Ma base']];
  const allFoods = cfg => Object.assign({}, FOODS, (cfg && cfg.aliments) || {});

  const Z = () => ({ k: 0, p: 0, g: 0, l: 0, f: 0 });
  const add = (a, b) => { a.k += b.k; a.p += b.p; a.g += b.g; a.l += b.l; a.f += (b.f || 0); return a; };
  function foodOf(it, foods) {
    if (it.x) return { id: null, n: it.x.n, c: 'libre', r: '', k: it.x.k || 0, p: it.x.p || 0, g: it.x.g || 0, l: it.x.l || 0, f: it.x.f || 0, d: 1, u: ['portion', 100] };
    return (foods || FOODS)[it.a] || null;
  }
  const grams = (it, f) => (f.u ? it.q * f.u[1] : it.q);
  function mac(it, foods) {
    const f = foodOf(it, foods); if (!f) return Z();
    const x = grams(it, f) / 100;
    return { k: f.k * x, p: f.p * x, g: f.g * x, l: f.l * x, f: (f.f || 0) * x };
  }
  const totMeal = (m, foods) => (m.items || []).reduce((t, it) => add(t, mac(it, foods)), Z());
  function totJour(j, foods) {
    const plan = Z(), eat = Z();
    ((j && j.repas) || []).forEach(m => { const t = totMeal(m, foods); add(plan, t); if (m.ok) add(eat, t); });
    const man = j && j.man ? { k: j.man.kcal || 0, p: j.man.p || 0, g: j.man.g || 0, l: j.man.l || 0, f: j.man.f || 0 } : null;
    return { plan, eat, man, reel: man || (eat.k > 0 ? eat : null) };
  }

  /* ================= plan repas ================= */
  const MODELES = {
    salle: [
      { id: 'pdj', nom: 'Petit-déj', h: '08:00', items: [['avoine', 60, 1], ['wheychoco', 1], ['banane', 1], ['amandes', 15, 1]] },
      { id: 'dej', nom: 'Déjeuner', h: '12:30', items: [['poulet', 180, 1], ['riz', 80, 1], ['brocoli', 200], ['huile', 8, 1]] },
      { id: 'pre', nom: 'Pré-séance', h: '17:00', items: [['skyr', 200], ['galette', 3], ['miel', 10]] },
      { id: 'post', nom: 'Post-séance', h: '20:00', items: [['clearwhey', 1]] },
      { id: 'din', nom: 'Dîner', h: '20:45', items: [['saumon', 130, 1], ['gnocchi', 180, 1], ['courgette', 200]] },
    ],
    repos: [
      { id: 'pdj', nom: 'Petit-déj', h: '08:30', items: [['oeuf', 3], ['pain', 2, 1], ['skyr', 150], ['fruitsrouges', 100]] },
      { id: 'dej', nom: 'Déjeuner', h: '12:30', items: [['dinde', 180, 1], ['pdt', 300, 1], ['haricots', 200], ['huile', 10, 1]] },
      { id: 'col', nom: 'Collation', h: '16:30', items: [['fb0', 250], ['noix', 20, 1], ['pomme', 1]] },
      { id: 'din', nom: 'Dîner', h: '20:00', items: [['cabillaud', 200, 1], ['gnocchi', 130, 1], ['poivron', 200], ['huile', 8, 1]] },
    ],
  };
  function bornes(f) {
    const base = f.d || (f.u ? 1 : 100);
    if (f.r === 'P') return [f.u ? 1 : 60, base * 2.2];
    return [0, base * 3.5];
  }
  function pas(f, q) { return f.u ? (f.u[1] >= 100 ? 0.5 : 1) : (q >= 100 ? 10 : 5); }
  function arrondi(q, f) { const st = pas(f, q); return Math.max(0, Math.round(q / st) * st); }

  /* Recale les quantités ajustables (adj) pour viser la cible du jour.
     Les repas mangés (ok) et les items non ajustables comptent comme fixes. */
  function ajuster(meals, cible, foods, opts) {
    opts = opts || {};
    const ms = meals.map(m => Object.assign({}, m, { items: (m.items || []).map(i => Object.assign({}, i)) }));
    const fixe = Z(), adj = [];
    ms.forEach(m => m.items.forEach(it => {
      const f = foodOf(it, foods); if (!f) return;
      if ((m.ok && !opts.tous) || !it.adj || !f.r || it.x) add(fixe, mac(it, foods)); else adj.push({ it, f });
    }));
    if (!adj.length) return ms;
    const tot = () => adj.reduce((t, a) => add(t, mac(a.it, foods)), Object.assign({}, fixe));
    const scale = (role, key, target) => {
      const its = adj.filter(a => a.f.r === role); if (!its.length) return;
      let contrib = its.reduce((s, a) => s + mac(a.it, foods)[key], 0);
      if (contrib <= 0) {
        its.forEach(a => { a.it.q = (a.f.d || (a.f.u ? 1 : 50)) * 0.25; });
        contrib = its.reduce((s, a) => s + mac(a.it, foods)[key], 0);
        if (contrib <= 0) return;
      }
      const need = target - (tot()[key] - contrib);
      const fac = Math.max(0, Math.min(4, need / contrib));
      its.forEach(a => { const b = bornes(a.f); a.it.q = Math.max(b[0], Math.min(b[1], a.it.q * fac)); });
    };
    for (let i = 0; i < 14; i++) { scale('P', 'p', cible.p); scale('L', 'l', cible.l); scale('G', 'g', cible.g); }
    scale('G', 'k', cible.kcal);
    const cutK = (role, key, floor) => {
      const over = tot().k - cible.kcal; if (over <= 10) return;
      const its = adj.filter(a => a.f.r === role); if (!its.length) return;
      const cK = its.reduce((s, a) => s + mac(a.it, foods).k, 0), cM = its.reduce((s, a) => s + mac(a.it, foods)[key], 0);
      if (cK <= 0) return;
      const room = Math.max(0, tot()[key] - (floor || 0));
      const fac = Math.max(0, 1 - over / cK, cM > 0 ? 1 - room / cM : 0);
      its.forEach(a => { const b = bornes(a.f); a.it.q = Math.max(b[0], Math.min(b[1], a.it.q * fac)); });
    };
    cutK('L', 'l', cible.lMin); cutK('P', 'p', cible.pMin || cible.p * 0.9);
    adj.forEach(a => { a.it.q = arrondi(a.it.q, a.f); });
    const ps = adj.filter(a => a.f.r === 'P').sort((a, b) => mac(b.it, foods).p - mac(a.it, foods).p);
    if (ps.length && cible.pMin) for (let i = 0; i < 4 && tot().p < cible.pMin - 0.5; i++) ps[0].it.q += pas(ps[0].f, ps[0].it.q);
    const gs = adj.filter(a => a.f.r === 'G' && !a.f.u).sort((a, b) => mac(b.it, foods).k - mac(a.it, foods).k);
    if (gs.length) {
      const a = gs[0];
      for (let i = 0; i < 8; i++) {
        const err = cible.kcal - tot().k, per5 = a.f.k * 0.05;
        if (Math.abs(err) < per5 * 0.6) break;
        const nq = a.it.q + (err > 0 ? 5 : -5); if (nq < 0) break; a.it.q = nq;
      }
    }
    return ms;
  }
  const tup = x => (Array.isArray(x) ? x : [x.a, x.q, x.adj]);
  function planDuJour(cfg, statut, cible) {
    const foods = allFoods(cfg);
    const tpl = (cfg.repasModeles && cfg.repasModeles[statut]) || MODELES[statut];
    const meals = tpl.map(m => ({
      id: m.id, nom: m.nom, h: m.h, ok: false,
      items: m.items.map(tup).filter(x => foods[x[0]]).map(x => { const o = { id: uid(), a: x[0], q: x[1] }; if (x[2]) o.adj = 1; return o; }),
    }));
    return ajuster(meals, cible, foods, { tous: true });
  }
  /* Équivalents d'un aliment : même rôle, quantité recalculée à macro dominante égale. */
  function swapOptions(it, foods) {
    const f = foodOf(it, foods); if (!f || !f.id) return [];
    const m = mac(it, foods), key = f.r === 'P' ? 'p' : f.r === 'G' ? 'g' : f.r === 'L' ? 'l' : null;
    return Object.keys(foods).map(id => foods[id]).filter(o => o.id !== f.id && (key ? o.r === f.r : (o.c === f.c && !o.r))).map(o => {
      let gr = key && o[key] > 0 ? m[key] / o[key] * 100 : grams(it, f);
      if (f.c === 'ecart') gr = 100;
      let q = arrondi(o.u ? gr / o.u[1] : gr, o); if (!(q > 0)) q = o.u ? pas(o, 1) : 5;
      const nm = mac({ a: o.id, q }, foods);
      return { f: o, q, m: nm, dk: nm.k - m.k, same: o.c === f.c ? 0 : 1 };
    }).sort((a, b) => a.same - b.same || Math.abs(a.dk) - Math.abs(b.dk));
  }
  /* Calcule les grammes de 1 à 3 aliments pour combler exactement un reste {k,p,g,l}. */
  function boucler(reste, src, foods) {
    src = src.filter(Boolean);
    const M = src.map(f => [f.p / 100, f.g / 100, f.l / 100]), W = [1, 1, 2.25];
    const r = [Math.max(0, reste.p), Math.max(0, reste.g), Math.max(0, reste.l)];
    const q = src.map(() => 0);
    for (let n = 0; n < 400; n++) for (let j = 0; j < src.length; j++) {
      let a = 0, b = 0;
      for (let i = 0; i < 3; i++) {
        let res = r[i]; for (let k = 0; k < src.length; k++) if (k !== j) res -= M[k][i] * q[k];
        a += W[i] * M[j][i] * res; b += W[i] * M[j][i] * M[j][i];
      }
      q[j] = b > 0 ? Math.max(0, a / b) : 0;
    }
    const items = src.map((f, j) => ({ a: f.id, q: arrondi(f.u ? q[j] / f.u[1] : q[j], f) }));
    const tot = () => items.reduce((t, it) => add(t, mac(it, foods)), Z());
    // finition sur les kcal : on retouche la source la plus dense en glucides (sinon la première)
    let gi = -1; src.forEach((f, j) => { if (!f.u && (gi < 0 || f.g > src[gi].g)) gi = j; });
    if (gi >= 0 && reste.k > 0) for (let n = 0; n < 10; n++) {
      const err = reste.k - tot().k, per5 = src[gi].k * 0.05;
      if (Math.abs(err) < per5 * 0.6) break;
      const nq = items[gi].q + (err > 0 ? 5 : -5); if (nq < 0) break; items[gi].q = nq;
    }
    const t = tot();
    return { items: items.filter(i => i.q > 0), tot: t, delta: { k: t.k - reste.k, p: t.p - reste.p, g: t.g - reste.g, l: t.l - reste.l } };
  }
  /* Répartit un excédent sur les jours suivants, plafonné, jamais sous le plancher. */
  function lissage(exc, cfg, journal, date, cap, nMax) {
    cap = cap || 150; nMax = nMax || 4;
    let rest = Math.round(exc); const plan = [];
    for (let i = 1; i <= nMax && rest >= 20; i++) {
      const d = addDays(date, i), j = journal[d] || {}, st = statutDuJour(cfg, j, d);
      const base = cfg.cibles[st].kcal + (j.ajust || 0), room = base - cfg.cibles.planchers.kcal;
      const cut = Math.floor(Math.max(0, Math.min(cap, room, rest)) / 10) * 10;
      if (cut > 0) { plan.push({ d, cut, kcal: base - cut, ajust: (j.ajust || 0) - cut }); rest -= cut; }
    }
    rest = Math.max(0, rest);
    return { plan, reste: rest, gras: rest / 7700 };
  }

  /* ================= poids & sèche ================= */
  const serie = (journal, key) => Object.keys(journal).filter(d => journal[d] && num(journal[d][key])).sort().map(d => ({ d, v: journal[d][key] }));
  function mm7(journal, date) {
    let s = 0, n = 0;
    for (let i = 0; i < 7; i++) { const j = journal[addDays(date, -i)]; if (j && num(j.poids)) { s += j.poids; n++; } }
    return n ? { v: s / n, n } : null;
  }
  function serieMM7(journal) {
    const p = serie(journal, 'poids'); if (!p.length) return [];
    return range(p[0].d, p[p.length - 1].d).map(d => { const m = mm7(journal, d); return m ? { d, v: m.v, n: m.n } : null; }).filter(Boolean);
  }
  function pente(journal, date, win) {
    win = win || 14; const pts = [];
    for (let i = 0; i < win; i++) { const d = addDays(date, -i), j = journal[d]; if (j && num(j.poids)) pts.push([-i, j.poids]); }
    if (pts.length < 5 || pts[0][0] - pts[pts.length - 1][0] < 5) return null;
    const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
    const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
    const den = n * sxx - sx * sx; if (!den) return null;
    return (n * sxy - sx * sy) / den;
  }
  function tendance(journal, date) {
    const a = mm7(journal, date), b = mm7(journal, addDays(date, -7));
    if (a && b && a.n >= 3 && b.n >= 3) { const dk = a.v - b.v; return { now: a.v, dk, pct: dk / b.v * 100, src: 'mm7' }; }
    const sl = pente(journal, date, 14);
    if (sl != null && a) { const dk = sl * 7; return { now: a.v, dk, pct: dk / a.v * 100, src: 'reg' }; }
    return null;
  }
  function verdictRythme(t) {
    if (!t) return null;
    const kg = -t.dk, pct = -t.pct;
    if (pct > 1.05) return { st: 'warn', lab: 'Trop rapide', txt: 'Perte > 1 %/sem : +150 à 200 kcal de glucides autour de la séance, ou 1 refeed à maintenance.' };
    if (kg >= 0.35) return { st: 'good', lab: 'Dans la cible', txt: 'Rythme −0,5 à −1 %/sem. On ne touche à rien.' };
    if (kg >= 0.15) return { st: 'warn', lab: 'Lent', txt: 'Sous 0,3 kg/sem. Si ça dure 2 semaines : −150 kcal les jours de repos OU +2 000 pas/j, pas les deux.' };
    if (kg > -0.15) return { st: 'warn', lab: 'Stagnation', txt: 'Poids stable. Vérifie pesées à jeun et écarts non notés avant de baisser les calories.' };
    return { st: 'crit', lab: 'En hausse', txt: 'Moyenne en hausse : eau/sel après un écart le plus souvent. Tiens le plan 3–4 jours puis réévalue.' };
  }
  function eta(journal, cfg, date) {
    const t = tendance(journal, date); if (!t || t.dk > -0.05) return null;
    const jours = Math.ceil((t.now - cfg.profil.poidsCible) / (-t.dk / 7));
    if (jours <= 0) return { date, jours: 0 };
    return jours > 730 ? null : { date: addDays(date, jours), jours };
  }
  function tdee(journal, cfg, date, win) {
    win = win || 14; const foods = allFoods(cfg);
    const a = mm7(journal, date), b = mm7(journal, addDays(date, -win));
    if (!a || !b || a.n < 3 || b.n < 3) return null;
    let s = 0, n = 0;
    for (let i = 1; i <= win; i++) { const t = totJour(journal[addDays(date, -i)], foods).reel; if (t) { s += t.k; n++; } }
    if (n < win * 0.7) return null;
    const intake = s / n, deficit = -(a.v - b.v) * 7700 / win;
    return { intake, deficit, tdee: intake + deficit, n };
  }
  function adherence(journal, cfg, date, n) {
    const foods = allFoods(cfg), r = { kcal: [0, 0], prot: [0, 0], pas: [0, 0], sommeil: [0, 0] };
    for (let i = 1; i <= (n || 7); i++) {
      const d = addDays(date, -i), j = journal[d]; if (!j) continue;
      const t = totJour(j, foods).reel, c = cibleDuJour(cfg, j, d);
      if (t) { r.kcal[1]++; if (Math.abs(t.k - c.kcal) <= c.kcal * 0.05) r.kcal[0]++; r.prot[1]++; if (t.p >= cfg.cibles.planchers.p) r.prot[0]++; }
      if (num(j.pas)) { r.pas[1]++; if (j.pas >= cfg.cibles.pasMin) r.pas[0]++; }
      if (num(j.sommeil)) { r.sommeil[1]++; if (j.sommeil >= cfg.cibles.sommeil) r.sommeil[0]++; }
    }
    return r;
  }
  function navy(taille, cou, hauteur) {
    if (!num(taille) || !num(cou) || !num(hauteur) || taille - cou <= 0) return null;
    const bf = 495 / (1.0324 - 0.19077 * Math.log10(taille - cou) + 0.15456 * Math.log10(hauteur)) - 450;
    return bf > 2 && bf < 60 ? bf : null;
  }

  /* Lecture du check-in : constats chiffrés + action. */
  function lecture(journal, cfg, date) {
    const foods = allFoods(cfg), out = [], j = journal[date] || {}, hier = addDays(date, -1), jh = journal[hier] || {};
    if (num(j.poids)) {
      const m = mm7(journal, date), t = tendance(journal, date), v = verdictRythme(t);
      if (t && v) out.push({ k: 'rythme', ic: 'trend', lab: 'Rythme hebdo', val: sg(t.dk, 2) + ' kg · ' + sg(t.pct, 1) + ' %', st: v.st, tag: v.lab, txt: v.txt });
      else out.push({ k: 'mm7', ic: 'scale', lab: 'Moyenne 7 j', val: fx(m.v, 1) + ' kg', st: 'info', tag: m.n + '/7 pesées', txt: 'Tendance hebdo fiable après 2 semaines de pesées à jeun. D’ici là, seule la moyenne compte.' });
      if (jh && num(jh.poids) && Math.abs(j.poids - jh.poids) >= 0.9) out.push({ k: 'saut', ic: 'droplet', lab: 'Variation 24 h', val: sg(j.poids - jh.poids, 1) + ' kg', st: 'info', tag: 'Eau', txt: 'Eau, sel, glycogène, transit. Pas du gras : 1 kg de gras = 7 700 kcal.' });
    }
    if (num(j.sommeil)) {
      const s = j.sommeil, q = num(j.sommeilQ) ? ' · ' + j.sommeilQ + '/10' : '';
      out.push({ k: 'sommeil', ic: 'moon', lab: 'Sommeil', val: fx(s, 1) + ' h' + q, st: s >= 7 ? 'good' : s >= 6 ? 'warn' : 'crit', tag: s >= 7 ? 'Couvert' : s >= 6 ? 'Juste' : 'Dette',
        txt: s >= 7 ? 'Récupération couverte. Charges normales.' : s >= 6 ? 'Sous 7 h : garde les charges, retire 1 série par exercice si la force baisse.' : 'Dette de sommeil : volume −20 %, RPE ≤ 8, coucher avancé ce soir.' });
    }
    if (num(jh.pas)) {
      const p = jh.pas, lo = cfg.cibles.pasMin, hi = cfg.cibles.pasMax;
      out.push({ k: 'pas', ic: 'steps', lab: 'Pas d’hier', val: Math.round(p).toLocaleString('fr-FR'), st: p >= lo ? 'good' : p >= lo * 0.8 ? 'warn' : 'crit', tag: p >= lo ? 'NEAT tenu' : 'Sous la baseline',
        txt: p >= lo ? (p > hi ? 'Au-dessus de 14k : compte dans la fatigue, pas besoin de cardio en plus.' : 'Baseline 10–14k tenue.') : 'Manque ' + Math.round(lo - p).toLocaleString('fr-FR') + ' pas : 15–20 min de tapis incliné après la séance ou marche ce soir.' });
    }
    const th = totJour(jh, foods).reel;
    if (th) {
      const c = cibleDuJour(cfg, jh, hier), dk = th.k - c.kcal, pl = cfg.cibles.planchers;
      const okK = Math.abs(dk) <= c.kcal * 0.05;
      out.push({ k: 'kcal', ic: 'flame', lab: 'Calories d’hier', val: Math.round(th.k).toLocaleString('fr-FR') + ' / ' + c.kcal.toLocaleString('fr-FR'), st: okK ? 'good' : Math.abs(dk) <= 300 ? 'warn' : 'crit', tag: (dk >= 0 ? '+' : '−') + Math.abs(Math.round(dk)) + ' kcal',
        txt: okK ? 'Dans les ±5 % de la cible ' + (c.statut === 'salle' ? 'salle' : 'repos') + '.' : dk > 0 ? 'Excédent ≈ ' + fx(dk / 7700 * 1000, 0) + ' g de gras au pire. Se lisse sur la semaine, pas de jeûne punitif.' : th.k < pl.kcal ? 'Sous le plancher de ' + pl.kcal + ' kcal : remonte aujourd’hui, le muscle se défend avec des calories.' : 'Sous la cible : faim et récup à surveiller.' });
      out.push({ k: 'prot', ic: 'bolt', lab: 'Protéines d’hier', val: Math.round(th.p) + ' g', st: th.p >= c.p - 5 ? 'good' : th.p >= pl.p ? 'warn' : 'crit', tag: th.p >= pl.p ? '≥ ' + pl.p + ' g' : 'Sous le plancher',
        txt: th.p >= c.p - 5 ? 'Cible ' + c.p + ' g tenue.' : th.p >= pl.p ? 'Entre plancher et cible : ajoute 1 prise de 30 g.' : 'Sous ' + pl.p + ' g : 4 prises de 30–45 g aujourd’hui, skyr ou whey en collation.' });
    }
    if (num(j.energie) || num(j.force)) {
      const lo = Math.min(num(j.energie) ? j.energie : 10, num(j.force) ? j.force : 10);
      out.push({ k: 'forme', ic: 'bolt', lab: 'Énergie · force', val: (num(j.energie) ? j.energie : '–') + ' · ' + (num(j.force) ? j.force : '–') + ' /10', st: lo >= 7 ? 'good' : lo >= 5 ? 'warn' : 'crit', tag: lo >= 7 ? 'Prêt' : lo >= 5 ? 'Moyen' : 'À plat',
        txt: lo >= 7 ? 'Séance normale, vise la progression.' : lo >= 5 ? 'Tiens les charges, ne force pas les répétitions.' : 'Fatigue marquée : séance allégée (−30 % de séries) ou repos, glucides autour de l’effort.' });
    }
    return out;
  }

  /* ================= training ================= */
  const MUSCLES = { pecH: 'Pecs haut', pec: 'Pecs', dLat: 'Deltoïdes latéraux', dAnt: 'Deltoïdes antérieurs', dPost: 'Deltoïdes postérieurs', bic: 'Biceps', tri: 'Triceps', dos: 'Dos', quad: 'Quadriceps', isch: 'Ischios', fess: 'Fessiers', mol: 'Mollets', abd: 'Abdos' };
  const EXOS = {};
  const X = (id, n, m, s, lo, hi, inc) => { EXOS[id] = { id, n, m, s: s || [], lo, hi, inc }; };
  X('di_halt', 'Développé incliné haltères 30°', 'pecH', ['dAnt', 'tri'], 6, 10, 2);
  X('dc', 'Développé couché (barre ou machine)', 'pec', ['dAnt', 'tri'], 6, 10, 2.5);
  X('ec_bh', 'Écarté poulie bas → haut', 'pecH', [], 12, 15, 2.5);
  X('el_halt', 'Élévations latérales haltères', 'dLat', [], 10, 15, 1);
  X('dm_halt', 'Développé militaire haltères', 'dAnt', ['tri', 'dLat'], 8, 12, 2);
  X('tri_corde', 'Extension triceps corde', 'tri', [], 10, 15, 2.5);
  X('tri_oh', 'Extension triceps au-dessus de la tête', 'tri', [], 10, 15, 2.5);
  X('tractions', 'Tractions / tirage vertical', 'dos', ['bic'], 6, 10, 2.5);
  X('row_barre', 'Rowing barre / T-bar', 'dos', ['bic', 'dPost'], 8, 12, 2.5);
  X('tir_horiz', 'Tirage horizontal poulie', 'dos', ['bic'], 10, 12, 2.5);
  X('curl_inc', 'Curl incliné haltères', 'bic', [], 8, 12, 1);
  X('curl_pup', 'Curl pupitre (EZ ou machine)', 'bic', [], 10, 12, 2.5);
  X('el_poulie', 'Élévations latérales poulie', 'dLat', [], 12, 15, 1.25);
  X('face_pull', 'Face pull', 'dPost', [], 12, 15, 2.5);
  X('squat', 'Squat (barre ou hack)', 'quad', ['fess'], 5, 8, 5);
  X('presse', 'Presse à cuisses', 'quad', ['fess'], 8, 12, 10);
  X('rdl', 'Soulevé de terre roumain', 'isch', ['fess'], 8, 10, 5);
  X('leg_curl', 'Leg curl allongé', 'isch', [], 10, 12, 2.5);
  X('leg_ext', 'Leg extension', 'quad', [], 12, 15, 2.5);
  X('mollets', 'Mollets debout', 'mol', [], 10, 15, 5);
  X('crunch', 'Crunch poulie', 'abd', [], 12, 15, 2.5);
  X('di_smith', 'Développé incliné Smith 30°', 'pecH', ['dAnt', 'tri'], 6, 10, 2.5);
  X('tir_neutre', 'Tirage vertical prise neutre', 'dos', ['bic'], 8, 12, 2.5);
  X('pec_deck', 'Pec deck / écarté machine', 'pec', [], 10, 15, 2.5);
  X('row_uni', 'Rowing unilatéral', 'dos', ['bic', 'dPost'], 8, 12, 2);
  X('el_mach', 'Élévations latérales machine', 'dLat', [], 12, 20, 2.5);
  X('curl_bay', 'Curl bayésien poulie', 'bic', [], 10, 15, 1.25);
  X('curl_mart', 'Curl marteau', 'bic', [], 8, 12, 1);
  X('barre_front', 'Barre au front EZ', 'tri', [], 10, 12, 2.5);
  X('hack', 'Hack squat', 'quad', ['fess'], 8, 12, 5);
  X('fentes', 'Fentes bulgares', 'quad', ['fess'], 8, 12, 2);
  X('leg_curl_assis', 'Leg curl assis', 'isch', [], 10, 15, 2.5);
  X('mollets_assis', 'Mollets assis', 'mol', [], 12, 15, 5);
  X('curl_ez', 'Curl barre EZ', 'bic', [], 8, 12, 2.5);
  const PROG = {
    Push: [['di_halt', 4], ['dc', 3], ['ec_bh', 3], ['el_halt', 4], ['dm_halt', 2], ['tri_corde', 3], ['tri_oh', 2]],
    Pull: [['tractions', 3], ['row_barre', 3], ['tir_horiz', 2], ['curl_inc', 3], ['curl_pup', 3], ['el_poulie', 3], ['face_pull', 2]],
    Legs: [['squat', 3], ['presse', 3], ['rdl', 3], ['leg_curl', 3], ['leg_ext', 2], ['mollets', 3], ['crunch', 2]],
    Upper: [['di_smith', 4], ['tir_neutre', 3], ['pec_deck', 3], ['row_uni', 3], ['el_mach', 4], ['curl_bay', 3], ['curl_mart', 2], ['barre_front', 2]],
    Lower: [['hack', 3], ['fentes', 2], ['leg_curl_assis', 3], ['leg_ext', 3], ['mollets_assis', 3], ['el_halt', 3], ['curl_ez', 2]],
  };
  const GROUPES_DEF = [
    { id: 'pecs', n: 'Pectoraux', m: ['pecH', 'pec'], min: 14, max: 20, freq: 2, sub: { m: 'pecH', n: 'haut', min: 9 } },
    { id: 'biceps', n: 'Biceps', m: ['bic'], min: 10, max: 14, freq: 2 },
    { id: 'delts', n: 'Deltoïdes latéraux', m: ['dLat'], min: 12, max: 18, freq: 3 },
  ];
  const GROUPES = (() => { const o = {}; GROUPES_DEF.forEach(g => { o[g.id] = g; }); return o; })();
  const allExos = cfg => Object.assign({}, EXOS, (cfg && cfg.exos) || {});
  const progOf = cfg => {
    const p = cfg && cfg.programme; if (!isObj(p)) return PROG;
    const o = {}; Object.keys(p).forEach(t => { o[t] = (Array.isArray(p[t]) ? p[t] : []).map(x => (Array.isArray(x) ? x : [x.e, x.n])).filter(x => x[0]); });
    return o;
  };
  const SUPPS_DEF = [{ id: 'crea', n: 'Créatine 3–5 g', note: 'tous les jours' }, { id: 'om3', n: 'Oméga-3', note: 'avec un repas' }, { id: 'd3', n: 'Vitamine D3', note: 'avec un repas gras' }, { id: 'ash', n: 'Ashwagandha', note: 'le soir' }];
  const supps = cfg => (cfg && Array.isArray(cfg.supps) ? cfg.supps : SUPPS_DEF);
  const groupes = cfg => { const a = cfg && Array.isArray(cfg.focus) ? cfg.focus : GROUPES_DEF, o = {}; a.forEach(g => { if (g && g.id && Array.isArray(g.m)) o[g.id] = g; }); return o; };
  const focusLabel = (cfg, muscle) => { const g = groupes(cfg); for (const k in g) if (g[k].m.indexOf(muscle) >= 0) return g[k].n; return ''; };

  const setFait = s => !!s && s.r > 0;
  const setDur = s => setFait(s) && (s.rpe == null || s.rpe >= 6.5);
  function e1rm(s) {
    if (!setFait(s) || !(s.kg > 0)) return 0;
    const rir = s.rpe != null ? Math.max(0, Math.min(5, 10 - s.rpe)) : 0;
    return s.kg * (1 + Math.min(s.r + rir, 15) / 30);
  }
  function volumeEntre(seances, from, to, exos, vers) {
    const vol = {}, ind = {}, jours = {};
    Object.keys(seances).forEach(id => {
      const se = seances[id]; if (!se || se.date < from || se.date > to) return;
      (se.exos || []).forEach(ex => {
        const e = exos[ex.e]; if (!e) return;
        const n = vers === 'plan' ? (ex.sets || []).length : (ex.sets || []).filter(setDur).length; if (!n) return;
        vol[e.m] = (vol[e.m] || 0) + n; (jours[e.m] = jours[e.m] || {})[se.date] = 1;
        (e.s || []).forEach(m => { ind[m] = (ind[m] || 0) + n * 0.5; });
      });
    });
    return { vol, ind, jours };
  }
  function volumePlanType(type, cfg) {
    const exos = allExos(cfg), vol = {}, ind = {};
    (progOf(cfg)[type] || []).forEach(x => { const e = exos[x[0]]; if (!e) return; vol[e.m] = (vol[e.m] || 0) + x[1]; (e.s || []).forEach(m => { ind[m] = (ind[m] || 0) + x[1] * 0.5; }); });
    return { vol, ind };
  }
  /* Volume hebdo des points faibles : fait, projeté (séances planifiées restantes), fréquence. */
  function focusSemaine(seances, journal, cfg, date) {
    const exos = allExos(cfg), from = lundi(date), to = addDays(from, 6);
    const done = volumeEntre(seances, from, to, exos);
    const reste = {}, ref = today();
    range(from, to).forEach(d => {
      if (d < ref) return;
      const se = seances[d];
      if (se) { // séance ouverte : les séries pas encore faites restent projetées
        if (se.fin) return;
        (se.exos || []).forEach(ex => { const e = exos[ex.e]; if (!e) return; const n = (ex.sets || []).filter(x => !setFait(x)).length; if (!n) return; reste[e.m] = (reste[e.m] || 0) + n; (reste['#' + e.m] = reste['#' + e.m] || {})[d] = 1; });
        return;
      }
      const t = seanceDuJour(cfg, journal[d], d); if (!t) return;
      const v = volumePlanType(t, cfg).vol; for (const m in v) reste[m] = (reste[m] || 0) + v[m];
      const e = progOf(cfg)[t] || []; e.forEach(x => { const ex = exos[x[0]]; if (ex) (reste['#' + ex.m] = reste['#' + ex.m] || {})[d] = 1; });
    });
    const out = {};
    const GR = groupes(cfg);
    Object.keys(GR).forEach(k => {
      const G = GR[k]; let fait = 0, proj = 0, indir = 0; const jd = {}, jp = {};
      G.m.forEach(m => { fait += done.vol[m] || 0; indir += done.ind[m] || 0; proj += reste[m] || 0; Object.assign(jd, done.jours[m] || {}); Object.assign(jp, reste['#' + m] || {}); });
      const freq = Object.keys(jd).length, freqProj = Object.keys(Object.assign({}, jd, jp)).length;
      const o = { k, n: G.n, min: G.min, max: G.max, fait, indir, proj: fait + proj, freq, freqProj, freqMin: G.freq };
      if (G.sub) o.sub = { n: G.sub.n, min: G.sub.min, fait: done.vol[G.sub.m] || 0, proj: (done.vol[G.sub.m] || 0) + (reste[G.sub.m] || 0) };
      out[k] = o;
    });
    return out;
  }
  function histoExo(seances, id) {
    return Object.keys(seances).map(k => seances[k]).filter(se => se && (se.exos || []).some(x => x.e === id && (x.sets || []).some(setFait)))
      .sort((a, b) => (a.date < b.date ? -1 : 1)).map(se => {
        const sets = []; se.exos.forEach(x => { if (x.e === id) (x.sets || []).forEach(s => { if (setFait(s)) sets.push(s); }); });
        const best = sets.reduce((b, s) => (e1rm(s) > e1rm(b) ? s : b), sets[0]);
        return { date: se.date, sets, best, e1: e1rm(best), vol: sets.reduce((t, s) => t + (s.kg || 0) * s.r, 0), top: sets.reduce((t, s) => Math.max(t, s.kg || 0), 0) };
      });
  }
  /* Double progression : toutes les séries au plafond → +charge, sinon +1 rép sur la série la plus basse. */
  function objectif(exo, last) {
    if (!last || !last.sets.length) return { kg: null, reps: exo.lo + '–' + exo.hi, txt: exo.lo + '–' + exo.hi + ' rép · RPE 8–9', mode: 'base' };
    const kg = last.top, s = last.sets.filter(x => (x.kg || 0) === kg), reps = s.map(x => x.r);
    if (reps.length && reps.every(r => r >= exo.hi)) return { kg: kg + exo.inc, reps: String(exo.lo), txt: kgTxt(kg + exo.inc) + ' kg × ' + exo.lo + '+ (charge ↑)', mode: 'charge' };
    const mn = Math.min.apply(null, reps); let done = false;
    const cible = reps.map(r => { if (!done && r === mn && r < exo.hi) { done = true; return r + 1; } return r; });
    return { kg, reps: cible.join('·'), txt: kgTxt(kg) + ' kg × ' + cible.join('·') + ' (+1 rép)', mode: 'reps' };
  }
  function tendanceExo(h) {
    const v = h.filter(x => x.e1 > 0); if (v.length < 3) return null;
    const w = v.slice(-4), pct = (w[w.length - 1].e1 - w[0].e1) / w[0].e1 * 100;
    const best = Math.max.apply(null, v.map(x => x.e1));
    return { pct, n: w.length, st: pct < -3 ? 'regression' : pct <= 0.5 ? 'plateau' : 'progression', pr: w[w.length - 1].e1 >= best - 1e-9, e1: w[w.length - 1].e1 };
  }
  /* Mouvement clé d'un groupe : l'exercice du groupe le plus souvent noté. */
  function liftCle(seances, g, cfg) {
    const G = groupes(cfg)[g], ex = allExos(cfg); let pick = null; if (!G) return null;
    Object.keys(ex).forEach(id => { if (G.m.indexOf(ex[id].m) < 0) return; const h = histoExo(seances, id); if (h.length && (!pick || h.length > pick.h.length)) pick = { id, h }; });
    return pick;
  }
  /* Alertes points faibles : volume, fréquence, tendance de force. */
  function alertesFocus(seances, journal, cfg, date) {
    const f = focusSemaine(seances, journal, cfg, date), exos = allExos(cfg), out = [];
    Object.keys(f).forEach(k => {
      const o = f[k], lk = liftCle(seances, k, cfg), t = lk ? tendanceExo(lk.h) : null;
      let st = 'good', tag = 'Dans la cible'; const txt = [];
      if (o.proj < o.min) { st = 'warn'; tag = 'Sous-dosé'; txt.push('Projection ' + fx(o.proj, 0) + ' séries pour ' + o.min + '–' + o.max + ' : ajoute ' + Math.ceil(o.min - o.proj) + ' séries cette semaine.'); }
      else if (o.fait > o.max) { st = 'warn'; tag = 'Au-dessus'; txt.push(fx(o.fait, 0) + ' séries > ' + o.max + ' : en déficit, la récupération plafonne. Garde la qualité.'); }
      if (o.sub && o.sub.proj < o.sub.min) { if (st === 'good') { st = 'warn'; tag = 'Faisceau ' + o.sub.n + ' court'; } txt.push('Faisceau ' + o.sub.n + ' : ' + fx(o.sub.proj, 0) + ' séries projetées pour ≥ ' + o.sub.min + '.'); }
      if (o.freqProj < o.freqMin) { if (st === 'good') { st = 'warn'; tag = 'Fréquence basse'; } txt.push('Fréquence ' + o.freqProj + '×/sem pour ≥ ' + o.freqMin + '×.'); }
      if (t && t.st === 'regression') { st = 'crit'; tag = 'Régression'; txt.push(exos[lk.id].n + ' : ' + sg(t.pct, 1) + ' % sur ' + t.n + ' séances. Fatigue ou déficit trop dur : vérifie sommeil et glucides pré-séance.'); }
      else if (t && t.st === 'plateau') { if (st === 'good') { st = 'warn'; tag = 'Plateau'; } txt.push(exos[lk.id].n + ' : ' + sg(t.pct, 1) + ' % sur ' + t.n + ' séances. Change la variante ou gagne 1 rép avant de monter la charge.'); }
      else if (t) txt.push(exos[lk.id].n + ' : ' + sg(t.pct, 1) + ' % sur ' + t.n + ' séances.');
      if (!txt.length) txt.push(o.fait ? 'Volume et fréquence dans la cible.' : 'Semaine planifiée dans la cible. Rien de noté pour l’instant.');
      out.push({ k, n: o.n, st, tag, txt, o, lift: lk ? { id: lk.id, n: exos[lk.id].n, h: lk.h, t } : null });
    });
    return out;
  }
  function fatigue(journal, seances, cfg, date) {
    const J = range(addDays(date, -6), date).map(d => journal[d]).filter(Boolean);
    const avg = k => { const v = J.map(j => j[k]).filter(num); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const som = avg('sommeil'), en = avg('energie'), fo = avg('force'); let score = 0; const why = [];
    if (som != null && som < 6.5) { score += 3; why.push('Sommeil moyen ' + fx(som, 1) + ' h'); } else if (som != null && som < 7) { score += 2; why.push('Sommeil moyen ' + fx(som, 1) + ' h'); }
    if (en != null && en <= 5) { score += 2; why.push('Énergie ' + fx(en, 1) + '/10'); }
    if (fo != null && fo <= 5) { score += 2; why.push('Force perçue ' + fx(fo, 1) + '/10'); }
    let rs = 0, rn = 0; const from = addDays(date, -6);
    Object.keys(seances).forEach(k => { const se = seances[k]; if (!se || se.date < from || se.date > date) return; (se.exos || []).forEach(x => (x.sets || []).forEach(s => { if (setFait(s) && num(s.rpe)) { rs += s.rpe; rn++; } })); });
    const rpe = rn ? rs / rn : null;
    if (rpe != null && rpe >= 9.3) { score += 2; why.push('RPE moyen ' + fx(rpe, 1)); }
    let reg = 0; const GR = groupes(cfg); Object.keys(GR).concat(['squat', 'tractions']).forEach(k => {
      const h = GR[k] ? (liftCle(seances, k, cfg) || {}).h : histoExo(seances, k); const t = h ? tendanceExo(h) : null; if (t && t.st === 'regression') reg++;
    });
    if (reg >= 2) { score += 2; why.push(reg + ' mouvements en régression'); }
    const niveau = score >= 6 ? 'élevée' : score >= 3 ? 'modérée' : 'faible';
    const txt = score >= 6 ? 'Décharge : 1 semaine à −40 % de séries, RPE ≤ 7, calories à maintenance 1 à 2 jours.' : score >= 3 ? 'Retire 1 série par exercice sur les composés, garde les charges. Priorité sommeil.' : 'Récupération suffisante. Progression normale.';
    return { score, niveau, st: score >= 6 ? 'crit' : score >= 3 ? 'warn' : 'good', why, txt, som, en, fo, rpe };
  }
  function prochaineSeance(seances, cfg, date) {
    const from = lundi(date), fait = {};
    Object.keys(seances).forEach(k => { const se = seances[k]; if (se && se.date >= from && se.date <= addDays(from, 6) && se.date !== date) fait[se.type] = 1; });
    const tp = types(cfg); for (const t of tp) if (!fait[t]) return t;
    return tp[0];
  }
  /* Marche inclinée, équation ACSM (kcal brutes). */
  function cardioKcal(min, kmh, incl, poids) {
    if (!(min > 0) || !(kmh > 0)) return 0;
    const v = kmh * 1000 / 60, vo2 = 3.5 + 0.1 * v + 1.8 * v * ((incl || 0) / 100);
    return vo2 * (poids || 76) / 1000 * 5 * min;
  }
  function resumeSeance(se) {
    let sets = 0, tonnage = 0, rs = 0, rn = 0;
    ((se && se.exos) || []).forEach(x => (x.sets || []).forEach(s => { if (!setFait(s)) return; sets++; tonnage += (s.kg || 0) * s.r; if (num(s.rpe)) { rs += s.rpe; rn++; } }));
    return { sets, tonnage, rpe: rn ? rs / rn : null };
  }

  return {
    pad, iso, parse, today, addDays, dow, diffDays, range, lundi, uid, num, fx, sg, kgTxt,
    TYPES, types, SUPPS_DEF, supps, groupes, GROUPES_DEF, focusLabel, DEFAULT_CFG, mergeCfg, seanceDuJour, statutDuJour, cibleDuJour, mifflin, bilanTheorique,
    FOODS, CATS, allFoods, foodOf, grams, mac, totMeal, totJour, Z, add,
    MODELES, pas, arrondi, ajuster, planDuJour, swapOptions, boucler, lissage,
    serie, mm7, serieMM7, pente, tendance, verdictRythme, eta, tdee, adherence, navy, lecture,
    MUSCLES, EXOS, PROG, GROUPES, allExos, progOf, setFait, setDur, e1rm, volumeEntre, volumePlanType, focusSemaine,
    histoExo, objectif, tendanceExo, liftCle, alertesFocus, fatigue, prochaineSeance, cardioKcal, resumeSeance,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Apex;

/* ---- 11-onboard-logic.js ---- */
/* ApexHQ — questionnaire : calories précises, programme de séances, plan repas adapté.
   Étend le moteur Apex (fonctions pures, testées par test-onboard.js). */
(function () {
  'use strict';
  const A = Apex, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rd = v => Math.round(v / 10) * 10;

  /* ---------- aliments utiles aux régimes végétariens ---------- */
  const F = (id, n, c, r, k, p, g, l, f, d) => { A.FOODS[id] = { id, n, c, r, k, p, g, l, f, d, u: null, etq: 0 }; };
  F('tofu', 'Tofu ferme', 'prot', 'P', 140, 15, 2, 8, 1, 150);
  F('seitan', 'Seitan', 'prot', 'P', 120, 24, 4, 2, 1, 150);
  F('soja', 'Protéines de soja texturées (sec)', 'prot', 'P', 330, 50, 20, 2, 13, 40);
  F('pois', 'Pois chiches cuits', 'feck', 'G', 120, 8, 18, 2.5, 5, 150);

  /* ---------- objectifs ---------- */
  const OBJECTIFS = [['seche', 'Sèche', 'Perdre du gras en gardant le muscle'], ['neutre', 'Maintien', 'Poids stable, recomposition'], ['masse', 'Prise de masse', 'Prendre du muscle avec peu de gras']];
  const INTENSITES = {
    seche: [['leger', 'Léger', 0.12, 'Environ −0,3 à −0,5 % du poids par semaine. Facile à tenir, faim modérée.'], ['normal', 'Normal', 0.2, 'Environ −0,5 à −0,7 % par semaine. Le meilleur compromis.'], ['agressif', 'Agressif', 0.28, 'Environ −0,8 à −1 % par semaine. Court terme : faim, fatigue, risque de perdre du muscle.']],
    masse: [['leger', 'Lean', 0.05, 'Prise lente, très peu de gras.'], ['normal', 'Normal', 0.1, 'Prise régulière, un peu de gras.'], ['agressif', 'Rapide', 0.15, 'Prise rapide, plus de gras à reperdre ensuite.']],
    neutre: [['normal', 'Maintien', 0, 'Calories égales à ta dépense.']],
  };
  const intensites = obj => INTENSITES[obj] || INTENSITES.neutre;

  /* ---------- calories ---------- */
  function calcPlan(q) {
    const kg = q.poids, warn = [], n = clamp(Math.round(q.seances || 0), 0, 7);
    const mg = A.num(q.mg) && q.mg >= 4 && q.mg <= 55 ? q.mg : null;
    const bmr = mg != null ? 370 + 21.6 * kg * (1 - mg / 100) : 10 * kg + 6.25 * q.taille - 5 * q.age + (q.sexe === 'F' ? -161 : 5);
    const jobF = { sedentaire: 1.2, debout: 1.3, actif: 1.45 }[q.metier] || 1.3, baseSteps = { sedentaire: 5000, debout: 7500, actif: 10000 }[q.metier] || 7500;
    const pas = A.num(q.pas) ? q.pas : baseSteps;
    const stepsK = clamp((pas - baseSteps) * 0.045 * kg / 75, -250, 900);
    const trainK = n * 4 * kg * ((A.num(q.duree) ? q.duree : 60) / 60) / 7, cardioK = (A.num(q.cardio) ? q.cardio : 0) * 4 * kg / 60 / 7;
    const tdee = bmr * jobF + stepsK + trainK + cardioK, obj = q.objectif || 'seche';
    const list = intensites(obj), it = list.find(x => x[0] === q.intensite) || list[0];
    let delta = obj === 'seche' ? -tdee * it[2] : obj === 'masse' ? tdee * it[2] : 0;
    if (obj === 'seche') { const cap = 0.01 * kg * 7700 / 7; if (-delta > cap) { delta = -cap; warn.push('Déficit plafonné à 1 % du poids par semaine.'); } }
    const floor = Math.max(q.sexe === 'F' ? 1200 : 1500, 0.9 * bmr);
    let avg = tdee + delta;
    if (avg < floor) { avg = floor; delta = avg - tdee; warn.push('Calories relevées au plancher de sécurité (' + rd(floor) + ' kcal).'); }
    const gkg = obj === 'seche' ? { leger: 2.0, normal: 2.2, agressif: 2.4 }[it[0]] : obj === 'masse' ? 1.8 : 1.9;
    const lkg = obj === 'seche' ? (it[0] === 'agressif' ? 0.7 : 0.8) : obj === 'masse' ? 1.0 : 0.9;
    let P = Math.round(gkg * kg); if (P * 4 > avg * 0.35) P = Math.round(avg * 0.35 / 4);
    const L = Math.max(Math.round(0.6 * kg), Math.min(Math.round(lkg * kg), Math.round((avg - P * 4) * 0.5 / 9)));
    let salleK = avg, reposK = avg;
    if (n > 0 && n < 7) { salleK = avg * 1.05; reposK = (7 * avg - n * salleK) / (7 - n); if (reposK < floor) { reposK = floor; salleK = (7 * avg - (7 - n) * floor) / n; } }
    const mk = k => { const kk = rd(k); return { kcal: kk, p: P, g: Math.max(0, Math.round((kk - 4 * P - 9 * L) / 4)), l: L }; };
    const kgSem = delta * 7 / 7700;
    return {
      bmr, tdee, delta, avg, n, mg, it, warn, nap: tdee / bmr, kgSem, pctSem: kgSem / kg * 100,
      salle: mk(salleK), repos: mk(reposK), planchers: { kcal: rd(floor), p: Math.round(P * 0.9 / 5) * 5, l: Math.min(L, Math.max(40, Math.round(0.65 * kg))) },
      parts: { base: bmr * jobF, steps: stepsK, train: trainK, cardio: cardioK },
    };
  }
  /* Config prête à écrire : profil + cibles issus du questionnaire. */
  function planToCfg(q, plan) {
    const pas = clamp(Math.round((q.pas || 8000) / 500) * 500, 6000, 14000), pasMin = q.objectif === 'seche' ? Math.max(10000, pas) : Math.max(7000, pas);
    return {
      profil: { sexe: q.sexe === 'F' ? 'F' : 'H', age: q.age, taille: q.taille, poidsDepart: q.poids, dateDepart: A.today(), poidsCible: A.num(q.poidsCible) ? q.poidsCible : q.poids, nap: +plan.nap.toFixed(2) },
      cibles: { salle: plan.salle, repos: plan.repos, fibres: Math.max(25, Math.round(14 * plan.avg / 1000)), eau: clamp(Math.round(q.poids * 0.035 * 2) / 2, 2, 4.5), pasMin, pasMax: pasMin + 4000, sommeil: 7, planchers: plan.planchers },
    };
  }

  /* ---------- points faibles proposés ---------- */
  const FOCUS_CHOIX = [
    ['pecH', 'Haut des pectoraux', { n: 'Pectoraux (haut)', m: ['pecH', 'pec'], min: 14, max: 20, freq: 2, sub: { m: 'pecH', n: 'haut', min: 9 } }],
    ['pec', 'Pectoraux', { n: 'Pectoraux', m: ['pecH', 'pec'], min: 12, max: 18, freq: 2 }],
    ['bic', 'Biceps', { n: 'Biceps', m: ['bic'], min: 10, max: 14, freq: 2 }],
    ['tri', 'Triceps', { n: 'Triceps', m: ['tri'], min: 10, max: 14, freq: 2 }],
    ['dLat', 'Épaules (faisceau latéral)', { n: 'Deltoïdes latéraux', m: ['dLat'], min: 12, max: 18, freq: 3 }],
    ['dPost', 'Épaules arrière', { n: 'Épaules arrière', m: ['dPost'], min: 8, max: 14, freq: 2 }],
    ['dos', 'Dos', { n: 'Dos', m: ['dos'], min: 14, max: 20, freq: 2 }],
    ['quad', 'Cuisses (quadriceps)', { n: 'Quadriceps', m: ['quad'], min: 10, max: 16, freq: 2 }],
    ['isch', 'Ischios et fessiers', { n: 'Ischios et fessiers', m: ['isch', 'fess'], min: 8, max: 14, freq: 2 }],
    ['mol', 'Mollets', { n: 'Mollets', m: ['mol'], min: 8, max: 14, freq: 2 }],
    ['abd', 'Abdos', { n: 'Abdos', m: ['abd'], min: 6, max: 12, freq: 2 }],
  ];
  const focusGroupes = keys => { const out = [], seen = {}; (keys || []).forEach(k => { const c = FOCUS_CHOIX.find(x => x[0] === k); if (!c) return; const g = Object.assign({ id: 'f_' + k }, c[2]); const key = g.m.join(); if (seen[key]) return; seen[key] = 1; out.push(g); }); return out; };

  /* ---------- programme de séances ---------- */
  const SPLITS = { ppl: ['Push / Pull / Legs', ['Push', 'Pull', 'Legs']], ul: ['Haut / Bas', ['Upper', 'Lower']], fb: ['Full body', ['Full body']], ppl_ul: ['PPL + Haut / Bas (5 jours)', ['Push', 'Pull', 'Legs', 'Upper', 'Lower']] };
  const JOURS_ENT = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 0] };
  const FULL = [['squat', 3], ['dc', 3], ['tractions', 3], ['dm_halt', 2], ['rdl', 2], ['curl_inc', 2], ['tri_corde', 2], ['el_halt', 3]];
  const ISO = { pecH: 'ec_bh', pec: 'pec_deck', dLat: 'el_halt', dAnt: 'dm_halt', dPost: 'face_pull', bic: 'curl_inc', tri: 'tri_corde', dos: 'tir_horiz', quad: 'leg_ext', isch: 'leg_curl', fess: 'rdl', mol: 'mollets', abd: 'crunch' };
  const SUBISO = { pecH: 'di_halt' };
  const splitSuggere = n => (n <= 3 ? (n === 3 ? 'fb' : 'fb') : n === 4 ? 'ul' : n === 5 ? 'ppl_ul' : 'ppl');
  function genProgramme(q, groupes, cfg) {
    const ex = A.allExos(cfg), n = clamp(Math.round(q.seances || 0), 0, 7), base = (SPLITS[q.split] || SPLITS.ppl_ul)[1];
    const planning = { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' };
    const ORD = [1, 2, 3, 4, 5, 6, 0], days = Array.isArray(q.jours) && q.jours.length ? q.jours.filter(d => d >= 0 && d <= 6).sort((a, b) => ORD.indexOf(a) - ORD.indexOf(b)) : (n ? JOURS_ENT[n] : []), seq = days.map((d, i) => base[i % base.length]);
    days.forEach((d, i) => { planning[d] = seq[i]; });
    const used = []; seq.forEach(t => { if (used.indexOf(t) < 0) used.push(t); });
    if (!used.length) base.forEach(t => used.push(t));
    const occ = {}; seq.forEach(t => { occ[t] = (occ[t] || 0) + 1; }); used.forEach(t => { if (!occ[t]) occ[t] = 1; });
    const scale = { debutant: 0.75, intermediaire: 1, avance: 1.1 }[q.niveau] || 1, prog = {};
    used.forEach(t => { const tpl = t === 'Full body' ? FULL : (A.PROG[t] || []); prog[t] = tpl.map(x => ({ e: x[0], n: clamp(Math.round(x[1] * scale), 2, 6) })); });
    const has = (t, mus) => prog[t].some(x => ex[x.e] && mus.indexOf(ex[x.e].m) >= 0);
    (groupes || []).forEach(g => {
      if (g.sub) { // faisceau prioritaire (ex. haut des pecs) : on le sert d'abord avec des exercices dédiés
        const sm = g.sub.m, sc = () => used.reduce((s, t) => s + occ[t] * prog[t].filter(x => ex[x.e] && ex[x.e].m === sm).reduce((a, x) => a + x.n, 0), 0);
        for (let guard = 0; guard < 20 && sc() < g.sub.min; guard++) {
          const cand = []; used.forEach(t => prog[t].forEach(x => { if (ex[x.e] && ex[x.e].m === sm && x.n < 5) cand.push([t, x]); }));
          if (cand.length) { cand.sort((a, b) => a[1].n - b[1].n || occ[b[0]] - occ[a[0]]); cand[0][1].n++; continue; }
          const id = SUBISO[sm] || ISO[sm]; if (!id || !ex[id]) break;
          const tg = used.filter(t => !prog[t].some(x => x.e === id)).sort((a, b) => occ[b] - occ[a])[0]; if (!tg) break; prog[tg].push({ e: id, n: 3 });
        }
      }
      const mus = g.m, cnt = () => used.reduce((s, t) => s + occ[t] * prog[t].filter(x => ex[x.e] && mus.indexOf(ex[x.e].m) >= 0).reduce((a, x) => a + x.n, 0), 0), freq = () => used.filter(t => has(t, mus)).reduce((s, t) => s + occ[t], 0);
      for (let guard = 0; guard < 30 && (cnt() < g.min || freq() < (g.freq || 1)); guard++) {
        if (cnt() < g.min && freq() >= (g.freq || 1)) {
          const cand = []; used.forEach(t => prog[t].forEach(x => { if (ex[x.e] && mus.indexOf(ex[x.e].m) >= 0 && x.n < 5) cand.push([t, x]); }));
          if (cand.length) { cand.sort((a, b) => a[1].n - b[1].n || occ[b[0]] - occ[a[0]]); cand[0][1].n++; continue; }
        }
        const isoId = mus.map(m => ISO[m]).find(id => id && ex[id]); if (!isoId) break;
        const tg = used.filter(t => !has(t, mus) && !prog[t].some(x => x.e === isoId)).sort((a, b) => occ[b] - occ[a])[0] || used.filter(t => !prog[t].some(x => x.e === isoId)).sort((a, b) => occ[b] - occ[a])[0];
        if (!tg) break; prog[tg].push({ e: isoId, n: 3 });
      }
    });
    return { seanceTypes: used, programme: prog, planning };
  }
  /* Séries directes par semaine pour un groupe, d'après programme + planning. */
  function volumeGroupe(res, g, cfg) {
    const ex = A.allExos(cfg), occ = {}; Object.keys(res.planning).forEach(d => { const t = res.planning[d]; if (t) occ[t] = (occ[t] || 0) + 1; });
    return Object.keys(res.programme).reduce((s, t) => s + (occ[t] || 0) * res.programme[t].filter(x => ex[x.e] && g.m.indexOf(ex[x.e].m) >= 0).reduce((a, x) => a + x.n, 0), 0);
  }
  /* Valide la réponse de l'IA : renvoie un programme propre ou null. */
  function validerProgrammeIA(r, n, cfg, jours) {
    try {
      const ex = A.allExos(cfg); if (!r || !Array.isArray(r.seances) || r.seances.length < 1 || r.seances.length > 7 || !r.planning) return null;
      const names = [], prog = {};
      for (const s of r.seances) {
        const nom = String(s.nom || '').trim().slice(0, 24); if (!nom || names.some(x => x.toLowerCase() === nom.toLowerCase()) || !Array.isArray(s.exercices)) return null;
        const list = s.exercices.map(x => ({ e: String(x.id), n: Math.round(Number(x.series)) })).filter(x => ex[x.e] && x.n >= 1 && x.n <= 8);
        if (list.length < 3 || list.length > 12) return null; names.push(nom); prog[nom] = list;
      }
      const planning = { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' }; let days = 0;
      for (const d of Object.keys(r.planning)) { const k = Number(d); if (!(k >= 0 && k <= 6)) return null; const v = String(r.planning[d] || '').trim(); if (v) { const m = names.find(x => x.toLowerCase() === v.toLowerCase()); if (!m) return null; planning[k] = m; days++; } }
      if (days !== n) return null;
      if (Array.isArray(jours) && jours.length && Object.keys(planning).some(k => planning[k] && jours.indexOf(+k) < 0)) return null;
      return { seanceTypes: names, programme: prog, planning };
    } catch (e) { return null; }
  }

  /* ---------- régime, exclusions, plan repas ---------- */
  const norm0 = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const KEYW = {
    poisson: ['cabillaud', 'saumon', 'thon', 'crevettes'], viande: ['poulet', 'dinde', 'bh5', 'boeuf', 'cheval', 'jambon'], porc: ['jambon'], boeuf: ['bh5', 'boeuf'], volaille: ['poulet', 'dinde'],
    oeuf: ['oeuf', 'blanc'], oeufs: ['oeuf', 'blanc'], laitage: ['skyr', 'fb0', 'lait', 'emmental', 'vqr'], laitages: ['skyr', 'fb0', 'lait', 'emmental', 'vqr'], lait: ['skyr', 'fb0', 'lait', 'emmental', 'vqr'], lactose: ['skyr', 'fb0', 'lait', 'emmental', 'vqr'],
    gluten: ['pates', 'pain', 'wrap', 'avoine'], arachide: ['beurrecac'], arachides: ['beurrecac'], noix: ['noix', 'cajou', 'amandes'], 'fruits a coque': ['noix', 'cajou', 'amandes'], crevette: ['crevettes'], 'fruits de mer': ['crevettes'],
  };
  function exclusIds(q, foods) {
    const ex = {}, add = a => a.forEach(i => { ex[i] = 1; }), r = q.regime;
    if (r === 'vegetarien' || r === 'vegan') { add(KEYW.viande); add(KEYW.poisson); }
    if (r === 'pescetarien') add(KEYW.viande);
    if (r === 'vegan') { add(KEYW.oeuf); add(KEYW.laitage); }
    String(q.exclus || '').split(/[,;\n]/).map(s => norm0(s).trim()).filter(s => s.length > 2).forEach(tok => {
      if (KEYW[tok]) add(KEYW[tok]); else Object.keys(foods).forEach(id => { if (norm0(foods[id].n).indexOf(tok) >= 0) ex[id] = 1; });
    });
    return ex;
  }
  const PCAND = ['poulet', 'dinde', 'saumon', 'cabillaud', 'thon', 'oeuf', 'skyr', 'fb0', 'tofu', 'seitan', 'soja'], GCAND = ['riz', 'pdt', 'pates', 'gnocchi', 'patate', 'avoine', 'lentilles', 'pois'], LCAND = ['huile', 'amandes', 'noix', 'avocat', 'beurrecac', 'cajou'];
  function modelesPour(q, foods) {
    const ex = exclusIds(q, foods), out = {};
    ['salle', 'repos'].forEach(st => {
      out[st] = A.MODELES[st].map(m => {
        const its = [];
        m.items.forEach(x => {
          const id = x[0], f = foods[id]; if (!f) return;
          const isWhey = id === 'clearwhey' || id === 'wheychoco', role = isWhey ? 'P' : f.r;
          if (!(ex[id] || (isWhey && !q.whey))) { its.push({ a: id, q: x[1], adj: x[2] ? 1 : 0 }); return; }
          if (!role) return;
          const nid = (role === 'P' ? PCAND : role === 'G' ? GCAND : LCAND).find(i => !ex[i] && foods[i] && !its.some(y => y.a === i));
          if (nid) { const nf = foods[nid]; its.push({ a: nid, q: nf.d || (nf.u ? 1 : 100), adj: 1 }); }
        });
        return { id: m.id, nom: m.nom, h: m.h, items: its };
      });
    });
    return out;
  }
  /* Aliment « ma whey » : valeurs pour 100 g + dose, remplace les deux whey du plan par défaut. */
  function wheyAliments(w) {
    if (!w) return {}; const dose = clamp(Math.round(w.dose || 30), 5, 100), nm = String(w.n || 'Ma whey').slice(0, 60);
    const f = id => ({ id, n: nm, c: 'supp', r: '', k: w.k || 0, p: w.p || 0, g: w.g || 0, l: w.l || 0, f: w.f || 0, d: 1, u: ['dose ' + dose + ' g', dose], etq: w.verified ? 0 : 1 });
    return { clearwhey: f('clearwhey'), wheychoco: f('wheychoco') };
  }
  const SUPP_CHOIX = [['crea', 'Créatine', 'tous les jours'], ['om3', 'Oméga-3', 'avec un repas'], ['d3', 'Vitamine D3', 'avec un repas gras'], ['mag', 'Magnésium', 'le soir'], ['mv', 'Multivitamines', 'le matin'], ['ash', 'Ashwagandha', 'le soir'], ['caf', 'Caféine', 'avant la séance'], ['cas', 'Caséine', 'le soir'], ['coll', 'Collagène', 'au choix'], ['bcaa', 'EAA / BCAA', 'pendant la séance']];
  const suppsListe = (keys, autre) => {
    const l = (keys || []).map(k => SUPP_CHOIX.find(x => x[0] === k)).filter(Boolean).map(x => ({ id: x[0], n: x[1], note: x[2] }));
    String(autre || '').split(/[,;\n]/).map(s => s.trim().slice(0, 40)).filter(Boolean).slice(0, 6).forEach((s, i) => l.push({ id: 's_o' + i, n: s, note: '' }));
    return l;
  };

  Object.assign(A, { OBJECTIFS, INTENSITES, intensites, calcPlan, planToCfg, FOCUS_CHOIX, focusGroupes, SPLITS, splitSuggere, genProgramme, volumeGroupe, validerProgrammeIA, exclusIds, modelesPour, wheyAliments, SUPP_CHOIX, suppsListe });
})();

/* ---- 12-adapt-logic.js ---- */
/* ApexHQ — adaptation d'une séance : temps disponible, matériel, zones sensibles, forme du jour, points faibles.
   Fonctions pures (testées par test-adapt.js). Étend le moteur Apex. */
(function () {
  'use strict';
  const A = Apex, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- exercices au poids du corps (séances sans matériel) ---------- */
  const X = (id, n, m, s, lo, hi, inc) => { A.EXOS[id] = { id, n, m, s: s || [], lo, hi, inc }; };
  X('pompes', 'Pompes', 'pec', ['dAnt', 'tri'], 8, 20, 2.5);
  X('pompes_pieds', 'Pompes pieds surélevés', 'pecH', ['dAnt', 'tri'], 8, 15, 2.5);
  X('pompes_pike', 'Pompes en V (épaules)', 'dAnt', ['tri'], 6, 15, 2.5);
  X('pompes_diamant', 'Pompes diamant', 'tri', ['pec'], 8, 15, 2.5);
  X('rowing_inv', 'Rowing inversé (table ou barre basse)', 'dos', ['bic'], 8, 15, 2.5);
  X('squat_pdc', 'Squat poids du corps', 'quad', ['fess'], 15, 30, 2.5);
  X('fentes_pdc', 'Fentes marchées', 'quad', ['fess'], 12, 24, 2.5);
  X('pont_fessier', 'Pont fessier', 'fess', ['isch'], 12, 25, 2.5);
  X('gainage', 'Gainage (planche)', 'abd', [], 8, 20, 2.5);

  /* ---------- matériel ---------- */
  const EQ = {
    barre: ['dc', 'row_barre', 'squat', 'rdl', 'barre_front', 'curl_ez', 'curl_pup'],
    halteres: ['di_halt', 'el_halt', 'dm_halt', 'curl_inc', 'row_uni', 'curl_mart', 'fentes'],
    poulie: ['ec_bh', 'tri_corde', 'tri_oh', 'tir_horiz', 'el_poulie', 'face_pull', 'crunch', 'tir_neutre', 'curl_bay'],
    machine: ['presse', 'leg_curl', 'leg_ext', 'mollets', 'di_smith', 'pec_deck', 'el_mach', 'hack', 'leg_curl_assis', 'mollets_assis'],
    barrefixe: ['tractions'],
    corps: ['pompes', 'pompes_pieds', 'pompes_pike', 'pompes_diamant', 'rowing_inv', 'squat_pdc', 'fentes_pdc', 'pont_fessier', 'gainage'],
  };
  Object.keys(EQ).forEach(k => EQ[k].forEach(id => { if (A.EXOS[id]) A.EXOS[id].eq = k; }));
  const EQUIP = [['salle', 'Salle complète', 'Barres, machines, poulies, haltères.'], ['limite', 'Salle limitée', 'Haltères, poulie, barre de traction.'], ['maison', 'Maison avec haltères', 'Haltères et ton poids du corps.'], ['zero', 'Sans matériel', 'Poids du corps seulement.']];
  const EQMODES = { salle: ['barre', 'halteres', 'poulie', 'machine', 'barrefixe', 'corps'], limite: ['halteres', 'poulie', 'corps', 'barrefixe'], maison: ['halteres', 'corps'], zero: ['corps'] };
  const eqOk = (mode, exo) => !exo || !exo.eq || (EQMODES[mode] || EQMODES.salle).indexOf(exo.eq) >= 0;

  /* ---------- durée estimée : 6 min d'échauffement + 2,2 min par série (3 pour les gros mouvements) ---------- */
  const LOURDS = ['squat', 'dc', 'rdl', 'presse', 'row_barre', 'dm_halt', 'tractions', 'hack', 'di_halt', 'di_smith', 'tir_neutre', 'fentes', 'squat_pdc', 'pompes'];
  const dureeSeance = (plan, exos) => Math.round(6 + (plan || []).reduce((s, x) => s + x.n * (LOURDS.indexOf(x.e) >= 0 ? 3 : 2.2), 0));

  /* ---------- zones sensibles ---------- */
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ZONES = [['epaule', ['dAnt', 'dLat', 'dPost']], ['coude', ['tri', 'bic']], ['poignet', ['tri', 'bic']], ['genou', ['quad']], ['hanche', ['fess']], ['dos', ['dos']], ['lombaire', ['isch']], ['pec', ['pec', 'pecH']]];
  const zonesSensibles = txt => { const t = norm(txt), m = []; ZONES.forEach(z => { if (t.indexOf(z[0]) >= 0) z[1].forEach(x => { if (m.indexOf(x) < 0) m.push(x); }); }); return m; };

  /* Adapte un plan [{e, n}] aux contraintes. Renvoie { plan, duree, notes }. */
  function adapterSeance(o) {
    const cfg = o.cfg, ex = A.allExos(cfg), GR = A.groupes(cfg), notes = [], focusMus = [];
    (o.focus || []).forEach(id => { if (GR[id]) GR[id].m.forEach(m => { if (focusMus.indexOf(m) < 0) focusMus.push(m); }); });
    const ok = e => eqOk(o.equip, ex[e]), evite = zonesSensibles(o.douleurs);
    const used = () => plan.map(p => p.e);
    let plan = [];
    (o.plan || []).filter(x => ex[x.e]).forEach(x => {
      const nx = { e: x.e, n: x.n }, e0 = ex[x.e];
      if (evite.indexOf(e0.m) >= 0) { notes.push(e0.n + ' retiré : zone sensible.'); return; }
      if (ok(x.e)) { plan.push(nx); return; }
      const alt = Object.keys(ex).find(id => ex[id].m === e0.m && ok(id) && evite.indexOf(ex[id].m) < 0 && !used().includes(id) && !(o.plan || []).some(p => p.e === id));
      if (alt) { plan.push({ e: alt, n: x.n }); notes.push(e0.n + ' remplacé par ' + ex[alt].n + ' (matériel).'); } else notes.push(e0.n + ' retiré : pas de matériel adapté.');
    });
    const muscles = ['pec', 'dos', 'quad', 'isch', 'dAnt', 'bic', 'tri', 'abd', 'fess'];
    const ajouter = (mus, n) => { const id = Object.keys(ex).find(i => mus.indexOf(ex[i].m) >= 0 && ok(i) && evite.indexOf(ex[i].m) < 0 && !used().includes(i)); if (id) { plan.push({ e: id, n }); return id; } return null; };
    if (focusMus.length) { const manque = focusMus.filter(m => !plan.some(p => ex[p.e].m === m)); if (manque.length) { const id = ajouter(manque, 3); if (id) notes.push(ex[id].n + ' ajouté pour ta priorité du jour.'); } }
    for (let i = 0; plan.length < 4 && i < muscles.length; i++) ajouter([muscles[i]], 3);
    if (o.forme != null && o.forme <= 4) { plan.forEach(x => { x.n = Math.max(2, x.n - 1); }); notes.push('Forme basse : une série en moins par exercice. Garde les charges, arrête-toi à 2 répétitions de la limite.'); }
    const foc = x => focusMus.indexOf(ex[x.e].m) >= 0, cible = clamp(Math.round(o.minutes || 60), 20, 150);
    const avant = dureeSeance(plan, ex);
    for (let g = 0; g < 100 && dureeSeance(plan, ex) > cible; g++) {
      const c = plan.map((x, i) => [x, i]).filter(p => !foc(p[0]) && p[0].n > 2).sort((a, b) => b[0].n - a[0].n || b[1] - a[1])[0];
      if (c) { c[0].n--; continue; }
      const r = plan.map((x, i) => [x, i]).filter(p => !foc(p[0])).pop(); if (r && plan.length > 3) { plan.splice(r[1], 1); continue; }
      const f = plan.filter(x => x.n > 2).sort((a, b) => b.n - a.n)[0]; if (f) { f.n--; continue; }
      if (plan.length > 2) plan.pop(); else break;
    }
    for (let g = 0; g < 30 && focusMus.length && dureeSeance(plan, ex) + 3 <= cible; g++) { const f = plan.filter(x => foc(x) && x.n < 5).sort((a, b) => a.n - b.n)[0]; if (!f) break; f.n++; }
    const apres = dureeSeance(plan, ex);
    if (apres < avant) notes.push('Séance ramenée à environ ' + apres + ' min (série et exercices secondaires réduits, points faibles gardés).');
    return { plan, duree: apres, notes };
  }

  /* Valide la séance proposée par l'IA : { exercices:[{id, series}], conseils:[...] } → { plan, notes, duree } ou null. */
  function validerSeanceIA(r, o) {
    try {
      const ex = A.allExos(o.cfg); if (!r || !Array.isArray(r.exercices)) return null;
      const evite = zonesSensibles(o.douleurs), seen = {};
      const plan = r.exercices.map(x => ({ e: String(x && x.id), n: Math.round(Number(x && x.series)) })).filter(x => ex[x.e] && eqOk(o.equip, ex[x.e]) && evite.indexOf(ex[x.e].m) < 0 && x.n >= 1 && x.n <= 8 && !seen[x.e] && (seen[x.e] = 1));
      if (plan.length < 3 || plan.length > 12) return null;
      const duree = dureeSeance(plan, ex); if (duree > (o.minutes || 60) * 1.2 + 3) return null;
      const notes = (Array.isArray(r.conseils) ? r.conseils : []).map(s => String(s).trim().slice(0, 180)).filter(Boolean).slice(0, 5);
      return { plan, notes, duree };
    } catch (e) { return null; }
  }

  Object.assign(A, { EQUIP, EQMODES, eqOk, dureeSeance, zonesSensibles, adapterSeance, validerSeanceIA });
})();

/* ---- 15-store.js ---- */
/* ApexHQ — état : cache localStorage + base privée du compte (capacité db, sous-arbre data/users/<id>/apex).
   Local d'abord : chaque modification est écrite sur l'appareil, puis poussée document par document.
   Les champs modifiés localement gagnent sur le distant tant qu'ils ne sont pas confirmés. */
const Store = (() => {
  'use strict';
  const LS = 'apexhq:v1';
  const pickSample = () => (window.APEX_STANDALONE ? (typeof AI !== 'undefined' && AI.hasAny() ? AI.chain(null) : null) : nativeSample);
  const COLLS = ['journal', 'seances', 'mensurations', 'photos'];
  const ID_OK = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
  let s = { cfg: {}, journal: {}, seances: {}, mensurations: {}, photos: {} };
  let dirty = {}, seq = 1, ver = 0, cfgMemo = null, cfgVer = -1, base = null, saveT = 0, waitT = 0, nativeSample = null;
  const sync = { mode: 'boot', pending: 0, err: null };
  const caps = { user: null, db: null, downloads: null, assets: null, sample: null, dictation: null };
  const ready = {}, subs = new Set(), timers = {}, flight = {}, fails = {};
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = o => JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const collOf = key => (key === 'cfg' ? 'cfg' : key.slice(0, key.indexOf('/')));
  const idOf = key => key.slice(key.indexOf('/') + 1);

  try {
    const o = JSON.parse(localStorage.getItem(LS) || 'null');
    if (o && isObj(o.s)) {
      ['cfg'].concat(COLLS).forEach(c => { if (isObj(o.s[c])) s[c] = o.s[c]; });
      if (isObj(o.dirty)) dirty = o.dirty;
      seq = o.seq || 1;
    }
  } catch (e) { /* stockage indisponible : l'app tourne en mémoire */ }
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify({ s, dirty, seq, t: Date.now() })); } catch (e) { /* quota ou accès refusé */ } }, 160); };
  const emit = () => { ver++; subs.forEach(f => { try { f(); } catch (e) { /* abonné fautif ignoré */ } }); };

  function patch(coll, id, fields) {
    const key = coll === 'cfg' ? 'cfg' : coll + '/' + id;
    const next = Object.assign({}, coll === 'cfg' ? s.cfg : (s[coll][id] || {}));
    const d = dirty[key] && dirty[key].f ? dirty[key] : (dirty[key] = { f: {} });
    for (const k in fields) { const v = fields[k]; if (v === null || v === undefined) delete next[k]; else next[k] = v; d.f[k] = ++seq; }
    s = Object.assign({}, s, coll === 'cfg' ? { cfg: next } : { [coll]: Object.assign({}, s[coll], { [id]: next }) });
    delete fails[key]; save(); emit(); schedule(key);
  }
  function del(coll, id) {
    const key = coll + '/' + id, c = Object.assign({}, s[coll]); delete c[id];
    s = Object.assign({}, s, { [coll]: c }); dirty[key] = { del: ++seq };
    delete fails[key]; save(); emit(); schedule(key);
  }

  /* Restaure un document tel qu'il était (annulation d'une action du coach). prev === null : le document n'existait pas. */
  function replace(coll, id, prev) {
    if (!prev) { if (s[coll][id]) del(coll, id); return; }
    const key = coll + '/' + id, cur = s[coll][id] || {}, d = dirty[key] && dirty[key].f ? dirty[key] : (dirty[key] = { f: {} });
    Object.keys(cur).concat(Object.keys(prev)).forEach(k => { d.f[k] = ++seq; });
    s = Object.assign({}, s, { [coll]: Object.assign({}, s[coll], { [id]: JSON.parse(JSON.stringify(prev)) }) });
    delete fails[key]; save(); emit(); schedule(key);
  }
  const refOf = key => (key === 'cfg' ? caps.db.doc(base) : caps.db.doc(base).collection(collOf(key)).doc(idOf(key)));
  function schedule(key, ms) {
    if (!base || !ready[collOf(key)]) return;
    clearTimeout(timers[key]); timers[key] = setTimeout(() => push(key), ms == null ? 700 : ms);
  }
  async function push(key) {
    const d = dirty[key]; if (!d || !base) return;
    if (flight[key]) { flight[key] = 2; return; }
    flight[key] = 1; sync.pending++; emit();
    const sent = d.del ? { del: d.del } : { f: Object.assign({}, d.f) };
    let done = false;
    try {
      const ref = refOf(key);
      if (sent.del) await ref.delete();
      else { const body = key === 'cfg' ? s.cfg : s[collOf(key)][idOf(key)]; if (body) await ref.set(clone(body)); }
      done = true; sync.err = null; delete fails[key];
    } catch (e) { sync.err = (e && e.code) || 'unavailable'; fails[key] = (fails[key] || 0) + 1; }
    if (done) {
      const cur = dirty[key];
      if (cur && sent.del) { if (cur.del === sent.del) delete dirty[key]; }
      else if (cur && cur.f) { for (const k in sent.f) if (cur.f[k] === sent.f[k]) delete cur.f[k]; if (!Object.keys(cur.f).length) delete dirty[key]; }
    }
    const again = flight[key] === 2; delete flight[key]; sync.pending--; save(); emit();
    if (dirty[key]) { if (done) schedule(key, again ? 250 : 400); else if (fails[key] < 6) schedule(key, Math.min(60000, 3000 * Math.pow(2, fails[key]))); }
  }

  function applyDoc(coll, id, data) {
    const key = coll + '/' + id, d = dirty[key]; if (d && d.del) return false;
    const next = clone(data);
    if (d && d.f) { const loc = s[coll][id] || {}; for (const k in d.f) { if (k in loc) next[k] = loc[k]; else delete next[k]; } }
    if (same(s[coll][id], next)) return false;
    s[coll] = Object.assign({}, s[coll], { [id]: next }); return true;
  }
  function markReady(c) {
    if (ready[c]) return; ready[c] = 1;
    Object.keys(dirty).forEach(k => { if (collOf(k) === c) schedule(k, 200); });
    if (['cfg'].concat(COLLS).every(x => ready[x])) { clearTimeout(waitT); sync.mode = 'ok'; emit(); }
  }
  function onColl(coll, snap) {
    let ch = false; const seen = {};
    snap.docs.forEach(doc => { if (!doc.exists) return; seen[doc.id] = 1; if (applyDoc(coll, doc.id, doc.data() || {})) ch = true; });
    if (!snap.metadata.fromCache) {
      Object.keys(s[coll]).forEach(id => { if (!seen[id] && !dirty[coll + '/' + id]) { const c = Object.assign({}, s[coll]); delete c[id]; s[coll] = c; ch = true; } });
      markReady(coll);
    }
    if (ch) { s = Object.assign({}, s); save(); emit(); }
  }
  function onCfg(snap) {
    let ch = false;
    if (snap.exists) {
      const next = clone(snap.data() || {}), d = dirty.cfg;
      if (d && d.f) for (const k in d.f) { if (k in s.cfg) next[k] = s.cfg[k]; else delete next[k]; }
      if (!same(s.cfg, next)) { s = Object.assign({}, s, { cfg: next }); ch = true; }
    }
    if (!snap.metadata.fromCache) markReady('cfg');
    if (ch) { save(); emit(); }
  }
  async function connect() {
    const use = n => { try { const c = window.claude; return c && typeof c.use === 'function' ? Promise.resolve(c.use(n)).catch(() => null) : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } };
    const names = Object.keys(caps), got = await Promise.all(names.map(use));
    names.forEach((n, i) => { caps[n] = got[i] || null; });
    nativeSample = caps.sample; caps.sample = pickSample();
    let uid = null; try { uid = caps.user ? await caps.user.id() : null; } catch (e) { uid = null; }
    if (!caps.db || !uid) { sync.mode = 'local'; emit(); return; }
    base = 'data/users/' + uid + '/apex'; sync.mode = 'wait'; emit();
    waitT = setTimeout(() => { if (sync.mode === 'wait') { sync.mode = 'stale'; emit(); } }, 10000);
    const fail = e => { sync.mode = 'err'; sync.err = (e && e.code) || 'unavailable'; emit(); };
    try {
      const root = caps.db.doc(base);
      root.onSnapshot(onCfg, fail);
      root.collection('journal').orderBy('date', 'desc').limit(500).onSnapshot(sn => onColl('journal', sn), fail);
      root.collection('seances').orderBy('date', 'desc').limit(500).onSnapshot(sn => onColl('seances', sn), fail);
      root.collection('mensurations').limit(500).onSnapshot(sn => onColl('mensurations', sn), fail);
      root.collection('photos').limit(500).onSnapshot(sn => onColl('photos', sn), fail);
    } catch (e) { fail(e); }
  }

  /* Après ajout ou retrait d'une clé API : recalcule l'accès à Claude. */
  const refreshAI = () => { caps.sample = pickSample(); emit(); };
  const exportAll = () => ({ app: 'ApexHQ', v: 1, exportedAt: new Date().toISOString(), cfg: s.cfg, journal: s.journal, seances: s.seances, mensurations: s.mensurations, photos: s.photos });
  function importAll(o) {
    if (!isObj(o) || o.app !== 'ApexHQ') throw new Error('Ce fichier n’est pas un export ApexHQ.');
    let n = 0;
    if (isObj(o.cfg) && Object.keys(o.cfg).length) { patch('cfg', null, o.cfg); n++; }
    COLLS.forEach(c => { const m = o[c]; if (!isObj(m)) return; Object.keys(m).forEach(id => { if (isObj(m[id]) && ID_OK.test(id)) { patch(c, id, m[id]); n++; } }); });
    return n;
  }

  return {
    get: () => s,
    cfg: () => { if (cfgVer !== ver) { cfgMemo = Apex.mergeCfg(s.cfg); cfgVer = ver; } return cfgMemo; },
    ver: () => ver,
    sub: f => { subs.add(f); return () => subs.delete(f); },
    sync: () => sync, caps: () => caps, pendingKeys: () => Object.keys(dirty).length,
    patch, del, replace, connect, refreshAI, exportAll, importAll,
  };
})();

/* ---- 16-ai.js ---- */
/* ApexHQ — accès à l'IA, gratuit d'abord.
   - Version Claude : capacité `sample` = compte Claude de la personne (son quota, consentement au premier appel).
   - App autonome : clé Gemini gratuite (Google AI Studio) et/ou clé API Anthropic, collées par la personne et gardées sur
     l'appareil (jamais exportées ni synchronisées). Appels directs depuis le navigateur.
   - Bascule automatique : si un fournisseur est saturé (quota atteint) ou refusé, on essaie le suivant.
   Tous les fournisseurs exposent la même interface que `sample` : texte, json, outils de page, limits. */
const AI = (() => {
  'use strict';
  const K_ANTH = 'apexhq:key', K_GEM = 'apexhq:gkey', K_GMODEL = 'apexhq:gmodel';
  const ls = { get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* stockage indisponible */ } } };
  const K_CONS = 'apexhq:iaok';
  const embedded = () => !!window.APEX_GKEY, consent = () => ls.get(K_CONS), setConsent = v => ls.set(K_CONS, v);
  const getKey = () => ls.get(K_ANTH), setKey = k => ls.set(K_ANTH, k), ownG = () => ls.get(K_GEM);
  const getGKey = () => ls.get(K_GEM) || (embedded() && consent() === '1' ? window.APEX_GKEY : ''), setGKey = k => { ls.set(K_GEM, k); ls.set(K_GMODEL, ''); };
  const fail = (code, message, text) => { const e = new Error(message); e.code = code; e.text = text; return e; };
  const NO_FALLBACK = ['cancelled', 'invalid_json', 'refused', 'empty_completion', 'invalid_request', 'prompt_too_large'];
  let last = '';

  const parseJson = (t, mk) => { try { return JSON.parse(t); } catch (e) { const m = String(t).match(/\{[\s\S]*\}|\[[\s\S]*\]/); if (m) { try { return JSON.parse(m[0]); } catch (e2) { /* erreur ci-dessous */ } } throw fail('invalid_json', 'Réponse illisible', t); } };
  const mkJson = sample => async (input, o) => { const r = await sample(input, Object.assign({}, o, { _json: true })); return parseJson(r.text); };
  const norm = (input) => (typeof input === 'string' ? [{ role: 'user', content: input }] : input.map(m => ({ role: m.role, content: m.content })));

  /* ---------- Anthropic (clé API payante) ---------- */
  const MODELS = { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-opus-5-5' };
  async function acall(body, signal) {
    let r;
    try { r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-api-key': getKey(), 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify(body) }); }
    catch (e) { throw (e && e.name === 'AbortError') ? fail('cancelled', 'Annulé') : fail('upstream_error', 'Réseau indisponible'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(r.status === 401 || r.status === 403 ? 'not_granted' : r.status === 429 ? 'rate_limited' : 'upstream_error', (j.error && j.error.message) || ('HTTP ' + r.status));
    return j;
  }
  function anthropic() {
    const sample = async (input, o) => {
      o = o || {}; const msgs = norm(input), tools = (o.tools || []).map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: 'object', properties: {} } }));
      let text = '';
      for (let round = 0; round < 6; round++) {
        const body = { model: MODELS[o.modelTier] || MODELS.default, max_tokens: 2048, messages: msgs }; if (tools.length) body.tools = tools;
        const j = await acall(body, o.signal), parts = j.content || [], tx = parts.filter(p => p.type === 'text').map(p => p.text).join('');
        if (tx) { text += (text ? '\n\n' : '') + tx; if (o.onText) o.onText({ text, delta: tx }); }
        const uses = parts.filter(p => p.type === 'tool_use');
        if (j.stop_reason !== 'tool_use' || !uses.length) return { text, truncated: j.stop_reason === 'max_tokens' };
        msgs.push({ role: 'assistant', content: parts });
        const results = [];
        for (const u of uses) {
          let out; try { const t = (o.tools || []).find(x => x.name === u.name); out = t ? await t.execute(u.input || {}, { signal: o.signal }) : 'Error: outil inconnu'; if (typeof out !== 'string') out = JSON.stringify(out); } catch (e) { out = 'Error: ' + (e && e.message ? e.message : e); }
          results.push({ type: 'tool_result', tool_use_id: u.id, content: String(out).slice(0, 30000) });
        }
        msgs.push({ role: 'user', content: results });
      }
      return { text, truncated: true };
    };
    sample.json = mkJson(sample); return sample;
  }

  /* ---------- Gemini (clé gratuite Google AI Studio) ---------- */
  const GBASE = 'https://generativelanguage.googleapis.com/v1beta/';
  async function gmodel() {
    try { const c = JSON.parse(ls.get(K_GMODEL) || 'null'); if (c && c.m && Date.now() - c.t < 6048e5) return c.m; } catch (e) { /* cache illisible */ }
    try {
      const r = await fetch(GBASE + 'models?pageSize=200&key=' + encodeURIComponent(getGKey()));
      if (r.ok) {
        const j = await r.json(), c = (j.models || []).filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && /^models\/gemini-\d+(\.\d+)?-flash$/.test(m.name)).map(m => m.name.slice(7)).sort((a, b) => parseFloat(b.split('-')[1]) - parseFloat(a.split('-')[1]));
        if (c.length) { ls.set(K_GMODEL, JSON.stringify({ m: c[0], t: Date.now() })); return c[0]; }
      }
    } catch (e) { /* repli ci-dessous */ }
    return 'gemini-2.5-flash';
  }
  const gschema = s => {
    if (Array.isArray(s)) return s.map(gschema); if (!s || typeof s !== 'object') return s;
    const o = {}; Object.keys(s).forEach(k => { if (k === 'additionalProperties' || k === '$schema') return; o[k] = k === 'type' && typeof s[k] === 'string' ? s[k].toUpperCase() : (k === 'properties' ? Object.keys(s[k]).reduce((a, p) => { a[p] = gschema(s[k][p]); return a; }, {}) : gschema(s[k])); });
    return o;
  };
  async function gcall(model, body, signal) {
    let r;
    try { r = await fetch(GBASE + 'models/' + model + ':generateContent?key=' + encodeURIComponent(getGKey()), { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { throw (e && e.name === 'AbortError') ? fail('cancelled', 'Annulé') : fail('upstream_error', 'Réseau indisponible'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const st = j.error && j.error.status, msg = (j.error && j.error.message) || ('HTTP ' + r.status);
      throw fail(r.status === 429 || st === 'RESOURCE_EXHAUSTED' ? 'rate_limited' : (r.status === 400 && /api key/i.test(msg)) || r.status === 401 || r.status === 403 ? 'not_granted' : 'upstream_error', msg);
    }
    return j;
  }
  function gemini() {
    const sample = async (input, o) => {
      o = o || {}; const model = await gmodel(), tools = (o.tools || []).map(t => ({ name: t.name, description: t.description, parameters: gschema(t.inputSchema || { type: 'object', properties: {} }) }));
      const contents = norm(input).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
      let text = '';
      for (let round = 0; round < 6; round++) {
        const body = { contents, generationConfig: { temperature: 0.4, maxOutputTokens: 2048 } };
        if (tools.length) body.tools = [{ functionDeclarations: tools }]; else if (o._json) body.generationConfig.responseMimeType = 'application/json';
        const j = await gcall(model, body, o.signal), cand = (j.candidates || [])[0];
        if (!cand || !cand.content) { if (text) return { text, truncated: false }; throw fail(j.promptFeedback && j.promptFeedback.blockReason ? 'refused' : 'empty_completion', 'Réponse vide'); }
        const parts = cand.content.parts || [], tx = parts.filter(p => typeof p.text === 'string').map(p => p.text).join(''), calls = parts.filter(p => p.functionCall);
        if (tx) { text += (text ? '\n\n' : '') + tx; if (o.onText) o.onText({ text, delta: tx }); }
        if (!calls.length) return { text, truncated: cand.finishReason === 'MAX_TOKENS' };
        contents.push({ role: 'model', parts });
        const res = [];
        for (const c of calls) {
          let out; try { const t = (o.tools || []).find(x => x.name === c.functionCall.name); out = t ? await t.execute(c.functionCall.args || {}, { signal: o.signal }) : 'Error: outil inconnu'; } catch (e) { out = 'Error: ' + (e && e.message ? e.message : e); }
          res.push({ functionResponse: { name: c.functionCall.name, response: { result: typeof out === 'string' ? out : JSON.stringify(out) } } });
        }
        contents.push({ role: 'user', parts: res });
      }
      return { text, truncated: true };
    };
    sample.json = mkJson(sample); return sample;
  }

  /* ---------- chaîne avec bascule automatique ---------- */
  function chain(native) {
    const list = () => { const l = []; if (native) l.push(['claude', native]); if (getGKey()) l.push(['gemini', gemini()]); if (getKey()) l.push(['anthropic', anthropic()]); return l; };
    const run = async (kind, input, o) => {
      const l = list(); let err = null;
      for (const [name, p] of l) {
        try { const r = await (kind === 'json' ? p.json(input, o) : p(input, o)); last = name; return r; }
        catch (e) { err = e; if (NO_FALLBACK.indexOf(e && e.code) >= 0) throw e; }
      }
      throw err || fail('capability_disabled', 'Aucune IA connectée');
    };
    const sample = (i, o) => run('text', i, o); sample.json = (i, o) => run('json', i, o);
    sample.limits = async () => { let nl = {}; if (native && native.limits) { try { nl = await native.limits(); } catch (e) { nl = {}; } } return { maxPromptBytes: 262144, tools: (nl && nl.tools) || { maxCount: 12 }, modelTiers: ['quick', 'default', 'complex'] }; };
    return sample;
  }
  /* Test direct d'un fournisseur précis (sans bascule) : résout true ou lève l'erreur. */
  async function test(kind, native) {
    const p = kind === 'gemini' ? gemini() : kind === 'anthropic' ? anthropic() : native; if (!p) throw fail('capability_disabled', 'Fournisseur absent');
    const r = await p.json('Réponds uniquement par le JSON {"ok":true}', { modelTier: 'quick', cache: false });
    if (!r || r.ok !== true) throw fail('invalid_json', 'Réponse inattendue'); return true;
  }
  const hasAny = () => !!(getGKey() || getKey());
  return { getKey, setKey, getGKey, setGKey, ownG, embedded, consent, setConsent, chain, test, hasAny, last: () => last };
})();

/* Messages d'erreur communs (coach, assistant, estimations). */
const aiMsg = e => {
  const c = e && e.code;
  if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].indexOf(c) >= 0) return AI.hasAny() ? 'Clé refusée ou IA indisponible. Vérifie tes clés dans Réglages, section IA.' : 'Aucune IA connectée. Ajoute-en une dans Réglages, section IA.';
  if (c === 'rate_limited') return window.APEX_STANDALONE ? 'Quota gratuit atteint pour le moment. Réessaie plus tard, ou ajoute une 2e IA dans Réglages. Le reste de l’app fonctionne normalement.' : 'Ton quota Claude est atteint. L’IA revient quand il se réinitialise ; le reste de l’app fonctionne normalement.';
  if (c === 'session_expired') return 'Session expirée : reconnecte-toi à Claude.';
  if (c === 'refused' || c === 'empty_completion' || c === 'invalid_json') return 'Réponse inexploitable. Reformule avec aliments et quantités.';
  if (c === 'cancelled') return '';
  return 'Échec de la demande. Réessaie.';
};

/* ---- 20-ui-core.js ---- */
/* ApexHQ — socle d'interface : React + htm, icônes, champs, feuilles, jauges, graphiques SVG. */
const { useState, useEffect, useRef, useLayoutEffect, useSyncExternalStore, createElement } = React;
const html = htm.bind(createElement);
const useStore = () => { useSyncExternalStore(Store.sub, Store.ver); return Store; };

const NF0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const f0 = v => (Apex.num(v) ? NF0.format(Math.round(v)) : '–');
const f1 = v => (Apex.num(v) ? v.toFixed(1).replace('.', ',') : '–');
const f2 = v => (Apex.num(v) ? v.toFixed(2).replace('.', ',') : '–');
const fq = v => (Apex.num(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '–');
const sgn = (v, f) => { if (!Apex.num(v)) return '–'; const t = (f || f1)(Math.abs(v)); return (/[1-9]/.test(t) ? (v > 0 ? '+' : '−') : '±') + t; };
const DF = o => new Intl.DateTimeFormat('fr-FR', o);
const dLong = s => DF({ weekday: 'long', day: 'numeric', month: 'long' }).format(Apex.parse(s));
const dMid = s => DF({ weekday: 'short', day: 'numeric', month: 'short' }).format(Apex.parse(s));
const dTiny = s => DF({ day: 'numeric', month: 'short' }).format(Apex.parse(s));
const cx = (...a) => a.filter(Boolean).join(' ');

/* ---------- icônes (24 px, trait) ---------- */
const IC = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  utensils: ['M6 3v6a2 2 0 0 0 4 0V3', 'M8 3v18', 'M16 21V3c2.5 1.5 3.5 4.5 3.5 8H16'],
  dumbbell: ['M6.5 6.5v11', 'M17.5 6.5v11', 'M3.5 9v6', 'M20.5 9v6', 'M6.5 12h11'],
  chart: ['M5 20v-8', 'M11 20V5', 'M17 20v-5', 'M3 20h18'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  chevL: ['M14.5 6l-6 6 6 6'],
  chevR: ['M9.5 6l6 6-6 6'],
  swap: ['M4 8h13l-3-3', 'M20 16H7l3 3'],
  sliders: ['M4 7h10', 'M18 7h2', 'M4 17h4', 'M12 17h8', [16, 7, 2], [10, 17, 2]],
  flame: ['M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.8 1.2 2.7 2 3 .3-3-.5-5.5 1-8.5z'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'],
  steps: ['M3 12h4l3-8 4 16 3-8h4'],
  droplet: ['M12 3.5c3 3.6 5.5 6.5 5.5 9.5a5.5 5.5 0 0 1-11 0c0-3 2.5-5.9 5.5-9.5z'],
  camera: ['M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z', [12, 13.5, 3.5]],
  bolt: ['M13 3 5 13.5h6L10 21l8-10.5h-6z'],
  alert: ['M12 4 2.5 20h19z', 'M12 10v4.5', 'M12 17.4v.2'],
  trash: ['M5 7h14', 'M10 7V4.5h4V7', 'M7 7l1 13h8l1-13'],
  sparkles: ['M11 4l1.7 4.8L17.5 10.5l-4.8 1.7L11 17l-1.7-4.8L4.5 10.5l4.8-1.7z', 'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'],
  download: ['M12 4v11', 'M7.5 11l4.5 4.5 4.5-4.5', 'M5 20h14'],
  upload: ['M12 16V5', 'M7.5 9 12 4.5 16.5 9', 'M5 20h14'],
  scale: ['M5 4.5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z', 'M8 10.5a5.5 5.5 0 0 1 8 0', 'M12 11l1.6-2.4'],
  ruler: ['M3.5 16.5 16.5 3.5l4 4-13 13z', 'M7.5 12.5 9 14', 'M10.5 9.5 12 11', 'M13.5 6.5 15 8'],
  target: [[12, 12, 8.5], [12, 12, 4.5], [12, 12, 0.6]],
  clock: [[12, 12, 8.5], 'M12 7.5V12l3 2'],
  info: [[12, 12, 8.5], 'M12 11v5', 'M12 7.9v.2'],
  refresh: ['M4.5 12a7.5 7.5 0 0 1 13-5l2 2', 'M19.5 4.5V9H15', 'M19.5 12a7.5 7.5 0 0 1-13 5l-2-2', 'M4.5 19.5V15H9'],
  trend: ['M3 7l6.5 6.5 4-4L21 17', 'M21 11.5V17h-5.5'],
  copy: ['M9 9h10v11H9z', 'M5 15V4h10'],
  apex: ['M12 3.5 21.5 20h-19z', 'M12 10.5 16.2 18H7.8z'],
  mic: ['M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5V21'],
  send: ['M4 12 20 4l-4.5 16-3.5-6.5z', 'M12 13.5 20 4'],
  chat: ['M4 5h16v11H9l-5 4z', 'M8 9.5h8', 'M8 12.5h5'],
  up: ['M6 14.5l6-6 6 6'],
  down: ['M6 9.5l6 6 6-6'],
};
function Icon({ n, s = 20, w = 1.75 }) {
  return html`<svg className="ic" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth=${w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    ${(IC[n] || []).map((p, i) => (typeof p === 'string' ? html`<path key=${i} d=${p} />` : html`<circle key=${i} cx=${p[0]} cy=${p[1]} r=${p[2]} />`))}
  </svg>`;
}

/* ---------- briques ---------- */
function Card({ title, sub, right, cls, children }) {
  return html`<section className=${cx('card', cls)}>
    ${(title || right) && html`<div className="card-h"><div><h2>${title}</h2>${sub && html`<div className="sub">${sub}</div>`}</div>${right}</div>`}
    ${children}
  </section>`;
}
function Seg({ value, options, onChange, label, neutral }) {
  return html`<div className=${cx('seg', neutral && 'neu')} role="group" aria-label=${label}>
    ${options.map(o => html`<button key=${o[0]} type="button" aria-pressed=${value === o[0]} onClick=${() => onChange(o[0])}>${o[1]}</button>`)}
  </div>`;
}
const Pill = ({ st, children }) => html`<span className=${cx('pill', st)}><i></i>${children}</span>`;

function Num({ id, label, unit, value, onChange, dec = 1, min, max, placeholder, small, hint }) {
  const show = v => (v == null ? '' : String(v).replace('.', ','));
  const [txt, setTxt] = useState(show(value)); const foc = useRef(false);
  useEffect(() => { if (!foc.current) setTxt(show(value)); }, [value]);
  const read = t => { const x = String(t).trim().replace(',', '.'); if (x === '') return null; const v = parseFloat(x); if (isNaN(v)) return undefined; const k = Math.pow(10, dec); return Math.round(v * k) / k; };
  const input = html`<input id=${id} className=${cx('inp', small && 'sm')} type="text" inputMode=${dec ? 'decimal' : 'numeric'} autoComplete="off" value=${txt} placeholder=${placeholder || ''} aria-label=${label ? undefined : hint}
    onFocus=${e => { foc.current = true; e.target.select(); }}
    onChange=${e => { setTxt(e.target.value); const v = read(e.target.value); if (v === undefined) return; if (v !== null && ((min != null && v < min) || (max != null && v > max))) return; onChange(v); }}
    onBlur=${e => { foc.current = false; let v = read(e.target.value); if (v === undefined) { setTxt(show(value)); return; } if (v !== null) { if (min != null) v = Math.max(min, v); if (max != null) v = Math.min(max, v); } onChange(v); setTxt(show(v)); }} />`;
  if (small) return input;
  return html`<label className="fld" htmlFor=${id}>
    ${label && html`<span className="fld-l">${label}</span>`}
    <span className="fld-b">${input}${unit && html`<span className="fld-u">${unit}</span>`}</span>
  </label>`;
}
function Scale({ label, value, onChange, max = 10 }) {
  return html`<div className="fld">
    <span className="fld-l">${label}<b>${value == null ? '–' : value}/${max}</b></span>
    <div className="scale" role="radiogroup" aria-label=${label}>
      ${Array.from({ length: max }, (_, i) => html`<button key=${i} type="button" role="radio" aria-checked=${value === i + 1} className=${value != null && i < value ? 'on' : ''} onClick=${() => onChange(value === i + 1 ? null : i + 1)}>${i + 1}</button>`)}
    </div>
  </div>`;
}
function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, []);
  return ReactDOM.createPortal(html`<div className="sheet-back" onMouseDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="sheet" role="dialog" aria-modal="true" aria-label=${title}>
      <div className="sheet-h"><h2>${title}</h2><button className="ib" onClick=${onClose} aria-label="Fermer"><${Icon} n="x" /></button></div>
      ${children}
    </div>
  </div>`, document.body);
}
const Toast = (() => { let list = [], id = 0; const subs = new Set(); const emit = () => subs.forEach(f => f());
  return { push(msg) { const t = { id: ++id, msg }; list = list.concat(t).slice(-3); emit(); setTimeout(() => { list = list.filter(x => x !== t); emit(); }, 2600); }, sub: f => { subs.add(f); return () => subs.delete(f); }, get: () => list }; })();
const toast = m => Toast.push(m);
function Toasts() { const l = useSyncExternalStore(Toast.sub, Toast.get); return html`<div className="toasts" role="status" aria-live="polite">${l.map(t => html`<div key=${t.id} className="toast">${t.msg}</div>`)}</div>`; }
/* Bouton à confirmation en deux temps (confirm() est inerte dans la visionneuse). */
function Confirm({ label, sure, onYes, cls, icon }) {
  const [arm, setArm] = useState(false);
  useEffect(() => { if (!arm) return; const t = setTimeout(() => setArm(false), 3500); return () => clearTimeout(t); }, [arm]);
  return html`<button type="button" className=${cx('btn sm', cls, arm && 'dan')} onClick=${() => { if (arm) { setArm(false); onYes(); } else setArm(true); }}>${icon && html`<${Icon} n=${icon} s=${16} />`}${arm ? (sure || 'Confirmer ?') : label}</button>`;
}

/* ---------- jauges ---------- */
function Meter({ label, v, v2, max, c, unit = 'g' }) {
  const pc = x => Math.max(0, Math.min(100, max ? x / max * 100 : 0)) + '%';
  return html`<div className="mt" style=${{ '--c': c }}>
    <div className="mt-h"><span><i></i>${label}</span><b>${f0(v)}<small> / ${f0(max)} ${unit}</small></b></div>
    <div className="mt-b">${v2 > v && html`<u style=${{ width: pc(v2) }}></u>`}<i style=${{ width: pc(v) }}></i></div>
  </div>`;
}
function Ring({ v, v2, max, size = 150, sw = 11, children }) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r, h = size / 2;
  const p = Math.max(0, Math.min(1, max ? v / max : 0)), p2 = Math.max(0, Math.min(1, max ? (v2 || 0) / max : 0));
  const over = max && v > max * 1.03, col = over ? 'var(--crit)' : 'var(--acc-hi)';
  const arc = (q, o) => html`<circle cx=${h} cy=${h} r=${r} fill="none" stroke=${col} strokeOpacity=${o} strokeWidth=${sw} strokeLinecap="round" strokeDasharray=${c * q + ' ' + c} transform=${'rotate(-90 ' + h + ' ' + h + ')'} />`;
  return html`<div className="ring" style=${{ width: size, height: size }}>
    <svg width=${size} height=${size} viewBox=${'0 0 ' + size + ' ' + size} aria-hidden="true">
      <circle cx=${h} cy=${h} r=${r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth=${sw} />
      ${p2 > p && arc(p2, 0.3)}${p > 0 && arc(p, 1)}
    </svg>
    <div className="ring-c">${children}</div>
  </div>`;
}
function Spark({ vals, w = 92, h = 28, c = 'var(--acc-hi)' }) {
  const v = vals.filter(Apex.num);
  if (v.length < 2) return html`<svg width=${w} height=${h} aria-hidden="true"><line x1="3" x2=${w - 3} y1=${h / 2} y2=${h / 2} stroke="var(--axis)" strokeWidth="1" /></svg>`;
  const lo = Math.min.apply(null, v), sp = (Math.max.apply(null, v) - lo) || 1;
  const pt = v.map((y, i) => [4 + i / (v.length - 1) * (w - 9), 5 + (1 - (y - lo) / sp) * (h - 10)]), e = pt[pt.length - 1];
  return html`<svg width=${w} height=${h} aria-hidden="true">
    <polyline points=${pt.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')} fill="none" stroke=${c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    <circle cx=${e[0]} cy=${e[1]} r="3.5" fill=${c} stroke="var(--surface)" strokeWidth="2" />
  </svg>`;
}
const Legend = ({ items }) => html`<div className="legend">${items.map(i => html`<span key=${i[0]}><i className=${i[2] || ''} style=${{ '--c': i[1] }}></i>${i[0]}</span>`)}</div>`;
function DataTable({ cols, rows }) {
  return html`<div className="tw"><table className="dt"><thead><tr>${cols.map((c, i) => html`<th key=${i} scope="col">${c}</th>`)}</tr></thead>
    <tbody>${rows.map((r, i) => html`<tr key=${i}>${r.map((c, k) => html`<td key=${k}>${c}</td>`)}</tr>`)}</tbody></table></div>`;
}

/* ---------- graphiques ---------- */
function useWidth() {
  const ref = useRef(null); const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    setW(Math.round(el.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(es => { const c = Math.round(es[0].contentRect.width); setW(p => (p === c ? p : c)); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w];
}
function ticks(min, max, n) {
  if (!(max > min)) { min -= 1; max += 1; }
  const raw = (max - min) / (n || 4), mag = Math.pow(10, Math.floor(Math.log10(raw))), nr = raw / mag;
  const step = (nr < 1.5 ? 1 : nr < 3 ? 2 : nr < 7 ? 5 : 10) * mag, lo = Math.floor(min / step + 1e-9) * step, out = [];
  for (let v = lo; v < max + step * 0.999; v += step) out.push(+v.toFixed(6));
  return out;
}
const tickFmt = tk => { const st = tk.length > 1 ? Math.abs(tk[1] - tk[0]) : 1; return st >= 1 ? f0 : st >= 0.1 ? f1 : f2; };

/* Lignes temporelles. series: [{name, c, type:'line'|'dots'|'dash', pts:[{d,v}], area, end}], refs: [{v,label}] */
function LineChart({ series, h = 220, fmt = f1, unit = '', refs = [], from, to, empty, label }) {
  const [ref, w] = useWidth(); const [hi, setHi] = useState(null);
  const all = []; series.forEach(s => s.pts.forEach(p => all.push(p)));
  if (!all.length) return html`<div className="chart" ref=${ref}><div className="empty">${empty || 'Pas encore de données.'}</div></div>`;
  const ds = all.map(p => p.d).sort(), d0 = from && from > ds[0] ? from : ds[0];
  let d1 = to || ds[ds.length - 1]; if (d1 <= d0) d1 = Apex.addDays(d0, 1);
  const inDom = p => p.d >= d0 && p.d <= d1, span = Math.max(1, Apex.diffDays(d1, d0));
  const m = { l: 40, r: 48, t: 14, b: 26 }, iw = Math.max(20, w - m.l - m.r), ih = h - m.t - m.b;
  let lo = Infinity, up = -Infinity;
  all.forEach(p => { if (inDom(p)) { lo = Math.min(lo, p.v); up = Math.max(up, p.v); } }); refs.forEach(r => { lo = Math.min(lo, r.v); up = Math.max(up, r.v); });
  if (!isFinite(lo)) { lo = 0; up = 1; }
  const pad = (up - lo) * 0.1 || Math.max(0.5, Math.abs(up) * 0.01), tk = ticks(lo - pad, up + pad, 4), y0 = tk[0], y1 = tk[tk.length - 1], tf = tickFmt(tk);
  const X = d => m.l + Apex.diffDays(d, d0) / span * iw, Y = v => m.t + (1 - (v - y0) / (y1 - y0)) * ih;
  const xs = Array.from(new Set(all.filter(inDom).map(p => p.d))).sort();
  const nx = iw < 330 ? 3 : 5, xl = Array.from({ length: nx }, (_, i) => Apex.addDays(d0, Math.round(i / (nx - 1) * span)));
  const move = e => { if (!xs.length) return; const bx = e.currentTarget.getBoundingClientRect(), px = e.clientX - bx.left; let b = 0, bd = Infinity; xs.forEach((d, i) => { const q = Math.abs(X(d) - px); if (q < bd) { bd = q; b = i; } }); setHi(b); };
  const key = e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setHi(p => Math.max(0, Math.min(xs.length - 1, (p == null ? xs.length - 1 : p) + (e.key === 'ArrowLeft' ? -1 : 1)))); } };
  const hd = hi != null && xs[hi] ? xs[hi] : null, hx = hd ? X(hd) : 0;
  return html`<div className="chart" ref=${ref}>
    ${w > 0 && html`<svg height=${h} viewBox=${'0 0 ' + w + ' ' + h} role="img" aria-label=${label || 'Graphique'} tabIndex="0" onPointerMove=${move} onPointerDown=${move} onPointerLeave=${() => setHi(null)} onKeyDown=${key} onFocus=${() => setHi(xs.length - 1)} onBlur=${() => setHi(null)}>
      ${tk.map(v => html`<g key=${v}><line x1=${m.l} x2=${m.l + iw} y1=${Y(v)} y2=${Y(v)} stroke="var(--grid)" strokeWidth="1" /><text x=${m.l - 8} y=${Y(v) + 4} textAnchor="end">${tf(v)}</text></g>`)}
      ${xl.map((d, i) => html`<text key=${d + i} x=${X(d)} y=${h - 6} textAnchor=${i === 0 ? 'start' : i === nx - 1 ? 'end' : 'middle'}>${dTiny(d)}</text>`)}
      ${refs.map((r, i) => html`<g key=${'r' + i}><line x1=${m.l} x2=${m.l + iw} y1=${Y(r.v)} y2=${Y(r.v)} stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" /><text x=${m.l + iw + 6} y=${Y(r.v) + 4} className="lbl">${r.label}</text></g>`)}
      ${series.map((s, si) => {
        const pts = s.pts.filter(inDom).slice().sort((a, b) => (a.d < b.d ? -1 : 1)); if (!pts.length) return null;
        if (s.type === 'dots') return html`<g key=${si}>${pts.map(p => html`<circle key=${p.d} cx=${X(p.d)} cy=${Y(p.v)} r="4" fill=${s.c} fillOpacity=".8" stroke="var(--surface)" strokeWidth="2" />`)}</g>`;
        const path = pts.map((p, i) => (i ? 'L' : 'M') + X(p.d).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' '), e = pts[pts.length - 1];
        return html`<g key=${si}>
          ${s.area && pts.length > 1 && html`<path d=${path + ' L' + X(e.d).toFixed(1) + ' ' + Y(y0) + ' L' + X(pts[0].d).toFixed(1) + ' ' + Y(y0) + ' Z'} fill=${s.c} fillOpacity=".1" stroke="none" />`}
          <path d=${path} fill="none" stroke=${s.c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray=${s.type === 'dash' ? '1 6' : undefined} />
          ${s.type !== 'dash' && html`<circle cx=${X(e.d)} cy=${Y(e.v)} r="4.5" fill=${s.c} stroke="var(--surface)" strokeWidth="2" />`}
          ${s.end && html`<text x=${X(e.d) + 9} y=${Y(e.v) + 4} className="lbl">${fmt(e.v)}</text>`}
        </g>`;
      })}
      ${hd && html`<g><line x1=${hx} x2=${hx} y1=${m.t} y2=${m.t + ih} stroke="var(--ink-3)" strokeWidth="1" />
        ${series.map((s, si) => { const p = s.pts.find(q => q.d === hd); return p && s.type !== 'dash' ? html`<circle key=${si} cx=${hx} cy=${Y(p.v)} r="5.5" fill=${s.c} stroke="var(--ink)" strokeWidth="1.5" />` : null; })}</g>`}
    </svg>`}
    ${hd && html`<div className="tip" style=${Object.assign({ top: m.t }, hx > w / 2 ? { right: w - hx + 12 } : { left: hx + 12 })}>
      <h4>${dMid(hd)}</h4>
      ${series.map((s, si) => { const p = s.pts.find(q => q.d === hd); return p ? html`<div key=${si} style=${{ '--c': s.c }}><i></i><b>${fmt(p.v)}${unit}</b><span>${s.name}</span></div>` : null; })}
    </div>`}
  </div>`;
}
/* Barres datées. data: [{d, v, c, t, name}] ; t = repère de cible par barre. */
function BarChart({ data, h = 200, fmt = f0, unit = '', empty, label, tName = 'Objectif' }) {
  const [ref, w] = useWidth(); const [hi, setHi] = useState(null);
  if (!data.length) return html`<div className="chart" ref=${ref}><div className="empty">${empty || 'Pas encore de données.'}</div></div>`;
  const m = { l: 40, r: 8, t: 14, b: 26 }, iw = Math.max(20, w - m.l - m.r), ih = h - m.t - m.b, n = data.length, slot = iw / n, bw = Math.max(2, Math.min(24, slot - 2));
  let up = 0; data.forEach(p => { up = Math.max(up, p.v || 0, p.t || 0); });
  const tk = ticks(0, up * 1.05 || 1, 4), y1 = tk[tk.length - 1], tf = tickFmt(tk), Y = v => m.t + (1 - v / y1) * ih, yb = m.t + ih;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 58))));
  const move = e => { const bx = e.currentTarget.getBoundingClientRect(), i = Math.floor((e.clientX - bx.left - m.l) / slot); setHi(i >= 0 && i < n ? i : null); };
  const key = e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setHi(p => Math.max(0, Math.min(n - 1, (p == null ? n - 1 : p) + (e.key === 'ArrowLeft' ? -1 : 1)))); } };
  const bar = (x, v) => { const yt = Y(v), r = Math.min(4, bw / 2, Math.max(0, yb - yt)); return 'M' + x + ' ' + yb + ' V' + (yt + r) + ' Q' + x + ' ' + yt + ' ' + (x + r) + ' ' + yt + ' H' + (x + bw - r) + ' Q' + (x + bw) + ' ' + yt + ' ' + (x + bw) + ' ' + (yt + r) + ' V' + yb + ' Z'; };
  const hp = hi != null ? data[hi] : null, hx = hi != null ? m.l + hi * slot + slot / 2 : 0;
  return html`<div className="chart" ref=${ref}>
    ${w > 0 && html`<svg height=${h} viewBox=${'0 0 ' + w + ' ' + h} role="img" aria-label=${label || 'Graphique en barres'} tabIndex="0" onPointerMove=${move} onPointerDown=${move} onPointerLeave=${() => setHi(null)} onKeyDown=${key} onFocus=${() => setHi(n - 1)} onBlur=${() => setHi(null)}>
      ${tk.map(v => html`<g key=${v}><line x1=${m.l} x2=${m.l + iw} y1=${Y(v)} y2=${Y(v)} stroke=${v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth="1" /><text x=${m.l - 8} y=${Y(v) + 4} textAnchor="end">${tf(v)}</text></g>`)}
      ${data.map((p, i) => { const x = m.l + i * slot + (slot - bw) / 2; return html`<g key=${p.d}>
        ${p.v > 0 && html`<path d=${bar(x, p.v)} fill=${p.c || 'var(--acc-hi)'} fillOpacity=${hi == null || hi === i ? 1 : 0.55} />`}
        ${p.t > 0 && html`<line x1=${m.l + i * slot + 1} x2=${m.l + (i + 1) * slot - 1} y1=${Y(p.t)} y2=${Y(p.t)} stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />`}
        ${i % every === 0 && html`<text x=${m.l + i * slot + slot / 2} y=${h - 6} textAnchor="middle">${dTiny(p.d)}</text>`}
      </g>`; })}
    </svg>`}
    ${hp && html`<div className="tip" style=${Object.assign({ top: m.t }, hx > w / 2 ? { right: w - hx + 14 } : { left: hx + 14 })}>
      <h4>${dMid(hp.d)}${hp.name ? ' · ' + hp.name : ''}</h4>
      <div style=${{ '--c': hp.c || 'var(--acc-hi)' }}><i></i><b>${fmt(hp.v)}${unit}</b><span>réel</span></div>
      ${hp.t > 0 && html`<div style=${{ '--c': 'var(--ink)' }}><i></i><b>${fmt(hp.t)}${unit}</b><span>${tName}</span></div>`}
    </div>`}
  </div>`;
}
/* Carte de graphique avec vue tableau jumelle. */
function ChartCard({ title, sub, cls, legend, table, children }) {
  const [tab, setTab] = useState(false);
  return html`<${Card} title=${title} sub=${sub} cls=${cls} right=${table && html`<button className="btn sm ghost" aria-pressed=${tab} onClick=${() => setTab(!tab)}>${tab ? 'Graphique' : 'Tableau'}</button>`}>
    ${legend && !tab && html`<${Legend} items=${legend} />`}
    ${tab && table ? html`<${DataTable} cols=${table.cols} rows=${table.rows} />` : children}
  <//>`;
}

/* ---- 30-ui-dashboard.js ---- */
/* ApexHQ — onglet 1 : statut du jour, check-in matinal à jeun, lecture, poids, mensurations. */
const MESURES = [['taille', 'Tour de taille'], ['poitrine', 'Poitrine'], ['epaules', 'Épaules'], ['bras', 'Bras contracté'], ['cuisse', 'Cuisse'], ['cou', 'Cou']];
const ST_LAB = { vert: 'good', orange: 'warn', rouge: 'crit' };

function Hero({ date, go }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), foods = Apex.allFoods(cfg);
  const j = S.journal[date] || {}, c = Apex.cibleDuJour(cfg, j, date), seance = Apex.seanceDuJour(cfg, j, date);
  const t = Apex.totJour(j, foods), man = !!t.man, reel = t.man || t.eat, jour = Apex.diffDays(date, cfg.profil.dateDepart) + 1;
  const pc = c.kcal ? Math.round(reel.k / c.kcal * 100) : 0;
  return html`<section className="card hero c7">
    <div className="row sb">
      <span className="eyebrow"><i></i>${c.statut === 'salle' ? 'Jour de salle' + (seance ? ' · ' + seance : '') : 'Jour de repos'}</span>
      <span className="hero-s">${jour > 0 ? 'J' + jour + ' · semaine ' + Math.ceil(jour / 7) : 'Avant le départ'}</span>
    </div>
    <div className="hero-main">
      <div className="hero-l">
        <div className="hero-n">${f0(c.kcal)}<small>kcal</small></div>
        <div className="hero-s">${c.ajust !== 0 ? 'dont ' + sgn(c.ajust, f0) + ' de lissage (base ' + f0(c.base) + ')' : 'objectif du jour'}</div>
      </div>
      <${Ring} v=${reel.k} v2=${man ? 0 : t.plan.k} max=${c.kcal} size=118 sw=10><b style=${{ fontSize: 28 }}>${reel.k > 0 ? pc + ' %' : '–'}</b><span>mangé</span><//>
    </div>
    <div className="hero-bars">
      <${Meter} label="Protéines" v=${reel.p} v2=${man ? 0 : t.plan.p} max=${c.p} c="var(--p)" />
      <${Meter} label="Glucides" v=${reel.g} v2=${man ? 0 : t.plan.g} max=${c.g} c="var(--g)" />
      <${Meter} label="Lipides" v=${reel.l} v2=${man ? 0 : t.plan.l} max=${c.l} c="var(--l)" />
    </div>
    ${c.statut === 'salle' && html`<div className="chips" role="group" aria-label="Séance du jour">
      ${Apex.types(cfg).map(tp => html`<button key=${tp} className="chip" aria-pressed=${seance === tp} onClick=${() => Store.patch('journal', date, { date, statut: 'salle', seance: tp })}>${tp}</button>`)}
    </div>`}
    <div className="row sb">
      <span className="hero-s">${reel.k > 0 ? 'Reste ' + f0(Math.max(0, c.kcal - reel.k)) + ' kcal · ' + f0(Math.max(0, c.p - reel.p)) + ' g de protéines' : c.statut === 'salle' ? 'Glucides autour de la séance, ' + f0(cfg.cibles.pasMin) + ' pas minimum.' : 'Glucides réduits, protéines hautes, ' + f0(cfg.cibles.pasMin) + ' pas minimum.'}</span>
      <button className="btn sm" onClick=${() => go('repas')}>Plan repas<${Icon} n="chevR" s=${16} /></button>
    </div>
  </section>`;
}

function Lecture({ date }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), j = S.journal[date] || {};
  const rows = Apex.lecture(S.journal, cfg, date), co = j.coach;
  return html`<${Card} cls="c7" title="Lecture du jour" sub="Constat chiffré, puis action">
    ${co && co.analyse && html`<div className="note acc"><${Icon} n="sparkles" /><div>
      <div className="row"><b>Verdict coach</b>${co.verdict && html`<${Pill} st=${ST_LAB[co.verdict] || ''}>${co.verdict}<//>`}</div>
      <span>${co.analyse}</span>
      ${co.correction && html`<span><b>Correction :</b> ${co.correction}</span>`}
      ${co.demain && html`<span className="pre"><b>Ensuite :</b> ${co.demain}</span>`}
    </div></div>`}
    ${rows.length ? html`<div className="rows">${rows.map(r => html`<div key=${r.k} className="rw">
      <div className="rw-ic"><${Icon} n=${r.ic} s=${18} /></div>
      <div><div className="rw-l">${r.lab}</div><div className="rw-v">${r.val}</div></div>
      <${Pill} st=${r.st === 'info' ? '' : r.st}>${r.tag}<//>
      <div className="rw-t">${r.txt}</div>
    </div>`)}</div>` : !co && html`<div className="empty"><span><b>Rien à lire pour l’instant.</b> Valide le debrief matinal : poids, sommeil, pas et bilan d’hier sont comparés à tes cibles, avec l’action à faire.</span></div>`}
  <//>`;
}

function Activite({ date, cls }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), j = S.journal[date] || {};
  const set = k => v => Store.patch('journal', date, { date, [k]: v });
  const eau = j.eau || 0;
  return html`<${Card} cls=${cls} title="Activité du jour" sub=${'Cibles : ' + f0(cfg.cibles.pasMin) + '–' + f0(cfg.cibles.pasMax) + ' pas · ' + fq(cfg.cibles.eau) + ' L'}>
    <div className="form">
      <${Num} id="act-pas" label="Pas" value=${j.pas == null ? null : j.pas} onChange=${set('pas')} dec=${0} min=${0} max=${80000} placeholder="0" />
      <div className="fld"><span className="fld-l">Eau<b>${fq(eau)} L</b></span>
        <div className="row"><button className="btn grow" aria-label="Retirer 25 cl" onClick=${() => set('eau')(Math.max(0, Math.round((eau - 0.25) * 100) / 100) || null)}><${Icon} n="minus" s=${18} /></button>
        <button className="btn grow" aria-label="Ajouter 25 cl" onClick=${() => set('eau')(Math.round((eau + 0.25) * 100) / 100)}><${Icon} n="plus" s=${18} /></button></div></div>
    </div>
  <//>`;
}

function PoidsCard({ date, win }) {
  const st = useStore(), S = st.get(), cfg = st.cfg();
  const raw = Apex.serie(S.journal, 'poids'), mm = Apex.serieMM7(S.journal), from = win ? Apex.addDays(date, -win) : null;
  const last = raw.length ? raw[raw.length - 1] : null, m = last ? Apex.mm7(S.journal, last.d) : null, t = last ? Apex.tendance(S.journal, last.d) : null;
  const table = raw.length ? { cols: ['Date', 'Pesée (kg)', 'Moy. 7 j (kg)'], rows: raw.slice().reverse().slice(0, 60).map(p => { const x = mm.find(q => q.d === p.d); return [dMid(p.d), f1(p.v), x ? f2(x.v) : '–']; }) } : null;
  return html`<${ChartCard} cls="c8" title="Poids" sub="Pesées à jeun et moyenne mobile 7 jours" table=${table}
    legend=${raw.length ? [['Moyenne 7 j', 'var(--acc-hi)'], ['Pesée du jour', 'var(--ink-3)', 'dot']] : null}>
    ${raw.length > 0 && html`<div className="tiles">
      <div className="tile"><span>Dernière pesée</span><b>${f1(last.v)}<small>kg</small></b><em>${dTiny(last.d)}</em></div>
      <div className="tile"><span>Moyenne 7 j</span><b>${m ? f1(m.v) : '–'}<small>kg</small></b><em>${m ? m.n + ' pesée' + (m.n > 1 ? 's' : '') : ''}</em></div>
      <div className="tile"><span>Rythme hebdo</span><b>${t ? sgn(t.dk, f2) : '–'}<small>kg</small></b><em>${t ? sgn(t.pct) + ' %/sem' : 'dès 2 semaines'}</em></div>
      <div className="tile"><span>Depuis le départ</span><b>${m ? sgn(m.v - cfg.profil.poidsDepart) : '–'}<small>kg</small></b><em>départ ${f1(cfg.profil.poidsDepart)} kg</em></div>
    </div>`}
    <${LineChart} h=${230} unit=" kg" from=${from} label="Poids : pesées et moyenne mobile 7 jours"
      series=${[{ name: 'Pesée', c: 'var(--ink-3)', type: 'dots', pts: raw }, { name: 'Moy. 7 j', c: 'var(--acc-hi)', type: 'line', area: true, end: true, pts: mm }]}
      empty=${html`<span><b>Aucune pesée.</b> Pèse-toi au réveil, à jeun, après les toilettes, et valide le check-in. La moyenne 7 jours se trace dès la 1re pesée ; la tendance est fiable après 2 semaines.</span>`} />
  <//>`;
}

function MensuCard({ date, win, cls }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(); const [open, setOpen] = useState(false);
  const ds = Object.keys(S.mensurations).sort(), from = win ? Apex.addDays(date, -win) : '';
  const bf = (() => { for (let i = ds.length - 1; i >= 0; i--) { const m = S.mensurations[ds[i]], v = Apex.navy(m.taille, m.cou, cfg.profil.taille); if (v) return { v, d: ds[i] }; } return null; })();
  return html`<${Card} cls=${cls} title="Mensurations" sub="cm, ruban à plat, matin" right=${html`<button className="btn sm" onClick=${() => setOpen(true)}><${Icon} n="ruler" s=${16} />Mesurer</button>`}>
    ${ds.length ? html`<div>${MESURES.map(([k, lab]) => {
      const pts = ds.filter(d => d >= from && Apex.num(S.mensurations[d][k])).map(d => S.mensurations[d][k]); if (!pts.length) return null;
      const dl = pts.length > 1 ? pts[pts.length - 1] - pts[0] : null;
      return html`<div key=${k} className="mini"><span>${lab}</span><${Spark} vals=${pts} /><b>${f1(pts[pts.length - 1])}<small>${dl == null ? '1 mesure' : sgn(dl) + ' cm'}</small></b></div>`;
    })}
    ${bf && html`<div className="mini"><span>Masse grasse (US Navy)</span><span></span><b>${f1(bf.v)} %<small>${dTiny(bf.d)}</small></b></div>`}</div>`
    : html`<div className="empty"><span><b>Aucune mesure.</b> Prends la baseline : taille au nombril, poitrine, épaules, bras contracté, cuisse, cou. Taille + cou donnent le % de masse grasse (US Navy).</span></div>`}
    ${open && html`<${MensuSheet} date=${date} onClose=${() => setOpen(false)} />`}
  <//>`;
}
function MensuSheet({ date, onClose }) {
  const cur = Store.get().mensurations[date] || {}; const [d, setD] = useState(() => Object.assign({}, cur));
  const save = () => { const o = { date }; let n = 0; MESURES.forEach(([k]) => { o[k] = d[k] == null ? null : d[k]; if (d[k] != null) n++; }); if (!n) { onClose(); return; } Store.patch('mensurations', date, o); toast('Mensurations enregistrées'); onClose(); };
  return html`<${Sheet} title=${'Mensurations · ' + dMid(date)} onClose=${onClose}>
    <div className="form">${MESURES.map(([k, lab]) => html`<${Num} key=${k} id=${'ms-' + k} label=${lab} unit="cm" value=${d[k] == null ? null : d[k]} onChange=${v => setD(x => Object.assign({}, x, { [k]: v }))} dec=${1} min=${10} max=${200} />`)}</div>
    <p className="mut" style=${{ fontSize: 12 }}>Taille : au nombril, ventre relâché, fin d’expiration. Bras : contracté, au plus large. Même heure à chaque fois.</p>
    <button className="btn pri wide" onClick=${save}>Enregistrer</button>
  <//>`;
}

function Dashboard({ date, go, setDate }) {
  const [win, setWin] = useState(90);
  return html`<div>
    <div className="view-h"><h1>${dLong(date)}</h1><p>Check-in à jeun, cibles du jour, tendance.</p></div>
    <div className="grid">
      <div className="c12"><${WeekStrip} date=${date} setDate=${setDate} /></div>
      <${Hero} date=${date} go=${go} />
      <${CheckIn} date=${date} go=${go} />
      <${Lecture} date=${date} />
      <div className="c12 row sb" style=${{ marginTop: 6 }}>
        <span className="eyebrow">Tendance</span>
        <${Seg} neutral label="Période des graphiques" value=${win} onChange=${setWin} options=${[[30, '30 j'], [90, '90 j'], [0, 'Tout']]} />
      </div>
      <${PoidsCard} date=${date} win=${win} />
      <div className="c4 stack" style=${{ alignContent: 'start', gap: 14 }}>
        <${MensuCard} date=${date} win=${win} />
        <${Activite} date=${date} />
      </div>
    </div>
  </div>`;
}

/* ---- 31-ui-debrief.js ---- */
/* ApexHQ — debrief matinal : une question par écran (guidé) ou tout sur une page (rapide), puis bilan du jour. */
const LVL = [[2, 'À plat'], [4, 'Bof'], [6, 'Correct'], [8, 'Bien'], [10, 'Au top']];
const nearLvl = v => (v == null ? null : LVL.reduce((b, x) => (Math.abs(x[0] - v) < Math.abs(b - v) ? x[0] : b), 2));
const DSTEPS = [['poids', 'Poids'], ['sommeil', 'Sommeil'], ['forme', 'Forme'], ['hier', 'Hier'], ['recap', 'Bilan']];

/* Grand champ numérique avec − et +. */
function BigNum({ id, label, unit, value, onChange, step, min, max, dec, ph, hint }) {
  const k = Math.pow(10, dec);
  const bump = d => { const b = value == null ? (ph == null ? 0 : ph) : value; onChange(Math.max(min, Math.min(max, Math.round((b + d) * k) / k))); };
  return html`<div className="bignum"><span className="fld-l">${label}</span>
    <div className="bn-row">
      <button type="button" className="bn-b" aria-label=${'Moins : ' + label} onClick=${() => bump(-step)}><${Icon} n="minus" s=${24} /></button>
      <div className="bn-c"><${Num} id=${id} small hint=${label} value=${value} onChange=${onChange} dec=${dec} min=${min} max=${max} placeholder=${ph == null ? '' : String(ph).replace('.', ',')} /><span>${unit}</span></div>
      <button type="button" className="bn-b" aria-label=${'Plus : ' + label} onClick=${() => bump(step)}><${Icon} n="plus" s=${24} /></button>
    </div>${hint && html`<span className="bn-h">${hint}</span>`}</div>`;
}
/* Cinq niveaux, enregistrés sur 10. */
function Lvl({ label, value, onChange }) {
  const cur = nearLvl(value);
  return html`<div className="stack"><span className="fld-l">${label}</span><div className="lvl" role="radiogroup" aria-label=${label}>${LVL.map(x => html`<button key=${x[0]} type="button" role="radio" aria-checked=${cur === x[0]} onClick=${() => onChange(cur === x[0] ? null : x[0])}><b>${x[0] / 2}</b><span>${x[1]}</span></button>`)}</div></div>`;
}

function DebriefCard({ date, go, onEdit }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), j = S.journal[date] || {}, sample = st.caps().sample;
  const [ia, setIa] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const rows = Apex.lecture(S.journal, cfg, date), crit = rows.filter(r => r.st === 'crit'), warn = rows.filter(r => r.st === 'warn'), todo = crit.concat(warn);
  const v = crit.length ? ['crit', 'À corriger aujourd’hui', 'alert'] : warn.length ? ['warn', 'À surveiller aujourd’hui', 'alert'] : ['good', 'Tout est dans le vert', 'check'];
  const c = Apex.cibleDuJour(cfg, j, date), type = Apex.seanceDuJour(cfg, j, date), m = Apex.mm7(S.journal, date), t = Apex.tendance(S.journal, date);
  const run = async () => {
    if (!sample || busy) return; setBusy(true); setErr(''); setIa('');
    try {
      const prompt = COACH_REGLES + '\n\nDONNÉES ACTUELLES DE L’APP\n' + coachContexte(date) + '\n\nFais le debrief matinal de cette personne : une phrase de verdict, trois constats chiffrés, puis deux actions concrètes pour aujourd’hui (repas, et séance selon ses points faibles). 8 lignes maximum, texte brut.';
      const r = await sample(prompt, { cache: false, onText: u => setIa(u.text) }); setIa(r.text);
    } catch (e) { const m2 = aiMsg(e); if (m2) setErr(m2); if (e && e.text) setIa(e.text); }
    setBusy(false);
  };
  return html`<${Card} cls="c5 r2" title="Debrief matinal" sub=${dMid(date)} right=${html`<button type="button" className="btn sm" onClick=${onEdit}>Modifier</button>`}>
    <div className=${cx('verdict', v[0])}><i><${Icon} n=${v[2]} s=${22} w=${2.2} /></i><div><b>${v[1]}</b><span>${todo.length ? todo[0].txt : 'Sommeil, pas et calories sont dans la cible. Garde le plan du jour.'}</span></div></div>
    <div className="tiles">
      <div className="tile"><span>Poids</span><b>${f1(j.poids)}<small>kg</small></b><em>moy. 7 j ${m ? f1(m.v) : '–'}</em></div>
      <div className="tile"><span>Rythme</span><b>${t ? sgn(t.pct) : '–'}<small>%/sem</small></b><em>${t ? sgn(t.dk, f2) + ' kg' : 'dès 2 semaines'}</em></div>
      <div className="tile"><span>Sommeil</span><b>${f1(j.sommeil)}<small>h</small></b><em>${j.sommeilQ != null ? 'qualité ' + j.sommeilQ + '/10' : ''}</em></div>
      <div className="tile"><span>Forme</span><b>${j.energie == null ? '–' : j.energie}<small>/10</small></b><em>force ${j.force == null ? '–' : j.force}/10</em></div>
    </div>
    ${todo.length > 1 && html`<div className="stack">${todo.slice(1, 3).map(r => html`<div key=${r.k} className="note"><${Icon} n=${r.ic} /><div><span><b>${r.lab} :</b> ${r.txt}</span></div></div>`)}</div>`}
    <div className="plan-j">
      <div><span className="fld-l">Aujourd’hui</span><b>${c.statut === 'salle' ? 'Salle' + (type ? ' · ' + type : '') : 'Repos'}</b><span className="mut">${f0(c.kcal)} kcal · P ${c.p} g</span></div>
      <div className="row" style=${{ gap: 8 }}><button type="button" className="btn sm" onClick=${() => go('repas')}><${Icon} n="utensils" s=${16} />Repas</button>${c.statut === 'salle' && html`<button type="button" className="btn sm" onClick=${() => go('training')}><${Icon} n="dumbbell" s=${16} />Séance</button>`}</div>
    </div>
    ${sample && html`<button type="button" className="btn wide" disabled=${busy} onClick=${run}><${Icon} n="sparkles" s=${18} />${busy ? 'L’IA analyse…' : ia ? 'Refaire le debrief IA' : 'Debrief personnalisé par l’IA'}</button>`}
    ${ia && html`<div className="note acc"><${Icon} n="sparkles" /><div><span className="pre" style=${{ color: 'var(--ink)' }}>${ia}</span></div></div>`}
    ${err && html`<div className="note"><${Icon} n="alert" /><div><span>${err}</span></div></div>`}
  <//>`;
}

function CheckIn({ date, go }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), foods = Apex.allFoods(cfg);
  const hier = Apex.addDays(date, -1), j = S.journal[date] || {}, jh = S.journal[hier] || {}, th = Apex.totJour(jh, foods);
  const src = th.man || (th.eat.k > 0 ? th.eat : null), pw = Apex.serie(S.journal, 'poids').filter(p => p.d < date), lastW = pw.length ? pw[pw.length - 1].v : cfg.profil.poidsDepart;
  const init = () => ({ poids: j.poids == null ? null : j.poids, sommeil: j.sommeil == null ? null : j.sommeil, sommeilQ: j.sommeilQ == null ? null : j.sommeilQ, reveils: j.reveils == null ? null : j.reveils,
    energie: j.energie == null ? null : j.energie, force: j.force == null ? null : j.force, pas: jh.pas == null ? null : jh.pas,
    kcal: src ? Math.round(src.k) : null, p: src ? Math.round(src.p) : null, g: src ? Math.round(src.g) : null, l: src ? Math.round(src.l) : null });
  const [d, setD] = useState(init); const [edit, setEdit] = useState(!j.ci); const [nut, setNut] = useState(false); const [step, setStep] = useState(0);
  const [mode, setMode] = useState(() => lsGet('ci:mode', 'guide'));
  useEffect(() => { setD(init()); setEdit(!j.ci); setNut(false); setStep(0); }, [date, j.ci]);
  const up = (k, nutField) => v => { setD(x => Object.assign({}, x, { [k]: v })); if (nutField) setNut(true); };
  const photoDay = Apex.dow(date) === cfg.photosJour;
  const pickMode = m => { setMode(m); lsSet('ci:mode', m); setStep(0); };
  const save = () => {
    Store.patch('journal', date, { date, poids: d.poids, sommeil: d.sommeil, sommeilQ: d.sommeilQ, reveils: d.reveils, energie: d.energie, force: d.force, ci: new Date().toISOString() });
    const ph = {}; if (d.pas !== (jh.pas == null ? null : jh.pas)) ph.pas = d.pas;
    if (nut && d.kcal != null) { ph.man = { kcal: d.kcal || 0, p: d.p || 0, g: d.g || 0, l: d.l || 0 }; if (jh.man && jh.man.f) ph.man.f = jh.man.f; }
    if (Object.keys(ph).length) Store.patch('journal', hier, Object.assign({ date: hier }, ph));
    setEdit(false); toast('Debrief enregistré');
  };
  if (!edit) return html`<${DebriefCard} date=${date} go=${go} onEdit=${() => { setMode(lsGet('ci:mode', 'guide')); setStep(0); setEdit(true); }} />`;
  const photoNote = photoDay && html`<div className="note acc"><${Icon} n="camera" /><div><span><b>Jour photos.</b> Face, profil, dos avant de manger. Ajout dans l’onglet Analyse.</span></div></div>`;
  const head = html`<div className="row sb"><div className="seg neu" role="group" aria-label="Mode"><button type="button" aria-pressed=${mode === 'guide'} onClick=${() => pickMode('guide')}>Guidé</button><button type="button" aria-pressed=${mode === 'rapide'} onClick=${() => pickMode('rapide')}>Rapide</button></div>
    ${j.ci && html`<button type="button" className="btn sm ghost" onClick=${() => { setD(init()); setEdit(false); }}>Annuler</button>`}</div>`;
  const nutrition = html`<div className="stack"><span className="fld-l">Bilan réel d’hier<b>${src && !nut ? (th.man ? 'saisi' : 'repris du planner') : nut ? 'modifié' : 'à saisir'}</b></span>
    <div className="form f4"><${Num} id="ci-kcal" label="kcal" value=${d.kcal} onChange=${up('kcal', 1)} dec=${0} min=${0} max=${9000} />
      <${Num} id="ci-p" label="Prot." value=${d.p} onChange=${up('p', 1)} dec=${0} min=${0} max=${500} /><${Num} id="ci-g" label="Gluc." value=${d.g} onChange=${up('g', 1)} dec=${0} min=${0} max=${1200} /><${Num} id="ci-l" label="Lip." value=${d.l} onChange=${up('l', 1)} dec=${0} min=${0} max=${500} /></div></div>`;
  if (mode === 'rapide') return html`<${Card} cls="c5 r2" title="Debrief matinal" sub=${'À jeun · ' + dMid(date)}>
    ${head}
    <div className="form">
      <${Num} id="ci-poids" label="Poids" unit="kg" value=${d.poids} onChange=${up('poids')} dec=${1} min=${40} max=${160} placeholder=${f1(lastW)} />
      <${Num} id="ci-pas" label=${'Pas hier (' + dTiny(hier) + ')'} value=${d.pas} onChange=${up('pas')} dec=${0} min=${0} max=${80000} placeholder="10000" />
      <${Num} id="ci-sommeil" label="Sommeil" unit="h" value=${d.sommeil} onChange=${up('sommeil')} dec=${2} min=${0} max=${16} placeholder="7,5" />
      <${Num} id="ci-reveils" label="Réveils" value=${d.reveils} onChange=${up('reveils')} dec=${0} min=${0} max=${20} placeholder="0" />
    </div>
    <${Lvl} label="Qualité du sommeil" value=${d.sommeilQ} onChange=${up('sommeilQ')} /><${Lvl} label="Énergie" value=${d.energie} onChange=${up('energie')} /><${Lvl} label="Force perçue" value=${d.force} onChange=${up('force')} />
    ${nutrition}${photoNote}
    <button type="button" className="btn pri wide" disabled=${d.poids == null} onClick=${save}><${Icon} n="check" s=${18} />Valider le debrief</button>
  <//>`;
  const dots = html`<div className="dots" role="tablist" aria-label="Étapes">${DSTEPS.map((x, i) => html`<button key=${x[0]} type="button" role="tab" aria-selected=${step === i} aria-label=${x[1]} className=${cx(i < step && 'on', i === step && 'cur')} onClick=${() => setStep(i)}><i></i><span>${x[1]}</span></button>`)}</div>`;
  const dw = d.poids != null ? d.poids - lastW : null;
  const bodies = [
    () => html`<${BigNum} id="ci-poids" label="Ton poids ce matin" unit="kg" value=${d.poids} onChange=${up('poids')} step=${0.1} min=${40} max=${160} dec=${1} ph=${Math.round(lastW * 10) / 10} hint=${d.poids == null ? 'À jeun, après les toilettes. Dernière pesée : ' + f1(lastW) + ' kg.' : (dw === 0 ? 'Identique à ta dernière pesée.' : sgn(dw) + ' kg vs ta dernière pesée (' + f1(lastW) + ' kg). Seule la moyenne 7 jours compte.')} />`,
    () => html`<${React.Fragment}><${BigNum} id="ci-sommeil" label="Heures dormies" unit="h" value=${d.sommeil} onChange=${up('sommeil')} step=${0.25} min=${0} max=${16} dec=${2} ph=${7.5} hint=${d.sommeil != null && d.sommeil < 7 ? 'Sous 7 h : la récupération et la faim en pâtissent.' : 'Objectif : 7 h ou plus.'} />
      <${Lvl} label="Qualité du sommeil" value=${d.sommeilQ} onChange=${up('sommeilQ')} />
      <div className="stack"><span className="fld-l">Réveils dans la nuit</span><div className="chips">${[0, 1, 2, 3].map(n => html`<button key=${n} type="button" className="chip" aria-pressed=${d.reveils === n} onClick=${() => up('reveils')(n)}>${n === 3 ? '3 ou +' : n}</button>`)}</div></div><//>`,
    () => html`<${React.Fragment}><${Lvl} label="Énergie" value=${d.energie} onChange=${up('energie')} /><${Lvl} label="Force perçue à l’entraînement" value=${d.force} onChange=${up('force')} /><//>`,
    () => html`<${React.Fragment}><${BigNum} id="ci-pas" label=${'Pas hier (' + dTiny(hier) + ')'} unit="pas" value=${d.pas} onChange=${up('pas')} step=${500} min=${0} max=${80000} dec=${0} ph=${10000} hint=${'Baseline : ' + f0(cfg.cibles.pasMin) + ' à ' + f0(cfg.cibles.pasMax) + ' pas.'} />
      <div className="chips">${[6000, 8000, 10000, 12000, 14000].map(n => html`<button key=${n} type="button" className="chip" aria-pressed=${d.pas === n} onClick=${() => up('pas')(n)}>${f0(n)}</button>`)}</div>${nutrition}<//>`,
    () => html`<${React.Fragment}><div className="tiles">
      <div className="tile"><span>Poids</span><b>${f1(d.poids)}<small>kg</small></b></div><div className="tile"><span>Sommeil</span><b>${f1(d.sommeil)}<small>h</small></b><em>${d.sommeilQ != null ? 'qualité ' + d.sommeilQ + '/10' : ''}</em></div>
      <div className="tile"><span>Énergie · force</span><b>${d.energie == null ? '–' : d.energie} · ${d.force == null ? '–' : d.force}</b></div><div className="tile"><span>Hier</span><b>${f0(d.pas)}<small>pas</small></b><em>${d.kcal != null ? f0(d.kcal) + ' kcal' : 'bilan non saisi'}</em></div></div>${photoNote}<//>`,
  ];
  const last = step === DSTEPS.length - 1;
  return html`<${Card} cls="c5 r2" title="Debrief matinal" sub=${'À jeun · ' + dMid(date)}>
    ${head}${dots}
    <div className="ds">${bodies[step]()}</div>
    <div className="row"><button type="button" className="btn" disabled=${step === 0} onClick=${() => setStep(step - 1)}>Retour</button>
      ${last ? html`<button type="button" className="btn pri grow" disabled=${d.poids == null} onClick=${save}><${Icon} n="check" s=${18} />Valider le debrief</button>` : html`<button type="button" className="btn pri grow" onClick=${() => setStep(step + 1)}>${step === 0 && d.poids == null ? 'Passer' : 'Suivant'}</button>`}</div>
    ${last && d.poids == null && html`<p className="mut" style=${{ fontSize: 12 }}>Le poids à jeun est requis : reviens à la première étape.</p>`}
  <//>`;
}

/* ---- 40-ui-repas.js ---- */
/* ApexHQ — onglet 2 : plan repas, swap, recalage, écarts, macros résiduelles, suppléments. */
const unitOf = f => (f.u ? f.u[0] : 'g');
const macTxt = m => 'P ' + f0(m.p) + ' · G ' + f0(m.g) + ' · L ' + f0(m.l);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const aiErr = e => aiMsg(e);
const nomRepas = () => { const h = new Date().getHours(); return h < 10 ? 'Petit-déj' : h < 15 ? 'Déjeuner' : h < 18 ? 'Collation' : 'Dîner'; };
const heure = () => { const d = new Date(); return Apex.pad(d.getHours()) + ':' + Apex.pad(d.getMinutes()); };

function Qty({ it, f, onChange }) {
  const stp = Apex.pas(f, it.q), r = v => Math.round(v * 100) / 100;
  return html`<div className="qty">
    <button type="button" aria-label=${'Moins de ' + f.n} onClick=${() => onChange(Math.max(0, r(it.q - stp)))}><${Icon} n="minus" s=${16} /></button>
    <${Num} small id=${'q-' + it.id} hint=${'Quantité ' + f.n} value=${it.q} onChange=${v => onChange(v == null ? 0 : v)} dec=${f.u ? 1 : 0} min=${0} max=${5000} />
    <button type="button" aria-label=${'Plus de ' + f.n} onClick=${() => onChange(r(it.q + stp))}><${Icon} n="plus" s=${16} /></button>
    <span className="qty-u">${unitOf(f)}</span>
  </div>`;
}

function MealCard({ m, foods, onToggle, onQty, onSwap, onAdd, onDel }) {
  const t = Apex.totMeal(m, foods);
  return html`<article className=${cx('meal', m.ok && 'ok')}>
    <div className="meal-h">
      <button type="button" className="chk" aria-pressed=${!!m.ok} aria-label=${(m.ok ? 'Marquer non mangé : ' : 'Marquer mangé : ') + m.nom} onClick=${onToggle}><${Icon} n="check" s=${18} w=${2.5} /></button>
      <div className="meal-t"><b>${m.nom}</b><span>${m.h || ''}${m.ok ? ' · mangé' : ''}</span></div>
      <div className="meal-k"><b>${f0(t.k)}</b><span>kcal · ${macTxt(t)}</span></div>
    </div>
    ${m.items.length > 0 && html`<div className="its">${m.items.map(it => {
      const f = Apex.foodOf(it, foods); if (!f) return null; const x = Apex.mac(it, foods);
      return html`<div key=${it.id} className=${cx('it', !(it.q > 0) && 'zero')}>
        <button type="button" className="it-n" onClick=${() => onSwap(it)} aria-label=${'Remplacer ou retirer ' + f.n}><b>${f.n}</b><span>${f0(x.k)} kcal · ${macTxt(x)}</span></button>
        <${Qty} it=${it} f=${f} onChange=${q => onQty(it, q)} />
      </div>`;
    })}</div>`}
    <div className="meal-f">
      <button type="button" className="btn sm ghost" onClick=${onAdd}><${Icon} n="plus" s=${16} />Aliment</button>
      <${Confirm} label="Retirer le repas" sure="Retirer ce repas ?" cls="ghost" onYes=${onDel} />
    </div>
  </article>`;
}

function AddSheet({ foods, title, onAdd, onClose }) {
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [scan, setScan] = useState(false);
  const [fr, setFr] = useState({ n: '', k: null, p: null, g: null, l: null });
  const [ai, setAi] = useState({ txt: '', busy: false, res: null, err: '' });
  const sample = Store.caps().sample;
  const list = Object.keys(foods).map(k => foods[k]).filter(f => (!cat || f.c === cat) && (!q || norm(f.n).indexOf(norm(q)) >= 0));
  const pick = f => { onAdd({ a: f.id, q: f.d || (f.u ? 1 : 100) }); onClose(); };
  const addFree = () => {
    if (!fr.n.trim() || fr.k == null) return;
    const x = { n: fr.n.trim().slice(0, 60), k: fr.k || 0, p: fr.p || 0, g: fr.g || 0, l: fr.l || 0 };
    if (fr.keep) { const id = 'u_' + Apex.uid(); Store.patch('cfg', null, { aliments: Object.assign({}, Store.cfg().aliments, { [id]: { id, n: x.n, c: 'perso', r: '', k: x.k, p: x.p, g: x.g, l: x.l, f: 0, d: 1, u: ['portion', 100] } }) }); onAdd({ a: id, q: 1 }); }
    else onAdd({ q: 1, x });
    onClose();
  };
  const estimate = async () => {
    const txt = ai.txt.trim(); if (!txt || !sample) return;
    setAi(s => Object.assign({}, s, { busy: true, err: '', res: null }));
    try {
      const r = await sample.json('Tu es diététicien. Estime les valeurs nutritionnelles TOTALES du repas décrit (table Ciqual ; valeurs officielles pour les enseignes de restauration). Sans quantité précisée, prends une portion standard adulte. Réponds uniquement par un objet JSON : {"nom": "libellé court", "kcal": nombre, "p": grammes de protéines, "g": grammes de glucides, "l": grammes de lipides, "f": grammes de fibres, "detail": "hypothèses de portions en une ligne"}.\n\nRepas : """' + txt.slice(0, 600) + '"""');
      const k = r && +r.kcal; if (!Apex.num(k) || k <= 0) throw { code: 'invalid_json' };
      setAi(s => Object.assign({}, s, { busy: false, res: { n: String(r.nom || 'Repas estimé').slice(0, 60), k, p: +r.p || 0, g: +r.g || 0, l: +r.l || 0, f: +r.f || 0, detail: String(r.detail || '').slice(0, 260) } }));
    } catch (e) { setAi(s => Object.assign({}, s, { busy: false, err: aiErr(e) })); }
  };
  return html`<${Sheet} title=${title} onClose=${onClose}>
    <input id="add-q" className="inp" type="search" placeholder="Chercher : poulet, gnocchi, Big Mac…" value=${q} onChange=${e => setQ(e.target.value)} aria-label="Chercher un aliment" />
    ${CAN_SCAN && html`<button type="button" className="btn" onClick=${() => setScan(true)}><${Icon} n="camera" s=${18} />Scanner un code-barres</button>`}
    ${scan && html`<${ScanSheet} onClose=${() => setScan(false)} onProduct=${p => { const id = ajouterProduit(p); onAdd({ a: id, q: p.dose ? 1 : 100 }); onClose(); }} />`}
    <div className="chips">
      <button type="button" className="chip" aria-pressed=${cat === ''} onClick=${() => setCat('')}>Tout</button>
      ${Apex.CATS.map(c => html`<button key=${c[0]} type="button" className="chip" aria-pressed=${cat === c[0]} onClick=${() => setCat(c[0])}>${c[1]}</button>`)}
    </div>
    <div className="lst">
      ${list.length ? list.map(f => { const x = Apex.mac({ a: f.id, q: f.d || (f.u ? 1 : 100) }, foods); return html`<button key=${f.id} type="button" onClick=${() => pick(f)}>
        <div><b>${f.n}</b><span>${fq(f.d || (f.u ? 1 : 100))} ${unitOf(f)} · ${macTxt(x)}${f.etq ? ' · à caler sur l’étiquette' : ''}</span></div><em>${f0(x.k)}<small>kcal</small></em></button>`; })
      : html`<div className="empty" style=${{ padding: 14 }}>Rien dans la base. Utilise la saisie libre ci-dessous.</div>`}
    </div>
    <h3>Saisie libre</h3>
    <div className="form">
      <label className="fld full" htmlFor="fr-n"><span className="fld-l">Nom</span><input id="fr-n" className="inp" type="text" maxLength="60" placeholder="Poke bowl saumon" value=${fr.n} onChange=${e => setFr(Object.assign({}, fr, { n: e.target.value }))} /></label>
    </div>
    <div className="form f4">
      <${Num} id="fr-k" label="kcal" value=${fr.k} onChange=${v => setFr(Object.assign({}, fr, { k: v }))} dec=${0} min=${0} max=${6000} />
      <${Num} id="fr-p" label="Protéines" value=${fr.p} onChange=${v => setFr(Object.assign({}, fr, { p: v }))} dec=${0} min=${0} max=${400} />
      <${Num} id="fr-g" label="Glucides" value=${fr.g} onChange=${v => setFr(Object.assign({}, fr, { g: v }))} dec=${0} min=${0} max=${900} />
      <${Num} id="fr-l" label="Lipides" value=${fr.l} onChange=${v => setFr(Object.assign({}, fr, { l: v }))} dec=${0} min=${0} max=${400} />
    </div>
    <label className="row" htmlFor="fr-keep" style=${{ fontSize: 13, color: 'var(--ink-2)', gap: 8 }}><input id="fr-keep" type="checkbox" checked=${!!fr.keep} onChange=${e => setFr(Object.assign({}, fr, { keep: e.target.checked }))} />Garder dans ma base (valeurs par portion)</label>
    <button type="button" className="btn wide" disabled=${!fr.n.trim() || fr.k == null} onClick=${addFree}>Ajouter la saisie libre</button>
    ${sample && html`<div className="stack">
      <h3>Estimation par Claude</h3>
      <textarea id="ai-txt" className="inp" placeholder="2 parts de pizza 4 fromages, 1 tiramisu, 1 bière 25 cl" value=${ai.txt} maxLength="600" onChange=${e => setAi(Object.assign({}, ai, { txt: e.target.value }))} aria-label="Décris le repas à estimer"></textarea>
      <button type="button" className="btn wide" disabled=${ai.busy || !ai.txt.trim()} onClick=${estimate}><${Icon} n="sparkles" s=${18} />${ai.busy ? 'Estimation…' : 'Estimer les macros'}</button>
      ${ai.err && html`<div className="note"><${Icon} n="alert" /><div><span>${ai.err}</span></div></div>`}
      ${ai.res && html`<div className="note acc"><${Icon} n="sparkles" /><div>
        <span><b>${ai.res.n}</b> · ${f0(ai.res.k)} kcal · ${macTxt(ai.res)}</span>
        ${ai.res.detail && html`<span>${ai.res.detail}</span>`}
        <span className="mut">Estimation, pas une pesée. Corrige si tu as l’étiquette.</span>
        <button type="button" className="btn sm pri" onClick=${() => { onAdd({ q: 1, x: { n: ai.res.n, k: Math.round(ai.res.k), p: Math.round(ai.res.p), g: Math.round(ai.res.g), l: Math.round(ai.res.l), f: Math.round(ai.res.f) } }); onClose(); }}>Ajouter au repas</button>
      </div></div>`}
    </div>`}
    <p className="mut" style=${{ fontSize: 12 }}>Valeurs moyennes Ciqual, poids cru pour viandes, poissons et féculents. Écarts : valeurs par portion.</p>
  <//>`;
}

function SwapSheet({ it, foods, onPick, onDel, onClose }) {
  const f = Apex.foodOf(it, foods), m = Apex.mac(it, foods), opts = Apex.swapOptions(it, foods);
  return html`<${Sheet} title=${'Remplacer · ' + f.n} onClose=${onClose}>
    <div className="note"><${Icon} n="swap" /><div><span><b>${fq(it.q)} ${unitOf(f)}</b> · ${f0(m.k)} kcal · ${macTxt(m)}</span>
      <span>${f.r ? 'Équivalents à ' + (f.r === 'P' ? 'protéines' : f.r === 'G' ? 'glucides' : 'lipides') + ' égales : la quantité est recalculée.' : 'Même famille, quantité équivalente.'}</span></div></div>
    ${opts.length > 0 && html`<div className="lst">${opts.map(o => html`<button key=${o.f.id} type="button" onClick=${() => { onPick(o.f.id, o.q); onClose(); }}>
      <div><b>${o.f.n}</b><span>${fq(o.q)} ${unitOf(o.f)} · ${macTxt(o.m)}</span></div>
      <em>${f0(o.m.k)}<small>${sgn(o.dk, f0)} kcal</small></em></button>`)}</div>`}
    ${!opts.length && html`<div className="empty">Pas d’équivalent direct dans la base.</div>`}
    <${Confirm} label="Retirer cet aliment" sure="Retirer ?" icon="trash" onYes=${() => { onDel(); onClose(); }} />
  <//>`;
}

function Boucler({ reste, foods, meals, onAdd }) {
  const mem = (k, d) => { try { const v = localStorage.getItem('apexhq:bk:' + k); return v && foods[v] ? v : d; } catch (e) { return d; } };
  const [sel, setSel] = useState(() => ({ P: mem('P', 'poulet'), G: mem('G', 'riz'), L: mem('L', 'amandes') }));
  const [mid, setMid] = useState('');
  const set = (r, v) => { setSel(s => Object.assign({}, s, { [r]: v })); try { localStorage.setItem('apexhq:bk:' + r, v); } catch (e) { /* préférence non mémorisée */ } };
  const res = Apex.boucler(reste, [foods[sel.P], foods[sel.G], foods[sel.L]], foods);
  const libres = meals.filter(m => !m.ok), cible = mid && libres.some(m => m.id === mid) ? mid : (libres.length ? libres[libres.length - 1].id : '');
  const opts = r => Object.keys(foods).map(k => foods[k]).filter(f => f.r === r && f.c !== 'ecart').map(f => html`<option key=${f.id} value=${f.id}>${f.n}</option>`);
  return html`<div className="stack">
    <div className="form" style=${{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
      <label className="fld" htmlFor="bk-p"><span className="fld-l">Protéines</span><select id="bk-p" className="inp" value=${sel.P} onChange=${e => set('P', e.target.value)}>${opts('P')}</select></label>
      <label className="fld" htmlFor="bk-g"><span className="fld-l">Glucides</span><select id="bk-g" className="inp" value=${sel.G} onChange=${e => set('G', e.target.value)}>${opts('G')}</select></label>
      <label className="fld" htmlFor="bk-l"><span className="fld-l">Lipides</span><select id="bk-l" className="inp" value=${sel.L} onChange=${e => set('L', e.target.value)}>${opts('L')}</select></label>
    </div>
    ${res.items.length ? html`<div className="stack">
      <div className="rows">${res.items.map(i => { const f = foods[i.a], x = Apex.mac(i, foods); return html`<div key=${i.a} className="mini"><span>${f.n}</span><span className="mut tab">${f0(x.k)} kcal</span><b>${fq(i.q)}<small>${unitOf(f)}</small></b></div>`; })}</div>
      <div className="note"><${Icon} n="target" /><div><span>Apporte <b>${f0(res.tot.k)} kcal</b> · ${macTxt(res.tot)}. Écart final : ${sgn(res.delta.k, f0)} kcal, P ${sgn(res.delta.p, f0)} g.</span></div></div>
      <div className="row">
        ${libres.length > 1 && html`<select id="bk-m" className="inp grow" aria-label="Repas de destination" value=${cible} onChange=${e => setMid(e.target.value)}>${libres.map(m => html`<option key=${m.id} value=${m.id}>${m.nom}</option>`)}</select>`}
        <button type="button" className="btn pri grow" onClick=${() => onAdd(cible, res.items)}><${Icon} n="plus" s=${18} />${libres.length ? 'Ajouter au repas' : 'Créer le repas'}</button>
      </div>
    </div>` : html`<div className="empty">Ces trois aliments ne comblent pas ce reste. Change une source.</div>`}
  </div>`;
}

function Repas({ date }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), foods = Apex.allFoods(cfg);
  const j = S.journal[date] || {}, meals = j.repas || [], c = Apex.cibleDuJour(cfg, j, date), t = Apex.totJour(j, foods);
  const [sheet, setSheet] = useState(null);
  const put = ms => Store.patch('journal', date, { date, repas: ms });
  const mapMeal = (mid, fn) => put(meals.map(m => (m.id === mid ? fn(m) : m)));
  const mapItem = (mid, iid, fn) => mapMeal(mid, m => Object.assign({}, m, { items: m.items.map(i => (i.id === iid ? fn(i) : i)).filter(Boolean) }));
  const sumK = ms => ms.reduce((s, m) => s + Apex.totMeal(m, foods).k, 0);
  const cons = t.man || t.eat, plan = t.plan, man = !!t.man;
  const ecart = man ? t.man.k - c.kcal : plan.k - c.kcal;
  const fitted = meals.length && !man ? Apex.ajuster(meals, c, foods) : meals, fitK = man ? t.man.k : sumK(fitted);
  const canFit = !man && meals.length > 0 && Math.abs(fitK - plan.k) > 15, exc = fitK - c.kcal;
  const lis = exc > 60 && !j.lisse ? Apex.lissage(exc, cfg, S.journal, date) : null;
  const reste = { k: c.kcal - plan.k, p: c.p - plan.p, g: c.g - plan.g, l: c.l - plan.l };
  const gen = () => { put(Apex.planDuJour(cfg, c.statut, c)); toast('Plan ' + c.statut + ' chargé, calé sur ' + f0(c.kcal) + ' kcal'); };
  const tplOk = !!(cfg.repasModeles && cfg.repasModeles[c.statut]);
  const saveTpl = () => {
    const tpl = meals.map((m, i) => ({ id: 'm' + (i + 1), nom: m.nom, h: m.h || '', items: m.items.filter(it => !it.x && foods[it.a]).map(it => ({ a: it.a, q: it.q, adj: foods[it.a].r ? 1 : 0 })) })), libres = meals.reduce((s, m) => s + m.items.filter(it => it.x).length, 0);
    Store.patch('cfg', null, { repasModeles: Object.assign({}, cfg.repasModeles || {}, { [c.statut]: tpl }) }); toast('Plan type ' + c.statut + ' enregistré' + (libres ? ' (' + libres + ' saisie(s) libre(s) ignorée(s))' : ''));
  };
  const resetTpl = () => { const o = Object.assign({}, cfg.repasModeles || {}); delete o[c.statut]; Store.patch('cfg', null, { repasModeles: Object.keys(o).length ? o : null }); toast('Plan type ' + c.statut + ' rétabli'); };
  const refit = () => { put(fitted); toast('Recalé : ' + f0(fitK) + ' kcal prévus'); };
  const addMeal = () => { const used = meals.map(m => m.nom), n = nomRepas(), m = { id: Apex.uid(), nom: used.indexOf(n) < 0 ? n : 'Extra', h: heure(), ok: false, items: [] }; put(meals.concat(m)); setSheet({ t: 'add', mid: m.id }); };
  const addItems = (mid, items) => {
    const its = items.map(i => Object.assign({ id: Apex.uid() }, i));
    if (mid && meals.some(m => m.id === mid)) mapMeal(mid, m => Object.assign({}, m, { items: m.items.concat(its) }));
    else put(meals.concat({ id: Apex.uid(), nom: 'Complément', h: heure(), ok: false, items: its }));
    toast('Ajouté au plan');
  };
  const lisser = () => { lis.plan.forEach(p => Store.patch('journal', p.d, { date: p.d, ajust: p.ajust })); Store.patch('journal', date, { date, lisse: lis.plan.map(p => ({ d: p.d, cut: p.cut })) }); toast('Écart lissé sur ' + lis.plan.length + ' jour' + (lis.plan.length > 1 ? 's' : '')); };
  const delisser = () => { (j.lisse || []).forEach(p => { const o = Store.get().journal[p.d] || {}; const a = (o.ajust || 0) + p.cut; Store.patch('journal', p.d, { date: p.d, ajust: a === 0 ? null : a }); }); Store.patch('journal', date, { date, lisse: null }); toast('Lissage annulé'); };
  const supp = j.supp || {}, supL = Apex.supps(cfg);
  const sh = sheet && meals.find(m => m.id === sheet.mid), shIt = sh && sheet.t === 'swap' ? sh.items.find(i => i.id === sheet.iid) : null;

  return html`<div>
    <div className="view-h"><h1>Repas · ${dMid(date)}</h1><p>Cible ${c.statut} : ${f0(c.kcal)} kcal · P ${c.p} · G ${c.g} · L ${c.l}</p></div>
    <div className="grid">
      <div className="c7 stack" style=${{ gap: 14, alignContent: 'start' }}>
        <${Card} title="Bilan du jour" sub=${man ? 'Bilan saisi à la main' : 'Mangé (plein) et prévu (clair)'} right=${html`<${Pill} st=${Math.abs(ecart) <= c.kcal * 0.05 ? 'good' : Math.abs(ecart) <= 300 ? 'warn' : 'crit'}>${man ? 'Réel' : 'Prévu'} ${sgn(ecart, f0)} kcal<//>`}>
          <div className="sum">
            <${Ring} v=${cons.k} v2=${man ? 0 : plan.k} max=${c.kcal}><b>${f0(cons.k)}</b><span>/ ${f0(c.kcal)} kcal</span><//>
            <div className="sum-r">
              <${Meter} label="Protéines" v=${cons.p} v2=${man ? 0 : plan.p} max=${c.p} c="var(--p)" />
              <${Meter} label="Glucides" v=${cons.g} v2=${man ? 0 : plan.g} max=${c.g} c="var(--g)" />
              <${Meter} label="Lipides" v=${cons.l} v2=${man ? 0 : plan.l} max=${c.l} c="var(--l)" />
              <${Meter} label="Fibres" v=${cons.f} v2=${man ? 0 : plan.f} max=${cfg.cibles.fibres} c="var(--ink-3)" />
            </div>
          </div>
          <div className="tiles">
            <div className="tile"><span>Reste à manger</span><b>${f0(Math.max(0, c.kcal - cons.k))}<small>kcal</small></b></div>
            <div className="tile"><span>Protéines restantes</span><b>${f0(Math.max(0, c.p - cons.p))}<small>g</small></b></div>
            <div className="tile"><span>${man ? 'Réel' : 'Prévu'}</span><b>${f0(man ? cons.k : plan.k)}<small>kcal</small></b><em>${sgn(ecart, f0)} vs cible</em></div>
          </div>
          ${man && html`<div className="note"><${Icon} n="info" /><div><span>Ce bilan vient du check-in. Les repas cochés ne comptent pas tant qu’il est actif.</span>
            <${Confirm} label="Revenir au planner" sure="Effacer le bilan saisi ?" onYes=${() => Store.patch('journal', date, { date, man: null })} /></div></div>`}
        <//>
        <${Card} title="Repas" sub="Touche un aliment pour le remplacer" right=${html`<button type="button" className="btn sm" onClick=${addMeal}><${Icon} n="plus" s=${16} />Repas ou écart</button>`}>
          ${meals.length ? html`<div className="stack">${meals.map(m => html`<${MealCard} key=${m.id} m=${m} foods=${foods}
            onToggle=${() => mapMeal(m.id, x => Object.assign({}, x, { ok: !x.ok }))}
            onQty=${(it, q) => mapItem(m.id, it.id, i => { const o = Object.assign({}, i, { q }); delete o.adj; return o; })}
            onSwap=${it => setSheet({ t: 'swap', mid: m.id, iid: it.id })}
            onAdd=${() => setSheet({ t: 'add', mid: m.id })}
            onDel=${() => put(meals.filter(x => x.id !== m.id))} />`)}</div>`
          : html`<div className="empty"><span><b>Aucun repas planifié.</b> Charge le plan ${c.statut} : repas autour de la séance, quantités calées sur ${f0(c.kcal)} kcal et ${c.p} g de protéines. Tu remplaces ensuite ce que tu veux.</span>
            <button type="button" className="btn pri" onClick=${gen}><${Icon} n="utensils" s=${18} />Charger le plan du jour</button></div>`}
          ${meals.length > 0 && html`<div className="row sb"><span className="mut" style=${{ fontSize: 12 }}>Plan type ${c.statut} : ${tplOk ? 'le tien' : 'par défaut'}</span>
            <div className="row"><button type="button" className="btn sm ghost" onClick=${saveTpl}>Enregistrer comme plan type</button>${tplOk && html`<${Confirm} label="Rétablir" sure="Rétablir le défaut ?" cls="ghost" onYes=${resetTpl} />`}</div></div>`}
        <//>
        ${j.repasTxt && html`<${Card} title="Journal du jour" sub="Texte repris du QG Sèche"><div className="pre">${j.repasTxt}</div><//>`}
      </div>
      <div className="c5 stack" style=${{ gap: 14, alignContent: 'start' }}>
        <${Card} title="Boucler la journée" sub="Macros résiduelles par rapport à la cible">
          ${j.lisse ? html`<div className="note acc"><${Icon} n="trend" /><div><span><b>Écart lissé.</b> ${j.lisse.map(p => dTiny(p.d) + ' −' + p.cut).join(' · ')} kcal. Pas de jeûne, pas de cardio punitif.</span><${Confirm} label="Annuler le lissage" onYes=${delisser} /></div></div>` : null}
          ${ecart > 40 && html`<div className="note acc"><${Icon} n="alert" /><div>
            <span><b>${sgn(ecart, f0)} kcal</b> au-dessus de la cible${man ? '.' : ' avec le plan actuel.'}</span>
            ${canFit && html`<span>Le recalage baisse glucides puis lipides des repas non mangés, protéines tenues à ${c.pMin} g minimum : ${f0(fitK)} kcal.</span>`}
            ${canFit && html`<button type="button" className="btn sm pri" onClick=${refit}><${Icon} n="refresh" s=${16} />Recaler le reste</button>`}
            ${!canFit && lis && lis.plan.length > 0 && html`<span>Plus rien à ajuster aujourd’hui. Lissage : ${lis.plan.map(p => dTiny(p.d) + ' −' + p.cut).join(' · ')} kcal${lis.reste > 0 ? ' ; ' + f0(lis.reste) + ' kcal non rattrapés (≈ ' + f0(lis.gras * 1000) + ' g de gras), assumés.' : '.'}</span>`}
            ${!canFit && lis && lis.plan.length > 0 && html`<button type="button" className="btn sm" onClick=${lisser}>Lisser sur ${lis.plan.length} jour${lis.plan.length > 1 ? 's' : ''}</button>`}
          </div></div>`}
          ${!man && meals.length > 0 && Math.abs(ecart) <= 40 && html`<div className="note"><${Icon} n="check" /><div><span><b>Journée bouclée.</b> Prévu ${f0(plan.k)} kcal pour ${f0(c.kcal)} · ${macTxt(plan)}.</span></div></div>`}
          ${!man && ecart < -40 && html`<div className="stack">
            <div className="tiles">
              <div className="tile"><span>À combler</span><b>${f0(reste.k)}<small>kcal</small></b></div>
              <div className="tile"><span>P · G · L</span><b>${f0(Math.max(0, reste.p))}·${f0(Math.max(0, reste.g))}·${f0(Math.max(0, reste.l))}<small>g</small></b></div>
            </div>
            <${Boucler} reste=${reste} foods=${foods} meals=${meals} onAdd=${addItems} />
            ${canFit && html`<button type="button" className="btn wide" onClick=${refit}><${Icon} n="refresh" s=${18} />Ou recaler les quantités existantes</button>`}
          </div>`}
        <//>
        <${Card} title="Compléments" sub="Coche à la prise">
          ${supL.length ? html`<div className="supp">${supL.map(x => html`<button key=${x.id} type="button" aria-pressed=${!!supp[x.id]} onClick=${() => { const o = Object.assign({}, supp); if (o[x.id]) delete o[x.id]; else o[x.id] = 1; Store.patch('journal', date, { date, supp: Object.keys(o).length ? o : null }); }}>
            <span className="chk" aria-pressed=${!!supp[x.id]}><${Icon} n="check" s=${16} w=${2.5} /></span><span><b>${x.n}</b><span>${x.note || ''}</span></span></button>`)}</div>`
          : html`<div className="empty"><span>Aucun complément. Ajoute les tiens dans Réglages, onglet Repas.</span></div>`}
          <p className="mut" style=${{ fontSize: 12 }}>Les protéines en poudre ajoutées au plan repas comptent dans le total, pas besoin de les cocher ici.</p>
        <//>
      </div>
    </div>
    ${sheet && sheet.t === 'add' && sh && html`<${AddSheet} foods=${foods} title=${'Ajouter · ' + sh.nom} onClose=${() => setSheet(null)} onAdd=${it => addItems(sh.id, [it])} />`}
    ${shIt && html`<${SwapSheet} it=${shIt} foods=${foods} onClose=${() => setSheet(null)}
      onPick=${(a, q) => mapItem(sh.id, shIt.id, i => { const o = { id: i.id, a, q }; if (i.adj) o.adj = 1; return o; })}
      onDel=${() => mapItem(sh.id, shIt.id, () => null)} />`}
  </div>`;
}

/* ---- 50-ui-training.js ---- */
/* ApexHQ — onglet 3 : séance du jour, charges, points faibles (pecs, biceps, deltoïdes latéraux), fatigue. */
const fl = e => Apex.focusLabel(Store.cfg(), e.m);
const setsTxt = sets => { const g = {}; sets.forEach(s => { const k = fq(s.kg || 0); (g[k] = g[k] || []).push(s.r); }); return Object.keys(g).map(k => k + ' × ' + g[k].join('·')).join('  '); };
const cleanSet = s => { const o = {}; ['kg', 'r', 'rpe'].forEach(k => { if (s[k] != null) o[k] = s[k]; }); return o; };

function WeekStrip({ date, setDate }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), from = Apex.lundi(date), L = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  return html`<div className="week" role="group" aria-label="Semaine">${Apex.range(from, Apex.addDays(from, 6)).map((d, i) => {
    const se = S.seances[d], tp = se ? se.type : Apex.seanceDuJour(cfg, S.journal[d], d);
    return html`<button key=${d} type="button" aria-pressed=${d === date} aria-label=${dLong(d) + ' : ' + (tp || 'repos') + (se && se.fin ? ', faite' : '')} className=${cx(se && se.fin && 'done', se && !se.fin && 'live')} onClick=${() => setDate(d)}>
      <small>${L[i]}</small><b>${Apex.parse(d).getDate()}</b><span>${tp || 'Repos'}</span><i></i></button>`;
  })}</div>`;
}

function ExoBlock({ ex, exos, seances, date, onSets, onSwap, onDel }) {
  const e = exos[ex.e] || { n: ex.e, m: '', s: [], lo: 8, hi: 12, inc: 2.5 };
  const h = Apex.histoExo(seances, ex.e).filter(x => x.date < date), last = h.length ? h[h.length - 1] : null, obj = Apex.objectif(e, last);
  const best = h.reduce((b, x) => Math.max(b, x.e1), 0), cur = (ex.sets || []).reduce((b, s) => Math.max(b, Apex.e1rm(s)), 0), ph = String(obj.reps).split('·');
  const setAt = (i, k, v) => onSets(ex.sets.map((s, n) => (n === i ? cleanSet(Object.assign({}, s, { [k]: v })) : s)));
  return html`<div className="exo">
    <div className="exo-h">
      <div><h3>${e.n}${fl(e) && html`<span className="badge">${fl(e)}</span>`}</h3>
        <div className="exo-m">
          <span>${last ? html`Dernier <b>${setsTxt(last.sets)}</b>` : 'Première fois'}</span>
          <span>Objectif <b>${obj.txt}</b></span>
          ${cur > 0 && html`<span>e1RM <b>${f1(cur)} kg</b></span>`}
        </div></div>
      <div className="row" style=${{ gap: 2 }}>
        ${cur > best + 0.05 && best > 0 && html`<${Pill} st="good">Record<//>`}
        <button type="button" className="ib sm" aria-label=${'Remplacer ' + e.n} onClick=${onSwap}><${Icon} n="swap" s=${17} /></button>
      </div>
    </div>
    <div className="sets">
      <div className="set set-h"><span>#</span><span>kg</span><span></span><span>rép.</span><span>RPE</span><span></span></div>
      ${(ex.sets || []).map((s, i) => html`<div key=${i} className=${cx('set', Apex.setFait(s) && 'done')}>
        <span>${i + 1}</span>
        <${Num} small id=${'s-' + ex.e + '-' + i + '-kg'} hint=${e.n + ' série ' + (i + 1) + ' : charge en kg'} value=${s.kg == null ? null : s.kg} onChange=${v => setAt(i, 'kg', v)} dec=${2} min=${0} max=${600} placeholder=${obj.kg == null ? '' : fq(obj.kg)} />
        <span>×</span>
        <${Num} small id=${'s-' + ex.e + '-' + i + '-r'} hint=${e.n + ' série ' + (i + 1) + ' : répétitions'} value=${s.r == null ? null : s.r} onChange=${v => setAt(i, 'r', v)} dec=${0} min=${0} max=${100} placeholder=${ph[i] || ph[ph.length - 1] || ''} />
        <${Num} small id=${'s-' + ex.e + '-' + i + '-rpe'} hint=${e.n + ' série ' + (i + 1) + ' : RPE'} value=${s.rpe == null ? null : s.rpe} onChange=${v => setAt(i, 'rpe', v)} dec=${1} min=${1} max=${10} placeholder="8" />
        <button type="button" className="ib sm" aria-label=${'Retirer la série ' + (i + 1)} onClick=${() => onSets(ex.sets.filter((_, n) => n !== i))}><${Icon} n="x" s=${15} /></button>
      </div>`)}
    </div>
    <div className="row sb">
      <button type="button" className="btn sm ghost" onClick=${() => onSets((ex.sets || []).concat({}))}><${Icon} n="plus" s=${16} />Série</button>
      <${Confirm} label="Retirer l’exercice" sure="Retirer ?" cls="ghost" onYes=${onDel} />
    </div>
  </div>`;
}

function ExoSheet({ exos, title, muscle, onPick, onClose }) {
  const [q, setQ] = useState(''); const [cu, setCu] = useState({ n: '', m: muscle || 'pecH', lo: 8, hi: 12, inc: 2.5 });
  const list = Object.keys(exos).map(k => exos[k]).filter(e => !q || norm(e.n).indexOf(norm(q)) >= 0).sort((a, b) => (a.m === muscle ? 0 : 1) - (b.m === muscle ? 0 : 1) || a.m.localeCompare(b.m));
  const create = () => { const n = cu.n.trim(); if (!n) return; const id = 'c_' + Apex.uid(), all = Object.assign({}, Store.cfg().exos || {}); const lo = Math.max(1, Math.round(cu.lo || 8)), hi = Math.max(lo, Math.round(cu.hi || 12)); all[id] = { id, n: n.slice(0, 60), m: cu.m, s: [], lo, hi, inc: cu.inc > 0 ? cu.inc : 2.5 }; Store.patch('cfg', null, { exos: all }); onPick(id); onClose(); };
  return html`<${Sheet} title=${title} onClose=${onClose}>
    <input id="ex-q" className="inp" type="search" placeholder="Chercher un exercice" value=${q} onChange=${e => setQ(e.target.value)} aria-label="Chercher un exercice" />
    <div className="lst">${list.map(e => html`<button key=${e.id} type="button" onClick=${() => { onPick(e.id); onClose(); }}>
      <div><b>${e.n}</b><span>${Apex.MUSCLES[e.m] || e.m} · ${e.lo}–${e.hi} rép.</span></div><em></em></button>`)}</div>
    <h3>Exercice perso</h3>
    <div className="form">
      <label className="fld" htmlFor="ex-n"><span className="fld-l">Nom</span><input id="ex-n" className="inp" type="text" maxLength="60" value=${cu.n} onChange=${e => setCu(Object.assign({}, cu, { n: e.target.value }))} /></label>
      <label className="fld" htmlFor="ex-m"><span className="fld-l">Muscle principal</span><select id="ex-m" className="inp" value=${cu.m} onChange=${e => setCu(Object.assign({}, cu, { m: e.target.value }))}>${Object.keys(Apex.MUSCLES).map(k => html`<option key=${k} value=${k}>${Apex.MUSCLES[k]}</option>`)}</select></label>
    </div>
    <div className="form" style=${{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
      <${Num} id="ex-lo" label="Rép. min" value=${cu.lo} onChange=${v => setCu(Object.assign({}, cu, { lo: v }))} dec=${0} min=${1} max=${50} />
      <${Num} id="ex-hi" label="Rép. max" value=${cu.hi} onChange=${v => setCu(Object.assign({}, cu, { hi: v }))} dec=${0} min=${1} max=${60} />
      <${Num} id="ex-inc" label="Pas de charge" unit="kg" value=${cu.inc} onChange=${v => setCu(Object.assign({}, cu, { inc: v }))} dec=${2} min=${0.25} max=${20} />
    </div>
    <button type="button" className="btn wide" disabled=${!cu.n.trim()} onClick=${create}>Créer et ajouter</button>
  <//>`;
}

function SeanceCard({ date }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), exos = Apex.allExos(cfg), prog = Apex.progOf(cfg);
  const j = S.journal[date] || {}, statut = Apex.statutDuJour(cfg, j, date), type = Apex.seanceDuJour(cfg, j, date), se = S.seances[date];
  const [sheet, setSheet] = useState(null);
  const putExos = ex => Store.patch('seances', date, { date, exos: ex });
  const start = () => { Store.patch('seances', date, { date, type: type || Apex.types(cfg)[0], debut: new Date().toISOString(), exos: (prog[type] || []).map(x => ({ e: x[0], sets: Array.from({ length: x[1] }, () => ({})) })) }); toast('Séance ' + type + ' ouverte'); };
  if (!se && statut === 'repos') return html`<${Card} cls="c7" title="Repos" sub=${dMid(date)}>
    <div className="empty"><span><b>Pas de séance prévue.</b> Objectif du jour : ${f0(cfg.cibles.pasMin)}–${f0(cfg.cibles.pasMax)} pas, ${f0(cfg.cibles.repos.kcal)} kcal, sommeil ≥ ${cfg.cibles.sommeil} h.</span>
      <button type="button" className="btn" onClick=${() => Store.patch('journal', date, { date, statut: 'salle', seance: Apex.prochaineSeance(S.seances, cfg, date) })}><${Icon} n="dumbbell" s=${18} />Passer en jour de salle</button></div>
  <//>`;
  if (!se) return html`<${DayPlan} date=${date} />`;
  const r = Apex.resumeSeance(se), swEx = sheet && sheet.t === 'swap' ? se.exos[sheet.i] : null;
  return html`<${Card} cls="c7" title=${'Séance ' + (se.type || '')} sub=${dMid(date) + (se.fin ? ' · terminée' : ' · en cours')} right=${html`<${Pill} st=${se.fin ? 'good' : 'warn'}>${se.fin ? 'Terminée' : 'En cours'}<//>`}>
    ${se.note && html`<div className="note"><${Icon} n="info" /><div><span>${se.note}</span></div></div>`}
    <div>${(se.exos || []).map((ex, i) => html`<${ExoBlock} key=${ex.e + '-' + i} ex=${ex} exos=${exos} seances=${S.seances} date=${date}
      onSets=${sets => putExos(se.exos.map((x, n) => (n === i ? Object.assign({}, x, { sets }) : x)))}
      onSwap=${() => setSheet({ t: 'swap', i })}
      onDel=${() => putExos(se.exos.filter((_, n) => n !== i))} />`)}</div>
    <button type="button" className="btn wide" onClick=${() => setSheet({ t: 'add' })}><${Icon} n="plus" s=${18} />Exercice</button>
    <div className="tiles">
      <div className="tile"><span>Séries faites</span><b>${r.sets}</b></div>
      <div className="tile"><span>Tonnage</span><b>${f0(r.tonnage)}<small>kg</small></b></div>
      <div className="tile"><span>RPE moyen</span><b>${r.rpe == null ? '–' : f1(r.rpe)}</b></div>
    </div>
    <div className="row">
      <button type="button" className=${cx('btn grow', !se.fin && 'pri')} onClick=${() => { Store.patch('seances', date, { date, fin: se.fin ? null : true }); if (!se.fin) toast('Séance terminée : ' + r.sets + ' séries, ' + f0(r.tonnage) + ' kg'); }}><${Icon} n="check" s=${18} />${se.fin ? 'Rouvrir la séance' : 'Terminer la séance'}</button>
      <${Confirm} label="Supprimer" sure="Supprimer la séance ?" icon="trash" onYes=${() => Store.del('seances', date)} />
    </div>
    ${sheet && sheet.t === 'add' && html`<${ExoSheet} exos=${exos} title="Ajouter un exercice" onClose=${() => setSheet(null)} onPick=${id => putExos((se.exos || []).concat({ e: id, sets: [{}, {}, {}] }))} />`}
    ${swEx && html`<${ExoSheet} exos=${exos} title=${'Remplacer · ' + ((exos[swEx.e] || {}).n || '')} muscle=${(exos[swEx.e] || {}).m} onClose=${() => setSheet(null)} onPick=${id => putExos(se.exos.map((x, n) => (n === sheet.i ? Object.assign({}, x, { e: id }) : x)))} />`}
  <//>`;
}

function FocusCard({ date }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), al = Apex.alertesFocus(S.seances, S.journal, cfg, date);
  return html`<${Card} title="Points faibles" sub="Séries directes de la semaine, cible et projection">
    <div>${al.map(a => { const o = a.o, sc = Math.max(o.max * 1.2, o.proj, o.fait) || 1, pc = v => Math.min(100, v / sc * 100) + '%';
      return html`<div key=${a.k} className="foc">
        <div className="foc-h"><b>${a.n}</b><${Pill} st=${a.st}>${a.tag}<//></div>
        <div className="vb" role="img" aria-label=${a.n + ' : ' + fq(o.fait) + ' séries faites, ' + fq(o.proj) + ' projetées, cible ' + o.min + ' à ' + o.max}>
          <div className="vb-t">${o.proj > o.fait && html`<u style=${{ width: pc(o.proj) }}></u>`}<i style=${{ width: pc(o.fait) }}></i></div>
          <div className="vb-z" style=${{ left: pc(o.min), width: (o.max - o.min) / sc * 100 + '%' }}></div>
        </div>
        <div className="foc-s"><span>${fq(o.fait)} faites · ${fq(o.proj)} projetées · cible ${o.min}–${o.max}</span><span>${o.freqProj}×/sem${o.sub ? ' · ' + o.sub.n + ' ' + fq(o.sub.proj) + '/' + o.sub.min : ''}${o.indir ? ' · +' + fq(o.indir) + ' indirectes' : ''}</span></div>
        <div className="foc-t">${a.txt.map((x, i) => html`<span key=${i}>${x}</span>`)}</div>
        ${a.lift && a.lift.h.length > 1 && html`<div className="mini" style=${{ borderTop: 0, padding: 0 }}><span>${a.lift.n}</span><${Spark} vals=${a.lift.h.map(x => x.e1)} /><b>${f1(a.lift.h[a.lift.h.length - 1].e1)}<small>e1RM kg</small></b></div>`}
      </div>`; })}</div>
    <${Legend} items=${[['Fait', 'var(--acc-hi)', 'box'], ['Projeté (séances restantes)', 'color-mix(in oklab, var(--acc-hi) 32%, transparent)', 'box'], ['Zone cible', 'var(--ink-2)']]} />
  <//>`;
}

function FatigueCard({ date }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), f = Apex.fatigue(S.journal, S.seances, cfg, date), j = S.journal[date] || {};
  const m = Apex.mm7(S.journal, date), poids = m ? m.v : cfg.profil.poidsDepart, ca = j.cardio || {};
  const setC = k => v => { const o = Object.assign({}, ca); if (v == null) delete o[k]; else o[k] = v; Store.patch('journal', date, { date, cardio: Object.keys(o).length ? o : null }); };
  const kc = Apex.cardioKcal(ca.min, ca.vit, ca.incl, poids);
  return html`<${Card} title="Fatigue et cardio" sub="7 derniers jours" right=${html`<${Pill} st=${f.st}>Fatigue ${f.niveau}<//>`}>
    <div className="tiles">
      <div className="tile"><span>Sommeil moyen</span><b>${f.som == null ? '–' : f1(f.som)}<small>h</small></b></div>
      <div className="tile"><span>Énergie</span><b>${f.en == null ? '–' : f1(f.en)}<small>/10</small></b></div>
      <div className="tile"><span>Force perçue</span><b>${f.fo == null ? '–' : f1(f.fo)}<small>/10</small></b></div>
      <div className="tile"><span>RPE moyen</span><b>${f.rpe == null ? '–' : f1(f.rpe)}</b></div>
    </div>
    <p className="sec" style=${{ fontSize: 13 }}>${f.why.length ? f.why.join(' · ') + '. ' : ''}${f.txt}</p>
    <hr className="hr" />
    <span className="fld-l">Cardio post-séance · tapis incliné<b>${kc > 0 ? '≈ ' + f0(kc) + ' kcal' : 'si pas sous 10k'}</b></span>
    <div className="form" style=${{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
      <${Num} id="ca-min" label="Durée" unit="min" value=${ca.min == null ? null : ca.min} onChange=${setC('min')} dec=${0} min=${0} max=${180} placeholder="15" />
      <${Num} id="ca-incl" label="Pente" unit="%" value=${ca.incl == null ? null : ca.incl} onChange=${setC('incl')} dec=${1} min=${0} max=${20} placeholder="10" />
      <${Num} id="ca-vit" label="Vitesse" unit="km/h" value=${ca.vit == null ? null : ca.vit} onChange=${setC('vit')} dec=${1} min=${0} max=${12} placeholder="5,5" />
    </div>
  <//>`;
}

function HistoCard() {
  const st = useStore(), S = st.get(), cfg = st.cfg(), exos = Apex.allExos(cfg);
  const ids = Object.keys(exos).filter(id => Apex.histoExo(S.seances, id).length > 0); const [sel, setSel] = useState('');
  const id = sel && ids.indexOf(sel) >= 0 ? sel : (((Object.keys(Apex.groupes(cfg))[0] && Apex.liftCle(S.seances, Object.keys(Apex.groupes(cfg))[0], cfg)) || {}).id || ids[0] || '');
  const h = id ? Apex.histoExo(S.seances, id) : [];
  const table = h.length ? { cols: ['Date', 'Séries (kg × rép.)', 'e1RM (kg)', 'Tonnage (kg)'], rows: h.slice().reverse().slice(0, 12).map(x => [dMid(x.date), setsTxt(x.sets), f1(x.e1), f0(x.vol)]) } : null;
  return html`<${ChartCard} cls="c12" title="Historique des charges" sub="e1RM = charge × (1 + (rép. + RIR) / 30)" table=${table}>
    ${ids.length > 0 && html`<select id="hx-sel" className="inp" aria-label="Exercice" value=${id} onChange=${e => setSel(e.target.value)}>${ids.map(k => html`<option key=${k} value=${k}>${exos[k].n}</option>`)}</select>`}
    <${LineChart} h=${200} unit=" kg" label="e1RM par séance" series=${[{ name: 'e1RM', c: 'var(--acc-hi)', type: 'line', area: true, end: true, pts: h.filter(x => x.e1 > 0).map(x => ({ d: x.date, v: x.e1 })) }]}
      empty=${html`<span><b>Aucune charge notée.</b> Démarre la séance du jour et saisis kg × répétitions × RPE : l’objectif de la séance suivante se calcule tout seul.</span>`} />
  <//>`;
}

function Training({ date, setDate }) {
  return html`<div>
    <div className="view-h"><h1>Training · ${dMid(date)}</h1><p>PPL + Upper/Lower, 5 séances. Priorité pecs, biceps, deltoïdes latéraux.</p></div>
    <div className="grid">
      <div className="c12"><${WeekBar} date=${date} setDate=${setDate} /></div>
      <${SeanceCard} date=${date} />
      <div className="c5 stack" style=${{ gap: 14, alignContent: 'start' }}>
        <${FocusCard} date=${date} />
        <${FatigueCard} date=${date} />
      </div>
      <${HistoCard} />
    </div>
  </div>`;
}

/* ---- 60-ui-analytics.js ---- */
/* ApexHQ — onglet 4 : sèche (poids, projection, bilan métabolique), adhérence, force, volume, physique. */
const POSES = [['face', 'Face'], ['profil', 'Profil'], ['dos', 'Dos']];

function SecheCard({ date }) {
  const st = useStore(), S = st.get(), cfg = st.cfg();
  const raw = Apex.serie(S.journal, 'poids'), last = raw.length ? raw[raw.length - 1].d : date;
  const m = Apex.mm7(S.journal, last), t = Apex.tendance(S.journal, last), v = Apex.verdictRythme(t), e = Apex.eta(S.journal, cfg, last), td = Apex.tdee(S.journal, cfg, last);
  const th = Apex.bilanTheorique(cfg, m ? m.v : cfg.profil.poidsDepart);
  return html`<${Card} cls="c12" title="Sèche" sub=${'Départ ' + f1(cfg.profil.poidsDepart) + ' kg le ' + dTiny(cfg.profil.dateDepart) + ' · cible ' + f1(cfg.profil.poidsCible) + ' kg'} right=${v && html`<${Pill} st=${v.st}>${v.lab}<//>`}>
    <div className="tiles">
      <div className="tile"><span>Moyenne 7 j</span><b>${m ? f1(m.v) : '–'}<small>kg</small></b><em>${m ? sgn(m.v - cfg.profil.poidsDepart) + ' kg depuis le départ' : 'aucune pesée'}</em></div>
      <div className="tile"><span>Rythme</span><b>${t ? sgn(t.pct) : '–'}<small>%/sem</small></b><em>${t ? sgn(t.dk, f2) + ' kg/sem · cible −0,5 à −1 %' : 'après 2 semaines de pesées'}</em></div>
      <div className="tile"><span>Arrivée à ${f0(cfg.profil.poidsCible)} kg</span><b>${e ? dTiny(e.date) : '–'}</b><em>${e ? 'dans ' + e.jours + ' j au rythme actuel' : 'projection indisponible'}</em></div>
      <div className="tile"><span>Dépense réelle</span><b>${td ? f0(td.tdee) : '–'}<small>kcal</small></b><em>${td ? 'apport ' + f0(td.intake) + ' · déficit ' + f0(td.deficit) : 'après 14 j de données'}</em></div>
      <div className="tile"><span>Dépense théorique</span><b>${f0(th.dej)}<small>kcal</small></b><em>Mifflin ${f0(th.mb)} × NAP ${fq(cfg.profil.nap)}</em></div>
      <div className="tile"><span>Déficit planifié</span><b>−${f0(th.def)}<small>kcal/j</small></b><em>${f0(th.pct)} % · ${f2(th.kgSem)} kg/sem · moy. ${f0(th.moy)} kcal</em></div>
    </div>
    ${v && html`<p className="sec" style=${{ fontSize: 13 }}>${v.txt}</p>`}
  <//>`;
}

function ProjectionCard({ date, win }) {
  const st = useStore(), S = st.get(), cfg = st.cfg();
  const raw = Apex.serie(S.journal, 'poids'), mm = Apex.serieMM7(S.journal), series = [{ name: 'Pesée', c: 'var(--ink-3)', type: 'dots', pts: raw }, { name: 'Moy. 7 j', c: 'var(--acc-hi)', type: 'line', area: true, end: true, pts: mm }];
  let to = null;
  if (mm.length) {
    const l = mm[mm.length - 1], t = Apex.tendance(S.journal, l.d), e = Apex.eta(S.journal, cfg, l.d);
    if (t && e && e.jours > 0) { const n = Math.min(e.jours, 84); to = Apex.addDays(l.d, n); series.push({ name: 'Projection', c: 'var(--ink-2)', type: 'dash', pts: [{ d: l.d, v: l.v }, { d: to, v: l.v + t.dk / 7 * n }] }); }
  }
  const from = win ? Apex.addDays(date, -win) : null;
  return html`<${ChartCard} cls="c7" title="Poids et projection" sub="Moyenne 7 j prolongée au rythme actuel"
    legend=${raw.length ? [['Moyenne 7 j', 'var(--acc-hi)'], ['Pesée', 'var(--ink-3)', 'dot'], ['Projection', 'var(--ink-2)', 'dash'], ['Cible', 'var(--ink-3)', 'dash']] : null}
    table=${raw.length ? { cols: ['Date', 'Pesée (kg)', 'Moy. 7 j (kg)'], rows: raw.slice().reverse().slice(0, 60).map(p => { const x = mm.find(q => q.d === p.d); return [dMid(p.d), f1(p.v), x ? f2(x.v) : '–']; }) } : null}>
    <${LineChart} h=${250} unit=" kg" from=${from} to=${to} label="Poids, moyenne 7 jours et projection vers la cible" series=${series} refs=${raw.length ? [{ v: cfg.profil.poidsCible, label: f0(cfg.profil.poidsCible) + ' kg' }] : []}
      empty=${html`<span><b>Pas encore de pesée.</b> La projection apparaît après 2 semaines de check-ins : date d’arrivée à ${f0(cfg.profil.poidsCible)} kg et dépense réelle.</span>`} />
  <//>`;
}

function ApportCard({ date, win }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), foods = Apex.allFoods(cfg);
  const from = Apex.addDays(date, -((win || 60) > 60 ? 60 : (win || 60)) + 1), data = [];
  Apex.range(from, date).forEach(d => { const j = S.journal[d], t = j ? Apex.totJour(j, foods).reel : null; if (!t) return; const c = Apex.cibleDuJour(cfg, j, d); data.push({ d, v: t.k, t: c.kcal, c: c.statut === 'salle' ? 'var(--s2)' : 'var(--s1)', name: c.statut === 'salle' ? 'salle' : 'repos', p: t.p }); });
  return html`<${ChartCard} cls="c5" title="Apport réel" sub="kcal par jour, repère = objectif du jour"
    legend=${data.length ? [['Jour de salle', 'var(--s2)', 'box'], ['Jour de repos', 'var(--s1)', 'box'], ['Objectif', 'var(--ink)']] : null}
    table=${data.length ? { cols: ['Date', 'Statut', 'Réel (kcal)', 'Objectif', 'Écart', 'Protéines (g)'], rows: data.slice().reverse().map(p => [dMid(p.d), p.name, f0(p.v), f0(p.t), sgn(p.v - p.t, f0), f0(p.p)]) } : null}>
    <${BarChart} h=${250} data=${data} unit=" kcal" label="Apport calorique réel par jour" empty=${html`<span><b>Aucun bilan réel.</b> Coche tes repas ou saisis le bilan d’hier au check-in.</span>`} />
  <//>`;
}

function AdherenceCard({ date }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(); const [n, setN] = useState(7);
  const a = Apex.adherence(S.journal, cfg, date, n), row = (lab, x, c) => html`<${Meter} label=${lab} v=${x[0]} max=${x[1] || n} c=${c} unit=${'j' + (x[1] ? ' · ' + Math.round(x[0] / x[1] * 100) + ' %' : '')} />`;
  return html`<${Card} cls="c5" title="Adhérence" sub="Jours conformes sur jours renseignés" right=${html`<${Seg} neutral label="Fenêtre d’adhérence" value=${n} onChange=${setN} options=${[[7, '7 j'], [28, '28 j']]} />`}>
    <div className="stack" style=${{ gap: 14 }}>
      ${row('Calories à ±5 %', a.kcal, 'var(--acc-hi)')}
      ${row('Protéines ≥ ' + cfg.cibles.planchers.p + ' g', a.prot, 'var(--p)')}
      ${row('Pas ≥ ' + f0(cfg.cibles.pasMin), a.pas, 'var(--g)')}
      ${row('Sommeil ≥ ' + cfg.cibles.sommeil + ' h', a.sommeil, 'var(--s1)')}
    </div>
  <//>`;
}

function ForceCard({ date, win }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), exos = Apex.allExos(cfg), from = win ? Apex.addDays(date, -win) : '';
  const GR = Apex.groupes(cfg), COLS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'], series = [], rows = [], legend = [];
  Object.keys(GR).slice(0, 4).forEach((k, i) => { const lk = Apex.liftCle(S.seances, k, cfg); if (!lk) return; const h = lk.h.filter(x => x.e1 > 0 && x.date >= from); if (!h.length) return; const b = h[0].e1, nm = GR[k].n, col = COLS[i], lab = nm + ' · ' + (exos[lk.id] ? exos[lk.id].n : lk.id);
    series.push({ name: lab, c: col, type: 'line', pts: h.map(x => ({ d: x.date, v: x.e1 / b * 100 })) }); legend.push([lab, col]);
    const l = h[h.length - 1], m = Apex.mm7(S.journal, l.date); rows.push([nm, exos[lk.id] ? exos[lk.id].n : lk.id, f1(b), f1(l.e1), sgn((l.e1 / b - 1) * 100) + ' %', m ? f2(l.e1 / m.v) : '–']); });
  return html`<${ChartCard} cls="c7" title="Progression de force" sub="e1RM en base 100 à la 1re séance de la période" legend=${legend.length ? legend : null}
    table=${rows.length ? { cols: ['Piste', 'Mouvement', 'e1RM départ', 'e1RM actuel', 'Évolution', 'e1RM / poids'], rows } : null}>
    <${LineChart} h=${250} fmt=${f0} from=${from || null} label="Progression de force en base 100" series=${series} refs=${series.length ? [{ v: 100, label: '100' }] : []}
      empty=${html`<span><b>Pas encore de séance notée.</b> En sèche, tenir sa force = garder son muscle. Chaque piste suit le mouvement clé d’un point faible.</span>`} />
  <//>`;
}

function VolumeCard({ date }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), exos = Apex.allExos(cfg), l0 = Apex.lundi(date), weeks = [];
  for (let i = 5; i >= 0; i--) weeks.push(Apex.addDays(l0, -7 * i));
  const any = Object.keys(S.seances).length > 0, GRP = Apex.groupes(cfg);
  return html`<${Card} cls="c12" title="Volume hebdo des points faibles" sub="Séries directes par semaine, repère = minimum visé">
    ${any && Object.keys(GRP).length ? html`<div className="grid" style=${{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>${Object.keys(GRP).map(k => { const G = GRP[k];
      const data = weeks.map(w => { const v = Apex.volumeEntre(S.seances, w, Apex.addDays(w, 6), exos).vol; return { d: w, v: G.m.reduce((s, m) => s + (v[m] || 0), 0), t: G.min, name: 'semaine du ' + dTiny(w) }; });
      return html`<div key=${k} className="stack"><span className="fld-l">${G.n}<b>${G.min}–${G.max} séries</b></span><${BarChart} h=${150} data=${data} unit=" séries" tName="Minimum" label=${'Volume hebdomadaire ' + G.n} /></div>`; })}</div>`
    : html`<div className="empty"><span>${Object.keys(GRP).length ? html`<b>Aucune séance notée.</b> Cibles hebdo : ${Object.keys(GRP).map(k => GRP[k].n + ' ' + GRP[k].min + '–' + GRP[k].max).join(', ')}.` : html`<b>Aucun point faible défini.</b> Ajoute-en dans Réglages, onglet Points faibles.`}</span></div>`}
  <//>`;
}

function downscale(file, max, q) {
  return new Promise((ok, ko) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => (b ? ok(b) : ko(new Error('encode'))), 'image/jpeg', q); };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('decode')); };
    img.src = url;
  });
}
const PhotoDB = (() => {
  const open = () => new Promise((ok, ko) => { const r = indexedDB.open('apexhq-photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  const tx = (mode, fn) => open().then(db => new Promise((ok, ko) => { const t = db.transaction('p', mode), q = fn(t.objectStore('p')); t.oncomplete = () => { db.close(); ok(q && q.result); }; t.onerror = () => ko(t.error); t.onabort = () => ko(t.error); }));
  return { put: (id, blob) => tx('readwrite', s => s.put(blob, id)), get: id => tx('readonly', s => s.get(id)), del: id => tx('readwrite', s => s.delete(id)) };
})();
const isLocalPhoto = p => String(p.asset).indexOf('local:') === 0;
function PhotoImg({ p, alt }) {
  const [src, setSrc] = useState(isLocalPhoto(p) ? '' : '/_blob/' + p.asset);
  useEffect(() => {
    if (!isLocalPhoto(p)) { setSrc('/_blob/' + p.asset); return undefined; }
    let u = '', on = true; PhotoDB.get(p.id).then(b => { if (on && b) { u = URL.createObjectURL(b); setSrc(u); } }).catch(() => {});
    return () => { on = false; if (u) URL.revokeObjectURL(u); };
  }, [p.asset, p.id]);
  return src ? html`<img src=${src} alt=${alt} loading="lazy" />` : html`<span>Photo indisponible</span>`;
}
function PhotosCard({ date }) {
  const st = useStore(), S = st.get(), assets = st.caps().assets, local = !assets && STANDALONE, canUp = !!assets || local; const [pose, setPose] = useState('face'); const [busy, setBusy] = useState(''); const [ab, setAb] = useState({ a: '', b: '' });
  const all = Object.keys(S.photos).map(k => Object.assign({ id: k }, S.photos[k])).filter(p => p.asset && p.pose === pose).sort((x, y) => (x.date < y.date ? -1 : 1));
  const A = all.find(p => p.date === ab.a) || all[0], B = all.find(p => p.date === ab.b) || all[all.length - 1];
  const up = async e => {
    const file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file || !canUp) return;
    setBusy('Envoi…');
    try {
      const id = date + '-' + pose, blob = await downscale(file, local ? 1280 : 1600, 0.86);
      if (local) { await PhotoDB.put(id, blob); Store.patch('photos', id, { date, pose, asset: 'local:' + id }); }
      else { const res = await assets.upload(blob, { type: 'image/jpeg' }), old = (Store.get().photos[id] || {}).asset; Store.patch('photos', id, { date, pose, asset: res.id }); if (old && old !== res.id && !String(old).startsWith('local:')) assets.delete(old).catch(() => {}); }
      setBusy(''); toast('Photo ' + pose + ' du ' + dTiny(date) + ' ajoutée');
    } catch (er) { const c = er && er.code; setBusy(c === 'too_large' ? 'Fichier trop lourd.' : c === 'quota_or_state' ? 'Stockage plein : supprime d’anciennes photos.' : c === 'unsupported_type' || (er && er.message === 'decode') ? 'Format non lisible. Utilise un JPEG ou un PNG.' : 'Envoi impossible. Réessaie.'); }
  };
  const del = p => { Store.del('photos', p.id); if (isLocalPhoto(p)) PhotoDB.del(p.id).catch(() => {}); else if (assets) assets.delete(p.asset).catch(() => {}); toast('Photo supprimée'); };
  const fig = (p, lab) => html`<figure className="ph">${p ? html`<${PhotoImg} p=${p} alt=${'Physique ' + pose + ' du ' + dTiny(p.date)} />` : html`<span>${lab}</span>`}${p && html`<figcaption>${dMid(p.date)}${(() => { const m = Apex.mm7(S.journal, p.date); return m ? ' · ' + f1(m.v) + ' kg' : ''; })()}</figcaption>`}</figure>`;
  return html`<${Card} cls="c7" title="Physique" sub="Même pose, même lumière, à jeun" right=${html`<${Seg} neutral label="Pose" value=${pose} onChange=${setPose} options=${POSES} />`}>
    ${all.length ? html`<div className="cmp">${fig(A, 'Avant')}${fig(all.length > 1 ? B : null, 'Prochaine série')}</div>` : html`<div className="empty"><span><b>Aucune photo ${pose}.</b> Première série le jour photos : face, profil, dos. Le comparatif avant / après s’affiche dès 2 dates.</span></div>`}
    ${all.length > 1 && html`<div className="form">
      <label className="fld" htmlFor="ph-a"><span className="fld-l">Avant</span><select id="ph-a" className="inp" value=${A.date} onChange=${e => setAb(Object.assign({}, ab, { a: e.target.value }))}>${all.map(p => html`<option key=${p.id} value=${p.date}>${dMid(p.date)}</option>`)}</select></label>
      <label className="fld" htmlFor="ph-b"><span className="fld-l">Après</span><select id="ph-b" className="inp" value=${B.date} onChange=${e => setAb(Object.assign({}, ab, { b: e.target.value }))}>${all.map(p => html`<option key=${p.id} value=${p.date}>${dMid(p.date)}</option>`)}</select></label>
    </div>`}
    ${canUp ? html`<div className="row">
      <label className="btn pri grow" htmlFor="ph-up"><${Icon} n="camera" s=${18} />Ajouter la photo ${pose} du ${dTiny(date)}</label>
      <input id="ph-up" className="sr" type="file" accept="image/jpeg,image/png,image/webp" onChange=${up} />
      ${all.some(p => p.date === date) && html`<${Confirm} label="Supprimer celle du jour" sure="Supprimer ?" icon="trash" onYes=${() => del(all.find(p => p.date === date))} />`}
    </div>` : html`<div className="note"><${Icon} n="info" /><div><span>L’ajout de photos n’est pas disponible dans cette vue. Envoie-les dans la conversation pour l’analyse visuelle.</span></div></div>`}
    ${busy && html`<p className="sec" style=${{ fontSize: 13 }} role="status">${busy}</p>`}
    <p className="mut" style=${{ fontSize: 12 }}>${local ? 'Les photos restent sur ce téléphone et ne sont pas incluses dans l’export JSON.' : 'Les photos restent dans l’espace privé de cet artifact.'} Planning : 1 série face, profil, dos par semaine.</p>
  <//>`;
}

function CoachCard({ date }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), sample = st.caps().sample, foods = Apex.allFoods(cfg);
  const [out, setOut] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const ctl = useRef(null);
  useEffect(() => () => { if (ctl.current) ctl.current.abort(); }, []);
  if (!sample) return null;
  const run = async () => {
    const jours = Apex.range(Apex.addDays(date, -13), date).map(d => { const j = S.journal[d]; if (!j) return null; const t = Apex.totJour(j, foods).reel, c = Apex.cibleDuJour(cfg, j, d);
      return [d, c.statut, 'cible ' + c.kcal, t ? 'réel ' + Math.round(t.k) + ' kcal P' + Math.round(t.p) + ' G' + Math.round(t.g) + ' L' + Math.round(t.l) : 'réel ?', 'poids ' + (j.poids == null ? '?' : j.poids), 'pas ' + (j.pas == null ? '?' : j.pas), 'sommeil ' + (j.sommeil == null ? '?' : j.sommeil), 'énergie ' + (j.energie == null ? '?' : j.energie), 'force ' + (j.force == null ? '?' : j.force)].join(' | '); }).filter(Boolean);
    const t = Apex.tendance(S.journal, date), fo = Apex.alertesFocus(S.seances, S.journal, cfg, date), fa = Apex.fatigue(S.journal, S.seances, cfg, date);
    const prompt = 'Tu es diététicien et préparateur physique. Analyse cette sèche. Style : factuel, chiffré, aucune motivation, aucune formule de politesse.\n'
      + 'Profil : homme ' + cfg.profil.age + ' ans, ' + cfg.profil.taille + ' cm, départ ' + cfg.profil.poidsDepart + ' kg, cible ' + cfg.profil.poidsCible + ' kg. Cibles : salle ' + cfg.cibles.salle.kcal + ' kcal, repos ' + cfg.cibles.repos.kcal + ' kcal, protéines ' + cfg.cibles.salle.p + ' g, planchers ' + cfg.cibles.planchers.kcal + ' kcal / ' + cfg.cibles.planchers.p + ' g protéines / ' + cfg.cibles.planchers.l + ' g lipides. Rythme visé −0,5 à −1 %/sem.\n'
      + 'Tendance poids : ' + (t ? t.dk.toFixed(2) + ' kg/sem (' + t.pct.toFixed(2) + ' %)' : 'insuffisant') + '.\n'
      + 'Points faibles (séries directes semaine) : ' + fo.map(a => a.n + ' ' + a.o.fait + ' faites / ' + a.o.proj + ' projetées (cible ' + a.o.min + '-' + a.o.max + ')' + (a.lift && a.lift.t ? ', ' + a.lift.n + ' ' + a.lift.t.pct.toFixed(1) + ' %' : '')).join(' ; ') + '.\n'
      + 'Fatigue : ' + fa.niveau + (fa.why.length ? ' (' + fa.why.join(', ') + ')' : '') + '.\n'
      + '14 derniers jours :\n' + (jours.join('\n') || 'aucune donnée') + '\n\n'
      + 'Réponds en français, texte brut sans Markdown, 8 lignes maximum : 1) Verdict : vert, orange ou rouge + raison. 2) Trois constats chiffrés. 3) Un à trois ajustements chiffrés, jamais sous les planchers. Si les données sont insuffisantes, dis lesquelles manquent.';
    if (ctl.current) ctl.current.abort(); ctl.current = new AbortController(); setBusy(true); setErr(''); setOut('');
    try { const r = await sample(prompt, { signal: ctl.current.signal, cache: false, onText: u => setOut(u.text) }); setOut(r.text); }
    catch (e) { if (e && e.code === 'cancelled') { setOut(e.text || ''); } else { setErr(aiErr(e)); if (!e || e.code === 'refused') setOut(''); else if (e.text) setOut(e.text); } }
    setBusy(false);
  };
  return html`<${Card} cls="c5" title="Bilan coach" sub="Analyse des 14 derniers jours par Claude">
    ${out ? html`<div className="pre" aria-live="polite">${out}</div>` : html`<div className="empty"><span>Verdict, constats chiffrés et ajustements à partir de tes données. Compte dans ton usage Claude.</span></div>`}
    ${err && html`<div className="note"><${Icon} n="alert" /><div><span>${err}</span></div></div>`}
    <div className="row">
      <button type="button" className="btn pri grow" disabled=${busy} onClick=${run}><${Icon} n="sparkles" s=${18} />${busy ? 'Analyse…' : out ? 'Relancer le bilan' : 'Générer le bilan'}</button>
      ${busy && html`<button type="button" className="btn" onClick=${() => ctl.current && ctl.current.abort()}>Arrêter</button>`}
    </div>
  <//>`;
}

function Analytics({ date }) {
  const [win, setWin] = useState(90);
  return html`<div>
    <div className="view-h"><h1>Analyse</h1>
      <${Seg} neutral label="Période des graphiques" value=${win} onChange=${setWin} options=${[[30, '30 j'], [90, '90 j'], [0, 'Tout']]} /></div>
    <div className="grid">
      <${SecheCard} date=${date} />
      <${ProjectionCard} date=${date} win=${win} />
      <${ApportCard} date=${date} win=${win} />
      <${ForceCard} date=${date} win=${win} />
      <${AdherenceCard} date=${date} />
      <${VolumeCard} date=${date} />
      <${PhotosCard} date=${date} />
      <${CoachCard} date=${date} />
    </div>
  </div>`;
}

/* ---- 63-ui-scan.js ---- */
/* ApexHQ — scan de code-barres (app autonome) : caméra + Open Food Facts.
   La caméra et l'accès à Open Food Facts ne sont pas permis dans la version Claude (sandbox) : le bouton n'y apparaît pas. */
const CAN_SCAN = !!window.APEX_STANDALONE;
const r1 = v => Math.round(v * 10) / 10;

async function offLookup(code) {
  const c = String(code).replace(/\D/g, ''); if (c.length < 8 || c.length > 14) throw new Error('code');
  const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + c + '.json?fields=product_name,brands,nutriments,serving_quantity', { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('http');
  const j = await r.json(); if (!j || j.status !== 1 || !j.product) return null;
  const p = j.product, nu = p.nutriments || {}, g = k => (typeof nu[k + '_100g'] === 'number' ? nu[k + '_100g'] : null);
  let kcal = g('energy-kcal'); if (kcal == null && g('energy') != null) kcal = g('energy') / 4.184;
  const name = [p.brands ? String(p.brands).split(',')[0].trim() : '', p.product_name || ''].filter(Boolean).join(' ').slice(0, 60) || 'Produit ' + c, dose = Number(p.serving_quantity);
  return { n: name, k: kcal == null ? null : Math.round(kcal), p: r1(g('proteins') || 0), g: r1(g('carbohydrates') || 0), l: r1(g('fat') || 0), f: r1(g('fiber') || 0), dose: dose > 0 && dose <= 200 ? Math.round(dose) : null, code: c };
}
const roleDe = p => (p.p >= 15 ? 'P' : p.g >= 40 ? 'G' : p.l >= 30 ? 'L' : '');
/* Produit scanné → aliment de ma base (valeurs pour 100 g, portion si connue). Renvoie son id. */
function ajouterProduit(p) {
  const id = 'u_' + Apex.uid(), f = { id, n: p.n, c: 'perso', r: roleDe(p), k: p.k || 0, p: p.p || 0, g: p.g || 0, l: p.l || 0, f: p.f || 0, d: p.dose ? 1 : 100, u: p.dose ? ['portion ' + p.dose + ' g', p.dose] : null, etq: 0 };
  Store.patch('cfg', null, { aliments: Object.assign({}, Store.cfg().aliments, { [id]: f }) }); return id;
}

function ScanSheet({ title, onProduct, onClose }) {
  const vid = useRef(null); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [cam, setCam] = useState('');
  const done = useRef(false);
  const lookup = async c => {
    if (done.current) return; setBusy(true); setErr('');
    try {
      const p = await offLookup(c);
      if (!p) { setErr('Produit introuvable dans Open Food Facts. Saisis les valeurs à la main.'); setBusy(false); return; }
      if (p.k == null) { setErr('Valeurs nutritionnelles absentes pour ce produit. Saisis-les à la main.'); setBusy(false); return; }
      done.current = true; onProduct(p); onClose();
    } catch (e) { setErr(e && e.message === 'code' ? 'Code-barres invalide (8 à 14 chiffres).' : 'Recherche impossible : vérifie ta connexion.'); setBusy(false); }
  };
  useEffect(() => {
    if (typeof BarcodeDetector === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setCam('Scan caméra non pris en charge sur cet appareil : saisis le numéro sous le code-barres.'); return undefined; }
    let stream = null, stop = false, timer = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stop) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = vid.current; v.srcObject = stream; await v.play();
        const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        const tick = async () => { if (stop) return; try { const r = await det.detect(v); if (r && r[0] && r[0].rawValue) { stop = true; lookup(r[0].rawValue); return; } } catch (e) { /* image pas prête */ } timer = setTimeout(tick, 350); };
        tick(); setCam('Vise le code-barres, bien éclairé.');
      } catch (e) { setCam('Caméra refusée ou indisponible : saisis le numéro sous le code-barres.'); }
    })();
    return () => { stop = true; clearTimeout(timer); if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, []);
  return html`<${Sheet} title=${title || 'Scanner un produit'} onClose=${onClose}>
    <video ref=${vid} className="scan-v" playsInline muted></video>
    ${cam && html`<p className="sec" style=${{ fontSize: 13 }} role="status">${cam}</p>`}
    <label className="fld" htmlFor="scan-code"><span className="fld-l">Ou le numéro du code-barres</span>
      <input id="scan-code" className="inp" type="text" inputMode="numeric" maxLength="14" placeholder="3017620422003" value=${code} onChange=${e => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown=${e => { if (e.key === 'Enter' && code) lookup(code); }} /></label>
    <button type="button" className="btn pri wide" disabled=${busy || code.length < 8} onClick=${() => lookup(code)}>${busy ? 'Recherche…' : 'Chercher le produit'}</button>
    ${err && html`<div className="note"><${Icon} n="alert" /><div><span>${err}</span></div></div>`}
    <p className="mut" style=${{ fontSize: 12 }}>Recherche dans Open Food Facts (base collaborative) : seul le numéro du code-barres est envoyé. Vérifie les valeurs avec l’étiquette.</p>
  <//>`;
}

/* ---- 64-ui-adapt.js ---- */
/* ApexHQ — séance du jour modifiable, adaptation en un geste (temps, matériel, priorité, forme), semaine selon les dispos.
   Avec une IA connectée : séance optimisée + conseils. Sans IA : même adaptation par l'algorithme de l'app. */
const lsGet = (k, d) => { try { return localStorage.getItem('apexhq:' + k) || d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('apexhq:' + k, String(v)); } catch (e) { /* préférence non mémorisée */ } };
const JOURS_C = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Jeu'], [5, 'Ven'], [6, 'Sam'], [0, 'Dim']];
const MINS = [30, 45, 60, 75, 90];

function Dispos({ min, setMin, eq, setEq, foc, setFoc, groupes }) {
  return html`<div className="stack" style=${{ gap: 14 }}>
    <div className="stack"><span className="fld-l">Temps disponible</span><div className="chips">${MINS.map(m => html`<button key=${m} type="button" className="chip" aria-pressed=${min === m} onClick=${() => setMin(m)}>${m} min</button>`)}</div></div>
    <div className="stack"><span className="fld-l">Matériel</span><div className="chips">${Apex.EQUIP.map(x => html`<button key=${x[0]} type="button" className="chip" aria-pressed=${eq === x[0]} onClick=${() => setEq(x[0])}>${x[1]}</button>`)}</div></div>
    ${setFoc && html`<div className="stack"><span className="fld-l">Priorité du jour</span><div className="chips">
      <button type="button" className="chip" aria-pressed=${foc.length === 0} onClick=${() => setFoc([])}>Équilibrée</button>
      ${groupes.map(g => html`<button key=${g.id} type="button" className="chip" aria-pressed=${foc.indexOf(g.id) >= 0} onClick=${() => setFoc(foc.indexOf(g.id) >= 0 ? foc.filter(x => x !== g.id) : foc.concat(g.id))}>${g.n}</button>`)}</div></div>`}
  </div>`;
}

function AdaptSheet({ date, plan, type, onApply, onClose }) {
  const st = useStore(), cfg = st.cfg(), S = st.get(), j = S.journal[date] || {}, sample = st.caps().sample, exos = Apex.allExos(cfg), GR = Object.values(Apex.groupes(cfg));
  const [min, setMin] = useState(() => +lsGet('ad:min', (cfg.q && cfg.q.duree) || 60)); const [eq, setEq] = useState(() => lsGet('ad:eq', 'salle')); const [foc, setFoc] = useState([]);
  const [more, setMore] = useState(false); const [dou, setDou] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState(null);
  const forme = Apex.num(j.energie) ? j.energie : null;
  const run = async () => {
    lsSet('ad:min', min); lsSet('ad:eq', eq); setBusy(true); setRes(null);
    const app = Apex.adapterSeance({ plan, minutes: min, equip: eq, focus: foc, cfg, forme, douleurs: dou });
    if (!sample) { setRes(Object.assign({ src: 'app' }, app)); setBusy(false); return; }
    try {
      const fs = Apex.focusSemaine(S.seances, S.journal, cfg, date), fa = Apex.fatigue(S.journal, S.seances, cfg, date), q = cfg.q || {};
      const cat = Object.keys(exos).filter(id => Apex.eqOk(eq, exos[id])).map(id => id + '=' + exos[id].n + ' (' + (Apex.MUSCLES[exos[id].m] || exos[id].m) + ')').join('; ');
      const prompt = ['Tu es préparateur physique. Conçois la séance de musculation d’aujourd’hui pour cette personne.',
        'Profil : ' + (cfg.profil.sexe === 'F' ? 'femme' : 'homme') + ', ' + cfg.profil.age + ' ans, niveau ' + (q.niveau || 'intermédiaire') + ', objectif ' + (q.objectif || 'sèche') + '.',
        'Séance prévue (' + type + ') : ' + plan.map(x => (exos[x.e] ? exos[x.e].n : x.e) + ' ' + x.n + '×').join(', ') + '.',
        'Temps disponible : ' + min + ' minutes, échauffement inclus (compte 2,2 à 3 minutes par série). Matériel : ' + (Apex.EQUIP.find(x => x[0] === eq) || [])[1] + '.',
        'Forme du jour : énergie ' + (forme == null ? 'inconnue' : forme + '/10') + (j.force != null ? ', force perçue ' + j.force + '/10' : '') + '. Fatigue de la semaine : ' + fa.niveau + '.',
        dou ? 'Zones sensibles à ménager : ' + dou + '.' : '', note ? 'Remarque : ' + note + '.' : '',
        foc.length ? 'Priorité du jour : ' + GR.filter(g => foc.indexOf(g.id) >= 0).map(g => g.n).join(', ') + '.' : '',
        'Points faibles, séries déjà faites cette semaine sur la cible : ' + (Object.keys(fs).map(k => fs[k].n + ' ' + Math.round(fs[k].fait) + '/' + fs[k].min).join(' ; ') || 'aucun') + '.',
        'Exercices autorisés (id=nom) : ' + cat + '.',
        'Règles : 4 à 8 exercices, mouvements lourds d’abord, 2 à 5 séries chacun, le total tient dans le temps, priorité aux points faibles en retard, ne sollicite pas les zones sensibles.',
        'Réponds uniquement par un objet JSON : {"exercices":[{"id":"di_halt","series":4}],"conseils":["trois conseils courts et concrets : échauffement, charge ou tempo, progression"],"duree_min":55}.'].filter(Boolean).join('\n');
      const r = await Promise.race([sample.json(prompt, { modelTier: 'default', cache: false }), new Promise((_, ko) => setTimeout(() => ko({ code: 'upstream_error' }), 90000))]);
      const v = Apex.validerSeanceIA(r, { cfg, equip: eq, minutes: min, douleurs: dou });
      if (v) setRes({ src: 'ia', plan: v.plan, duree: v.duree, notes: v.notes.concat(app.notes.filter(n => n.indexOf('zone sensible') >= 0)) });
      else setRes(Object.assign({ src: 'app', warn: 'La proposition de l’IA ne respectait pas le temps ou le matériel : séance adaptée par l’app.' }, app));
    } catch (e) { setRes(Object.assign({ src: 'app', warn: aiMsg(e) || 'IA indisponible : séance adaptée par l’app.' }, app)); }
    setBusy(false);
  };
  return html`<${Sheet} title="Adapter ma séance" onClose=${onClose}>
    ${!res ? html`<${React.Fragment}>
      <p className="sec" style=${{ fontSize: 13 }}>Dis ce que tu as aujourd’hui, l’app réorganise la séance ${sample ? 'avec l’IA' : ''} en gardant tes points faibles.</p>
      <${Dispos} min=${min} setMin=${setMin} eq=${eq} setEq=${setEq} foc=${foc} setFoc=${setFoc} groupes=${GR} />
      <button type="button" className="chip" style=${{ justifySelf: 'start' }} aria-pressed=${more} onClick=${() => setMore(!more)}>${more ? 'Moins d’options' : 'Une gêne ou une remarque ?'}</button>
      ${more && html`<div className="stack">
        <label className="fld" htmlFor="ad-dou"><span className="fld-l">Zone sensible</span><input id="ad-dou" className="inp" type="text" maxLength="80" placeholder="ex. épaule droite, genou" value=${dou} onChange=${e => setDou(e.target.value)} /></label>
        ${sample && html`<label className="fld" htmlFor="ad-note"><span className="fld-l">Remarque pour l’IA</span><input id="ad-note" className="inp" type="text" maxLength="120" placeholder="ex. je veux finir par des bras" value=${note} onChange=${e => setNote(e.target.value)} /></label>`}</div>`}
      <button type="button" className="btn pri wide" disabled=${busy} onClick=${run}><${Icon} n="sparkles" s=${18} />${busy ? (sample ? 'L’IA optimise ta séance…' : 'Adaptation…') : (sample ? 'Optimiser avec l’IA' : 'Adapter la séance')}</button>
      ${!sample && html`<p className="mut" style=${{ fontSize: 12 }}>Sans IA connectée, l’adaptation suit les règles de l’app (temps, matériel, priorité). Connecte une IA dans Réglages pour des conseils personnalisés.</p>`}
    <//>` : html`<${React.Fragment}>
      <div className="row sb"><${Pill} st=${res.src === 'ia' ? 'good' : ''}>${res.src === 'ia' ? 'Optimisée par l’IA' : 'Adaptée par l’app'}<//><span className="mut">≈ ${res.duree} min · ${res.plan.reduce((s, x) => s + x.n, 0)} séries</span></div>
      <div className="rows">${res.plan.map(x => html`<div key=${x.e} className="mini"><span>${exos[x.e] ? exos[x.e].n : x.e}</span><span className="mut">${exos[x.e] ? Apex.MUSCLES[exos[x.e].m] : ''}</span><b>${x.n}<small>séries</small></b></div>`)}</div>
      ${res.warn && html`<div className="note"><${Icon} n="alert" /><div><span>${res.warn}</span></div></div>`}
      ${res.notes.length > 0 && html`<div className="note acc"><${Icon} n="sparkles" /><div>${res.notes.map((n, i) => html`<span key=${i}>${n}</span>`)}</div></div>`}
      <div className="row"><button type="button" className="btn pri grow" onClick=${() => { onApply({ plan: res.plan, src: res.src, notes: res.notes, duree: res.duree }); onClose(); }}><${Icon} n="check" s=${18} />Appliquer</button>
        <button type="button" className="btn" onClick=${() => setRes(null)}>Modifier</button></div>
    <//>`}
  <//>`;
}

function DayPlan({ date }) {
  const st = useStore(), S = st.get(), cfg = st.cfg(), exos = Apex.allExos(cfg), j = S.journal[date] || {};
  const type = Apex.seanceDuJour(cfg, j, date), types = Apex.types(cfg), libre = types.indexOf(type) < 0;
  const base = (Apex.progOf(cfg)[type] || []).map(x => ({ e: x[0], n: x[1] })), custom = Array.isArray(j.plan), plan = custom ? j.plan : base, nb = j.planNote;
  const [sheet, setSheet] = useState(null);
  const put = arr => Store.patch('journal', date, { date, plan: arr });
  const setType = t => Store.patch('journal', date, { date, statut: 'salle', seance: t, plan: null, planNote: null });
  const upd = (i, f) => put(plan.map((x, k) => (k === i ? Object.assign({}, x, f) : x)));
  const start = () => {
    const f = { date, type, debut: new Date().toISOString(), exos: plan.map(x => ({ e: x.e, sets: Array.from({ length: x.n }, () => ({})) })) };
    if (nb && nb.notes && nb.notes.length) f.note = nb.notes.join(' ');
    Store.patch('seances', date, f); toast('Séance ' + (libre ? 'libre' : type) + ' ouverte');
  };
  const dur = Apex.dureeSeance(plan, exos), sets = plan.reduce((s, x) => s + x.n, 0), swapEx = sheet && sheet.t === 'swap' ? plan[sheet.i] : null;
  return html`<${Card} cls="c7" title=${'Séance ' + (libre ? 'libre' : type)} sub=${dMid(date) + ' · double progression, RPE 8–9'}>
    <div className="chips" role="group" aria-label="Type de séance">${types.map(t => html`<button key=${t} type="button" className="chip" aria-pressed=${type === t} onClick=${() => setType(t)}>${t}</button>`)}
      <button type="button" className="chip" aria-pressed=${libre} onClick=${() => Store.patch('journal', date, { date, statut: 'salle', seance: 'Libre', plan: [], planNote: null })}>Libre</button></div>
    ${nb && html`<div className="note acc"><${Icon} n="sparkles" /><div>
      <div className="row sb"><b>${nb.src === 'ia' ? 'Conseils de l’IA' : 'Séance adaptée'}</b><${Confirm} label="Programme d’origine" sure="Revenir ?" cls="ghost sm" onYes=${() => Store.patch('journal', date, { date, plan: null, planNote: null })} /></div>
      ${(nb.notes || []).map((n, i) => html`<span key=${i}>${n}</span>`)}</div></div>`}
    ${plan.length ? html`<div className="dp">${plan.map((x, i) => { const e = exos[x.e] || { n: x.e, m: '', lo: 8, hi: 12, inc: 2.5 }, h = Apex.histoExo(S.seances, x.e).filter(q => q.date < date), o = Apex.objectif(e, h.length ? h[h.length - 1] : null);
      return html`<div key=${x.e + '-' + i} className="dp-row">
        <div className="dp-n"><b>${e.n}${fl(e) && html`<span className="badge">${fl(e)}</span>`}</b><span>${o.txt}</span></div>
        <div className="dp-c">
          <button type="button" className="ib sm" aria-label=${'Moins de séries : ' + e.n} onClick=${() => upd(i, { n: Math.max(1, x.n - 1) })}><${Icon} n="minus" s=${16} /></button>
          <b className="num">${x.n}</b>
          <button type="button" className="ib sm" aria-label=${'Plus de séries : ' + e.n} onClick=${() => upd(i, { n: Math.min(10, x.n + 1) })}><${Icon} n="plus" s=${16} /></button>
          <button type="button" className="ib sm" aria-label=${'Remplacer : ' + e.n} onClick=${() => setSheet({ t: 'swap', i })}><${Icon} n="swap" s=${16} /></button>
          <button type="button" className="ib sm" aria-label=${'Retirer : ' + e.n} onClick=${() => put(plan.filter((_, k) => k !== i))}><${Icon} n="x" s=${16} /></button>
        </div></div>`; })}</div>` : html`<div className="empty"><span><b>Séance vide.</b> Ajoute des exercices, ou laisse l’IA te proposer une séance.</span></div>`}
    <div className="tiles"><div className="tile"><span>Durée estimée</span><b>${dur}<small>min</small></b></div><div className="tile"><span>Séries</span><b>${sets}</b></div><div className="tile"><span>Exercices</span><b>${plan.length}</b></div></div>
    <div className="row"><button type="button" className="btn grow" onClick=${() => setSheet({ t: 'add' })}><${Icon} n="plus" s=${18} />Exercice</button>
      <button type="button" className="btn grow" onClick=${() => setSheet({ t: 'adapt' })}><${Icon} n="sparkles" s=${18} />${st.caps().sample ? 'Optimiser avec l’IA' : 'Adapter'}</button></div>
    <button type="button" className="btn pri wide" disabled=${!plan.length} onClick=${start}><${Icon} n="dumbbell" s=${18} />Démarrer la séance</button>
    ${sheet && sheet.t === 'add' && html`<${ExoSheet} exos=${exos} title="Ajouter un exercice" onClose=${() => setSheet(null)} onPick=${id => put(plan.concat({ e: id, n: 3 }))} />`}
    ${swapEx && html`<${ExoSheet} exos=${exos} title=${'Remplacer · ' + ((exos[swapEx.e] || {}).n || '')} muscle=${(exos[swapEx.e] || {}).m} onClose=${() => setSheet(null)} onPick=${id => upd(sheet.i, { e: id })} />`}
    ${sheet && sheet.t === 'adapt' && html`<${AdaptSheet} date=${date} plan=${plan} type=${libre ? 'libre' : type} onClose=${() => setSheet(null)} onApply=${r => Store.patch('journal', date, { date, plan: r.plan, planNote: { src: r.src, notes: r.notes, duree: r.duree } })} />`}
  <//>`;
}

/* Semaine selon les disponibilités : jours, temps, matériel → programme et planning. */
function WeekSheet({ onClose }) {
  const st = useStore(), cfg = st.cfg(), sample = st.caps().sample, GR = Object.values(Apex.groupes(cfg));
  const cur = JOURS_C.map(d => d[0]).filter(d => cfg.planning[d] && Apex.types(cfg).indexOf(cfg.planning[d]) >= 0);
  const [jours, setJours] = useState(() => (cur.length ? cur : [1, 3, 5])); const [min, setMin] = useState(() => +lsGet('wk:min', (cfg.q && cfg.q.duree) || 60)); const [eq, setEq] = useState(() => lsGet('wk:eq', 'salle'));
  const [busy, setBusy] = useState(false); const [res, setRes] = useState(null);
  const tog = d => setJours(j => (j.indexOf(d) >= 0 ? j.filter(x => x !== d) : j.concat(d)));
  const run = async () => {
    if (!jours.length) return; lsSet('wk:min', min); lsSet('wk:eq', eq); setBusy(true); setRes(null);
    const q = Object.assign({ objectif: 'seche', niveau: 'intermediaire', age: cfg.profil.age, poids: cfg.profil.poidsDepart, sexe: cfg.profil.sexe }, cfg.q, { seances: jours.length, jours, split: Apex.splitSuggere(jours.length), duree: min, equip: eq });
    const base = Apex.genProgramme(q, GR, cfg), prog = {};
    Object.keys(base.programme).forEach(t => { prog[t] = Apex.adapterSeance({ plan: base.programme[t], minutes: min, equip: eq, focus: GR.map(g => g.id), cfg }).plan; });
    let out = { seanceTypes: base.seanceTypes, programme: prog, planning: base.planning, src: 'app' };
    if (sample) {
      try { const r = await optimiserProgramme(sample, Object.assign({}, q, { jours }), GR, cfg); if (r) out = Object.assign(r, { src: 'ia' }); } catch (e) { /* repli sur le calcul de l'app */ }
    }
    setRes(out); setBusy(false);
  };
  const apply = () => { Store.patch('cfg', null, { seanceTypes: res.seanceTypes, programme: res.programme, planning: res.planning }); toast('Semaine reconstruite'); onClose(); };
  return html`<${Sheet} title="Ma semaine selon mes dispos" onClose=${onClose}>
    ${!res ? html`<${React.Fragment}>
      <div className="stack"><span className="fld-l">Jours où tu peux t’entraîner<b>${jours.length}</b></span><div className="chips">${JOURS_C.map(d => html`<button key=${d[0]} type="button" className="chip" aria-pressed=${jours.indexOf(d[0]) >= 0} onClick=${() => tog(d[0])}>${d[1]}</button>`)}</div></div>
      <${Dispos} min=${min} setMin=${setMin} eq=${eq} setEq=${setEq} />
      <button type="button" className="btn pri wide" disabled=${busy || !jours.length} onClick=${run}><${Icon} n="sparkles" s=${18} />${busy ? (sample ? 'L’IA construit ta semaine…' : 'Calcul…') : (sample ? 'Construire avec l’IA' : 'Construire ma semaine')}</button>
      <p className="mut" style=${{ fontSize: 12 }}>Tes points faibles et ton matériel sont pris en compte. Ça remplace ton programme actuel ; tes séances déjà faites sont conservées.</p>
    <//>` : html`<${React.Fragment}>
      <div className="row sb"><${Pill} st=${res.src === 'ia' ? 'good' : ''}>${res.src === 'ia' ? 'Optimisée par l’IA' : 'Calculée par l’app'}<//></div>
      <div className="rows">${JOURS_C.map(d => { const t = res.planning[d[0]]; return html`<div key=${d[0]} className="mini"><span><b style=${{ color: 'var(--ink)', fontWeight: 500 }}>${d[1]}</b></span><span className="mut">${t ? (res.programme[t] || []).length + ' exercices' : ''}</span><b>${t || 'Repos'}</b></div>`; })}</div>
      <div className="row"><button type="button" className="btn pri grow" onClick=${apply}><${Icon} n="check" s=${18} />Appliquer</button><button type="button" className="btn" onClick=${() => setRes(null)}>Modifier</button></div>
    <//>`}
  <//>`;
}

function WeekBar({ date, setDate }) {
  const [open, setOpen] = useState(false);
  return html`<div className="stack" style=${{ gap: 10 }}><${WeekStrip} date=${date} setDate=${setDate} />
    <div className="row sb"><span className="mut" style=${{ fontSize: 12 }}>Change de séance ou adapte-la au jour.</span><button type="button" className="btn sm" onClick=${() => setOpen(true)}><${Icon} n="sparkles" s=${16} />Ma semaine selon mes dispos</button></div>
    ${open && html`<${WeekSheet} onClose=${() => setOpen(false)} />`}</div>`;
}

/* ---- 65-ui-coach.js ---- */
/* ApexHQ — onglet 5 : coach IA intégré (Claude, via la capacité sample).
   Il lit l'état du jour (envoyé dans chaque demande) et enregistre repas, check-in, séries, pas et
   mensurations avec des outils de page. Chaque écriture est affichée et annulable. */
const CHAT_LS = 'apexhq:chat:v1';
const chatLoad = () => { try { const o = JSON.parse(localStorage.getItem(CHAT_LS) || 'null'); return Array.isArray(o) ? o.filter(m => m && m.t).slice(-40) : []; } catch (e) { return []; } };
const chatSave = ms => { try { localStorage.setItem(CHAT_LS, JSON.stringify(ms.filter(m => m.t).slice(-40).map(m => ({ r: m.r, t: m.t, a: (m.a || []).map(a => ({ id: a.id, lab: a.lab, undone: !!a.undone })) })))); } catch (e) { /* historique non mémorisé */ } };

const COACH_REGLES = [
  'Tu es le coach intégré à ApexHQ, l’application de sèche de l’utilisateur : diététicien (tables Ciqual, densité nutritionnelle) et préparateur physique.',
  'Style : français, phrases courtes, chiffres, aucune motivation, aucune formule de politesse. Texte brut, sans Markdown ni tableau. 6 lignes maximum sauf demande de détail.',
  'Dès que l’utilisateur rapporte un repas, un écart, son poids, son sommeil, ses pas, son eau, des séries ou des mensurations : enregistre avec l’outil adapté, sans demander confirmation. N’invente jamais une donnée qu’il n’a pas donnée. Quantité floue : prends une portion standard et dis l’hypothèse en une ligne.',
  'Valeurs nutritionnelles : prends la base de l’app ci-dessous quand l’aliment y figure (poids cru), sinon Ciqual ou les valeurs officielles de l’enseigne. Donne des totaux pour la quantité réellement mangée.',
  'Outil ajouter_repas : remplace=true si ce qu’il a mangé REMPLACE le contenu prévu de ce repas, false s’il s’ajoute. mange=false seulement pour un repas à venir.',
  'Après un repas enregistré : total du jour face à la cible, puis le reste à manger en aliments concrets avec grammes. Si le jour dépasse la cible : utilise recaler_plan, sinon propose un lissage de 150 kcal par jour au plus. Un écart se note et se lisse, sans culpabilité, sans jeûne ni cardio punitif.',
  'Jamais sous les planchers. Ni brûleur de graisse ni diurétique. Si l’utilisateur montre restriction extrême, culpabilité, compulsions ou obsession de la balance : arrête les chiffres, réponds avec bienveillance et oriente vers un professionnel de santé.',
  'Entraînement : double progression, RPE 8 à 9, priorité pectoraux (haut), biceps, deltoïdes latéraux. En sèche on garde les charges ; volume −10 à −20 % si la récupération chute.',
  'Tu ne vois que les données ci-dessous. S’il manque une information, dis laquelle.',
].join('\n');
const COACH_SANS_OUTILS = 'Dans cette vue tu ne peux RIEN enregistrer : indique où saisir dans l’app (onglet Jour, Repas ou Training).';

function coachContexte(date) {
  const S = Store.get(), cfg = Store.cfg(), foods = Apex.allFoods(cfg), exos = Apex.allExos(cfg), r = Math.round, q = v => (v == null ? '?' : v);
  const j = S.journal[date] || {}, c = Apex.cibleDuJour(cfg, j, date), t = Apex.totJour(j, foods), hier = Apex.addDays(date, -1), jh = S.journal[hier] || {}, th = Apex.totJour(jh, foods).reel;
  const type = Apex.seanceDuJour(cfg, j, date), cons = t.man || t.eat, L = [], p = cfg.profil, auj = Apex.today();
  L.push('JOUR AFFICHÉ : ' + dLong(date) + ' (' + date + ')' + (date === auj ? ', aujourd’hui' : ' ; date réelle du jour : ' + auj) + '. Statut : ' + c.statut + (type ? ', séance ' + type : '') + '.');
  L.push('CIBLE DU JOUR : ' + c.kcal + ' kcal, P ' + c.p + ' g, G ' + c.g + ' g, L ' + c.l + ' g. Planchers : ' + cfg.cibles.planchers.kcal + ' kcal, ' + c.pMin + ' g P, ' + c.lMin + ' g L. Standard : salle ' + cfg.cibles.salle.kcal + ' kcal, repos ' + cfg.cibles.repos.kcal + ' kcal.');
  L.push('PROFIL : homme, ' + p.age + ' ans, ' + p.taille + ' cm, départ ' + p.poidsDepart + ' kg le ' + p.dateDepart + ', cible ' + p.poidsCible + ' kg. Rythme visé : −0,5 à −1 % par semaine. Baseline ' + cfg.cibles.pasMin + ' à ' + cfg.cibles.pasMax + ' pas.');
  if (cfg.q) { const q = cfg.q; L.push('QUESTIONNAIRE : objectif ' + q.objectif + (q.objectif !== 'neutre' ? ' (' + q.intensite + ')' : '') + ', niveau ' + q.niveau + ', ' + q.seances + ' séances/sem, activité ' + q.metier + ', ' + q.pas + ' pas/j, régime ' + q.regime + (q.exclus ? ', à éviter : ' + q.exclus : '') + (q.whey ? ', whey : ' + q.whey.n : ', pas de whey') + '. Compléments : ' + (Apex.supps(cfg).map(x => x.n).join(', ') || 'aucun') + '.'); }
  const meals = j.repas || [];
  L.push('REPAS DU JOUR :' + (meals.length ? '' : ' aucun repas planifié.'));
  meals.forEach(m => { const tm = Apex.totMeal(m, foods); L.push('- ' + m.nom + ' (' + (m.ok ? 'mangé' : 'prévu') + ', ' + r(tm.k) + ' kcal, P ' + r(tm.p) + ') : ' + m.items.map(it => { const f = Apex.foodOf(it, foods); return f ? f.n + ' ' + fq(it.q) + ' ' + unitOf(f) : ''; }).filter(Boolean).join(', ')); });
  L.push('TOTAUX : mangé ' + r(cons.k) + ' kcal (P ' + r(cons.p) + ', G ' + r(cons.g) + ', L ' + r(cons.l) + ')' + (t.man ? ' [bilan saisi à la main]' : '') + ' ; prévu au plan ' + r(t.plan.k) + ' kcal (P ' + r(t.plan.p) + ', G ' + r(t.plan.g) + ', L ' + r(t.plan.l) + ') ; reste à manger ' + r(c.kcal - cons.k) + ' kcal, P ' + r(c.p - cons.p) + ' g.');
  L.push('CHECK-IN DU JOUR : poids ' + q(j.poids) + ' kg, sommeil ' + q(j.sommeil) + ' h, qualité ' + q(j.sommeilQ) + '/10, réveils ' + q(j.reveils) + ', énergie ' + q(j.energie) + '/10, force ' + q(j.force) + '/10 ; pas du jour ' + q(j.pas) + ', eau ' + q(j.eau) + ' L.');
  L.push('HIER (' + hier + ') : ' + (th ? 'réel ' + r(th.k) + ' kcal, P ' + r(th.p) + ', G ' + r(th.g) + ', L ' + r(th.l) : 'bilan non saisi') + ', pas ' + q(jh.pas) + '.');
  const tr = Apex.tendance(S.journal, date), m7 = Apex.mm7(S.journal, date);
  L.push('POIDS : moyenne 7 j ' + (m7 ? m7.v.toFixed(1) + ' kg sur ' + m7.n + ' pesées' : 'aucune pesée') + ' ; rythme ' + (tr ? tr.dk.toFixed(2) + ' kg/sem (' + tr.pct.toFixed(1) + ' %)' : 'pas encore calculable') + '.');
  const lig = [];
  for (let i = 7; i >= 1; i--) { const d = Apex.addDays(date, -i), x = S.journal[d]; if (!x) continue; const tt = Apex.totJour(x, foods).reel, cc = Apex.cibleDuJour(cfg, x, d); lig.push(d + ' | ' + cc.statut + ' ' + cc.kcal + ' | ' + (tt ? r(tt.k) + ' kcal, P ' + r(tt.p) : '?') + ' | ' + q(x.poids) + ' kg | ' + q(x.pas) + ' pas | ' + q(x.sommeil) + ' h'); }
  if (lig.length) L.push('7 DERNIERS JOURS (date | statut cible | réel | poids | pas | sommeil) :\n' + lig.join('\n'));
  const fo = Apex.alertesFocus(S.seances, S.journal, cfg, date), fa = Apex.fatigue(S.journal, S.seances, cfg, date);
  L.push('POINTS FAIBLES, séries directes de la semaine : ' + fo.map(a => a.n + ' ' + fq(a.o.fait) + ' faites, ' + fq(a.o.proj) + ' projetées, cible ' + a.o.min + '-' + a.o.max + ' (' + a.tag + ')').join(' ; ') + '. Fatigue : ' + fa.niveau + '.');
  const se = S.seances[date];
  if (se || type) {
    const list = se ? (se.exos || []).map(x => [x.e, x.sets || []]) : (Apex.progOf(cfg)[type] || []).map(x => [x[0], []]);
    L.push('SÉANCE DU JOUR (' + (se ? (se.type || '') + (se.fin ? ', terminée' : ', en cours') : type + ', pas commencée') + ') :');
    list.forEach(x => { const e = exos[x[0]]; if (!e) return; const h = Apex.histoExo(S.seances, x[0]).filter(z => z.date < date), o = Apex.objectif(e, h.length ? h[h.length - 1] : null), done = x[1].filter(Apex.setFait); L.push('- ' + e.n + ' [id ' + e.id + '] objectif ' + o.txt + (done.length ? ' ; fait ' + setsTxt(done) : '')); });
  }
  L.push('BASE D’ALIMENTS DE L’APP (kcal/P/G/L pour 100 g, poids cru) : ' + Object.keys(foods).map(k => foods[k]).filter(f => f.c !== 'ecart').map(f => f.n + (f.u ? ' [1 ' + f.u[0] + ' = ' + f.u[1] + ' g]' : '') + ' ' + f.k + '/' + f.p + '/' + f.g + '/' + f.l).join(' ; ') + '.');
  return L.join('\n');
}

/* Outils de page offerts à Claude. push(action) journalise chaque écriture avec de quoi l'annuler. */
function coachTools(ref, push) {
  const S = () => Store.get(), C = () => Store.cfg();
  const dOf = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ref);
  const n = (v, lo, hi) => { const x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v); return typeof x === 'number' && isFinite(x) && x >= lo && x <= hi ? x : null; };
  const snap = (coll, id) => { const d = S()[coll][id]; return { coll, id, prev: d ? JSON.parse(JSON.stringify(d)) : null }; };
  const bilan = d => { const cfg = C(), j = S().journal[d] || {}, c = Apex.cibleDuJour(cfg, j, d), t = Apex.totJour(j, Apex.allFoods(cfg)), e = t.man || t.eat;
    return { date: d, cible_kcal: c.kcal, cible_p: c.p, mange: { kcal: Math.round(e.k), p: Math.round(e.p), g: Math.round(e.g), l: Math.round(e.l) }, prevu_kcal: Math.round(t.plan.k), reste_kcal: Math.round(c.kcal - e.k), reste_p: Math.round(c.p - e.p) }; };
  const DATE = { type: 'string', description: 'Date AAAA-MM-JJ. Par défaut le jour affiché.' }, NB = d => ({ type: 'number', description: d });
  return [
    { name: 'ajouter_repas', description: 'Enregistre des aliments mangés (ou prévus) dans un repas du jour, avec leurs valeurs nutritionnelles TOTALES pour la quantité consommée. Renvoie le total du jour, la cible et le reste à manger.',
      inputSchema: { type: 'object', properties: { date: DATE, repas: { type: 'string', description: 'Petit-déj, Déjeuner, Collation, Pré-séance, Post-séance, Dîner ou Extra' }, mange: { type: 'boolean', description: 'true si déjà mangé (défaut), false si prévu' }, remplace: { type: 'boolean', description: 'true pour remplacer le contenu prévu de ce repas, false pour ajouter (défaut)' },
        aliments: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, kcal: NB('kcal totales'), p: NB('protéines g'), g: NB('glucides g'), l: NB('lipides g'), f: NB('fibres g') }, required: ['nom', 'kcal', 'p', 'g', 'l'] } } }, required: ['repas', 'aliments'] },
      execute: inp => {
        const d = dOf(inp.date), nom = String(inp.repas || 'Extra').trim().slice(0, 30) || 'Extra';
        const items = (Array.isArray(inp.aliments) ? inp.aliments : []).slice(0, 12).map(a => { const k = a && n(a.kcal, 0, 6000); if (k == null || !a.nom) return null; return { id: Apex.uid(), q: 1, x: { n: String(a.nom).slice(0, 60), k: Math.round(k), p: Math.round(n(a.p, 0, 500) || 0), g: Math.round(n(a.g, 0, 1000) || 0), l: Math.round(n(a.l, 0, 500) || 0), f: Math.round(n(a.f, 0, 200) || 0) } }; }).filter(Boolean);
        if (!items.length) throw new Error('Aucun aliment valide : chaque aliment exige nom, kcal, p, g, l.');
        const u = snap('journal', d), meals = ((S().journal[d] || {}).repas || []).slice(), i = meals.findIndex(m => norm(m.nom) === norm(nom)), mange = inp.mange !== false;
        if (i >= 0) meals[i] = Object.assign({}, meals[i], { items: inp.remplace ? items : meals[i].items.concat(items), ok: mange ? true : !!meals[i].ok });
        else meals.push({ id: Apex.uid(), nom, h: heure(), ok: mange, items });
        Store.patch('journal', d, { date: d, repas: meals });
        push({ lab: (inp.remplace && i >= 0 ? 'Remplacé' : 'Ajouté') + ' · ' + nom + ' : ' + items.map(x => x.x.n).join(', ') + ' (' + f0(items.reduce((s, x) => s + x.x.k, 0)) + ' kcal)', undo: [u] });
        return bilan(d);
      } },
    { name: 'enregistrer_checkin', description: 'Enregistre le check-in matinal à jeun du jour : poids, sommeil, qualité, réveils, énergie, force, et pour la veille les pas et le bilan nutritionnel réel. Ne passe que les valeurs données. Renvoie la moyenne 7 jours et la lecture du jour.',
      inputSchema: { type: 'object', properties: { date: DATE, poids: NB('kg à jeun'), sommeil: NB('heures'), qualite_sommeil: NB('sur 10'), reveils: NB('nombre de réveils'), energie: NB('sur 10'), force: NB('force perçue sur 10'), pas_hier: NB('pas de la veille'),
        bilan_hier: { type: 'object', properties: { kcal: NB('kcal'), p: NB('g'), g: NB('g'), l: NB('g') }, required: ['kcal'] } } },
      execute: inp => {
        const d = dOf(inp.date), h = Apex.addDays(d, -1), f = { date: d }, fh = { date: h }, u = [snap('journal', d)], lab = [];
        const set = (k, v, t) => { if (v != null) { f[k] = v; lab.push(t); } };
        set('poids', n(inp.poids, 35, 200), 'poids'); set('sommeil', n(inp.sommeil, 0, 16), 'sommeil'); set('sommeilQ', n(inp.qualite_sommeil, 1, 10), 'qualité'); set('reveils', n(inp.reveils, 0, 30), 'réveils'); set('energie', n(inp.energie, 1, 10), 'énergie'); set('force', n(inp.force, 1, 10), 'force');
        const ph = n(inp.pas_hier, 0, 100000); if (ph != null) { fh.pas = Math.round(ph); lab.push('pas d’hier'); }
        const b = inp.bilan_hier, bk = b && n(b.kcal, 0, 12000); if (bk != null) { fh.man = { kcal: Math.round(bk), p: Math.round(n(b.p, 0, 600) || 0), g: Math.round(n(b.g, 0, 1500) || 0), l: Math.round(n(b.l, 0, 600) || 0) }; lab.push('bilan d’hier'); }
        if (!lab.length) throw new Error('Aucune valeur valide fournie.');
        if (f.poids != null) f.ci = new Date().toISOString();
        if (Object.keys(f).length > 1) Store.patch('journal', d, f);
        if (Object.keys(fh).length > 1) { u.push(snap('journal', h)); Store.patch('journal', h, fh); }
        push({ lab: 'Check-in · ' + lab.join(', '), undo: u });
        const m = Apex.mm7(S().journal, d), t = Apex.tendance(S().journal, d);
        return { ok: true, moyenne_7j_kg: m ? +m.v.toFixed(2) : null, pesees_sur_7j: m ? m.n : 0, rythme_kg_par_sem: t ? +t.dk.toFixed(2) : null, lecture: Apex.lecture(S().journal, C(), d).map(x => x.lab + ' : ' + x.val + ' (' + x.tag + '). ' + x.txt) };
      } },
    { name: 'noter_series', description: 'Enregistre des séries de musculation faites sur un exercice de la séance du jour (ouvre la séance si besoin). Renvoie l’e1RM et l’objectif de la prochaine séance.',
      inputSchema: { type: 'object', properties: { date: DATE, exercice: { type: 'string', description: 'id de l’exercice (entre crochets dans la séance du jour) ou son nom' }, series: { type: 'array', items: { type: 'object', properties: { kg: NB('charge en kg, 0 au poids du corps'), reps: NB('répétitions'), rpe: NB('RPE 1 à 10') }, required: ['reps'] } } }, required: ['exercice', 'series'] },
      execute: inp => {
        const d = dOf(inp.date), cfg = C(), exos = Apex.allExos(cfg), ks = Object.keys(exos), qn = norm(inp.exercice || '');
        const id = exos[inp.exercice] ? inp.exercice : (ks.find(k => norm(exos[k].n) === qn) || ks.find(k => qn.length > 3 && (norm(exos[k].n).indexOf(qn) >= 0 || qn.indexOf(norm(exos[k].n)) >= 0)) || null);
        if (!id) throw new Error('Exercice inconnu. Noms possibles : ' + ks.map(k => exos[k].n).join(', ').slice(0, 1200));
        const sets = (Array.isArray(inp.series) ? inp.series : []).slice(0, 12).map(x => { const rp = x && n(x.reps, 1, 100); if (rp == null) return null; const o = { r: Math.round(rp) }, kg = n(x.kg, 0, 600), rpe = n(x.rpe, 1, 10); if (kg != null) o.kg = kg; if (rpe != null) o.rpe = rpe; return o; }).filter(Boolean);
        if (!sets.length) throw new Error('Aucune série valide : reps est obligatoire.');
        const u = [snap('seances', d)], j = S().journal[d] || {}; let se = S().seances[d];
        if (!se) { const type = Apex.seanceDuJour(cfg, j, d) || Apex.prochaineSeance(S().seances, cfg, d); se = { date: d, type, debut: new Date().toISOString(), exos: (Apex.progOf(cfg)[type] || []).map(x => ({ e: x[0], sets: Array.from({ length: x[1] }, () => ({})) })) }; }
        const ex = (se.exos || []).slice(); let i = ex.findIndex(x => x.e === id); if (i < 0) { ex.push({ e: id, sets: [] }); i = ex.length - 1; }
        const merged = (ex[i].sets || []).filter(Apex.setFait).concat(sets), vides = Math.max(0, (ex[i].sets || []).length - merged.length);
        ex[i] = Object.assign({}, ex[i], { sets: merged.concat(Array.from({ length: vides }, () => ({}))) });
        Store.patch('seances', d, Object.assign({}, se, { exos: ex }));
        if (Apex.statutDuJour(cfg, j, d) !== 'salle') { u.push(snap('journal', d)); Store.patch('journal', d, { date: d, statut: 'salle', seance: se.type }); }
        push({ lab: 'Séries · ' + exos[id].n + ' : ' + setsTxt(sets), undo: u });
        const hh = Apex.histoExo(S().seances, id), last = hh.length ? hh[hh.length - 1] : null;
        return { ok: true, exercice: exos[id].n, series_faites_ce_jour: merged.length, e1rm_kg: last ? +last.e1.toFixed(1) : null, objectif_prochaine_seance: Apex.objectif(exos[id], last).txt };
      } },
    { name: 'noter_activite', description: 'Enregistre les pas et/ou l’eau bue (litres) d’une journée.',
      inputSchema: { type: 'object', properties: { date: DATE, pas: NB('nombre de pas du jour'), eau: NB('litres') } },
      execute: inp => { const d = dOf(inp.date), f = { date: d }, p = n(inp.pas, 0, 100000), e = n(inp.eau, 0, 12); if (p != null) f.pas = Math.round(p); if (e != null) f.eau = Math.round(e * 100) / 100; if (Object.keys(f).length < 2) throw new Error('Donne pas et/ou eau.');
        const u = snap('journal', d); Store.patch('journal', d, f); push({ lab: 'Activité · ' + (p != null ? f0(p) + ' pas' : '') + (p != null && e != null ? ', ' : '') + (e != null ? fq(f.eau) + ' L' : ''), undo: [u] }); return { ok: true, cible_pas: C().cibles.pasMin + '-' + C().cibles.pasMax, cible_eau_l: C().cibles.eau }; } },
    { name: 'recaler_plan', description: 'Recale les quantités des repas non mangés pour retomber sur la cible du jour (glucides puis lipides, protéines tenues au plancher). Sans repas planifié, charge le plan type du jour. Renvoie le nouveau plan.',
      inputSchema: { type: 'object', properties: { date: DATE } },
      execute: inp => { const d = dOf(inp.date), cfg = C(), foods = Apex.allFoods(cfg), j = S().journal[d] || {}, c = Apex.cibleDuJour(cfg, j, d), u = snap('journal', d), cur = j.repas || [];
        const ms = cur.length ? Apex.ajuster(cur, c, foods) : Apex.planDuJour(cfg, c.statut, c); Store.patch('journal', d, { date: d, repas: ms });
        push({ lab: cur.length ? 'Plan recalé sur ' + f0(c.kcal) + ' kcal' : 'Plan ' + c.statut + ' chargé', undo: [u] });
        return Object.assign(bilan(d), { repas: ms.map(m => m.nom + (m.ok ? ' (mangé)' : '') + ' : ' + m.items.map(it => { const f = Apex.foodOf(it, foods); return f ? f.n + ' ' + fq(it.q) + ' ' + unitOf(f) : ''; }).filter(Boolean).join(', ')) }); } },
    { name: 'definir_jour', description: 'Définit le statut d’une journée (salle = 2000 kcal, repos = 1800 kcal) et le type de séance.',
      inputSchema: { type: 'object', properties: { date: DATE, statut: { type: 'string', enum: ['salle', 'repos'] }, seance: { type: 'string', enum: Apex.types(C()) } }, required: ['statut'] },
      execute: inp => { const d = dOf(inp.date), st = inp.statut === 'repos' ? 'repos' : inp.statut === 'salle' ? 'salle' : null; if (!st) throw new Error('statut doit valoir salle ou repos.');
        const u = snap('journal', d), f = { date: d, statut: st }; if (st === 'salle') f.seance = Apex.types(C()).indexOf(inp.seance) >= 0 ? inp.seance : (Apex.seanceDuJour(C(), S().journal[d], d) || Apex.prochaineSeance(S().seances, C(), d));
        Store.patch('journal', d, f); push({ lab: 'Jour · ' + st + (f.seance ? ' ' + f.seance : ''), undo: [u] }); return bilan(d); } },
    { name: 'noter_mensurations', description: 'Enregistre des mensurations en cm : tour de taille au nombril, cou, poitrine, épaules, bras contracté, cuisse. Renvoie le % de masse grasse US Navy si taille et cou sont connus.',
      inputSchema: { type: 'object', properties: { date: DATE, taille: NB('tour de taille cm'), cou: NB('cm'), poitrine: NB('cm'), epaules: NB('cm'), bras: NB('bras contracté cm'), cuisse: NB('cm') } },
      execute: inp => { const d = dOf(inp.date), f = { date: d }; MESURES.forEach(m => { const v = n(inp[m[0]], 10, 220); if (v != null) f[m[0]] = v; }); if (Object.keys(f).length < 2) throw new Error('Aucune mesure valide.');
        const u = snap('mensurations', d); Store.patch('mensurations', d, f); push({ lab: 'Mensurations · ' + Object.keys(f).filter(k => k !== 'date').join(', '), undo: [u] });
        const m = S().mensurations[d], bf = Apex.navy(m.taille, m.cou, C().profil.taille); return { ok: true, masse_grasse_navy_pct: bf ? +bf.toFixed(1) : null }; } },
  ];
}

function Coach({ date }) {
  const st = useStore(), sample = st.caps().sample, dict = st.caps().dictation;
  const [msgs, setMsgs] = useState(chatLoad); const [txt, setTxt] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [lim, setLim] = useState(null);
  const [tier, setTier] = useState(() => { try { return localStorage.getItem('apexhq:tier') === 'default' ? 'default' : 'quick'; } catch (e) { return 'quick'; } });
  const [rec, setRec] = useState('idle'); const [part, setPart] = useState(''); const [micOff, setMicOff] = useState(false);
  const ctl = useRef(null), end = useRef(null), box = useRef(null);
  useEffect(() => { if (!sample) return undefined; let on = true; sample.limits().then(l => { if (on) setLim(l || {}); }).catch(() => { if (on) setLim({}); }); return () => { on = false; }; }, [sample]);
  useEffect(() => () => { if (ctl.current) ctl.current.abort(); }, []);
  useEffect(() => { chatSave(msgs); }, [msgs]);
  useEffect(() => { try { if (end.current) end.current.scrollIntoView({ block: 'end' }); } catch (e) { /* défilement non critique */ } }, [msgs.length, busy]);
  useEffect(() => { if (!dict) return undefined;
    const a = dict.onFinal(e => setTxt(t => (t ? t + e.text : String(e.text || '').replace(/^\s+/, '')))), b = dict.onPartial(e => setPart(e.text || '')), c = dict.onState(e => { setRec(e.state); if (e.state === 'idle') setPart(''); });
    return () => { a(); b(); c(); if (dict.active()) dict.stop().catch(() => {}); }; }, [dict]);
  const pickTier = v => { setTier(v); try { localStorage.setItem('apexhq:tier', v); } catch (e) { /* préférence non mémorisée */ } };
  const mic = () => { if (!dict) return; if (rec !== 'idle') { dict.stop().catch(() => {}); return; } dict.start().catch(e => { if (e && (e.code === 'not_granted' || e.code === 'unavailable')) setMicOff(true); }); };
  const send = async () => {
    const q = txt.trim(); if (!q || busy || !sample) return;
    const toolsOk = !!(lim && lim.tools), acts = [], hist = msgs.filter(m => m.t).slice(-12); let cur = '';
    setMsgs(msgs.concat({ r: 'u', t: q }, { r: 'a', t: '', a: [], wait: true })); setTxt(''); setErr(''); setBusy(true);
    const upd = done => setMsgs(ms => { const c = ms.slice(), i = c.length - 1; if (i < 0 || c[i].r !== 'a') return ms; c[i] = { r: 'a', t: cur, a: acts.slice(), wait: !done && !cur }; return c; });
    const turns = [{ role: 'user', content: COACH_REGLES + (toolsOk ? '' : '\n' + COACH_SANS_OUTILS) + '\n\nDONNÉES ACTUELLES DE L’APP\n' + coachContexte(date) }];
    hist.forEach(m => turns.push({ role: m.r === 'u' ? 'user' : 'assistant', content: m.t + (m.a && m.a.length ? '\n[Actions enregistrées : ' + m.a.map(a => a.lab + (a.undone ? ' (annulée)' : '')).join(' ; ') + ']' : '') }));
    turns.push({ role: 'user', content: q.slice(0, 4000) });
    if (ctl.current) ctl.current.abort(); ctl.current = new AbortController();
    const opts = { signal: ctl.current.signal, cache: false, onText: u => { cur = u.text; upd(false); } };
    if (!lim || !lim.modelTiers || lim.modelTiers.indexOf(tier) >= 0) opts.modelTier = tier;
    if (toolsOk) opts.tools = coachTools(date, a => { acts.push(Object.assign({ id: Apex.uid() }, a)); upd(false); }).slice(0, (lim.tools && lim.tools.maxCount) || 8);
    try { const r = await sample(turns, opts); cur = r.text; upd(true); }
    catch (e) {
      cur = e && e.code !== 'refused' && e.text ? e.text : ''; if (!cur && acts.length) cur = 'Enregistré.';
      if (cur) upd(true); else setMsgs(ms => (ms.length && ms[ms.length - 1].r === 'a' ? ms.slice(0, -1) : ms));
      if (!e || e.code !== 'cancelled') setErr(aiErr(e));
    }
    setBusy(false);
  };
  const undo = (mi, ai) => { const a = msgs[mi] && msgs[mi].a && msgs[mi].a[ai]; if (!a || !a.undo || a.undone) return; a.undo.slice().reverse().forEach(u => Store.replace(u.coll, u.id, u.prev));
    setMsgs(ms => ms.map((m, i) => (i !== mi ? m : Object.assign({}, m, { a: m.a.map((x, k) => (k !== ai ? x : Object.assign({}, x, { undone: true }))) })))); toast('Action annulée'); };
  const key = e => { if (e.key === 'Enter' && !e.shiftKey && !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) { e.preventDefault(); send(); } };
  const SUG = ['Ce midi j’ai mangé ', 'Check-in : poids … kg, sommeil … h, énergie …/10, force …/10', 'Que manger ce soir pour boucler la journée ?', 'Analyse ma semaine et dis-moi quoi ajuster.'];
  if (!sample) return html`<div>
    <div className="view-h"><h1>Coach</h1><p>Claude intégré à l’app.</p></div>
    <${Card} title="Coach indisponible dans cette vue">
      <div className="empty"><span><b>Le coach a besoin de Claude.</b> Ouvre ApexHQ depuis l’app Claude ou claude.ai, connecté à ton compte : le coach lit tes données et enregistre repas, check-in et séries quand tu lui parles.</span></div>
    <//>
  </div>`;
  return html`<div>
    <div className="view-h"><h1>Coach</h1>
      <div className="row">
        <${Seg} neutral label="Vitesse du coach" value=${tier} onChange=${pickTier} options=${[['quick', 'Rapide'], ['default', 'Précis']]} />
        ${msgs.length > 0 && html`<${Confirm} label="Effacer" sure="Effacer la discussion ?" cls="ghost" onYes=${() => setMsgs([])} />`}
      </div></div>
    <div className="chat" aria-live="polite">
      ${!msgs.length && html`<div className="note acc"><${Icon} n="sparkles" /><div>
        <span><b>Dis-lui ce que tu fais, il remplit l’app.</b> Repas, écart, poids, pas, séries : chaque enregistrement s’affiche et s’annule d’un geste. ${lim && !lim.tools ? 'Dans cette vue il conseille mais ne peut pas écrire.' : ''}</span>
        <div className="chips">${SUG.map((s, i) => html`<button key=${i} type="button" className="chip" onClick=${() => { setTxt(s); if (box.current) box.current.focus(); }}>${s.length > 44 ? s.slice(0, 42) + '…' : s}</button>`)}</div>
        <span className="mut">Compte dans ton usage Claude. « Rapide » répond en quelques secondes, « Précis » réfléchit plus longtemps.</span>
      </div></div>`}
      ${msgs.map((m, mi) => html`<${React.Fragment} key=${mi}>
        ${(m.t || m.wait) && html`<div className=${cx('msg', m.r, m.wait && 'wait')}>${m.t || 'Claude réfléchit…'}</div>`}
        ${m.a && m.a.length > 0 && html`<div className="acts">${m.a.map((a, ai) => html`<div key=${a.id || ai} className=${cx('act', a.undone && 'off')}>
          <${Icon} n=${a.undone ? 'x' : 'check'} s=${16} w=${2.4} /><span>${a.lab}</span>
          ${a.undo && !a.undone ? html`<button type="button" className="btn sm ghost" onClick=${() => undo(mi, ai)}>Annuler</button>` : html`<span></span>`}
        </div>`)}</div>`}
      <//>`)}
      ${err && html`<div className="note"><${Icon} n="alert" /><div><span>${err}</span></div></div>`}
      <div ref=${end}></div>
    </div>
    <div className="composer">
      <textarea id="coach-txt" ref=${box} className="inp" rows=${Math.min(5, Math.max(1, txt.split('\n').length))} placeholder=${rec === 'listening' ? (part || 'Je t’écoute…') : 'Repas, poids, séance…'} value=${txt} maxLength="4000" onChange=${e => setTxt(e.target.value)} onKeyDown=${key} aria-label="Message au coach"></textarea>
      ${dict && !micOff && html`<button type="button" className=${cx('ib', rec !== 'idle' && 'rec')} aria-pressed=${rec !== 'idle'} aria-label=${rec !== 'idle' ? 'Arrêter la dictée' : 'Dicter'} onClick=${mic}><${Icon} n="mic" /></button>`}
      ${busy ? html`<button type="button" className="btn" onClick=${() => ctl.current && ctl.current.abort()}>Stop</button>`
        : html`<button type="button" className="btn pri" disabled=${!txt.trim()} aria-label="Envoyer" onClick=${send}><${Icon} n="send" s=${18} /></button>`}
    </div>
  </div>`;
}

/* ---- 66-ui-onboard.js ---- */
/* ApexHQ — assistant de démarrage : questions, calcul précis des calories, programme de séances, lien Claude.
   S'affiche à la première ouverture (profil vide) ou via Réglages › Refaire le questionnaire. */
const STEPS = ['intro', 'objectif', 'intensite', 'profil', 'activite', 'training', 'focus', 'alim', 'supps', 'resultat', 'claude'];
const METIERS = [['sedentaire', 'Sédentaire', 'Bureau, études, télétravail : peu de déplacements.', 'clock'], ['debout', 'Debout ou mobile', 'Commerce, enseignement, service : tu bouges dans la journée.', 'steps'], ['actif', 'Physique', 'Manutention, chantier, métier très actif.', 'bolt']];
const NIVEAUX = [['debutant', 'Débutant', 'Moins d’un an de musculation régulière.', 'target'], ['intermediaire', 'Intermédiaire', '1 à 3 ans, tu connais les mouvements de base.', 'dumbbell'], ['avance', 'Avancé', 'Plus de 3 ans, progression lente.', 'trend']];
const REGIMES = [['omnivore', 'Je mange de tout', '', 'utensils'], ['pescetarien', 'Pescétarien', 'Pas de viande, poisson oui.', 'droplet'], ['vegetarien', 'Végétarien', 'Ni viande ni poisson, œufs et laitages oui.', 'check'], ['vegan', 'Végan', 'Aucun produit animal.', 'sparkles']];
const WHEY_DEFAUT = { n: 'Ma whey', k: 380, p: 80, g: 6, l: 5, f: 0, dose: 30, verified: false };

function Opts({ items, value, onPick }) {
  return html`<div className="opts">${items.map(x => html`<button key=${x[0]} type="button" className=${cx('opt', x[3] && 'has-ic')} aria-pressed=${value === x[0]} onClick=${() => onPick(x[0])}>${x[3] && html`<i className="opt-ic"><${Icon} n=${x[3]} s=${22} /></i>`}<div><b>${x[1]}</b>${x[2] && html`<span>${x[2]}</span>`}</div></button>`)}</div>`;
}
function MultiChips({ items, value, onToggle }) {
  return html`<div className="chips">${items.map(x => html`<button key=${x[0]} type="button" className="chip" aria-pressed=${value.indexOf(x[0]) >= 0} onClick=${() => onToggle(x[0])}>${x[1]}</button>`)}</div>`;
}

async function optimiserProgramme(sample, a, groupes, cfg) {
  const ex = Apex.allExos(cfg), cat = Object.keys(ex).filter(k => Apex.eqOk(a.equip || 'salle', ex[k])).map(k => k + '=' + ex[k].n + ' (' + (Apex.MUSCLES[ex[k].m] || ex[k].m) + ')').join('; '), n = a.seances;
  const obj = { seche: 'sèche (déficit calorique : garder les charges lourdes, volume modéré)', neutre: 'maintien et recomposition', masse: 'prise de masse' }[a.objectif];
  let prompt = ['Tu es préparateur physique. Conçois le programme hebdomadaire de musculation de cette personne.',
    'Profil : ' + (a.sexe === 'F' ? 'femme' : 'homme') + ', ' + a.age + ' ans, ' + a.poids + ' kg, niveau ' + a.niveau + ', objectif ' + obj + '.',
    'Séances par semaine : ' + n + ' de ' + a.duree + ' minutes. Découpage souhaité : ' + (Apex.SPLITS[a.split] || Apex.SPLITS.ppl_ul)[0] + '.',
    'Points faibles à prioriser, avec leur cible de séries directes par semaine et leur fréquence : ' + (groupes.length ? groupes.map(g => g.n + ' ' + g.min + ' à ' + g.max + ' séries, ' + g.freq + ' fois par semaine') .join(' ; ') : 'aucun') + '.',
    'Exercices autorisés (id=nom) : ' + cat + '.',
    'Règles : 5 à 9 exercices par séance, 2 à 5 séries par exercice, exercices lourds en premier, chaque point faible travaillé au moins aussi souvent que sa fréquence, jours de repos répartis. Utilise uniquement les id autorisés.',
    'Réponds uniquement par un objet JSON : {"seances":[{"nom":"Haut","exercices":[{"id":"di_halt","series":4}]}],"planning":{"0":"","1":"Haut","2":"","3":"","4":"","5":"","6":""}}. Le planning associe chaque jour (0 = dimanche … 6 = samedi) au nom d’une séance, ou "" pour un repos. Exactement ' + n + ' jours d’entraînement.'].join('\n');
  if (a.jours) prompt += '\nJours disponibles (0 = dimanche … 6 = samedi) : ' + a.jours.join(', ') + '. Ne place des séances que sur ces jours.';
  if (a.equip && a.equip !== 'salle') prompt += '\nMatériel disponible : ' + (Apex.EQUIP.find(x => x[0] === a.equip) || [])[1] + '. N’utilise que les exercices autorisés.';
  const r = await Promise.race([sample.json(prompt, { modelTier: 'default', cache: false }), new Promise((_, ko) => setTimeout(() => ko({ code: 'upstream_error' }), 120000))]);
  const res = Apex.validerProgrammeIA(r, n, cfg, a.jours); if (!res) return null;
  return groupes.every(g => Apex.volumeGroupe(res, g, cfg) >= g.min * 0.8) ? res : null;
}

function Wizard({ redo, onClose }) {
  const st = useStore(), cfg = st.cfg(), prev = cfg.q || {};
  const [a, setA] = useState(() => Object.assign({ objectif: 'seche', intensite: 'normal', sexe: 'H', age: null, taille: null, poids: null, mg: null, poidsCible: null, metier: 'debout', pas: 8000, seances: 4, duree: 60, cardio: 0, niveau: 'intermediaire', split: 'ul', regime: 'omnivore', exclus: '', focus: [], supps: [], suppsAutre: '', whey: null }, prev));
  const [step, setStep] = useState(0); const [busy, setBusy] = useState(''); const [scan, setScan] = useState(false); const [wmsg, setWmsg] = useState(''); const [wbusy, setWbusy] = useState(false); const [linked, setLinked] = useState(!!(cfg.claude && cfg.claude.on));
  const set = p => setA(x => Object.assign({}, x, p));
  const steps = STEPS.filter(s => !(s === 'intensite' && a.objectif === 'neutre')), cur = steps[step] || 'intro', last = step === steps.length - 1;
  const num = v => typeof v === 'number' && isFinite(v);
  const valid = cur === 'profil' ? num(a.age) && a.age >= 14 && a.age <= 90 && num(a.taille) && a.taille >= 120 && a.taille <= 230 && num(a.poids) && a.poids >= 35 && a.poids <= 250
    : cur === 'activite' ? num(a.pas) && num(a.seances) && (a.seances === 0 || (num(a.duree) && a.duree >= 15)) : true;
  const plan = (cur === 'resultat' || cur === 'claude') && valid ? Apex.calcPlan(a) : null;
  const parts = plan ? [['Base', plan.parts.base, 'var(--s1)'], ['Pas', Math.max(0, plan.parts.steps), 'var(--s3)'], ['Séances', plan.parts.train, 'var(--s2)'], ['Cardio', plan.parts.cardio, 'var(--s4)']].filter(x => x[1] > 0.5) : [];
  const sample = st.caps().sample;
  const go = d => {
    if (d > 0 && cur === 'profil' && !num(a.poidsCible)) set({ poidsCible: Math.round(a.poids * (a.objectif === 'seche' ? 0.93 : a.objectif === 'masse' ? 1.05 : 1) * 2) / 2 });
    if (d > 0 && cur === 'activite') set({ split: Apex.splitSuggere(a.seances) });
    setStep(s => Math.max(0, Math.min(steps.length - 1, s + d)));
  };
  const toggle = (k, v) => setA(x => Object.assign({}, x, { [k]: x[k].indexOf(v) >= 0 ? x[k].filter(i => i !== v) : x[k].concat(v) }));
  const estimerWhey = async () => {
    const s = Store.caps().sample; if (!s || !a.whey || !a.whey.n.trim()) return; setWbusy(true); setWmsg('');
    try {
      const r = await s.json('Donne les valeurs nutritionnelles moyennes de cette protéine en poudre : « ' + a.whey.n.slice(0, 80) + ' ». Réponds uniquement par un JSON {"kcal": pour 100 g, "p": protéines g pour 100 g, "g": glucides g pour 100 g, "l": lipides g pour 100 g, "f": fibres g pour 100 g, "dose_g": portion usuelle en grammes}.', { modelTier: 'quick', cache: false });
      const k = Number(r.kcal); if (!(k > 100 && k < 600)) throw { code: 'invalid_json' };
      set({ whey: Object.assign({}, a.whey, { k: Math.round(k), p: r1(+r.p || 0), g: r1(+r.g || 0), l: r1(+r.l || 0), f: r1(+r.f || 0), dose: Math.round(+r.dose_g) > 0 ? Math.round(+r.dose_g) : a.whey.dose, verified: false }) }); setWmsg('Valeurs estimées par Claude : vérifie-les avec l’étiquette.');
    } catch (e) { setWmsg(aiMsg(e) || 'Estimation impossible.'); }
    setWbusy(false);
  };
  const skip = () => { Store.patch('cfg', null, { onboarded: true }); onClose(); };
  const finish = async () => {
    setBusy('Calcul de tes calories…');
    try {
      const cfgNow = Store.cfg(), p = Apex.calcPlan(a), base = Apex.planToCfg(a, p), groupes = Apex.focusGroupes(a.focus), foods = Apex.allFoods(Object.assign({}, cfgNow, { aliments: Object.assign({}, cfgNow.aliments, Apex.wheyAliments(a.whey)) }));
      let prog = Apex.genProgramme(a, groupes, cfgNow), ia = '';
      if (sample && linked && a.seances > 0) {
        setBusy('Claude conçoit ton programme selon tes points faibles (≈ 30 s)…');
        try { const r = await optimiserProgramme(sample, a, groupes, cfgNow); if (r) { prog = r; ia = ' Programme optimisé par Claude.'; } else ia = ' Programme calculé par l’app (la proposition de Claude n’était pas valide).'; } catch (e) { ia = ' Programme calculé par l’app (Claude indisponible).'; }
      }
      const q = { objectif: a.objectif, intensite: a.intensite, sexe: a.sexe, age: a.age, taille: a.taille, poids: a.poids, mg: a.mg, poidsCible: a.poidsCible, metier: a.metier, pas: a.pas, seances: a.seances, duree: a.duree, cardio: a.cardio, niveau: a.niveau, split: a.split, regime: a.regime, exclus: a.exclus, focus: a.focus, supps: a.supps, suppsAutre: a.suppsAutre, whey: a.whey, fait: Apex.today() };
      Store.patch('cfg', null, Object.assign({ onboarded: true, q }, base, {
        focus: groupes, supps: Apex.suppsListe(a.supps, a.suppsAutre), seanceTypes: prog.seanceTypes, programme: prog.programme, planning: prog.planning, photosJour: 0,
        repasModeles: Apex.modelesPour(a, foods), aliments: Object.assign({}, cfgNow.aliments, Apex.wheyAliments(a.whey)),
      }));
      toast('Ton plan est prêt : ' + p.salle.kcal + ' / ' + p.repos.kcal + ' kcal.' + ia); onClose();
    } catch (e) { setBusy(''); toast('Erreur : ' + (e && e.message ? e.message : e)); }
  };
  const pct = Math.round(step / (steps.length - 1) * 100);
  const body = {
    intro: () => html`<div className="intro-mark"><${Icon} n="apex" s=${40} w=${1.8} /></div><h1>Configurons ton ApexHQ</h1>
      <p className="sec">Quelques questions pour calculer tes calories et tes macros avec précision, bâtir ton programme de séances autour de tes points faibles et adapter ton plan repas. Compte 3 minutes. Tout reste modifiable ensuite dans les réglages.</p>
      <ul className="intro-list"><li><${Icon} n="check" s=${16} w=${2.4} />Calories et macros calculées pour toi</li><li><${Icon} n="check" s=${16} w=${2.4} />Programme bâti autour de tes points faibles</li><li><${Icon} n="check" s=${16} w=${2.4} />Plan repas adapté à ton régime</li></ul>
      ${(redo || cfg.q) && html`<div className="note"><${Icon} n="alert" /><div><span><b>Refaire le questionnaire remplace</b> tes cibles, ton programme, tes points faibles, tes compléments et ton plan repas type. Tes journées, pesées et séances déjà notées sont conservées.</span></div></div>`}
      <button type="button" className="btn ghost" onClick=${skip}>Passer, je règle tout à la main</button>`,
    objectif: () => html`<h1>Ton objectif ?</h1><${Opts} items=${Apex.OBJECTIFS.map(x => x.concat({ seche: 'flame', neutre: 'scale', masse: 'dumbbell' }[x[0]]))} value=${a.objectif} onPick=${v => set({ objectif: v, intensite: 'normal' })} />`,
    intensite: () => html`<h1>${a.objectif === 'seche' ? 'Quel déficit ?' : 'Quel surplus ?'}</h1>
      <p className="sec">${a.objectif === 'seche' ? 'Plus le déficit est fort, plus la perte est rapide, mais plus la faim, la fatigue et le risque de perdre du muscle augmentent. L’app plafonne la perte à 1 % du poids par semaine.' : 'Un surplus plus fort fait prendre plus vite, avec plus de gras.'}</p>
      <${Opts} items=${Apex.intensites(a.objectif).map(x => [x[0], x[1] + ' · ' + (a.objectif === 'seche' ? '−' : '+') + Math.round(x[2] * 100) + ' %', x[3]])} value=${a.intensite} onPick=${v => set({ intensite: v })} />`,
    profil: () => html`<h1>Qui es-tu ?</h1>
      <div className="fld"><span className="fld-l">Sexe</span><${Seg} neutral label="Sexe" value=${a.sexe} onChange=${v => set({ sexe: v })} options=${[['H', 'Homme'], ['F', 'Femme']]} /></div>
      <div className="form">
        <${Num} id="w-age" label="Âge" unit="ans" value=${a.age} onChange=${v => set({ age: v })} dec=${0} min=${14} max=${90} />
        <${Num} id="w-taille" label="Taille" unit="cm" value=${a.taille} onChange=${v => set({ taille: v })} dec=${0} min=${120} max=${230} />
        <${Num} id="w-poids" label="Poids actuel" unit="kg" value=${a.poids} onChange=${v => set({ poids: v })} dec=${1} min=${35} max=${250} />
        <${Num} id="w-pcible" label="Poids visé" unit="kg" value=${a.poidsCible} onChange=${v => set({ poidsCible: v })} dec=${1} min=${35} max=${250} />
        <div className="full"><${Num} id="w-mg" label="% de masse grasse (facultatif)" unit="%" value=${a.mg} onChange=${v => set({ mg: v })} dec=${1} min=${4} max=${55} placeholder="ex. 15" /></div>
      </div>
      <p className="mut" style=${{ fontSize: 12 }}>Si tu connais ton % de masse grasse, le calcul de ton métabolisme de base est plus précis. Sinon, laisse vide.</p>`,
    activite: () => html`<h1>Ton activité</h1>
      <div className="stack"><span className="fld-l">Ton quotidien (hors sport)</span><${Opts} items=${METIERS} value=${a.metier} onPick=${v => set({ metier: v })} /></div>
      <div className="form">
        <${Num} id="w-pas" label="Pas par jour (moyenne)" value=${a.pas} onChange=${v => set({ pas: v })} dec=${0} min=${0} max=${40000} />
        <${Num} id="w-cardio" label="Cardio par semaine" unit="min" value=${a.cardio} onChange=${v => set({ cardio: v == null ? 0 : v })} dec=${0} min=${0} max=${600} />
      </div>
      <div className="stack"><span className="fld-l">Séances de musculation par semaine<b>${a.seances}</b></span>
        <div className="chips">${[0, 1, 2, 3, 4, 5, 6, 7].map(n => html`<button key=${n} type="button" className="chip" aria-pressed=${a.seances === n} onClick=${() => set({ seances: n })}>${n}</button>`)}</div></div>
      ${a.seances > 0 && html`<${Num} id="w-duree" label="Durée d’une séance" unit="min" value=${a.duree} onChange=${v => set({ duree: v })} dec=${0} min=${15} max=${180} />`}`,
    training: () => html`<h1>Ton entraînement</h1>
      <div className="stack"><span className="fld-l">Ton niveau</span><${Opts} items=${NIVEAUX} value=${a.niveau} onPick=${v => set({ niveau: v })} /></div>
      ${a.seances > 0 ? html`<div className="stack"><span className="fld-l">Découpage des séances</span>
        <${Opts} items=${Object.keys(Apex.SPLITS).map(k => [k, Apex.SPLITS[k][0], k === Apex.splitSuggere(a.seances) ? 'Conseillé pour ' + a.seances + ' séance' + (a.seances > 1 ? 's' : '') + ' par semaine.' : ''])} value=${a.split} onPick=${v => set({ split: v })} /></div>` : html`<p className="sec">Aucune séance prévue : l’app ne créera pas de planning, tu pourras en ajouter dans Réglages.</p>`}`,
    focus: () => html`<h1>Tes points faibles</h1>
      <p className="sec">Les muscles que tu veux faire progresser en priorité. Ils reçoivent plus de volume dans ton programme et des alertes dans l’onglet Training.</p>
      <${MultiChips} items=${Apex.FOCUS_CHOIX} value=${a.focus} onToggle=${v => toggle('focus', v)} />
      <p className="mut" style=${{ fontSize: 12 }}>${a.focus.length ? a.focus.length + ' choisi' + (a.focus.length > 1 ? 's' : '') + '. Conseil : 3 maximum pour que ça reste efficace.' : 'Aucun : programme équilibré.'}</p>`,
    alim: () => html`<h1>Ton alimentation</h1>
      <div className="stack"><span className="fld-l">Régime</span><${Opts} items=${REGIMES} value=${a.regime} onPick=${v => set({ regime: v })} /></div>
      <label className="fld" htmlFor="w-excl"><span className="fld-l">Allergies ou aliments à éviter</span><input id="w-excl" className="inp" type="text" maxLength="120" placeholder="ex. arachides, gluten, poisson" value=${a.exclus} onChange=${e => set({ exclus: e.target.value })} /></label>
      <p className="mut" style=${{ fontSize: 12 }}>Ces aliments sont retirés de ton plan repas et remplacés par des équivalents.</p>`,
    supps: () => html`<h1>Tes compléments</h1>
      <p className="sec">Coche ceux que tu prends. Ils apparaîtront dans ta checklist du jour.</p>
      <${MultiChips} items=${Apex.SUPP_CHOIX.map(x => [x[0], x[1]])} value=${a.supps} onToggle=${v => toggle('supps', v)} />
      <label className="fld" htmlFor="w-autre"><span className="fld-l">Autres compléments</span><input id="w-autre" className="inp" type="text" maxLength="100" placeholder="ex. zinc, électrolytes" value=${a.suppsAutre} onChange=${e => set({ suppsAutre: e.target.value })} /></label>
      <div className="stack"><button type="button" className="chip" style=${{ justifySelf: 'start' }} aria-pressed=${!!a.whey} onClick=${() => set({ whey: a.whey ? null : Object.assign({}, WHEY_DEFAUT) })}>Je prends une whey ou une protéine en poudre</button>
        ${a.whey && html`<div className="note acc"><${Icon} n="bolt" /><div>
          <span><b>Laquelle précisément ?</b> Donne le nom, puis scanne le code-barres${STANDALONE ? '' : ' (dans l’app installée)'} ou fais estimer les valeurs.</span>
          <label className="fld" htmlFor="w-wn"><span className="fld-l">Marque et produit</span><input id="w-wn" className="inp" type="text" maxLength="60" placeholder="ex. Prozis Clear Whey Isolate" value=${a.whey.n} onChange=${e => set({ whey: Object.assign({}, a.whey, { n: e.target.value, verified: false }) })} /></label>
          <div className="row">${CAN_SCAN && html`<button type="button" className="btn sm" onClick=${() => setScan(true)}><${Icon} n="camera" s=${16} />Scanner le code-barres</button>`}
            ${sample && html`<button type="button" className="btn sm" disabled=${wbusy || !a.whey.n.trim()} onClick=${estimerWhey}><${Icon} n="sparkles" s=${16} />${wbusy ? 'Estimation…' : 'Estimer avec Claude'}</button>`}</div>
          <div className="form f4">
            <${Num} id="w-wk" label="kcal / 100 g" value=${a.whey.k} onChange=${v => set({ whey: Object.assign({}, a.whey, { k: v == null ? 0 : v, verified: true }) })} dec=${0} min=${0} max=${600} />
            <${Num} id="w-wp" label="Prot. / 100 g" value=${a.whey.p} onChange=${v => set({ whey: Object.assign({}, a.whey, { p: v == null ? 0 : v, verified: true }) })} dec=${1} min=${0} max=${100} />
            <${Num} id="w-wg" label="Gluc. / 100 g" value=${a.whey.g} onChange=${v => set({ whey: Object.assign({}, a.whey, { g: v == null ? 0 : v, verified: true }) })} dec=${1} min=${0} max=${100} />
            <${Num} id="w-wl" label="Lip. / 100 g" value=${a.whey.l} onChange=${v => set({ whey: Object.assign({}, a.whey, { l: v == null ? 0 : v, verified: true }) })} dec=${1} min=${0} max=${100} />
          </div>
          <${Num} id="w-wd" label="Dose d’une prise" unit="g" value=${a.whey.dose} onChange=${v => set({ whey: Object.assign({}, a.whey, { dose: v == null ? 30 : v }) })} dec=${0} min=${5} max=${100} />
          ${wmsg && html`<span className="sec">${wmsg}</span>`}
          <span className="mut">Valeurs par défaut d’une whey isolate. Corrige-les avec l’étiquette pour plus de précision.</span>
        </div></div>`}</div>`,
    resultat: () => !plan ? html`<p className="sec">Complète les étapes précédentes.</p>` : html`<h1>Ton plan calorique</h1>
      <div className="plan-hero">
        <div className="ph-l"><span className="ph-k">Cible moyenne par jour</span><div className="ph-n">${f0(plan.avg)}<small>kcal</small></div>
          <${Pill} st=${a.objectif === 'seche' ? 'good' : ''}>${a.objectif === 'neutre' ? 'Poids stable' : sgn(plan.kgSem, f2) + ' kg par semaine · ' + sgn(plan.pctSem, f1) + ' %'}<//></div>
        <${Ring} v=${plan.avg} max=${Math.max(plan.tdee, plan.avg)} size=108 sw=10><b style=${{ fontSize: 22 }}>${a.objectif === 'neutre' ? '0' : sgn(plan.delta, f0)}</b><span>kcal / jour</span><//>
      </div>
      <div className="day2">${[['Jour de salle', plan.salle, plan.n ? plan.n + ' par semaine' : 'aucun prévu'], ['Jour de repos', plan.repos, (7 - plan.n) + ' par semaine']].map(x => html`<div key=${x[0]} className="day-c"><span className="fld-l">${x[0]}</span><b className="num">${f0(x[1].kcal)}<small>kcal</small></b><em>${x[2]}</em>
        ${[['Prot.', x[1].p, x[1].p * 4, 'var(--p)'], ['Gluc.', x[1].g, x[1].g * 4, 'var(--g)'], ['Lip.', x[1].l, x[1].l * 9, 'var(--l)']].map(m => html`<div key=${m[0]} className="mc"><span><i style=${{ background: m[3] }}></i>${m[0]}</span><div className="mc-b"><u style=${{ width: Math.round(m[2] / x[1].kcal * 100) + '%', background: m[3] }}></u></div><b>${m[1]} g</b></div>`)}</div>`)}</div>
      <div className="card-lite"><div className="row sb"><span className="fld-l">Ta dépense · ${f0(plan.tdee)} kcal par jour</span><span className="mut" style=${{ fontSize: 12 }}>${plan.mg != null ? 'Katch-McArdle' : 'Mifflin-St Jeor'}</span></div>
        <div className="sbar" role="img" aria-label="Répartition de ta dépense">${parts.map(x => html`<u key=${x[0]} style=${{ flexGrow: x[1], background: x[2] }}></u>`)}</div>
        <div className="legend">${parts.map(x => html`<span key=${x[0]}><i className="box" style=${{ '--c': x[2] }}></i>${x[0]} ${f0(x[1])}</span>`)}</div></div>
      ${a.objectif !== 'neutre' && html`<div className="fld"><span className="fld-l">Ajuster l’intensité</span><${Seg} neutral label="Intensité" value=${a.intensite} onChange=${v => set({ intensite: v })} options=${Apex.intensites(a.objectif).map(x => [x[0], x[1]])} /></div>`}
      ${plan.warn.map((w, i) => html`<div key=${i} className="note"><${Icon} n="alert" /><div><span>${w}</span></div></div>`)}
      <p className="mut" style=${{ fontSize: 12 }}>Protéines ${f1(plan.salle.p / a.poids)} g/kg, lipides ${f1(plan.salle.l / a.poids)} g/kg, glucides pour le reste. Plancher de sécurité ${f0(plan.planchers.kcal)} kcal. Jours de salle un peu plus riches, jours de repos plus légers, pour la même moyenne.</p>`,
    claude: () => html`<h1>${STANDALONE ? 'Connecte une IA gratuite' : 'Lie Claude à ton compte'}</h1>
      <p className="sec">Avec une IA connectée, ton coach enregistre tes repas et tes séances quand tu lui parles, recale ta journée après un écart, et optimise ton programme selon tes points faibles. Sans IA, l’app fonctionne avec ses calculs.</p>
      <${ClaudeLink} onChange=${setLinked} />
      ${busy ? html`<div className="note acc"><${Icon} n="sparkles" /><div><span>${busy}</span></div></div>` : html`<button type="button" className="btn pri wide" onClick=${finish}><${Icon} n="check" s=${18} />${linked ? 'Créer mon plan avec Claude' : 'Créer mon plan sans Claude'}</button>`}`,
  };
  return ReactDOM.createPortal(html`<div className="wiz" role="dialog" aria-modal="true" aria-label="Configuration">
    <div className="wiz-top"><div className="wiz-bar" role="progressbar" aria-valuenow=${pct} aria-valuemin="0" aria-valuemax="100"><i style=${{ width: pct + '%' }}></i></div><span className="mut" style=${{ fontSize: 12 }}>${step + 1}/${steps.length}</span>
      ${(redo || cfg.q || step > 0) && html`<button type="button" className="ib sm" aria-label="Quitter" onClick=${() => { if (redo || cfg.q) { Store.patch('cfg', null, { onboarded: true }); onClose(); } else skip(); }}><${Icon} n="x" s=${18} /></button>`}</div>
    <div className="wiz-body"><div className="wiz-in">${cur !== 'intro' && html`<span className="kicker">Étape ${step + 1} sur ${steps.length}</span>`}${(body[cur] || body.intro)()}</div></div>
    <div className="wiz-foot"><div className="wiz-in" style=${{ gridTemplateColumns: 'auto 1fr', display: 'grid', gap: 10 }}>
      <button type="button" className="btn" disabled=${step === 0 || !!busy} onClick=${() => go(-1)}>Retour</button>
      ${!last ? html`<button type="button" className="btn pri" disabled=${!valid || cur === 'intro' && false} onClick=${() => go(1)}>${cur === 'intro' ? 'Commencer' : 'Suivant'}</button>` : html`<span></span>`}</div></div>
    ${scan && html`<${ScanSheet} title="Scanner ta whey" onClose=${() => setScan(false)} onProduct=${p => { set({ whey: { n: p.n, k: p.k, p: p.p, g: p.g, l: p.l, f: p.f, dose: p.dose || (a.whey && a.whey.dose) || 30, verified: true } }); setWmsg('Produit trouvé dans Open Food Facts. Vérifie la dose.'); }} />`}
  </div>`, document.body);
}

/* ---- 67-ui-ailink.js ---- */
/* ApexHQ — connexion à l'IA : le plus court possible.
   - Version Claude : le compte Claude de la personne (un seul clic « Autoriser »).
   - App autonome avec Gemini intégré (clé du propriétaire dans le build) : un seul clic « Activer l'IA gratuite ».
   - Sinon : clé Gemini perso en deux gestes (ouvrir Google AI Studio, puis « Coller et lier »).
   Plusieurs IA connectées = bascule automatique quand l'une atteint son quota. */
function ClaudeLink({ onChange }) {
  const st = useStore(), cfg = st.cfg(), caps = st.caps();
  const [gk, setGk] = useState(''); const [ak, setAk] = useState(''); const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const own = !!AI.ownG(), aOn = !!AI.getKey(), emb = STANDALONE && AI.embedded(), cons = AI.consent();
  const on = !!caps.sample && (STANDALONE ? !!(AI.getGKey() || aOn) : !!(cfg.claude && cfg.claude.on));
  const done = (ok, mode) => { if (ok && mode) Store.patch('cfg', null, { claude: { on: true, mode, at: new Date().toISOString() } }); if (!ok && !AI.hasAny() && STANDALONE) Store.patch('cfg', null, { claude: null }); if (onChange) onChange(ok); };
  const testClaude = async () => {
    setBusy('c'); setMsg('');
    try { await AI.test('claude', Store.caps().sample); setMsg('Claude est connecté.'); done(true, 'compte'); } catch (e) { setMsg(aiMsg(e) || 'Échec de la connexion.'); done(false); }
    setBusy('');
  };
  const activerInclus = async () => {
    setBusy('e'); setMsg(''); AI.setConsent('1'); Store.refreshAI();
    try { await AI.test('gemini'); setMsg('L’IA est activée.'); done(true, 'gemini'); } catch (e) { setMsg(aiMsg(e) || 'IA indisponible pour le moment.'); done(AI.hasAny(), 'gemini'); }
    setBusy('');
  };
  const link = (kind, key, setter, re, hint, mode) => async explicit => {
    const k = (typeof explicit === 'string' ? explicit : key).trim(); if (!re.test(k)) { setMsg(hint); return; }
    setBusy(kind); setMsg(''); (kind === 'g' ? AI.setGKey : AI.setKey)(k); Store.refreshAI();
    try { await AI.test(kind === 'g' ? 'gemini' : 'anthropic'); setter(''); setMsg((kind === 'g' ? 'Gemini' : 'Claude') + ' est connecté.'); done(true, mode); }
    catch (e) { (kind === 'g' ? AI.setGKey : AI.setKey)(''); Store.refreshAI(); setMsg(aiMsg(e) || 'Clé refusée.'); done(AI.hasAny()); }
    setBusy('');
  };
  const G_RE = /^AIza[0-9A-Za-z_\-]{30,}$/;
  const linkG = link('g', gk, setGk, G_RE, 'Une clé Gemini commence par « AIza ». Copie-la en entier depuis Google AI Studio.', 'gemini');
  const linkA = link('a', ak, setAk, /^sk-ant-[A-Za-z0-9_\-]{20,}$/, 'Une clé Anthropic commence par « sk-ant- ». Copie-la en entier depuis console.anthropic.com.', 'cle');
  const coller = async () => {
    try { const t = ((await navigator.clipboard.readText()) || '').trim(); if (G_RE.test(t)) { setGk(t); await linkG(t); } else setMsg('Copie d’abord ta clé sur Google AI Studio (elle commence par « AIza »), puis reviens ici.'); }
    catch (e) { setMsg('Ton navigateur bloque le collage automatique : colle la clé dans le champ ci-dessous.'); }
  };
  const unlink = kind => { (kind === 'g' ? AI.setGKey : AI.setKey)(''); Store.refreshAI(); setMsg('Clé retirée de cet appareil.'); done(AI.hasAny()); };
  const retest = kind => async () => { setBusy(kind); setMsg(''); try { await AI.test(kind === 'g' ? 'gemini' : 'anthropic'); setMsg('Connexion valide.'); } catch (e) { setMsg(aiMsg(e) || 'Échec.'); } setBusy(''); };
  const Key = (id, label, val, set, ph) => html`<label className="fld" htmlFor=${id}><span className="fld-l">${label}</span><input id=${id} className="inp" type="password" autoComplete="off" autoCapitalize="off" spellCheck="false" placeholder=${ph} value=${val} onChange=${e => set(e.target.value)} /></label>`;
  const privacy = html`<p className="mut" style=${{ fontSize: 12 }}>Gratuit, avec des limites par minute et par jour partagées : si elles sont atteintes, l’IA se met en pause un moment et le reste de l’app continue. Tes messages sont envoyés à Google ; avec le niveau gratuit, Google peut les réutiliser pour améliorer ses produits : n’y mets rien de sensible.</p>`;
  const gemini = own ? html`<div className="row"><${Pill} st="good">Ma clé Gemini<//><button type="button" className="btn sm" disabled=${!!busy} onClick=${retest('g')}>${busy === 'g' ? 'Test…' : 'Tester'}</button><${Confirm} label="Retirer" sure="Retirer ?" cls="ghost sm" onYes=${() => unlink('g')} /></div>`
    : html`<div className="stack">
      <div className="row"><a className="btn" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">1 · Ouvrir Google AI Studio</a><button type="button" className="btn pri" disabled=${!!busy} onClick=${coller}>${busy === 'g' ? 'Connexion…' : '2 · Coller et lier'}</button></div>
      <p className="mut" style=${{ fontSize: 12 }}>Sur AI Studio : « Create API key », copie la clé, reviens ici et touche « Coller et lier ».</p>
      ${Key('ai-gkey', 'Ou colle la clé ici', gk, setGk, 'AIza…')}${gk.trim() && html`<button type="button" className="btn wide" disabled=${!!busy} onClick=${linkG}>${busy === 'g' ? 'Connexion…' : 'Lier Gemini'}</button>`}</div>`;
  return html`<div className="stack">
    <div className="row sb"><b>Intelligence artificielle</b><${Pill} st=${on ? 'good' : ''}>${on ? 'Connectée' : 'Non connectée'}<//></div>
    ${STANDALONE ? html`<div className="stack">
      ${emb ? html`<div className="ai-card"><div className="row sb"><b>IA incluse · Gemini</b><span className="tag-free">Gratuit</span></div>
        ${cons === '1' ? html`<div className="row"><${Pill} st="good">Activée<//><${Confirm} label="Désactiver" sure="Désactiver ?" cls="ghost sm" onYes=${() => { AI.setConsent('0'); Store.refreshAI(); done(AI.hasAny()); setMsg('IA désactivée.'); }} /></div>`
          : html`<button type="button" className="btn pri wide" disabled=${!!busy} onClick=${activerInclus}><${Icon} n="sparkles" s=${18} />${busy === 'e' ? 'Activation…' : 'Activer l’IA gratuite'}</button>`}
        ${privacy}</div>
        <details className="ai-card"><summary><b>Utiliser ma propre clé Gemini</b> · quota perso</summary><div className="stack" style=${{ marginTop: 10 }}>${gemini}</div></details>`
      : html`<div className="ai-card"><div className="row sb"><b>Gemini</b><span className="tag-free">Gratuit</span></div>${gemini}${privacy}</div>`}
      <details className="ai-card"><summary><b>Claude (clé API payante)</b> · facultatif</summary>
        <div className="stack" style=${{ marginTop: 10 }}>
          <p className="sec" style=${{ fontSize: 13 }}>Une clé Anthropic (console.anthropic.com) sert de secours quand Gemini est saturé. Facturation à l’usage, séparée de l’abonnement Claude.</p>
          ${aOn ? html`<div className="row"><${Pill} st="good">Claude connecté<//><button type="button" className="btn sm" disabled=${!!busy} onClick=${retest('a')}>${busy === 'a' ? 'Test…' : 'Tester'}</button><${Confirm} label="Retirer" sure="Retirer ?" cls="ghost sm" onYes=${() => unlink('a')} /></div>`
            : html`${Key('ai-akey', 'Clé Anthropic', ak, setAk, 'sk-ant-…')}<button type="button" className="btn wide" disabled=${!!busy || !ak.trim()} onClick=${linkA}>${busy === 'a' ? 'Connexion…' : 'Lier Claude'}</button>`}
        </div></details>
      <p className="mut" style=${{ fontSize: 12 }}>Plusieurs IA connectées : l’app bascule toute seule sur la suivante quand l’une atteint son quota.</p>
    </div>` : html`<div className="stack">
      <p className="sec" style=${{ fontSize: 13 }}>Tu es connecté avec ton compte Claude : tes données ApexHQ sont liées à ce compte, dans une base privée. L’IA utilise le quota de ton abonnement Claude, y compris gratuit. Quand il est atteint, l’IA se met en pause jusqu’à sa réinitialisation et le reste de l’app continue. Au premier test, Claude te demande l’autorisation.</p>
      <div className="row"><button type="button" className=${cx('btn', !on && 'pri')} disabled=${!!busy} onClick=${testClaude}>${busy === 'c' ? 'Test…' : on ? 'Tester la connexion' : 'Autoriser et tester'}</button>
        ${on && html`<${Confirm} label="Désactiver" sure="Désactiver ?" cls="ghost" onYes=${() => { Store.patch('cfg', null, { claude: null }); setMsg('IA désactivée.'); if (onChange) onChange(false); }} />`}</div>
    </div>`}
    ${msg && html`<p className="sec" style=${{ fontSize: 13 }} role="status">${msg}</p>`}
  </div>`;
}

/* Bandeau « Activer l'IA gratuite » : un seul geste quand Gemini est intégré à l'app. */
function IABanner() {
  const st = useStore(), [sheet, setSheet] = useState(false); const [busy, setBusy] = useState(false);
  if (!STANDALONE || !AI.embedded() || AI.consent() || st.caps().sample) return null;
  const go = async () => { setBusy(true); AI.setConsent('1'); Store.refreshAI(); try { await AI.test('gemini'); Store.patch('cfg', null, { claude: { on: true, mode: 'gemini', at: new Date().toISOString() } }); toast('IA activée'); } catch (e) { toast(aiMsg(e) || 'IA indisponible pour le moment.'); } setBusy(false); setSheet(false); };
  return html`<div className="install" role="region" aria-label="IA gratuite">
    <i className="install-ic"><${Icon} n="sparkles" s=${22} /></i>
    <div className="install-t"><b>IA gratuite incluse</b><span>Coach, séances adaptées, debrief : un seul clic.</span></div>
    <button type="button" className="btn sm pri" onClick=${() => setSheet(true)}>Activer</button>
    <button type="button" className="ib sm" aria-label="Plus tard" onClick=${() => { AI.setConsent('0'); Store.refreshAI(); }}><${Icon} n="x" s=${16} /></button>
    ${sheet && html`<${Sheet} title="Activer l’IA gratuite" onClose=${() => setSheet(false)}>
      <p className="sec" style=${{ fontSize: 14 }}>ApexHQ utilise Google Gemini. Quand tu parles au coach, adaptes une séance ou lances un debrief, ton message et les données utiles (poids, repas, séances) sont envoyés à Google.</p>
      <div className="note"><${Icon} n="info" /><div><span>Niveau gratuit : limites partagées par minute et par jour, et Google peut réutiliser les échanges pour améliorer ses produits. N’écris rien de sensible. Tu peux désactiver l’IA à tout moment dans Réglages.</span></div></div>
      <button type="button" className="btn pri wide" disabled=${busy} onClick=${go}><${Icon} n="check" s=${18} />${busy ? 'Activation…' : 'J’accepte, activer l’IA'}</button>
      <button type="button" className="btn wide ghost" onClick=${() => { AI.setConsent('0'); Store.refreshAI(); setSheet(false); }}>Non merci, sans IA</button>
    <//>`}
  </div>`;
}

/* ---- 68-ui-custom.js ---- */
/* ApexHQ — personnalisation : séances, exercices, points faibles, compléments, aliments perso.
   Tout est stocké dans la config (cfg.seanceTypes, cfg.programme, cfg.exos, cfg.focus, cfg.supps, cfg.aliments). */

/* Champ texte : valide à la perte de focus ou sur Entrée. */
function Txt({ id, label, value, onCommit, max, placeholder }) {
  const [t, setT] = useState(value || ''); const foc = useRef(false);
  useEffect(() => { if (!foc.current) setT(value || ''); }, [value]);
  const commit = () => { const v = t.trim().slice(0, max || 40); if (v && v !== (value || '')) onCommit(v); else setT(value || ''); };
  return html`<label className="fld" htmlFor=${id}>${label && html`<span className="fld-l">${label}</span>`}
    <input id=${id} className="inp" type="text" maxLength=${max || 40} value=${t} placeholder=${placeholder || ''} autoComplete="off"
      onFocus=${() => { foc.current = true; }} onChange=${e => setT(e.target.value)} onBlur=${() => { foc.current = false; commit(); }} onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); }} /></label>`;
}

/* ---------- séances ---------- */
function ExoAdmin({ onClose }) {
  const st = useStore(), cfg = st.cfg(), exos = Apex.allExos(cfg); const [q, setQ] = useState(''); const [sel, setSel] = useState(''); const [mk, setMk] = useState(false);
  const e = sel ? exos[sel] : null, custom = e && String(e.id).indexOf('c_') === 0;
  const put = f => { const all = Object.assign({}, cfg.exos || {}); all[e.id] = Object.assign({}, e, f); Store.patch('cfg', null, { exos: all }); };
  const del = () => {
    const all = Object.assign({}, cfg.exos || {}); delete all[e.id]; const pr = Apex.progOf(cfg), tp = Apex.types(cfg), o = {};
    tp.forEach(t => { o[t] = (pr[t] || []).filter(x => x[0] !== e.id).map(x => ({ e: x[0], n: x[1] })); });
    Store.patch('cfg', null, { exos: all, programme: o, seanceTypes: tp }); setSel(''); toast('Exercice supprimé');
  };
  const list = Object.keys(exos).map(k => exos[k]).filter(x => !q || norm(x.n).indexOf(norm(q)) >= 0).sort((a, b) => a.n.localeCompare(b.n, 'fr'));
  return html`<${Sheet} title=${e ? e.n : 'Mes exercices'} onClose=${onClose}>
    ${e ? html`<div className="stack">
      <${Txt} id="xe-n" label="Nom" value=${e.n} max=${60} onCommit=${v => put({ n: v })} />
      <label className="fld" htmlFor="xe-m"><span className="fld-l">Muscle principal</span><select id="xe-m" className="inp" value=${e.m} onChange=${ev => put({ m: ev.target.value })}>${Object.keys(Apex.MUSCLES).map(k => html`<option key=${k} value=${k}>${Apex.MUSCLES[k]}</option>`)}</select></label>
      <div className="form" style=${{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <${Num} id="xe-lo" label="Rép. min" value=${e.lo} onChange=${v => { if (v != null) put({ lo: Math.max(1, v), hi: Math.max(e.hi, v) }); }} dec=${0} min=${1} max=${50} />
        <${Num} id="xe-hi" label="Rép. max" value=${e.hi} onChange=${v => { if (v != null) put({ hi: Math.max(e.lo, v) }); }} dec=${0} min=${1} max=${60} />
        <${Num} id="xe-inc" label="Pas de charge" unit="kg" value=${e.inc} onChange=${v => { if (v != null && v > 0) put({ inc: v }); }} dec=${2} min=${0.25} max=${20} />
      </div>
      <p className="mut" style=${{ fontSize: 12 }}>Double progression : quand toutes les séries atteignent le max de répétitions, l’objectif suivant ajoute le pas de charge.</p>
      <div className="row sb"><button type="button" className="btn" onClick=${() => setSel('')}>Retour</button>${custom && html`<${Confirm} label="Supprimer" sure="Supprimer ?" icon="trash" onYes=${del} />`}</div>
    </div>` : html`<${React.Fragment}>
      <input id="xa-q" className="inp" type="search" placeholder="Chercher un exercice" value=${q} onChange=${ev => setQ(ev.target.value)} aria-label="Chercher un exercice" />
      <button type="button" className="btn" onClick=${() => setMk(true)}><${Icon} n="plus" s=${18} />Nouvel exercice</button>
      <div className="lst">${list.map(x => html`<button key=${x.id} type="button" onClick=${() => setSel(x.id)}><div><b>${x.n}</b><span>${Apex.MUSCLES[x.m] || x.m} · ${x.lo}–${x.hi} rép. · +${fq(x.inc)} kg${String(x.id).indexOf('c_') === 0 ? ' · perso' : ''}</span></div><em></em></button>`)}</div>
    <//>`}
    ${mk && html`<${ExoSheet} exos=${exos} title="Nouvel exercice" onClose=${() => setMk(false)} onPick=${id => setSel(id)} />`}
  <//>`;
}

function SeancesEditor() {
  const st = useStore(), cfg = st.cfg(), exos = Apex.allExos(cfg), types = Apex.types(cfg), prog = Apex.progOf(cfg);
  const [open, setOpen] = useState(''); const [nn, setNn] = useState(''); const [msg, setMsg] = useState(''); const [sheet, setSheet] = useState(null);
  const P = () => { const o = {}; types.forEach(t => { o[t] = (prog[t] || []).map(x => ({ e: x[0], n: x[1] })); }); return o; };
  const save = (tp, pr, pl) => { const f = { seanceTypes: tp, programme: pr }; if (pl) f.planning = pl; Store.patch('cfg', null, f); };
  const upd = (t, fn) => { const o = P(); o[t] = fn(o[t] || []); save(types, o); };
  const exists = (v, but) => types.some(x => x !== but && x.toLowerCase() === v.toLowerCase());
  const addType = () => { const v = nn.trim().slice(0, 24); if (!v) return; if (exists(v)) { setMsg('Une séance porte déjà ce nom.'); return; } const o = P(); o[v] = []; save(types.concat(v), o); setNn(''); setMsg(''); setOpen(v); };
  const rename = (old, nw) => {
    if (exists(nw, old)) { setMsg('Une séance porte déjà ce nom.'); return; }
    const o = P(); o[nw] = o[old]; delete o[old]; const pl = Object.assign({}, cfg.planning); Object.keys(pl).forEach(k => { if (pl[k] === old) pl[k] = nw; });
    save(types.map(x => (x === old ? nw : x)), o, pl); setOpen(nw); setMsg('Renommée. Les séances déjà faites gardent l’ancien nom.');
  };
  const delType = t => { if (types.length <= 1) { setMsg('Garde au moins une séance.'); return; } const o = P(); delete o[t]; const pl = Object.assign({}, cfg.planning); Object.keys(pl).forEach(k => { if (pl[k] === t) pl[k] = ''; }); save(types.filter(x => x !== t), o, pl); setMsg('Séance supprimée. Ses jours du planning passent en repos.'); };
  const reset = () => { Store.patch('cfg', null, { seanceTypes: null, programme: null, planning: Apex.DEFAULT_CFG.planning }); setMsg('Programme et planning par défaut rétablis.'); };
  const swap = (t, i, k) => upd(t, a => { const b = a.slice(); const x = b[i]; b[i] = b[k]; b[k] = x; return b; });
  return html`<div className="stack">
    <p className="mut" style=${{ fontSize: 12 }}>Crée, renomme et réordonne tes séances, choisis leurs exercices et le nombre de séries. Le planning de la semaine se règle dans l’onglet Profil.</p>
    ${types.map(t => { const list = prog[t] || [], on = open === t; return html`<article key=${t} className="meal">
      <button type="button" className="meal-h" style=${{ width: '100%', textAlign: 'left', gridTemplateColumns: 'minmax(0, 1fr) auto' }} aria-expanded=${on} onClick=${() => setOpen(on ? '' : t)}>
        <div className="meal-t"><b>${t}</b><span>${list.length} exercice${list.length > 1 ? 's' : ''} · ${list.reduce((s, x) => s + x[1], 0)} séries</span></div><${Icon} n=${on ? 'up' : 'down'} s=${18} /></button>
      ${on && html`<div className="its">
        <div style=${{ padding: '10px 14px' }}><${Txt} id=${'tn-' + t} label="Nom de la séance" value=${t} max=${24} onCommit=${v => rename(t, v)} /></div>
        ${list.map((x, i) => { const e = exos[x[0]]; return html`<div key=${x[0] + '-' + i} className="it">
          <div className="it-n"><b>${e ? e.n : x[0]}</b><span>${e ? (Apex.MUSCLES[e.m] || e.m) + ' · ' + e.lo + '–' + e.hi + ' rép.' : 'exercice supprimé'}</span></div>
          <div className="row" style=${{ gap: 0, flexWrap: 'nowrap' }}>
            <button type="button" className="ib sm" aria-label=${'Moins de séries : ' + (e ? e.n : x[0])} onClick=${() => upd(t, a => a.map((y, k) => (k === i ? { e: y.e, n: Math.max(1, y.n - 1) } : y)))}><${Icon} n="minus" s=${16} /></button>
            <b className="num" style=${{ minWidth: 22, textAlign: 'center', fontSize: 17 }}>${x[1]}</b>
            <button type="button" className="ib sm" aria-label=${'Plus de séries : ' + (e ? e.n : x[0])} onClick=${() => upd(t, a => a.map((y, k) => (k === i ? { e: y.e, n: Math.min(10, y.n + 1) } : y)))}><${Icon} n="plus" s=${16} /></button>
            <button type="button" className="ib sm" aria-label="Monter" disabled=${i === 0} onClick=${() => swap(t, i, i - 1)}><${Icon} n="up" s=${16} /></button>
            <button type="button" className="ib sm" aria-label="Descendre" disabled=${i === list.length - 1} onClick=${() => swap(t, i, i + 1)}><${Icon} n="down" s=${16} /></button>
            <button type="button" className="ib sm" aria-label="Retirer de la séance" onClick=${() => upd(t, a => a.filter((_, k) => k !== i))}><${Icon} n="x" s=${16} /></button>
          </div></div>`; })}
        ${!list.length && html`<div className="empty" style=${{ padding: '10px 14px' }}><span>Séance vide. Ajoute des exercices.</span></div>`}
        <div className="meal-f"><button type="button" className="btn sm ghost" onClick=${() => setSheet({ t })}><${Icon} n="plus" s=${16} />Exercice</button>
          <${Confirm} label="Supprimer la séance" sure="Supprimer ?" cls="ghost" onYes=${() => delType(t)} /></div>
      </div>`}
    </article>`; })}
    <div className="row"><input id="nt-name" className="inp grow" type="text" maxLength="24" placeholder="Nouvelle séance (Bras, Haut du corps…)" value=${nn} onChange=${e => { setNn(e.target.value); setMsg(''); }} onKeyDown=${e => { if (e.key === 'Enter') addType(); }} aria-label="Nom de la nouvelle séance" />
      <button type="button" className="btn" disabled=${!nn.trim()} onClick=${addType}><${Icon} n="plus" s=${18} />Ajouter</button></div>
    ${msg && html`<p className="sec" style=${{ fontSize: 13 }} role="status">${msg}</p>`}
    <div className="row sb"><div className="row"><button type="button" className="btn sm" onClick=${() => setSheet({ week: true })}><${Icon} n="sparkles" s=${16} />Ma semaine selon mes dispos</button><button type="button" className="btn sm" onClick=${() => setSheet({ admin: true })}>Mes exercices</button></div>
      <${Confirm} label="Programme par défaut" sure="Tout rétablir ?" cls="ghost" onYes=${reset} /></div>
    ${sheet && sheet.t && html`<${ExoSheet} exos=${exos} title=${'Ajouter à ' + sheet.t} onClose=${() => setSheet(null)} onPick=${id => upd(sheet.t, a => a.concat({ e: id, n: 3 }))} />`}
    ${sheet && sheet.admin && html`<${ExoAdmin} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.week && html`<${WeekSheet} onClose=${() => setSheet(null)} />`}
  </div>`;
}

/* ---------- points faibles ---------- */
const PRESETS = [['Dos', ['dos'], 14, 20, 2], ['Jambes', ['quad', 'isch', 'fess'], 12, 20, 2], ['Triceps', ['tri'], 10, 14, 2], ['Épaules arrière', ['dPost'], 8, 14, 2], ['Mollets', ['mol'], 8, 14, 2], ['Abdos', ['abd'], 6, 12, 2], ['Épaules avant', ['dAnt'], 6, 10, 2]];
function FocusEditor() {
  const st = useStore(), cfg = st.cfg(), GR = Apex.groupes(cfg), arr = Object.keys(GR).map(k => GR[k]);
  const put = a => Store.patch('cfg', null, { focus: a });
  const upd = (id, f) => put(arr.map(g => (g.id === id ? Object.assign({}, g, f) : g)));
  const togM = (g, m) => { const has = g.m.indexOf(m) >= 0; if (has && g.m.length === 1) return; upd(g.id, { m: has ? g.m.filter(x => x !== m) : g.m.concat(m) }); };
  const setMin = (g, v) => { if (v == null) return; const mn = Math.max(1, Math.round(v)); upd(g.id, { min: mn, max: Math.max(g.max, mn) }); };
  const setMax = (g, v) => { if (v == null) return; upd(g.id, { max: Math.max(g.min, Math.round(v)) }); };
  const have = arr.map(g => g.n.toLowerCase());
  return html`<div className="stack">
    <p className="mut" style=${{ fontSize: 12 }}>Tes muscles prioritaires. L’app compte les séries directes de la semaine pour chacun, prévient si le volume projeté ou la fréquence sont sous ta cible, et suit la force de son exercice le plus noté.</p>
    ${arr.map(g => html`<article key=${g.id} className="meal"><div className="its" style=${{ borderTop: 0, padding: '12px 14px', display: 'grid', gap: 12 }}>
      <div className="row sb"><div className="grow"><${Txt} id=${'fn-' + g.id} label="Nom" value=${g.n} max=${30} onCommit=${v => upd(g.id, { n: v })} /></div>
        <${Confirm} label="Retirer" sure="Retirer ?" cls="ghost" onYes=${() => put(arr.filter(x => x.id !== g.id))} /></div>
      <div className="stack"><span className="fld-l">Muscles comptés</span>
        <div className="chips">${Object.keys(Apex.MUSCLES).map(m => html`<button key=${m} type="button" className="chip" aria-pressed=${g.m.indexOf(m) >= 0} onClick=${() => togM(g, m)}>${Apex.MUSCLES[m]}</button>`)}</div></div>
      <div className="form f4">
        <${Num} id=${'fmin-' + g.id} label="Séries min" value=${g.min} onChange=${v => setMin(g, v)} dec=${0} min=${1} max=${60} />
        <${Num} id=${'fmax-' + g.id} label="Séries max" value=${g.max} onChange=${v => setMax(g, v)} dec=${0} min=${1} max=${80} />
        <${Num} id=${'ffq-' + g.id} label="Fois / sem." value=${g.freq} onChange=${v => { if (v != null) upd(g.id, { freq: Math.max(1, Math.min(7, Math.round(v))) }); }} dec=${0} min=${1} max=${7} />
        ${g.sub && html`<${Num} id=${'fsub-' + g.id} label=${'Min. « ' + g.sub.n + ' »'} value=${g.sub.min} onChange=${v => { if (v != null) upd(g.id, { sub: Object.assign({}, g.sub, { min: Math.max(1, Math.round(v)) }) }); }} dec=${0} min=${1} max=${40} />`}
      </div>
    </div></article>`)}
    ${!arr.length && html`<div className="empty"><span><b>Aucun point faible.</b> Ajoutes-en : l’onglet Training affichera leur volume et leurs alertes.</span></div>`}
    ${arr.length < 8 && html`<div className="stack"><span className="fld-l">Ajouter un groupe</span><div className="chips">
      ${PRESETS.filter(p => have.indexOf(p[0].toLowerCase()) < 0).map(p => html`<button key=${p[0]} type="button" className="chip" onClick=${() => put(arr.concat({ id: 'g_' + Apex.uid(), n: p[0], m: p[1], min: p[2], max: p[3], freq: p[4] }))}><${Icon} n="plus" s=${14} />${p[0]}</button>`)}
      <button type="button" className="chip" onClick=${() => put(arr.concat({ id: 'g_' + Apex.uid(), n: 'Nouveau groupe', m: ['pec'], min: 10, max: 16, freq: 2 }))}><${Icon} n="plus" s=${14} />Autre…</button></div></div>`}
    <div className="row sb"><span className="mut" style=${{ fontSize: 12 }}>${cfg.focus ? 'Liste personnalisée' : 'Liste par défaut : pectoraux, biceps, deltoïdes latéraux'}</span>
      ${cfg.focus && html`<${Confirm} label="Rétablir" sure="Rétablir la liste ?" cls="ghost" onYes=${() => Store.patch('cfg', null, { focus: null })} />`}</div>
  </div>`;
}

/* ---------- compléments ---------- */
function SuppEditor() {
  const st = useStore(), cfg = st.cfg(), L = Apex.supps(cfg); const [nn, setNn] = useState('');
  const put = a => Store.patch('cfg', null, { supps: a });
  const add = () => { const v = nn.trim().slice(0, 40); if (!v || L.length >= 16) return; put(L.concat({ id: 's_' + Apex.uid(), n: v, note: '' })); setNn(''); };
  return html`<div className="stack">
    <h3>Mes compléments</h3>
    ${L.map(x => html`<div key=${x.id} className="row" style=${{ alignItems: 'end', flexWrap: 'nowrap' }}>
      <div className="grow"><${Txt} id=${'sn-' + x.id} label="Nom" value=${x.n} max=${40} onCommit=${v => put(L.map(y => (y.id === x.id ? Object.assign({}, y, { n: v }) : y)))} /></div>
      <div className="grow"><${Txt} id=${'so-' + x.id} label="Quand" value=${x.note} max=${40} placeholder="le soir, avec un repas…" onCommit=${v => put(L.map(y => (y.id === x.id ? Object.assign({}, y, { note: v }) : y)))} /></div>
      <button type="button" className="ib" aria-label=${'Retirer ' + x.n} onClick=${() => put(L.filter(y => y.id !== x.id))}><${Icon} n="trash" s=${18} /></button></div>`)}
    ${!L.length && html`<p className="mut" style=${{ fontSize: 13 }}>Aucun complément.</p>`}
    <div className="row"><input id="sp-new" className="inp grow" type="text" maxLength="40" placeholder="Nouveau complément (magnésium, caféine…)" value=${nn} onChange=${e => setNn(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') add(); }} aria-label="Nom du nouveau complément" />
      <button type="button" className="btn" disabled=${!nn.trim()} onClick=${add}><${Icon} n="plus" s=${18} />Ajouter</button></div>
    ${cfg.supps && html`<div className="row"><${Confirm} label="Liste par défaut" sure="Rétablir ?" cls="ghost" onYes=${() => put(null)} /></div>`}
  </div>`;
}

/* ---------- aliments perso ---------- */
function FoodsEditor() {
  const st = useStore(), cfg = st.cfg(); const [scan, setScan] = useState(false); const [f, setF] = useState({ n: '', k: null, p: null, g: null, l: null, f: null, r: '' });
  const mine = Object.keys(cfg.aliments || {}).filter(k => k.indexOf('u_') === 0).map(k => cfg.aliments[k]);
  const ok = f.n.trim() && f.k != null;
  const add = () => {
    if (!ok) return; const id = 'u_' + Apex.uid();
    Store.patch('cfg', null, { aliments: Object.assign({}, cfg.aliments, { [id]: { id, n: f.n.trim().slice(0, 60), c: 'perso', r: f.r, k: f.k, p: f.p || 0, g: f.g || 0, l: f.l || 0, f: f.f || 0, d: 100, u: null } }) });
    setF({ n: '', k: null, p: null, g: null, l: null, f: null, r: '' }); toast('Aliment ajouté à ta base');
  };
  const del = id => { const a = Object.assign({}, cfg.aliments); delete a[id]; Store.patch('cfg', null, { aliments: a }); };
  return html`<div className="stack">
    <h3>Mes aliments (pour 100 g)</h3>
    ${CAN_SCAN && html`<button type="button" className="btn" onClick=${() => setScan(true)}><${Icon} n="camera" s=${18} />Scanner un produit</button>`}
    ${scan && html`<${ScanSheet} onClose=${() => setScan(false)} onProduct=${p => { ajouterProduit(p); toast('Produit ajouté à ta base'); }} />`}
    ${mine.map(x => html`<div key=${x.id} className="mini"><span><b style=${{ color: 'var(--ink)', fontWeight: 500 }}>${x.n}</b><br />${f0(x.k)} kcal · P ${fq(x.p)} · G ${fq(x.g)} · L ${fq(x.l)}${x.u ? ' · par portion' : ''}</span><span></span>
      <${Confirm} label="Retirer" sure="Retirer ?" cls="ghost" onYes=${() => del(x.id)} /></div>`)}
    ${!mine.length && html`<p className="mut" style=${{ fontSize: 13 }}>Aucun aliment perso. Ajoute ceux que tu manges souvent : ils apparaissent dans la recherche d’aliments.</p>`}
    <label className="fld" htmlFor="uf-n"><span className="fld-l">Nom</span><input id="uf-n" className="inp" type="text" maxLength="60" placeholder="Poulet rôti, Skyr vanille…" value=${f.n} onChange=${e => setF(Object.assign({}, f, { n: e.target.value }))} /></label>
    <div className="form f4">
      <${Num} id="uf-k" label="kcal" value=${f.k} onChange=${v => setF(Object.assign({}, f, { k: v }))} dec=${0} min=${0} max=${950} />
      <${Num} id="uf-p" label="Protéines" value=${f.p} onChange=${v => setF(Object.assign({}, f, { p: v }))} dec=${1} min=${0} max=${100} />
      <${Num} id="uf-g" label="Glucides" value=${f.g} onChange=${v => setF(Object.assign({}, f, { g: v }))} dec=${1} min=${0} max=${100} />
      <${Num} id="uf-l" label="Lipides" value=${f.l} onChange=${v => setF(Object.assign({}, f, { l: v }))} dec=${1} min=${0} max=${100} />
    </div>
    <label className="fld" htmlFor="uf-r"><span className="fld-l">Rôle dans le recalage du plan</span><select id="uf-r" className="inp" value=${f.r} onChange=${e => setF(Object.assign({}, f, { r: e.target.value }))}>
      <option value="">Neutre : quantité jamais modifiée</option><option value="P">Protéines : ajustable pour tenir la cible</option><option value="G">Glucides : ajustable pour boucler les kcal</option><option value="L">Lipides : ajustable</option></select></label>
    <button type="button" className="btn wide" disabled=${!ok} onClick=${add}><${Icon} n="plus" s=${18} />Ajouter à ma base</button>
  </div>`;
}

/* ---- 69-ui-share.js ---- */
/* ApexHQ — partage, installation et mises à jour de l'app autonome.
   - Lien + QR code pour la faire essayer à des amis (chacun a ses propres données, sur son téléphone).
   - Bouton « Installer » (Android) ou mode d'emploi (iPhone).
   - Vérification de version à chaque ouverture : l'app se met à jour seule, sans désinstaller. */
const PUBLIC_URL = window.APEX_URL || 'https://blueskyte.github.io/apexhq/';
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };

/* Compare la version publiée à celle qui tourne ; recharge si elle a changé (une seule fois par version). */
async function checkUpdate(manual) {
  if (!STANDALONE) return;
  try {
    const r = await fetch('version.json?cb=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('http');
    const j = await r.json(), cur = window.APEX_VERSION;
    if (j && j.v && cur && j.v !== cur) {
      let done = ''; try { done = sessionStorage.getItem('apexhq:rl') || ''; } catch (e) { done = ''; }
      if (done === j.v) { if (manual) toast('Mise à jour déjà demandée : ferme et rouvre l’app.'); return; }
      try { sessionStorage.setItem('apexhq:rl', j.v); } catch (e) { /* sans effet */ }
      toast('Mise à jour en cours…');
      try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (e) { /* le rechargement suffit */ }
      setTimeout(() => location.reload(), 700);
    } else if (manual) toast('ApexHQ est à jour (version ' + cur + ').');
  } catch (e) { if (manual) toast('Vérification impossible : es-tu connecté à internet ?'); }
}

function InstallHelp() {
  const bip = !!window.__bip;
  const go = async () => { if (!window.__bip) return; try { window.__bip.prompt(); await window.__bip.userChoice; } catch (e) { /* refusé */ } window.__bip = null; window.dispatchEvent(new Event('apex-bip')); };
  return html`<div className="stack">
    ${bip && html`<button type="button" className="btn pri wide" onClick=${go}><${Icon} n="download" s=${18} />Installer l’application</button>`}
    <div className="ai-card"><b>Android · Chrome</b><p className="sec" style=${{ fontSize: 13 }}>Ouvre le lien dans Chrome, touche le menu ⋮, puis « Installer l’application » (ou « Ajouter à l’écran d’accueil »).</p></div>
    <div className="ai-card"><b>iPhone · Safari</b><p className="sec" style=${{ fontSize: 13 }}>Ouvre le lien dans Safari (pas dans une autre app), touche le bouton Partager, puis « Sur l’écran d’accueil ».</p></div>
    <p className="mut" style=${{ fontSize: 12 }}>Mises à jour automatiques : l’app se met à jour toute seule à chaque ouverture. Rien à désinstaller.</p>
  </div>`;
}

function ShareBody() {
  const [copied, setCopied] = useState(false); const inp = useRef(null);
  const copy = async () => { try { await navigator.clipboard.writeText(PUBLIC_URL); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { if (inp.current) { inp.current.focus(); inp.current.select(); } toast('Sélectionne le lien et copie-le.'); } };
  const share = async () => { try { await navigator.share({ title: 'ApexHQ', text: 'Essaie ApexHQ : suivi de sèche, repas et séances.', url: PUBLIC_URL }); } catch (e) { /* annulé */ } };
  return html`<div className="stack">
    <p className="sec" style=${{ fontSize: 13 }}>Fais essayer ApexHQ à tes amis : gratuit, sans compte. Chacun a ses propres données, gardées sur son téléphone. Ce lien ne partage rien de toi.</p>
    <div className="row" style=${{ flexWrap: 'nowrap' }}><input ref=${inp} className="inp grow" readOnly value=${PUBLIC_URL} aria-label="Lien de l’application" onFocus=${e => e.target.select()} />
      <button type="button" className="btn" onClick=${copy}><${Icon} n=${copied ? 'check' : 'copy'} s=${18} />${copied ? 'Copié' : 'Copier'}</button></div>
    ${typeof navigator.share === 'function' && html`<button type="button" className="btn pri wide" onClick=${share}><${Icon} n="upload" s=${18} />Envoyer le lien</button>`}
    ${window.APEX_QR && html`<div className="qr" role="img" aria-label="QR code du lien" dangerouslySetInnerHTML=${{ __html: window.APEX_QR }}></div>`}
    ${window.APEX_QR && html`<p className="mut" style=${{ fontSize: 12, textAlign: 'center' }}>Tes amis scannent ce QR code avec l’appareil photo de leur téléphone.</p>`}
    <h3>Installer</h3><${InstallHelp} />
  </div>`;
}

function InstallBanner() {
  const [, bump] = useState(0); const [sheet, setSheet] = useState(false);
  const [hide, setHide] = useState(() => { try { return !!localStorage.getItem('apexhq:nobanner'); } catch (e) { return false; } });
  useEffect(() => { const f = () => bump(x => x + 1); window.addEventListener('apex-bip', f); window.addEventListener('appinstalled', f); return () => { window.removeEventListener('apex-bip', f); window.removeEventListener('appinstalled', f); }; }, []);
  if (!STANDALONE || hide || isInstalled()) return null;
  const install = async () => { if (window.__bip) { try { window.__bip.prompt(); await window.__bip.userChoice; } catch (e) { /* refusé */ } window.__bip = null; bump(x => x + 1); } else setSheet(true); };
  const dismiss = () => { try { localStorage.setItem('apexhq:nobanner', '1'); } catch (e) { /* sans effet */ } setHide(true); };
  return html`<div className="install" role="region" aria-label="Installer l’application">
    <i className="install-ic"><${Icon} n="apex" s=${22} w=${2} /></i>
    <div className="install-t"><b>Installe ApexHQ</b><span>Icône sur l’écran d’accueil, plein écran, hors ligne.</span></div>
    <button type="button" className="btn sm pri" onClick=${install}>${window.__bip ? 'Installer' : 'Comment ?'}</button>
    <button type="button" className="ib sm" aria-label="Masquer" onClick=${dismiss}><${Icon} n="x" s=${16} /></button>
    ${sheet && html`<${Sheet} title="Installer ApexHQ" onClose=${() => setSheet(false)}><${InstallHelp} /><//>`}
  </div>`;
}

/* ---- 70-ui-app.js ---- */
/* ApexHQ — coque : en-tête (jour + statut), onglets, réglages et données, démarrage. */
const STANDALONE = !!window.APEX_STANDALONE;
const TABS_ALL = [['dashboard', 'Jour', 'home'], ['repas', 'Repas', 'utensils'], ['training', 'Training', 'dumbbell'], ['coach', 'Coach', 'chat'], ['analytics', 'Analyse', 'chart']];
const tabOf = () => { let h = ''; try { h = (location.hash || '').replace('#', ''); } catch (e) { h = ''; } return TABS_ALL.some(t => t[0] === h) ? h : 'dashboard'; };
const SYNC = { boot: ['', 'Connexion…'], wait: ['pend', 'Connexion…'], local: ['', 'Sur cet appareil'], ok: ['ok', 'Synchronisé'], stale: ['pend', 'Hors ligne'], err: ['err', 'Synchro en erreur'] };
const JOURS = [[1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [0, 'Dimanche']];

function SettingsSheet({ onClose }) {
  const st = useStore(), cfg = st.cfg(), sy = st.sync(), foods = Apex.allFoods(cfg);
  const [sec, setSec] = useState('profil'); const [imp, setImp] = useState(''); const [msg, setMsg] = useState(''); const [dump, setDump] = useState('');
  const setP = k => v => { if (v != null) Store.patch('cfg', null, { profil: Object.assign({}, cfg.profil, { [k]: v }) }); };
  const setC = (s, k) => v => { if (v == null) return; const o = Object.assign({}, cfg.cibles[s], { [k]: v }); o.g = Math.max(0, Math.round((o.kcal - o.p * 4 - o.l * 9) / 4)); Store.patch('cfg', null, { cibles: Object.assign({}, cfg.cibles, { [s]: o }) }); };
  const setFood = (id, k) => v => { if (v == null) return; const f = Object.assign({}, foods[id]); if (k === 'dose') f.u = [f.u[0].replace(/[\d.,]+ ?g/, fq(v) + ' g'), v]; else f[k] = v; f.etq = 0; Store.patch('cfg', null, { aliments: Object.assign({}, cfg.aliments, { [id]: f }) }); };
  const exp = async () => {
    const txt = JSON.stringify(Store.exportAll(), null, 1), dl = st.caps().downloads; setMsg('');
    if (dl) { try { await dl.save({ filename: 'apexhq-' + Apex.today() + '.json', data: txt }); toast('Export enregistré'); } catch (e) { if (!e || e.code !== 'declined') setDump(txt); } return; }
    if (STANDALONE) { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = 'apexhq-' + Apex.today() + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Export téléchargé'); return; } catch (e) { /* repli ci-dessous */ } }
    try { await navigator.clipboard.writeText(txt); toast('Export copié dans le presse-papiers'); } catch (e) { setDump(txt); }
  };
  const doImp = () => { try { const n = Store.importAll(JSON.parse(imp)); setImp(''); setMsg(n + ' document' + (n > 1 ? 's' : '') + ' importé' + (n > 1 ? 's' : '') + '.'); } catch (e) { setMsg(e instanceof SyntaxError ? 'JSON illisible : colle le contenu complet du fichier exporté.' : e.message); } };
  const cib = s => html`<div className="form f4">
    <${Num} id=${'c-' + s + '-k'} label="kcal" value=${cfg.cibles[s].kcal} onChange=${setC(s, 'kcal')} dec=${0} min=${cfg.cibles.planchers.kcal} max=${5000} />
    <${Num} id=${'c-' + s + '-p'} label="Protéines" unit="g" value=${cfg.cibles[s].p} onChange=${setC(s, 'p')} dec=${0} min=${cfg.cibles.planchers.p} max=${300} />
    <${Num} id=${'c-' + s + '-l'} label="Lipides" unit="g" value=${cfg.cibles[s].l} onChange=${setC(s, 'l')} dec=${0} min=${cfg.cibles.planchers.l} max=${200} />
    <div className="fld"><span className="fld-l">Glucides</span><div className="inp" style=${{ display: 'grid', alignItems: 'center' }}>${cfg.cibles[s].g} g</div></div>
  </div>`;
  const SECS = [['profil', 'Profil'], ['seances', 'Séances'], ['focus', 'Points faibles'], ['repas', 'Repas'], ['claude', 'IA'], ['partage', 'Partager'], ['data', 'Données']];
  return html`<${Sheet} title="Réglages et données" onClose=${onClose}>
    <div className="chips" role="group" aria-label="Sections">${SECS.map(x => html`<button key=${x[0]} type="button" className="chip" aria-pressed=${sec === x[0]} onClick=${() => setSec(x[0])}>${x[1]}</button>`)}</div>
    ${sec === 'profil' && html`<${React.Fragment}>
    <button type="button" className="btn wide" onClick=${() => { Store.patch('cfg', null, { onboarded: false }); onClose(); }}><${Icon} n="sparkles" s=${18} />Refaire le questionnaire de démarrage</button>
    <h3>Profil</h3>
    <div className="form">
      <${Num} id="p-taille" label="Taille" unit="cm" value=${cfg.profil.taille} onChange=${setP('taille')} dec=${1} min=${120} max=${230} />
      <${Num} id="p-age" label="Âge" unit="ans" value=${cfg.profil.age} onChange=${setP('age')} dec=${0} min=${14} max=${90} />
      <${Num} id="p-dep" label="Poids de départ" unit="kg" value=${cfg.profil.poidsDepart} onChange=${setP('poidsDepart')} dec=${1} min=${40} max=${200} />
      <${Num} id="p-cib" label="Poids cible" unit="kg" value=${cfg.profil.poidsCible} onChange=${setP('poidsCible')} dec=${1} min=${40} max=${200} />
      <label className="fld" htmlFor="p-date"><span className="fld-l">Début de sèche</span><input id="p-date" className="inp" type="date" value=${cfg.profil.dateDepart} onChange=${e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setP('dateDepart')(e.target.value); }} /></label>
      <${Num} id="p-nap" label="NAP (activité)" value=${cfg.profil.nap} onChange=${setP('nap')} dec=${2} min=${1.2} max=${2.4} />
    </div>
    <h3>Cibles · jour de salle</h3>${cib('salle')}
    <h3>Cibles · jour de repos</h3>${cib('repos')}
    <p className="mut" style=${{ fontSize: 12 }}>Glucides = (kcal − 4 × protéines − 9 × lipides) / 4. Planchers fixes : ${f0(cfg.cibles.planchers.kcal)} kcal, ${cfg.cibles.planchers.p} g de protéines, ${cfg.cibles.planchers.l} g de lipides.</p>
    <h3>Planning hebdo</h3>
    <div className="form">${JOURS.map(d => html`<label key=${d[0]} className="fld" htmlFor=${'pl-' + d[0]}><span className="fld-l">${d[1]}</span>
      <select id=${'pl-' + d[0]} className="inp" value=${cfg.planning[d[0]] || ''} onChange=${e => Store.patch('cfg', null, { planning: Object.assign({}, cfg.planning, { [d[0]]: e.target.value }) })}>
        <option value="">Repos</option>${Apex.types(cfg).map(t => html`<option key=${t} value=${t}>${t}</option>`)}</select></label>`)}
      <label className="fld" htmlFor="pl-ph"><span className="fld-l">Jour photos</span><select id="pl-ph" className="inp" value=${cfg.photosJour} onChange=${e => Store.patch('cfg', null, { photosJour: +e.target.value })}>${JOURS.map(d => html`<option key=${d[0]} value=${d[0]}>${d[1]}</option>`)}</select></label>
    </div>
    <//>`}
    ${sec === 'seances' && html`<${SeancesEditor} />`}
    ${sec === 'focus' && html`<${FocusEditor} />`}
    ${sec === 'repas' && html`<${React.Fragment}>
    <${SuppEditor} />
    <${FoodsEditor} />
    <h3>Étiquettes Prozis · pour 100 g</h3>
    ${['clearwhey', 'wheychoco'].map(id => { const f = foods[id]; return html`<div key=${id} className="stack">
      <span className="fld-l">${f.n}<b>${f.etq ? 'valeurs par défaut' : 'calé sur l’étiquette'}</b></span>
      <div className="form" style=${{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        <${Num} id=${id + '-k'} label="kcal" value=${f.k} onChange=${setFood(id, 'k')} dec=${0} min=${0} max=${900} />
        <${Num} id=${id + '-p'} label="Prot." value=${f.p} onChange=${setFood(id, 'p')} dec=${1} min=${0} max=${100} />
        <${Num} id=${id + '-g'} label="Gluc." value=${f.g} onChange=${setFood(id, 'g')} dec=${1} min=${0} max=${100} />
        <${Num} id=${id + '-l'} label="Lip." value=${f.l} onChange=${setFood(id, 'l')} dec=${1} min=${0} max=${100} />
        <${Num} id=${id + '-d'} label="Dose g" value=${f.u[1]} onChange=${setFood(id, 'dose')} dec=${0} min=${5} max=${100} />
      </div></div>`; })}
    <//>`}
    ${sec === 'claude' && html`<${ClaudeLink} />`}
    ${sec === 'partage' && html`<${ShareBody} />`}
    ${sec === 'data' && html`<${React.Fragment}>
    <h3>Données</h3>
    ${STANDALONE && html`<button type="button" className="btn wide" onClick=${() => checkUpdate(true)}><${Icon} n="refresh" s=${18} />Rechercher une mise à jour</button>`}
    <p className="mut" style=${{ fontSize: 12 }}>Version : ${window.APEX_VERSION ? 'app autonome ' + window.APEX_VERSION : 'version Claude'}</p>
    <div className="note"><${Icon} n="info" /><div><span>${sy.mode === 'ok' ? 'Synchronisé avec la base privée de ton compte Claude, et copié sur cet appareil.' : sy.mode === 'local' ? (STANDALONE ? 'Tout est enregistré sur ce téléphone, sans compte ni serveur. Si tu désinstalles l’app ou effaces les données du navigateur, tout disparaît : exporte régulièrement.' : 'Enregistré sur cet appareil uniquement : cette vue n’a pas accès à la base du compte.') : sy.mode === 'err' ? 'La base du compte ne répond pas (' + (sy.err || 'erreur') + '). Les saisies restent sur cet appareil et repartiront à la prochaine ouverture.' : 'Connexion à la base du compte en cours. Les saisies sont gardées sur cet appareil.'}${st.pendingKeys() ? ' ' + st.pendingKeys() + ' modification(s) en attente d’envoi.' : ''}</span></div></div>
    <div className="row">
      <button type="button" className="btn grow" onClick=${exp}><${Icon} n="download" s=${18} />Exporter en JSON</button>
    </div>
    ${dump && html`<div className="stack"><span className="fld-l">Copie ce texte et garde-le dans un fichier .json</span><textarea id="exp-dump" className="inp" readOnly value=${dump} onFocus=${e => e.target.select()} aria-label="Export JSON"></textarea></div>`}
    <label className="btn wide" htmlFor="imp-file"><${Icon} n="upload" s=${18} />Choisir un fichier .json</label>
    <input id="imp-file" className="sr" type="file" accept="application/json,.json" onChange=${e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; const r = new FileReader(); r.onload = () => { try { const k = Store.importAll(JSON.parse(String(r.result))); setMsg(k + ' document' + (k > 1 ? 's' : '') + ' importé' + (k > 1 ? 's' : '') + '.'); } catch (er) { setMsg(er instanceof SyntaxError ? 'Fichier illisible : ce n’est pas un export ApexHQ.' : er.message); } }; r.onerror = () => setMsg('Lecture du fichier impossible.'); r.readAsText(f); }} />
    <textarea id="imp-txt" className="inp" placeholder="Colle ici le contenu d’un export ApexHQ pour l’importer" value=${imp} onChange=${e => setImp(e.target.value)} aria-label="Contenu JSON à importer"></textarea>
    <button type="button" className="btn wide" disabled=${!imp.trim()} onClick=${doImp}><${Icon} n="upload" s=${18} />Importer et fusionner</button>
    ${msg && html`<p className="sec" style=${{ fontSize: 13 }} role="status">${msg}</p>`}
    <//>`}
  <//>`;
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e) { return { e }; }
  render() {
    if (!this.state.e) return this.props.children;
    return html`<div className="wrap" style=${{ paddingBlock: 40 }}><div className="card"><h2>Erreur d’affichage</h2>
      <p className="sec">${String((this.state.e && this.state.e.message) || this.state.e)}</p>
      <p className="mut">Tes données sont intactes. Recharge la page ; si l’erreur revient, signale ce message.</p>
      <button type="button" className="btn" onClick=${() => this.setState({ e: null })}>Réessayer</button></div></div>`;
  }
}

function App() {
  const st = useStore(), S = st.get(), cfg = st.cfg(), sy = st.sync();
  const [tab, setTab] = useState(tabOf); const [date, setDate] = useState(Apex.today); const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setTab(tabOf()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  useEffect(() => { if (!STANDALONE) return undefined; const t = setTimeout(() => checkUpdate(false), 3000), f = () => { if (!document.hidden) checkUpdate(false); }; document.addEventListener('visibilitychange', f); return () => { clearTimeout(t); document.removeEventListener('visibilitychange', f); }; }, []);
  const j = S.journal[date] || {}, statut = Apex.statutDuJour(cfg, j, date), today = Apex.today();
  useEffect(() => { document.body.dataset.statut = statut; }, [statut]);
  const go = t => { setTab(t); try { if (location.hash !== '#' + t) location.hash = t; } catch (e) { /* hash indisponible */ } try { window.scrollTo(0, 0); } catch (e) { /* sans effet */ } };
  const setStatut = v => { if (v === statut) return; if (v === 'repos') Store.patch('journal', date, { date, statut: 'repos' }); else Store.patch('journal', date, { date, statut: 'salle', seance: j.seance || cfg.planning[Apex.dow(date)] || Apex.prochaineSeance(S.seances, cfg, date) }); };
  const sc = sy.pending > 0 ? ['pend', 'Enregistrement…'] : (SYNC[sy.mode] || SYNC.local);
  const tabs = TABS_ALL.filter(t => t[0] !== 'coach' || !STANDALONE || st.caps().sample);
  const wiz = cfg.onboarded === false || (cfg.onboarded == null && (sy.mode === 'ok' || sy.mode === 'local') && !Object.keys(S.journal).length && !Object.keys(S.seances).length);
  const View = tab === 'repas' ? Repas : tab === 'training' ? Training : tab === 'analytics' ? Analytics : tab === 'coach' ? Coach : Dashboard;
  return html`<div>
    <header className="top"><div className="wrap top-in">
      <div className="brand"><${Icon} n="apex" s=${22} w=${2} />ApexHQ</div>
      <span className=${cx('sync', sc[0])} role="status"><i></i>${sc[1]}</span>
      <span className="grow"></span>
      <button type="button" className="ib top-gear" aria-label="Réglages et données" onClick=${() => setOpen(true)}><${Icon} n="sliders" /></button>
      <div className="top-ctl">
        <div className="daynav">
          <button type="button" className="ib sm" aria-label="Jour précédent" onClick=${() => setDate(Apex.addDays(date, -1))}><${Icon} n="chevL" s=${18} /></button>
          <b>${date === today ? 'Aujourd’hui' : dMid(date)}</b>
          <button type="button" className="ib sm" aria-label="Jour suivant" onClick=${() => setDate(Apex.addDays(date, 1))}><${Icon} n="chevR" s=${18} /></button>
          ${date !== today && html`<button type="button" className="now" onClick=${() => setDate(today)}>Auj.</button>`}
        </div>
        <${Seg} label="Statut du jour" value=${statut} onChange=${setStatut} options=${[['repos', 'Repos'], ['salle', 'Salle']]} />
      </div>
    </div></header>
    <main className="wrap"><${InstallBanner} /><${IABanner} /><${Boundary} key=${tab}><${View} date=${date} setDate=${setDate} go=${go} /><//></main>
    <nav className="tabs" aria-label="Sections" style=${{ gridTemplateColumns: 'repeat(' + tabs.length + ', 1fr)' }}>${tabs.map(t => html`<button key=${t[0]} type="button" aria-current=${tab === t[0] ? 'page' : undefined} onClick=${() => go(t[0])}><${Icon} n=${t[2]} s=${22} />${t[1]}</button>`)}</nav>
    ${open && html`<${SettingsSheet} onClose=${() => setOpen(false)} />`}
    ${wiz && html`<${Wizard} redo=${cfg.onboarded === false} onClose=${() => {}} />`}
    <${Toasts} />
  </div>`;
}

try { const d0 = Apex.today(); document.body.dataset.statut = Apex.statutDuJour(Store.cfg(), Store.get().journal[d0], d0); } catch (e) { /* teinte par défaut */ }
ReactDOM.createRoot(document.getElementById('app')).render(html`<${Boundary}><${App} /><//>`);
if (STANDALONE && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
Store.connect();

})();

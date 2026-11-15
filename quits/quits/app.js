/* Quits — a monthly money check-in for couples.
   Plain JavaScript, no build step, no server. Data lives in this browser (localStorage). */
(function () {
  'use strict';

  /* ===================== helpers ===================== */
  var STORE = 'quits.v1';
  var DAY = 864e5;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n, cents) {
    var v = +n || 0, neg = v < 0; v = Math.abs(v);
    return (neg ? '−' : '') + '$' + v.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function sum(arr, f) { return arr.reduce(function (s, x) { return s + (f ? f(x) : x); }, 0); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ym(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function iso(d) { return ym(d) + '-' + pad(d.getDate()); }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function monthName(m) { var p = m.split('-'); return MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function shortDate(s) { var p = s.split('-'); return MONTHS[+p[1] - 1].slice(0, 3) + ' ' + (+p[2]); }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ===================== categories & smart sort ===================== */
  var FOUNDATION = [
    { id: 'rent', name: 'Rent & mortgage', kw: ['rent', 'mortgage', 'apartments', 'property management', 'property mgmt', 'hoa', 'landlord'] },
    { id: 'groceries', name: 'Groceries', kw: ['kroger', 'whole foods', 'wholefds', "trader joe", 'safeway', 'aldi', 'h-e-b', 'heb', 'publix', 'wegmans', 'sprouts', 'instacart', 'grocery', 'food lion', 'meijer', 'costco', "sam's club", 'albertsons', 'shoprite', 'stop & shop'] },
    { id: 'school', name: 'School & activities', kw: ['school', 'isd', 'daycare', 'day care', 'preschool', 'tuition', 'pta', 'soccer', 'ballet', 'kumon', 'camp', 'tutoring', 'little league', 'scholastic', 'ymca', 'afterschool', 'after school', 'swim lessons', 'kindercare'] },
    { id: 'kidsclothes', name: 'Kids clothes', kw: ["carter's", 'carters', 'oshkosh', "children's place", 'childrens place', 'gap kids', 'old navy kids', 'kids'] },
    { id: 'utilities', name: 'Utilities', kw: ['electric', 'energy', 'water', 'utility', 'utilities', 'pg&e', 'coned', 'con ed', 'duke energy', 'xcel', 'national grid', 'gas service', 'gas co', 'natural gas', 'sewer', 'trash', 'waste management'] },
    { id: 'phone', name: 'Phone & internet', kw: ['verizon', 'at&t', 't-mobile', 'tmobile', 'comcast', 'xfinity', 'spectrum', 'cox comm', 'internet', 'wireless', 'mint mobile', 'google fi'] },
    { id: 'car', name: 'Car & gas', kw: ['shell', 'chevron', 'exxon', 'exxonmobil', 'mobil', 'bp', 'valero', 'circle k', 'quiktrip', 'speedway', "buc-ee's", 'gas station', 'fuel', 'jiffy lube', 'autozone', 'geico', 'progressive', 'state farm', 'car wash', 'parking', 'toll', 'dmv', 'tire'] },
    { id: 'health', name: 'Pharmacy & doctors', kw: ['cvs', 'walgreens', 'pharmacy', 'rite aid', 'pediatric', 'pediatrics', 'dental', 'dentist', 'clinic', 'urgent care', 'copay', 'optometry', 'hospital'] },
    { id: 'household', name: 'Home supplies', kw: ['home depot', "lowe's", 'lowes', 'ikea', 'dollar tree', 'dollar general', 'bed bath', 'ace hardware', 'container store'] }
  ];
  var PERSONAL = [
    { id: 'dining', name: 'Eating out & coffee', kw: ['starbucks', 'dunkin', 'doordash', 'uber eats', 'ubereats', 'grubhub', 'chipotle', 'mcdonald', 'chick-fil-a', 'taco bell', 'restaurant', 'cafe', 'coffee', 'bar', 'pub', 'grill', 'pizza', 'sweetgreen', 'panera'] },
    { id: 'subs', name: 'Subscriptions', kw: ['netflix', 'spotify', 'hulu', 'disney', 'hbo', 'apple.com', 'icloud', 'youtube', 'prime video', 'audible', 'peloton', 'patreon', 'paramount', 'peacock'] },
    { id: 'shopping', name: 'Clothes & beauty', kw: ['sephora', 'ulta', 'nike', 'zara', 'h&m', 'nordstrom', 'etsy', 'best buy', 'lululemon', 'apple store', 'macy'] },
    { id: 'fun', name: 'Fun & games', kw: ['steam', 'playstation', 'xbox', 'nintendo', 'amc', 'ticketmaster', 'fandango', 'golf', 'bowling', 'concert'] },
    { id: 'care', name: 'Gym & self-care', kw: ['salon', 'barber', 'nails', 'spa', 'gym', 'planet fitness', 'equinox', 'orangetheory'] },
    { id: 'other', name: 'Other personal', kw: [] }
  ];
  // Merchants that could be either: we guess, then ask the owner to check.
  var UNSURE = [
    { kw: 'amazon', kind: 'personal', cat: 'other' }, { kw: 'amzn', kind: 'personal', cat: 'other' },
    { kw: 'walmart', kind: 'foundation', cat: 'groceries' }, { kw: 'target', kind: 'foundation', cat: 'household' },
    { kw: 'venmo', kind: 'personal', cat: 'other' }, { kw: 'paypal', kind: 'personal', cat: 'other' }
  ];
  function kwRe(k) { return new RegExp('(^|[^a-z0-9])' + reEsc(k) + '($|[^a-z0-9])', 'i'); }
  [FOUNDATION, PERSONAL].forEach(function (list) { list.forEach(function (c) { c.re = c.kw.map(kwRe); }); });
  UNSURE.forEach(function (u) { u.re = kwRe(u.kw); });

  function classify(desc) {
    var d = String(desc).toLowerCase(), i, c;
    for (i = 0; i < FOUNDATION.length; i++) { c = FOUNDATION[i]; if (c.re.some(function (r) { return r.test(d); })) return { kind: 'foundation', cat: c.id, sure: true }; }
    for (i = 0; i < PERSONAL.length; i++) { c = PERSONAL[i]; if (c.re.some(function (r) { return r.test(d); })) return { kind: 'personal', cat: c.id, sure: true }; }
    for (i = 0; i < UNSURE.length; i++) { if (UNSURE[i].re.test(d)) return { kind: UNSURE[i].kind, cat: UNSURE[i].cat, sure: false }; }
    return { kind: 'personal', cat: 'other', sure: false };
  }
  function catList(kind) { return kind === 'foundation' ? FOUNDATION : PERSONAL; }
  function catName(kind, id) { var c = catList(kind).filter(function (x) { return x.id === id; })[0]; return c ? c.name : id; }

  /* ===================== CSV statements ===================== */
  var SKIP = /(payment\s*-?\s*thank|thank you|automatic payment|autopay payment|online payment|payment received|interest charge|transfer (to|from)|payroll|direct dep|refund|credit adjustment|cashback|cash back reward)/i;

  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false, i, c;
    text = text.replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ''; }); });
  }
  function parseDate(s) {
    s = String(s || '').trim(); var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { var y = +m[3]; if (y < 100) y += 2000; return y + '-' + pad(+m[1]) + '-' + pad(+m[2]); }
    return null;
  }
  function parseNum(s) {
    s = String(s == null ? '' : s).trim(); if (!s) return NaN;
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /^\$?-/.test(s) || /-$/.test(s);
    var v = parseFloat(s.replace(/[^0-9.]/g, ''));
    return isNaN(v) ? NaN : (neg ? -v : v);
  }
  function cleanDesc(s) { return s.replace(/\s+/g, ' ').trim(); }

  // Returns { tx: [...], skipped: n }. Works with Chase-style (negative = spend), Amex-style (positive = spend) and Debit/Credit columns.
  function readStatement(text, owner) {
    var rows = parseCSV(text);
    if (rows.length < 2) throw new Error('This file has no rows we can read.');
    var hi = rows.findIndex(function (r) { return r.some(function (c) { return /date/i.test(c); }); });
    if (hi < 0) throw new Error("We couldn't find a header row with a Date column.");
    var h = rows[hi].map(function (c) { return c.trim().toLowerCase(); });
    function find(re, not) { return h.findIndex(function (c) { return re.test(c) && !(not && not.test(c)); }); }
    var di = find(/transaction date|trans\. date|trans date|^date$/); if (di < 0) di = find(/date/);
    var ni = find(/description|merchant|payee|^name$|details|memo/);
    var ai = find(/^amount|amount$|amount \(/);
    var dbi = find(/debit|withdrawal/), cri = find(/credit|deposit/, /card/);
    if (ni < 0 || (ai < 0 && dbi < 0)) throw new Error('We need Date, Description and Amount columns. Most US banks export them in "Download CSV".');
    var items = [];
    rows.slice(hi + 1).forEach(function (r) {
      var desc = cleanDesc(r[ni] || ''), date = parseDate(r[di]), amt;
      if (!desc || !date) return;
      if (ai >= 0) amt = parseNum(r[ai]);
      else { var d = parseNum(r[dbi]); amt = (!isNaN(d) && d !== 0) ? -Math.abs(d) : (cri >= 0 ? Math.abs(parseNum(r[cri]) || 0) : NaN); }
      if (isNaN(amt) || amt === 0) return;
      items.push({ date: date, desc: desc, amt: amt, skip: SKIP.test(desc) });
    });
    var live = items.filter(function (x) { return !x.skip; });
    var neg = live.filter(function (x) { return x.amt < 0; }).length;
    var sign = ai < 0 ? -1 : (neg >= live.length - neg ? -1 : 1);
    var tx = items.filter(function (x) { return !x.skip && Math.sign(x.amt) === sign; }).map(function (x) {
      var c = classify(x.desc);
      return { id: uid(), owner: owner, date: x.date, desc: x.desc, amount: Math.round(Math.abs(x.amt) * 100) / 100, kind: c.kind, cat: c.cat, sure: c.sure, confirmed: false, src: 'csv' };
    });
    return { tx: tx, skipped: items.length - tx.length };
  }

  /* ===================== state ===================== */
  function fresh() {
    return {
      v: 1, onboarded: false, demo: false,
      a: { name: '', income: 0 }, b: { name: '', income: 0 },
      split: 'equal', budget: 0, month: ym(new Date()),
      tx: [], bills: [], pauses: [], settled: [],
      view: 'both', tab: 'home', moves: {}, date: {}, cancel: {},
      savings: 0, irregular: 1200, weeklyCap: 0, pauseMin: 100,
      plan: { start: iso(new Date()), plus: false },
      ai: { key: '', model: 'gpt-5-mini' }, chat: {}, talk: {}, tips: null
    };
  }
  var state = load();
  function load() {
    try { var s = JSON.parse(localStorage.getItem(STORE)); if (s && s.v === 1) return Object.assign(fresh(), s); } catch (e) { /* storage unavailable */ }
    return fresh();
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function set(patch) { Object.assign(state, patch || {}); save(); render(); }

  function nm(o) { return (state[o] && state[o].name) || (o === 'a' ? 'Partner A' : 'Partner B'); }
  function other(o) { return o === 'a' ? 'b' : 'a'; }
  function monthTx() { return state.tx.filter(function (t) { return t.date.slice(0, 7) === state.month; }); }
  function foundationTx() { return monthTx().filter(function (t) { return t.kind === 'foundation'; }); }
  function visibleTx() { var v = state.view; return monthTx().filter(function (t) { return t.kind === 'foundation' || t.owner === v; }); }
  function canEdit(t) { return state.view === t.owner; }
  function months() { var m = {}; state.tx.forEach(function (t) { m[t.date.slice(0, 7)] = 1; }); m[state.month] = 1; return Object.keys(m).sort(); }

  function refDate() {
    var now = new Date();
    if (ym(now) === state.month) return now;
    var p = state.month.split('-').map(Number);
    if (state.demo) return new Date(p[0], p[1] - 1, 15);
    return now > new Date(p[0], p[1] - 1, 1) ? new Date(p[0], p[1], 0) : new Date(p[0], p[1] - 1, 1);
  }

  /* ===================== money math ===================== */
  function runway() {
    var ref = refDate(), p = state.month.split('-').map(Number);
    var last = new Date(p[0], p[1], 0).getDate(), d = ref.getDate();
    var daysLeft = Math.max(1, last - d + 1);
    var spent = sum(foundationTx(), function (t) { return t.amount; });
    var bills = state.bills.filter(function (b) { return !b.paid && b.day >= d; });
    var upcoming = sum(bills, function (b) { return +b.amount || 0; });
    var budget = +state.budget || 0;
    var free = budget - spent - upcoming;
    var ratio = budget ? free / budget : 0;
    var level = ratio < 0.05 ? 'bad' : ratio < 0.15 ? 'warn' : 'ok';
    var weeks = Math.max(1, Math.ceil(daysLeft / 7));
    return { budget: budget, spent: spent, upcoming: upcoming, bills: bills, free: free, daysLeft: daysLeft, perDay: free / daysLeft, perWeek: free / weeks, weeks: weeks, ratio: ratio, level: level, last: last, day: d };
  }
  function shares(total) {
    var ia = +state.a.income || 0, ib = +state.b.income || 0;
    if (state.split === 'income' && ia > 0 && ib > 0) return { a: total * ia / (ia + ib), b: total * ib / (ia + ib) };
    return { a: total / 2, b: total / 2 };
  }
  function settle() {
    var f = foundationTx();
    var paid = { a: sum(f.filter(function (t) { return t.owner === 'a'; }), function (t) { return t.amount; }), b: sum(f.filter(function (t) { return t.owner === 'b'; }), function (t) { return t.amount; }) };
    var total = paid.a + paid.b, sh = shares(total), diff = paid.a - sh.a;
    return { paid: paid, total: total, share: sh, from: diff > 0 ? 'b' : 'a', to: diff > 0 ? 'a' : 'b', amount: Math.abs(diff) };
  }
  function savedByPause() { return sum(state.pauses.filter(function (p) { return p.status === 'skipped' && (p.kind === 'foundation' || state.view === p.who); }), function (p) { return p.price; }); }
  function trialLeft() { var s = new Date(state.plan.start + 'T00:00:00'); return Math.max(0, 30 - Math.floor((Date.now() - s) / DAY)); }

  /* ===================== demo couple ===================== */
  var DEMO_A = "Transaction Date,Post Date,Description,Category,Type,Amount\n11/01/2026,11/02/2026,KROGER #412 AUSTIN TX,Groceries,Sale,-142.36\n11/01/2026,11/02/2026,STARBUCKS STORE 11234,Food & Drink,Sale,-6.45\n11/02/2026,11/03/2026,AT&T WIRELESS BILL,Bills & Utilities,Sale,-185.00\n11/02/2026,11/03/2026,ROUND ROCK ISD MEALS,Education,Sale,-60.00\n11/03/2026,11/04/2026,CARTER'S #233,Shopping,Sale,-98.40\n11/03/2026,11/04/2026,CVS/PHARMACY #1102,Health & Wellness,Sale,-46.20\n11/04/2026,11/05/2026,H-E-B #210,Groceries,Sale,-188.14\n11/04/2026,11/05/2026,NETFLIX.COM,Entertainment,Sale,-15.49\n11/05/2026,11/05/2026,AUTOMATIC PAYMENT - THANK YOU,,Payment,1200.00\n11/05/2026,11/06/2026,KUMON LEARNING CENTER,Education,Sale,-210.00\n11/06/2026,11/07/2026,SPECTRUM INTERNET,Bills & Utilities,Sale,-95.00\n11/06/2026,11/07/2026,SEPHORA AUSTIN,Shopping,Sale,-48.00\n11/07/2026,11/08/2026,TRADER JOE'S #551,Groceries,Sale,-96.50\n11/08/2026,11/09/2026,LITTLE LEAGUE AUSTIN,Education,Sale,-120.00\n11/08/2026,11/09/2026,STARBUCKS STORE 11234,Food & Drink,Sale,-5.95\n11/09/2026,11/10/2026,OSHKOSH B'GOSH,Shopping,Sale,-64.10\n11/09/2026,11/10/2026,WALGREENS #5531,Health & Wellness,Sale,-38.80\n11/10/2026,11/11/2026,AUSTIN PEDIATRICS COPAY,Health & Wellness,Sale,-95.00\n11/11/2026,11/12/2026,H-E-B #210,Groceries,Sale,-164.20\n11/11/2026,11/12/2026,CHIPOTLE 2210,Food & Drink,Sale,-23.80\n11/12/2026,11/13/2026,SUNSHINE SOCCER CAMP,Education,Sale,-150.00\n11/12/2026,11/13/2026,THE CHILDREN'S PLACE,Shopping,Sale,-97.50\n11/13/2026,11/14/2026,WHOLEFDS MKT 10244,Groceries,Sale,-88.80\n11/13/2026,11/14/2026,ULTA BEAUTY #88,Shopping,Sale,-31.20\n";
  var DEMO_B = "Date,Description,Amount\n11/01/2026,AUSTIN ENERGY UTILITY,210.00\n11/02/2026,STEAM GAMES 425-889-9642,59.99\n11/03/2026,SHELL OIL 57442,52.30\n11/04/2026,CITY OF AUSTIN WATER,95.00\n11/05/2026,COSTCO WHSE #0681,140.00\n11/05/2026,DOORDASH*CHIPOTLE,32.40\n11/06/2026,TEXAS GAS SERVICE,75.00\n11/07/2026,ONLINE PAYMENT - THANK YOU,-800.00\n11/07/2026,THE DOGWOOD BAR,46.00\n11/08/2026,VALERO #1234,48.70\n11/09/2026,SPOTIFY USA,11.99\n11/10/2026,JIFFY LUBE #22,89.00\n11/11/2026,AMAZON.COM*2K4LM8,74.25\n11/12/2026,GEICO AUTO,150.00\n11/13/2026,NIKE.COM,120.00\n";
  function loadDemo() {
    var keepAi = state.ai;
    state = fresh();
    if (keepAi && keepAi.key) state.ai = keepAi;
    Object.assign(state, {
      onboarded: true, demo: true, a: { name: 'Jess', income: 5200 }, b: { name: 'Alex', income: 6800 },
      split: 'equal', budget: 3800, month: '2026-11', view: 'both', tab: 'home', plan: { start: '2026-11-01', plus: false }
    });
    state.tx = readStatement(DEMO_A, 'a').tx.concat(readStatement(DEMO_B, 'b').tx);
    state.bills = [{ id: uid(), name: 'After-school program', amount: 300, day: 20 }, { id: uid(), name: 'Electric bill', amount: 180, day: 25 }];
    state.pauses = [{ id: uid(), who: 'b', item: 'Robot vacuum', price: 180, kind: 'foundation', created: Date.now() - 3 * 36e5, votes: {}, status: 'waiting' }];
    save(); render(); toast('Demo loaded: Jess and Alex, November 2026');
  }

  /* ===================== UI pieces ===================== */
  function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function whoDot(o) { return '<span class="who"><span class="dot ' + o + '"></span>' + esc(nm(o)) + '</span>'; }

  function header() {
    var ms = months();
    var tl = trialLeft();
    var plan = state.plan.plus ? 'Quits Plus · on' : (tl > 0 ? 'Free month · ' + tl + ' days left' : 'Free month ended');
    return '<div class="topbar">' +
      '<a class="logo" href="#" data-act="tab" data-v="home"><span class="logo-mark"><i class="lm1"></i><i class="lm2"></i><i class="lm3"></i></span>QUITS</a>' +
      (ms.length > 1 ? '<select class="mini" data-in="month" aria-label="Month">' + ms.map(function (m) { return '<option value="' + m + '"' + (m === state.month ? ' selected' : '') + '>' + monthName(m) + '</option>'; }).join('') + '</select>' : '<span class="pill">' + monthName(state.month) + '</span>') +
      '<div class="spacer"></div>' +
      '<span class="dim">Viewing as</span><div class="seg" role="tablist" aria-label="Viewing as">' +
      ['a', 'both', 'b'].map(function (v) {
        var label = v === 'both' ? 'Together' : esc(nm(v));
        return '<button data-act="view" data-v="' + v + '" class="' + (state.view === v ? 'on' : '') + '"><span class="dot ' + v + '"></span>' + label + '</button>';
      }).join('') + '</div>' +
      '<button class="pill ai-pill ' + (aiMode() === 'off' ? 'off' : '') + '" data-act="settings" title="AI settings">' + aiLabel() + '</button>' +
      '<button class="pill plus" data-act="plus">' + plan + '</button>' +
      '</div>';
  }
  function tabs() {
    var pending = visibleTx().filter(function (t) { return canEdit(t) && !t.confirmed; }).length;
    var waiting = state.pauses.filter(function (p) { return p.status === 'waiting' && (p.kind === 'foundation' || p.who === state.view); }).length;
    var T = [['home', 'Home'], ['statements', 'Statements', pending], ['runway', 'Runway & pause', waiting], ['settle', 'Settle up'], ['moves', 'Money moves'], ['coach', 'Ask Quits <span class="ai-tag sm">AI</span>']];
    return '<nav class="tabs">' + T.map(function (t) {
      return '<button data-act="tab" data-v="' + t[0] + '" class="' + (state.tab === t[0] ? 'on' : '') + '">' + t[1] + (t[2] ? ' <span class="badge">' + t[2] + '</span>' : '') + '</button>';
    }).join('') + '</nav>';
  }

  /* ---------- the house with shelves ---------- */
  function boxUnit(max) { var U = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]; for (var i = 0; i < U.length; i++) if (max / U[i] <= 16) return U[i]; return 2000; }
  function shelves(groups, unit, mode) {
    var k = 0;
    return groups.map(function (g) {
      var html = '';
      g.parts.forEach(function (p) {
        var n = Math.floor(p.amount / unit), rem = p.amount - n * unit, i;
        var tip = esc(g.name + ': ' + money(p.amount) + (mode === 'home' ? ' paid by ' + nm(p.cls) : ''));
        for (i = 0; i < n; i++) html += '<i class="box ' + p.cls + '" style="animation-delay:' + (k++ * 22) + 'ms" title="' + tip + '"></i>';
        if (rem >= unit * 0.2 || (n === 0 && p.amount > 0)) html += '<i class="box part ' + p.cls + '" style="animation-delay:' + (k++ * 22) + 'ms" title="' + tip + '"></i>';
      });
      return '<div class="shelf-row"><div class="shelf-label"><b>' + money(g.total) + '</b>' + esc(g.name) + '</div><div class="shelf"><div class="boxes">' + html + '</div><div class="plank"></div></div></div>';
    }).join('');
  }
  function house(compact) {
    var f = foundationTx();
    if (!f.length) return '<div class="empty-house"><p class="pix" style="color:var(--yellow)">EMPTY HOUSE</p><p style="margin-top:10px">Upload a card statement and the shelves fill up with what you both paid for the home.</p><p style="margin-top:14px"><button class="btn go" data-act="tab" data-v="statements">Upload a statement</button></p></div>';
    var by = {};
    f.forEach(function (t) { by[t.cat] = by[t.cat] || { a: 0, b: 0 }; by[t.cat][t.owner] += t.amount; });
    var groups = FOUNDATION.filter(function (c) { return by[c.id]; }).map(function (c) {
      return { name: c.name, total: by[c.id].a + by[c.id].b, parts: [{ cls: 'a', amount: by[c.id].a }, { cls: 'b', amount: by[c.id].b }] };
    }).sort(function (x, y) { return y.total - x.total; });
    var unit = boxUnit(Math.max.apply(null, groups.map(function (g) { return g.total; })));
    var r = runway(), total = r.spent;
    var used = r.budget ? Math.min(100, total / r.budget * 100) : 0;
    var roof = [20, 32, 44, 56, 68, 80, 92, 100].map(function (w, i) { return '<div class="ly' + (i % 2 ? ' dark' : '') + '" style="width:' + w + '%"></div>'; }).join('');
    var mon = MONTHS[+state.month.split('-')[1] - 1].slice(0, 3).toUpperCase();
    var out = '<div class="house-wrap"><div class="house">' +
      '<div class="smoke"><i></i><i></i><i></i></div><div class="chimney"></div>' +
      '<div class="roof">' + roof + '<div class="roof-sign"><div class="pix">HOME · ' + mon + '</div><div class="num">' + money(total) + '</div></div></div>' +
      '<div class="walls">' + shelves(groups, unit, 'home') + '</div>' +
      '<div class="house-base"><div class="door" aria-hidden="true"></div><div>' +
      (r.budget ? '<div class="bricks ' + r.level + '"><div class="fill" style="width:' + used.toFixed(1) + '%"></div></div><div class="base-txt">Home budget ' + money(r.budget) + ' · ' + Math.round(used) + '% used · ' + money(r.free) + ' free after upcoming bills</div>'
        : '<div class="base-txt">Set a monthly home budget to see how full the house is. <button class="linkbtn" data-act="settings">Set budget</button></div>') +
      '</div></div><div class="ground"></div></div>' +
      '<div class="legend"><span><i style="background:var(--a)"></i>Paid by ' + esc(nm('a')) + '</span><span><i style="background:var(--b)"></i>Paid by ' + esc(nm('b')) + '</span><span>1 box = ' + money(unit) + '</span></div>';
    if (!compact && state.view !== 'both') out += room(state.view);
    return out + '</div>';
  }
  function room(o) {
    var p = monthTx().filter(function (t) { return t.owner === o && t.kind === 'personal'; });
    var head = '<div class="row between"><p class="pix" style="color:#C9C3F5">' + esc(nm(o)).toUpperCase() + "'S ROOM</p><span class=\"private\">Only " + esc(nm(o)) + ' sees this</span></div>';
    if (!p.length) return '<div class="room">' + head + '<p class="dim" style="margin-top:8px">No personal spending this month.</p></div>';
    var by = {}; p.forEach(function (t) { by[t.cat] = (by[t.cat] || 0) + t.amount; });
    var groups = PERSONAL.filter(function (c) { return by[c.id]; }).map(function (c) { return { name: c.name, total: by[c.id], parts: [{ cls: 'p', amount: by[c.id] }] }; }).sort(function (x, y) { return y.total - x.total; });
    var unit = boxUnit(Math.max.apply(null, groups.map(function (g) { return g.total; })));
    return '<div class="room">' + head + '<div class="walls">' + shelves(groups, unit, 'room') + '</div><p class="dim" style="margin-top:6px">' + money(sum(p, function (t) { return t.amount; })) + ' personal · 1 box = ' + money(unit) + '. Your partner never sees these lines.</p></div>';
  }

  /* ---------- cards ---------- */
  function runwayCard(full) {
    var r = runway();
    if (!r.budget) return '<div class="card"><p class="kicker">RUNWAY</p><h3>How much is left for the home this month?</h3><p class="muted">Set your monthly home budget to see it.</p><div><button class="btn go" data-act="settings">Set budget</button></div></div>';
    var cls = r.level === 'ok' ? 'hot' : r.level;
    var w = function (x) { return r.budget ? Math.max(0, Math.min(100, x / r.budget * 100)).toFixed(1) : 0; };
    var msg = r.free < 0 ? '<div class="alert bad">You are ' + money(-r.free) + ' over the home budget. Pause non-essentials until payday and talk it through at the money date.</div>'
      : r.level === 'bad' ? '<div class="alert bad">Almost empty: ' + money(r.free) + ' for ' + r.daysLeft + ' days. Essentials only until payday?</div>'
        : r.level === 'warn' ? '<div class="alert">Running thin: ' + money(r.free) + ' left for ' + r.daysLeft + ' days. Hold off on non-essentials?</div>'
          : '<div class="alert ok">On track. Keep it boring.</div>';
    return '<div class="card ' + cls + '"><p class="kicker">RUNWAY · ' + shortDate(iso(refDate())).toUpperCase() + '</p>' +
      '<div class="row between" style="align-items:flex-end"><div><div class="big">' + money(r.free) + '</div><p class="muted">free for the home until ' + shortDate(state.month + '-' + pad(r.last)) + ' (' + r.daysLeft + ' days)</p></div>' +
      '<div style="text-align:right"><div class="mid">' + money(Math.max(0, r.perDay)) + '</div><p class="dim">per day</p></div></div>' +
      '<div class="meter ' + r.level + '"><i class="spent" style="width:' + w(r.spent) + '%"></i><i class="bills" style="width:' + w(r.upcoming) + '%"></i><i class="free" style="width:' + w(Math.max(0, r.free)) + '%"></i></div>' +
      '<div class="kv"><span>Home budget</span><span>' + money(r.budget) + '</span><span>Already spent</span><span>− ' + money(r.spent) + '</span><span>Bills still coming</span><span>− ' + money(r.upcoming) + '</span>' +
      (state.weeklyCap ? '<span>Your weekly envelope</span><span>' + money(state.weeklyCap) + ' / week</span>' : '') + '</div>' + msg +
      (full ? '' : '<div><button class="btn sm" data-act="tab" data-v="runway">Open runway & pause</button></div>') + '</div>';
  }
  function settleCard() {
    var s = settle();
    if (!s.total) return '<div class="card"><p class="kicker">SETTLE UP</p><p class="muted">Nothing to settle yet.</p></div>';
    var done = state.settled.filter(function (x) { return x.month === state.month; })[0];
    return '<div class="card"><p class="kicker">SETTLE UP · ' + (state.split === 'income' ? 'BY INCOME' : '50/50') + '</p>' +
      (done ? '<div class="row"><span class="stamp">SETTLED</span><span class="muted">' + esc(nm(done.from)) + ' sent ' + money(done.amount) + ' on ' + shortDate(done.at) + '</span></div>'
        : s.amount < 1 ? '<p class="mid">You are even.</p>'
          : '<div class="transfer">' + whoDot(s.from) + '<span class="arrow">&gt;&gt;</span>' + whoDot(s.to) + '<span class="mid" style="color:var(--green)">' + money(s.amount) + '</span></div>') +
      '<p class="dim">' + esc(nm('a')) + ' paid ' + money(s.paid.a) + ', ' + esc(nm('b')) + ' paid ' + money(s.paid.b) + ' for the home.</p>' +
      '<div><button class="btn sm" data-act="tab" data-v="settle">Open settle up</button></div></div>';
  }

  /* ===================== screens ===================== */
  function onboarding() {
    return '<div class="wrap"><div class="topbar"><span class="logo"><span class="logo-mark"><i class="lm1"></i><i class="lm2"></i><i class="lm3"></i></span>QUITS</span></div>' +
      '<div class="hero"><div><p class="pix" style="color:var(--green)">FOR COUPLES WHO BOTH PAY FOR THE HOME</p>' +
      '<h1 style="margin-top:14px">See the home you both pay for.</h1>' +
      '<p class="lead">Once a month, each of you drops in a card statement. Quits sorts every line into <b>Home</b> or <b>Mine</b>, shows who paid for groceries, school and bills, keeps personal spending private, and ends the month with one fair transfer.</p>' +
      '<ul class="points"><li><span class="sqr"></span><span><b>10 minutes a month.</b> No daily logging, no bank passwords.</span></li>' +
      '<li><span class="sqr" style="background:var(--yellow)"></span><span><b>Private by design.</b> Your partner sees what you paid for the home, never your personal lines.</span></li>' +
      '<li><span class="sqr" style="background:#8F82FF"></span><span><b>No more broke by the 25th.</b> A runway number, a 24-hour pause and simple money moves.</span></li></ul>' +
      '<div class="row"><button class="btn go" data-act="demo">Try the demo couple</button><span class="dim">Jess and Alex, Austin TX, November</span></div></div>' +
      '<form class="card" data-form="setup" autocomplete="off"><p class="kicker">START YOUR OWN · FREE FIRST MONTH</p>' +
      '<div class="grid g2e"><label class="f">Your name<input type="text" name="an" required placeholder="Jess"></label><label class="f">Partner\'s name<input type="text" name="bn" required placeholder="Alex"></label></div>' +
      '<div class="grid g2e"><label class="f">Your monthly take-home ($)<input type="number" name="ai" min="0" step="50" placeholder="optional"></label><label class="f">Partner\'s take-home ($)<input type="number" name="bi" min="0" step="50" placeholder="optional"></label></div>' +
      '<label class="f">Monthly budget for the home ($)<input type="number" name="bud" min="0" step="50" required placeholder="3800"><span class="dim" style="font-weight:400">Groceries, kids, bills, car, pharmacy: everything you share. Not personal stuff.</span></label>' +
      '<label class="f">How do you split the home?<select name="split"><option value="equal">50/50</option><option value="income">By income (fair share of each paycheck)</option></select></label>' +
      '<button class="btn go" type="submit">Create our home</button><p class="dim">$49/year per couple after the free month. Everything stays in this browser in the demo build.</p></form></div></div>';
  }

  function homeScreen() {
    var pending = visibleTx().filter(function (t) { return canEdit(t) && !t.confirmed; }).length;
    var nudge = state.view === 'both'
      ? '<div class="card"><p class="kicker">PRIVACY</p><p class="muted">In the Together view you only see the home. Personal lines stay with their owner. Switch to ' + esc(nm('a')) + ' or ' + esc(nm('b')) + ' to confirm your own lines.</p></div>'
      : pending ? '<div class="card warn"><p class="kicker">TO CONFIRM</p><p><b>' + pending + ' lines</b> are waiting for you. Smart sort did the work, you make the call.</p><div><button class="btn y sm" data-act="tab" data-v="statements">Review my lines</button></div></div>' : '';
    var mv = movesList().filter(function (m) { return !state.moves[m.id]; })[0];
    var next = mv ? '<div class="card"><p class="kicker">NEXT MONEY MOVE</p><h3>' + mv.title + '</h3><p class="muted">' + mv.why + '</p><div><button class="btn sm" data-act="tab" data-v="moves">See money moves</button></div></div>' : '';
    return '<div class="grid g2"><div class="card"><div class="row between"><p class="kicker">YOUR HOME THIS MONTH</p><span class="dim">Shared view: home spending only</span></div>' + house() + '</div>' +
      '<div class="stack" style="gap:20px">' + runwayCard() + settleCard() + tipsCard() + nudge + next + '</div></div>';
  }

  function statementsScreen() {
    var v = state.view;
    var up = v === 'both'
      ? '<div class="row" style="justify-content:center"><button class="btn go" data-act="pick" data-v="a">Upload ' + esc(nm('a')) + "'s statement</button><button class=\"btn go\" data-act=\"pick\" data-v=\"b\">Upload " + esc(nm('b')) + "'s statement</button></div>"
      : '<button class="btn go" data-act="pick" data-v="' + v + '">Upload ' + esc(nm(v)) + "'s card statement (CSV)</button>";
    var drop = '<div class="drop" data-drop="1"><p class="pix" style="color:var(--green)">DROP A STATEMENT HERE</p>' + up +
      '<p class="dim">Any US bank or card: Chase, Amex, BofA, Citi, Capital One… Use "Download activity → CSV". Card payments and refunds are skipped automatically.</p>' +
      '<p class="dim">No statement handy? Try the samples: <a href="samples/jess_november_chase.csv" download>Jess (Chase format)</a> · <a href="samples/alex_november_amex.csv" download>Alex (Amex format)</a></p></div>';
    var cash = v === 'both' ? '' : '<form class="card" data-form="cash" autocomplete="off"><p class="kicker">ADD CASH OR A MISSING LINE</p><div class="row">' +
      '<input type="text" name="desc" placeholder="Farmers market" required style="flex:2;min-width:160px">' +
      '<input type="number" name="amt" placeholder="40" min="0.01" step="0.01" required style="flex:1;min-width:90px">' +
      '<select name="kind"><option value="foundation">Home</option><option value="personal">Mine</option></select>' +
      '<button class="btn sm" type="submit">Add</button></div></form>';

    var rows = visibleTx().slice().sort(function (x, y) { return y.date < x.date ? -1 : y.date > x.date ? 1 : 0; });
    var mine = rows.filter(canEdit), pend = mine.filter(function (t) { return !t.confirmed; });
    var sureP = pend.filter(function (t) { return t.sure; }).length;
    var homeTotal = sum(rows.filter(function (t) { return t.kind === 'foundation'; }), function (t) { return t.amount; });
    var myPersonal = sum(mine.filter(function (t) { return t.kind === 'personal'; }), function (t) { return t.amount; });
    var head = '<div class="row between"><div class="row"><h2>' + monthName(state.month) + ' lines</h2>' +
      '<span class="pill">Home ' + money(homeTotal) + '</span>' + (v !== 'both' ? '<span class="pill">Mine ' + money(myPersonal) + ' <span class="private" style="border:0;padding:0">· private</span></span>' : '') + '</div>' +
      (v !== 'both' && pend.length ? '<div class="row">' + (sureP ? '<button class="btn sm" data-act="confirmSure">Confirm ' + sureP + ' sure lines</button>' : '') + '<button class="btn sm go" data-act="confirmAll">Confirm all mine</button></div>' : '') + '</div>' +
      (v !== 'both' && pend.length ? '<div class="row"><button class="btn sm" data-act="aiSortMine"' + (busy.sort ? ' disabled' : '') + '>' + (busy.sort ? 'AI is sorting…' : 'Sort my unconfirmed lines with AI') + '</button><span class="ai-tag ' + (aiMode() === 'off' ? 'off' : '') + '">' + aiLabel() + '</span><span class="dim">Categories are picked automatically; you only confirm.</span></div>' : '');
    var note = v === 'both' ? '<p class="dim">Together view shows home lines from both of you. Personal lines are hidden from everyone but their owner.</p>'
      : '<p class="dim">You can change only your own lines. ' + esc(nm(other(v))) + "'s home lines are shown read-only; their personal lines are hidden from you.</p>";
    var table = !rows.length ? '<p class="muted">No lines yet for this month.</p>' :
      '<div class="tbl-wrap"><table class="tx"><thead><tr><th>DATE</th><th>MERCHANT</th><th>WHO</th><th style="text-align:right">AMOUNT</th><th>HOME OR MINE</th><th>CATEGORY</th><th>OK</th><th></th></tr></thead><tbody>' +
      rows.map(function (t) {
        var ed = canEdit(t), unsure = ed && !t.sure && !t.confirmed;
        var kind = ed ? '<span class="kind"><button class="f ' + (t.kind === 'foundation' ? 'on' : '') + '" data-act="kind" data-id="' + t.id + '" data-v="foundation">Home</button><button class="p ' + (t.kind === 'personal' ? 'on' : '') + '" data-act="kind" data-id="' + t.id + '" data-v="personal">Mine</button></span>'
          : '<span class="dim">Home</span>';
        var cat = ed ? '<select class="mini" data-in="cat" data-id="' + t.id + '">' + catList(t.kind).map(function (c) { return '<option value="' + c.id + '"' + (c.id === t.cat ? ' selected' : '') + '>' + c.name + '</option>'; }).join('') + '</select>'
          : esc(catName(t.kind, t.cat));
        var ok = ed ? '<button class="chk ' + (t.confirmed ? 'on' : '') + '" data-act="confirm" data-id="' + t.id + '" aria-label="Confirm">' + (t.confirmed ? '✓' : '') + '</button>' : (t.confirmed ? '<span style="color:var(--green)">✓</span>' : '<span class="dim">…</span>');
        return '<tr class="' + (unsure ? 'unsure' : '') + '"><td>' + shortDate(t.date) + '</td><td>' + esc(t.desc) + (unsure ? '<br><span class="flag">CHECK: home or yours?</span>' : '') + (t.src === 'cash' ? ' <span class="dim">(cash)</span>' : '') + (t.ai && ed ? ' <span class="ai-tag sm" title="' + esc(t.why || 'sorted by AI') + '">AI</span>' : '') + '</td><td><span class="dot ' + t.owner + '"></span></td><td class="amt">' + money(t.amount, true) + '</td><td>' + kind + '</td><td>' + cat + '</td><td>' + ok + '</td><td>' + (ed ? '<button class="x" data-act="del" data-id="' + t.id + '" aria-label="Delete line">×</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return '<div class="stack" style="gap:20px">' + drop + cash + '<div class="card">' + head + note + table + '</div></div>' +
      '<input type="file" id="file" accept=".csv,text/csv,.pdf" class="hidden">';
  }

  function runwayScreen() {
    var r = runway(), v = state.view;
    var bills = '<div class="card"><p class="kicker">BILLS STILL COMING THIS MONTH</p><div class="list">' +
      (state.bills.length ? state.bills.slice().sort(function (x, y) { return x.day - y.day; }).map(function (b) {
        var past = b.day < r.day;
        return '<div class="li ' + (b.paid || past ? 'done' : '') + '"><span class="pix" style="color:var(--yellow)">' + pad(b.day) + '</span><span class="grow">' + esc(b.name) + (b.paid ? ' · paid' : past ? ' · date passed' : '') + '</span><b>' + money(b.amount) + '</b>' +
          '<button class="btn sm ghost" data-act="billPaid" data-id="' + b.id + '">' + (b.paid ? 'Undo' : 'Paid') + '</button><button class="x" data-act="billDel" data-id="' + b.id + '" aria-label="Remove bill">×</button></div>';
      }).join('') : '<p class="dim">Add rent, daycare or utility bills that are due later this month so the runway is honest.</p>') + '</div>' +
      '<form class="row" data-form="bill" autocomplete="off"><input type="text" name="name" placeholder="Daycare" required style="flex:2;min-width:140px"><input type="number" name="amt" placeholder="300" min="1" step="1" required style="flex:1;min-width:80px"><input type="number" name="day" placeholder="Day (20)" min="1" max="31" required style="flex:1;min-width:80px"><button class="btn sm" type="submit">Add bill</button></form></div>';

    var list = state.pauses.filter(function (p) { return p.kind === 'foundation' || p.who === v; }).slice().sort(function (x, y) { return y.created - x.created; });
    var pauses = list.map(function (p) {
      var left = p.created + DAY - Date.now(), ready = left <= 0;
      var after = r.free - p.price;
      var partner = other(p.who), vote = p.votes && p.votes[partner];
      var head = '<div class="row between"><div><b>' + esc(p.item) + '</b> · ' + money(p.price) + ' <span class="dim">· ' + (p.kind === 'foundation' ? 'for the home, asked by ' + esc(nm(p.who)) : 'personal, only you see it') + '</span></div>' +
        (p.status === 'waiting' ? (ready ? '<span class="pix" style="color:var(--green)">24H PASSED</span>' : '<span class="timer">' + Math.floor(left / 36e5) + 'H ' + pad(Math.floor(left % 36e5 / 6e4)) + 'M LEFT</span>') : '<span class="pix" style="color:' + (p.status === 'skipped' ? 'var(--green)' : 'var(--ink3)') + '">' + (p.status === 'skipped' ? 'SKIPPED · SAVED' : 'BOUGHT') + '</span>') + '</div>';
      if (p.status !== 'waiting') return '<div class="pause li done">' + head + '</div>';
      var impact = p.kind === 'foundation' ? '<p class="muted">If you buy it: <b>' + money(after) + '</b> left for the home for ' + r.daysLeft + ' days (' + money(Math.max(0, after / r.daysLeft)) + '/day).' + (after < r.budget * 0.15 ? ' <span style="color:var(--yellow)">That drops the runway below 15%.</span>' : '') + '</p>' : '<p class="muted">Sleep on it. If you still want it tomorrow, it is yours.</p>';
      var votes = p.kind === 'foundation' ? '<div class="row"><span class="vote">' + whoDot(partner) + (vote === 'yes' ? ' agrees' : vote === 'wait' ? ' says let’s wait' : ' hasn’t answered') + '</span>' +
        (v === partner || v === 'both' ? '<button class="btn sm" data-act="vote" data-id="' + p.id + '" data-v="yes">Agree</button><button class="btn sm" data-act="vote" data-id="' + p.id + '" data-v="wait">Let’s wait</button>' : '') + '</div>' : '';
      var acts = '<div class="row">' + (ready ? '<button class="btn go sm" data-act="buy" data-id="' + p.id + '">Still want it: buy</button>' : '<button class="btn sm ghost" data-act="ff" data-id="' + p.id + '">Skip ahead 24h (demo)</button>') +
        '<button class="btn sm" data-act="skip" data-id="' + p.id + '">Changed my mind: skip</button></div>';
      return '<div class="pause ' + (ready ? 'ready' : '') + '">' + head + impact + votes + acts + '</div>';
    }).join('');
    var who = v === 'both' ? '<select name="who"><option value="a">' + esc(nm('a')) + '</option><option value="b">' + esc(nm('b')) + '</option></select>' : '<input type="hidden" name="who" value="' + v + '">';
    var pauseCard = '<div class="card"><div class="row between"><p class="kicker">24-HOUR PAUSE</p><span class="dim">Saved by skipping: <b style="color:var(--green)">' + money(savedByPause()) + '</b></span></div>' +
      '<h3>Want something unplanned over ' + money(state.pauseMin) + '? Put it here first.</h3><p class="muted">Quits shows what it does to the runway and asks your partner. No bans, just a night’s sleep.</p>' +
      '<form class="row" data-form="pause" autocomplete="off"><input type="text" name="item" placeholder="Robot vacuum" required style="flex:2;min-width:150px"><input type="number" name="price" placeholder="180" min="1" step="1" required style="flex:1;min-width:80px">' +
      '<select name="kind"><option value="foundation">For the home</option><option value="personal">Just for me</option></select>' + who + '<button class="btn go sm" type="submit">Pause it</button></form>' +
      '<div class="stack">' + (pauses || '<p class="dim">Nothing paused. Good sign.</p>') + '</div></div>';
    return '<div class="grid g2e"><div class="stack" style="gap:20px">' + runwayCard(true) + bills + '</div>' + pauseCard + '</div>';
  }

  function settleScreen() {
    var s = settle(), ia = +state.a.income || 0, ib = +state.b.income || 0;
    if (!s.total) return '<div class="card"><p class="kicker">SETTLE UP</p><p class="muted">Upload statements first. Then Quits shows who paid what for the home and the one transfer that makes it fair.</p><div><button class="btn go" data-act="tab" data-v="statements">Upload</button></div></div>';
    var done = state.settled.filter(function (x) { return x.month === state.month; })[0];
    var pa = s.paid.a / s.total * 100;
    var modeBtns = '<div class="seg"><button data-act="split" data-v="equal" class="' + (state.split === 'equal' ? 'on' : '') + '">50/50</button><button data-act="split" data-v="income" class="' + (state.split === 'income' ? 'on' : '') + '"' + (ia && ib ? '' : ' title="Add both incomes in Setup"') + '>By income</button></div>';
    var main = '<div class="card hot"><div class="row between"><p class="kicker">' + monthName(state.month).toUpperCase() + ' · FAIR SETTLE</p>' + modeBtns + '</div>' +
      '<p class="dim">Who actually paid for the home</p><div class="split-bar"><i class="a" style="width:' + pa.toFixed(1) + '%">' + (pa > 12 ? esc(nm('a')) + ' ' + money(s.paid.a) : '') + '</i><i class="b" style="width:' + (100 - pa).toFixed(1) + '%">' + (pa < 88 ? esc(nm('b')) + ' ' + money(s.paid.b) : '') + '</i></div>' +
      '<div class="kv"><span>Home total</span><span>' + money(s.total) + '</span><span>' + esc(nm('a')) + '’s fair share' + (state.split === 'income' && ia && ib ? ' (' + Math.round(ia / (ia + ib) * 100) + '% of income)' : ' (half)') + '</span><span>' + money(s.share.a) + '</span><span>' + esc(nm('b')) + '’s fair share' + (state.split === 'income' && ia && ib ? ' (' + Math.round(ib / (ia + ib) * 100) + '%)' : ' (half)') + '</span><span>' + money(s.share.b) + '</span></div>' +
      (state.split === 'income' && !(ia && ib) ? '<div class="alert">Add both take-home incomes in Setup to split by income. Using 50/50 for now.</div>' : '') +
      (done ? '<div class="row"><span class="stamp">SETTLED</span><span class="muted">' + esc(nm(done.from)) + ' sent ' + esc(nm(done.to)) + ' ' + money(done.amount) + ' on ' + shortDate(done.at) + '.</span><button class="btn sm ghost" data-act="unsettle">Undo</button></div>'
        : s.amount < 1 ? '<p class="mid">You are even this month.</p>'
          : '<div class="transfer">' + whoDot(s.from) + '<span class="arrow">&gt;&gt;</span>' + whoDot(s.to) + '<span class="big" style="color:var(--green)">' + money(s.amount) + '</span></div>' +
          '<p class="muted">One transfer and the month is even. Use the app you already have.</p>' +
          '<div class="row"><button class="btn" data-act="copy" data-v="' + s.amount.toFixed(2) + '">Copy amount</button><a class="btn" href="https://venmo.com/" target="_blank" rel="noopener">Open Venmo</a><a class="btn" href="https://www.zellepay.com/" target="_blank" rel="noopener">Zelle via your bank</a>' +
          '<button class="btn go" data-act="settled">Mark as settled</button></div>') + '</div>';
    var hist = state.settled.slice().reverse();
    var history = '<div class="card"><p class="kicker">HISTORY · QUITS PLUS</p>' + (hist.length ? '<div class="list">' + hist.map(function (h) { return '<div class="li"><span class="grow">' + monthName(h.month) + '</span><span class="dim">' + esc(nm(h.from)) + ' → ' + esc(nm(h.to)) + '</span><b>' + money(h.amount) + '</b></div>'; }).join('') + '</div>' : '<p class="dim">Settled months show up here. Over a year this becomes your "Year in the home" report.</p>') +
      '<p class="dim">Personal spending never enters the settle. Only what each of you paid for the home.</p></div>';
    return '<div class="grid g2"><div class="stack" style="gap:20px">' + main + history + '</div><div class="card"><p class="kicker">WHAT THE HOME COST</p>' + house(true) + '</div></div>';
  }

  /* ---------- money moves (financial literacy you act on) ---------- */
  function movesList() {
    var r = runway(), s = settle(), ia = +state.a.income || 0, ib = +state.b.income || 0, inc = ia + ib;
    var M = [];
    var dateDone = ['look', 'confirm', 'settle', 'plan'].filter(function (k) { return state.date[k]; }).length;
    M.push({ id: 'date', tag: 'Habit', title: 'Hold a 10-minute money date', why: 'One calm check-in a month beats ten tense comments at the checkout. Same day, same 10 minutes, same four questions.',
      body: '<div class="res">Checklist done: <b>' + dateDone + '/4</b></div>', act: '<button class="btn go sm" data-act="dateOpen">Start money date</button>' });
    var waiting = state.pauses.filter(function (p) { return p.status === 'waiting'; }).length;
    M.push({ id: 'pause', tag: 'Spending', title: 'Sleep on it: the 24-hour rule', why: 'Unplanned buys over ' + money(state.pauseMin) + ' wait one day. The urge fades; real needs are still there tomorrow.',
      body: '<div class="res">Saved by skipping: <b>' + money(savedByPause()) + '</b> · ' + waiting + ' waiting</div>', act: '<button class="btn sm" data-act="tab" data-v="runway">Pause a purchase</button>' });
    if (r.budget) M.push({ id: 'envelope', tag: 'Runway', title: 'Weekly envelope for the rest of the month', why: 'Turn what is left into one weekly number, so nobody does math in the store aisle.',
      body: '<div class="res"><b>' + money(Math.max(0, Math.floor(r.perWeek))) + '</b> per week for ' + r.weeks + ' week' + (r.weeks > 1 ? 's' : '') + ' (groceries, kids, gas)</div>',
      act: '<button class="btn sm" data-act="cap" data-v="' + Math.max(0, Math.floor(r.perWeek)) + '">' + (state.weeklyCap ? 'Update our envelope' : 'Use as our weekly envelope') + '</button>' });
    if (s.total) {
      var body;
      if (ia && ib) {
        var eqA = s.total / 2 / ia * 100, eqB = s.total / 2 / ib * 100, pr = s.total / inc * 100;
        body = '<div class="res">50/50: ' + esc(nm('a')) + ' gives <b>' + eqA.toFixed(0) + '%</b> of pay, ' + esc(nm('b')) + ' gives <b>' + eqB.toFixed(0) + '%</b>.<br>By income: both give <b>' + pr.toFixed(0) + '%</b>.</div>';
      } else body = '<div class="res">Add both take-home incomes in Setup to compare.</div>';
      M.push({ id: 'split', tag: 'Fairness', title: 'Split by income, not 50/50', why: 'When paychecks differ, equal halves cost the lower earner a bigger slice of their pay. Proportional split keeps the effort equal.',
        body: body, act: ia && ib ? (state.split === 'income' ? '<span class="dim">You already split by income.</span> <button class="btn sm ghost" data-act="split" data-v="equal">Back to 50/50</button>' : '<button class="btn sm" data-act="split" data-v="income">Switch to by income</button>') : '<button class="btn sm" data-act="settings">Add incomes</button>' });
    }
    var subs = state.view === 'both' ? null : monthTx().filter(function (t) { return t.owner === state.view && t.kind === 'personal' && t.cat === 'subs'; });
    var subBody = subs === null ? '<div class="res">Subscriptions are personal, so each of you audits your own. Switch to your view.</div>'
      : !subs.length ? '<div class="res">No subscriptions found in your lines this month.</div>'
        : '<div class="list">' + subs.map(function (t) { var c = state.cancel[t.desc]; return '<div class="li ' + (c ? 'done' : '') + '"><span class="grow">' + esc(t.desc) + '</span><span class="dim">' + money(t.amount * 12) + '/yr</span><button class="btn sm ' + (c ? 'go' : '') + '" data-act="cancelSub" data-v="' + esc(t.desc) + '">' + (c ? 'Will cancel' : 'Cancel?') + '</button></div>'; }).join('') + '</div>' +
        '<div class="res">Cancelling frees <b>' + money(sum(subs.filter(function (t) { return state.cancel[t.desc]; }), function (t) { return t.amount * 12; })) + '</b> a year</div>';
    M.push({ id: 'subs', tag: 'Leaks', title: 'Subscription audit', why: 'Small monthly charges hide in long statements. Look at the yearly price; keep what you would sign up for again today.', body: subBody, act: '' });
    if (r.budget) {
      var goal = r.budget * 3, have = +state.savings || 0, pct = Math.min(100, have / goal * 100), auto = inc ? Math.round(inc * 0.05 / 10) * 10 : 0;
      M.push({ id: 'cushion', tag: 'Safety', title: 'Emergency cushion: 3 months of home costs', why: 'A cushion turns a surprise bill into an inconvenience instead of a fight. Pay it first, on payday, automatically.',
        body: '<div class="res">Goal <b>' + money(goal) + '</b> · you have ' + money(have) + '</div><div class="progress"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
          (auto ? '<p class="dim">Set an automatic transfer of ' + money(auto) + ' a month (5% of take-home): ' + (have >= goal ? 'goal reached.' : 'about ' + Math.ceil((goal - have) / auto) + ' months to the goal.') + '</p>' : ''),
        act: '<form class="row" data-form="savings"><input type="number" name="v" min="0" step="50" value="' + (have || '') + '" placeholder="Savings now ($)" style="width:170px"><button class="btn sm" type="submit">Update</button></form>' });
      var mon = +state.month.split('-')[1];
      M.push({ id: 'sinking', tag: 'Planning', title: mon >= 10 ? 'Holidays are coming: start a sinking fund' : 'Sinking fund for irregular costs', why: 'Holidays, birthdays, car repairs and school trips are not surprises. Divide the yearly total by 12 and set it aside monthly.',
        body: '<div class="res"><b>' + money(Math.ceil(state.irregular / 12)) + '</b> a month · ' + esc(nm('a')) + ' ' + money(Math.ceil(shares(state.irregular / 12).a)) + ', ' + esc(nm('b')) + ' ' + money(Math.ceil(shares(state.irregular / 12).b)) + '</div>',
        act: '<form class="row" data-form="irregular"><input type="number" name="v" min="0" step="100" value="' + state.irregular + '" style="width:150px"><span class="dim">yearly irregular costs</span><button class="btn sm" type="submit">Update</button></form>' });
      if (inc) {
        var hp = r.budget / inc * 100;
        M.push({ id: 'balance', tag: 'Big picture', title: 'Check the 50/30/20 balance', why: 'A common rule of thumb: about 50% of take-home pay to needs, 30% to wants, 20% to savings and debt.',
          body: '<div class="res">Your home budget is <b>' + hp.toFixed(0) + '%</b> of combined take-home.</div><div class="progress"><i style="width:' + Math.min(100, hp).toFixed(1) + '%;background:' + (hp > 50 ? 'var(--yellow)' : 'var(--green)') + '"></i></div><p class="dim">' + (hp > 50 ? 'Above 50%: look for one fixed cost to renegotiate (phone, insurance, internet).' : 'Within 50%: room left for wants and saving. Make the 20% automatic.') + '</p>', act: '' });
      }
    }
    return M;
  }
  function movesScreen() {
    var M = movesList(), done = M.filter(function (m) { return state.moves[m.id]; }).length;
    return '<div class="scorebar"><h2>Money moves</h2><span class="pill">' + done + ' of ' + M.length + ' done this month</span><span class="dim">Small actions from personal-finance basics, calculated from your own numbers.</span></div>' +
      '<div class="moves">' + M.map(function (m) {
        var d = state.moves[m.id];
        return '<div class="card move ' + (d ? 'isdone' : '') + '"><span class="tag">' + m.tag + '</span><p class="kicker">' + (d ? 'DONE' : 'MOVE') + '</p><h3 style="padding-right:80px">' + m.title + '</h3><p class="why">' + m.why + '</p>' + m.body +
          '<div class="row between">' + (m.act || '<span></span>') + '<button class="btn sm ' + (d ? 'go' : 'ghost') + '" data-act="moveDone" data-v="' + m.id + '">' + (d ? '✓ Done' : 'Mark done') + '</button></div></div>';
      }).join('') + '</div>';
  }

  /* ===================== AI (OpenAI) with offline fallback ===================== */
  // Mode "key": the OpenAI key saved in Setup (stays in this browser).
  // Mode "proxy": the site is hosted with the /api/ai server function (key lives on the server).
  // Mode "off": no AI. Every feature falls back to built-in rules so the demo never breaks.
  var busy = {}, proxyOk = null, workingModel = null;
  function aiMode() {
    if (state.ai && state.ai.key) return 'key';
    if (/^https?:$/.test(location.protocol) && proxyOk !== false) return 'proxy';
    return 'off';
  }
  function aiLabel() { var m = aiMode(); return m === 'key' ? 'AI on' : m === 'proxy' ? (proxyOk ? 'AI on' : 'AI: server') : 'AI offline'; }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function aiChat(messages, json) {
    var mode = aiMode();
    if (mode === 'off') return Promise.reject(new Error('offline'));
    var models = uniq([workingModel, (state.ai && state.ai.model) || 'gpt-5-mini', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini']);
    function attempt(i) {
      var model = models[i], body = { model: model, messages: messages };
      if (json) body.response_format = { type: 'json_object' };
      var req = mode === 'key'
        ? fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.ai.key }, body: JSON.stringify(body) })
        : fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model, messages: messages, json: !!json }) });
      return req.then(function (r) {
        return r.text().then(function (t) {
          if (r.ok) {
            var d; try { d = JSON.parse(t); } catch (e) { if (mode === 'proxy') proxyOk = false; throw new Error('offline'); }
            if (mode === 'proxy') proxyOk = true;
            workingModel = model;
            return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
          }
          if ((r.status === 400 || r.status === 404) && /model/i.test(t) && i + 1 < models.length) return attempt(i + 1);
          if (mode === 'proxy' && (r.status === 404 || r.status === 405 || r.status === 501)) { proxyOk = false; throw new Error('offline'); }
          if (mode === 'proxy') { var pe = parseJSON(t); throw new Error('AI: ' + ((pe && pe.error) || ('server error ' + r.status))); }
          if (r.status === 401) throw new Error('OpenAI did not accept the key. Check it in Setup.');
          if (r.status === 429) throw new Error('OpenAI says: rate limit or no credit on this key.');
          throw new Error('OpenAI error ' + r.status);
        });
      }, function () {
        if (mode === 'proxy') { proxyOk = false; throw new Error('offline'); }
        throw new Error('Could not reach OpenAI. Check the internet connection.');
      });
    }
    return attempt(0);
  }
  function parseJSON(t) { try { return JSON.parse(String(t).replace(/^```(json)?/i, '').replace(/```$/, '').trim()); } catch (e) { return null; } }
  function fmt(t) {
    var out = '', prevBul = false;
    String(t || '').split('\n').forEach(function (raw) {
      if (!raw.trim()) return;
      var l = esc(raw).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)_(.+?)_(\s|$)/g, '$1<i>$2</i>$3');
      if (/^\s*([-*•]|\d+[.)])\s+/.test(raw)) { out += '<span class="bul">' + l.replace(/^\s*[-*•]\s+/, '• ') + '</span>'; prevBul = true; }
      else { out += (out && !prevBul ? '<br>' : '') + l; prevBul = false; }
    });
    return out;
  }

  // What the AI may see: home numbers, and the viewer's own personal lines only. Never the partner's personal lines.
  function aiContext() {
    var r = runway(), s = settle(), v = state.view, home = {};
    foundationTx().forEach(function (t) {
      var k = catName('foundation', t.cat); home[k] = home[k] || { total: 0 };
      home[k].total += t.amount; home[k]['paid_by_' + nm(t.owner)] = (home[k]['paid_by_' + nm(t.owner)] || 0) + t.amount;
    });
    Object.keys(home).forEach(function (k) { Object.keys(home[k]).forEach(function (x) { home[k][x] = Math.round(home[k][x]); }); });
    var ctx = {
      month: monthName(state.month), today: iso(refDate()), partners: [nm('a'), nm('b')],
      speaking_with: v === 'both' ? 'both partners together' : nm(v),
      take_home_monthly: { [nm('a')]: +state.a.income || null, [nm('b')]: +state.b.income || null },
      split_rule: state.split === 'income' ? 'by income' : '50/50',
      home_budget_monthly: r.budget, home_spent_by_category: home, home_spent_total: Math.round(r.spent),
      runway: { free_for_home: Math.round(r.free), days_left: r.daysLeft, per_day: Math.round(r.perDay), per_week: Math.round(r.perWeek), status: r.level === 'ok' ? 'on track' : r.level === 'warn' ? 'thin (<15% left)' : 'almost empty' },
      bills_still_coming: r.bills.map(function (b) { return { name: b.name, amount: b.amount, day: b.day }; }),
      settle_up: { [nm('a') + '_paid']: Math.round(s.paid.a), [nm('b') + '_paid']: Math.round(s.paid.b), transfer: s.amount >= 1 ? nm(s.from) + ' sends ' + nm(s.to) + ' $' + Math.round(s.amount) : 'even', settled: state.settled.some(function (x) { return x.month === state.month; }) },
      purchases_on_24h_pause: state.pauses.filter(function (p) { return p.status === 'waiting' && (p.kind === 'foundation' || p.who === v); }).map(function (p) { return p.item + ' $' + p.price; }),
      emergency_savings: +state.savings || 0, weekly_envelope: state.weeklyCap || null, yearly_irregular_costs: state.irregular
    };
    if (v !== 'both') {
      var mine = {}; monthTx().filter(function (t) { return t.owner === v && t.kind === 'personal'; }).forEach(function (t) { var k = catName('personal', t.cat); mine[k] = Math.round((mine[k] || 0) + t.amount); });
      ctx['personal_spending_of_' + nm(v) + '_private'] = mine;
    }
    return JSON.stringify(ctx);
  }

  /* ---------- 1. smart sort with AI ---------- */
  function aiSort(ids) {
    var lines = state.tx.filter(function (t) { return ids.indexOf(t.id) >= 0 && !t.confirmed; });
    if (!lines.length) return Promise.resolve(0);
    var sys = 'You sort lines from US credit card statements for a couple who share a home.\n' +
      '"foundation" = shared household costs: groceries, kids, school and activities, kids clothes, utilities, phone and internet, rent or mortgage, car and gas and car insurance, pharmacy and doctors, home supplies.\n' +
      '"personal" = one partner\'s own spending: eating out and coffee, subscriptions, clothes and beauty for themselves, games and fun, gym and self-care, other.\n' +
      'Foundation category ids: ' + FOUNDATION.map(function (c) { return c.id + ' (' + c.name + ')'; }).join(', ') + '.\n' +
      'Personal category ids: ' + PERSONAL.map(function (c) { return c.id + ' (' + c.name + ')'; }).join(', ') + '.\n' +
      'Return JSON only: {"lines":[{"i":0,"kind":"foundation","cat":"groceries","why":"grocery store"}]} with one item per input line. "why" is at most 6 words. If a merchant sells both (Amazon, Target, Walmart, Costco), pick the most likely use from the amount and merchant.';
    var user = JSON.stringify(lines.map(function (t, i) { return { i: i, merchant: t.desc, amount: t.amount }; }));
    return aiChat([{ role: 'system', content: sys }, { role: 'user', content: user }], true).then(function (txt) {
      var d = parseJSON(txt), n = 0;
      ((d && d.lines) || []).forEach(function (x) {
        var t = lines[+x.i]; if (!t) return;
        var kind = x.kind === 'foundation' ? 'foundation' : 'personal';
        if (!catList(kind).some(function (c) { return c.id === x.cat; })) return;
        if (t.kind !== kind || t.cat !== x.cat || !t.sure) n++;
        t.kind = kind; t.cat = x.cat; t.ai = true; t.sure = true; t.why = String(x.why || '').slice(0, 60);
      });
      save(); return n;
    });
  }
  function runAiSort(ids, quiet) {
    if (aiMode() === 'off') { if (!quiet) toast('AI is offline: add an OpenAI key in Setup. Built-in rules already sorted these lines.'); return; }
    busy.sort = true; render();
    aiSort(ids).then(function (n) { toast('AI sorted the lines: ' + n + ' changed. Please confirm yours.'); }, function (e) { if (!quiet || e.message !== 'offline') toast(e.message === 'offline' ? 'AI is offline: rules sorted the lines.' : e.message); })
      .then(function () { busy.sort = false; render(); });
  }

  /* ---------- 2. Quits Coach: financial-literacy assistant ---------- */
  var COACH = 'You are Quits Coach, a warm, practical money coach inside Quits, a web app for US couples who share household costs.\n' +
    'Rules:\n- Use only the numbers in CONTEXT; never invent figures. Use $ and US terms (paycheck, Venmo, Zelle, 401(k)).\n' +
    '- Never mention CONTEXT, JSON or field names (no words with underscores); say "free for the home", "home budget", "per week" in plain words.\n' +
    '- If the runway is thin, do not suggest moving the remaining home money into savings; start savings from the next paycheck instead.\n' +
    '- Answer in at most 120 words: one short sentence, then 1 to 3 concrete steps as "- " bullets.\n' +
    '- Prefer the app\'s own tools: Runway, 24-hour pause, Weekly envelope, Settle up (50/50 or by income), Money date, Subscription audit, Emergency cushion, Sinking fund.\n' +
    '- Teach one financial-literacy idea per answer when useful (pay yourself first, 50/30/20, sinking funds, proportional split, 24-hour rule).\n' +
    '- Never blame or shame either partner. Never reveal, guess or ask about the other partner\'s personal spending.\n' +
    '- You are not a licensed financial advisor; for debt, taxes or investing specifics, briefly suggest a CFP professional.\n' +
    '- Reply in the language the user writes in.';
  var CHIPS = ['How do we not run out before payday?', 'Is 50/50 fair for us?', 'Where can we cut $200 this month?', 'How do we start an emergency fund?', 'We keep arguing about groceries. What do we do?'];

  function offlineCoach(q) {
    var r = runway(), s = settle(), d = (q || '').toLowerCase(), ia = +state.a.income || 0, ib = +state.b.income || 0;
    var home = {}; foundationTx().forEach(function (t) { home[t.cat] = (home[t.cat] || 0) + t.amount; });
    var top = Object.keys(home).sort(function (x, y) { return home[y] - home[x]; }).slice(0, 2).map(function (c) { return catName('foundation', c) + ' (' + money(home[c]) + ')'; });
    if (/payday|run out|broke|left|runway|end of|до зарплат|не хват|конча|запас|остал/.test(d))
      return 'You have **' + money(r.free) + '** free for the home for ' + r.daysLeft + ' days: about ' + money(Math.max(0, r.perDay)) + ' a day.\n- Use **' + money(Math.max(0, Math.floor(r.perWeek))) + ' a week** as your envelope for groceries, kids and gas.\n- Put anything unplanned over ' + money(state.pauseMin) + ' on the 24-hour pause.\n- Pay the bills still coming first' + (r.bills.length ? ': ' + r.bills.map(function (b) { return b.name + ' ' + money(b.amount); }).join(', ') : '') + '.';
    if (/fair|50\/50|split|income|честн|дел|доход/.test(d)) {
      if (ia && ib) { var pa = s.total / 2 / ia * 100, pb = s.total / 2 / ib * 100; return 'With 50/50, ' + nm('a') + ' gives **' + pa.toFixed(0) + '%** of take-home to the home and ' + nm('b') + ' gives **' + pb.toFixed(0) + '%**.\n- Splitting by income makes it the same share of each paycheck (' + (s.total / (ia + ib) * 100).toFixed(0) + '%).\n- Try it in Settle up: one tap, then decide together at your money date.'; }
      return 'Fair usually means the same share of each paycheck, not equal dollars.\n- Add both take-home incomes in Setup.\n- Then compare 50/50 and by income in Settle up.';
    }
    if (/cut|save|spend less|reduce|сократ|эконом|сэконом/.test(d))
      return 'The biggest home costs this month: ' + (top.join(' and ') || 'none yet') + '.\n- Set a weekly cap for the top one and check it at the money date.\n- Run the subscription audit on your own lines (look at the yearly price).\n- Use the 24-hour pause: the urge fades, real needs stay.';
    if (/emergency|cushion|savings|подушк|сбереж|накоп/.test(d))
      return 'Aim for 3 months of home costs: **' + money(r.budget * 3) + '**.\n- Pay yourself first: an automatic transfer on payday' + (ia + ib ? ', for example ' + money(Math.round((ia + ib) * 0.05 / 10) * 10) + ' a month (5% of take-home)' : '') + '.\n- Keep it in a separate high-yield savings account, not checking.\n- Track it in Money moves.';
    if (/argu|fight|talk|partner|blame|ссор|руга|разговор|партн|упрек/.test(d))
      return 'Money talks go better on a schedule than at the checkout.\n- Hold a 10-minute money date with the house on screen.\n- Each of you writes your side in "Talk it out"; Quits finds the common ground.\n- Use "Say it kindly" before sending a tense message.';
    return 'This month the home cost **' + money(r.spent) + '**' + (top.length ? ', mostly ' + top.join(' and ') : '') + '. Runway: ' + money(r.free) + ' for ' + r.daysLeft + ' days.\n' + (s.amount >= 1 ? '- Settle up: ' + nm(s.from) + ' sends ' + nm(s.to) + ' ' + money(s.amount) + '.\n' : '') + '- Try one money move this week (Money moves tab).';
  }
  function askCoach(q) {
    q = String(q || '').trim(); if (!q || busy.coach) return;
    state.chat = state.chat || {}; var log = state.chat[state.view] = state.chat[state.view] || [];
    log.push({ role: 'user', content: q }); busy.coach = true; save(); render(); scrollChat();
    var msgs = [{ role: 'system', content: COACH + '\n\nCONTEXT (JSON):\n' + aiContext() }].concat(log.slice(-10).map(function (m) { return { role: m.role, content: m.content }; }));
    aiChat(msgs).then(function (a) { log.push({ role: 'assistant', content: a || offlineCoach(q), ai: true }); },
      function (e) { log.push({ role: 'assistant', content: offlineCoach(q) + (e.message !== 'offline' ? '\n_' + e.message + '_' : ''), ai: false }); })
      .then(function () { if (log.length > 40) log.splice(0, log.length - 40); busy.coach = false; save(); render(); scrollChat(); });
  }
  function scrollChat() { setTimeout(function () { var c = document.querySelector('.chat-log'); if (c) c.scrollTop = c.scrollHeight; }, 30); }

  /* ---------- 3. Talk it out: neutral mediator between partners ---------- */
  var MEDIATOR = 'You are a calm, neutral mediator inside Quits, helping a US couple talk about shared household money.\n' +
    'Each partner wrote their side privately. Do not quote them; summarize kindly. Never take sides, never blame, no therapy or diagnoses. Use the home numbers in CONTEXT where they help (settle-up transfer, runway, weekly envelope).\n' +
    'Return JSON only: {"shared_goal":"one sentence","needs":{"a":"what partner A needs, one sentence","b":"what partner B needs, one sentence"},"steps":["three concrete steps for this month, using the app tools"],"say_it":{"a":"an opening line A can say, first person, no blame","b":"an opening line B can say"},"safety":false}\n' +
    'Set "safety": true only if a side mentions fear, threats, being controlled, money being taken or withheld, or abuse.\n' +
    'Write in the language the partners used.';
  function offlineMediate() {
    var s = settle(), r = runway(), more = s.paid.a >= s.paid.b ? 'a' : 'b', less = other(more);
    var res = {
      shared_goal: 'Get to the end of ' + MONTHS[+state.month.split('-')[1] - 1] + ' without running out, and keep the home split fair.',
      needs: {}, steps: [], say_it: {}, safety: false, offline: true
    };
    res.needs[more] = nm(more) + ' needs what they pay for the home to be seen and evened out.';
    res.needs[less] = nm(less) + ' needs to know where the money goes without feeling judged.';
    if (s.amount >= 1) res.steps.push('Settle up: ' + nm(s.from) + ' sends ' + nm(s.to) + ' ' + money(s.amount) + ' and you mark the month settled.');
    if (r.budget) res.steps.push('Use ' + money(Math.max(0, Math.floor(r.perWeek))) + ' a week as your home envelope until the end of the month.');
    res.steps.push('Anything unplanned over ' + money(state.pauseMin) + ' goes on the 24-hour pause; the other partner gets a say.');
    res.steps.push('Book a 10-minute money date for the 1st of next month.');
    res.steps = res.steps.slice(0, 3);
    res.say_it[more] = 'I want us to feel like a team on the home costs. Can we look at the house together and settle up?';
    res.say_it[less] = 'I want to understand where our home money goes. Can we agree on a weekly number we both stick to?';
    return res;
  }
  var DANGER = /(afraid|scared|threat|hits?|hurt|controls? (all )?(my|the) money|takes? my (money|card|paycheck)|won'?t let me|боюсь|угрож|бьет|бьёт|забирает|не дает денег|не даёт денег)/i;
  function mediate() {
    var t = state.talk; if (!t || !t.a || !t.b || busy.talk) return;
    busy.talk = true; render();
    var user = 'Partner A (' + nm('a') + ') wrote: """' + t.a + '"""\nPartner B (' + nm('b') + ') wrote: """' + t.b + '"""';
    aiChat([{ role: 'system', content: MEDIATOR + '\n\nCONTEXT (JSON):\n' + aiContext() }, { role: 'user', content: user }], true)
      .then(function (txt) { var d = parseJSON(txt); if (!d || !d.steps) throw new Error('offline'); return d; })
      .then(null, function (e) { var d = offlineMediate(); if (e.message !== 'offline') d.err = e.message; return d; })
      .then(function (d) { if (DANGER.test(t.a + ' ' + t.b)) d.safety = true; t.result = d; t.at = iso(refDate()); busy.talk = false; save(); render(); });
  }
  function offlineKind(text) {
    var amt = (text.match(/\$\s?\d[\d,.]*/) || [])[0];
    var cat = FOUNDATION.concat(PERSONAL).filter(function (c) { return c.re.some(function (re) { return re.test(text); }) || text.toLowerCase().indexOf(c.name.toLowerCase().split(' ')[0]) >= 0; })[0];
    var topic = cat ? cat.name.toLowerCase() : 'our spending';
    return 'I’ve been a bit worried about ' + topic + (amt ? ' (' + amt.replace(/\s/g, '') + ')' : '') + ' this month. I’m not blaming you. Can we look at the house together at our money date and agree on a number?';
  }
  function sayKindly(text) {
    text = String(text || '').trim(); if (!text || busy.kind) return;
    state.talk = state.talk || {}; busy.kind = true; render();
    var sys = 'Rewrite a message one partner wants to send to the other about money into a calm, non-blaming message: an I-statement, one specific fact, and one question that invites teamwork. Max 45 words. Keep the same language as the input. Return only the rewritten message.';
    aiChat([{ role: 'system', content: sys }, { role: 'user', content: text }])
      .then(function (a) { return { out: (a || '').trim() || offlineKind(text), ai: true }; }, function (e) { return { out: offlineKind(text), ai: false, err: e.message !== 'offline' ? e.message : '' }; })
      .then(function (r) { state.talk.kindIn = text; state.talk.kindOut = r.out; state.talk.kindAi = r.ai; busy.kind = false; save(); render(); if (r.err) toast(r.err); });
  }

  /* ---------- 4. Coach suggestions on Home ---------- */
  function getTips() {
    if (busy.tips) return; busy.tips = true; render();
    var sys = COACH + '\nNow give exactly 3 suggestions for this couple for the rest of the month. Return JSON only: {"tips":[{"title":"max 7 words","why":"one sentence with a number from CONTEXT","tab":"runway|settle|moves|statements|coach"}]}';
    aiChat([{ role: 'system', content: sys + '\n\nCONTEXT (JSON):\n' + aiContext() }, { role: 'user', content: 'Suggestions please.' }], true)
      .then(function (txt) { var d = parseJSON(txt); if (!d || !d.tips || !d.tips.length) throw new Error('offline'); return { items: d.tips.slice(0, 3), ai: true }; })
      .then(null, function (e) {
        var items = movesList().filter(function (m) { return !state.moves[m.id]; }).slice(0, 3).map(function (m) { return { title: m.title, why: m.why, tab: 'moves' }; });
        return { items: items, ai: false, err: e.message !== 'offline' ? e.message : '' };
      })
      .then(function (r) { state.tips = { month: state.month, view: state.view, items: r.items, ai: r.ai }; busy.tips = false; save(); render(); if (r.err) toast(r.err); });
  }
  function tipsCard() {
    var t = state.tips && state.tips.month === state.month && state.tips.view === state.view ? state.tips : null;
    var TABS = { runway: 1, settle: 1, moves: 1, statements: 1, coach: 1 };
    return '<div class="card"><div class="row between"><p class="kicker">QUITS COACH SUGGESTS</p><span class="ai-tag ' + (aiMode() === 'off' ? 'off' : '') + '">' + aiLabel() + '</span></div>' +
      (t ? '<div class="list">' + t.items.map(function (x) {
        var tab = TABS[x.tab] ? x.tab : 'moves';
        return '<div class="li" style="align-items:flex-start"><div class="grow"><b>' + esc(x.title) + '</b><p class="dim" style="margin-top:2px">' + esc(x.why) + '</p></div><button class="btn sm" data-act="tab" data-v="' + tab + '">Go</button></div>';
      }).join('') + '</div>' + (t.ai ? '' : '<p class="dim">Built-in suggestions. Add an OpenAI key in Setup for personal ones.</p>') : '<p class="muted">Three things to do this month, based on your numbers.</p>') +
      '<div><button class="btn sm ' + (t ? 'ghost' : 'go') + '" data-act="tips"' + (busy.tips ? ' disabled' : '') + '>' + (busy.tips ? 'Thinking…' : t ? 'Refresh' : 'Get suggestions') + '</button></div></div>';
  }

  /* ---------- the "Ask Quits" screen ---------- */
  function coachScreen() {
    var v = state.view, log = (state.chat && state.chat[v]) || [];
    var chat = '<div class="card chat"><div class="row between"><p class="kicker">QUITS COACH · MONEY BASICS</p><span class="ai-tag ' + (aiMode() === 'off' ? 'off' : '') + '" data-act="settings" title="AI settings">' + aiLabel() + '</span></div>' +
      '<p class="dim">Knows your home numbers' + (v === 'both' ? '' : ' and your own personal lines') + '. Never sees ' + (v === 'both' ? 'anyone’s' : esc(nm(other(v))) + '’s') + ' personal spending.</p>' +
      '<div class="chat-log">' + (log.length ? log.map(function (m) {
        return '<div class="msg ' + (m.role === 'user' ? 'me' : 'bot') + '">' + (m.role === 'user' ? esc(m.content) : fmt(m.content) + (m.ai === false ? '<span class="src">built-in coach</span>' : '')) + '</div>';
      }).join('') : '<div class="msg bot">Hi! Ask me anything about your home money this month: how not to run out before payday, what is fair, where to cut. I answer with your numbers.</div>') +
      (busy.coach ? '<div class="msg bot typing">Thinking…</div>' : '') + '</div>' +
      '<div class="chips">' + CHIPS.map(function (c) { return '<button class="chip" data-act="ask" data-v="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
      '<form class="row" data-form="coach" autocomplete="off"><input type="text" name="q" placeholder="Ask in English or Russian…" style="flex:1;min-width:0"><button class="btn go" type="submit"' + (busy.coach ? ' disabled' : '') + '>Ask</button></form>' +
      (log.length ? '<button class="linkbtn" data-act="chatClear">Clear chat</button>' : '') + '</div>';

    var t = state.talk || {};
    var sides = ['a', 'b'].map(function (o) {
      var mine = v === o, has = !!t[o];
      if (mine) return '<form class="stack" data-form="side" autocomplete="off"><label class="f">' + esc(nm(o)) + '’s side <span class="private">private: ' + esc(nm(other(o))) + ' sees only the fair summary</span>' +
        '<textarea name="text" rows="3" placeholder="What bothers you about money this month? Be honest, it stays private.">' + esc(t[o] || '') + '</textarea></label><div><button class="btn sm" type="submit">' + (has ? 'Update my side' : 'Save my side') + '</button></div></form>';
      return '<div class="li">' + whoDot(o) + '<span class="grow dim">' + (has ? 'has written their side' : 'hasn’t written yet') + '</span>' + (has ? '<span style="color:var(--green)">✓</span>' : '') + '</div>';
    }).join('');
    var res = t.result, resHtml = '';
    if (res) {
      resHtml = '<div class="common">' + (res.safety ? '<div class="alert bad">If you ever feel unsafe or controlled around money, you can talk to someone confidentially: National Domestic Violence Hotline, 1-800-799-7233 (thehotline.org).</div>' : '') +
        '<p class="pix" style="color:var(--green)">COMMON GROUND</p><h3>' + esc(res.shared_goal) + '</h3>' +
        '<div class="kv2">' + ['a', 'b'].map(function (o) { return '<p><span class="dot ' + o + '"></span> <span class="muted">' + esc((res.needs || {})[o] || '') + '</span></p>'; }).join('') + '</div>' +
        '<p class="pix" style="color:var(--yellow);margin-top:6px">THIS MONTH</p><ol>' + (res.steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
        '<p class="pix" style="color:#C9C3F5">HOW TO START</p>' + ['a', 'b'].map(function (o) { return '<p class="say">' + whoDot(o) + ' “' + esc((res.say_it || {})[o] || '') + '”</p>'; }).join('') +
        (res.offline ? '<p class="dim">Built-in mediator. Add an OpenAI key in Setup for a summary of your actual words.</p>' : '') + '</div>';
    }
    var talk = '<div class="card"><div class="row between"><p class="kicker">TALK IT OUT · NEUTRAL MEDIATOR</p><span class="ai-tag ' + (aiMode() === 'off' ? 'off' : '') + '">' + aiLabel() + '</span></div>' +
      '<p class="muted">Each of you writes your side privately. Quits finds the shared goal and 3 steps for this month, with your real numbers.</p>' +
      (v === 'both' ? '<p class="dim">Switch to ' + esc(nm('a')) + ' or ' + esc(nm('b')) + ' (top right) to write your side.</p>' : '') +
      '<div class="stack">' + sides + '</div>' +
      '<div class="row"><button class="btn go" data-act="mediate"' + (t.a && t.b && !busy.talk ? '' : ' disabled') + '>' + (busy.talk ? 'Finding common ground…' : 'Find common ground') + '</button>' + (t.a && t.b ? '' : '<span class="dim">Unlocks when both sides are written</span>') +
      (t.a || t.b || res ? '<button class="btn sm ghost" data-act="talkReset">Start over</button>' : '') + '</div>' + resHtml + '</div>';

    var kind = '<div class="card"><p class="kicker">SAY IT KINDLY</p><p class="muted">About to send something tense? Quits rewrites it as a calm “I” message with one question.</p>' +
      '<form class="stack" data-form="kind" autocomplete="off"><textarea name="text" rows="2" placeholder="Why did you spend $820 on groceries again?!">' + esc(t.kindIn || '') + '</textarea><div><button class="btn sm go" type="submit"' + (busy.kind ? ' disabled' : '') + '>' + (busy.kind ? 'Rewriting…' : 'Rewrite kindly') + '</button></div></form>' +
      (t.kindOut ? '<div class="say-out">' + esc(t.kindOut) + '</div><div class="row"><button class="btn sm" data-act="copyText">Copy</button>' + (t.kindAi ? '' : '<span class="dim">built-in template</span>') + '</div>' : '') + '</div>';
    return '<div class="grid g2e"><div class="stack" style="gap:20px">' + chat + '</div><div class="stack" style="gap:20px">' + talk + kind + '</div></div>';
  }

  /* ===================== modals ===================== */
  function modal(html, wide) { document.getElementById('modal-root').innerHTML = '<div class="modal-bg" data-act="close"><div class="modal' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div></div>'; }
  function closeModal() { document.getElementById('modal-root').innerHTML = ''; }
  function plusModal() {
    var tl = trialLeft();
    modal('<p class="kicker">QUITS PLUS</p><h2>' + (state.plan.plus ? 'Quits Plus is on.' : tl > 0 ? 'Your free month: ' + tl + ' days left.' : 'Your free month is over.') + '</h2>' +
      '<div class="tiers"><div class="tier"><p class="pix" style="color:var(--ink3)">FREE MONTH</p><p class="mid">$0</p><ul><li>Statement upload and smart sort</li><li>The house: who paid for the home</li><li>Private personal lines</li><li>Runway for one month</li></ul></div>' +
      '<div class="tier hot"><p class="pix" style="color:var(--green)">QUITS PLUS</p><p class="mid">$49<span class="dim"> / year per couple</span></p><p class="dim">or $5.99 a month</p><ul><li>Fair Settle every month, 50/50 or by income</li><li>Runway alerts and 24-hour pause with partner vote</li><li>Money moves and settle history</li><li>"Year in the home" report</li></ul></div></div>' +
      '<div class="row">' + (state.plan.plus ? '<button class="btn" data-act="plusOff">Turn off (demo)</button>' : '<button class="btn go" data-act="plusOn">Keep Quits Plus · $49/yr</button>') + '<button class="btn ghost" data-act="close">Close</button></div>' +
      '<p class="dim">Demo build: no card is charged. One subscription covers both partners.</p>', true);
  }
  function dateModal() {
    var items = [['look', 'Look at the house together. What surprised each of you? (No comments on the other’s personal spending.)'], ['confirm', 'Each of you confirms your own lines: home or mine.'], ['settle', 'Settle the month with one transfer, then mark it settled.'], ['plan', 'Agree on next month’s home budget and one small move to try.']];
    modal('<p class="kicker">MONEY DATE · 10 MINUTES</p><h2>Same time every month.</h2><p class="muted">Pick a calm moment, not right after a big purchase. Phones down, the house on screen.</p><div class="checks">' +
      items.map(function (i) { return '<label><input type="checkbox" data-in="date" data-v="' + i[0] + '"' + (state.date[i[0]] ? ' checked' : '') + '><span>' + i[1] + '</span></label>'; }).join('') +
      '</div><div class="row"><button class="btn go" data-act="close">Done</button><button class="btn ghost" data-act="dateReset">Reset for next month</button></div>');
  }
  function settingsModal() {
    var resetArmed = settingsModal.armed;
    modal('<p class="kicker">SETUP</p><h2>Your home</h2><form class="stack" data-form="settings" autocomplete="off">' +
      '<div class="grid g2e"><label class="f">Partner A<input type="text" name="an" value="' + esc(state.a.name) + '" required></label><label class="f">Partner B<input type="text" name="bn" value="' + esc(state.b.name) + '" required></label></div>' +
      '<div class="grid g2e"><label class="f">A take-home / month<input type="number" name="ai" min="0" step="50" value="' + (state.a.income || '') + '"></label><label class="f">B take-home / month<input type="number" name="bi" min="0" step="50" value="' + (state.b.income || '') + '"></label></div>' +
      '<div class="grid g2e"><label class="f">Home budget / month<input type="number" name="bud" min="0" step="50" value="' + (state.budget || '') + '"></label><label class="f">Pause purchases over ($)<input type="number" name="pmin" min="0" step="10" value="' + state.pauseMin + '"></label></div>' +
      '<div class="grid g2e"><label class="f">OpenAI API key (optional)<input type="password" name="aikey" value="' + esc((state.ai && state.ai.key) || '') + '" placeholder="sk-…" autocomplete="off"></label><label class="f">Model<input type="text" name="aimodel" value="' + esc((state.ai && state.ai.model) || 'gpt-5-mini') + '"></label></div>' +
      '<p class="dim">The key is saved only in this browser and sent only to OpenAI. Without a key, AI features use the built-in coach.</p>' +
      '<label class="f">Split<select name="split"><option value="equal"' + (state.split === 'equal' ? ' selected' : '') + '>50/50</option><option value="income"' + (state.split === 'income' ? ' selected' : '') + '>By income</option></select></label>' +
      '<div class="row"><button class="btn go" type="submit">Save</button><button class="btn" type="button" data-act="demo">Load demo couple</button><button class="btn ghost" type="button" data-act="reset">' + (resetArmed ? 'Click again to erase everything' : 'Reset everything') + '</button></div></form>' +
      '<p class="dim">Everything is stored only in this browser. Nothing is sent anywhere.</p>');
  }

  /* ===================== render ===================== */
  function render() {
    var app = document.getElementById('app');
    if (!state.onboarded) { app.innerHTML = onboarding(); return; }
    var body = state.tab === 'statements' ? statementsScreen() : state.tab === 'runway' ? runwayScreen() : state.tab === 'settle' ? settleScreen() : state.tab === 'moves' ? movesScreen() : state.tab === 'coach' ? coachScreen() : homeScreen();
    app.innerHTML = '<div class="wrap">' + header() + tabs() + body +
      '<div class="foot"><span>Quits · demo build · your data stays in this browser</span><span><button class="linkbtn" data-act="settings">Setup</button> · <button class="linkbtn" data-act="demo">Reload demo</button></span></div></div>';
  }

  /* ===================== actions ===================== */
  function tx(id) { return state.tx.filter(function (t) { return t.id === id; })[0]; }
  function pz(id) { return state.pauses.filter(function (p) { return p.id === id; })[0]; }
  var pickOwner = 'a';

  function importFile(file, owner) {
    if (!file) return;
    if (/\.pdf$/i.test(file.name)) { toast('PDF reading comes next. For now use "Download CSV" in your bank — every major US bank has it.'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var res = readStatement(String(fr.result), owner);
        if (!res.tx.length) { toast('No purchases found in that file.'); return; }
        var had = state.tx.length;
        var key = function (t) { return t.owner + '|' + t.date + '|' + t.desc + '|' + t.amount; };
        var seen = {}; state.tx.forEach(function (t) { seen[key(t)] = 1; });
        var add = res.tx.filter(function (t) { return !seen[key(t)]; });
        if (!had && add.length) {
          var cnt = {}; add.forEach(function (t) { var m = t.date.slice(0, 7); cnt[m] = (cnt[m] || 0) + 1; });
          state.month = Object.keys(cnt).sort(function (x, y) { return cnt[y] - cnt[x]; })[0];
        }
        state.tx = state.tx.concat(add);
        if (state.view === 'both') state.view = owner;
        state.tab = 'statements';
        save(); render();
        var home = add.filter(function (t) { return t.kind === 'foundation'; }).length;
        var unclear = add.filter(function (t) { return !t.sure; }).map(function (t) { return t.id; });
        if (unclear.length && aiMode() !== 'off') setTimeout(function () { runAiSort(unclear, true); }, 2700);
        toast(add.length + ' lines from ' + nm(owner) + ': ' + home + ' home, ' + (add.length - home) + ' personal' + (res.skipped ? ', ' + res.skipped + ' payments skipped' : '') + (add.length < res.tx.length ? ', duplicates ignored' : ''));
      } catch (e) { toast(e.message || 'Could not read this file.'); }
    };
    fr.readAsText(file);
  }

  var ACT = {
    tab: function (v) { set({ tab: v }); window.scrollTo(0, 0); },
    view: function (v) { set({ view: v }); },
    demo: function () { closeModal(); loadDemo(); },
    plus: plusModal,
    plusOn: function () { state.plan.plus = true; save(); render(); plusModal(); toast('Quits Plus is on (demo, no charge).'); },
    plusOff: function () { state.plan.plus = false; save(); render(); plusModal(); },
    close: closeModal,
    settings: function () { settingsModal.armed = false; settingsModal(); },
    reset: function () { if (!settingsModal.armed) { settingsModal.armed = true; settingsModal(); return; } settingsModal.armed = false; state = fresh(); save(); closeModal(); render(); },
    pick: function (v) { pickOwner = v; var f = document.getElementById('file'); if (f) { f.value = ''; f.click(); } },
    kind: function (v, id) { var t = tx(id); if (!t) return; if (t.kind !== v) { t.kind = v; var c = classify(t.desc); t.cat = c.kind === v ? c.cat : (v === 'foundation' ? 'household' : 'other'); } t.confirmed = true; save(); render(); },
    confirm: function (v, id) { var t = tx(id); if (t) { t.confirmed = !t.confirmed; save(); render(); } },
    confirmSure: function () { visibleTx().forEach(function (t) { if (canEdit(t) && t.sure) t.confirmed = true; }); save(); render(); toast('Sure lines confirmed. Check the highlighted ones.'); },
    confirmAll: function () { visibleTx().forEach(function (t) { if (canEdit(t)) t.confirmed = true; }); save(); render(); toast('All your lines are confirmed.'); },
    del: function (v, id) { state.tx = state.tx.filter(function (t) { return t.id !== id; }); save(); render(); },
    billPaid: function (v, id) { state.bills.forEach(function (b) { if (b.id === id) b.paid = !b.paid; }); save(); render(); },
    billDel: function (v, id) { state.bills = state.bills.filter(function (b) { return b.id !== id; }); save(); render(); },
    vote: function (v, id) { var p = pz(id); if (!p) return; p.votes = p.votes || {}; p.votes[other(p.who)] = v; save(); render(); toast(v === 'yes' ? 'Agreed. It can be bought after the 24 hours.' : 'Noted: let’s wait.'); },
    ff: function (v, id) { var p = pz(id); if (p) { p.created -= DAY; save(); render(); } },
    buy: function (v, id) {
      var p = pz(id); if (!p) return; p.status = 'bought';
      state.tx.push({ id: uid(), owner: p.who, date: iso(refDate()), desc: p.item, amount: p.price, kind: p.kind, cat: p.kind === 'foundation' ? 'household' : 'shopping', sure: true, confirmed: true, src: 'pause' });
      save(); render(); toast('Bought after a night’s sleep. Added to ' + (p.kind === 'foundation' ? 'the home.' : 'your lines.'));
    },
    skip: function (v, id) { var p = pz(id); if (p) { p.status = 'skipped'; save(); render(); toast(money(p.price) + ' stays in the runway.'); } },
    split: function (v) { if (v === 'income' && !(+state.a.income && +state.b.income)) { settingsModal(); toast('Add both take-home incomes first.'); return; } set({ split: v }); },
    copy: function (v) { var done = function () { toast('Copied ' + money(+v, true)); }; try { navigator.clipboard.writeText(v).then(done, function () { toast(money(+v, true)); }); } catch (e) { toast(money(+v, true)); } },
    settled: function () { var s = settle(); state.settled = state.settled.filter(function (x) { return x.month !== state.month; }); state.settled.push({ month: state.month, from: s.from, to: s.to, amount: Math.round(s.amount * 100) / 100, at: iso(refDate()) }); save(); render(); toast('Settled. The month is even.'); },
    unsettle: function () { state.settled = state.settled.filter(function (x) { return x.month !== state.month; }); save(); render(); },
    moveDone: function (v) { state.moves[v] = !state.moves[v]; save(); render(); },
    cap: function (v) { state.weeklyCap = +v; state.moves.envelope = true; save(); render(); toast('Weekly envelope: ' + money(+v) + '. It shows on your runway.'); },
    cancelSub: function (v) { state.cancel[v] = !state.cancel[v]; save(); render(); },
    dateOpen: dateModal,
    aiSortMine: function () { runAiSort(visibleTx().filter(function (t) { return canEdit(t) && !t.confirmed; }).map(function (t) { return t.id; })); },
    tips: getTips,
    ask: function (v) { askCoach(v); },
    chatClear: function () { if (state.chat) state.chat[state.view] = []; save(); render(); },
    mediate: mediate,
    talkReset: function () { state.talk = {}; save(); render(); },
    copyText: function () { var t = (state.talk && state.talk.kindOut) || ''; try { navigator.clipboard.writeText(t).then(function () { toast('Copied.'); }, function () { toast('Select and copy the text.'); }); } catch (e) { toast('Select and copy the text.'); } },
    dateReset: function () { state.date = {}; state.moves.date = false; save(); render(); dateModal(); }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.classList.contains('modal-bg') && e.target !== el) return; // clicks inside the dialog
    var f = ACT[el.getAttribute('data-act')];
    if (!f) return;
    if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
    f(el.getAttribute('data-v'), el.getAttribute('data-id'));
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'file') { importFile(el.files && el.files[0], pickOwner); return; }
    var k = el.getAttribute('data-in'); if (!k) return;
    if (k === 'month') set({ month: el.value });
    else if (k === 'cat') { var t = tx(el.getAttribute('data-id')); if (t) { t.cat = el.value; t.confirmed = true; save(); render(); } }
    else if (k === 'date') { state.date[el.getAttribute('data-v')] = el.checked; if (['look', 'confirm', 'settle', 'plan'].every(function (x) { return state.date[x]; })) state.moves.date = true; save(); render(); }
  });
  document.addEventListener('submit', function (e) {
    var form = e.target, kind = form.getAttribute('data-form'); if (!kind) return;
    e.preventDefault();
    var d = {}; new FormData(form).forEach(function (v, k) { d[k] = typeof v === 'string' ? v.trim() : v; });
    if (kind === 'setup' || kind === 'settings') {
      state.a = { name: d.an || 'Partner A', income: +d.ai || 0 }; state.b = { name: d.bn || 'Partner B', income: +d.bi || 0 };
      state.budget = +d.bud || 0; state.split = d.split || 'equal'; if (d.pmin !== undefined) state.pauseMin = +d.pmin || 0;
      if (kind === 'setup') { state.onboarded = true; state.demo = false; state.view = 'a'; state.tab = 'statements'; state.plan = { start: iso(new Date()), plus: false }; }
      if (state.split === 'income' && !(state.a.income && state.b.income)) state.split = 'equal';
      if (d.aikey !== undefined) { state.ai = { key: String(d.aikey || '').trim(), model: String(d.aimodel || '').trim() || 'gpt-5-mini' }; proxyOk = null; workingModel = null; }
      save(); closeModal(); render(); toast(kind === 'setup' ? 'Home created. Upload your first statement.' : 'Saved.');
    } else if (kind === 'cash') {
      var c = classify(d.desc), k2 = d.kind;
      state.tx.push({ id: uid(), owner: state.view, date: state.month === ym(new Date()) ? iso(new Date()) : state.month + '-01', desc: d.desc, amount: Math.round(+d.amt * 100) / 100, kind: k2, cat: c.kind === k2 ? c.cat : (k2 === 'foundation' ? 'groceries' : 'other'), sure: true, confirmed: true, src: 'cash' });
      save(); render(); toast('Added.');
    } else if (kind === 'bill') {
      state.bills.push({ id: uid(), name: d.name, amount: +d.amt, day: Math.min(31, Math.max(1, +d.day)) }); save(); render();
    } else if (kind === 'pause') {
      state.pauses.push({ id: uid(), who: d.who || 'a', item: d.item, price: +d.price, kind: d.kind, created: Date.now(), votes: {}, status: 'waiting' });
      save(); render(); toast('Paused for 24 hours. ' + (d.kind === 'foundation' ? nm(other(d.who || 'a')) + ' gets a say.' : 'Only you see it.'));
    } else if (kind === 'savings') { state.savings = +d.v || 0; save(); render(); }
    else if (kind === 'irregular') { state.irregular = +d.v || 0; save(); render(); }
    else if (kind === 'coach') askCoach(d.q);
    else if (kind === 'side') { state.talk = state.talk || {}; state.talk[state.view] = d.text; state.talk.result = null; save(); render(); toast('Saved. ' + nm(other(state.view)) + ' sees only the fair summary.'); }
    else if (kind === 'kind') sayKindly(d.text);
  });
  // drag & drop statements
  document.addEventListener('dragover', function (e) { var z = e.target.closest && e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', function (e) { var z = e.target.closest && e.target.closest('[data-drop]'); if (z) z.classList.remove('over'); });
  document.addEventListener('drop', function (e) {
    var z = e.target.closest && e.target.closest('[data-drop]'); if (!z) return; e.preventDefault(); z.classList.remove('over');
    var owner = state.view === 'both' ? 'a' : state.view;
    importFile(e.dataTransfer.files[0], owner);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  // keep the 24h timers fresh
  setInterval(function () { var a = document.activeElement; if (state.tab === 'runway' && !(a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) && !document.querySelector('.modal')) render(); }, 30000);

  // test hook (used by the automated checks, harmless in the browser)
  window.__quits = { aiContext: aiContext, offlineCoach: offlineCoach, readStatement: readStatement, classify: classify, state: function () { return state; }, settle: settle, runway: runway };

  render();
})();

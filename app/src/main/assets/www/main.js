'use strict';
const G = window.Logic;
const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');

// ---------- storage (localStorage can throw or be empty; the game must still run) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage: play on */ } },
};
let best = store.get('ll.best', 0);
let run = null, s = null, mode = 'menu', targetX = 0, banner = null, flash = 0, hitTimer = 0, time = 0;

// ---------- camera: simple pinhole looking down the road ----------
// The view spans the road (X -8..8) and the bonus lane on the right (X 9..12.4), centred between them.
const D = 45, RW = 8, LANE0 = RW + 1.2, LANE1 = RW + 4.4, XC = 2.2, HALF = 10.4;
let W, H, F, HOR, CAMH;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  F = 0.47 * Math.min(W, H * 0.6) * D / HALF;
  HOR = H * 0.06; CAMH = (H * 0.8 - HOR) * D / F; // crowd sits at 80% of screen height
}
addEventListener('resize', resize); resize();
function proj(X, dz, y = 0) {
  const d = dz + D;
  if (d < 1) return null;
  return { x: W / 2 + F * (X - XC) / d, y: HOR + F * (CAMH - y) / d, k: F / d };
}

// Sunflower formation offsets, back rows first so near soldiers draw on top.
const FORM = Array.from({ length: 140 }, (_, i) => {
  const r = 0.42 * Math.sqrt(i), a = i * 2.39996;
  return { ox: r * Math.cos(a), oz: r * Math.sin(a) * 0.7 };
});
const formSorted = FORM.map((p, i) => ({ ...p, i })).sort((a, b) => b.oz - a.oz);

// ---------- drawing ----------
const OPS = { '+': '+', '-': '−', x: '×', '/': '÷' };
const VIEW = 260, NEAR = -14; // anything nearer is below the screen edge
const crowdX = () => s.x * (RW - 1.6);

function quad(a, b, c, d, fill) {
  if (!a || !b || !c || !d) return;
  ctx.fillStyle = fill; ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.fill();
}
const strip = (x0, x1, dz0, dz1, fill, y = 0) => quad(proj(x0, dz0, y), proj(x1, dz0, y), proj(x1, dz1, y), proj(x0, dz1, y), fill);
function text(str, x, y, size, color = '#fff') {
  ctx.font = `800 ${Math.max(10, size)}px system-ui,sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 7); ctx.strokeStyle = '#000a'; ctx.strokeText(str, x, y);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function drawRoad() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#05070f'); g.addColorStop(1, '#141a2e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // one endless road: tiles follow the world distance, so nothing marks a level change
  const tile = 8, start = Math.floor((s.z + NEAR) / tile) * tile;
  for (let wz = start; wz < s.z + VIEW; wz += tile) {
    const dz0 = Math.max(wz - s.z, NEAR), dz1 = wz + tile - s.z, odd = (wz / tile) % 2;
    strip(-RW, RW, dz0, dz1, odd ? '#c9ccd6' : '#b9bdc9');
    strip(LANE0, LANE1, dz0, dz1, odd ? '#33427a' : '#2c3a6d'); // bonus lane
  }
  strip(-RW - 0.8, -RW, NEAR, VIEW, '#6b7394');
  strip(RW, LANE0, NEAR, VIEW, '#8a93b8', 0.6); // railing between road and bonus lane
  strip(LANE1, LANE1 + 0.6, NEAR, VIEW, '#6b7394');
  for (const f of s.forks) {
    const a = Math.max(f.z0 - s.z, NEAR), b = f.z1 - s.z;
    if (b < NEAR || a > VIEW) continue;
    strip(-0.25, 0.25, a, b, '#7c85a8', 1.6);
    quad(proj(-0.25, a), proj(-0.25, a, 1.6), proj(-0.25, b, 1.6), proj(-0.25, b), '#4b5478');
  }
}

function drawSoldiers(cx, dz, count, color, spread) {
  const n = Math.min(count, FORM.length);
  for (const p of formSorted) {
    if (p.i >= n) continue;
    const q = proj(cx + p.ox * spread, dz + p.oz);
    if (!q) continue;
    ctx.fillStyle = color; ctx.strokeStyle = '#0008'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(q.x, q.y - 0.45 * q.k, 0.4 * q.k, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff55';
    ctx.beginPath(); ctx.arc(q.x - 0.12 * q.k, q.y - 0.6 * q.k, 0.13 * q.k, 0, 7); ctx.fill();
  }
}

// A pack's soldiers scatter across the whole road, so even small packs read as one red carpet.
const packSeed = new WeakMap();
function drawPack(e, dz) {
  if (!packSeed.has(e)) packSeed.set(e, Math.random());
  const seed = packSeed.get(e), n = Math.min(Math.ceil(e.hp), 30);
  ctx.fillStyle = '#dc2626'; ctx.strokeStyle = '#0008'; ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const u = (seed + i * 0.618034) % 1, w = (seed * 3 + i * 0.381966) % 1;
    const q = proj(-RW + 0.8 + u * (2 * RW - 1.6), dz + w * 3);
    if (!q) continue;
    ctx.beginPath(); ctx.arc(q.x, q.y - 0.45 * q.k, 0.4 * q.k, 0, 7); ctx.fill(); ctx.stroke();
  }
}

function drawGates(e, dz) {
  [[e.left, -RW + 0.3, -0.35], [e.right, 0.35, RW - 0.3]].forEach(([g, x0, x1]) => {
    const good = g.op === '+' || g.op === 'x';
    const col = e.L < 4 ? (good ? '#2f7cf6cc' : '#e0413ccc') : '#8b5cf6cc'; // colour hints end at level 4
    quad(proj(x0, dz), proj(x1, dz), proj(x1, dz, 3.4), proj(x0, dz, 3.4), col);
    const c = proj((x0 + x1) / 2, dz, 1.7);
    if (c) text(OPS[g.op] + g.v, c.x, c.y, 1.7 * c.k);
  });
}

function drawBoss(e, dz) {
  const c = proj(0, dz, 2.4);
  if (!c) return;
  const r = 2.3 * c.k;
  ctx.fillStyle = '#b91c1c'; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.moveTo(c.x - r * 0.8, c.y - r * 0.6); ctx.lineTo(c.x - r * 1.1, c.y - r * 1.4); ctx.lineTo(c.x - r * 0.3, c.y - r * 0.9);
  ctx.moveTo(c.x + r * 0.8, c.y - r * 0.6); ctx.lineTo(c.x + r * 1.1, c.y - r * 1.4); ctx.lineTo(c.x + r * 0.3, c.y - r * 0.9); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillRect(c.x - r * 0.45, c.y - r * 0.3, r * 0.25, r * 0.2); ctx.fillRect(c.x + r * 0.2, c.y - r * 0.3, r * 0.25, r * 0.2);
  ctx.fillStyle = '#0009'; ctx.fillRect(c.x - r, c.y - r * 1.7, 2 * r, r * 0.22);
  ctx.fillStyle = '#ef4444'; ctx.fillRect(c.x - r, c.y - r * 1.7, 2 * r * e.hp / e.max, r * 0.22);
  text(String(Math.ceil(e.hp)), c.x, c.y - r * 2.05, 1.2 * c.k);
}

function drawTile(t, dz) {
  const x = (LANE0 + LANE1) / 2, pocket = !!t.pocket;
  strip(x - 1.2, x + 1.2, dz, dz + 1.6, pocket ? '#facc15' : '#2f7cf6', 0.3);
  const c = proj(x, dz + 0.8, 0.4);
  if (c) text('+' + t.v, c.x, c.y, 1.1 * c.k, pocket ? '#3b2a00' : '#fff');
}

function drawBlocker(b, dz) {
  strip(LANE0, LANE1, dz, dz + 1, '#a8743f', 3); // top
  quad(proj(LANE0, dz), proj(LANE1, dz), proj(LANE1, dz, 3), proj(LANE0, dz, 3), '#7a4f26');
  const c = proj((LANE0 + LANE1) / 2, dz, 1.5);
  if (c) text(String(Math.ceil(b.hp)), c.x, c.y, 1.6 * c.k);
}

function drawShots() {
  const t = s.target;
  if (!t || s.n <= 0) return;
  const to = t.type === 'blocker' ? proj((LANE0 + LANE1) / 2, t.z - s.z, 1.5) : proj(0, t.z - s.z, t.type === 'boss' ? 2.4 : 0.6);
  if (!to) return;
  ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2;
  for (let i = 0; i < Math.min(s.n, 14); i++) {
    const p = FORM[i], from = proj(crowdX() + p.ox, p.oz, 0.8);
    if (!from) continue;
    const u = (time * 2.5 + i * 0.37) % 1, v = Math.min(1, u + 0.08);
    ctx.beginPath();
    ctx.moveTo(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u);
    ctx.lineTo(from.x + (to.x - from.x) * v, from.y + (to.y - from.y) * v);
    ctx.stroke();
  }
}

function draw() {
  drawRoad();
  const list = [];
  const add = (arr, live, fn) => { for (const e of arr) { const dz = e.z - s.z; if (live(e) && dz > NEAR && dz < VIEW) list.push([dz, e, fn]); } };
  add(s.gates, e => !e.done, drawGates);
  add(s.tiles, e => !e.done, drawTile);
  add(s.blockers, e => e.hp > 0, drawBlocker);
  add(s.packs, e => e.hp > 0, (e, dz) => (e.type === 'boss' ? drawBoss(e, dz) : drawPack(e, dz)));
  list.sort((a, b) => b[0] - a[0]).forEach(([dz, e, fn]) => fn(e, dz));
  drawShots();
  drawSoldiers(crowdX(), 0, s.n, '#3b82f6', 1);
  const c = proj(crowdX(), 0, 3.2), full = s.n >= G.cap(s.L);
  if (c && s.n > 0) text(full ? s.n + ' MAX' : String(s.n), c.x, c.y - 0.5 * Math.sqrt(Math.min(s.n, 140)) * c.k, 1.3 * c.k, full ? '#facc15' : '#fff');
  if (flash > 0) { ctx.fillStyle = `rgba(224,65,60,${flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (banner && (mode === 'play' || mode === 'hit')) {
    text(banner.big, W / 2, H * 0.17, Math.min(W / 9, 48), banner.color); // above the road where enemies appear
    if (banner.small) text(banner.small, W / 2, H * 0.17 + 44, 18);
  }
}

// ---------- run / score / menus ----------
function score() { return G.liveScore(run, s); }
function commitTop() { if (run && s && score() > best) { best = score(); store.set('ll.best', best); } }
function saveRun() { store.set('ll.run', { level: run.level, score: run.banked, start: run.start }); }
function levelBanner() {
  banner = { big: 'LEVEL ' + run.level, small: run.level === 4 ? 'Gate colours no longer help you' : '', color: '#fff', t: 1.6 };
  const b = $('lvlBadge'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); // restart the pop animation
}
function startLevel() { // new run, continue, or retry after a hit
  s = G.newWorld(run.level, run.start); targetX = 0; hitTimer = 0;
  levelBanner();
}
function setMode(m) {
  mode = m;
  $('menu').classList.toggle('show', m === 'menu');
  $('pause').classList.toggle('show', m === 'paused');
  $('hud').hidden = m === 'menu';
  if (m === 'menu') refreshMenu();
}
function refreshMenu() {
  const saved = store.get('ll.run', null);
  $('menuBest').textContent = 'Best: ' + best;
  $('continueBtn').hidden = !saved;
  if (saved) $('continueBtn').textContent = `Continue — level ${saved.level}`;
  $('exitBtn').hidden = !window.Android;
}
function beginRun(level, banked, start) { run = G.newRun(level, banked, start); saveRun(); startLevel(); setMode('play'); }

$('newBtn').onclick = () => beginRun(1, 0);
$('continueBtn').onclick = () => { const r = store.get('ll.run', null); r ? beginRun(r.level, r.score, r.start) : beginRun(1, 0); };
$('resetBtn').onclick = () => { if (confirm('Reset the best score to 0?')) { best = 0; store.set('ll.best', 0); refreshMenu(); } };
$('exitBtn').onclick = () => window.Android && window.Android.exit();
$('pauseBtn').onclick = () => pauseGame();
$('resumeBtn').onclick = () => setMode('play');
$('restartBtn').onclick = () => { commitTop(); beginRun(1, 0); };
$('quitBtn').onclick = () => { commitTop(); saveRun(); setMode('menu'); };

function pauseGame() {
  if (mode !== 'play' && mode !== 'hit') return;
  commitTop();
  $('pauseInfo').textContent = `Level ${run.level} · Score ${score()} · Best ${best}`;
  setMode('paused');
}
window.pauseGame = pauseGame;
window.onBack = () => { // Android back button
  if (mode === 'play' || mode === 'hit') pauseGame();
  else if (mode === 'paused') setMode('play');
  else if (window.Android) window.Android.exit();
};
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ---------- input: drag anywhere; arrow keys for desktop ----------
let drag = null;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, t: targetX }; });
addEventListener('pointermove', e => { if (drag) targetX = Math.max(-1, Math.min(1, drag.t + (e.clientX - drag.x) / (W * 0.35))); });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointercancel', () => { drag = null; });
addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') targetX = Math.max(-1, targetX - 0.5);
  if (e.key === 'ArrowRight') targetX = Math.min(1, targetX + 0.5);
  if (e.key === 'Escape') window.onBack();
});

// ---------- loop: fixed 60 Hz logic, render every frame ----------
const DT = 1 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.1); last = now;
  time += elapsed;
  if (mode === 'play') {
    acc += elapsed;
    while (acc >= DT && mode === 'play') {
      acc -= DT;
      const res = G.step(s, DT, targetX);
      if (res === 'hit') {
        mode = 'hit'; hitTimer = 1.2; flash = 1;
        banner = { big: 'HIT!', small: 'Level ' + run.level + ' restarts', color: '#ff8a8a', t: 1.2 };
      } else if (res === 'level') { // only the level number changes: the march goes on untouched
        G.onLevel(run, s); saveRun(); commitTop(); levelBanner();
      }
    }
  } else acc = 0;
  if (mode === 'hit') { hitTimer -= elapsed; if (hitTimer <= 0) { startLevel(); mode = 'play'; } }
  if (banner && (banner.t -= elapsed) <= 0) banner = null;
  flash = Math.max(0, flash - elapsed * 1.5);
  if (!s) s = G.newWorld(1); // menu backdrop
  draw();
  if (run) {
    $('lvl').textContent = run.level;
    $('score').textContent = score() + ' · Best ' + Math.max(best, score());
    $('bar').firstElementChild.style.width = (100 * (s.z / G.LEVEL_LENGTH - (s.L - 1))) + '%';
  }
  requestAnimationFrame(frame);
}
refreshMenu();
requestAnimationFrame(frame);

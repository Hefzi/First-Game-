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
let run = null, s = null, mode = 'menu', targetX = 0, banner = null, flash = 0, hitTimer = 0, time = 0, shake = 0;

// ---------- camera: close and steep, the legion near the bottom (world z = distance ahead of the legion) ----------
const D = 26, RW = 8, LANE_L = -4.6, LANE_R = 4.6, DIVIDER_FROM = 12, VIEW = 105;
let W, H, F, HOR, CAMH;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  F = 0.98 * Math.min(W, H * 0.58) * D / (2 * RW);
  HOR = H * 0.04; CAMH = (H * 0.8 - HOR) * D / F; // legion stands at 80% of screen height
}
addEventListener('resize', resize); resize();
function proj(X, dz, y = 0) {
  const d = dz + D;
  if (d < 1) return null;
  return { x: W / 2 + F * X / d, y: HOR + F * (CAMH - y) / d, k: F / d };
}

// ---------- sprites: drawn once, stamped many times (fast enough for a carpet of hundreds) ----------
function sprite(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  return c;
}
const soldier = (body, dark, plume) => sprite(32, 44, (g, w) => {
  g.fillStyle = '#0005'; g.beginPath(); g.ellipse(16, 41, 11, 3, 0, 0, 7); g.fill();     // shadow
  g.fillStyle = body; g.beginPath(); g.ellipse(16, 28, 10, 12, 0, 0, 7); g.fill();       // body
  g.fillStyle = dark; g.fillRect(6, 30, 20, 4);                                          // belt
  g.fillStyle = body; g.beginPath(); g.arc(16, 13, 8, 0, 7); g.fill();                   // helmet
  g.fillStyle = dark; g.fillRect(9, 13, 14, 3);                                          // visor
  g.fillStyle = plume; g.beginPath(); g.ellipse(16, 4, 3, 5, 0, 0, 7); g.fill();         // plume
  g.fillStyle = '#ffffff55'; g.beginPath(); g.ellipse(12, 22, 3, 5, -0.3, 0, 7); g.fill(); // shine
});
const BLUE = soldier('#3b82f6', '#1e3a8a', '#93c5fd'), RED = soldier('#dc2626', '#7f1d1d', '#fca5a5');
function stamp(img, X, dz, size) {
  const q = proj(X, dz);
  if (!q) return;
  const h = size * q.k, w = h * img.width / img.height;
  ctx.drawImage(img, q.x - w / 2, q.y - h, w, h);
}

// ---------- drawing ----------
const OPS = { '+': '+', '-': '−', x: '×', '/': '÷' };
// the block's centre follows the drag but stays inside the road walls (pickup zones use s.x, not this)
const crowdX = () => { const r = 0.36 * Math.sqrt(Math.min(Math.floor(s.n), 160)); return s.x * Math.max(0, RW - 0.8 - r); };
function quad(a, b, c, d, fill) {
  if (!a || !b || !c || !d) return;
  ctx.fillStyle = fill; ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.fill();
}
const flat = (x0, x1, z0, z1, fill, y = 0) => quad(proj(x0, z0, y), proj(x1, z0, y), proj(x1, z1, y), proj(x0, z1, y), fill);
function box(x0, x1, z, depth, height, front, top) { // an upright block facing the legion
  flat(x0, x1, z, z + depth, top, height);
  quad(proj(x0, z), proj(x1, z), proj(x1, z, height), proj(x0, z, height), front);
}
function text(str, x, y, size, color = '#fff') {
  ctx.font = `900 ${Math.max(10, size)}px system-ui,sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2.5, size / 6); ctx.strokeStyle = '#000b'; ctx.strokeText(str, x, y);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function drawRoad() {
  ctx.fillStyle = '#07090f'; ctx.fillRect(0, 0, W, H);
  flat(-RW - 1.4, RW + 1.4, -12, VIEW, '#4a5068', -0.01);
  for (let z = -12; z < VIEW; z += 4) { // stone paving, two shades
    const odd = Math.floor(z / 4) % 2;
    flat(-RW, RW, z, z + 4, odd ? '#cfd3dc' : '#c3c8d3');
  }
  for (const X of [-RW - 0.7, RW + 0.7]) box(X - 0.7, X + 0.7, -12, VIEW + 12, 1.6, '#3d4358', '#6b7290'); // outer walls
  for (const X of [LANE_L, LANE_R]) box(X - 0.25, X + 0.25, DIVIDER_FROM, VIEW - DIVIDER_FROM, 1.1, '#5b6178', '#8a90aa');
}

function drawCarpet(c) {
  const rows = Math.min(Math.ceil(c.count / c.rho / 0.8), 140), cols = Math.max(4, Math.min(11, Math.round(c.rho * 1.6)));
  for (let i = rows - 1; i >= 0; i--) {
    const z = c.z + i * 0.8;
    if (z > VIEW || z < -2) continue;
    const off = (i % 2) * 0.5;
    for (let j = 0; j < cols; j++) {
      const u = (j + off + 0.5) / (cols + 0.5), jit = ((i * 7 + j * 13) % 10) / 25;
      stamp(RED, LANE_L + 0.6 + u * (LANE_R - LANE_L - 1.2) + jit, z + jit, 1.5);
    }
  }
}

function drawBoss(b) {
  const bob = Math.sin(time * 6) * 0.15, c = proj(0, b.z, 2.6 + bob);
  if (!c) return;
  const r = 2.3 * c.k;
  ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(c.x, c.y + r * 1.25, r * 1.2, r * 0.3, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#7f1d1d'; ctx.fillRect(c.x - r * 0.7, c.y + r * 0.3, r * 0.5, r * 0.9); ctx.fillRect(c.x + r * 0.2, c.y + r * 0.3, r * 0.5, r * 0.9); // legs
  ctx.fillStyle = '#b91c1c'; ctx.beginPath(); ctx.ellipse(c.x, c.y, r, r * 0.95, 0, 0, 7); ctx.fill();                                           // body
  ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.ellipse(c.x, c.y + r * 0.1, r * 0.55, r * 0.45, 0, 0, 7); ctx.fill();                         // armour plate
  ctx.fillStyle = '#d1d5db'; ctx.beginPath(); // horns
  ctx.moveTo(c.x - r * 0.6, c.y - r * 0.7); ctx.lineTo(c.x - r * 1.1, c.y - r * 1.5); ctx.lineTo(c.x - r * 0.2, c.y - r * 0.9);
  ctx.moveTo(c.x + r * 0.6, c.y - r * 0.7); ctx.lineTo(c.x + r * 1.1, c.y - r * 1.5); ctx.lineTo(c.x + r * 0.2, c.y - r * 0.9); ctx.fill();
  ctx.fillStyle = '#fde047'; ctx.fillRect(c.x - r * 0.4, c.y - r * 0.5, r * 0.22, r * 0.14); ctx.fillRect(c.x + r * 0.18, c.y - r * 0.5, r * 0.22, r * 0.14); // eyes
  const bw = r * 2.2, by = c.y - r * 1.85; // HP bar with the number, as in the reference
  ctx.fillStyle = '#000a'; ctx.fillRect(c.x - bw / 2, by, bw, r * 0.26);
  ctx.fillStyle = '#ef4444'; ctx.fillRect(c.x - bw / 2, by, bw * Math.max(0, b.hp) / b.max, r * 0.26);
  text(String(Math.ceil(b.hp)), c.x, by - r * 0.3, Math.max(14, 0.9 * c.k));
}

function drawTile(t, x0, x1, color, ink) {
  box(x0, x1, t.z, 1.6, 1.7, color, '#ffffff55');
  const c = proj((x0 + x1) / 2, t.z, 0.85);
  if (c) text(OPS[t.op || '+'] + t.v, c.x, c.y, 1.15 * c.k, ink);
}
function drawLanes() {
  for (const p of s.plus) if (p.z < VIEW) drawTile(p, -RW + 0.35, LANE_L - 0.4, '#2563eb', '#fff');
  for (let i = s.tiles.length - 1; i >= 0; i--) {
    const t = s.tiles[i];
    if (t.z > VIEW) continue;
    const bad = t.op === '-' || t.op === '/';
    drawTile(t, LANE_R + 0.4, RW - 0.35, t.L < 4 && bad ? '#f87171' : '#facc15', '#2b1d00'); // colour hints end at level 4
  }
  const w = s.wall;
  if (w.hp > 0) {
    box(LANE_R + 0.3, RW - 0.25, w.z, 1.8, 3.8, '#6b7184', '#9aa0b4');
    const c = proj((LANE_R + RW) / 2, w.z, 1.9);
    if (c) text(String(Math.ceil(w.hp)), c.x, c.y, 1.6 * c.k);
  }
}

// ---------- effects ----------
const fx = [], pops = [];
const puff = (X, z, y, color, n, speed = 4, life = 0.4) => {
  for (let i = 0; i < n; i++) fx.push({ X, z, y, vx: (Math.random() - 0.5) * speed, vz: (Math.random() - 0.3) * speed, vy: Math.random() * speed, t: life, life, color });
};
function onEvents(evs) {
  for (const e of evs) {
    if (e.type === 'kill' && Math.random() < Math.min(1, e.k * 3)) puff(LANE_L + 1 + Math.random() * (LANE_R - LANE_L - 2), e.z, 0.8, '#ffffff', 2);
    else if (e.type === 'melee' && Math.random() < 0.6) puff(crowdX() + (Math.random() - 0.5) * 4, 1.2, 0.8, '#fde68a', 2, 5);
    else if (e.type === 'leak' && Math.random() < 0.5) puff(crowdX() + (Math.random() - 0.5) * 3, 0.3, 0.5, '#ef4444', 2, 3);
    else if (e.type === 'plus') pops.push({ str: '+' + e.v, X: crowdX() - 1, t: 0.8, color: '#93c5fd' });
    else if (e.type === 'tile') pops.push({ str: OPS[e.t.op] + e.t.v, X: crowdX() + 1, t: 1.1, color: e.t.op === '-' || e.t.op === '/' ? '#fca5a5' : '#fde047', big: true });
    else if (e.type === 'wall') { puff((LANE_R + RW) / 2, s.wall.z, 1.5, '#9aa0b4', 24, 8, 0.7); shake = 0.25; }
    else if (e.type === 'boss') { puff(0, 4, 2.5, '#fb923c', 40, 10, 0.8); shake = 0.35; }
  }
}
function drawFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i];
    p.t -= dt; p.X += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.vy -= 12 * dt;
    if (p.t <= 0) { fx.splice(i, 1); continue; }
    const q = proj(p.X, p.z, Math.max(0, p.y));
    if (!q) continue;
    ctx.globalAlpha = p.t / p.life; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.5, 0.28 * q.k), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t -= dt;
    if (p.t <= 0) { pops.splice(i, 1); continue; }
    const q = proj(p.X, 0, 4 + (1 - p.t) * 4);
    if (!q) continue;
    ctx.globalAlpha = Math.min(1, p.t * 2);
    text(p.str, q.x, q.y, (p.big ? 1.3 : 0.9) * q.k, p.color);
  }
  ctx.globalAlpha = 1;
}

function drawShots() {
  const t = s.target;
  if (!t || s.n < 1) return;
  const aim = () => (t.type === 'wall' ? proj((LANE_R + RW) / 2, t.z, 1.5 + Math.random())
    : t.type === 'boss' ? proj((Math.random() - 0.5) * 2, t.z, 2.6) : proj(LANE_L + 1 + Math.random() * (LANE_R - LANE_L - 2), t.z, 0.8));
  ctx.lineWidth = 2; ctx.strokeStyle = '#fef9c3';
  for (let i = 0; i < Math.min(Math.ceil(s.n), 28); i++) {
    const p = FORM[i], from = proj(crowdX() + p.ox, p.oz, 1.4), to = aim();
    if (!from || !to) continue;
    const u = (time * 3 + i * 0.37) % 1, v = Math.min(1, u + 0.12);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u);
    ctx.lineTo(from.x + (to.x - from.x) * v, from.y + (to.y - from.y) * v);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Legion formation: a tight sunflower, back rows first so near soldiers draw on top.
const FORM = Array.from({ length: 160 }, (_, i) => {
  const r = 0.36 * Math.sqrt(i), a = i * 2.39996;
  return { ox: r * Math.cos(a), oz: r * Math.sin(a) * 0.6 };
});
const FORM_BACK_FIRST = FORM.map((p, i) => ({ ...p, i })).sort((a, b) => b.oz - a.oz);

function draw(dt) {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 10 * shake, (Math.random() - 0.5) * 10 * shake);
  drawRoad();
  drawLanes();
  for (let i = s.horde.length - 1; i >= 0; i--) { // far to near
    const it = s.horde[i];
    if (it.z > VIEW) continue;
    if (it.type === 'boss') drawBoss(it); else drawCarpet(it);
  }
  drawShots();
  const n = Math.min(Math.floor(s.n), FORM.length);
  for (const p of FORM_BACK_FIRST) if (p.i < n) stamp(BLUE, crowdX() + p.ox, p.oz - 0.4, 1.35);
  const c = proj(crowdX(), 0, 3.4), full = s.n >= G.cap(s.L);
  if (c && s.n >= 1) text(full ? Math.floor(s.n) + ' MAX' : String(Math.floor(s.n)), c.x, c.y - 0.3 * Math.sqrt(n) * c.k, 1.1 * c.k, full ? '#facc15' : '#fff');
  drawFx(dt);
  ctx.restore();
  if (flash > 0) { ctx.fillStyle = `rgba(224,65,60,${flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (banner && (mode === 'play' || mode === 'hit')) {
    text(banner.big, W / 2, H * 0.14, Math.min(W / 9, 48), banner.color);
    if (banner.small) text(banner.small, W / 2, H * 0.14 + 42, 18);
  }
}

// progress through the current wave: share of its enemies and boss HP already gone
function waveProgress() {
  const w = s.waves[s.L];
  if (!w) return 0;
  const left = w.horde.reduce((a, it) => a + Math.max(0, it.type === 'boss' ? it.hp : it.count), 0);
  const all = w.horde.reduce((a, it) => a + it.max, 0);
  return 1 - left / all;
}

// ---------- run / score / menus ----------
function score() { return G.liveScore(run, s); }
function commitTop() { if (run && s && score() > best) { best = score(); store.set('ll.best', best); } }
function saveRun() { store.set('ll.run', { level: run.level, score: run.banked, start: run.start }); }
function levelBanner() {
  banner = { big: 'LEVEL ' + run.level, small: run.level === 4 ? 'Gate colours no longer help you' : '', color: '#fff', t: 1.6 };
  const b = $('lvlBadge'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); // restart the pop animation
}
function startLevel(retry) { // new run, continue, or retry after a hit (a retry never starts below the floor)
  s = G.newWorld(run.level, retry || run.level > 1 ? Math.max(run.start, G.floorCrowd(run.level)) : run.start);
  targetX = 0; hitTimer = 0; fx.length = 0; pops.length = 0;
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
      onEvents(s.events);
      if (res === 'hit') {
        mode = 'hit'; hitTimer = 1.2; flash = 1;
        banner = { big: 'HIT!', small: 'Level ' + run.level + ' restarts', color: '#ff8a8a', t: 1.2 };
      } else if (res === 'level') { // only the level number changes: the next wave is already coming
        G.onLevel(run, s); saveRun(); commitTop(); levelBanner();
      }
    }
  } else acc = 0;
  if (mode === 'hit') { hitTimer -= elapsed; if (hitTimer <= 0) { startLevel(true); mode = 'play'; } }
  if (banner && (banner.t -= elapsed) <= 0) banner = null;
  flash = Math.max(0, flash - elapsed * 1.5);
  shake = Math.max(0, shake - elapsed);
  if (!s) s = G.newWorld(1); // menu backdrop
  draw(elapsed);
  if (run) {
    $('lvl').textContent = run.level;
    $('score').textContent = score() + ' · Best ' + Math.max(best, score());
    $('bar').firstElementChild.style.width = (100 * waveProgress()) + '%';
  }
  requestAnimationFrame(frame);
}
refreshMenu();
requestAnimationFrame(frame);

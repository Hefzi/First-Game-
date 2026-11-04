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
const D = 45, RW = 8; // far camera = gentle perspective, so hostiles in range stay readable
let W, H, F, HOR, CAMH;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  F = 0.45 * Math.min(W, H * 0.6) * D / RW;
  HOR = H * 0.06; CAMH = (H * 0.8 - HOR) * D / F; // crowd sits at 80% of screen height
}
addEventListener('resize', resize); resize();
function proj(X, dz, y = 0) {
  const d = dz + D;
  if (d < 1) return null;
  return { x: W / 2 + F * X / d, y: HOR + F * (CAMH - y) / d, k: F / d };
}

// Sunflower formation offsets, back rows first so near soldiers draw on top.
const FORM = Array.from({ length: 140 }, (_, i) => {
  const r = 0.42 * Math.sqrt(i), a = i * 2.39996;
  return { ox: r * Math.cos(a), oz: r * Math.sin(a) * 0.7 };
});
const formSorted = FORM.map((p, i) => ({ ...p, i })).sort((a, b) => b.oz - a.oz);

// ---------- drawing ----------
const OPS = { '+': '+', '-': '−', x: '×', '/': '÷' };
const crowdX = () => s.x * (RW - 1.6);

function quad(a, b, c, d, fill) {
  if (!a || !b || !c || !d) return;
  ctx.fillStyle = fill; ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.fill();
}
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
  const near = -14, far = 260; // anything nearer is below the screen edge
  quad(proj(-RW - 1, near, -2), proj(RW + 1, near, -2), proj(RW + 1, far, -2), proj(-RW - 1, far, -2), '#2a3150');
  const tile = 8, start = Math.floor((s.z + near) / tile) * tile;
  for (let wz = start; wz < s.z + far; wz += tile) {
    const dz0 = Math.max(wz - s.z, near), dz1 = wz + tile - s.z;
    quad(proj(-RW, dz0), proj(RW, dz0), proj(RW, dz1), proj(-RW, dz1), (wz / tile) % 2 ? '#c9ccd6' : '#b9bdc9');
  }
  for (const side of [-1, 1]) { // flat kerbs along both edges
    quad(proj(side * RW, near), proj(side * (RW + 0.8), near), proj(side * (RW + 0.8), far), proj(side * RW, far), '#6b7394');
  }
  const fz = G.LEVEL_LENGTH - s.z; // level line: the march runs straight through it
  for (let i = 0; i < 8; i++) {
    const x0 = -RW + i * RW / 4;
    quad(proj(x0, fz), proj(x0 + RW / 4, fz), proj(x0 + RW / 4, fz + 2), proj(x0, fz + 2), i % 2 ? '#111' : '#fff');
  }
  const lbl = proj(0, fz + 5, 0.1);
  if (lbl && fz < far) text('LEVEL ' + (s.level.L + 1), lbl.x, lbl.y, 2.2 * lbl.k, '#ffe066');
  for (const [f, off] of layers().flatMap(([lv, o]) => lv.forks.map(f => [f, o]))) {
    const a = f.z0 + off - s.z, b = f.z1 + off - s.z;
    if (b < -D + 2 || a > far) continue;
    const a2 = Math.max(a, near);
    quad(proj(-0.25, a2, 1.6), proj(0.25, a2, 1.6), proj(0.25, b, 1.6), proj(-0.25, b, 1.6), '#7c85a8');
    quad(proj(-0.25, a2), proj(-0.25, a2, 1.6), proj(-0.25, b, 1.6), proj(-0.25, b), '#4b5478');
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

function drawGates(e, dz) {
  const lv = s.level;
  [[e.left, -RW + 0.3, -0.35], [e.right, 0.35, RW - 0.3]].forEach(([g, x0, x1]) => {
    const good = g.op === '+' || g.op === 'x';
    const col = lv.hints ? (good ? '#2f7cf6cc' : '#e0413ccc') : '#8b5cf6cc';
    quad(proj(x0, dz), proj(x1, dz), proj(x1, dz, 3.4), proj(x0, dz, 3.4), col);
    const c = proj((x0 + x1) / 2, dz, 1.7);
    if (c) text(OPS[g.op] + g.v, c.x, c.y, 1.7 * c.k);
  });
}

function drawHostile(e, dz) {
  if (e.type === 'squad') {
    drawSoldiers(0, dz, Math.ceil(e.hp), '#dc2626', 1.7);
    const c = proj(0, dz - 2, 2.6);
    if (c) text(String(Math.ceil(e.hp)), c.x, c.y, 1.4 * c.k, '#ffd2d2');
  } else if (e.type === 'wall') {
    quad(proj(-RW, dz + 1, 3.2), proj(RW, dz + 1, 3.2), proj(RW, dz, 3.2), proj(-RW, dz, 3.2), '#a8743f');
    quad(proj(-RW, dz), proj(RW, dz), proj(RW, dz, 3.2), proj(-RW, dz, 3.2), '#7a4f26');
    const c = proj(0, dz, 1.6);
    if (c) text(String(Math.ceil(e.hp)), c.x, c.y, 2 * c.k);
  } else {
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
}

function drawShots() {
  const t = s.target;
  if (!t || s.n <= 0) return;
  const to = proj(0, t.z - s.z, t.type === 'squad' ? 0.6 : 1.6);
  if (!to) return;
  ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2;
  for (let i = 0; i < Math.min(s.n, 12); i++) {
    const p = FORM[i], from = proj(crowdX() + p.ox, p.oz, 0.8);
    if (!from) continue;
    const u = (time * 2.5 + i * 0.37) % 1, v = Math.min(1, u + 0.08);
    ctx.beginPath();
    ctx.moveTo(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u);
    ctx.lineTo(from.x + (to.x - from.x) * v, from.y + (to.y - from.y) * v);
    ctx.stroke();
  }
}

// Current level, plus the next one (offset by a level length) once it exists, so the route ahead never pops in.
const layers = () => (s.next ? [[s.level, 0], [s.next, G.LEVEL_LENGTH]] : [[s.level, 0]]);

function draw() {
  drawRoad();
  const list = [];
  for (const [lv, off] of layers()) {
    const own = lv === s.level; // passed gates and finished fights of the current level are gone
    for (const [arr, from] of [[lv.gates, own ? s.gi : 0], [lv.hostiles, own ? s.hi : 0]]) {
      for (let i = from; i < arr.length; i++) {
        const e = arr[i], dz = e.z + off - s.z;
        if (dz > 260) break;
        list.push([dz, e]);
      }
    }
  }
  list.sort((a, b) => b[0] - a[0]).forEach(([dz, e]) => (e.type === 'gates' ? drawGates(e, dz) : drawHostile(e, dz)));
  drawShots();
  drawSoldiers(crowdX(), 0, s.n, '#3b82f6', 1);
  const c = proj(crowdX(), 0, 3.2);
  if (c && s.n > 0) text(String(s.n), c.x, c.y - 0.5 * Math.sqrt(Math.min(s.n, 140)) * c.k, 1.3 * c.k);
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
  s = G.newLevel(run.level, run.start); targetX = 0; hitTimer = 0;
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
      } else if (res === 'clear') {
        // no stop at the level line: same crowd, same lane, the march goes on
        G.onClear(run, s); s = G.continueLevel(s); saveRun(); commitTop(); levelBanner();
      }
    }
  } else acc = 0;
  if (mode === 'hit') { hitTimer -= elapsed; if (hitTimer <= 0) { startLevel(); mode = 'play'; } }
  if (banner && (banner.t -= elapsed) <= 0) banner = null;
  flash = Math.max(0, flash - elapsed * 1.5);
  if (!s) s = G.newLevel(1); // menu backdrop
  draw();
  if (run) {
    $('lvl').textContent = run.level;
    $('score').textContent = score() + ' · Best ' + Math.max(best, score());
    $('bar').firstElementChild.style.width = (100 * Math.min(s.z, G.LEVEL_LENGTH) / G.LEVEL_LENGTH) + '%';
  }
  requestAnimationFrame(frame);
}
refreshMenu();
requestAnimationFrame(frame);

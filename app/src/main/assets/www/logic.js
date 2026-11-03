'use strict';
// Pure game rules: level generation, simulation step, scoring. No DOM, so Node tests run it as-is.
(function () {
  const LEVEL_LENGTH = 600;   // a level is this fixed distance (world units)
  const RANGE = 45;           // crowd fires at the nearest hostile within this distance
  const FIRE = 1.2;           // damage per soldier per second
  const START_COUNT = 3;
  const ROW_GAP = 55, FORK_ROW_GAP = 30, HOSTILE_GAP = 70, GUARD_Z = LEVEL_LENGTH - 40;

  function rng(seed) { // mulberry32: same level number => same route every retry
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));

  // Difficulty table (see README).
  const speedFor = L => Math.min(14 + 0.6 * (L - 1), 30);
  const enemySpeedFor = L => Math.min(4 + 0.3 * (L - 1), 12);
  const bossSpeedFor = L => Math.min(2 + 0.1 * L, 5);
  const squadTough = L => Math.min(0.15 + 0.02 * (L - 1), 0.6);  // share of your best crowd a squad kills
  // Share of all possible choice sequences that survive the level guardian. Every 5th level+1 is a breather.
  const passShare = L => Math.max(0.6 * Math.pow(0.9, L - 1), 0.05) * (L > 1 && L % 5 === 1 ? 1.5 : 1);
  const forkRows = L => (L < 3 ? 0 : Math.min(2 + Math.floor((L - 3) / 5), 4));
  const squadChance = L => Math.min(0.2 + 0.02 * L, 0.4);
  const forkChance = L => (L < 3 ? 0 : Math.min(0.1 + 0.04 * L, 0.5));
  const trapChance = L => (L < 5 ? 0 : 0.6); // fork whose first gate lies about the better path

  function applyOp(n, g) {
    switch (g.op) {
      case '+': return n + g.v;
      case '-': return n - g.v;
      case 'x': return n * g.v;
      default: return Math.floor(n / g.v);
    }
  }
  // -Infinity when the crowd is wiped out part-way: the sim treats that as a hit.
  function runPath(n, gates) {
    for (const g of gates) { n = applyOp(n, g); if (n <= 0) return -Infinity; }
    return n;
  }

  function randGate(r, L) {
    const ops = L === 1 ? ['+', 'x'] : L < 4 ? ['+', 'x', '-'] : ['+', 'x', '-', '/'];
    const op = ops[int(r, 0, ops.length - 1)];
    const v = op === '+' ? int(r, 2, Math.min(6 + 2 * L, 40))
      : op === '-' ? int(r, 2, Math.min(4 + 2 * L, 40))
      : op === 'x' ? int(r, 2, L < 6 ? 3 : 4) : int(r, 2, 3);
    return { op, v };
  }

  function makeLevel(L) {
    const r = rng(L * 7919 + 17);
    const vp = speedFor(L), ve = enemySpeedFor(L), vb = bossSpeedFor(L);
    const events = [], forks = [];
    // paths: crowd size for every surviving choice sequence; total counts dead ones too.
    let z = 50, n = START_COUNT, paths = [START_COUNT], total = 1, first = true;

    function pickPaths(k, wantTrap) {
      for (let tries = 0; tries < 60; tries++) {
        const left = [], right = [];
        for (let i = 0; i < k; i++) { left.push(randGate(r, L)); right.push(randGate(r, L)); }
        const a = runPath(n, left), b = runPath(n, right);
        if (Math.max(a, b) < 1 || a === b) continue;
        if (wantTrap && tries < 40 && (applyOp(n, left[0]) > applyOp(n, right[0])) === (a > b)) continue;
        return { left, right, a, b };
      }
      const safe = Array.from({ length: k }, () => ({ op: '+', v: 2 }));
      return { left: safe, right: safe.map(() => ({ op: '-', v: 1 })), a: n + 2 * k, b: runPath(n, safe.map(() => ({ op: '-', v: 1 }))) };
    }

    for (;;) {
      const k = forkRows(L), p = r();
      const type = first ? 'row' : p < squadChance(L) ? 'squad' : k && p < squadChance(L) + forkChance(L) ? 'fork' : 'row';
      const len = type === 'row' ? ROW_GAP : type === 'squad' ? HOSTILE_GAP : (k - 1) * FORK_ROW_GAP + ROW_GAP;
      if (z + len > GUARD_Z) break; // keeps every engagement window clear of the guardian
      if (type === 'squad') {
        const dmg = n * FIRE * (RANGE - 1) / (vp + ve);
        const M = Math.max(1, Math.floor(dmg + Math.min(squadTough(L) * n, n - 1)));
        paths = paths.map(m => m - Math.max(0, Math.ceil(M - m * FIRE * (RANGE - 1) / (vp + ve) - 1e-9))).filter(m => m > 0);
        events.push({ type: 'squad', z, hp: M, max: M, speed: ve });
      } else {
        const rows = type === 'row' ? 1 : k;
        const { left, right, a, b } = pickPaths(rows, type === 'fork' && r() < trapChance(L));
        const best = a > b ? 'L' : 'R';
        const fork = type === 'fork' ? forks.push({ z0: z - 12, z1: z + (rows - 1) * FORK_ROW_GAP + 4 }) - 1 : -1;
        for (let i = 0; i < rows; i++) events.push({ type: 'gates', z: z + i * FORK_ROW_GAP, left: left[i], right: right[i], fork, best });
        paths = paths.flatMap(m => [runPath(m, left), runPath(m, right)]).filter(m => m > 0);
        total *= 2;
      }
      n = Math.max(...paths); // the best path always survives, so paths is never empty
      z += len; first = false;
    }
    const boss = L % 3 === 0;
    paths.sort((p, q) => q - p);
    const need = paths[Math.min(paths.length, Math.max(1, Math.round(passShare(L) * total))) - 1];
    const hp = Math.max(1, Math.ceil(need * FIRE * (RANGE - 1) / (vp + (boss ? vb : 0))) - 1);
    events.push({ type: boss ? 'boss' : 'wall', z: GUARD_Z, hp, max: hp, speed: boss ? vb : 0 });
    return { L, vp, events, forks, bestEnd: n, hints: L < 4 };
  }

  const newLevel = L => ({ level: makeLevel(L), z: 0, x: 0, n: START_COUNT, i: 0, lock: 0, target: null });

  // Advance one fixed step. Returns 'hit' (level must restart), 'clear', or null.
  function step(s, dt, targetX) {
    const lv = s.level;
    const fork = lv.forks.find(f => s.z >= f.z0 && s.z <= f.z1);
    if (!fork) s.lock = 0; else if (!s.lock) s.lock = s.x < 0 ? -1 : 1;
    const lo = s.lock > 0 ? 0.2 : -1, hi = s.lock < 0 ? -0.2 : 1;
    const tx = Math.max(lo, Math.min(hi, targetX));
    s.x += Math.max(-6 * dt, Math.min(6 * dt, tx - s.x));
    s.x = Math.max(lo, Math.min(hi, s.x));
    s.z += lv.vp * dt;
    s.target = null;

    const e = lv.events[s.i];
    if (e && e.type === 'gates') {
      if (s.z >= e.z) {
        s.n = applyOp(s.n, s.x < 0 ? e.left : e.right);
        s.i++;
        if (s.n <= 0) { s.n = 0; return 'hit'; }
      }
    } else if (e && e.z - s.z <= RANGE) {
      e.z -= e.speed * dt;
      e.hp -= s.n * FIRE * dt;
      s.target = e;
      if (e.hp <= 0) { e.hp = 0; s.i++; }
      else if (e.z - s.z <= 0) {
        s.i++;
        if (e.type !== 'squad') return 'hit';
        s.n -= Math.ceil(e.hp - 1e-9); e.hp = 0;
        if (s.n <= 0) { s.n = 0; return 'hit'; }
      }
    }
    return s.z >= LEVEL_LENGTH ? 'clear' : null;
  }

  // Score = points banked at level start + distance in this level. A hit rolls back to the banked value.
  const newRun = (level = 1, score = 0) => ({ level, banked: score });
  const liveScore = (run, s) => run.banked + Math.floor(Math.min(s.z, LEVEL_LENGTH));
  function onClear(run, s) { run.banked += LEVEL_LENGTH + s.n; run.level++; }

  const API = { LEVEL_LENGTH, RANGE, FIRE, START_COUNT, makeLevel, newLevel, step, applyOp, runPath,
    newRun, liveScore, onClear, speedFor, squadTough, passShare, forkRows };
  if (typeof module !== 'undefined') module.exports = API; else window.Logic = API;
})();

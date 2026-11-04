'use strict';
// Pure game rules: world generation, simulation step, scoring. No DOM, so Node tests run it as-is.
//
// One continuous road. The horde comes in zones: when the crowd reaches a zone's hold point, the whole zone
// charges and the crowd stands its ground until every enemy is dead or has reached it. Between zones the crowd
// marches through gate choices. A bonus lane on the right holds +tiles; some sit behind a wall that the crowd
// only shoots while it hugs the lane (and then it does not shoot the horde). Levels are just distance markers.
(function () {
  const LEVEL_LENGTH = 400;   // a level is this fixed distance (world units); multiple of the 8-unit road tile
  const RANGE = 70;           // crowd fires at the nearest target within this distance
  const FIRE = 0.9;           // damage per soldier per second
  const START_COUNT = 3;
  const GAP = 20, PACK_GAP = 6, ROW_GAP = 18, LANE_HUG = 0.5;

  function rng(seed) { // mulberry32: same level => same route every retry
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));

  // Difficulty table (see README). L may be fractional, so speed ramps with distance, with no jump at a level change.
  const PACE = 1.3 * 1.15; // playtest feedback: +30%, then +15%
  const speedFor = L => PACE * Math.min(14 + 0.6 * (L - 1), 30);
  const enemySpeedFor = L => 0.8 * speedFor(L);
  const target = L => 6 + 4 * L;                                 // crowd size the horde is built for
  const pressure = L => Math.min(0.6 + 0.1 * (L - 1), 1.9);      // zone strength in target firepowers; late peaks bleed a full legion
  const cap = L => 2 * target(L);                                // the legion cannot grow past this
  const bite = L => Math.min(0.7, 0.3 + 0.03 * (L - 1));         // soldiers each enemy kills when it reaches you (<1 softens the cliff)
  // retry minimum: enough to clear the level with good choices, so a restart is never a dead end
  const floorCrowd = L => (L === 1 ? START_COUNT : Math.ceil(Math.min(0.5 + 0.9 * pressure(L), 1.9) * target(L)));
  const forkRows = L => (L < 3 ? 0 : L < 9 ? 2 : 3);
  const forkChance = L => (L < 3 ? 0 : Math.min(0.15 + 0.03 * L, 0.5));
  const segLen = L => 80 + 2 * Math.min(L, 20);                  // one zone + the march to the next one

  function applyOp(n, g) {
    switch (g.op) {
      case '+': return n + g.v;
      case '-': return n - g.v;
      case 'x': return n * g.v;
      default: return Math.floor(n / g.v);
    }
  }
  // Crowd after a row of gates, clipped at the cap after each gate (as in play); -Infinity if wiped out part-way.
  function runPath(n, gates, max = Infinity) {
    for (const g of gates) { n = Math.min(applyOp(n, g), max); if (n <= 0) return -Infinity; }
    return n;
  }

  function randGate(r, L) {
    const T = target(L);
    const ops = L === 1 ? ['+', 'x'] : L < 4 ? ['+', 'x', '-'] : ['+', 'x', '-', '/'];
    const op = ops[int(r, 0, ops.length - 1)];
    const v = op === '+' ? int(r, 2, Math.max(5, Math.ceil(0.6 * T)))
      : op === '-' ? int(r, 2, Math.max(3, Math.floor(Math.min(0.2 + 0.03 * L, 0.5) * T)))
      : op === 'x' ? int(r, 2, L < 6 ? 3 : 4) : int(r, 2, L < 8 ? 2 : 3); // a wrong ÷3 is brutal: from level 8
    return { op, v };
  }

  // Content of level L in world coordinates. Hold points sit at (k + 0.5) * SEG inside every level,
  // so the spacing between zones stays even across level changes.
  function build(L, attempt) {
    const r = rng(L * 7919 + 17 + attempt * 104729), base = (L - 1) * LEVEL_LENGTH, T = target(L);
    const K = Math.max(3, Math.round(LEVEL_LENGTH / segLen(L))), SEG = LEVEL_LENGTH / K;
    const ve = enemySpeedFor(L), p = pressure(L);
    const perPack = T * FIRE * PACK_GAP / ve; // enemies per pack that a crowd of T just keeps up with
    const out = { packs: [], gates: [], tiles: [], blockers: [], forks: [], zones: [] };
    let prevBlocker = true; // unknown for the previous level's last segment: keep its pocket clear
    for (let k = 0; k < K; k++) {
      const h = base + (k + 0.5) * SEG, prevH = h - SEG;

      // the choice on the march to this hold point (a single row, or a locked split path)
      const rows = forkRows(L) && r() < forkChance(L) ? forkRows(L) : 1;
      const z0 = Math.max(prevH + 15, 10);
      if (z0 + (rows - 1) * ROW_GAP <= h - 10) {
        const fork = rows > 1 ? { z0: z0 - 12, z1: z0 + (rows - 1) * ROW_GAP + 4 } : null;
        if (fork) out.forks.push(fork);
        let left, right;
        for (let tries = 0; tries < 40; tries++) {
          left = []; right = [];
          for (let i = 0; i < rows; i++) {
            left.push(randGate(r, L));
            let g;
            do g = randGate(r, L); while (g.op === left[i].op && g.v === left[i].v);
            right.push(g);
          }
          // fair choice: the better side keeps at least 60% of the crowd, for a small and for a full legion
          const fair = m => Math.max(runPath(m, left, cap(L)), runPath(m, right, cap(L))) >= 0.6 * m;
          if (fair(T) && fair(cap(L))) break;
        }
        for (let i = 0; i < rows; i++) out.gates.push({ type: 'gates', z: z0 + i * ROW_GAP, left: left[i], right: right[i], fork, L });
      }
      // free +1s in the bonus lane on the way
      for (let z = Math.max(prevH + (prevBlocker ? 64 : 8), 6); z < h - 4; z += 7) if (r() < 0.6) out.tiles.push({ z, v: 1, pocket: null });

      // the zone: L1 starts with a quiet march so a crowd of 3 can grow first
      if (L === 1 && k === 0) { prevBlocker = false; continue; }
      const zone = { h, woke: false };
      out.zones.push(zone);
      const count = Math.max(2, Math.round((SEG - GAP) / PACK_GAP));
      for (let i = 0; i < count; i++) {
        const wave = 0.6 + Math.sin(Math.PI * i / (count - 1)); // pressure peaks mid-zone at 1.6x
        const hp = Math.max(1, Math.round(perPack * p * wave));
        out.packs.push({ type: 'pack', z: h + RANGE + i * PACK_GAP, hp, max: hp, speed: ve, zone });
      }
      if (L % 3 === 0 && k === K - 2) { // a boss walks behind the pack every 3rd level
        const hp = Math.round(perPack * p * 5);
        out.packs.push({ type: 'boss', z: h + RANGE + count * PACK_GAP, hp, max: hp, speed: 0.5 * ve, zone });
      }
      // some bonus pockets sit behind a wall in the lane: break it (hug the lane) before the horde arrives, or lose them
      prevBlocker = k % 2 === 1;
      if (prevBlocker) {
        const hp = Math.round(T * FIRE * 0.5 * RANGE / ve); // half the time before the first enemies arrive, at crowd T
        const wall = { type: 'blocker', z: h + 30, hp, max: hp };
        out.blockers.push(wall);
        const each = Math.max(2, Math.round(0.12 * T));
        for (let i = 0; i < 4; i++) out.tiles.push({ z: h + 34 + i * 8, v: each, pocket: wall });
      }
    }
    return out;
  }

  const KINDS = ['packs', 'gates', 'tiles', 'blockers', 'forks', 'zones'];
  const blank = (L, n) => {
    const s = { L, z: (L - 1) * LEVEL_LENGTH, x: 0, n, start: n, kills: 0, lock: 0, target: null, holding: false };
    for (const k of KINDS) s[k] = [];
    return s;
  };
  const load = (s, lv) => { for (const k of KINDS) s[k].push(...lv[k]); };
  const clearBehind = s => { for (const e of [...s.gates, ...s.tiles]) if (e.z < s.z) e.done = true; };

  // What a careful player does: read each split path whole (with the cap) and break a lane wall only while
  // the horde is still far away. flip(decision) lets tests make deliberate mistakes.
  function bestSide(s, g) {
    const rows = g.fork ? s.gates.filter(h => h.fork === g.fork && !h.done) : [g];
    return runPath(s.n, rows.map(h => h.left), cap(s.L)) >= runPath(s.n, rows.map(h => h.right), cap(s.L)) ? 'L' : 'R';
  }
  function autoX(s, bonus = true, flip = () => false) {
    const g = s.gates.find(e => !e.done);
    if (g && g.z - s.z < 45) return (bestSide(s, g) === 'L') !== flip(g.fork || g) ? -0.6 : 0.4;
    const wall = bonus && s.blockers.find(b => b.hp > 0 && b.z >= s.z && b.z - s.z <= RANGE);
    const near = Math.min(Infinity, ...s.packs.filter(p => p.awake && p.hp > 0).map(p => p.z - s.z));
    return wall && near > 30 ? 0.8 : 0;
  }
  // A level must be winnable from the retry floor, or "the level restarts" could loop forever.
  function winnable(L, attempt) {
    const s = blank(L, floorCrowd(L));
    s.verify = true;
    load(s, build(L, attempt)); clearBehind(s);
    for (let t = 0; t < 12 * 300; t++) { // coarse 12 Hz: cheap enough to run at a level change; tests confirm at 60 Hz
      const res = step(s, 1 / 12, autoX(s));
      if (res) return res === 'level';
    }
    return false;
  }
  function makeLevel(L) {
    let attempt = 0;
    while (attempt < 7 && !winnable(L, attempt)) attempt++; // build is deterministic, so this is the same level
    return build(L, attempt);
  }
  // Start (or restart after a hit) at the beginning of level L, never below the level's floor crowd.
  function newWorld(L = 1, start = START_COUNT) {
    const s = blank(L, Math.min(Math.max(start, floorCrowd(L)), cap(L)));
    load(s, makeLevel(L)); load(s, makeLevel(L + 1));
    clearBehind(s);
    return s;
  }
  function prune(s) {
    s.packs = s.packs.filter(p => p.hp > 0);
    s.gates = s.gates.filter(g => !g.done);
    s.tiles = s.tiles.filter(t => !t.done);
    s.blockers = s.blockers.filter(b => b.z >= s.z - 20);
    s.forks = s.forks.filter(f => f.z1 >= s.z);
    s.zones = s.zones.filter(zn => !zn.woke);
  }
  // Advance one fixed step. Returns 'hit' (level restarts), 'level' (a level marker was passed), or null.
  function step(s, dt, targetX) {
    const fork = s.forks.find(f => s.z >= f.z0 && s.z <= f.z1);
    if (!fork) s.lock = 0; else if (!s.lock) s.lock = s.x < 0 ? -1 : 1;
    const lo = s.lock > 0 ? 0.2 : -1, hi = s.lock < 0 ? -0.2 : 1;
    s.x += Math.max(-6 * dt, Math.min(6 * dt, Math.max(lo, Math.min(hi, targetX)) - s.x));
    s.x = Math.max(lo, Math.min(hi, s.x));

    // stand and defend while any enemy is charging; march otherwise
    s.holding = s.packs.some(p => p.awake && p.hp > 0);
    if (!s.holding) s.z += speedFor(1 + s.z / LEVEL_LENGTH) * dt;
    for (const zn of s.zones) {
      if (zn.woke || s.z < zn.h) continue;
      zn.woke = true;
      for (const p of s.packs) if (p.zone === zn) p.awake = true;
    }

    let front = null;
    for (const p of s.packs) {
      if (!p.awake || p.hp <= 0) continue;
      p.z -= p.speed * dt;
      if (!front || p.z < front.z) front = p;
    }
    const wall = s.x >= LANE_HUG && s.blockers.find(b => b.hp > 0 && b.z >= s.z && b.z - s.z <= RANGE);
    s.target = wall || (front && front.z - s.z <= RANGE ? front : null);
    if (s.target) {
      s.target.hp = Math.max(0, s.target.hp - s.n * FIRE * dt);
      if (s.target.hp === 0 && s.target !== wall) s.kills += s.target.max;
    }
    for (const p of s.packs) {
      if (!p.awake || p.hp <= 0 || p.z > s.z) continue;
      s.n -= Math.ceil(bite(s.L) * p.hp - 1e-9); p.hp = 0;
      if (s.n <= 0) { s.n = 0; return 'hit'; }
    }

    for (const g of s.gates) {
      if (g.done) continue;
      if (s.z < g.z) continue;
      g.done = true;
      s.n = Math.min(applyOp(s.n, s.x < 0 ? g.left : g.right), cap(s.L));
      if (s.n <= 0) { s.n = 0; return 'hit'; }
    }
    for (const t of s.tiles) {
      if (t.done || s.z < t.z) continue;
      t.done = true;
      if (!t.pocket || t.pocket.hp <= 0) { s.n = Math.min(s.n + t.v, cap(s.L)); t.got = true; }
    }

    if (s.z >= s.L * LEVEL_LENGTH) { // a level is only a marker: nothing on the road changes
      if (s.verify) return 'level';
      s.L++; s.start = s.n;
      prune(s); s.pending = s.L + 1;
      return 'level';
    }
    // build the level after next 20% into this one: never at the level change itself, and beyond the 260-unit view
    if (s.pending && s.z >= (s.L - 0.8) * LEVEL_LENGTH) { load(s, makeLevel(s.pending)); s.pending = 0; }
    return null;
  }

  // Score = points banked when the level began + distance into this level + enemies shot in it.
  // A hit restarts the level, so the score rolls back to the banked value.
  const newRun = (level = 1, score = 0, start = START_COUNT) => ({ level, banked: score, start });
  const liveScore = (run, s) => run.banked + Math.floor(Math.max(0, s.z - (s.L - 1) * LEVEL_LENGTH)) + s.kills;
  function onLevel(run, s) { run.banked += LEVEL_LENGTH + s.kills; s.kills = 0; run.level = s.L; run.start = s.start; }

  const API = { LEVEL_LENGTH, RANGE, FIRE, START_COUNT, LANE_HUG, makeLevel, newWorld, step, applyOp, runPath, autoX,
    newRun, liveScore, onLevel, speedFor, target, cap, floorCrowd };
  if (typeof module !== 'undefined') module.exports = API; else window.Logic = API;
})();

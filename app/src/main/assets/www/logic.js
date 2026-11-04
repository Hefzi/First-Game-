'use strict';
// Pure game rules: level generation, simulation step, scoring. No DOM, so Node tests run it as-is.
(function () {
  const LEVEL_LENGTH = 800;   // a level is this fixed distance (world units); multiple of the 8-unit road tile
  const RANGE = 70;           // crowd fires at the nearest hostile within this distance
  const FIRE = 0.9;           // damage per soldier per second
  const START_COUNT = 3;
  const FORK_ROW_GAP = 14, GUARD_Z = LEVEL_LENGTH - 40; // rows in a locked split path need reading time only

  function rng(seed) { // mulberry32: same level + starting crowd => same route every retry
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));

  // Difficulty table (see README).
  const PACE = 1.3; // playtest feedback: whole game 30% faster
  const speedFor = L => PACE * Math.min(14 + 0.6 * (L - 1), 30);
  const enemySpeedFor = L => PACE * Math.min(4 + 0.3 * (L - 1), 12);
  const bossSpeedFor = L => PACE * Math.min(2 + 0.1 * L, 5);
  // Share of the stronger side's crowd that a squad kills (less for a small crowd).
  const minTough = L => Math.min(0.1 + 0.015 * (L - 1), 0.4);
  const crowdTarget = L => 12 + 4 * L;
  const squadShare = (L, n) => minTough(L) * Math.min(1, n / crowdTarget(L));
  // Stragglers get reinforced at the level line, so a level never starts below the starting crowd.
  const carry = n => Math.max(n, START_COUNT);
  // Share of all possible choice sequences that survive the level guardian. Every 5th level+1 is a breather.
  const passShare = L => Math.max(0.6 * Math.pow(0.9, L - 1), 0.05) * (L > 1 && L % 5 === 1 ? 1.5 : 1);
  const forkRows = L => (L < 3 ? 0 : Math.min(2 + Math.floor((L - 3) / 5), 4));
  const forkChance = L => (L < 3 ? 0 : Math.min(0.1 + 0.04 * L, 0.5));
  const trapChance = L => (L < 5 ? 0 : 0.6); // fork whose first gate lies about the better path
  // Soldiers each enemy kills when it reaches you. Below 1, a wrong gate costs only part of its full price.
  const bite = L => Math.min(1, 0.3 + 0.04 * (L - 1));

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

  function randGate(r, L, n) {
    let ops = L === 1 ? ['+', 'x'] : L < 4 ? ['+', 'x', '-'] : ['+', 'x', '-', '/'];
    // no multiplying a crowd that is already far above the level's target, so numbers stay readable
    if (n > 1.5 * crowdTarget(L)) ops = ops.filter(o => o !== 'x');
    if (n < 8) ops = ops.filter(o => o !== '/'); // dividing a handful of soldiers is just a trap
    const op = ops[int(r, 0, ops.length - 1)];
    // + and - scale with the crowd, so a gate is a real choice at 6 soldiers and at 600
    const v = op === '+' ? int(r, 2, Math.max(5, Math.ceil(0.5 * n)))
      : op === '-' ? int(r, 2, Math.max(3, Math.floor(Math.min(0.2 + 0.03 * L, 0.5) * n))) // bigger cuts later
      : op === 'x' ? int(r, 2, L < 6 ? 3 : 4) : int(r, 2, L < 8 ? 2 : 3); // a wrong ÷3 is brutal: from level 8
    return { op, v };
  }

  // Damage dealt until contact and crowd size at contact, with gate rows crossed mid-fight.
  function capacity(lv, m, rows, z) {
    const zw = z - lv.lead;
    let t = 0, cap = 0;
    for (const row of rows) {
      const tr = (row.z - zw) / lv.vp;
      if (tr >= lv.T) break;
      cap += m * FIRE * (tr - t); t = tr;
      m = applyOp(m, row.g);
      if (m <= 0) return null;
    }
    return { cap: cap + m * FIRE * (lv.T - t), m };
  }
  // Crowd after a fight against M enemies and all its rows, or -Infinity if wiped out.
  function fight(lv, m, rows, z, M) {
    const zw = z - lv.lead;
    let t = 0, cap = 0, met = false;
    const contact = () => { cap += m * FIRE * (lv.T - t); m -= Math.max(0, Math.ceil(bite(lv.L) * (M - cap) - 1e-9)); met = true; };
    for (const row of rows) {
      const tr = (row.z - zw) / lv.vp;
      if (!met && tr >= lv.T) { contact(); if (m <= 0) return -Infinity; }
      if (!met) { cap += m * FIRE * (tr - t); t = tr; }
      m = applyOp(m, row.g);
      if (m <= 0) return -Infinity;
    }
    if (!met) contact();
    return m > 0 ? m : -Infinity;
  }
  // A squad sizes itself from the crowd it meets, aimed at the stronger side of this fight's choice.
  // Live sizing stops rounding errors from compounding fight after fight.
  function squadSize(lv, e, m) {
    const sides = [capacity(lv, m, e.rows, e.z0), capacity(lv, m, e.alt, e.z0)].filter(Boolean);
    if (!sides.length) return Math.max(1, Math.floor(m * FIRE * lv.T));
    sides.sort((p, q) => q.cap - p.cap);
    const hi = sides[0]; // the stronger side always survives: its loss is at most share * its crowd
    return Math.max(1, Math.floor(hi.cap + Math.min(squadShare(lv.L, hi.m) * hi.m, hi.m - 1) / bite(lv.L)));
  }

  // A level is a chain of fights. Each fight holds one choice (a gate row, or a locked split path),
  // so you pick gates while you shoot, and the next squad attacks as soon as the last fight ends.
  function makeLevel(L, start = START_COUNT) {
    const r = rng(L * 7919 + 17 + start * 104729);
    const vp = speedFor(L), ve = enemySpeedFor(L), vb = bossSpeedFor(L);
    const lead = RANGE - vp / 120;      // mean gap when a fight starts in the 60 Hz sim
    const T = lead / (vp + ve);         // fight length if the squad reaches you
    const gates = [], hostiles = [], forks = [];
    const lv = { L, vp, lead, T, gates, hostiles, forks, start, hints: L < 4 };
    // n follows the solver's path (the level is designed around it); paths holds the crowd for every
    // surviving choice sequence, and total counts dead ones too (used for the guardian's pass rate).
    let n = start, paths = [start], total = 1, zs = 100, lastRow = -Infinity;
    const laneGap = Math.max(30, 0.8 * vp) + 12; // time to change lanes before the next choice (and its divider)

    function pickPaths(k, wantTrap, safeOnly) {
      for (let tries = 0; tries < (safeOnly ? 0 : 60); tries++) {
        const left = [], right = [];
        for (let i = 0; i < k; i++) { left.push(randGate(r, L, n)); right.push(randGate(r, L, n)); }
        const a = runPath(n, left), b = runPath(n, right);
        // a choice may at most quadruple the crowd (or add 60), so numbers stay readable
        if (Math.max(a, b) < 1 || a === b || Math.max(a, b) > Math.max(4 * n, n + 60)) continue;
        if (wantTrap && tries < 40 && (applyOp(n, left[0]) > applyOp(n, right[0])) === (a > b)) continue;
        return { left, right, a, b };
      }
      const safe = Array.from({ length: k }, () => ({ op: '+', v: 2 }));
      const worse = safe.map(() => ({ op: '-', v: 1 }));
      return { left: safe, right: worse, a: n + 2 * k, b: runPath(n, worse) };
    }

    for (;;) {
      const k = forkRows(L), zw = zs - lead;
      let rowsN = k && r() < forkChance(L) ? k : 1;
      const layout = cnt => {
        const z0 = Math.max(zw + vp * T * (cnt > 1 ? 0.08 : 0.4), lastRow + laneGap); // first gate lands early in the fight
        const rowZ = [];
        for (let i = 0, z = z0; i < cnt; i++, z += FORK_ROW_GAP) {
          // no gate within 15% of the contact moment: plan and sim could apply gate and losses in different order
          const tr = (z - zw) / (vp * T);
          if (tr > 0.85 && tr < 1.15) z = zw + 1.15 * vp * T;
          rowZ.push(z);
        }
        // next squad wakes only after this fight's contact point and its last gate row
        return { rowZ, nextZs: Math.max(zw + vp * T, rowZ.at(-1)) + RANGE + 10 };
      };
      let lay = layout(rowsN);
      if (rowsN > 1 && lay.nextZs > GUARD_Z) { rowsN = 1; lay = layout(1); }
      if (lay.nextZs > GUARD_Z) break; // the guardian fight must start after the last squad fight
      const rowsOf = side => lay.rowZ.map((z, i) => ({ z, g: side[i] }));
      const trap = rowsN > 1 && r() < trapChance(L);
      let left, right, squad, out;
      // The best side must stay best and keep a real crowd for any crowd within 15% of the plan,
      // so a soldier or two of drift never turns the right answer into a wipe-out.
      const robust = (side, other) => [0.85, 1, 1.15].every(f => {
        const m = Math.max(1, Math.round(n * f)), o = out(m, side);
        return o >= Math.max(3, 0.3 * m) && o >= out(m, other);
      });
      for (let tries = 0; ; tries++) {
        ({ left, right } = tries < 20 ? pickPaths(rowsN, trap) : pickPaths(rowsN, false, true));
        squad = { type: 'squad', z: zs, z0: zs, rows: rowsOf(left), alt: rowsOf(right), speed: ve };
        out = (m, side) => fight(lv, m, rowsOf(side), zs, squadSize(lv, squad, m));
        if (robust(left, right) || robust(right, left) || tries > 60) break; // cap: never hang the game
      }
      const best = robust(left, right) || (!robust(right, left) && out(n, left) >= out(n, right)) ? 'L' : 'R';
      const fork = rowsN > 1 ? forks.push({ z0: lay.rowZ[0] - 12, z1: lay.rowZ.at(-1) + 4 }) - 1 : -1;
      lay.rowZ.forEach((z, i) => gates.push({ type: 'gates', z, left: left[i], right: right[i], fork, best }));
      squad.hp = squad.max = squadSize(lv, squad, n); // shown until the squad sizes itself against your real crowd
      hostiles.push(squad);
      paths = paths.flatMap(m => [out(m, left), out(m, right)]).filter(m => m > 0);
      total *= 2;
      n = out(n, best === 'L' ? left : right); // never below 3: the fight was regenerated until it kept a crowd
      zs = lay.nextZs; lastRow = lay.rowZ.at(-1);
    }
    const boss = L % 3 === 0;
    paths.sort((p, q) => q - p);
    const need = Math.min(paths[Math.min(paths.length, Math.max(1, Math.round(passShare(L) * total))) - 1], 0.9 * n);
    // shortest possible fight in the sim, with slack: the real crowd can arrive a soldier or two short of the plan
    const hp = Math.max(1, Math.ceil((0.95 * need - 1) * FIRE * (RANGE - vp / 60) / (vp + (boss ? vb : 0))) - 1);
    hostiles.push({ type: boss ? 'boss' : 'wall', z: GUARD_Z, hp, max: hp, speed: boss ? vb : 0 });
    lv.bestEnd = n;
    return lv;
  }

  const fresh = (level, z, x, n) => ({ level, z, x, n, gi: 0, hi: 0, lock: 0, target: null, next: null });
  const newLevel = (L, start = START_COUNT) => fresh(makeLevel(L, start), 0, 0, start);
  // Seamless hand-off at the level line: same crowd, same lane, distance carries over.
  const continueLevel = s => fresh(s.next || makeLevel(s.level.L + 1, carry(s.n)), s.z - LEVEL_LENGTH, s.x, carry(s.n));

  // Advance one fixed step. Gates and fights run on separate tracks. Returns 'hit' (level restarts), 'clear', or null.
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

    const g = lv.gates[s.gi];
    if (g && s.z >= g.z) {
      s.n = applyOp(s.n, s.x < 0 ? g.left : g.right);
      s.gi++;
      if (s.n <= 0) { s.n = 0; return 'hit'; }
    }
    const e = lv.hostiles[s.hi];
    if (e && e.type === 'squad' && !e.awake) e.hp = e.max = squadSize(lv, e, s.n);
    if (e && e.z - s.z <= RANGE) {
      e.awake = true;
      e.z -= e.speed * dt;
      e.hp -= s.n * FIRE * dt;
      s.target = e;
      if (e.hp <= 0) {
        e.hp = 0; s.hi++;
        // Guardian down: the crowd is final, so build the next level now and let it show up ahead.
        if (s.hi === lv.hostiles.length) s.next = makeLevel(lv.L + 1, carry(s.n));
      } else if (e.z - s.z <= 0) {
        s.hi++;
        if (e.type !== 'squad') return 'hit';
        s.n -= Math.ceil(bite(lv.L) * e.hp - 1e-9); e.hp = 0;
        if (s.n <= 0) { s.n = 0; return 'hit'; }
      }
    }
    return s.z >= LEVEL_LENGTH ? 'clear' : null;
  }

  // Score = points banked at level start + distance in this level. A hit rolls back to the banked value.
  const newRun = (level = 1, score = 0, start = START_COUNT) => ({ level, banked: score, start });
  const liveScore = (run, s) => run.banked + Math.floor(Math.max(0, Math.min(s.z, LEVEL_LENGTH)));
  function onClear(run, s) { run.banked += LEVEL_LENGTH + s.n; run.level++; run.start = carry(s.n); }

  const API = { LEVEL_LENGTH, RANGE, FIRE, START_COUNT, makeLevel, newLevel, continueLevel, step, applyOp, runPath,
    newRun, liveScore, onClear, speedFor, crowdTarget, passShare, forkRows };
  if (typeof module !== 'undefined') module.exports = API; else window.Logic = API;
})();

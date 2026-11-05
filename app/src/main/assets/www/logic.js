'use strict';
// Pure game rules: wave generation, simulation step, scoring. No DOM, so Node tests run it as-is.
//
// The legion stands at the bottom of the screen and never advances. Three lanes:
//  - left: a belt of +tiles slides toward you; stand in the lane to collect them (you still shoot the horde);
//  - centre: a red carpet of enemies creeps toward you, with the wave's boss behind it;
//  - right: a stone wall guards a column of maths tiles; stand in the lane to shoot the wall (and not the horde).
//    Once it breaks the tiles slide down; you take a tile by being in the lane when it arrives, or dodge it.
// A level is one wave. When its boss dies the next wave's carpet is already marching right behind.
(function () {
  const RANGE = 30;          // the legion shoots the nearest target within this distance (short: fights happen up close)
  const FIRE = 1;            // damage per soldier per second
  const MELEE = 1;           // enemies each soldier cuts down per second when the carpet presses against the legion
  const START_COUNT = 5;
  const PACE = 1.3 * 1.15;   // playtest feedback: +30%, then +15%
  const BOSS_GAP = 20, WALL_Z = 24, SPAWN_Z = RANGE + 12, GAP = 3, PLUS_GAP = 6, BONUS_GAP = 8, LANE = 0.6;

  function rng(seed) { // mulberry32: same level => same wave on every retry
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));

  // Difficulty table (see README).
  const target = L => 8 + 4 * L;                                  // crowd size a wave is built for
  const cap = L => Math.round(1.5 * target(L));                   // the legion cannot grow past this
  const pressure = L => Math.min(1.3 + 0.05 * (L - 1), 1.9);      // enemies arriving, in target firepowers: dense ranks press even a full legion
  const bite = L => Math.min(0.7, 0.3 + 0.03 * (L - 1));          // soldiers each enemy kills when it reaches you
  const hordeSpeed = L => PACE * Math.min(5 + 0.25 * (L - 1), 11);
  const bossSpeed = L => 0.6 * hordeSpeed(L);
  const beltSpeed = () => PACE * 7;
  const plusValue = L => Math.max(1, Math.round(target(L) / 40));
  const floorCrowd = L => (L === 1 ? START_COUNT : cap(L));     // a restart gives a full legion: never a dead end

  function applyOp(n, g) {
    switch (g.op) {
      case '+': return n + g.v;
      case '-': return n - g.v;
      case 'x': return n * g.v;
      default: return Math.floor(n / g.v);
    }
  }

  function bonusTile(r, L) {
    const T = target(L), good = r() < (L < 4 ? 0.75 : Math.max(0.45, 0.75 - 0.02 * L));
    if (good) return r() < 0.5 ? { op: '+', v: int(r, Math.round(0.5 * T), Math.round(1.2 * T)) } : { op: 'x', v: L < 6 ? 2 : int(r, 2, 3) };
    return r() < 0.5 || L < 3 ? { op: '-', v: int(r, Math.round(0.3 * T), Math.round(0.7 * T)) } : { op: '/', v: 2 };
  }

  function makeWave(L) {
    const r = rng(L * 7919 + 17), T = target(L), ve = hordeSpeed(L);
    const rho = pressure(L) * T * FIRE / ve;                      // enemies per unit of carpet
    const secs = 12 + 0.1 * L, RANKS = [0.8, 1.0, 1.4, 1.0];      // a dense crush mid-wave presses the legion hardest
    const carpet = RANKS.map(m => {
      const count = Math.round(m * rho * ve * secs / RANKS.length);
      return { type: 'carpet', count, max: count, rho: m * rho, speed: ve, z: 0, L };
    });
    // the boss walks BOSS_GAP behind its wave: a duel once the carpet is gone. HP = a share of what a full
    // legion can shoot while the boss crosses that gap.
    const bhp = Math.round(cap(L) * FIRE * (BOSS_GAP / bossSpeed(L)) * Math.min(0.4 + 0.05 * (L - 1), 0.85));
    const whp = Math.round(T * FIRE * Math.min(1.5 + 0.1 * L, 4));
    const tiles = [];
    for (let i = 0; i < 4 + Math.min(4, Math.floor(L / 3)); i++) tiles.push({ ...bonusTile(r, L), z: WALL_Z + 6 + i * BONUS_GAP, L });
    return {
      horde: [...carpet, { type: 'boss', hp: bhp, max: bhp, speed: bossSpeed(L), z: 0, L }],
      wall: { type: 'wall', hp: whp, max: whp, z: WALL_Z, L },
      tiles,
    };
  }

  const back = it => it.z + (it.type === 'carpet' ? it.count / it.rho : 3);
  // ranks of one wave touch; the boss walks well behind its carpet; the next wave queues right behind the boss
  const gapBefore = (prev, it) => (it.type === 'boss' ? BOSS_GAP : prev.type === 'carpet' && prev.L === it.L ? 0 : GAP);
  function addWave(s, L) {
    const w = makeWave(L);
    let z = s.horde.length ? back(s.horde.at(-1)) + GAP : SPAWN_Z; // queue right behind: the horde never stops
    for (const it of w.horde) {
      if (s.horde.length) z = back(s.horde.at(-1)) + gapBefore(s.horde.at(-1), it);
      it.z = z; s.horde.push(it);
    }
    s.waves[L] = w;
  }
  // Start (or restart) at the beginning of level L with crowd n.
  function newWorld(L = 1, n = START_COUNT) {
    const s = { L, n: Math.min(n, cap(L)), x: 0, kills: 0, target: null, events: [], horde: [], plus: [], waves: {} };
    s.start = s.n;
    addWave(s, L); addWave(s, L + 1);
    s.wall = s.waves[L].wall; s.tiles = s.waves[L].tiles;
    for (let z = 4; z < SPAWN_Z + 40; z += PLUS_GAP) s.plus.push({ z, v: plusValue(L) });
    return s;
  }
  function levelUp(s) {
    delete s.waves[s.L];
    s.L++; s.start = s.n;
    s.wall = s.waves[s.L].wall; s.tiles = s.waves[s.L].tiles; // the new wave brings a new wall: an unbroken one is lost
    addWave(s, s.L + 1);
    return 'level';
  }

  // Advance one fixed step. Returns 'hit' (level restarts), 'level' (a wave was beaten), or null.
  // s.events lists what happened in this step, for effects: kills, leaks, pickups, wall breaks.
  function step(s, dt, targetX) {
    s.events.length = 0; s.target = null;
    s.x += Math.max(-6 * dt, Math.min(6 * dt, Math.max(-1, Math.min(1, targetX)) - s.x));
    const left = s.x <= -LANE, right = s.x >= LANE;
    let dmg = s.n * FIRE * dt;

    if (right && s.wall.hp > 0) { // hugging the right lane: all fire goes into the wall
      s.target = s.wall;
      s.wall.hp = Math.max(0, s.wall.hp - dmg);
      dmg = 0;
      if (!s.wall.hp) s.events.push({ type: 'wall' });
    }

    s.horde.forEach((it, i) => {
      it.z -= it.speed * dt;
      if (i) it.z = Math.max(it.z, back(s.horde[i - 1]) + gapBefore(s.horde[i - 1], it));
    });

    // the legion fights whatever is in front: a carpet rank, or a boss walking alone
    const f = s.horde[0];
    if (f.type === 'boss') {
      if (dmg > 0 && f.z <= RANGE) { s.target = f; f.hp -= dmg; }
      if (f.hp <= 0) { s.kills += f.max; s.horde.shift(); s.events.push({ type: 'boss' }); return levelUp(s); }
      if (f.z <= 0) return 'hit'; // the boss reached the legion
    } else {
      let arrive = 0;
      if (f.z < 0) { arrive = Math.min(f.count, -f.z * f.rho); f.z = 0; }
      // enemies reaching the legion: shots and melee cut them down; the rest kill soldiers as they fall
      const held = Math.min(arrive, dmg + (arrive > 0 ? s.n * MELEE * dt : 0)), leaked = arrive - held;
      dmg = Math.max(0, dmg - arrive);
      s.n -= bite(s.L) * leaked;
      f.count -= arrive; s.kills += held;
      if (arrive > 0) s.events.push({ type: 'melee', k: held });
      if (dmg > 0 && f.z <= RANGE && f.count > 0) {
        // shots thin out with distance, so the carpet creeps in until kills match arrivals, close to the legion
        const k = Math.min(dmg * (1 - f.z / RANGE), f.count);
        f.count -= k; f.z += k / f.rho; s.kills += k;
        s.events.push({ type: 'kill', k, z: f.z });
      }
      if (leaked > 0) s.events.push({ type: 'leak', k: leaked });
      if (!s.target && f.z <= RANGE) s.target = f;
      if (f.count <= 1e-6) s.horde.shift();
      if (s.n < 1) { s.n = 0; return 'hit'; }
    }

    const vc = beltSpeed();
    for (const p of s.plus) p.z -= vc * dt;
    while (s.plus.length && s.plus[0].z <= 0) {
      const p = s.plus.shift();
      if (left) { s.n = Math.min(s.n + p.v, cap(s.L)); s.events.push({ type: 'plus', v: p.v }); }
    }
    const lastZ = s.plus.length ? s.plus.at(-1).z : 0;
    if (lastZ < SPAWN_Z + 40 - PLUS_GAP) s.plus.push({ z: lastZ + PLUS_GAP, v: plusValue(s.L) });

    if (s.wall.hp <= 0) for (const t of s.tiles) t.z -= vc * dt;
    while (s.tiles.length && s.tiles[0].z <= 0) {
      const t = s.tiles.shift();
      if (!right) continue; // dodged
      s.n = Math.min(applyOp(Math.floor(s.n), t), cap(s.L));
      s.events.push({ type: 'tile', t });
      if (s.n < 1) { s.n = 0; return 'hit'; }
    }
    return null;
  }

  // What a careful player does: fight from the +1 lane, break the wall only while the horde is far away,
  // and step into the right lane only for maths tiles that help. takeAll = the thoughtless version.
  function autoX(s, takeAll = false) {
    const t = s.tiles[0], n = Math.floor(s.n);
    if (s.wall.hp <= 0 && t && t.z < 10) return takeAll || Math.min(applyOp(n, t), cap(s.L)) > n ? 0.9 : -0.9;
    const f = s.horde[0];
    if (s.wall.hp > 0 && f.z > (f.type === 'boss' ? RANGE + 10 : 18)) return 0.9;
    return -0.9;
  }

  // Score = points banked when the wave began + enemies shot in it. A restart rolls back to the banked value.
  const newRun = (level = 1, score = 0, start = START_COUNT) => ({ level, banked: score, start });
  const liveScore = (run, s) => run.banked + Math.floor(s.kills);
  function onLevel(run, s) { run.banked += Math.floor(s.kills); s.kills = 0; run.level = s.L; run.start = s.start; }

  const API = { RANGE, FIRE, START_COUNT, LANE, WALL_Z, makeWave, newWorld, step, applyOp, autoX,
    newRun, liveScore, onLevel, target, cap, floorCrowd, hordeSpeed };
  if (typeof module !== 'undefined') module.exports = API; else window.Logic = API;
})();

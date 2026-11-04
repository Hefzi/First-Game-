'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../app/src/main/assets/www/logic.js');

const DT = 1 / 60;
// Play from the start of level L until the level marker or a hit. policy(s) -> target x.
function playLevel(L, start, policy = s => G.autoX(s)) {
  const s = G.newWorld(L, start);
  let fighting = 0, t = 0;
  for (; t < 60 * 300; t++) {
    const res = G.step(s, DT, policy(s));
    if (s.holding) fighting++;
    if (res) return { res, s, underFire: fighting / t };
  }
  return { res: 'timeout', s, underFire: 0 };
}

// The careful player's continuous march from level 1 to `levels`, retrying a level after a hit as the game does.
function march(levels) {
  const run = G.newRun();
  let s = G.newWorld(1), retries = 0, lastZ = s.z;
  const starts = { 1: s.n };
  for (let t = 0; t < 60 * 60 * 60 && s.L <= levels; t++) {
    const z0 = s.z;
    const res = G.step(s, DT, G.autoX(s));
    assert.ok(s.z >= lastZ, 'the march never jumps back except on a hit');
    lastZ = s.z;
    if (res === 'level') {
      assert.ok(Math.abs(G.speedFor(1 + s.z / G.LEVEL_LENGTH) - G.speedFor(1 + z0 / G.LEVEL_LENGTH)) < 0.05, 'no speed jump');
      G.onLevel(run, s); starts[s.L] = s.n;
    }
    if (res === 'hit') { retries++; s = G.newWorld(run.level, run.start); lastZ = s.z; }
  }
  return { s, retries, starts, run };
}
const M = march(40);

test('same level gives the same route on every retry', () => {
  assert.deepStrictEqual(JSON.stringify(G.makeLevel(9)), JSON.stringify(G.makeLevel(9)));
  assert.notDeepStrictEqual(JSON.stringify(G.makeLevel(9)), JSON.stringify(G.makeLevel(10)));
});

test('every level 1-60 is winnable from its retry floor, so "the level restarts" never loops forever', () => {
  for (let L = 1; L <= 60; L++) assert.strictEqual(playLevel(L, G.floorCrowd(L)).res, 'level', `level ${L}`);
});

test('one continuous march from level 1 to 40, with few restarts', () => {
  assert.strictEqual(M.s.L, 41);
  assert.ok(M.retries <= 3, `${M.retries} restarts`);
});

test('the level marker changes nothing on the road: same crowd, same lane, no speed jump', () => {
  const s = G.newWorld(2);
  let res;
  do { var n0 = s.n, x0 = s.x; res = G.step(s, DT, G.autoX(s)); } while (res !== 'level' && res !== 'hit');
  assert.strictEqual(res, 'level');
  assert.strictEqual(s.L, 3);
  assert.strictEqual(s.n, n0);
  assert.ok(Math.abs(s.x - x0) < 0.11);
});

test('the crowd stands its ground while the horde charges, and fights about half the time or more', () => {
  const s = G.newWorld(5);
  for (let t = 0; t < 60 * 30; t++) {
    const z = s.z, wasHolding = s.packs.some(p => p.awake && p.hp > 0);
    G.step(s, DT, G.autoX(s));
    if (wasHolding) assert.strictEqual(s.z, z, 'no advance while an enemy is charging');
  }
  for (const L of [2, 5, 10, 20, 30, 40]) { // level 1 opens with a quiet march so 3 soldiers can grow first
    const { underFire } = playLevel(L, M.starts[L]);
    assert.ok(underFire >= 0.45, `level ${L}: fighting ${(100 * underFire).toFixed(0)}% of the time`);
  }
});

test('bonus lane: hugging it breaks the wall and collects the pocket; ignoring it loses the pocket', () => {
  const L = 4, lv = G.makeLevel(L);
  assert.ok(lv.blockers.length > 0 && lv.tiles.some(t => t.pocket), 'level 4 has a walled pocket');
  const play = policy => {
    const s = G.newWorld(L, G.cap(L)), wall = s.blockers[0], pocket = s.tiles.filter(t => t.pocket === wall);
    for (let t = 0; t < 60 * 120 && s.z < wall.z + 40; t++) if (G.step(s, DT, policy(s, wall))) break;
    return { wallHp: wall.hp, got: pocket.filter(t => t.got).length, of: pocket.length };
  };
  const hug = play((s, wall) => (wall.hp > 0 && wall.z - s.z <= G.RANGE ? 0.8 : G.autoX(s, false)));
  assert.strictEqual(hug.wallHp, 0, 'hugging the lane breaks the wall');
  assert.strictEqual(hug.got, hug.of, 'and the pocket is collected');
  const road = play(s => G.autoX(s, false));
  assert.ok(road.wallHp > 0 && road.got === 0, 'staying in the road leaves the wall standing and the pocket lost');
});

test('choices matter: deliberate mistakes fail more often at higher levels', () => {
  const failRate = (from, to) => {
    let fails = 0, runs = 0;
    for (let L = from; L <= to; L++) {
      // a decision is a gate row or a split path; key it by road position (each world builds new objects)
      const key = d => Math.round(d.fork ? d.fork.z0 : d.z0 !== undefined ? d.z0 : d.z);
      const decisions = [...new Set(G.makeLevel(L).gates.map(g => key(g)))];
      for (let i = 0; i < 6; i++) {
        const wrong = new Set(decisions.filter((_, j) => (j * 7 + i * 3 + L) % decisions.length < 2));
        runs++;
        if (playLevel(L, M.starts[L], s => G.autoX(s, true, d => wrong.has(key(d)))).res !== 'level') fails++;
      }
    }
    return fails / runs;
  };
  const early = failRate(1, 3), late = failRate(25, 32);
  assert.ok(early < late, `two mistakes: early ${early.toFixed(2)} vs late ${late.toFixed(2)}`);
});

test('the legion never grows past its cap', () => {
  for (let L = 1; L <= 40; L++) assert.ok(M.starts[L] <= G.cap(L), `level ${L}: ${M.starts[L]} > ${G.cap(L)}`);
});

test('score: distance and kills bank at each level marker and roll back on a hit', () => {
  const run = G.newRun();
  const s = G.newWorld(1);
  s.z = 250; s.kills = 7;
  assert.strictEqual(G.liveScore(run, s), 257);
  s.z = G.LEVEL_LENGTH + 1; s.L = 2; s.start = 20;
  G.onLevel(run, s);
  assert.deepStrictEqual(run, { level: 2, banked: G.LEVEL_LENGTH + 7, start: 20 });
  const retry = G.newWorld(run.level, run.start); // a hit restarts the level with the crowd it started with
  assert.strictEqual(G.liveScore(run, retry), G.LEVEL_LENGTH + 7);
  assert.ok(retry.n >= 20);
});

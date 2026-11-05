'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../app/src/main/assets/www/logic.js');

const DT = 1 / 60;
// Play the wave of level L from crowd n until it is beaten or the legion is hit. policy(s) -> target x.
function play(L, n, policy = s => G.autoX(s)) {
  const s = G.newWorld(L, n);
  let pressing = 0, t = 0;
  for (; t < 60 * 120; t++) {
    const res = G.step(s, DT, policy(s));
    if (s.events.some(e => e.type === 'melee')) pressing++;
    if (res) return { res, s, pressing: pressing / t };
  }
  return { res: 'timeout', s, pressing: 0 };
}
// The careful player's continuous game from level 1, restarting a level after a hit as the game does.
function campaign(levels) {
  const run = G.newRun();
  let s = G.newWorld(1), restarts = 0;
  const starts = { 1: s.n };
  for (let t = 0; t < 60 * 60 * 60 && s.L <= levels; t++) {
    const res = G.step(s, DT, G.autoX(s));
    if (res === 'level') { G.onLevel(run, s); starts[s.L] = Math.floor(s.n); }
    if (res === 'hit') { restarts++; s = G.newWorld(run.level, Math.max(run.start, G.floorCrowd(run.level))); }
  }
  return { s, restarts, starts };
}
const C = campaign(40);

test('same level gives the same wave on every retry', () => {
  assert.strictEqual(JSON.stringify(G.makeWave(9)), JSON.stringify(G.makeWave(9)));
  assert.notStrictEqual(JSON.stringify(G.makeWave(9)), JSON.stringify(G.makeWave(10)));
});

test('every level 1-60 is winnable from its restart crowd, so "the level restarts" never loops forever', () => {
  for (let L = 1; L <= 60; L++) assert.strictEqual(play(L, G.floorCrowd(L)).res, 'level', `level ${L}`);
});

test('the careful player plays levels 1-40 as one continuous game, with few restarts', () => {
  assert.strictEqual(C.s.L, 41);
  assert.ok(C.restarts <= 3, `${C.restarts} restarts`);
});

test('no break between waves: the next carpet is already marching when a boss dies', () => {
  const s = G.newWorld(3, G.floorCrowd(3));
  let res;
  do { var n0 = s.n, x0 = s.x; res = G.step(s, DT, G.autoX(s)); } while (!res);
  assert.strictEqual(res, 'level');
  assert.strictEqual(s.L, 4);
  assert.strictEqual(s.n, n0, 'the crowd is untouched by the level change');
  assert.ok(Math.abs(s.x - x0) < 0.11, 'and stays where it was');
  assert.strictEqual(s.horde[0].type, 'carpet');
  assert.ok(s.horde[0].z <= G.RANGE + 8, 'the next carpet is right there');
});

test('the carpet presses against the legion, more often at higher levels', () => {
  const early = play(3, C.starts[3]).pressing, late = play(30, C.starts[30]).pressing;
  assert.ok(early > 0, 'contact already in the first levels');
  assert.ok(late > 0.25 && late > early, `pressing early ${early.toFixed(2)}, late ${late.toFixed(2)}`);
});

test('left lane: standing in it collects the +tiles; standing in the centre does not', () => {
  const grow = policy => { const s = G.newWorld(1, 5); for (let t = 0; t < 60 * 3; t++) G.step(s, DT, policy); return s.n; };
  assert.ok(grow(-1) > grow(0) + 3);
});

test('right lane: hugging it breaks the wall and frees the maths tiles; staying away leaves it standing', () => {
  const run = x => { const s = G.newWorld(2, G.cap(2)); for (let t = 0; t < 60 * 4; t++) G.step(s, DT, x); return s.wall.hp; };
  assert.strictEqual(run(1), 0);
  assert.ok(run(-1) > 0);
});

test('maths tiles: a bad tile hurts if taken and costs nothing if dodged', () => {
  const s = G.newWorld(8, 40);
  s.wall.hp = 0;
  s.tiles = [{ op: '/', v: 2, z: 1, L: 8 }];
  s.x = 1;
  G.step(s, 0.2, 1); // in the lane when it arrives: taken
  assert.ok(s.n <= 21, `took the tile: ${s.n}`);
  const d = G.newWorld(8, 40); d.wall.hp = 0; d.tiles = [{ op: '/', v: 2, z: 1, L: 8 }]; d.x = -1;
  G.step(d, 0.2, -1);
  assert.ok(d.n >= 40, `dodged the tile: ${d.n}`);
});

test('thinking matters: taking every tile fails far more often than choosing', () => {
  let careless = 0;
  for (let L = 5; L <= 40; L++) if (play(L, C.starts[L], s => G.autoX(s, true)).res !== 'level') careless++;
  assert.ok(careless >= 15, `careless player failed only ${careless} of 36 levels`);
});

test('a boss that reaches the legion restarts the level', () => {
  const s = G.newWorld(6, 1e9);
  s.horde = [s.horde.find(h => h.type === 'boss')];
  s.horde[0].z = 1;
  s.n = 5;
  let res = null;
  for (let t = 0; t < 60 && !res; t++) res = G.step(s, DT, 0);
  assert.strictEqual(res, 'hit');
});

test('the legion never grows past its cap, and never past 100 soldiers at any level', () => {
  for (let L = 2; L <= 40; L++) assert.ok(C.starts[L] <= G.cap(L), `level ${L}: ${C.starts[L]} > ${G.cap(L)}`);
  for (let L = 1; L <= 100; L++) assert.ok(G.cap(L) <= 100 && G.floorCrowd(L) <= 100, `level ${L}`);
  const s = G.newWorld(30, 1e9);
  assert.strictEqual(s.n, 100, 'a huge start is clipped to 100');
  s.wall.hp = 0; s.tiles = [{ op: 'x', v: 3, z: 0.5, L: 30 }]; s.x = 1;
  G.step(s, 0.1, 1);
  assert.ok(s.n <= 100, `a x3 tile at the cap stays at ${s.n}`);
});

test('score: kills bank at each level and roll back on a restart', () => {
  const run = G.newRun();
  const s = G.newWorld(1);
  s.kills = 57.6;
  assert.strictEqual(G.liveScore(run, s), 57);
  s.L = 2; s.start = 20;
  G.onLevel(run, s);
  assert.deepStrictEqual(run, { level: 2, banked: 57, start: 20 });
  assert.strictEqual(G.liveScore(run, G.newWorld(run.level, run.start)), 57);
});

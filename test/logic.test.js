'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../app/src/main/assets/www/logic.js');

const DT = 1 / 60;
const aim = (s, chooser) => {
  const g = s.level.gates[s.gi];
  return g ? (chooser(s, g) === 'L' ? -0.6 : 0.6) : s.x;
};
// Play one level from a given starting crowd. chooser(s, gateRow) -> 'L' | 'R'
function play(L, chooser, start) {
  const s = G.newLevel(L, start);
  let fighting = 0, t = 0;
  for (; t < 60 * 120; t++) {
    const res = G.step(s, DT, aim(s, chooser));
    if (s.target) fighting++;
    if (res) return { res, s, underFire: fighting / t };
  }
  return { res: 'timeout', s, underFire: 0 };
}
const solver = (s, g) => g.best;
const greedy = (s, g) => (G.applyOp(s.n, g.left) >= G.applyOp(s.n, g.right) ? 'L' : 'R');

// One unbroken march: the solver plays levels 1..levels with continueLevel at every level line.
function march(levels) {
  let s = G.newLevel(1);
  const starts = [, s.n], ends = [];
  for (let t = 0; t < 60 * 60 * 60 && s.level.L <= levels; t++) {
    const res = G.step(s, DT, aim(s, solver));
    assert.notStrictEqual(res, 'hit', `solver was hit on level ${s.level.L}`);
    if (res === 'clear') {
      ends[s.level.L] = s.n;
      const lineZ = s.z;
      s = G.continueLevel(s);
      assert.ok(Math.abs(s.z + G.LEVEL_LENGTH - lineZ) < 1e-9, 'distance must carry over');
      starts[s.level.L] = s.n;
    }
  }
  return { s, starts, ends };
}
const M40 = march(40);

test('same level and starting crowd give the same route', () => {
  assert.deepStrictEqual(G.makeLevel(7, 40), G.makeLevel(7, 40));
  assert.notDeepStrictEqual(G.makeLevel(7, 40), G.makeLevel(8, 40));
});

test('every level is the same fixed distance, opens with a fight, and ends with a guardian', () => {
  for (let L = 1; L <= 40; L++) {
    const lv = G.makeLevel(L, M40.starts[L]);
    assert.strictEqual(lv.hostiles[0].type, 'squad');
    assert.ok(lv.hostiles[0].z - G.RANGE < lv.gates[0].z, `level ${L}: fight starts before the first gate`);
    assert.ok(['wall', 'boss'].includes(lv.hostiles.at(-1).type));
    assert.ok([...lv.gates, ...lv.hostiles].every(e => e.z < G.LEVEL_LENGTH));
  }
});

test('every choice is made under fire: each first gate row sits inside a squad fight', () => {
  for (let L = 1; L <= 40; L++) {
    const lv = G.makeLevel(L, M40.starts[L]);
    const firstRows = lv.gates.filter((g, i) => g.fork < 0 || lv.gates[i - 1]?.fork !== g.fork);
    for (const g of firstRows) {
      assert.ok(lv.hostiles.some(h => h.type === 'squad' && h.z - G.RANGE <= g.z && g.z <= h.z), `level ${L} gate at ${g.z}`);
    }
  }
});

test('the crowd is fighting most of the time', () => {
  for (const L of [1, 5, 10, 20, 30, 40]) {
    const { underFire } = play(L, solver, M40.starts[L]);
    assert.ok(underFire > 0.5, `level ${L}: under fire only ${(100 * underFire).toFixed(0)}% of the time`);
  }
});

test('the solver marches from level 1 to 40 without a stop or a hit, crowd carried over', () => {
  assert.strictEqual(M40.s.level.L, 41);
  for (let L = 2; L <= 40; L++) assert.strictEqual(M40.starts[L], Math.max(M40.ends[L - 1], G.START_COUNT), `level ${L} start`);
  const top = Math.max(...M40.ends.filter(Boolean));
  assert.ok(top < 2000, `crowd grew to ${top}`);
});

test('planning matters: greedy "biggest number now" fails some later levels', () => {
  let fails = 0;
  for (let L = 5; L <= 40; L++) if (play(L, greedy, M40.starts[L]).res !== 'clear') fails++;
  assert.ok(fails >= 5, `greedy failed only ${fails} levels`);
});

test('the next level is ready before the level line, so the route never pops in late', () => {
  const s = G.newLevel(1);
  while (!s.next) assert.notStrictEqual(G.step(s, DT, aim(s, solver)), 'hit');
  assert.ok(G.LEVEL_LENGTH + s.next.hostiles[0].z - G.RANGE - s.z > 60, 'next level shows up well ahead');
});

test('score banks on clear, rolls back on hit, and the crowd carries into the next level', () => {
  const run = G.newRun();
  const s = G.newLevel(1);
  s.z = 250;
  assert.strictEqual(G.liveScore(run, s), 250);
  G.onClear(run, { n: 12 });
  assert.deepStrictEqual(run, { level: 2, banked: G.LEVEL_LENGTH + 12, start: 12 });
  const retry = G.newLevel(run.level, run.start); // a hit restarts the level with the crowd it started with
  assert.strictEqual(G.liveScore(run, retry), G.LEVEL_LENGTH + 12);
  assert.strictEqual(retry.n, 12);
});

test('level 1 forgives a single mistake: one wrong choice still clears in most cases', () => {
  const lv = G.makeLevel(1);
  const keys = [...new Set(lv.gates.map(g => (g.fork < 0 ? g.z : 'f' + g.fork)))];
  const clears = keys.filter(k => play(1, (s, g) => ((g.fork < 0 ? g.z : 'f' + g.fork) === k ? (g.best === 'L' ? 'R' : 'L') : g.best)).res === 'clear');
  assert.ok(clears.length >= 0.7 * keys.length, `only ${clears.length} of ${keys.length} single mistakes survive`);
});

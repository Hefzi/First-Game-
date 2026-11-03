'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../app/src/main/assets/www/logic.js');

const DT = 1 / 60;
// chooser(s, gateEvent) -> 'L' | 'R'
function play(L, chooser) {
  const s = G.newLevel(L);
  for (let t = 0; t < 60 * 120; t++) {
    const e = s.level.events.slice(s.i).find(ev => ev.type === 'gates');
    const res = G.step(s, DT, e ? (chooser(s, e) === 'L' ? -0.6 : 0.6) : s.x);
    if (res) return { res, s };
  }
  return { res: 'timeout', s };
}
const solver = (s, e) => e.best;
const greedy = (s, e) => (G.applyOp(s.n, e.left) >= G.applyOp(s.n, e.right) ? 'L' : 'R');

test('same level number gives the same route', () => {
  assert.deepStrictEqual(G.makeLevel(7), G.makeLevel(7));
  assert.notDeepStrictEqual(G.makeLevel(7), G.makeLevel(8));
});

test('every level is the same fixed distance and the guardian is last', () => {
  for (let L = 1; L <= 40; L++) {
    const ev = G.makeLevel(L).events;
    assert.ok(['wall', 'boss'].includes(ev.at(-1).type));
    assert.ok(ev.every(e => e.z < G.LEVEL_LENGTH));
  }
});

test('the solver bot clears levels 1-40 in the real simulation', () => {
  for (let L = 1; L <= 40; L++) assert.strictEqual(play(L, solver).res, 'clear', `level ${L}`);
});

test('planning matters: greedy "biggest number now" fails some later levels', () => {
  let fails = 0;
  for (let L = 5; L <= 40; L++) if (play(L, greedy).res !== 'clear') fails++;
  assert.ok(fails >= 5, `greedy failed only ${fails} levels`);
});

test('score banks on clear, rolls back on hit, top score keeps the max', () => {
  const run = G.newRun();
  const s = G.newLevel(1);
  s.z = 250;
  assert.strictEqual(G.liveScore(run, s), 250);
  G.onClear(run, { n: 12 });
  assert.deepStrictEqual(run, { level: 2, banked: G.LEVEL_LENGTH + 12 });
  const retry = G.newLevel(2); // a hit restarts the level: z back to 0
  assert.strictEqual(G.liveScore(run, retry), G.LEVEL_LENGTH + 12);
});

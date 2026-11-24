import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellName, recapText } from '../src/shared/recap.ts';

const stats = (over = {}) => ({ players: 12, won: 9, lost: 3, wins: [0, 0, 1, 5, 2, 1, 0], bestStreak: 4, ...over });

test('recap stays quiet when nobody played', () => {
  assert.equal(recapText(7, 'Torres Strait', cellName(26), 3, stats({ players: 0, won: 0, lost: 0 })), null);
});

test('recap names the day, the region, the ship and the par', () => {
  const t = recapText(7, 'Torres Strait', cellName(26), 3, stats())!;
  assert.match(t, /Gone Dark #7 · Torres Strait/);
  assert.match(t, /12 searched · 9 found the ship/);
  assert.match(t, /hiding at \*\*C3\*\*/);
  assert.match(t, /expert needed 3 buoys/);
  assert.match(t, /Longest streak still alive: 4 days/);
});

test('recap histogram has one row per buoy count plus lost, scaled to the largest', () => {
  const t = recapText(7, 'X', cellName(0), 1, stats())!;
  const rows = t.split('\n').filter((l) => /^ {4}[1-6✕]/.test(l));
  assert.equal(rows.length, 7);
  assert.match(rows[2]!, /^ {4}3 █{14} 5$/);
  assert.match(rows[6]!, /^ {4}✕ █+ 3$/);
  assert.match(t, /needed 1 buoy\./);
});

test('recap omits the streak line for short streaks', () => {
  assert.doesNotMatch(recapText(7, 'X', cellName(0), 3, stats({ bestStreak: 1 }))!, /streak/);
});

test('cell names match the chart labels', () => {
  assert.equal(cellName(0), 'A1');
  assert.equal(cellName(13), 'B2');
});

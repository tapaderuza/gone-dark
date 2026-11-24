import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CELLS,
  COLS,
  MAX_DROPS,
  bandFor,
  bandTable,
  candidates,
  dayDate,
  dayNumber,
  expertSolve,
  makePuzzle,
  reachable,
  regionForDay,
  shareText,
  type Drop,
  type RegionData,
} from '../src/shared/engine.ts';

const openSea = '1'.repeat(CELLS);
const at = (row: number, col: number) => row * COLS + col;
// A north–south wall of land in column 6, with one gap at row 12.
const walled = Array.from({ length: CELLS }, (_, i) =>
  i % COLS === 6 && Math.floor(i / COLS) !== 12 ? '0' : '1'
).join('');
const regions = JSON.parse(
  readFileSync(
    new URL('../src/server/data/regions.json', import.meta.url),
    'utf8'
  )
) as RegionData[];

test('bands follow distance in open water', () => {
  const buoy = at(8, 5);
  assert.equal(bandFor(openSea, buoy, buoy), 0);
  assert.equal(bandFor(openSea, buoy, at(9, 6)), 1); // diagonal neighbour, 1.41 cells
  assert.equal(bandFor(openSea, buoy, at(8, 8)), 2); // 3 cells
  assert.equal(bandFor(openSea, buoy, at(8, 11)), 3); // 6 cells
  assert.equal(bandFor(openSea, buoy, at(0, 0)), 4); // far
});

test('land between buoy and ship silences it', () => {
  assert.equal(bandFor(walled, at(4, 5), at(4, 7)), 4);
  assert.equal(bandFor(walled, at(12, 5), at(12, 7)), 2); // through the gap
});

test('the ship travels by sea, around land', () => {
  const near = reachable(walled, at(4, 5), 3);
  assert.ok(!near.includes(at(4, 7)), 'cannot cross the wall');
  const far = reachable(walled, at(4, 5), 20);
  assert.ok(far.includes(at(4, 7)), 'can go round through the gap');
});

test('the real hiding place always survives the readings', () => {
  const region = regions[0]!;
  for (let day = 1; day <= 6; day++) {
    const p = makePuzzle(region, day);
    const drops: Drop[] = [];
    for (const buoy of reachable(region.mask, p.clue.cell, p.clue.reach).slice(
      0,
      4
    )) {
      drops.push({ cell: buoy, band: bandFor(region.mask, buoy, p.ship) });
      assert.ok(candidates(region.mask, p.clue, drops).includes(p.ship));
    }
  }
});

test('puzzles are deterministic and fair', () => {
  for (let day = 1; day <= 14; day++) {
    const region = regionForDay(regions, day);
    const a = makePuzzle(region, day);
    const b = makePuzzle(region, day);
    assert.deepEqual(a, b);
    const table = bandTable(region.mask);
    for (const s of reachable(region.mask, a.clue.cell, a.clue.reach)) {
      assert.ok(
        expertSolve(region.mask, table, a.clue, s, MAX_DROPS) <= MAX_DROPS - 1,
        `${region.id} day ${day}`
      );
    }
  }
});

test('every region appears once per pass', () => {
  const seen = new Set<string>();
  for (let day = 1; day <= regions.length; day++)
    seen.add(regionForDay(regions, day).id);
  assert.equal(seen.size, regions.length);
});

test('day numbers start on 18 November 2026', () => {
  assert.equal(dayNumber(new Date('2026-11-18T00:00:00Z')), 1);
  assert.equal(dayNumber(new Date('2026-11-18T23:59:59Z')), 1);
  assert.equal(dayDate(1), '2026-11-18');
});

test('share text has no spoilers', () => {
  const text = shareText(
    3,
    'Strait of Gibraltar',
    [
      { cell: 10, band: 3 },
      { cell: 40, band: 0 },
    ],
    true
  );
  assert.match(text, /^Gone Dark #3 · Strait of Gibraltar — found in 2\/6/);
  assert.ok(!/\d{2,}/.test(text.split('\n').at(-1)!), 'no cell numbers');
});

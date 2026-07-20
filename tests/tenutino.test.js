import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadTenutinoContext,
  lastMeasureForSource,
  lastMeasureForSeam,
  resolveTenutinoAnchor,
  resolveTenutinoPlaybackPosition,
  saveTenutinoContext,
  tenutinoHandoffFraction,
  TENUTINO_SIZE,
} from '../js/ui/tenutino.js';

const segments = [
  { sourceId: 'c1', seamIndex: null, measureIndex: 0 },
  { sourceId: 'c1', seamIndex: null, measureIndex: 1 },
  { sourceId: 's0-0', seamIndex: 0, measureIndex: 1 },
  { sourceId: 's0-1', seamIndex: 0, measureIndex: 2 },
  { sourceId: 'c2', seamIndex: null, measureIndex: 2 },
];

test('Tenutino targets the last measure occupied by an edited chord', () => {
  assert.equal(lastMeasureForSource(segments, 'c1'), 1);
  assert.equal(lastMeasureForSource(segments, 'missing', 4), 4);
});

test('Tenutino targets generated seam material and falls back to the departing chord', () => {
  assert.equal(lastMeasureForSeam(segments, 0, 'c1'), 2);
  assert.equal(lastMeasureForSeam(segments, 3, 'c1'), 1);
});

test('Tenutino anchors above the requested measure without crossing the sheet top', () => {
  const layout = [
    { index: 0, x: 10, width: 320, staffTop: 42 },
    { index: 1, x: 330, width: 320, staffTop: 192 },
  ];
  assert.equal(TENUTINO_SIZE, 46);
  assert.deepEqual(resolveTenutinoAnchor(layout, 1), { measureIndex: 1, left: 330, top: 132 });
  assert.equal(resolveTenutinoAnchor([{ index: 0, x: 0, width: 200, staffTop: 30 }], 0).top, 4);
});

test('Tenutino follows the exact measure start after the measure wraps to a new system', () => {
  const beforeWrap = [{ index: 3, x: 730, width: 320, staffTop: 42 }];
  const afterWrap = [{ index: 3, x: 10, width: 320, staffTop: 192 }];
  assert.equal(resolveTenutinoAnchor(beforeWrap, 3).left, 730);
  assert.deepEqual(resolveTenutinoAnchor(afterWrap, 3), { measureIndex: 3, left: 10, top: 132 });
});

test('Tenutino moves continuously from the start to the end of the playing measure', () => {
  const layout = [{ index: 2, x: 10, width: 320, staffTop: 192 }];
  assert.equal(resolveTenutinoPlaybackPosition(layout, 2, 0).left, 10);
  assert.equal(resolveTenutinoPlaybackPosition(layout, 2, 0.5).left, 147);
  assert.equal(resolveTenutinoPlaybackPosition(layout, 2, 1).left, 284);
});

test('adjacent measures on the same system share an exact boundary position', () => {
  const layout = [
    { index: 0, x: 10, width: 320, staffTop: 106, parkourObstacles: [] },
    { index: 1, x: 330, width: 320, staffTop: 106, parkourObstacles: [] },
  ];
  const outgoing = resolveTenutinoPlaybackPosition(layout, 0, 1);
  const incoming = resolveTenutinoPlaybackPosition(layout, 1, 0);

  assert.equal(outgoing.handoff.type, 'same-system');
  assert.equal(outgoing.left, incoming.left);
  assert.equal(outgoing.top, incoming.top);
});

test('a wrapped measure lands its jump exactly at the next system entrance', () => {
  const layout = [
    { index: 0, x: 330, width: 320, staffTop: 106, parkourObstacles: [] },
    { index: 1, x: 10, width: 320, staffTop: 256, parkourObstacles: [] },
  ];
  const options = { systemWrapHandoffFraction: 0.2 };
  const midpoint = resolveTenutinoPlaybackPosition(layout, 0, 0.9, TENUTINO_SIZE, options);
  const outgoing = resolveTenutinoPlaybackPosition(layout, 0, 1, TENUTINO_SIZE, options);
  const incoming = resolveTenutinoPlaybackPosition(layout, 1, 0, TENUTINO_SIZE, options);

  assert.equal(midpoint.handoff.type, 'system-wrap');
  assert.equal(midpoint.parkour.mode, 'jump');
  assert.ok(midpoint.top < (46 + 196) / 2);
  assert.equal(outgoing.left, incoming.left);
  assert.equal(outgoing.top, incoming.top);
});

test('measure-boundary handoff windows stay time-based across tempos', () => {
  assert.equal(tenutinoHandoffFraction(2, 120), 0.08);
  assert.equal(tenutinoHandoffFraction(1, 120), 0.12);
  assert.equal(tenutinoHandoffFraction(0.5, 260), 0.3);
});

test('Tenutino jumps when playback crosses a tall note cluster', () => {
  const layout = [{
    index: 2,
    x: 10,
    width: 320,
    staffTop: 192,
    parkourObstacles: [{ left: 100, right: 140, jumpHeight: 36, mode: 'jump' }],
  }];
  // Places Tenutino's center inside the obstacle's approach/landing arc.
  const position = resolveTenutinoPlaybackPosition(layout, 2, 0.4);
  assert.equal(position.parkour.active, true);
  assert.equal(position.parkour.mode, 'jump');
  assert.ok(position.top < 132);
});

test('Tenutino has enough headroom to jump over notes on the first system', () => {
  const layout = [{
    index: 0,
    x: 10,
    width: 320,
    // renderNotation reserves 50px above its former first-system position,
    // placing the first staff at 106px instead of 56px.
    staffTop: 106,
    parkourObstacles: [{ left: 100, right: 140, jumpHeight: 42, mode: 'jump' }],
  }];
  const anchor = resolveTenutinoAnchor(layout, 0);
  const position = resolveTenutinoPlaybackPosition(layout, 0, 0.4);

  assert.equal(anchor.top, 46);
  assert.equal(position.parkour.active, true);
  assert.ok(position.top >= 4);
  assert.ok(position.top < anchor.top);
});

test('Tenutino restores the cached last edit and rejects stale destinations', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const progression = {
    chords: [{ id: 'c1' }, { id: 'c2' }],
    seams: [null],
  };

  saveTenutinoContext('project-1', { type: 'seam', index: 0 }, storage);
  assert.deepEqual(loadTenutinoContext('project-1', progression, storage), { type: 'seam', index: 0 });

  saveTenutinoContext('project-1', { type: 'chord', chordId: 'deleted' }, storage);
  assert.deepEqual(loadTenutinoContext('project-1', progression, storage), { type: 'chord', chordId: 'c2' });
});

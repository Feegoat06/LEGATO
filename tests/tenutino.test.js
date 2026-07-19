import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lastMeasureForSource,
  lastMeasureForSeam,
  resolveTenutinoAnchor,
  resolveTenutinoPlaybackPosition,
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
  assert.deepEqual(resolveTenutinoAnchor(layout, 1), { measureIndex: 1, left: 330, top: 146 });
  assert.equal(resolveTenutinoAnchor([{ index: 0, x: 0, width: 200, staffTop: 30 }], 0).top, 4);
});

test('Tenutino follows the exact measure start after the measure wraps to a new system', () => {
  const beforeWrap = [{ index: 3, x: 730, width: 320, staffTop: 42 }];
  const afterWrap = [{ index: 3, x: 10, width: 320, staffTop: 192 }];
  assert.equal(resolveTenutinoAnchor(beforeWrap, 3).left, 730);
  assert.deepEqual(resolveTenutinoAnchor(afterWrap, 3), { measureIndex: 3, left: 10, top: 146 });
});

test('Tenutino moves continuously from the start to the end of the playing measure', () => {
  const layout = [{ index: 2, x: 10, width: 320, staffTop: 192 }];
  assert.equal(resolveTenutinoPlaybackPosition(layout, 2, 0).left, 10);
  assert.equal(resolveTenutinoPlaybackPosition(layout, 2, 0.5).left, 154);
  assert.equal(resolveTenutinoPlaybackPosition(layout, 2, 1).left, 298);
});

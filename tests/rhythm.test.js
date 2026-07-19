import test from 'node:test';
import assert from 'node:assert/strict';
import { decompose, layoutEvents } from '../js/engine/rhythm.js';

test('three beats remain one dotted-half segment', () => {
  assert.deepEqual(decompose(3), [3]);

  const [segment] = layoutEvents([{
    notes: [60, 64, 67], duration: 3, isTechnique: false, sourceId: 'c-major', seamIndex: null,
  }], 4);
  assert.equal(segment.durationBeats, 3);
});

test('a dotted half and following quarter fill one 4/4 measure', () => {
  const segments = layoutEvents([
    { notes: [60, 64, 67], duration: 3, isTechnique: false, sourceId: 'c-major', seamIndex: null },
    { notes: [67, 71, 74], duration: 1, isTechnique: false, sourceId: 'g-major', seamIndex: null },
  ], 4);

  assert.deepEqual(segments.map(({ durationBeats, measureIndex, startBeat }) => ({ durationBeats, measureIndex, startBeat })), [
    { durationBeats: 3, measureIndex: 0, startBeat: 0 },
    { durationBeats: 1, measureIndex: 0, startBeat: 3 },
  ]);
});

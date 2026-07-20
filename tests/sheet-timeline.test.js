import test from 'node:test';
import assert from 'node:assert/strict';

import { timelineAnchorsForNotes } from '../js/sheet-music/render.js';

test('engraved note positions retain their audio beat onsets', () => {
  const segments = [{ startBeat: 0 }, { startBeat: 1 }, { startBeat: 3 }];
  const notes = [95, 180, 290].map((x) => ({ getAbsoluteX: () => x }));

  assert.deepEqual(timelineAnchorsForNotes(segments, notes, 4), [
    { x: 95, progress: 0 },
    { x: 180, progress: 0.25 },
    { x: 290, progress: 0.75 },
  ]);
});

test('timeline anchors sort by final VexFlow position', () => {
  const segments = [{ startBeat: 2 }, { startBeat: 0 }];
  const notes = [{ getAbsoluteX: () => 240 }, { getAbsoluteX: () => 100 }];

  assert.deepEqual(timelineAnchorsForNotes(segments, notes, 4), [
    { x: 100, progress: 0 },
    { x: 240, progress: 0.5 },
  ]);
});

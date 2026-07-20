import test from 'node:test';
import assert from 'node:assert/strict';

import { musicalProgressAtX, particlePlayhead } from '../js/sheet-music/particles.js';

test('particle playhead follows exact progress inside the active measure', () => {
  assert.equal(particlePlayhead(0, 0, 4, 0), 0);
  assert.equal(particlePlayhead(1, 0.25, 4, 0.9), 1.25);
  assert.equal(particlePlayhead(3, 1, 4, 0.2), 4);
});

test('particle playhead falls back to global progress before a measure is active', () => {
  assert.equal(particlePlayhead(null, 0, 4, 0.375), 1.5);
  assert.equal(particlePlayhead(undefined, 0, 3, 2), 3);
});

test('system-opening symbols share the first sounding note onset', () => {
  const measure = {
    x: 10,
    width: 300,
    timelineAnchors: [
      { x: 110, progress: 0 },
      { x: 220, progress: 0.5 },
    ],
  };

  assert.equal(musicalProgressAtX(measure, 24), 0); // clef
  assert.equal(musicalProgressAtX(measure, 62), 0); // time signature
  assert.equal(musicalProgressAtX(measure, 110), 0); // first note
  assert.equal(musicalProgressAtX(measure, 220), 0.5);
});

test('particles interpolate between real note onsets and finish at the barline', () => {
  const measure = {
    x: 10,
    width: 300,
    timelineAnchors: [
      { x: 110, progress: 0 },
      { x: 210, progress: 0.5 },
    ],
  };

  assert.equal(musicalProgressAtX(measure, 160, 0), 0.25);
  assert.equal(musicalProgressAtX(measure, 310, 0), 1);
});

test('legacy layouts without note anchors retain horizontal mapping', () => {
  assert.equal(musicalProgressAtX({ x: 10, width: 200 }, 60), 0.25);
});

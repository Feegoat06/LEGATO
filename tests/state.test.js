import test from 'node:test';
import assert from 'node:assert/strict';
import { beatChoicesForMeter, isTechniqueUsable, makeChord, makeProgression, reconcileSeams, validateProgression } from '../js/state.js';

test('reconcileSeams preserves only unchanged adjacency', () => {
  const a = makeChord([60, 64, 67]), b = makeChord([62, 65, 69]), c = makeChord([64, 67, 71]);
  assert.deepEqual(reconcileSeams([a, b, c], ['passingDim', 'secondaryDom'], [a, c]), [null]);
  assert.deepEqual(reconcileSeams([a, b, c], ['passingDim', 'secondaryDom'], [b, c]), ['secondaryDom']);
});

test('makeProgression fills omitted seams with direct transitions', () => {
  const chords = [makeChord([60]), makeChord([62]), makeChord([64]), makeChord([65])];
  const progression = makeProgression({ chords, seams: ['secondaryDom'] });
  assert.deepEqual(progression.seams, ['secondaryDom', null, null]);
});

test('validation drops unknown techniques and rejects out-of-range notes', () => {
  const progression = makeProgression({ chords: [makeChord([60]), makeChord([64])], seams: ['futureThing'] });
  const result = validateProgression(progression);
  assert.equal(result.ok, true); assert.deepEqual(result.progression.seams, [null]); assert.equal(result.warnings.length, 1);
  progression.chords[0].notes = [200]; assert.equal(validateProgression(progression).ok, false);
});

test('technique usability leaves at least one beat in the departing chord', () => {
  const shortChord = makeChord([60, 64, 67], .5);
  const timeSig = { num: 4, den: 4 };
  assert.equal(isTechniqueUsable({ beatCost: 1 }, shortChord, timeSig), true);
  assert.equal(isTechniqueUsable({ beatCost: 2 }, shortChord, timeSig), false);
});

test('beat choices follow the project meter family', () => {
  assert.deepEqual(beatChoicesForMeter({ num: 4, den: 4 }), [0.5, 1, 1.5, 2, 3, 4, 6, 8]);
  assert.deepEqual(beatChoicesForMeter({ num: 6, den: 8 }), [1, 2, 3, 4, 6, 8]);
});

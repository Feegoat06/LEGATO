import { makeChord, makeProgression } from '../state.js';
import { notesFrom } from '../engine/chords.js';

export function makeDefaultProgression() {
  const chords = [
    makeChord(notesFrom(50, 'Min7'), 1, { rootMidi: 50, quality: 'Min7' }),
    makeChord(notesFrom(55, 'Dom7'), 1, { rootMidi: 55, quality: 'Dom7' }),
    makeChord(notesFrom(60, 'Major'), 1, { rootMidi: 60, quality: 'Major' }),
  ];
  return makeProgression({
    settings: { tempo: 96, timeSig: { num: 4, den: 4 }, key: 0, clef: 'auto' },
    chords,
    seams: [null, 'tritoneSub'],
  });
}

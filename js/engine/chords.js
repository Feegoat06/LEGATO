export const QUALITIES = Object.freeze({
  Major: [0, 4, 7],
  Minor: [0, 3, 7],
  Dom7: [0, 4, 7, 10],
  Maj7: [0, 4, 7, 11],
  Min7: [0, 3, 7, 10],
  Dim: [0, 3, 6],
  Dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  Sus2: [0, 2, 7],
  Sus4: [0, 5, 7],
  Aug: [0, 4, 8],
});

export function notesFrom(rootMidi, quality) {
  const intervals = QUALITIES[quality];
  if (!intervals) throw new Error(`Unknown quality: ${quality}`);
  return intervals.map((interval) => rootMidi + interval);
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

export function noteName(midi, key = 0, withOctave = true) {
  const names = key < 0 ? FLAT_NAMES : SHARP_NAMES;
  const name = names[((midi % 12) + 12) % 12];
  return withOctave ? `${name}${Math.floor(midi / 12) - 1}` : name;
}

export function chordDisplayName(chord, key = 0) {
  if (chord.hint) return `${noteName(chord.hint.rootMidi, key, false)} ${chord.hint.quality}`;
  return chord.notes.map((note) => noteName(note, key)).join('–');
}

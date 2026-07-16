import { QUALITIES } from './chords.js';
import { closestVoicing } from './voicing.js';

export const TECHNIQUES = Object.freeze({
  passingDim: { name: 'Diatonic passing diminished', beatCost: 1 },
  secondaryDom: { name: 'Secondary dominant', beatCost: 1 },
  tritoneSub: { name: 'Tritone substitution', beatCost: 1 },
  ii_v_i: { name: '2-5-1 insert', beatCost: 2 },
  susPassing: { name: 'Sus chord passing', beatCost: 1 },
  leadingTone: { name: 'Leading tone bass note', beatCost: 0.5 },
  scaleRun: { name: 'Scale run', beatCost: 2 },
  arpBridge: { name: 'Arpeggiated bridge', beatCost: 2 },
});

function rootPc(chord) {
  // The stored hint is display-only by contract. Infer a root from exact pitch
  // classes when they match a supported quality; otherwise use the lowest note
  // as a small, deterministic fallback without adding anything to stored state.
  const actual = [...new Set(chord.notes.map((note) => ((note % 12) + 12) % 12))].sort((a, b) => a - b);
  for (const quality of ['Major', 'Minor', 'Dom7', 'Min7', 'Dim7', 'Sus4', 'Maj7', 'Dim', 'm7b5', 'Sus2', 'Aug']) {
    for (let root = 0; root < 12; root += 1) {
      const expected = [...new Set(chordPcs(root, quality))].sort((a, b) => a - b);
      if (actual.length === expected.length && actual.every((pc, index) => pc === expected[index])) return root;
    }
  }
  return ((Math.min(...chord.notes) % 12) + 12) % 12;
}

function chordPcs(root, quality) {
  return QUALITIES[quality].map((interval) => (root + interval) % 12);
}

function closestTargetTo(source, targetNotes) {
  return [...targetNotes].sort((a, b) => Math.abs(a - source) - Math.abs(b - source))[0];
}

function subsample(notes, maxNotes) {
  if (notes.length <= maxNotes) return notes;
  if (maxNotes <= 1) return [notes[0]];
  return Array.from({ length: maxNotes }, (_, index) => notes[Math.round(index * (notes.length - 1) / (maxNotes - 1))]);
}

function noteEvents(notes, budget) {
  const totalUnits = Math.round(budget / 0.25);
  const count = Math.min(notes.length, totalUnits);
  const chosen = subsample(notes, count);
  const baseUnits = Math.floor(totalUnits / count);
  let remainder = totalUnits % count;
  return chosen.map((note) => {
    const units = baseUnits + (remainder-- > 0 ? 1 : 0);
    return { notes: [note], duration: units * 0.25 };
  });
}

export function generateTechnique(id, fromChord, toChord, reference, budget) {
  const target = rootPc(toChord);
  const block = (root, quality, duration = budget) => [{ notes: closestVoicing(chordPcs(root, quality), reference), duration }];
  switch (id) {
    case 'passingDim': return block(target + 11, 'Dim7');
    case 'secondaryDom': return block(target + 7, 'Dom7');
    case 'tritoneSub': return block(target + 1, 'Dom7');
    case 'ii_v_i': {
      const first = block(target + 2, 'Min7', budget / 2)[0];
      const second = { notes: closestVoicing(chordPcs(target + 7, 'Dom7'), first.notes), duration: budget / 2 };
      return [first, second];
    }
    case 'susPassing': return block(target, 'Sus4');
    case 'leadingTone': {
      const pc = (target + 11) % 12;
      const note = closestVoicing([pc], reference)[0];
      return [{ notes: [note], duration: budget }];
    }
    case 'scaleRun': {
      const start = Math.max(...fromChord.notes);
      const end = closestTargetTo(start, toChord.notes);
      let notes = [];
      if (Math.abs(end - start) <= 1) notes = [start + (end >= start ? -1 : 1)];
      else {
        const direction = Math.sign(end - start);
        for (let note = start + direction; direction > 0 ? note <= end : note >= end; note += direction) notes.push(note);
      }
      notes = subsample(notes, Math.floor(budget / 0.25));
      return noteEvents(notes, budget);
    }
    case 'arpBridge': {
      let notes = closestVoicing(chordPcs(target + 7, 'Dom7'), reference).sort((a, b) => a - b);
      notes = subsample(notes, Math.floor(budget / 0.25));
      return noteEvents(notes, budget);
    }
    default: return [];
  }
}

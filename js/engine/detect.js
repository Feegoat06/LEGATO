import { QUALITIES } from './chords.js';

const pitchClassOf = (midi) => ((midi % 12) + 12) % 12;

const QUALITY_ORDER = ['Major', 'Minor', 'Dom7', 'Maj7', 'Min7', 'Sus4', 'Sus2', 'm7b5', 'Dim7', 'Dim', 'Aug'];

export function detectChord(notes) {
  if (!notes || notes.length === 0) return null;
  const pcs = [...new Set(notes.map(pitchClassOf))];
  const sorted = [...notes].sort((a, b) => a - b);
  const bassPc = pitchClassOf(sorted[0]);
  const rootOrder = [bassPc];
  pcs.forEach((pc) => { if (!rootOrder.includes(pc)) rootOrder.push(pc); });
  for (let pc = 0; pc < 12; pc += 1) if (!rootOrder.includes(pc)) rootOrder.push(pc);
  for (const rootPc of rootOrder) {
    for (const quality of QUALITY_ORDER) {
      const expected = new Set(QUALITIES[quality].map((interval) => pitchClassOf(rootPc + interval)));
      if (expected.size !== pcs.length) continue;
      if (pcs.every((pc) => expected.has(pc))) return { rootPc, quality };
    }
  }
  return null;
}

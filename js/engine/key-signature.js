// Key signatures alter only their named natural scale degrees. They never
// perform a uniform transposition of all material.
const SHARP_ORDER = [5, 0, 7, 2, 9, 4, 11]; // F C G D A E B
const FLAT_ORDER = [11, 4, 9, 2, 7, 0, 5]; // B E A D G C F

function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

export function applyKeySignature(notes, key) {
  const affectedNaturals = key > 0
    ? new Set(SHARP_ORDER.slice(0, key))
    : new Set(FLAT_ORDER.slice(0, Math.abs(key)));
  const adjustment = Math.sign(key);
  return notes.map((midi) => affectedNaturals.has(pitchClass(midi)) ? midi + adjustment : midi);
}

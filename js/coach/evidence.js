function pitchClasses(notes) {
  return [...new Set(notes.map((note) => ((note % 12) + 12) % 12))].sort((a, b) => a - b);
}

export function buildCoachEvidence(progression, segments, seamIndex) {
  const from = progression.chords[seamIndex];
  const to = progression.chords[seamIndex + 1];
  const fromPcs = pitchClasses(from.notes);
  const toPcs = pitchClasses(to.notes);
  const generated = segments.filter((segment) => segment.seamIndex === seamIndex);
  return {
    commonPitchClasses: fromPcs.filter((pc) => toPcs.includes(pc)),
    exactCommonMidiNotes: from.notes.filter((note) => to.notes.includes(note)),
    bassMotionSemitones: Math.min(...to.notes) - Math.min(...from.notes),
    sopranoMotionSemitones: Math.max(...to.notes) - Math.max(...from.notes),
    generatedEvents: generated.map((segment) => ({ notes: segment.notes, durationBeats: segment.durationBeats })),
    generatedTotalBeats: generated.reduce((sum, segment) => sum + segment.durationBeats, 0),
  };
}

const MIN = 40;
const MAX = 88;
const MAX_SPAN = 16;

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function combinations(options, index = 0, current = [], output = []) {
  if (index === options.length) {
    const sorted = [...current].sort((a, b) => a - b);
    if (sorted.at(-1) - sorted[0] <= MAX_SPAN) output.push(sorted);
    return output;
  }
  for (const note of options[index]) combinations(options, index + 1, [...current, note], output);
  return output;
}

export function closestVoicing(pitchClasses, reference) {
  const unique = [...new Set(pitchClasses.map((pc) => ((pc % 12) + 12) % 12))];
  const options = unique.map((pc) => {
    const notes = [];
    for (let midi = MIN; midi <= MAX; midi += 1) if (midi % 12 === pc) notes.push(midi);
    return notes;
  });
  const ref = [...reference].sort((a, b) => a - b);
  let best = null;
  let bestCost = Infinity;
  for (const candidate of combinations(options)) {
    const paired = Math.min(candidate.length, ref.length);
    let cost = 0;
    for (let index = 0; index < paired; index += 1) cost += Math.abs(candidate[index] - ref[index]);
    cost += 0.1 * Math.abs(mean(candidate) - mean(ref));
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best ?? unique.map((pc) => 60 + ((pc - 0 + 12) % 12));
}

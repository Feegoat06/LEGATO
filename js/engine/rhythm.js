export const STANDARD_DURATIONS = [4, 2, 1, 0.5, 0.25];

export function decompose(duration) {
  const values = [];
  let remaining = Math.round(duration * 4) / 4;
  for (const value of STANDARD_DURATIONS) {
    while (remaining + 1e-9 >= value) {
      values.push(value);
      remaining = Math.round((remaining - value) * 4) / 4;
    }
  }
  return values;
}

export function layoutEvents(events, measureBeats) {
  const segments = [];
  let absoluteBeat = 0;
  for (const event of events) {
    let remaining = event.duration;
    while (remaining > 1e-9) {
      const position = absoluteBeat % measureBeats;
      const room = measureBeats - position;
      const chunk = Math.min(remaining, room);
      for (const durationBeats of decompose(chunk)) {
        segments.push({
          notes: [...event.notes], durationBeats, isTechnique: event.isTechnique,
          sourceId: event.sourceId, seamIndex: event.seamIndex,
          measureIndex: Math.floor(absoluteBeat / measureBeats), startBeat: absoluteBeat % measureBeats,
        });
        absoluteBeat += durationBeats;
      }
      remaining = Math.round((remaining - chunk) * 4) / 4;
    }
  }
  return segments;
}

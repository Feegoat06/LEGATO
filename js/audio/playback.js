let sampler;
let stopTimers = [];

function getSampler() {
  if (!window.Tone) throw new Error('Tone.js is not available.');
  if (!sampler) {
    sampler = new Tone.Sampler({
      urls: { A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3', A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3', A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3', A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3', A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3', A7: 'A7.mp3', C8: 'C8.mp3' },
      release: 1, baseUrl: 'https://tonejs.github.io/audio/salamander/',
    }).toDestination();
  }
  return sampler;
}

const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

function sameNotes(first, second) {
  return first.length === second.length && first.every((note, index) => note === second[index]);
}

/** Coalesce contiguous tied fragments into one sustained playback event. */
export function coalesceTiedSegments(segments, measureLength) {
  const events = [];
  for (const segment of segments) {
    const startBeat = segment.measureIndex * measureLength + segment.startBeat;
    const previous = events.at(-1);
    const previousEnd = previous ? previous.startBeat + previous.durationBeats : null;
    if (previous && previous.sourceId === segment.sourceId && sameNotes(previous.notes, segment.notes)
      && Math.abs(previousEnd - startBeat) < 1e-9) {
      previous.durationBeats += segment.durationBeats;
      continue;
    }
    events.push({ ...segment, notes: [...segment.notes], startBeat });
  }
  return events;
}

export async function playSegments(segments, settings, onMeasure, onStop) {
  stopPlayback();
  await Tone.start();
  const instrument = getSampler();
  await Tone.loaded();
  const secondsPerBeat = 60 / settings.tempo;
  const measureLength = settings.timeSig.num * 4 / settings.timeSig.den;
  const now = Tone.now() + 0.08;
  let end = 0;
  let lastMeasure = -1;
  for (const event of coalesceTiedSegments(segments, measureLength)) {
    const at = event.startBeat * secondsPerBeat;
    instrument.triggerAttackRelease(event.notes.map(frequency), event.durationBeats * secondsPerBeat * 0.96, now + at);
    end = Math.max(end, at + event.durationBeats * secondsPerBeat);
    if (event.measureIndex !== lastMeasure) {
      stopTimers.push(setTimeout(() => onMeasure(event.measureIndex), at * 1000));
      lastMeasure = event.measureIndex;
    }
  }
  stopTimers.push(setTimeout(() => { onMeasure(null); onStop?.(); }, (end + 0.1) * 1000));
}

export function stopPlayback() {
  stopTimers.forEach(clearTimeout);
  stopTimers = [];
  sampler?.releaseAll();
}

async function ready() {
  await Tone.start();
  const instrument = getSampler();
  await Tone.loaded();
  return instrument;
}

export async function playNote(midi, seconds = 0.45) {
  const instrument = await ready();
  instrument.triggerAttackRelease(frequency(midi), seconds);
}

export async function playChord(midis, seconds = 1.2) {
  if (!midis?.length) return;
  const instrument = await ready();
  instrument.triggerAttackRelease(midis.map(frequency), seconds);
}

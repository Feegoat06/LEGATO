const KEY_SIGNATURES = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const DURATIONS = new Map([[4, 'w'], [2, 'h'], [1, 'q'], [0.5, '8'], [0.25, '16']]);
const SHARPS = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const FLATS = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];

function keyString(midi, key) {
  const names = key < 0 ? FLATS : SHARPS;
  return `${names[midi % 12]}/${Math.floor(midi / 12) - 1}`;
}

function resolvedClef(segments, setting) {
  if (setting !== 'auto') return setting;
  const notes = segments.flatMap((segment) => segment.notes).sort((a, b) => a - b);
  return (notes[Math.floor(notes.length / 2)] ?? 60) < 60 ? 'bass' : 'treble';
}

export function renderNotation(container, segments, settings) {
  const VF = window.Vex?.Flow ?? window.VexFlow;
  if (!VF) {
    container.innerHTML = '<div class="notice">Notation library is loading…</div>';
    return;
  }
  container.replaceChildren();
  if (!segments.length) {
    container.innerHTML = '<div class="notice">Add a chord to begin the score.</div>';
    return;
  }
  const measures = Math.max(...segments.map((segment) => segment.measureIndex)) + 1;
  const width = Math.max(760, Math.min(1120, container.clientWidth || 900));
  const height = measures * 150 + 30;
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  const clef = resolvedClef(segments, settings.clef);
  for (let measure = 0; measure < measures; measure += 1) {
    const stave = new VF.Stave(12, 18 + measure * 145, width - 24);
    stave.setAttribute('data-measure', String(measure));
    stave.addClef(clef).addTimeSignature(`${settings.timeSig.num}/${settings.timeSig.den}`);
    stave.addKeySignature(KEY_SIGNATURES[settings.key + 7]);
    stave.setContext(context).draw();
    const measureSegments = segments.filter((segment) => segment.measureIndex === measure);
    const notes = measureSegments.map((segment) => {
      const staveNote = new VF.StaveNote({
        clef, keys: segment.notes.map((midi) => keyString(midi, settings.key)),
        duration: DURATIONS.get(segment.durationBeats) ?? 'q',
      });
      segment.notes.forEach((midi, index) => {
        const name = keyString(midi, settings.key).split('/')[0];
        if (name.length > 1) staveNote.addModifier(new VF.Accidental(name.slice(1)), index);
      });
      if (segment.isTechnique) staveNote.setStyle({ fillStyle: '#d86f42', strokeStyle: '#d86f42' });
      return staveNote;
    });
    if (notes.length) {
      const voice = new VF.Voice({ num_beats: settings.timeSig.num, beat_value: settings.timeSig.den }).setMode(VF.Voice.Mode.SOFT);
      voice.addTickables(notes);
      new VF.Formatter().joinVoices([voice]).format([voice], width - 180);
      voice.draw(context, stave);
    }
  }
}

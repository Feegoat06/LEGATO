/**
 * VexFlow rendering of the compiled progression.
 *
 * Reads the same `Segment[]` the audio scheduler consumes, so the sheet music
 * cannot silently drift from what plays. Each measure is drawn in its own
 * `<g>` group with `data-measure=<n>` — main.js toggles a `.is-playing` class
 * on that group during playback to light the current bar.
 *
 * User notes are drawn in `--ivory`; technique-generated notes in `--anchor`
 * (the accent color). Ties are drawn between adjacent segments that share a
 * `sourceId` (see rhythm.js), even across a barline. When that barline is a
 * system break, VexFlow's partial-tie form is used for each side; a normal
 * two-note tie would otherwise draw diagonally through the page.
 */
import { vexKeyForNote, chordSpellingIdentity } from '../engine/chords.js';
import { accidentalFor } from '../engine/key-signature.js';
import { createParkourObstacle } from './parkour.js';

const KEY_SIGNATURES = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const DURATIONS = new Map([[4, 'w'], [3, 'hd'], [2, 'h'], [1, 'q'], [0.5, '8'], [0.25, '16']]);
// The first system needs real space above it for Tenutino's jump. Previously
// its resting position was clamped to y=4, so subtracting the parkour lift was
// immediately clamped away and only later systems could visibly jump.
export const NOTATION_TOP_HEADROOM = 50;

/** 'auto' picks bass or treble from the median MIDI note across all segments. */
function resolvedClef(segments, setting) {
  if (setting !== 'auto') return setting;
  const notes = segments.flatMap((segment) => segment.notes).sort((a, b) => a - b);
  return (notes[Math.floor(notes.length / 2)] ?? 60) < 60 ? 'bass' : 'treble';
}

function styleModifiers(stave, color) {
  stave.getModifiers().forEach((modifier) => modifier.setStyle({ fillStyle: color, strokeStyle: color }));
}

/**
 * Return one VexFlow tie direction for each tied notehead.
 *
 * VexFlow's stem constants also describe tie curvature: UP produces a curve
 * below the noteheads and DOWN produces one above. In a tied chord, the
 * bottom note curves down, the top note curves up, and inner notes choose the
 * nearest outside direction. This keeps each arc beside its own notehead and
 * prevents chord ties from crossing one another.
 */
function tieDirections(firstNote, lastNote, count, VF) {
  if (count === 1) {
    const firstStem = firstNote.getStemDirection();
    const lastStem = lastNote.getStemDirection();
    // When the two ends disagree, conventional single-voice engraving
    // defaults to an upward curve.
    return [firstStem === lastStem ? firstStem : VF.StaveNote.STEM_DOWN];
  }

  const middleLine = 3; // VexFlow's middle staff line.
  return Array.from({ length: count }, (_, noteIndex) => {
    if (noteIndex === 0) return VF.StaveNote.STEM_UP; // bottom note: curve down
    if (noteIndex === count - 1) return VF.StaveNote.STEM_DOWN; // top note: curve up

    // Inner ties go toward the closer outer side. This preserves their
    // vertical ordering and avoids routing an inner arc across the chord.
    const line = firstNote.getKeyProps()[noteIndex]?.line ?? middleLine;
    if (line < middleLine) return VF.StaveNote.STEM_UP;
    if (line > middleLine) return VF.StaveNote.STEM_DOWN;
    return firstNote.getStemDirection();
  });
}

/**
 * Draw the sheet music into `container`, replacing anything already there.
 *
 * @param {HTMLElement} container
 * @param {Segment[]}   segments   Output of compile().
 * @param {Settings}    settings   For key signature, time signature, and clef.
 * @param {Chord[]}     [chords]   Origin chords for spelling — used to spell
 *                                 each user segment's notes per its chord
 *                                 identity (so G♯ major reads as G♯/B♯/D♯ and
 *                                 not G♯/C/D♯). Technique-generated segments
 *                                 fall through to key-based spelling.
 * @returns {{measureCount: number, layout: object[]}} Summary plus staff geometry for the Canvas overlay.
 */
export function renderNotation(container, segments, settings, chords = []) {
  const VF = window.Vex?.Flow ?? window.VexFlow;
  container.replaceChildren();
  if (!VF) {
    container.innerHTML = '<div class="notice">Notation is still loading. Refresh if this message remains.</div>';
    return { measureCount: 0, layout: [] };
  }
  if (!segments.length) {
    container.innerHTML = '<div class="notice">Add a chord to begin the sheet music.</div>';
    return { measureCount: 0, layout: [] };
  }

  const measureCount = Math.max(...segments.map((segment) => segment.measureIndex)) + 1;
  const width = Math.max(600, container.clientWidth || 820);
  const staveWidth = Math.max(230, Math.min(360, (width - 36) / Math.min(2, measureCount)));
  const columns = Math.max(1, Math.floor((width - 20) / staveWidth));
  const rows = Math.ceil(measureCount / columns);
  const rowHeight = 150;
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, rows * rowHeight + 20 + NOTATION_TOP_HEADROOM);
  const context = renderer.getContext();
  const clef = resolvedClef(segments, settings.clef);
  const staffColor = '#927a58';
  const lineColor = '#69563f';
  const userColor = '#e6ceaa';
  const techniqueColor = '#d1a15a';
  const notesBySource = [];
  const layout = [];
  const identityBySourceId = new Map();
  chords.forEach((chord) => identityBySourceId.set(chord.id, chordSpellingIdentity(chord)));

  for (let measure = 0; measure < measureCount; measure += 1) {
    const column = measure % columns;
    const row = Math.floor(measure / columns);
    const x = 10 + column * staveWidth;
    const y = 16 + NOTATION_TOP_HEADROOM + row * rowHeight;
    const measureLayout = {
      index: measure,
      x,
      width: staveWidth,
      staffTop: y + 40,
      lineGap: 10,
      parkourObstacles: [],
    };
    layout.push(measureLayout);
    context.openGroup('measure-group', `measure-${ measure }`, { 'data-measure': String(measure) });
    const stave = new VF.Stave(x, y, staveWidth);
    if (column === 0) {
      stave.addClef(clef).addTimeSignature(`${ settings.timeSig.num }/${ settings.timeSig.den }`).addKeySignature(KEY_SIGNATURES[settings.key + 7]);
    }
    styleModifiers(stave, staffColor);
    context.setStrokeStyle(lineColor); context.setFillStyle(lineColor);
    stave.setStyle({ fillStyle: lineColor, strokeStyle: lineColor }).setContext(context).draw();
    const measureSegments = segments.filter((segment) => segment.measureIndex === measure);
    const staveNotes = measureSegments.map((segment) => {
      const identity = segment.isTechnique ? null : identityBySourceId.get(segment.sourceId) ?? null;
      const spelled = segment.notes.map((midi) => vexKeyForNote(midi, identity, settings.key));
      const staveNote = new VF.StaveNote({
        clef,
        keys: spelled,
        duration: DURATIONS.get(segment.durationBeats) ?? 'q',
        // Let VexFlow apply the single-voice engraving rule: below the
        // middle line stems rise; above it they fall; chords use their outer
        // noteheads to decide.
        auto_stem: true,
      });
      // VexFlow 4 uses the dotted duration (`hd`) for tick accounting, but
      // requires an explicit Dot modifier to engrave the dot itself. Without
      // it, a three-beat segment looks like an ordinary two-beat half note.
      if (segment.durationBeats === 3) VF.Dot.buildAndAttach([staveNote], { all: true });
      spelled.forEach((vex, index) => {
        const accidental = accidentalFor(vex, settings.key);
        if (accidental) staveNote.addModifier(new VF.Accidental(accidental), index);
      });
      const color = segment.isTechnique ? techniqueColor : userColor;
      staveNote.setStyle({ fillStyle: color, strokeStyle: color });
      staveNote.setLedgerLineStyle?.({ fillStyle: color, strokeStyle: color });
      notesBySource.push({ segment, note: staveNote });
      return staveNote;
    });
    if (staveNotes.length) {
      const voice = new VF.Voice({ num_beats: settings.timeSig.num, beat_value: settings.timeSig.den }).setMode(VF.Voice.Mode.SOFT);
      voice.addTickables(staveNotes);
      new VF.Formatter().joinVoices([voice]).format([voice], staveWidth - (column === 0 ? 120 : 32));
      voice.draw(context, stave);
      measureLayout.parkourObstacles = staveNotes
        .map((note) => createParkourObstacle(
          note.getKeyProps?.() ?? [],
          note.getAbsoluteX?.(),
          measureLayout.lineGap,
        ))
        .filter(Boolean);
    }
    context.closeGroup();
  }

  for (let index = 0; index < notesBySource.length - 1; index += 1) {
    const current = notesBySource[index];
    const next = notesBySource[index + 1];
    if (current.segment.sourceId !== next.segment.sourceId) continue;
    const count = Math.min(current.note.keys.length, next.note.keys.length);
    const directions = tieDirections(current.note, next.note, count, VF);

    const currentRow = Math.floor(current.segment.measureIndex / columns);
    const nextRow = Math.floor(next.segment.measureIndex / columns);
    if (currentRow !== nextRow) {
      // A tie cannot be drawn directly between systems: its endpoints have
      // different vertical positions. Engraving convention uses an outgoing
      // fragment at the end of the prior line and an incoming fragment at the
      // beginning of the next line instead.
      directions.forEach((direction, noteIndex) => {
        const indices = [noteIndex];
        new VF.StaveTie({ first_note: current.note, first_indices: indices, last_indices: indices })
          .setDirection(direction).setStyle({ fillStyle: staffColor, strokeStyle: staffColor }).setContext(context).draw();
        new VF.StaveTie({ last_note: next.note, first_indices: indices, last_indices: indices })
          .setDirection(direction).setStyle({ fillStyle: staffColor, strokeStyle: staffColor }).setContext(context).draw();
      });
      continue;
    }

    directions.forEach((direction, noteIndex) => {
      const indices = [noteIndex];
      new VF.StaveTie({ first_note: current.note, last_note: next.note, first_indices: indices, last_indices: indices })
        .setDirection(direction).setStyle({ fillStyle: staffColor, strokeStyle: staffColor }).setContext(context).draw();
    });
  }
  return { measureCount, layout };
}

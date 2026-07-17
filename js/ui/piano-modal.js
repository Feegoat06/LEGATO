import { QUALITIES, noteName, notesFrom } from '../engine/chords.js';
import { detectChord } from '../engine/detect.js';
import { playNote, playChord } from '../audio/playback.js';
import { beatsPerBar, beatsToBars, barsToBeats } from '../state.js';

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const PITCH_CLASS_LABELS = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
const LETTER_ORDER = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const VF_KEY = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const QUALITY_LABELS = {
  Major: 'Major', Minor: 'Minor', Dom7: 'Dom 7', Maj7: 'Maj 7', Min7: 'Min 7',
  Dim: 'Dim', Dim7: 'Dim 7', m7b5: 'm7b5', Sus2: 'Sus2', Sus4: 'Sus4', Aug: 'Aug',
};
const BEAT_OPTIONS = [
  { beats: 0.5, label: '½ beat' },
  { beats: 1, label: '1 beat' },
  { beats: 1.5, label: '1½ beats' },
  { beats: 2, label: '2 beats' },
  { beats: 3, label: '3 beats' },
  { beats: 4, label: '4 beats' },
  { beats: 6, label: '6 beats' },
  { beats: 8, label: '8 beats' },
];

function pitchClassOf(midi) { return ((midi % 12) + 12) % 12; }

function matchesQuality(notes, rootMidi, quality) {
  const selectedPcs = [...new Set(notes.map(pitchClassOf))].sort((a, b) => a - b);
  const qualityPcs = [...new Set(QUALITIES[quality].map((interval) => pitchClassOf(rootMidi + interval)))].sort((a, b) => a - b);
  return selectedPcs.length === qualityPcs.length && selectedPcs.every((pc, index) => pc === qualityPcs[index]);
}

function renderPreview(container, notes) {
  const VF = window.Vex?.Flow ?? window.VexFlow;
  container.replaceChildren();
  if (!VF) { container.innerHTML = '<div class="preview-empty">Loading…</div>'; return; }
  if (!notes.length) { container.innerHTML = '<div class="preview-empty">—</div>'; return; }
  const sorted = [...notes].sort((a, b) => a - b);
  const width = Math.max(200, container.clientWidth || 220);
  const height = 140;
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  const median = sorted[Math.floor(sorted.length / 2)];
  const clef = median < 60 ? 'bass' : 'treble';
  const staffColor = '#7a664b';
  const noteColor = '#e6ceaa';
  const stave = new VF.Stave(6, 14, width - 12);
  stave.addClef(clef);
  stave.getModifiers().forEach((m) => m.setStyle({ fillStyle: staffColor, strokeStyle: staffColor }));
  ctx.setStrokeStyle(staffColor); ctx.setFillStyle(staffColor);
  stave.setStyle({ fillStyle: staffColor, strokeStyle: staffColor }).setContext(ctx).draw();
  const staveNote = new VF.StaveNote({
    clef,
    keys: sorted.map((midi) => `${VF_KEY[pitchClassOf(midi)]}/${Math.floor(midi / 12) - 1}`),
    duration: 'w',
  });
  sorted.forEach((midi, index) => {
    if (VF_KEY[pitchClassOf(midi)].length > 1) staveNote.addModifier(new VF.Accidental('#'), index);
  });
  staveNote.setStyle({ fillStyle: noteColor, strokeStyle: noteColor });
  const voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT);
  voice.addTickables([staveNote]);
  new VF.Formatter().joinVoices([voice]).format([voice], Math.max(40, width - 80));
  voice.draw(ctx, stave);
}

function fillBeatOptions(select, timeSig, currentBars) {
  select.replaceChildren();
  const currentBeats = currentBars != null ? Number(barsToBeats(currentBars, timeSig).toFixed(4)) : null;
  const options = [...BEAT_OPTIONS];
  const known = options.some((opt) => opt.beats === currentBeats);
  if (currentBeats != null && !known) {
    options.push({ beats: currentBeats, label: `${currentBeats} beats` });
    options.sort((a, b) => a.beats - b.beats);
  }
  options.forEach((opt) => {
    const option = new Option(opt.label, String(opt.beats));
    if (currentBeats != null && opt.beats === currentBeats) option.selected = true;
    select.add(option);
  });
}

export function openPianoModal(dialog, existingChord, onSave, timeSig = { num: 4, den: 4 }) {
  const rootSelect = dialog.querySelector('#modal-root');
  const durationSelect = dialog.querySelector('#modal-bars');
  const keys = dialog.querySelector('#piano-keys');
  const chips = dialog.querySelector('#modal-quality-chips');
  const previewSheet = dialog.querySelector('#preview-sheet');
  const previewPlay = dialog.querySelector('#preview-play');
  const octaveReadout = dialog.querySelector('#octave-readout');
  const octaveUp = dialog.querySelector('#octave-up');
  const octaveDown = dialog.querySelector('#octave-down');

  fillBeatOptions(durationSelect, timeSig, existingChord?.bars ?? 1);

  let selected = new Set(existingChord?.notes ?? notesFrom(60, 'Major'));
  const initialDetection = existingChord ? detectChord([...selected]) : { rootPc: 0, quality: 'Major' };
  let rootPc = initialDetection?.rootPc ?? pitchClassOf(existingChord?.hint?.rootMidi ?? 60);
  let quality = initialDetection?.quality ?? existingChord?.hint?.quality ?? 'Major';
  let octave = existingChord?.hint?.rootMidi
    ? Math.floor(existingChord.hint.rootMidi / 12) - 1
    : existingChord?.notes?.length
      ? Math.floor(Math.min(...existingChord.notes) / 12) - 1
      : 4;

  rootSelect.value = String(rootPc);

  function currentRootMidi() { return rootPc + (octave + 1) * 12; }

  function renderChips() {
    [...chips.children].forEach((chip) => {
      const active = chip.dataset.quality === quality;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
  }

  function updateOctaveControls() {
    const sorted = [...selected].sort((a, b) => a - b);
    const canUp = sorted.length === 0 || sorted[sorted.length - 1] + 12 <= 108;
    const canDown = sorted.length === 0 || sorted[0] - 12 >= 21;
    octaveUp.disabled = !canUp;
    octaveDown.disabled = !canDown;
    octaveReadout.textContent = `Octave ${octave}`;
  }

  function refreshFromSelection() {
    const sorted = [...selected].sort((a, b) => a - b);
    const detected = detectChord(sorted);
    if (detected) {
      rootPc = detected.rootPc;
      quality = detected.quality;
      rootSelect.value = String(rootPc);
    }
    renderChips();
    updateStatus(sorted, !!detected);
  }

  function updateStatus(sorted, recognized) {
    const letters = [...new Set(sorted.map((midi) => LETTER_ORDER[pitchClassOf(midi)]))];
    dialog.querySelector('#selected-notes').textContent = letters.length ? letters.join(' · ') : 'No notes selected';
    dialog.querySelector('#voicing-status').textContent = recognized
      ? `${LETTER_ORDER[rootPc]} ${QUALITY_LABELS[quality]} pitch classes recognized. Octaves and doublings remain yours.`
      : sorted.length
        ? 'Custom pitch-class set: no matching chord label, but every selected note is preserved.'
        : 'Toggle any key or click a quality to begin.';
    dialog.querySelector('#modal-save').disabled = sorted.length === 0;
    previewPlay.disabled = sorted.length === 0;
  }

  function renderKeys() {
    const rootMidi = currentRootMidi();
    const qualityPcs = new Set(QUALITIES[quality].map((interval) => pitchClassOf(rootMidi + interval)));
    const savedScroll = keys.scrollLeft;
    keys.replaceChildren();
    for (let midi = 21; midi <= 108; midi += 1) {
      const button = document.createElement('button');
      const selectedNow = selected.has(midi);
      button.type = 'button';
      button.className = `piano-key ${BLACK_PITCH_CLASSES.has(midi % 12) ? 'black' : 'white'} ${selectedNow ? 'selected' : ''} ${qualityPcs.has(midi % 12) ? 'quality-tone' : ''}`;
      button.textContent = midi % 12 === 0 ? noteName(midi) : '';
      button.title = noteName(midi);
      button.setAttribute('aria-label', noteName(midi));
      button.setAttribute('aria-pressed', String(selectedNow));
      button.onclick = () => {
        if (selected.has(midi)) selected.delete(midi);
        else selected.add(midi);
        playNote(midi).catch(() => {});
        refreshFromSelection();
        updateOctaveControls();
        renderKeys();
        renderPreview(previewSheet, [...selected].sort((a, b) => a - b));
      };
      keys.append(button);
    }
    keys.scrollLeft = savedScroll;
    refreshFromSelection();
    updateOctaveControls();
    renderPreview(previewSheet, [...selected].sort((a, b) => a - b));
  }

  function applyRootQuality() {
    selected = new Set(notesFrom(currentRootMidi(), quality));
    renderChips();
    renderKeys();
    const selectedButton = [...keys.children].find((button) => button.classList.contains('selected'));
    selectedButton?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function shiftOctave(direction) {
    const sorted = [...selected].sort((a, b) => a - b);
    if (!sorted.length) {
      octave = Math.max(0, Math.min(8, octave + direction));
      renderKeys();
      return;
    }
    const delta = direction * 12;
    if (sorted[0] + delta < 21 || sorted[sorted.length - 1] + delta > 108) return;
    selected = new Set(sorted.map((midi) => midi + delta));
    octave += direction;
    renderKeys();
    const selectedButton = [...keys.children].find((button) => button.classList.contains('selected'));
    selectedButton?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function playPreview() {
    playChord([...selected].sort((a, b) => a - b)).catch(() => {});
  }

  rootSelect.onchange = () => { rootPc = Number(rootSelect.value); applyRootQuality(); };
  chips.onclick = (event) => {
    const chip = event.target.closest('[data-quality]');
    if (!chip) return;
    quality = chip.dataset.quality;
    applyRootQuality();
  };
  octaveUp.onclick = () => shiftOctave(1);
  octaveDown.onclick = () => shiftOctave(-1);
  previewSheet.onclick = playPreview;
  previewSheet.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); playPreview(); }
  };
  previewPlay.onclick = (event) => { event.stopPropagation(); playPreview(); };
  dialog.querySelector('#modal-cancel').onclick = () => dialog.close();
  dialog.querySelector('#modal-save').onclick = () => {
    const notes = [...selected].sort((a, b) => a - b);
    if (!notes.length) return;
    const rootMidi = currentRootMidi();
    const hint = matchesQuality(notes, rootMidi, quality) ? { rootMidi, quality } : undefined;
    const beats = Number(durationSelect.value);
    onSave({ notes, bars: beatsToBars(beats, timeSig), ...(hint ? { hint } : {}) });
    dialog.close();
  };

  renderChips();
  renderKeys();
  dialog.showModal();
  requestAnimationFrame(() => {
    [...keys.children].find((button) => button.classList.contains('selected'))?.scrollIntoView({ inline: 'center', block: 'nearest' });
    renderPreview(previewSheet, [...selected].sort((a, b) => a - b));
  });
}

export function populateChordControls(dialog) {
  const root = dialog.querySelector('#modal-root');
  PITCH_CLASS_LABELS.forEach((label, pc) => root.add(new Option(label, String(pc))));
  const chips = dialog.querySelector('#modal-quality-chips');
  chips.replaceChildren();
  Object.keys(QUALITIES).forEach((qualityKey) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'quality-chip';
    chip.dataset.quality = qualityKey;
    chip.textContent = QUALITY_LABELS[qualityKey] ?? qualityKey;
    chip.setAttribute('aria-pressed', 'false');
    chips.append(chip);
  });
}

import { QUALITIES, noteName, notesFrom } from '../engine/chords.js';

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const PITCH_CLASS_LABELS = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
const LETTER_ORDER = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const VF_KEY = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const QUALITY_LABELS = {
  Major: 'Major', Minor: 'Minor', Dom7: 'Dom 7', Maj7: 'Maj 7', Min7: 'Min 7',
  Dim: 'Dim', Dim7: 'Dim 7', m7b5: 'm7b5', Sus2: 'Sus2', Sus4: 'Sus4', Aug: 'Aug',
};

function pitchClassOf(midi) { return ((midi % 12) + 12) % 12; }

function matchesQuality(notes, rootMidi, quality) {
  const selectedPcs = [...new Set(notes.map(pitchClassOf))].sort((a, b) => a - b);
  const qualityPcs = [...new Set(QUALITIES[quality].map((interval) => pitchClassOf(rootMidi + interval)))].sort((a, b) => a - b);
  return selectedPcs.length === qualityPcs.length && selectedPcs.every((pc, index) => pc === qualityPcs[index]);
}

function detectRootAndQuality(notes) {
  const pcs = [...new Set(notes.map(pitchClassOf))];
  for (const rootPc of pcs) {
    for (const quality of Object.keys(QUALITIES)) {
      const expected = new Set(QUALITIES[quality].map((i) => pitchClassOf(rootPc + i)));
      if (expected.size === pcs.length && pcs.every((pc) => expected.has(pc))) {
        return { rootPc, quality };
      }
    }
  }
  return null;
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

export function openPianoModal(dialog, existingChord, onSave) {
  const rootSelect = dialog.querySelector('#modal-root');
  const barsSelect = dialog.querySelector('#modal-bars');
  const keys = dialog.querySelector('#piano-keys');
  const chips = dialog.querySelector('#modal-quality-chips');
  const previewSheet = dialog.querySelector('#preview-sheet');
  const octaveReadout = dialog.querySelector('#octave-readout');
  const octaveUp = dialog.querySelector('#octave-up');
  const octaveDown = dialog.querySelector('#octave-down');

  let selected = new Set(existingChord?.notes ?? notesFrom(60, 'Major'));
  let rootPc;
  let quality;
  let octave;

  if (existingChord?.hint) {
    rootPc = pitchClassOf(existingChord.hint.rootMidi);
    quality = existingChord.hint.quality;
    octave = Math.floor(existingChord.hint.rootMidi / 12) - 1;
  } else if (existingChord?.notes?.length) {
    const detected = detectRootAndQuality(existingChord.notes);
    rootPc = detected?.rootPc ?? pitchClassOf(existingChord.notes[0]);
    quality = detected?.quality ?? 'Major';
    octave = Math.floor(Math.min(...existingChord.notes) / 12) - 1;
  } else {
    rootPc = 0;
    quality = 'Major';
    octave = 4;
  }

  rootSelect.value = String(rootPc);
  barsSelect.value = String(existingChord?.bars ?? 1);

  function currentRootMidi() { return rootPc + (octave + 1) * 12; }

  function renderChips() {
    [...chips.children].forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.quality === quality);
      chip.setAttribute('aria-pressed', String(chip.dataset.quality === quality));
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

  function renderKeys() {
    const rootMidi = currentRootMidi();
    const qualityPcs = new Set(QUALITIES[quality].map((interval) => pitchClassOf(rootMidi + interval)));
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
        selected.has(midi) ? selected.delete(midi) : selected.add(midi);
        renderKeys();
      };
      keys.append(button);
    }
    const sorted = [...selected].sort((a, b) => a - b);
    const letters = [...new Set(sorted.map((midi) => LETTER_ORDER[pitchClassOf(midi)]))];
    dialog.querySelector('#selected-notes').textContent = letters.length ? letters.join(' · ') : 'No notes selected';
    const keepsHint = sorted.length > 0 && matchesQuality(sorted, rootMidi, quality);
    dialog.querySelector('#voicing-status').textContent = keepsHint
      ? `${LETTER_ORDER[rootPc]} ${QUALITY_LABELS[quality]} pitch classes confirmed. Octaves and doublings remain yours.`
      : 'Custom pitch-class set: the quality label will be dropped, but every selected note is preserved.';
    dialog.querySelector('#modal-save').disabled = sorted.length === 0;
    updateOctaveControls();
    renderPreview(previewSheet, sorted);
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

  rootSelect.onchange = () => { rootPc = Number(rootSelect.value); applyRootQuality(); };
  chips.onclick = (event) => {
    const chip = event.target.closest('[data-quality]');
    if (!chip) return;
    quality = chip.dataset.quality;
    applyRootQuality();
  };
  octaveUp.onclick = () => shiftOctave(1);
  octaveDown.onclick = () => shiftOctave(-1);
  dialog.querySelector('#modal-cancel').onclick = () => dialog.close();
  dialog.querySelector('#modal-save').onclick = () => {
    const notes = [...selected].sort((a, b) => a - b);
    if (!notes.length) return;
    const rootMidi = currentRootMidi();
    const hint = matchesQuality(notes, rootMidi, quality) ? { rootMidi, quality } : undefined;
    onSave({ notes, bars: Number(barsSelect.value), ...(hint ? { hint } : {}) });
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

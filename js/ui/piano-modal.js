import { QUALITIES, noteName, notesFrom } from '../engine/chords.js';

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const REQUIRED_QUALITIES = ['Major', 'Minor', 'Dom7', 'Min7', 'Dim7', 'Sus4'];

function matchesQuality(notes, rootMidi, quality) {
  const selectedPcs = [...new Set(notes.map((note) => note % 12))].sort((a, b) => a - b);
  const qualityPcs = [...new Set(QUALITIES[quality].map((interval) => (rootMidi + interval) % 12))].sort((a, b) => a - b);
  return selectedPcs.length === qualityPcs.length && selectedPcs.every((pc, index) => pc === qualityPcs[index]);
}

export function openPianoModal(dialog, existingChord, onSave) {
  const root = dialog.querySelector('#modal-root');
  const quality = dialog.querySelector('#modal-quality');
  const bars = dialog.querySelector('#modal-bars');
  const keys = dialog.querySelector('#piano-keys');
  let selected = new Set(existingChord?.notes ?? notesFrom(60, 'Major'));
  root.value = String(existingChord?.hint?.rootMidi ?? 60);
  quality.value = existingChord?.hint?.quality ?? 'Major';
  bars.value = String(existingChord?.bars ?? 1);

  function renderKeys() {
    const rootMidi = Number(root.value);
    const qualityPcs = new Set(QUALITIES[quality.value].map((interval) => (rootMidi + interval) % 12));
    keys.replaceChildren();
    for (let midi = 21; midi <= 108; midi += 1) {
      const button = document.createElement('button');
      const selectedNow = selected.has(midi);
      button.type = 'button';
      button.className = `piano-key ${BLACK_PITCH_CLASSES.has(midi % 12) ? 'black' : 'white'} ${selectedNow ? 'selected' : ''} ${qualityPcs.has(midi % 12) ? 'quality-tone' : ''}`;
      button.textContent = midi % 12 === 0 ? noteName(midi) : '';
      button.title = `${noteName(midi)} · MIDI ${midi}`;
      button.setAttribute('aria-label', `${noteName(midi)}, MIDI ${midi}`);
      button.setAttribute('aria-pressed', String(selectedNow));
      button.onclick = () => {
        selected.has(midi) ? selected.delete(midi) : selected.add(midi);
        renderKeys();
      };
      keys.append(button);
    }
    const sorted = [...selected].sort((a, b) => a - b);
    dialog.querySelector('#selected-midi').textContent = sorted.join(' · ') || '—';
    dialog.querySelector('#selected-notes').textContent = sorted.map((midi) => noteName(midi)).join(' · ') || 'No notes selected';
    const keepsHint = sorted.length > 0 && matchesQuality(sorted, rootMidi, quality.value);
    dialog.querySelector('#voicing-status').textContent = keepsHint
      ? `${noteName(rootMidi, 0, false)} ${quality.value} pitch classes confirmed. Octaves and doublings remain yours.`
      : 'Custom pitch-class set: the quality label will be dropped, but every selected MIDI note is preserved.';
    dialog.querySelector('#modal-save').disabled = sorted.length === 0;
  }

  function applyQuality() {
    selected = new Set(notesFrom(Number(root.value), quality.value));
    renderKeys();
    const selectedButton = [...keys.children].find((button) => button.classList.contains('selected'));
    selectedButton?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  root.onchange = applyQuality;
  quality.onchange = applyQuality;
  dialog.querySelector('#apply-quality').onclick = applyQuality;
  dialog.querySelector('#modal-cancel').onclick = () => dialog.close();
  dialog.querySelector('#modal-save').onclick = () => {
    const notes = [...selected].sort((a, b) => a - b);
    if (!notes.length) return;
    const hint = matchesQuality(notes, Number(root.value), quality.value)
      ? { rootMidi: Number(root.value), quality: quality.value }
      : undefined;
    onSave({ notes, bars: Number(bars.value), ...(hint ? { hint } : {}) });
    dialog.close();
  };
  renderKeys();
  dialog.showModal();
  requestAnimationFrame(() => [...keys.children].find((button) => button.classList.contains('selected'))?.scrollIntoView({ inline: 'center', block: 'nearest' }));
}

export function populateChordControls(dialog) {
  const root = dialog.querySelector('#modal-root');
  for (let midi = 36; midi <= 83; midi += 1) root.add(new Option(`${noteName(midi)} · MIDI ${midi}`, String(midi)));
  const quality = dialog.querySelector('#modal-quality');
  REQUIRED_QUALITIES.forEach((name) => quality.add(new Option(name, name)));
}

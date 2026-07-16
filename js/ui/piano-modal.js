import { QUALITIES, noteName, notesFrom } from '../engine/chords.js';

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
    keys.replaceChildren();
    for (let midi = 48; midi <= 83; midi += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `piano-key ${(midi % 12) in {1:1,3:1,6:1,8:1,10:1} ? 'black' : 'white'} ${selected.has(midi) ? 'selected' : ''}`;
      button.textContent = noteName(midi);
      button.setAttribute('aria-pressed', String(selected.has(midi)));
      button.onclick = () => { selected.has(midi) ? selected.delete(midi) : selected.add(midi); renderKeys(); };
      keys.append(button);
    }
    dialog.querySelector('#selected-notes').textContent = [...selected].sort((a,b) => a-b).map((midi) => `${noteName(midi)} (${midi})`).join(', ') || 'No notes selected';
  }
  function applyQuality() {
    selected = new Set(notesFrom(Number(root.value), quality.value));
    renderKeys();
  }
  root.onchange = applyQuality;
  quality.onchange = applyQuality;
  dialog.querySelector('#modal-cancel').onclick = () => dialog.close();
  dialog.querySelector('#modal-save').onclick = () => {
    if (!selected.size) return;
    onSave({ notes: [...selected].sort((a,b) => a-b), bars: Number(bars.value), hint: { rootMidi: Number(root.value), quality: quality.value } });
    dialog.close();
  };
  renderKeys();
  dialog.showModal();
}

export function populateChordControls(dialog) {
  const root = dialog.querySelector('#modal-root');
  for (let midi = 48; midi <= 71; midi += 1) root.add(new Option(noteName(midi), String(midi)));
  const quality = dialog.querySelector('#modal-quality');
  ['Major', 'Minor', 'Dom7', 'Min7', 'Dim7', 'Sus4'].forEach((name) => quality.add(new Option(name, name)));
}

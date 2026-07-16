import { availableBeats, chordTotalBeats, compile, makeChord, reconcileSeams } from './state.js';
import { makeDefaultProgression } from './data/demo-progressions.js';
import { chordDisplayName, noteName } from './engine/chords.js';
import { TECHNIQUES } from './engine/techniques.js';
import { renderNotation } from './notation/render.js';
import { playSegments, stopPlayback } from './audio/playback.js';
import { openPianoModal, populateChordControls } from './ui/piano-modal.js';
import { requestCoach } from './coach/coach.js';

let progression = makeDefaultProgression();
let segments = [];
let editingId = null;
let selectedSeam = 0;
let lastCoachPayload = null;

const $ = (selector) => document.querySelector(selector);
const elements = { chords: $('#chord-list'), seams: $('#seam-list'), score: $('#score'), coach: $('#coach-output') };

function commitChords(nextChords) {
  progression.seams = reconcileSeams(progression.chords, progression.seams, nextChords);
  progression.chords = nextChords;
  selectedSeam = Math.min(selectedSeam, Math.max(0, progression.seams.length - 1));
  rerender();
}

function renderChords() {
  elements.chords.replaceChildren();
  if (!progression.chords.length) elements.chords.innerHTML = '<p class="empty">No chords yet. Add one with the piano.</p>';
  progression.chords.forEach((chord, index) => {
    const row = document.createElement('article');
    row.className = 'chord-card';
    row.innerHTML = `<div><span class="eyebrow">Chord ${index + 1}</span><h3>${chordDisplayName(chord, progression.settings.key)}</h3><p>${chord.notes.map((note) => `${noteName(note, progression.settings.key)} · ${note}`).join(' &nbsp; ')}</p></div><label>Bars <input type="number" min="0.5" step="0.5" value="${chord.bars}" aria-label="Bars for chord ${index + 1}"></label><div class="row-actions"><button class="ghost edit">Edit</button><button class="ghost danger delete">Delete</button></div>`;
    row.querySelector('input').onchange = (event) => { chord.bars = Math.max(0.5, Math.round(Number(event.target.value) * 2) / 2); rerender(); };
    row.querySelector('.edit').onclick = () => { editingId = chord.id; openPianoModal($('#piano-dialog'), chord, saveChord); };
    row.querySelector('.delete').onclick = () => commitChords(progression.chords.filter((item) => item.id !== chord.id));
    elements.chords.append(row);
  });
}

function renderSeams() {
  elements.seams.replaceChildren();
  if (!progression.seams.length) elements.seams.innerHTML = '<p class="empty">Add at least two chords to create a transition.</p>';
  progression.seams.forEach((selected, index) => {
    const budget = availableBeats(chordTotalBeats(progression.chords[index], progression.settings.timeSig));
    const card = document.createElement('article');
    card.className = `seam-card ${selectedSeam === index ? 'selected' : ''}`;
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Technique for seam ${index + 1}`);
    select.add(new Option('Direct transition', ''));
    Object.entries(TECHNIQUES).filter(([, technique]) => technique.beatCost <= budget).forEach(([id, technique]) => select.add(new Option(`${technique.name} · ${technique.beatCost} beat${technique.beatCost === 1 ? '' : 's'}`, id)));
    select.value = selected ?? '';
    select.onchange = () => { progression.seams[index] = select.value || null; selectedSeam = index; rerender(); };
    const title = document.createElement('div');
    title.innerHTML = `<span class="eyebrow">Seam ${index + 1} · ${budget} beats available</span><strong>${chordDisplayName(progression.chords[index], progression.settings.key)} → ${chordDisplayName(progression.chords[index + 1], progression.settings.key)}</strong>`;
    const explain = document.createElement('button');
    explain.textContent = 'Explain this transition';
    explain.onclick = () => explainSeam(index);
    card.onclick = () => { selectedSeam = index; renderSeams(); };
    card.append(title, select, explain);
    elements.seams.append(card);
  });
}

function saveChord(input) {
  if (editingId) {
    const chord = progression.chords.find((item) => item.id === editingId);
    Object.assign(chord, input);
  } else progression.chords.push(makeChord(input.notes, input.bars, input.hint));
  editingId = null;
  progression.seams = reconcileSeams([], [], progression.chords).map((value, index) => progression.seams[index] ?? value);
  rerender();
}

async function explainSeam(index, retry = false) {
  selectedSeam = index;
  const techniqueId = progression.seams[index];
  const generatedNotes = segments.filter((segment) => segment.seamIndex === index).flatMap((segment) => segment.notes);
  lastCoachPayload = { fromChord: { name: chordDisplayName(progression.chords[index], progression.settings.key), notes: progression.chords[index].notes }, toChord: { name: chordDisplayName(progression.chords[index + 1], progression.settings.key), notes: progression.chords[index + 1].notes }, technique: techniqueId ? { id: techniqueId, ...TECHNIQUES[techniqueId] } : 'none', generatedNotes };
  elements.coach.innerHTML = '<div class="coach-state"><span class="spinner"></span> Listening closely to this seam…</div>';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const explanation = await requestCoach(lastCoachPayload, { signal: controller.signal });
    clearTimeout(timer);
    elements.coach.innerHTML = `<div class="coach-answer">${explanation.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('\n', '<br>')}</div>`;
  } catch (error) {
    const message = error.name === 'AbortError' ? 'The coach timed out.' : error.message;
    elements.coach.innerHTML = `<div class="coach-state error">${message}<button id="retry-coach">Retry</button></div>`;
    $('#retry-coach').onclick = () => explainSeam(index, true);
  }
  if (!retry) renderSeams();
}

function setActiveMeasure(index) {
  document.querySelectorAll('[data-measure]').forEach((measure) => measure.classList.toggle('active-measure', Number(measure.dataset.measure) === index));
}

function rerender() {
  segments = compile(progression);
  renderChords(); renderSeams(); renderNotation(elements.score, segments, progression.settings);
  $('#tempo-value').textContent = `${progression.settings.tempo} BPM`;
}

populateChordControls($('#piano-dialog'));
$('#add-chord').onclick = () => { editingId = null; openPianoModal($('#piano-dialog'), null, saveChord); };
$('#reset-example').onclick = () => { stopPlayback(); progression = makeDefaultProgression(); selectedSeam = 0; elements.coach.innerHTML = '<p class="empty">Select a seam and ask why it works.</p>'; rerender(); };
$('#play').onclick = async () => { $('#play').disabled = true; try { await playSegments(segments, progression.settings, setActiveMeasure, () => { $('#play').disabled = false; }); } catch (error) { alert(error.message); $('#play').disabled = false; } };
$('#stop').onclick = () => { stopPlayback(); setActiveMeasure(null); $('#play').disabled = false; };
$('#tempo').oninput = (event) => { progression.settings.tempo = Number(event.target.value); $('#tempo-value').textContent = `${event.target.value} BPM`; };
$('#time-signature').onchange = (event) => { const [num, den] = event.target.value.split('/').map(Number); progression.settings.timeSig = { num, den }; rerender(); };
$('#key-signature').onchange = (event) => { progression.settings.key = Number(event.target.value); rerender(); };
$('#clef').onchange = (event) => { progression.settings.clef = event.target.value; rerender(); };
rerender();

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSeamCoachPrompt } from '../js/coach/prompts.js';
import {
  isAnswerResponse,
  isExplanationResponse,
  isSuggestionResponse,
  requestCoach,
} from '../js/coach/coach.js';
import { parseCoachResponse, responseFormatForMode } from '../api/coach.js';

const base = { fromChord: { name: 'C Major', notes: [60, 64, 67] }, toChord: { name: 'F Major', notes: [65, 69, 72] }, generatedNotes: [60, 64, 67, 70], evidence: { commonPitchClasses: [0, 5] } };

test('coach prompt includes exact voicings and generated notes', () => {
  const prompt = buildSeamCoachPrompt({ ...base, technique: { id: 'secondaryDom', name: 'Secondary dominant', beatCost: 1 } });
  assert.match(prompt, /\[60, 64, 67\]/); assert.match(prompt, /\[65, 69, 72\]/); assert.match(prompt, /\[60, 64, 67, 70\]/);
});

test('coach prompt forbids key inference and identifies direct transitions', () => {
  const prompt = buildSeamCoachPrompt({ ...base, technique: 'none', generatedNotes: [] });
  assert.match(prompt, /key-signature setting is spelling—not proof/i); assert.match(prompt, /none \(direct transition\)/); assert.match(prompt, /do not invent a technique/i);
});

test('coach prompt carries Tutor mode, learner question, and recent local context', () => {
  const prompt = buildSeamCoachPrompt({
    ...base,
    technique: 'none',
    mode: 'ask',
    question: 'Why does the top voice feel settled?',
    history: [{ role: 'user', content: 'Focus on voice leading.' }],
  });
  assert.match(prompt, /Current Tutor mode: ask/);
  assert.match(prompt, /top voice feel settled/);
  assert.match(prompt, /Focus on voice leading/);
});

test('each Tutor mode requests its own answer structure', () => {
  const explanation = buildSeamCoachPrompt({ ...base, technique: 'none', mode: 'explain' });
  const suggestion = buildSeamCoachPrompt({ ...base, technique: 'none', mode: 'suggest' });
  const answer = buildSeamCoachPrompt({ ...base, technique: 'none', mode: 'ask', question: 'What should I listen for?' });

  assert.match(explanation, /exactly five string fields/i);
  assert.match(explanation, /whatYouHear/);
  assert.match(suggestion, /exactly three string fields/i);
  assert.match(suggestion, /one focused idea, not a list/i);
  assert.doesNotMatch(suggestion, /whatYouHear/);
  assert.match(answer, /natural plain text/i);
  assert.match(answer, /Do not return JSON/i);
  assert.doesNotMatch(answer, /whatYouHear/);
});

test('server selects structured output only for Explain and Suggestions', () => {
  assert.equal(responseFormatForMode('explain').name, 'legato_explanation');
  assert.equal(responseFormatForMode('suggest').name, 'legato_suggestion');
  assert.equal(responseFormatForMode('ask'), null);
});

test('mode-specific coach responses are parsed and validated', () => {
  const explanation = parseCoachResponse(JSON.stringify({
    type: 'explanation',
    whatYouHear: 'A smooth arrival.',
    whyItWorks: 'The top voice moves by step.',
    tryThis: 'Play the outer voices alone.',
    reflect: 'Which note feels most connected?',
  }), 'explain');
  const suggestion = parseCoachResponse(JSON.stringify({
    type: 'suggestion',
    suggestion: 'Move the top note down one octave.',
    reason: 'This reduces the soprano leap.',
  }), 'suggest');
  const answer = parseCoachResponse('Listen first to the highest note in each chord.', 'ask');

  assert.equal(isExplanationResponse(explanation), true);
  assert.equal(isSuggestionResponse(suggestion), true);
  assert.equal(isAnswerResponse(answer), true);
});

test('invalid mode-specific responses produce controlled errors', () => {
  assert.throws(() => parseCoachResponse('not json'), /malformed JSON/);
  assert.throws(() => parseCoachResponse('{"whatYouHear":"x"}', 'explain'), /required explain schema/);
  assert.throws(() => parseCoachResponse('{"suggestion":"x"}', 'suggest'), /required suggest schema/);
  assert.throws(() => parseCoachResponse('   ', 'ask'), /empty answer/);
});

test('client accepts the matching reply envelope and rejects a mode mismatch', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ mode: 'ask', reply: { type: 'answer', answer: 'Listen to the soprano.' } }),
    });
    assert.deepEqual(
      await requestCoach({ mode: 'ask' }),
      { type: 'answer', answer: 'Listen to the soprano.' },
    );

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ mode: 'suggest', reply: { type: 'suggestion', suggestion: 'Try an inversion.', reason: 'It changes the bass.' } }),
    });
    await assert.rejects(() => requestCoach({ mode: 'ask' }), /invalid response/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('client JavaScript contains no API key credential reference', async () => {
  const clientFiles = ['js/main.js', 'js/coach/coach.js', 'js/coach/prompts.js', 'js/ui/piano-modal.js'];
  const contents = await Promise.all(clientFiles.map((path) => readFile(new URL(`../${ path }`, import.meta.url), 'utf8')));
  assert.equal(contents.some((content) => content.includes('OPENAI_API_KEY')), false);
});

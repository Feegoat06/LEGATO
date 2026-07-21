/**
 * Client-side coach wire protocol. Kept isolated from prompt authoring
 * (prompts.js) and evidence extraction (evidence.js) so each layer is testable.
 * The server endpoint is /api/coach.js — the OpenAI key never touches the
 * browser.
 */

export const COACH_MODES = ['explain', 'suggest', 'ask'];

export function normalizeCoachMode(mode) {
  return COACH_MODES.includes(mode) ? mode : 'ask';
}

function hasExactNonEmptyStrings(value, keys) {
  return Boolean(value && typeof value === 'object'
    && Object.keys(value).length === keys.length
    && keys.every((key) => typeof value[key] === 'string' && value[key].trim().length > 0));
}

/** Mode-specific response guards shared with the server endpoint. */
export function isExplanationResponse(value) {
  return hasExactNonEmptyStrings(value, ['type', 'whatYouHear', 'whyItWorks', 'tryThis', 'reflect'])
    && value.type === 'explanation';
}

export function isSuggestionResponse(value) {
  return hasExactNonEmptyStrings(value, ['type', 'suggestion', 'reason'])
    && value.type === 'suggestion';
}

export function isAnswerResponse(value) {
  return hasExactNonEmptyStrings(value, ['type', 'answer'])
    && value.type === 'answer';
}

export function isCoachResponse(value, mode) {
  const safeMode = normalizeCoachMode(mode);
  if (safeMode === 'explain') return isExplanationResponse(value);
  if (safeMode === 'suggest') return isSuggestionResponse(value);
  return isAnswerResponse(value);
}

/**
 * POST the seam payload to /api/coach.js and validate the response.
 * `signal` lets the caller abort (main.js uses a 20s AbortController timeout).
 * Any non-200 or schema-invalid response throws — the caller renders an error.
 */
export async function requestCoach(payload, { signal } = {}) {
  const mode = normalizeCoachMode(payload?.mode);
  const response = await fetch('/api/coach.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The coach could not respond.');
  if (data.mode !== mode || !isCoachResponse(data.reply, mode)) {
    throw new Error('The coach returned an invalid response.');
  }
  return data.reply;
}

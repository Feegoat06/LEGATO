/**
 * Serverless coach endpoint (Vercel Function).
 *
 * Reasons this lives on the server, not the client:
 *   - Holds OPENAI_API_KEY (env var). Key never touches the browser.
 *   - Enforces mode-specific response contracts so the client can trust the shape.
 *   - Turns provider errors into stable status codes for the UI to render.
 *
 * Shares two building blocks with the client to avoid drift:
 *   - `buildSeamCoachPrompt` — the actual prompt text.
 *   - Mode-specific shape guards from `coach.js`.
 */
import { buildSeamCoachPrompt } from '../js/coach/prompts.js';
import {
  isExplanationResponse,
  isSuggestionResponse,
  normalizeCoachMode,
} from '../js/coach/coach.js';

const EXPLANATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'whatYouHear', 'whyItWorks', 'tryThis', 'reflect'],
  properties: {
    type: { type: 'string', enum: ['explanation'] },
    whatYouHear: { type: 'string' },
    whyItWorks: { type: 'string' },
    tryThis: { type: 'string' },
    reflect: { type: 'string' },
  },
};

const SUGGESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'suggestion', 'reason'],
  properties: {
    type: { type: 'string', enum: ['suggestion'] },
    suggestion: { type: 'string' },
    reason: { type: 'string' },
  },
};

function outputText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  return data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
}

export function responseFormatForMode(mode) {
  const safeMode = normalizeCoachMode(mode);
  if (safeMode === 'explain') {
    return { type: 'json_schema', name: 'legato_explanation', strict: true, schema: EXPLANATION_SCHEMA };
  }
  if (safeMode === 'suggest') {
    return { type: 'json_schema', name: 'legato_suggestion', strict: true, schema: SUGGESTION_SCHEMA };
  }
  return null;
}

export function parseCoachResponse(text, mode = 'explain') {
  const safeMode = normalizeCoachMode(mode);
  if (safeMode === 'ask') {
    const answer = typeof text === 'string' ? text.trim() : '';
    if (!answer) throw Object.assign(new Error('The coach returned an empty answer.'), { status: 502 });
    return { type: 'answer', answer };
  }

  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw Object.assign(new Error('The coach returned malformed JSON.'), { status: 502 }); }
  const valid = safeMode === 'suggest'
    ? isSuggestionResponse(parsed)
    : isExplanationResponse(parsed);
  if (!valid) throw Object.assign(new Error(`The coach response did not match the required ${ safeMode } schema.`), { status: 502 });
  return parsed;
}

export async function generateCoachResponse(payload) {
  if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('AI coaching is not configured. Add OPENAI_API_KEY on the server to enable explanations.'), { status: 503 });
  const mode = normalizeCoachMode(payload?.mode);
  const prompt = buildSeamCoachPrompt({ ...payload, mode });
  const format = responseFormatForMode(mode);
  const requestBody = {
    model: process.env.OPENAI_MODEL || 'gpt-5.6',
    input: prompt,
    max_output_tokens: 700,
    ...(format ? { text: { format } } : {}),
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ process.env.OPENAI_API_KEY }` },
    body: JSON.stringify(requestBody),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error?.message || 'OpenAI request failed.'), { status: response.status });
  const text = outputText(data);
  if (!text) throw Object.assign(new Error('OpenAI returned no response.'), { status: 502 });
  return { mode, reply: parseCoachResponse(text, mode) };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  try {
    return response.status(200).json(await generateCoachResponse(request.body));
  } catch (error) {
    return response.status(error.status || 500).json({ error: error.message || 'Coach request failed.' });
  }
}

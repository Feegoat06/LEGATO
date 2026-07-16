import { buildSeamCoachPrompt } from '../js/coach/prompts.js';

export async function generateCoachResponse(payload) {
  if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('OPENAI_API_KEY is not configured.'), { status: 503 });
  const prompt = buildSeamCoachPrompt(payload);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5.6', input: prompt, max_output_tokens: 500 }),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error?.message || 'OpenAI request failed.'), { status: response.status });
  const explanation = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
  if (!explanation) throw Object.assign(new Error('OpenAI returned no explanation.'), { status: 502 });
  return explanation;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  try {
    return response.status(200).json({ explanation: await generateCoachResponse(request.body) });
  } catch (error) {
    return response.status(error.status || 500).json({ error: error.message || 'Coach request failed.' });
  }
}

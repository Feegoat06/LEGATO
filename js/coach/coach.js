export function isCoachResponse(value) {
  const keys = ['whatYouHear', 'whyItWorks', 'tryThis', 'reflect'];
  return Boolean(value && typeof value === 'object'
    && Object.keys(value).length === keys.length
    && keys.every((key) => typeof value[key] === 'string' && value[key].trim().length > 0));
}

export async function requestCoach(payload, { signal } = {}) {
  const response = await fetch('/api/coach.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The coach could not respond.');
  if (!isCoachResponse(data.explanation)) throw new Error('The coach returned an invalid response.');
  return data.explanation;
}

export async function requestCoach(payload, { signal } = {}) {
  const response = await fetch('/api/coach.js', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The coach could not respond.');
  if (!data.explanation) throw new Error('The coach returned an empty response.');
  return data.explanation;
}

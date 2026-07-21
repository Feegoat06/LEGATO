const PROFILE_KEY = 'legato.learnerProfile.v1';
const MAX_RECENT_ATTEMPTS = 24;

export function emptyLearnerProfile() {
  return { version: 1, concepts: {}, recentAttempts: [] };
}

export function loadLearnerProfile(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(PROFILE_KEY) || 'null');
    if (!parsed || parsed.version !== 1 || typeof parsed.concepts !== 'object'
      || !Array.isArray(parsed.recentAttempts)) return emptyLearnerProfile();
    return parsed;
  } catch {
    return emptyLearnerProfile();
  }
}

export function saveLearnerProfile(profile, storage = globalThis.localStorage) {
  try { storage?.setItem(PROFILE_KEY, JSON.stringify(profile)); }
  catch { /* Learning memory is best-effort and must never break composing. */ }
}

export function recordLessonPrediction(profile, lesson, prediction, now = () => Date.now()) {
  const correct = prediction === lesson.correctPrediction;
  const previous = profile.concepts[lesson.concept] ?? { attempts: 0, correct: 0, lastPracticedAt: 0 };
  const attempt = {
    lessonId: lesson.id,
    concept: lesson.concept,
    prediction,
    correct,
    decision: null,
    createdAt: now(),
  };
  return {
    ...profile,
    concepts: {
      ...profile.concepts,
      [lesson.concept]: {
        attempts: previous.attempts + 1,
        correct: previous.correct + (correct ? 1 : 0),
        lastPracticedAt: attempt.createdAt,
      },
    },
    recentAttempts: [...profile.recentAttempts, attempt].slice(-MAX_RECENT_ATTEMPTS),
  };
}

export function recordLessonDecision(profile, lessonId, decision) {
  const recentAttempts = profile.recentAttempts.map((attempt, index, attempts) => (
    attempt.lessonId === lessonId && index === attempts.findLastIndex((entry) => entry.lessonId === lessonId)
      ? { ...attempt, decision }
      : attempt
  ));
  return { ...profile, recentAttempts };
}

export function conceptProgress(profile, concept) {
  return profile.concepts[concept] ?? { attempts: 0, correct: 0, lastPracticedAt: 0 };
}


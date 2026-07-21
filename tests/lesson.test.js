import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLessonCandidate,
  buildSopranoMotionLesson,
  makeLessonComparisonProgression,
} from '../js/coach/lesson.js';
import {
  conceptProgress,
  emptyLearnerProfile,
  recordLessonDecision,
  recordLessonPrediction,
} from '../js/coach/learner-profile.js';

function progression(toNotes = [72, 76, 79]) {
  return {
    settings: { tempo: 100, timeSig: { num: 4, den: 4 }, key: 0, clef: 'auto' },
    chords: [
      { id: 'c1', notes: [60, 64, 67], bars: 1 },
      { id: 'c2', notes: toNotes, bars: 1, hint: { rootMidi: 72, quality: 'Major' } },
    ],
    seams: [null],
  };
}

test('large soprano motion creates a pitch-class-preserving listening lesson', () => {
  const source = progression();
  const lesson = buildSopranoMotionLesson(source, 0);
  assert.ok(lesson);
  assert.equal(lesson.originalMotion, 12);
  assert.ok(Math.abs(lesson.candidateMotion) < Math.abs(lesson.originalMotion));
  assert.deepEqual(lesson.candidateNotes.map((note) => note % 12), [0, 4, 7]);
  assert.deepEqual(source.chords[1].notes, [72, 76, 79]);
});

test('small top-voice motion does not interrupt the learner', () => {
  assert.equal(buildSopranoMotionLesson(progression([60, 64, 67]), 0), null);
});

test('comparison progression is compact and applying a candidate is explicit', () => {
  const source = progression();
  const lesson = buildSopranoMotionLesson(source, 0);
  const comparison = makeLessonComparisonProgression(source, lesson, 'candidate');
  assert.deepEqual(comparison.chords[1].notes, lesson.candidateNotes);
  assert.ok(comparison.chords[0].bars < source.chords[0].bars);

  const applied = applyLessonCandidate(source, lesson);
  assert.deepEqual(applied.chords[1].notes, lesson.candidateNotes);
  assert.deepEqual(source.chords[1].notes, [72, 76, 79]);
  assert.deepEqual(applied.seams, source.seams);
});

test('learner profile records prediction evidence and later decision', () => {
  const lesson = buildSopranoMotionLesson(progression(), 0);
  let profile = recordLessonPrediction(emptyLearnerProfile(), lesson, 'candidate', () => 1234);
  assert.deepEqual(conceptProgress(profile, 'sopranoMotion'), {
    attempts: 1,
    correct: 1,
    lastPracticedAt: 1234,
  });
  profile = recordLessonDecision(profile, lesson.id, 'adopted');
  assert.equal(profile.recentAttempts[0].decision, 'adopted');
});


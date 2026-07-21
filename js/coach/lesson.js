/**
 * Pure helpers for Tenutino's first active-learning loop.
 *
 * The stored progression remains music-only. A lesson is a temporary,
 * reversible proposal derived from exact user voicings; it enters progression
 * state only after the learner explicitly chooses "Use smoother version".
 */
import { closestVoicing } from '../engine/voicing.js';
import { TECHNIQUES } from '../engine/techniques.js';
import { measureLength } from '../state.js';

export const SOPRANO_LEAP_THRESHOLD = 7;

function sortedNotes(notes) {
  return [...notes].sort((a, b) => a - b);
}

function pitchClasses(notes) {
  return [...new Set(notes.map((note) => ((note % 12) + 12) % 12))].sort((a, b) => a - b);
}

function sameValues(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

/**
 * Find a teachable large leap in the user's top voice and prepare a closer
 * octave placement of the arriving harmony for a prediction + A/B exercise.
 * Returns null when the evidence does not support a meaningful improvement.
 */
export function buildSopranoMotionLesson(progression, seamIndex) {
  if (!progression || !Number.isInteger(seamIndex)
    || seamIndex < 0 || seamIndex >= progression.chords.length - 1) return null;

  const fromChord = progression.chords[seamIndex];
  const toChord = progression.chords[seamIndex + 1];
  if (!fromChord?.notes?.length || !toChord?.notes?.length) return null;

  const fromNotes = sortedNotes(fromChord.notes);
  const originalNotes = sortedNotes(toChord.notes);
  const candidateNotes = sortedNotes(closestVoicing(originalNotes, fromNotes));
  const originalMotion = originalNotes.at(-1) - fromNotes.at(-1);
  const candidateMotion = candidateNotes.at(-1) - fromNotes.at(-1);

  if (Math.abs(originalMotion) < SOPRANO_LEAP_THRESHOLD) return null;
  if (Math.abs(candidateMotion) >= Math.abs(originalMotion)) return null;
  if (sameValues(candidateNotes, originalNotes)) return null;
  if (!sameValues(pitchClasses(candidateNotes), pitchClasses(originalNotes))) return null;

  const direction = originalMotion > 0 ? 'upward' : 'downward';
  const id = [
    'soprano-motion', seamIndex,
    fromNotes.join('.'), originalNotes.join('.'), candidateNotes.join('.'),
  ].join(':');

  return {
    id,
    concept: 'sopranoMotion',
    seamIndex,
    targetChordId: toChord.id,
    fromNotes,
    originalNotes,
    candidateNotes,
    originalMotion,
    candidateMotion,
    correctPrediction: 'candidate',
    observation: `The top voice makes a ${ Math.abs(originalMotion) }-semitone ${ direction } leap here.`,
    prompt: 'Which version keeps the top voice closer to where it began?',
  };
}

/** Build a short two-chord progression for contextual A/B playback. */
export function makeLessonComparisonProgression(progression, lesson, variant = 'original') {
  const seamIndex = lesson.seamIndex;
  const fromChord = progression.chords[seamIndex];
  const toChord = progression.chords[seamIndex + 1];
  const techniqueId = progression.seams[seamIndex] ?? null;
  const techniqueCost = techniqueId ? TECHNIQUES[techniqueId]?.beatCost ?? 0 : 0;
  const beatsInMeasure = measureLength(progression.settings.timeSig);
  const departingBeats = Math.max(1.5, techniqueCost + 1);
  const arrivingBeats = Math.max(1, Math.min(2, beatsInMeasure));
  const targetNotes = variant === 'candidate' ? lesson.candidateNotes : lesson.originalNotes;

  return {
    settings: {
      ...progression.settings,
      timeSig: { ...progression.settings.timeSig },
      theme: progression.settings.theme ? { ...progression.settings.theme } : undefined,
    },
    chords: [
      { ...fromChord, id: `${ fromChord.id }-lesson-a`, notes: [...lesson.fromNotes], bars: departingBeats / beatsInMeasure },
      { ...toChord, id: `${ toChord.id }-lesson-b`, notes: [...targetNotes], bars: arrivingBeats / beatsInMeasure },
    ],
    seams: [techniqueId],
  };
}

/** Return a new progression with the learner-approved candidate applied. */
export function applyLessonCandidate(progression, lesson) {
  const chords = progression.chords.map((chord) => chord.id === lesson.targetChordId
    ? { ...chord, notes: [...lesson.candidateNotes] }
    : chord);
  return { ...progression, chords };
}


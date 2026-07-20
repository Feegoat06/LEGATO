export const SUPPORT_MESSAGES = Object.freeze([
  'Take your time. We\u2019ll find the way forward.',
  'Every progression begins with one honest chord.',
  'Your next idea may be closer than it sounds.',
  'Small changes can open beautiful directions.',
  'Let the harmony breathe before deciding where it goes.',
  'There is no rush. Listen for what wants to move.',
  'A thoughtful transition can transform the whole phrase.',
  'Trust your ear. We can refine the details together.',
  'The space between chords is part of the music too.',
  'One clear musical choice is enough to begin.',
  'Give the voices room to find one another.',
  'You bring the idea. We\u2019ll shape the journey together.',
  'Every unexpected note can become a new direction.',
  'Listen closely. The smoothest path is often nearby.',
  'Your progression does not need to hurry toward resolution.',
  'A gentle adjustment may be all the music needs.',
  'Stay curious. Each chord leaves several doors open.',
  'We can explore the transition one voice at a time.',
  'The next measure is another chance to surprise yourself.',
  'Let\u2019s turn the space between chords into something expressive.',
]);

export function pickSupportMessage(random = Math.random) {
  const candidate = random();
  const value = Number.isFinite(candidate) ? candidate : 0;
  const index = Math.min(
    SUPPORT_MESSAGES.length - 1,
    Math.max(0, Math.floor(value * SUPPORT_MESSAGES.length)),
  );
  return SUPPORT_MESSAGES[index];
}

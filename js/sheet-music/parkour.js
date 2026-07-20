/** Geometry shared by VexFlow layout and Tenutino's playback movement. */

const STAFF_TOP_LINE = 5;
const OBSTACLE_LEFT_PAD = 18;
const OBSTACLE_RIGHT_PAD = 22;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert one rendered chord's highest VexFlow staff line into a collision
 * zone. Any notehead protruding above the top staff line becomes an obstacle:
 * shallow protrusions get a compact jump, while taller material gets a
 * higher jump.
 */
export function createParkourObstacle(keyProps, absoluteX, lineGap = 10) {
  const lines = keyProps
    .map((key) => Number(key?.line))
    .filter(Number.isFinite);
  if (!lines.length || !Number.isFinite(absoluteX)) return null;

  const highestLine = Math.max(...lines);
  const intrusion = (highestLine - STAFF_TOP_LINE) * lineGap / 2;
  if (intrusion <= 0) return null;

  return {
    left: absoluteX - OBSTACLE_LEFT_PAD,
    right: absoluteX + OBSTACLE_RIGHT_PAD,
    jumpHeight: clamp(20 + intrusion * 1.25, 22, 42),
    mode: 'jump',
    highestLine,
    // Useful when visually inspecting layout data in browser tooling.
    heightAboveStaff: Math.max(0, (highestLine - STAFF_TOP_LINE) * lineGap / 2),
  };
}

/**
 * Resolve a smooth takeoff/landing arc for the character's horizontal center.
 * Multiple close notes may overlap; the arc requiring the most clearance wins.
 */
export function resolveParkourMotion(obstacles = [], centerX, characterSize, {
  minCenter = -Infinity,
  maxCenter = Infinity,
} = {}) {
  if (!Number.isFinite(centerX) || !Number.isFinite(characterSize)) {
    return { active: false, lift: 0, rotation: 0, mode: null, phase: 0 };
  }

  // A generous takeoff matters most in measure one: the first note can sit
  // close to the clef, leaving only a few pixels before collision. Clamp the
  // arc to the playable path so it begins exactly at the measure entrance.
  const approach = characterSize * 1.25;
  const landing = characterSize * 0.9;
  let best = null;

  for (const obstacle of obstacles) {
    const start = Math.max(minCenter, obstacle.left - approach);
    const end = Math.min(maxCenter, obstacle.right + landing);
    if (centerX < start || centerX > end || end <= start) continue;
    const phase = clamp((centerX - start) / (end - start), 0, 1);
    const lift = Math.sin(Math.PI * phase) * obstacle.jumpHeight;
    if (!best || lift > best.lift) best = { obstacle, phase, lift };
  }

  if (!best) return { active: false, lift: 0, rotation: 0, mode: null, phase: 0 };
  const { obstacle, phase, lift } = best;
  const rotation = -Math.sin(phase * Math.PI * 2) * 9;
  return {
    active: true,
    lift,
    rotation,
    mode: obstacle.mode,
    phase,
  };
}

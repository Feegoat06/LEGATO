import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createParkourObstacle,
  resolveParkourMotion,
} from '../js/sheet-music/parkour.js';

test('notes on or below the top staff line do not create parkour obstacles', () => {
  assert.equal(createParkourObstacle([{ line: 3 }, { line: 5 }], 120, 10), null);
});

test('partially protruding notes and taller clusters both become jumps', () => {
  const jump = createParkourObstacle([{ line: 5.5 }], 120, 10);
  const tallJump = createParkourObstacle([{ line: 7 }], 180, 10);

  assert.equal(jump.mode, 'jump');
  assert.equal(jump.left, 102);
  assert.equal(jump.right, 142);
  assert.ok(jump.jumpHeight >= 22);
  assert.equal(tallJump.mode, 'jump');
  assert.ok(tallJump.jumpHeight > jump.jumpHeight);
});

test('parkour motion follows a smooth arc and clears outside the obstacle', () => {
  const obstacle = { left: 100, right: 140, jumpHeight: 32, mode: 'jump' };
  const approach = 46 * 1.25;
  const landing = 46 * 0.9;
  const apexX = ((obstacle.left - approach) + (obstacle.right + landing)) / 2;
  const apex = resolveParkourMotion([obstacle], apexX, 46);

  assert.equal(apex.active, true);
  assert.equal(apex.mode, 'jump');
  assert.ok(Math.abs(apex.lift - 32) < 0.001);
  assert.ok(Math.abs(apex.rotation) < 0.001);
  assert.equal(resolveParkourMotion([obstacle], 10, 46).active, false);
  assert.equal(resolveParkourMotion([obstacle], 240, 46).active, false);
});

test('the first obstacle gets a full takeoff from the measure entrance', () => {
  const firstChord = { left: 69, right: 90, jumpHeight: 26, mode: 'jump' };
  const pathStart = 33;
  const pathEnd = 347;
  const entrance = resolveParkourMotion([firstChord], pathStart, 46, {
    minCenter: pathStart,
    maxCenter: pathEnd,
  });
  const shortlyAfterEntrance = resolveParkourMotion([firstChord], 50, 46, {
    minCenter: pathStart,
    maxCenter: pathEnd,
  });

  assert.equal(entrance.active, true);
  assert.equal(entrance.phase, 0);
  assert.ok(shortlyAfterEntrance.lift > 0);
  assert.ok(shortlyAfterEntrance.phase > 0.1);
});

test('the tallest overlapping obstacle controls the jump clearance', () => {
  const motion = resolveParkourMotion([
    { left: 100, right: 140, jumpHeight: 24, mode: 'jump' },
    { left: 100, right: 140, jumpHeight: 40, mode: 'jump' },
  ], 120, 46);
  assert.equal(motion.mode, 'jump');
  assert.ok(motion.lift > 30);
});

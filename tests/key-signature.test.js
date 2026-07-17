import test from 'node:test';
import assert from 'node:assert/strict';
import { applyKeySignature } from '../js/engine/key-signature.js';

test('a sharp key moves only its named natural degrees', () => {
  assert.deepEqual(applyKeySignature([60, 65, 67, 66], 1), [60, 66, 67, 66]);
  assert.deepEqual(applyKeySignature([60, 65, 67], 2), [61, 66, 67]);
});

test('a flat key moves only its named natural degrees', () => {
  assert.deepEqual(applyKeySignature([59, 64, 69, 68], -3), [58, 63, 68, 68]);
});

test('C key leaves material unchanged', () => {
  assert.deepEqual(applyKeySignature([60, 61, 65, 66], 0), [60, 61, 65, 66]);
});

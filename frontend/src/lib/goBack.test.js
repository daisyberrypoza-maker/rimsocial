import test from 'node:test';
import assert from 'node:assert/strict';
import { goBack } from './goBack.js';

test('uses in-app history when a previous router entry exists', () => {
  globalThis.window = { history: { state: { idx: 2 }, length: 1 } };
  const calls = [];
  goBack((...args) => calls.push(args), '/fallback');
  assert.deepEqual(calls, [[-1]]);
});

test('replaces with fallback for a direct entry even when browser history has outside entries', () => {
  globalThis.window = { history: { state: { idx: 0 }, length: 8 } };
  const calls = [];
  goBack((...args) => calls.push(args), '/fallback');
  assert.deepEqual(calls, [['/fallback', { replace: true }]]);
});

test('uses fallback when router index is unavailable', () => {
  globalThis.window = { history: { state: null, length: 8 } };
  const calls = [];
  goBack((...args) => calls.push(args));
  assert.deepEqual(calls, [['/', { replace: true }]]);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Extract generateSequenceParams from chromascope.js by evaluating just the function
const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '..', 'chromascope.js'), 'utf-8');

// Pull out the function definition (it's a standalone function, not attached to DOM)
const fnMatch = src.match(/function generateSequenceParams\(\) \{[\s\S]*?\n\}/);
if (!fnMatch) throw new Error('Could not extract generateSequenceParams from chromascope.js');
const generateSequenceParams = new Function(`${fnMatch[0]}\nreturn generateSequenceParams;`)();

const REQUIRED_KEYS = [
  'hFreq1', 'hFreq2', 'vFreq1', 'vFreq2',
  'waveH1', 'waveH2', 'waveV1', 'waveV2',
  'xmod', 'columns',
  'colourOffset1', 'colourOffset2', 'colourOffset3',
  'lozengeDepth', 'speed1', 'speed2',
  'mirror', 'feedback',
];

test('returns an object with all required keys', () => {
  const params = generateSequenceParams();
  for (const key of REQUIRED_KEYS) {
    assert.ok(key in params, `missing key: ${key}`);
  }
});

test('all values are finite numbers', () => {
  const params = generateSequenceParams();
  for (const [key, value] of Object.entries(params)) {
    assert.equal(typeof value, 'number', `${key} should be a number`);
    assert.ok(Number.isFinite(value), `${key} should be finite, got ${value}`);
  }
});

test('frequencies are positive', () => {
  // Run multiple times to exercise different code paths
  for (let i = 0; i < 100; i++) {
    const params = generateSequenceParams();
    assert.ok(params.hFreq1 > 0, `hFreq1 should be positive: ${params.hFreq1}`);
    assert.ok(params.hFreq2 > 0, `hFreq2 should be positive: ${params.hFreq2}`);
    assert.ok(params.vFreq1 > 0, `vFreq1 should be positive: ${params.vFreq1}`);
    assert.ok(params.vFreq2 > 0, `vFreq2 should be positive: ${params.vFreq2}`);
  }
});

test('feedback is in valid range (0-1)', () => {
  for (let i = 0; i < 100; i++) {
    const params = generateSequenceParams();
    assert.ok(params.feedback >= 0 && params.feedback <= 1,
      `feedback out of range: ${params.feedback}`);
  }
});

test('waveform types are valid (0, 1, or 3)', () => {
  const valid = new Set([0, 1, 3]);
  for (let i = 0; i < 100; i++) {
    const params = generateSequenceParams();
    assert.ok(valid.has(params.waveH1), `waveH1 invalid: ${params.waveH1}`);
    assert.ok(valid.has(params.waveH2), `waveH2 invalid: ${params.waveH2}`);
    assert.ok(valid.has(params.waveV1), `waveV1 invalid: ${params.waveV1}`);
    assert.ok(valid.has(params.waveV2), `waveV2 invalid: ${params.waveV2}`);
  }
});

test('speed values are positive', () => {
  for (let i = 0; i < 100; i++) {
    const params = generateSequenceParams();
    assert.ok(params.speed1 > 0, `speed1 should be positive: ${params.speed1}`);
    assert.ok(params.speed2 > 0, `speed2 should be positive: ${params.speed2}`);
  }
});

test('successive calls produce different params (randomness check)', () => {
  const a = generateSequenceParams();
  const b = generateSequenceParams();
  // Extremely unlikely that all frequencies match
  const same = a.hFreq1 === b.hFreq1 && a.vFreq1 === b.vFreq1 &&
               a.hFreq2 === b.hFreq2 && a.vFreq2 === b.vFreq2;
  assert.ok(!same, 'two successive calls should not produce identical params');
});

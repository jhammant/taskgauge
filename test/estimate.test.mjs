import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateComplexity } from '../src/estimate.mjs';

const cases = [
  ['fix typo', 'trivial'],
  ['rename a variable', 'trivial'],
  ['format README.md', 'trivial'],
  ['bump the patch version', 'trivial'],
  ['add a status endpoint', 'simple'],
  ['fix the login issue', 'simple'],
  ['investigate payment failures', 'moderate'],
  ['debug why the cache misses requests', 'moderate'],
  ['add validation, then update the documentation, then run the tests', 'moderate'],
  ['rewrite the whole parser', 'hard'],
  ['refactor auth across 12 files, keep tests green', 'hard'],
  ['migrate src/store.mjs and test/store.test.mjs, then run the tests', 'hard'],
  ['figure out why prod is flaky', 'open-ended'],
  ['somehow redesign the whole deployment system', 'open-ended'],
];

test('classifies a table of lexical task examples', async (t) => {
  for (const [task, expectedTier] of cases) {
    await t.test(task, () => {
      assert.equal(estimateComplexity(task).tier, expectedTier);
    });
  }
});

test('returns a bounded score and transparent fired signals', () => {
  const estimate = estimateComplexity(
    'refactor src/auth.mjs and test/auth.test.mjs, then run the tests',
  );

  assert.ok(estimate.score >= 0 && estimate.score <= 100);
  assert.ok(estimate.signals.some(({ name }) => name === 'length'));
  assert.ok(estimate.signals.some(({ name }) => name === 'high-effort verb'));
  assert.ok(estimate.signals.some(({ name }) => name === 'scope breadth'));
  assert.ok(estimate.signals.some(({ name }) => name === 'acceptance check'));
  assert.ok(estimate.signals.some(({ name }) => name === 'step count'));
  assert.ok(estimate.signals.every(({ weight }) => Number.isFinite(weight)));
});

test('is deterministic and does not share mutable result state', () => {
  const first = estimateComplexity('rename a variable');
  const second = estimateComplexity('rename a variable');

  assert.deepEqual(first, second);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.signals, second.signals);
});

test('rejects non-string tasks', () => {
  assert.throws(() => estimateComplexity(null), /task must be a string/);
});

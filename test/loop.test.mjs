import test from 'node:test';
import assert from 'node:assert/strict';
import { executeExpand } from '../src/loop.mjs';

test('escalates through low tiers and succeeds at tier 3', async () => {
  const invoked = [];
  const response = await executeExpand({
    task: 'rename a variable',
    tiers: [1, 2, 3, 4],
    maxTier: 4,
    run: async (tier) => {
      invoked.push(tier);
      return { tier, output: `attempt-${tier}` };
    },
    verify: async (result) => result.tier >= 3,
  });

  assert.deepEqual(invoked, [1, 2, 3]);
  assert.deepEqual(response.result, { tier: 3, output: 'attempt-3' });
  assert.equal(response.tierUsed, 3);
  assert.equal(response.acrr, 3);
  assert.deepEqual(response.attempts, [
    { tier: 1, passed: false },
    { tier: 2, passed: false },
    { tier: 3, passed: true },
  ]);
});

test('starts at the estimated tier when named tiers are supplied', async () => {
  const invoked = [];
  const response = await executeExpand({
    task: 'refactor auth across 12 files, keep tests green',
    tiers: ['trivial', 'simple', 'moderate', 'hard', 'open-ended'],
    run: async (tier) => {
      invoked.push(tier);
      return tier;
    },
    verify: async () => true,
  });

  assert.deepEqual(invoked, ['hard']);
  assert.equal(response.tierUsed, 'hard');
  assert.equal(response.acrr, 1);
});

test('escalates after a callback throws and records the error', async () => {
  const response = await executeExpand({
    task: 'rename a variable',
    tiers: [1, 2],
    run: async (tier) => {
      if (tier === 1) throw new Error('agent failed');
      return 'ok';
    },
    verify: async (result) => result === 'ok',
  });

  assert.deepEqual(response.attempts, [
    { tier: 1, passed: false, error: { name: 'Error', message: 'agent failed' } },
    { tier: 2, passed: true },
  ]);
});

test('honors maxTier and exposes attempts on terminal failure', async () => {
  await assert.rejects(
    executeExpand({
      task: 'rename a variable',
      tiers: [1, 2, 3],
      maxTier: 2,
      run: async (tier) => tier,
      verify: async () => false,
    }),
    (error) => {
      assert.equal(error.name, 'TaskGaugeExecutionError');
      assert.equal(error.tierUsed, 2);
      assert.equal(error.acrr, 2);
      assert.deepEqual(error.attempts, [
        { tier: 1, passed: false },
        { tier: 2, passed: false },
      ]);
      return true;
    },
  );
});

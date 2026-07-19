import test from 'node:test';
import assert from 'node:assert/strict';
import { planEffort } from '../src/plan.mjs';

function quota(headroom, parallelism = 8) {
  return {
    headroom,
    advice: { parallelism, modelTier: 'top', thinkingEffort: 'high' },
  };
}

const headrooms = ['abundant', 'comfortable', 'constrained', 'critical'];
const tasks = {
  trivial: 'rename a variable',
  moderate: 'investigate payment failures',
  hard: 'refactor auth across 12 files, keep tests green',
  'open-ended': 'figure out why prod is flaky',
};

test('difficulty by headroom matrix preserves complexity baselines and quota caps', async (t) => {
  for (const [difficulty, task] of Object.entries(tasks)) {
    for (const headroom of headrooms) {
      await t.test(`${difficulty} / ${headroom}`, () => {
        const plan = planEffort({ task, quota: quota(headroom) });

        if (difficulty === 'trivial') {
          assert.equal(plan.model, 'small');
          assert.equal(plan.effort, 'low');
          assert.equal(plan.parallelism, 1);
        }
        if (difficulty === 'moderate') {
          assert.equal(plan.model, 'mid');
          assert.equal(plan.effort, 'medium');
        }
        if (difficulty === 'hard' || difficulty === 'open-ended') {
          assert.equal(plan.model, 'top');
          assert.equal(plan.effort, 'high');
        }
        if (headroom === 'critical') {
          assert.equal(plan.parallelism, 1);
          assert.equal(plan.retryBudget, 0);
        }
        assert.equal(typeof plan.rationale, 'string');
        assert.ok(!plan.rationale.includes('\n'));
      });
    }
  }
});

test('an abundant top-tier quota never upgrades a trivial task', () => {
  assert.deepEqual(
    planEffort({ task: 'rename a variable', quota: quota('abundant') }),
    {
      model: 'small',
      effort: 'low',
      parallelism: 1,
      retryBudget: 0,
      rationale: 'trivial task (score 8) uses a small model with low effort; abundant quota does not increase spend for low-complexity work.',
    },
  );
});

test('hard work is clamped under constrained and critical quota', () => {
  const task = 'refactor auth across 12 files, keep tests green';

  assert.deepEqual(
    {
      parallelism: planEffort({ task, quota: quota('constrained') }).parallelism,
      retryBudget: planEffort({ task, quota: quota('constrained') }).retryBudget,
    },
    { parallelism: 2, retryBudget: 1 },
  );
  assert.deepEqual(
    {
      parallelism: planEffort({ task, quota: quota('critical') }).parallelism,
      retryBudget: planEffort({ task, quota: quota('critical') }).retryBudget,
    },
    { parallelism: 1, retryBudget: 0 },
  );
});

test('missing and invalid quota headroom use comfortable defaults', () => {
  const task = 'rewrite the whole parser';
  assert.deepEqual(planEffort({ task }), planEffort({ task, quota: null }));
  assert.deepEqual(
    planEffort({ task }),
    planEffort({ task, quota: { headroom: 'unknown' } }),
  );
});

test('quotamax advice can apply a stricter parallelism cap', () => {
  const plan = planEffort({
    task: 'refactor auth across 12 files, keep tests green',
    quota: quota('abundant', 2),
  });
  assert.equal(plan.parallelism, 2);
});

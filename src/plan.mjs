import { estimateComplexity } from './estimate.mjs';

const BASELINES = {
  trivial: { model: 'small', effort: 'low', parallelism: 1, retryBudget: 0 },
  simple: { model: 'small', effort: 'low', parallelism: 1, retryBudget: 1 },
  moderate: { model: 'mid', effort: 'medium', parallelism: 2, retryBudget: 2 },
  hard: { model: 'top', effort: 'high', parallelism: 4, retryBudget: 3 },
  'open-ended': { model: 'top', effort: 'high', parallelism: 6, retryBudget: 4 },
};

const HEADROOM_LIMITS = {
  abundant: { parallelism: Number.POSITIVE_INFINITY, retryBudget: 4 },
  comfortable: { parallelism: 4, retryBudget: 3 },
  constrained: { parallelism: 2, retryBudget: 1 },
  critical: { parallelism: 1, retryBudget: 0 },
};

function normalizeQuota(quota) {
  const headroom = Object.hasOwn(HEADROOM_LIMITS, quota?.headroom)
    ? quota.headroom
    : 'comfortable';
  const advisedParallelism = Number.isFinite(quota?.advice?.parallelism)
    ? Math.max(1, Math.trunc(quota.advice.parallelism))
    : Number.POSITIVE_INFINITY;

  return { headroom, advisedParallelism };
}

/**
 * Choose model effort from task complexity, then cap costly dimensions by quota.
 *
 * @param {{task: string, quota?: object|null}} input
 * @returns {{model: string, effort: string, parallelism: number, retryBudget: number, rationale: string}}
 */
export function planEffort({ task, quota = null } = {}) {
  const estimate = estimateComplexity(task);
  const baseline = BASELINES[estimate.tier];
  const { headroom, advisedParallelism } = normalizeQuota(quota);
  const limits = HEADROOM_LIMITS[headroom];
  const parallelism = Math.min(
    baseline.parallelism,
    limits.parallelism,
    advisedParallelism,
  );
  const retryBudget = Math.min(baseline.retryBudget, limits.retryBudget);

  const lowComplexity = estimate.tier === 'trivial' || estimate.tier === 'simple';
  const quotaClause = lowComplexity && headroom === 'abundant'
    ? 'abundant quota does not increase spend for low-complexity work'
    : `${headroom} quota allows parallelism ${parallelism} and ${retryBudget} retries`;
  const rationale = `${estimate.tier} task (score ${estimate.score}) uses a ${baseline.model} model with ${baseline.effort} effort; ${quotaClause}.`;

  return {
    model: baseline.model,
    effort: baseline.effort,
    parallelism,
    retryBudget,
    rationale,
  };
}

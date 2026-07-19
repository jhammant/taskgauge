import { estimateComplexity } from './estimate.mjs';

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'Error', message: String(error) };
}

/**
 * Execute a task at an estimated tier and expand until verification succeeds.
 * ACRR is approximated as tiers attempted / 1 because the true minimum successful
 * tier is unknowable without rerunning the task at every lower tier.
 *
 * @param {{task: string, tiers: Array<unknown>, run: Function, verify: Function, maxTier?: unknown}} input
 * @returns {Promise<{result: unknown, tierUsed: unknown, acrr: number, attempts: Array<{tier: unknown, passed: boolean, error?: {name: string, message: string}}>} >}
 */
export async function executeExpand({ task, tiers, run, verify, maxTier } = {}) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new TypeError('tiers must be a non-empty array');
  }
  if (typeof run !== 'function') throw new TypeError('run must be a function');
  if (typeof verify !== 'function') throw new TypeError('verify must be a function');

  const ceiling = maxTier === undefined
    ? tiers.length - 1
    : tiers.findIndex((tier) => Object.is(tier, maxTier));
  if (ceiling < 0) {
    throw new RangeError('maxTier must be present in tiers');
  }

  const suggestedTier = estimateComplexity(task).tier;
  const suggestedIndex = tiers.findIndex((tier) => tier === suggestedTier);
  const startIndex = Math.min(suggestedIndex < 0 ? 0 : suggestedIndex, ceiling);
  const attempts = [];
  let lastResult;

  for (let index = startIndex; index <= ceiling; index += 1) {
    const tier = tiers[index];
    const attempt = { tier, passed: false };

    try {
      lastResult = await run(tier);
      attempt.passed = Boolean(await verify(lastResult));
    } catch (error) {
      attempt.error = serializeError(error);
    }

    attempts.push(attempt);

    if (attempt.passed) {
      return {
        result: lastResult,
        tierUsed: tier,
        acrr: attempts.length,
        attempts,
      };
    }
  }

  const tierUsed = tiers[ceiling];
  const error = new Error(`verification failed through max tier ${String(tierUsed)}`);
  error.name = 'TaskGaugeExecutionError';
  error.result = lastResult;
  error.tierUsed = tierUsed;
  error.acrr = attempts.length;
  error.attempts = attempts;
  throw error;
}

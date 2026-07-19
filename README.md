# taskgauge

`taskgauge` is a deterministic, complexity-aware effort governor for coding agents.
It estimates how difficult a particular task is, then recommends how much model,
thinking effort, parallelism, and retry budget to spend. It has zero runtime
dependencies and supports Node.js 18 or newer.

The project implements the **E3 loop (Estimate → Execute → Expand)** described in
*Do AI Agents Know When a Task Is Simple?* ([arXiv:2607.13034](https://arxiv.org/abs/2607.13034)).
The estimator is intentionally local and lexical: it makes reproducible decisions
without a model call or network access.

## Install and use

Install the package, or run the repository's CLI directly with Node:

```sh
npm install taskgauge
taskgauge estimate "refactor auth across 12 files, keep tests green"
taskgauge estimate "figure out why prod is flaky" --json
taskgauge plan "rename a variable" --quota '{"headroom":"abundant","advice":{"parallelism":8,"modelTier":"top","thinkingEffort":"high"}}'
```

`estimate` prints the selected `trivial`, `simple`, `moderate`, `hard`, or
`open-ended` tier, a score from 0 to 100, and every lexical signal that contributed
to it. `plan` maps that complexity to `small`, `mid`, or `top` model capacity and
`low`, `medium`, or `high` thinking effort. Quota can reduce parallelism and retry
budget, but abundant quota never turns a typo or rename into an expensive run.

Add `--json` to either command for machine-readable output. `taskgauge --version`
reads the installed package version.

## JavaScript API

The package root exports all three library functions:

```js
import { estimateComplexity, planEffort, executeExpand } from 'taskgauge';

const estimate = estimateComplexity('migrate the whole cache layer');
const plan = planEffort({
  task: 'migrate the whole cache layer',
  quota: {
    headroom: 'comfortable',
    advice: { parallelism: 4, modelTier: 'top', thinkingEffort: 'high' },
  },
});
```

`planEffort` treats a missing or unrecognized quota as `comfortable`. Complexity
sets the model and effort baseline; quota headroom and its advised parallelism cap
the costly parallelism and retry dimensions.

The generic E3 harness takes injected runner and verifier callbacks:

```js
const outcome = await executeExpand({
  task: 'rename a variable',
  tiers: [1, 2, 3],
  run: async (tier) => runAgentAtTier(tier),
  verify: async (result) => result.testsPassed,
  maxTier: 3,
});
```

It begins at the named tier suggested by the estimator when that tier exists in
`tiers`; otherwise it begins at the lowest supplied tier. Failed runs or
verifications expand to the next tier through `maxTier`. Each attempt records its
tier and verification result. Because the true minimal successful tier is not
observable without counterfactual reruns, `acrr` approximates the Agent Cognitive
Redundancy Ratio as `tiers attempted / 1`. If verification still fails at
`maxTier`, the harness throws a `TaskGaugeExecutionError` carrying `result`,
`tierUsed`, `acrr`, and `attempts`.

## TokenMaxing and quotamax integration

A TokenMaxing burner can ask `taskgauge` for an effort recommendation immediately
before each agent run:

```js
import { planEffort } from 'taskgauge';

const recommendation = planEffort({ task: workItem.prompt, quota: quotaSnapshot });
await burner.run({
  ...workItem,
  modelTier: recommendation.model,
  thinkingEffort: recommendation.effort,
  parallelism: recommendation.parallelism,
  retryBudget: recommendation.retryBudget,
});
```

The two tools provide complementary lenses: `quotamax agent` measures quota
headroom, while `taskgauge plan` measures the task and converts both inputs into a
right-sized run. If `quotamax` is installed, `--live` fetches its current JSON
advice automatically:

```sh
taskgauge plan "refactor the session store" --live
```

If the command is unavailable or fails, taskgauge reports the fallback on standard
error and plans with `comfortable` headroom. The same data can be passed explicitly
or piped through standard input:

```sh
quotamax agent --json | taskgauge plan "refactor the session store" --quota-stdin
```

## Development

```sh
npm test
```

The suite uses Node's built-in `node:test` runner; no install step or third-party
test framework is required.

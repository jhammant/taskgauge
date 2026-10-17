# taskgauge — build spec

A complexity-aware **effort governor** for coding agents. It answers a question
`quotamax` cannot: *how hard is THIS task, and therefore how much model / effort /
parallelism should I spend on it?* It implements the E3 loop (Estimate → Execute →
Expand) from the paper "Do AI Agents Know When a Task Is Simple?" (arxiv 2607.13034).

`quotamax` sizes spend by **quota headroom**; `taskgauge` sizes it by **task
difficulty**. Together: spend proportional to *both*.

**Stack:** Node ≥18, ESM (`"type":"module"`), ZERO runtime dependencies, `node --test`.
This is a standalone repo (`~/dev/oss/taskgauge`) that *integrates with* quotamax but does
not depend on it being installed.

---

## Build these modules

### `src/estimate.mjs` — export `estimateComplexity(task: string): {tier, score, signals}`
Deterministic, no network. Classify a task description into a difficulty tier and a
0–100 score from lexical signals only:
- **tiers:** `trivial | simple | moderate | hard | open-ended`
- **signals to weigh** (return the list that fired, for transparency):
  - length (word count; longer → harder)
  - low-effort verbs → lower: `typo, rename, comment, bump, format, lint, tweak`
  - high-effort verbs → higher: `refactor, redesign, migrate, architect, rewrite, integrate, debug, investigate`
  - file/scope breadth: mentions of "across N files", "the whole", "every", multiple paths
  - explicit acceptance check present ("run the tests", "so X passes") → slightly lower risk
  - ambiguity markers ("figure out", "somehow", "explore", vague nouns) → higher
  - step count (enumerated lists, "then", "and then")
- Return `{ tier, score, signals: [{name, weight}] }`. Pure function, fully unit-testable.

### `src/plan.mjs` — export `planEffort({task, quota}): {model, effort, parallelism, retryBudget, rationale}`
Combine complexity with quota headroom.
- `quota` is the shape `quotamax agent --json` returns:
  `{ headroom: 'abundant'|'comfortable'|'constrained'|'critical', advice: {parallelism, modelTier, thinkingEffort} }`
  (accept a `null`/missing quota → treat as 'comfortable').
- Rule: **complexity sets the baseline effort; quota caps/adjusts it.**
  - trivial/simple → smallest model + low effort **regardless** of headroom (don't waste Opus on a typo)
  - moderate → mid model/effort
  - hard/open-ended → top model + high effort, BUT clamp `parallelism` and `retryBudget` down when headroom is `constrained`/`critical`
- Emit a one-line `rationale` explaining the pick (like quotamax does).

### `src/loop.mjs` — export `async executeExpand({task, tiers, run, verify, maxTier}): {result, tierUsed, acrr, attempts}`
Generic Estimate→Execute→Expand harness (the paper's core):
1. start at the tier `estimateComplexity` suggests (or the lowest tier),
2. `await run(tier)` → `await verify(result)`,
3. on failure, escalate to the next tier and retry (bounded by `maxTier`),
4. compute **ACRR** (Agent Cognitive Redundancy Ratio): `tierUsed / minimalTierThatWouldHaveWorked`. Since we can't know the true minimum, approximate as `tiersAttempted / 1` and expose attempts so callers can track over/under-provisioning. Document the approximation.
`run` and `verify` are injected callbacks (so this is testable with fakes; no real agent needed).

### `src/cli.mjs` — `#!/usr/bin/env node`, ESM
- `taskgauge estimate "<task>"` → prints tier + score + signals
- `taskgauge plan "<task>" [--live | --quota '<json>']` → prints the recommendation.
  `--live` shells out to `quotamax agent --json` (via `child_process`) to fetch real headroom; if quotamax isn't installed or errors, fall back to 'comfortable' and say so.
- `--json` on any command for machine output.
- `taskgauge --version` reads version from package.json.

### Integration notes (put in README.md)
- How TokenMaxing's burner would `import { planEffort } from 'taskgauge'` before each run.
- How it pairs with quotamax (`quotamax agent` = quota lens; `taskgauge plan` = task lens).
- A `quotamax agent --json | taskgauge plan "<task>" --quota-stdin` style pipe example (implement `--quota-stdin` too).

## Tests (`test/*.test.mjs`, `node --test`)
- `estimate`: a table of ≥12 example tasks → expected tier (typo→trivial; "refactor auth across 12 files, keep tests green"→hard; "figure out why prod is flaky"→open-ended; etc.).
- `plan`: difficulty × headroom matrix — assert trivial stays cheap even when abundant, and hard clamps parallelism when critical.
- `loop`: fake run/verify that fails at low tiers and passes at tier 3 → assert escalation, tierUsed, acrr, attempts.

## Deliverables
- `package.json` (name `taskgauge`, `bin`, `files: [src, README.md]`, `scripts.test`), `src/*`, `test/*`, `README.md` (with the E3/arxiv provenance), `.gitignore`.
- **Acceptance:** `npm test` green; the two example estimates above classify correctly; `node src/cli.mjs plan "rename a variable" --quota '{"headroom":"abundant","advice":{"parallelism":8,"modelTier":"top","thinkingEffort":"high"}}'` still recommends a *small* model.

Work in this directory only. Do not push. Leave a SUMMARY.md with what you built + how you verified.

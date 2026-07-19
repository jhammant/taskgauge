import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

function runCli(args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [cli, ...args],
      options,
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );

    if (input !== undefined) child.stdin.end(input);
  });
}

test('estimate --json emits parseable machine output', async () => {
  const { stdout } = await runCli([
    'estimate',
    'figure out why prod is flaky',
    '--json',
  ]);
  const output = JSON.parse(stdout);

  assert.equal(output.tier, 'open-ended');
  assert.equal(typeof output.score, 'number');
  assert.ok(Array.isArray(output.signals));
});

test('plan keeps a rename cheap despite abundant top-tier quota', async () => {
  const quota = JSON.stringify({
    headroom: 'abundant',
    advice: { parallelism: 8, modelTier: 'top', thinkingEffort: 'high' },
  });
  const { stdout } = await runCli([
    'plan',
    'rename a variable',
    '--quota',
    quota,
    '--json',
  ]);
  const output = JSON.parse(stdout);

  assert.equal(output.model, 'small');
  assert.equal(output.effort, 'low');
  assert.equal(output.parallelism, 1);
});

test('--quota-stdin accepts a quotamax-style pipe', async () => {
  const { stdout } = await runCli([
    'plan',
    'rewrite the whole parser',
    '--quota-stdin',
    '--json',
  ], JSON.stringify({
      headroom: 'critical',
      advice: { parallelism: 8, modelTier: 'top', thinkingEffort: 'high' },
    }));
  const output = JSON.parse(stdout);

  assert.equal(output.model, 'top');
  assert.equal(output.parallelism, 1);
  assert.equal(output.retryBudget, 0);
});

test('--version reads package.json', async () => {
  const { stdout } = await runCli(['--version']);
  assert.equal(stdout.trim(), '0.1.0');
});

test('--version --json emits a JSON version object', async () => {
  const { stdout } = await runCli(['--version', '--json']);
  assert.deepEqual(JSON.parse(stdout), { version: '0.1.0' });
});

test('--live reports and survives an unavailable quotamax command', async () => {
  const { stdout, stderr } = await runCli(
    ['plan', 'investigate payment failures', '--live', '--json'],
    undefined,
    { env: { ...process.env, PATH: '' } },
  );

  assert.equal(JSON.parse(stdout).model, 'mid');
  assert.match(stderr, /quotamax unavailable/);
  assert.match(stderr, /using comfortable headroom/);
});

#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { estimateComplexity } from './estimate.mjs';
import { planEffort } from './plan.mjs';

const execFile = promisify(execFileCallback);

const HELP = `Usage:
  taskgauge estimate "<task>" [--json]
  taskgauge plan "<task>" [--live | --quota '<json>' | --quota-stdin] [--json]
  taskgauge --version

Options:
  --live         Read quota headroom from quotamax agent --json
  --quota JSON   Use the supplied quotamax-compatible quota JSON
  --quota-stdin  Read quotamax-compatible quota JSON from standard input
  --json         Emit machine-readable JSON
  --help         Show this help`;

function writeLine(stream, value) {
  stream.write(`${value}\n`);
}

function parseJson(value, source) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`invalid JSON from ${source}: ${error.message}`);
  }
}

async function readStdin(stream) {
  let input = '';
  for await (const chunk of stream) input += chunk;
  return input;
}

async function fetchLiveQuota() {
  const { stdout } = await execFile('quotamax', ['agent', '--json'], {
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
  return parseJson(stdout, 'quotamax');
}

async function packageVersion() {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  return packageJson.version;
}

function printEstimate(estimate, stdout, json) {
  if (json) {
    writeLine(stdout, JSON.stringify(estimate));
    return;
  }

  writeLine(stdout, `Tier: ${estimate.tier}`);
  writeLine(stdout, `Score: ${estimate.score}/100`);
  writeLine(stdout, 'Signals:');
  for (const signal of estimate.signals) {
    const weight = signal.weight > 0 ? `+${signal.weight}` : String(signal.weight);
    writeLine(stdout, `  - ${signal.name}: ${weight}`);
  }
}

function printPlan(plan, stdout, json) {
  if (json) {
    writeLine(stdout, JSON.stringify(plan));
    return;
  }

  writeLine(stdout, `Model: ${plan.model}`);
  writeLine(stdout, `Effort: ${plan.effort}`);
  writeLine(stdout, `Parallelism: ${plan.parallelism}`);
  writeLine(stdout, `Retry budget: ${plan.retryBudget}`);
  writeLine(stdout, `Rationale: ${plan.rationale}`);
}

function parsePlanArguments(args) {
  const positional = [];
  let live = false;
  let quotaText;
  let quotaStdin = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--live') {
      live = true;
    } else if (argument === '--quota') {
      if (index + 1 >= args.length) throw new Error('--quota requires a JSON value');
      quotaText = args[index + 1];
      index += 1;
    } else if (argument === '--quota-stdin') {
      quotaStdin = true;
    } else if (argument.startsWith('--')) {
      throw new Error(`unknown option: ${argument}`);
    } else {
      positional.push(argument);
    }
  }

  const sources = Number(live) + Number(quotaText !== undefined) + Number(quotaStdin);
  if (sources > 1) {
    throw new Error('use only one of --live, --quota, or --quota-stdin');
  }
  if (positional.length === 0) throw new Error('plan requires a task description');

  return { task: positional.join(' '), live, quotaText, quotaStdin };
}

/** Run the taskgauge command line interface. */
export async function main(
  argv = process.argv.slice(2),
  { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = {},
) {
  const json = argv.includes('--json');
  const args = argv.filter((argument) => argument !== '--json');

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    writeLine(stdout, HELP);
    return;
  }
  if (args[0] === '--version' || args[0] === '-v') {
    const version = await packageVersion();
    writeLine(stdout, json ? JSON.stringify({ version }) : version);
    return;
  }

  const [command, ...commandArgs] = args;
  if (command === 'estimate') {
    if (commandArgs.some((argument) => argument.startsWith('--'))) {
      throw new Error(`unknown option: ${commandArgs.find((argument) => argument.startsWith('--'))}`);
    }
    if (commandArgs.length === 0) throw new Error('estimate requires a task description');
    printEstimate(estimateComplexity(commandArgs.join(' ')), stdout, json);
    return;
  }

  if (command === 'plan') {
    const parsed = parsePlanArguments(commandArgs);
    let quota = null;

    if (parsed.quotaText !== undefined) {
      quota = parseJson(parsed.quotaText, '--quota');
    } else if (parsed.quotaStdin) {
      quota = parseJson(await readStdin(stdin), 'standard input');
    } else if (parsed.live) {
      try {
        quota = await fetchLiveQuota();
      } catch (error) {
        writeLine(
          stderr,
          `taskgauge: quotamax unavailable (${error.message}); using comfortable headroom`,
        );
      }
    }

    printPlan(planEffort({ task: parsed.task, quota }), stdout, json);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((error) => {
    writeLine(process.stderr, `taskgauge: ${error.message}`);
    process.exitCode = 1;
  });
}

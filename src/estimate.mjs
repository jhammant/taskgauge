const LOW_EFFORT_VERBS = [
  'typo',
  'rename',
  'comment',
  'bump',
  'format',
  'lint',
  'tweak',
];

const HIGH_EFFORT_VERBS = [
  'refactor',
  'redesign',
  'migrate',
  'architect',
  'rewrite',
  'integrate',
  'debug',
  'investigate',
];

const VAGUE_NOUNS = [
  'thing',
  'things',
  'stuff',
  'something',
  'issue',
  'issues',
  'problem',
  'problems',
  'changes',
  'behavior',
  'functionality',
];

function countWords(task) {
  return task.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function containsWord(text, word) {
  return new RegExp(`\\b${word}\\b`, 'i').test(text);
}

function countMatches(text, values) {
  return values.reduce((count, value) => count + Number(containsWord(text, value)), 0);
}

function lengthWeight(wordCount) {
  if (wordCount <= 4) return -10;
  if (wordCount <= 12) return 0;
  if (wordCount <= 24) return 8;
  if (wordCount <= 49) return 16;
  return 25;
}

function scopeBreadthWeight(task) {
  let weight = 0;
  const acrossFiles = task.match(/\bacross\s+(\d+)\s+files?\b/i);

  if (acrossFiles) {
    const fileCount = Number(acrossFiles[1]);
    weight = fileCount >= 10 ? 30 : fileCount >= 5 ? 24 : 18;
  }

  if (/\b(?:the\s+whole|every)\b/i.test(task)) {
    weight = Math.max(weight, 22);
  }

  const pathPattern = /(?:\.{0,2}\/|\/)?(?:[\w.-]+\/)+[\w.-]+|\b[\w.-]+\.(?:[cm]?js|mjs|ts|tsx|jsx|json|md|css|scss|html|ya?ml|toml|py|rb|go|rs|java|kt|swift)\b/gi;
  const distinctPaths = new Set(task.match(pathPattern) ?? []);
  if (distinctPaths.size >= 2) {
    weight = Math.max(weight, Math.min(18, 10 + (distinctPaths.size - 2) * 3));
  }

  return weight;
}

function acceptanceWeight(task) {
  const patterns = [
    /\brun\s+(?:the\s+)?tests?\b/i,
    /\bkeep\s+(?:the\s+)?tests?\s+green\b/i,
    /\b(?:tests?|ci|build)\s+(?:still\s+)?pass(?:es|ing)?\b/i,
    /\bso\s+.+?\s+pass(?:es)?\b/i,
    /\bensure\s+.+?\s+pass(?:es)?\b/i,
  ];
  return patterns.some((pattern) => pattern.test(task)) ? -6 : 0;
}

function ambiguityWeight(task) {
  let weight = 0;

  if (/\bfigure\s+out\b/i.test(task)) weight = Math.max(weight, 52);
  if (/\bsomehow\b/i.test(task)) weight = Math.max(weight, 34);
  if (/\bexplore\b/i.test(task)) weight = Math.max(weight, 30);

  const vagueNounCount = countMatches(task, VAGUE_NOUNS);
  if (vagueNounCount > 0) {
    weight += Math.min(16, 10 + (vagueNounCount - 1) * 3);
  }

  return weight;
}

function stepWeight(task) {
  const listMarkers = task.match(/^\s*(?:\d+[.)]|[-*])\s+/gm)?.length ?? 0;
  const connectors = task.match(/\b(?:and\s+then|then)\b/gi)?.length ?? 0;
  const transitions = Math.max(0, listMarkers - 1) + connectors;
  return Math.min(24, transitions * 8);
}

function tierForScore(score) {
  if (score < 20) return 'trivial';
  if (score < 40) return 'simple';
  if (score < 60) return 'moderate';
  if (score < 80) return 'hard';
  return 'open-ended';
}

/**
 * Estimate task complexity from deterministic lexical signals.
 *
 * @param {string} task
 * @returns {{tier: 'trivial'|'simple'|'moderate'|'hard'|'open-ended', score: number, signals: Array<{name: string, weight: number}>}}
 */
export function estimateComplexity(task) {
  if (typeof task !== 'string') {
    throw new TypeError('task must be a string');
  }

  const signals = [];
  const wordCount = countWords(task);
  signals.push({ name: 'length', weight: lengthWeight(wordCount) });

  const lowEffortCount = countMatches(task, LOW_EFFORT_VERBS);
  if (lowEffortCount > 0) {
    signals.push({
      name: 'low-effort verb',
      weight: Math.max(-20, -14 - (lowEffortCount - 1) * 3),
    });
  }

  const highEffortCount = countMatches(task, HIGH_EFFORT_VERBS);
  if (highEffortCount > 0) {
    signals.push({
      name: 'high-effort verb',
      weight: Math.min(30, 18 + (highEffortCount - 1) * 6),
    });
  }

  const scopeWeight = scopeBreadthWeight(task);
  if (scopeWeight !== 0) {
    signals.push({ name: 'scope breadth', weight: scopeWeight });
  }

  const checkWeight = acceptanceWeight(task);
  if (checkWeight !== 0) {
    signals.push({ name: 'acceptance check', weight: checkWeight });
  }

  const vagueWeight = ambiguityWeight(task);
  if (vagueWeight !== 0) {
    signals.push({ name: 'ambiguity', weight: vagueWeight });
  }

  const stepsWeight = stepWeight(task);
  if (stepsWeight !== 0) {
    signals.push({ name: 'step count', weight: stepsWeight });
  }

  const rawScore = signals.reduce((score, signal) => score + signal.weight, 32);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    tier: tierForScore(score),
    score,
    signals,
  };
}

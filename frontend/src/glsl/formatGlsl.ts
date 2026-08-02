/**
 * Lightweight GLSL pretty-printer:
 * - Indent from `{}` / `()` / `[]` nesting (so multi-line calls indent)
 * - Collapse excess blank lines and messy internal whitespace
 * - Keep `// @*` directives and `#` preprocessor lines at column 0
 */

const INDENT = '  ';

const DIRECTIVE_RE = /^\s*\/\/\s*@(in|out|type|fin|fout)\b/;

function isDirectiveOrPreproc(trimmed: string): boolean {
  return DIRECTIVE_RE.test(trimmed) || trimmed.startsWith('#');
}

type ScanMode = 'code' | 'lineComment' | 'blockComment' | 'string';

interface ScanState {
  mode: ScanMode;
  quote: string;
}

function makeScanState(): ScanState {
  return { mode: 'code', quote: '' };
}

/**
 * Walk `line` updating `state` (for multi-line block comments) and calling
 * `onCode(ch, index)` for each character in code mode.
 */
function scanLine(
  line: string,
  state: ScanState,
  onCode?: (ch: string, i: number) => void,
): void {
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    const n = line[i + 1];

    if (state.mode === 'lineComment') {
      break;
    }
    if (state.mode === 'blockComment') {
      if (c === '*' && n === '/') {
        state.mode = 'code';
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (state.mode === 'string') {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === state.quote) {
        state.mode = 'code';
        state.quote = '';
      }
      i += 1;
      continue;
    }

    // code
    if (c === '/' && n === '/') {
      state.mode = 'lineComment';
      break;
    }
    if (c === '/' && n === '*') {
      state.mode = 'blockComment';
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      state.mode = 'string';
      state.quote = c;
      i += 1;
      continue;
    }
    onCode?.(c, i);
    i += 1;
  }
  if (state.mode === 'lineComment') state.mode = 'code';
}

function nestDelta(line: string, state: ScanState): number {
  let delta = 0;
  scanLine(line, state, (ch) => {
    if (ch === '{' || ch === '(' || ch === '[') delta += 1;
    else if (ch === '}' || ch === ')' || ch === ']') delta -= 1;
  });
  return delta;
}

/** How many leading closers (`}` / `)` / `]`) before other code. */
function leadingClosers(trimmed: string): number {
  let n = 0;
  for (const ch of trimmed) {
    if (ch === '}' || ch === ')' || ch === ']') n += 1;
    else break;
  }
  return n;
}

/**
 * Collapse runs of whitespace to a single space outside strings/comments,
 * and ensure a space after `,` when the next token is not a closer.
 */
function tidySpaces(line: string): string {
  let out = '';
  let i = 0;
  let mode: ScanMode = 'code';
  let quote = '';

  const pushSpace = () => {
    if (out.length && out[out.length - 1] !== ' ') out += ' ';
  };

  while (i < line.length) {
    const c = line[i];
    const n = line[i + 1];

    if (mode === 'blockComment') {
      out += c;
      if (c === '*' && n === '/') {
        out += '/';
        mode = 'code';
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (mode === 'string') {
      out += c;
      if (c === '\\' && i + 1 < line.length) {
        out += line[i + 1];
        i += 2;
        continue;
      }
      if (c === quote) {
        mode = 'code';
        quote = '';
      }
      i += 1;
      continue;
    }

    if (c === '/' && n === '/') {
      pushSpace();
      out += line.slice(i);
      break;
    }
    if (c === '/' && n === '*') {
      pushSpace();
      out += '/*';
      mode = 'blockComment';
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      mode = 'string';
      quote = c;
      out += c;
      i += 1;
      continue;
    }

    if (c === ' ' || c === '\t') {
      pushSpace();
      i += 1;
      continue;
    }

    if (c === ',') {
      // Trim space before comma: `foo ,` → `foo,`
      if (out.endsWith(' ')) out = out.slice(0, -1);
      out += ',';
      i += 1;
      // Space after comma unless next is closer or end / another comma
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
      const next = line[i];
      if (
        next &&
        next !== ')' &&
        next !== ']' &&
        next !== '}' &&
        next !== ',' &&
        next !== ';'
      ) {
        out += ' ';
      }
      continue;
    }

    out += c;
    i += 1;
  }

  return out.trimEnd();
}

/** Format a node body or preamble. Idempotent for already-clean input. */
export function formatGlsl(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let depth = 0;
  let blankRun = 0;
  const scan = makeScanState();

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (!trimmed) {
      blankRun += 1;
      if (blankRun <= 1 && scan.mode !== 'blockComment') out.push('');
      continue;
    }
    blankRun = 0;

    if (isDirectiveOrPreproc(trimmed) && scan.mode === 'code') {
      out.push(trimmed);
      continue;
    }

    const tidied = tidySpaces(trimmed);
    const closers = leadingClosers(tidied);
    const indentDepth = Math.max(0, depth - closers);

    out.push(INDENT.repeat(indentDepth) + tidied);
    depth = Math.max(0, depth + nestDelta(tidied, scan));
  }

  while (out.length && out[0] === '') out.shift();
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.length ? out.join('\n') + '\n' : '';
}

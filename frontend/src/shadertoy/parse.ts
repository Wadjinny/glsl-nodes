import type { GLSLType } from '../types';

const VALUE_TYPES = new Set<string>([
  'float',
  'vec2',
  'vec3',
  'vec4',
  'mat2',
  'mat3',
  'void',
  'int',
  'bool',
  'mat4',
]);

export interface ParsedParam {
  qualifier: 'in' | 'out' | 'inout' | null;
  type: string;
  name: string;
}

export interface ParsedFunction {
  returnType: string;
  name: string;
  params: ParsedParam[];
  /** Body without outer braces. */
  body: string;
  start: number;
  end: number;
}

export interface ParsedShaderToy {
  defines: string[];
  globals: string[];
  functions: ParsedFunction[];
}

/**
 * Replace comments with spaces (same length) so indices stay aligned with the
 * original source. Strings are preserved so comment markers inside them stay.
 */
function maskComments(src: string): string {
  const out = src.split('');
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') {
        out[i] = ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && n === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i < src.length) {
        if (src[i] === '*' && src[i + 1] === '/') {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 2;
          break;
        }
        out[i] = src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
      if (i < src.length) i++;
      continue;
    }
    i++;
  }
  return out.join('');
}

function findMatching(
  masked: string,
  openIdx: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  for (let i = openIdx; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseParams(paramStr: string): ParsedParam[] {
  const params: ParsedParam[] = [];
  const parts = splitTopLevel(paramStr, ',');
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const m = /^(?:(in|out|inout)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(
      p,
    );
    if (!m) continue;
    params.push({
      qualifier: (m[1] as 'in' | 'out' | 'inout' | undefined) ?? null,
      type: m[2],
      name: m[3],
    });
  }
  return params;
}

/** Split on delimiter at paren/bracket depth 0. */
function splitTopLevel(s: string, delim: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === delim && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

const FN_START =
  /\b(void|float|vec2|vec3|vec4|mat2|mat3|mat4|int|bool)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

/**
 * Parse top-level `#define`s, globals, and functions from ShaderToy-style GLSL.
 * Commented-out code is ignored via a comment mask.
 */
export function parseShaderToy(source: string): ParsedShaderToy {
  const masked = maskComments(source);
  const defines: string[] = [];
  const functions: ParsedFunction[] = [];
  const consumed = new Array<boolean>(masked.length).fill(false);

  // #define lines (masked still has #define text)
  {
    const re = /^[ \t]*#define[^\n]*/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked))) {
      const line = source.slice(m.index, m.index + m[0].length).trimEnd();
      defines.push(line);
      for (let i = m.index; i < m.index + m[0].length; i++) consumed[i] = true;
    }
  }

  // Functions
  FN_START.lastIndex = 0;
  let fm: RegExpExecArray | null;
  while ((fm = FN_START.exec(masked))) {
    const start = fm.index;
    if (consumed[start]) continue;
    // Must be at top level (not inside a previous function body).
    // Skip if any unconsumed `{` depth from earlier — we mark whole functions consumed.
    const parenOpen = fm.index + fm[0].length - 1;
    const parenClose = findMatching(masked, parenOpen, '(', ')');
    if (parenClose < 0) continue;

    let j = parenClose + 1;
    while (j < masked.length && /[ \t\r\n]/.test(masked[j])) j++;
    if (masked[j] !== '{') continue;

    const braceClose = findMatching(masked, j, '{', '}');
    if (braceClose < 0) continue;

    const returnType = fm[1];
    const name = fm[2];
    const paramStr = source.slice(parenOpen + 1, parenClose);
    const body = source.slice(j + 1, braceClose);
    functions.push({
      returnType,
      name,
      params: parseParams(paramStr),
      body,
      start,
      end: braceClose + 1,
    });
    for (let i = start; i <= braceClose; i++) consumed[i] = true;
    FN_START.lastIndex = braceClose + 1;
  }

  // Remaining top-level declarations (e.g. `float rep = .04;`)
  const globals: string[] = [];
  {
    const leftover = masked
      .split('')
      .map((ch, i) => (consumed[i] ? (ch === '\n' ? '\n' : ' ') : ch))
      .join('');
    const declRe =
      /\b(?:float|vec2|vec3|vec4|mat2|mat3|mat4|int|bool)\s+[A-Za-z_][A-Za-z0-9_]*\s*(?:=\s*[^;]+)?;/g;
    let dm: RegExpExecArray | null;
    while ((dm = declRe.exec(leftover))) {
      const text = source.slice(dm.index, dm.index + dm[0].length).trim();
      if (text) globals.push(text);
    }
  }

  return { defines, globals, functions };
}

export function isSupportedSocketType(t: string): t is GLSLType {
  return (
    t === 'float' ||
    t === 'vec2' ||
    t === 'vec3' ||
    t === 'vec4' ||
    t === 'mat2' ||
    t === 'mat3'
  );
}

export function isKnownValueType(t: string): boolean {
  return VALUE_TYPES.has(t);
}

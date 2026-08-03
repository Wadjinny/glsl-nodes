/**
 * Rewrite statement calls to former void(inout) helpers into assignments:
 *   DrawVignette(c, uv);  →  c = DrawVignette(c, uv);
 */

const LVALUE_RE =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function splitTopLevelArgs(argStr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(argStr.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(argStr.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function findMatchingParen(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length - 1 && !(src[i] === '*' && src[i + 1] === '/')) {
        i += 1;
      }
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      i += 1;
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i += 1;
        i += 1;
      }
      continue;
    }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * For each callee in `assignArgByCallee`, rewrite statement-form calls so the
 * inout argument receives the function's return value.
 */
export function rewriteInoutCallSites(
  code: string,
  assignArgByCallee: ReadonlyMap<string, number>,
): { code: string; warnings: string[] } {
  if (assignArgByCallee.size === 0) return { code, warnings: [] };

  const warnings: string[] = [];
  const names = [...assignArgByCallee.keys()].sort((a, b) => b.length - a.length);
  const nameRe = new RegExp(
    `\\b(${names.map(escapeRe).join('|')})\\s*\\(`,
    'g',
  );

  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const n = code[i + 1];

    if (c === '/' && n === '/') {
      const end = code.indexOf('\n', i);
      const stop = end < 0 ? code.length : end;
      out += code.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end < 0 ? code.length : end + 2;
      out += code.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < code.length && code[j] !== q) {
        if (code[j] === '\\') j += 1;
        j += 1;
      }
      if (j < code.length) j += 1;
      out += code.slice(i, j);
      i = j;
      continue;
    }

    nameRe.lastIndex = i;
    const m = nameRe.exec(code);
    if (!m || m.index !== i) {
      out += c;
      i += 1;
      continue;
    }

    const fnName = m[1];
    const argIndex = assignArgByCallee.get(fnName);
    if (argIndex === undefined) {
      out += c;
      i += 1;
      continue;
    }

    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findMatchingParen(code, openIdx);
    if (closeIdx < 0) {
      out += c;
      i += 1;
      continue;
    }

    let after = closeIdx + 1;
    while (after < code.length && /[ \t\r\n]/.test(code[after])) after += 1;
    if (code[after] !== ';') {
      // Expression-form call — leave as-is.
      out += code.slice(m.index, closeIdx + 1);
      i = closeIdx + 1;
      continue;
    }

    const argStr = code.slice(openIdx + 1, closeIdx);
    const args = splitTopLevelArgs(argStr);
    if (argIndex >= args.length) {
      warnings.push(
        `Could not rewrite ${fnName}(...): missing argument ${argIndex}.`,
      );
      out += code.slice(m.index, after + 1);
      i = after + 1;
      continue;
    }

    const lval = args[argIndex];
    if (!LVALUE_RE.test(lval)) {
      warnings.push(
        `Could not rewrite ${fnName}(${lval}, …): first inout arg is not a simple lvalue.`,
      );
      out += code.slice(m.index, after + 1);
      i = after + 1;
      continue;
    }

    const call = code.slice(m.index, closeIdx + 1);
    out += `${lval} = ${call};`;
    i = after + 1;
  }

  return { code: out, warnings };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find calls to `known` function names inside a GLSL body.
 * Skips the body's own definition name when provided.
 */
export function findCallees(
  body: string,
  known: ReadonlySet<string>,
  selfName?: string,
): string[] {
  if (known.size === 0) return [];
  const masked = maskCommentsAndStrings(body);
  const found = new Set<string>();
  const re = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const name = m[1];
    if (selfName && name === selfName) continue;
    if (known.has(name)) found.add(name);
  }
  return [...found];
}

function maskCommentsAndStrings(src: string): string {
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

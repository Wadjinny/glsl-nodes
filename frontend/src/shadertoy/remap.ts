import type { GLSLType } from '../types';
import { formatGlsl } from '../glsl/formatGlsl';
import {
  isSupportedSocketType,
  type ParsedFunction,
  type ParsedParam,
} from './parse';

const UNSUPPORTED_BUILTIN_RE =
  /\b(iChannel\d*|iDate|iFrame|iSampleRate|iChannelTime|iChannelResolution)\b/;

/**
 * Remap ShaderToy builtins to glsl-nodes names. Longer / more specific
 * replacements first so `.xy` / `.z` forms win over bare identifiers.
 */
export function remapBuiltins(code: string): {
  code: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (UNSUPPORTED_BUILTIN_RE.test(code)) {
    warnings.push(
      'Unsupported ShaderToy builtins detected (iChannel / iDate / iFrame / …); left as-is and may fail to compile.',
    );
  }

  let out = code;
  const reps: Array<[RegExp, string]> = [
    [/\biResolution\.xy\b/g, 'resolution'],
    [/\biResolution\.x\b/g, 'resolution.x'],
    [/\biResolution\.y\b/g, 'resolution.y'],
    [/\biResolution\.z\b/g, '1.0'],
    [/\biResolution\b/g, 'resolution'],
    [/\biMouse\.xy\b/g, 'mouse'],
    [/\biMouse\.zw\b/g, 'vec2(0.0)'],
    [/\biMouse\.x\b/g, 'mouse.x'],
    [/\biMouse\.y\b/g, 'mouse.y'],
    [/\biMouse\b/g, 'mouse'],
    [/\biTime\b/g, 'time'],
  ];
  for (const [re, to] of reps) out = out.replace(re, to);

  if (/\biResolution\b/.test(code) && !/\biResolution\.(xy|[xyz])\b/.test(code)) {
    warnings.push(
      'Bare iResolution remapped to vec2 resolution (ShaderToy uses vec3).',
    );
  }

  return { code: out, warnings };
}

export interface ConvertedFunction {
  name: string;
  /** Node GLSL body including // @in / // @out / // @type directives. */
  glsl: string;
  outType: GLSLType;
  /** True when this is a `@type func` definition node. */
  isFunc: boolean;
  warnings: string[];
  skipped?: string;
}

function inParams(params: ParsedParam[]): ParsedParam[] {
  return params.filter((p) => p.qualifier !== 'out' && p.qualifier !== 'inout');
}

function buildValueDirectives(
  params: ParsedParam[],
  outType: GLSLType,
  callees: string[],
): { headers: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const headers: string[] = [];
  for (const p of params) {
    if (!isSupportedSocketType(p.type)) {
      warnings.push(
        `Parameter ${p.name}: unsupported type '${p.type}' (skipped socket).`,
      );
      continue;
    }
    headers.push(`// @in ${p.type} ${p.name}`);
  }
  for (const c of callees) {
    headers.push(`// @in func ${c}`);
  }
  headers.push(`// @out ${outType}`);
  return { headers, warnings };
}

function buildFuncDirectives(
  params: ParsedParam[],
  outType: GLSLType,
  callees: string[],
): { headers: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const headers: string[] = ['// @type func'];
  for (const c of callees) {
    headers.push(`// @fin func ${c}`);
  }
  for (const p of params) {
    if (!isSupportedSocketType(p.type)) {
      warnings.push(
        `Parameter ${p.name}: unsupported type '${p.type}' (skipped socket).`,
      );
      continue;
    }
    headers.push(`// @fin ${p.type} ${p.name}`);
  }
  headers.push(`// @fout ${outType}`);
  return { headers, warnings };
}

/**
 * Convert a parsed function into a node GLSL body.
 * Helpers become `@type func` nodes; `mainImage` stays a value node.
 * `callees` are other imported functions this body calls → `@fin func` wires.
 */
export function convertFunction(
  fn: ParsedFunction,
  callees: string[] = [],
): ConvertedFunction {
  const warnings: string[] = [];

  if (fn.name === 'mainImage') {
    return convertMainImage(fn, callees);
  }

  if (fn.returnType === 'void') {
    return {
      name: fn.name,
      glsl: '',
      outType: 'float',
      isFunc: true,
      warnings,
      skipped: `Skipped void function '${fn.name}' (not mainImage).`,
    };
  }

  if (!isSupportedSocketType(fn.returnType)) {
    return {
      name: fn.name,
      glsl: '',
      outType: 'float',
      isFunc: true,
      warnings,
      skipped: `Skipped '${fn.name}': unsupported return type '${fn.returnType}'.`,
    };
  }

  const outs = fn.params.filter(
    (p) => p.qualifier === 'out' || p.qualifier === 'inout',
  );
  if (outs.length) {
    return {
      name: fn.name,
      glsl: '',
      outType: fn.returnType,
      isFunc: true,
      warnings,
      skipped: `Skipped '${fn.name}': out/inout parameters are not supported.`,
    };
  }

  const params = inParams(fn.params);
  const { headers, warnings: dw } = buildFuncDirectives(
    params,
    fn.returnType,
    callees,
  );
  warnings.push(...dw);

  const remapped = remapBuiltins(fn.body);
  warnings.push(...remapped.warnings);

  const glsl = formatGlsl([...headers, '', remapped.code.trim()].join('\n'));
  return {
    name: fn.name,
    glsl,
    outType: fn.returnType,
    isFunc: true,
    warnings,
  };
}

function convertMainImage(
  fn: ParsedFunction,
  callees: string[],
): ConvertedFunction {
  const warnings: string[] = [];
  const outParam =
    fn.params.find((p) => p.qualifier === 'out' && p.type === 'vec4') ??
    fn.params.find((p) => p.qualifier === 'out');

  const outName = outParam?.name ?? 'fragColor';
  const outType: GLSLType =
    outParam && isSupportedSocketType(outParam.type) ? outParam.type : 'vec4';

  const params = inParams(fn.params);
  const { headers, warnings: dw } = buildValueDirectives(
    params,
    outType,
    callees,
  );
  warnings.push(...dw);

  const remapped = remapBuiltins(fn.body);
  warnings.push(...remapped.warnings);

  const body = remapped.code.trim();
  const wrapped = [
    `${outType} ${outName};`,
    body,
    `return ${outName};`,
  ].join('\n');

  const glsl = formatGlsl([...headers, '', wrapped].join('\n'));
  return {
    name: fn.name,
    glsl,
    outType,
    isFunc: false,
    warnings,
  };
}

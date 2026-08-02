import type { Edge } from '@xyflow/react';
import {
  parseFuncSignature,
  parseInputs,
  parseOutput,
} from '../compiler/parseInputs';
import { makeOutputNode, nextId, type RFNode } from '../nodes/library';
import { findCallees } from './callGraph';
import { parseShaderToy } from './parse';
import { convertFunction, remapBuiltins } from './remap';

export interface ImportShaderToyResult {
  name: string;
  nodes: RFNode[];
  edges: Edge[];
  preamble: string;
  warnings: string[];
}

const COL_W = 240;
const ROW_H = 130;

/**
 * Parse ShaderToy GLSL into a replaceable graph: helpers as `@type func`
 * nodes, value `mainImage`, `func` wires for calls, mainImage → Output.
 */
export function importShaderToyGraph(source: string): ImportShaderToyResult {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('Paste is empty.');

  const parsed = parseShaderToy(trimmed);
  if (parsed.functions.length === 0) {
    throw new Error('No top-level functions found in the paste.');
  }

  const warnings: string[] = [];
  const preambleParts: string[] = [];

  for (const d of parsed.defines) {
    const remapped = remapBuiltins(d);
    preambleParts.push(remapped.code);
    warnings.push(...remapped.warnings);
  }
  for (const g of parsed.globals) {
    const remapped = remapBuiltins(g);
    preambleParts.push(remapped.code);
    warnings.push(...remapped.warnings);
  }

  const preamble = preambleParts.join('\n');

  const importedNames = new Set(parsed.functions.map((f) => f.name));

  type Built = {
    fnName: string;
    glsl: string;
    outType: ReturnType<typeof convertFunction>['outType'];
    isFunc: boolean;
    callees: string[];
  };
  const built: Built[] = [];

  for (const fn of parsed.functions) {
    const bodyRemap = remapBuiltins(fn.body);
    const callees = findCallees(bodyRemap.code, importedNames, fn.name);
    const converted = convertFunction(fn, callees);
    warnings.push(...converted.warnings);
    if (converted.skipped) {
      warnings.push(converted.skipped);
      continue;
    }
    built.push({
      fnName: fn.name,
      glsl: converted.glsl,
      outType: converted.outType,
      isFunc: converted.isFunc,
      callees,
    });
  }

  if (built.length === 0) {
    throw new Error('No importable functions (all skipped).');
  }

  const byName = new Map(built.map((b) => [b.fnName, b]));

  // Longest-path layers: callees left, callers right.
  const layer = new Map<string, number>();
  for (const b of built) layer.set(b.fnName, 0);
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of built) {
      for (const callee of b.callees) {
        if (!byName.has(callee)) continue;
        const next = (layer.get(callee) ?? 0) + 1;
        if (next > (layer.get(b.fnName) ?? 0)) {
          layer.set(b.fnName, next);
          changed = true;
        }
      }
    }
  }

  const maxLayer = Math.max(0, ...layer.values());
  const stackInLayer = new Map<number, number>();

  const fnNodes: RFNode[] = [];
  const idByName = new Map<string, string>();
  let mainNode: RFNode | null = null;

  for (const b of built) {
    const out = parseOutput(b.glsl);
    const id = nextId('st');
    idByName.set(b.fnName, id);

    const L = layer.get(b.fnName) ?? 0;
    const stack = stackInLayer.get(L) ?? 0;
    stackInLayer.set(L, stack + 1);

    const sig = parseFuncSignature(b.glsl);

    const node: RFNode = {
      id,
      type: 'shader',
      position: {
        x: 40 + L * COL_W,
        y: 40 + stack * ROW_H,
      },
      data: {
        kind: `st_${b.fnName}`,
        label: b.fnName,
        glsl: b.glsl,
        glslName: b.fnName,
        inputs: parseInputs(b.glsl),
        outputs: [
          {
            id: 'out',
            name: out?.name ?? 'out',
            type: out?.type ?? (b.isFunc ? 'func' : b.outType),
          },
        ],
        ...(sig.length ? { funcSignature: sig } : {}),
      },
    };

    fnNodes.push(node);
    if (b.fnName === 'mainImage') mainNode = node;
  }

  if (!mainNode) {
    mainNode =
      [...fnNodes]
        .reverse()
        .find((n) => n.data.outputs[0]?.type === 'vec4') ?? null;
    if (mainNode) {
      warnings.push(
        `No mainImage; wiring '${mainNode.data.label}' to Output.`,
      );
    } else {
      warnings.push('No mainImage or vec4 output found; Output is unwired.');
    }
  }

  if (mainNode) {
    const entryLayer = maxLayer + 1;
    mainNode.position = {
      x: 40 + entryLayer * COL_W,
      y: mainNode.position.y,
    };
  }

  const output = makeOutputNode(
    nextId('output'),
    40 + (maxLayer + 2) * COL_W,
    mainNode?.position.y ?? 160,
  );
  const nodes = [...fnNodes, output];

  const edges: Edge[] = [];

  // func wires: callee.func → caller.@fin func <name> (or legacy @in func)
  const seen = new Set<string>();
  for (const b of built) {
    const callerId = idByName.get(b.fnName);
    if (!callerId) continue;
    for (const callee of b.callees) {
      const calleeId = idByName.get(callee);
      if (!calleeId) continue;
      const key = `${calleeId}->${callerId}:${callee}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        id: nextId('e'),
        source: calleeId,
        sourceHandle: 'out',
        target: callerId,
        targetHandle: callee,
      });
    }
  }

  if (mainNode) {
    edges.push({
      id: nextId('e'),
      source: mainNode.id,
      sourceHandle: 'out',
      target: output.id,
      targetHandle: 'color',
    });
  }

  return {
    name: 'shadertoy-import',
    nodes,
    edges,
    preamble,
    warnings: [...new Set(warnings.filter(Boolean))],
  };
}

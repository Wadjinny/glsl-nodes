import type { Edge } from '@xyflow/react';
import { parseInputs, parseOutput, parseFuncSignature } from './compiler/parseInputs';
import {
  makeColorNode,
  makeInputNode,
  makeOutputNode,
  makeSliderNode,
  makeVec2Node,
  type RFNode,
} from './nodes/library';
import { clamp, type GLSLType } from './types';

/** On-disk / localStorage project format. Bump when the shape changes. */
export const PROJECT_VERSION = 1;

export interface ProjectFile {
  app: 'glsl-nodes';
  version: number;
  name: string;
  /** Shared GLSL preamble (defines / globals). Optional for older files. */
  preamble?: string;
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id?: string;
    source: string;
    sourceHandle?: string | null;
    target: string;
    targetHandle?: string | null;
    data?: Record<string, unknown>;
    className?: string;
    style?: Record<string, unknown>;
  }>;
}

export function serializeProject(
  name: string,
  nodes: RFNode[],
  edges: Edge[],
  preamble = '',
): ProjectFile {
  const file: ProjectFile = {
    app: 'glsl-nodes',
    version: PROJECT_VERSION,
    name,
    nodes: nodes.map((n) => ({
      id: n.id,
      position: { x: n.position.x, y: n.position.y },
      data: n.data,
    })),
    edges: edges.map((e) => {
      const row: ProjectFile['edges'][number] = {
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle ?? null,
        target: e.target,
        targetHandle: e.targetHandle ?? null,
      };
      if (e.data && typeof e.data === 'object') {
        row.data = e.data as Record<string, unknown>;
      }
      if (typeof e.className === 'string') row.className = e.className;
      if (e.style && typeof e.style === 'object') {
        row.style = e.style as Record<string, unknown>;
      }
      return row;
    }),
  };
  if (preamble.trim()) file.preamble = preamble;
  return file;
}

/** Parse a project file's JSON text into a runtime graph. Throws on invalid input. */
export function parseProject(text: string): {
  name: string;
  nodes: RFNode[];
  edges: Edge[];
  preamble: string;
} {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  return hydrateProject(data);
}

/**
 * Rebuild a runtime graph from a (possibly hand-edited or stale) project file.
 * Nodes are re-created through the same makers as the node library, so only
 * positions, GLSL bodies, output types, and slider params are trusted; regular
 * nodes re-derive their input sockets from `// @in` directives. Edges pointing
 * at nonexistent nodes/sockets are dropped, as are duplicate edges into the
 * same input socket (one incoming edge per input, same rule as the store).
 */
export function hydrateProject(input: unknown): {
  name: string;
  nodes: RFNode[];
  edges: Edge[];
  preamble: string;
} {
  const file = input as Partial<ProjectFile> | null;
  if (!file || typeof file !== 'object' || file.app !== 'glsl-nodes') {
    throw new Error('Not a glsl-nodes project file.');
  }
  if (file.version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${String(file.version)}`);
  }
  if (!Array.isArray(file.nodes) || !Array.isArray(file.edges)) {
    throw new Error('Project file is missing nodes or edges.');
  }

  const nodes: RFNode[] = [];
  const seen = new Set<string>();
  for (const raw of file.nodes) {
    const node = hydrateNode(raw);
    if (node && !seen.has(node.id)) {
      seen.add(node.id);
      nodes.push(node);
    }
  }

  const name =
    typeof file.name === 'string' && file.name.trim()
      ? file.name.trim()
      : 'untitled';
  const preamble =
    typeof file.preamble === 'string' ? file.preamble : '';
  return { name, nodes, edges: hydrateEdges(file.edges, nodes), preamble };
}

const GLSL_TYPES: ReadonlySet<string> = new Set([
  'float',
  'vec2',
  'vec3',
  'vec4',
  'mat2',
  'mat3',
  'func',
]);

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function hydrateNode(raw: unknown): RFNode | null {
  const n = raw as {
    id?: unknown;
    position?: { x?: unknown; y?: unknown };
    data?: unknown;
  } | null;
  if (!n || typeof n.id !== 'string' || !n.id) return null;
  const d = (
    n.data && typeof n.data === 'object' ? n.data : {}
  ) as Record<string, unknown>;
  const x = num(n.position?.x, 0);
  const y = num(n.position?.y, 0);
  // Special nodes are rebuilt from their makers; carry the custom label over.
  const label = typeof d.label === 'string' && d.label.trim() ? d.label : null;
  const withLabel = (node: RFNode) => {
    if (label) node.data.label = label;
    return node;
  };

  if (d.isInput) return withLabel(makeInputNode(n.id, x, y));
  if (d.isOutput) return withLabel(makeOutputNode(n.id, x, y));
  if (d.isSlider) {
    const node = makeSliderNode(n.id, x, y);
    const min = num(d.min, 0);
    const max = num(d.max, 1);
    node.data.min = min;
    node.data.max = max;
    node.data.step = num(d.step, 0.01);
    node.data.value = clamp(num(d.value, min), min, max);
    return withLabel(node);
  }
  if (d.isVec2) {
    const node = makeVec2Node(n.id, x, y);
    const min = num(d.min, 0);
    const max = num(d.max, 1);
    node.data.min = min;
    node.data.max = max;
    const raw = Array.isArray(d.vec) ? d.vec : [];
    node.data.vec = [
      clamp(num(raw[0], min), min, max),
      clamp(num(raw[1], min), min, max),
    ];
    return withLabel(node);
  }
  if (d.isColor) {
    const node = makeColorNode(n.id, x, y);
    const raw = Array.isArray(d.rgb) ? d.rgb : [];
    node.data.rgb = [
      clamp(num(raw[0], 1), 0, 1),
      clamp(num(raw[1], 1), 0, 1),
      clamp(num(raw[2], 1), 0, 1),
    ];
    return withLabel(node);
  }

  const glsl = typeof d.glsl === 'string' ? d.glsl : '';
  // Directives win; otherwise trust the stored output type.
  const parsedOut = parseOutput(glsl);
  const outs = Array.isArray(d.outputs) ? d.outputs : [];
  const firstOut = outs[0] as { type?: unknown } | undefined;
  const storedType =
    typeof firstOut?.type === 'string' && GLSL_TYPES.has(firstOut.type)
      ? (firstOut.type as GLSLType)
      : 'vec4';
  const sig = parseFuncSignature(glsl);

  return {
    id: n.id,
    type: 'shader',
    position: { x, y },
    data: {
      kind: typeof d.kind === 'string' ? d.kind : 'custom',
      label: typeof d.label === 'string' ? d.label : 'Node',
      glsl,
      ...(typeof d.glslName === 'string' && d.glslName.trim()
        ? { glslName: d.glslName.trim() }
        : {}),
      ...(sig.length ? { funcSignature: sig } : {}),
      inputs: parseInputs(glsl),
      outputs: [
        {
          id: 'out',
          name: parsedOut?.name ?? 'out',
          type: parsedOut?.type ?? storedType,
        },
      ],
    },
  };
}

function hydrateEdges(rawEdges: unknown[], nodes: RFNode[]): Edge[] {
  const outs = new Map(
    nodes.map((n) => [n.id, new Set(n.data.outputs.map((s) => s.id))]),
  );
  const ins = new Map(
    nodes.map((n) => [n.id, new Set(n.data.inputs.map((s) => s.id))]),
  );

  const edges: Edge[] = [];
  const seenIds = new Set<string>();
  const takenInputs = new Set<string>();
  rawEdges.forEach((raw, i) => {
    const e = raw as {
      id?: unknown;
      source?: unknown;
      sourceHandle?: unknown;
      target?: unknown;
      targetHandle?: unknown;
      data?: unknown;
      className?: unknown;
      style?: unknown;
    } | null;
    if (!e || typeof e.source !== 'string' || typeof e.target !== 'string') {
      return;
    }
    const sourceHandle = typeof e.sourceHandle === 'string' ? e.sourceHandle : '';
    const targetHandle = typeof e.targetHandle === 'string' ? e.targetHandle : '';
    if (!outs.get(e.source)?.has(sourceHandle)) return;
    if (!ins.get(e.target)?.has(targetHandle)) return;

    const inputKey = `${e.target}:${targetHandle}`;
    if (takenInputs.has(inputKey)) return;
    takenInputs.add(inputKey);

    let id = typeof e.id === 'string' && e.id ? e.id : `e_${i}`;
    if (seenIds.has(id)) id = `e_${i}_${id}`;
    seenIds.add(id);

    const edge: Edge = {
      id,
      source: e.source,
      sourceHandle,
      target: e.target,
      targetHandle,
    };
    if (e.data && typeof e.data === 'object') edge.data = e.data as Edge['data'];
    if (typeof e.className === 'string') edge.className = e.className;
    if (e.style && typeof e.style === 'object') {
      edge.style = e.style as Edge['style'];
    }
    edges.push(edge);
  });
  return edges;
}

// ---------------------------------------------------------------------------
// Saved projects in localStorage (Save / Open), keyed by project name.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'glsl-nodes.projects';

interface StoredProjects {
  [name: string]: { file: ProjectFile; savedAt: number };
}

function readStorage(): StoredProjects {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as StoredProjects)
      : {};
  } catch {
    return {};
  }
}

function writeStorage(store: StoredProjects): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listSavedProjects(): { name: string; savedAt: number }[] {
  return Object.entries(readStorage())
    .map(([name, v]) => ({ name, savedAt: num(v?.savedAt, 0) }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function saveProjectToLocal(file: ProjectFile): void {
  const store = readStorage();
  store[file.name] = { file, savedAt: Date.now() };
  writeStorage(store);
}

export function openProjectFromLocal(name: string): ProjectFile | null {
  return readStorage()[name]?.file ?? null;
}

export function deleteProjectFromLocal(name: string): void {
  const store = readStorage();
  delete store[name];
  writeStorage(store);
}

import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import { compileGraph, outputTypeOf } from './compiler/compile';
import { parseInputs, parseOutput } from './compiler/parseInputs';
import { chooseInputSocket, clamp, isControlNode } from './types';
import {
  bumpIdCounterPast,
  makeDefaultGraph,
  nextId,
  NODE_TEMPLATES,
  type RFNode,
} from './nodes/library';

interface GraphState {
  nodes: RFNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  fragSource: string | null;
  compileError: string | null;
  /** GLSL compile/link error reported by the renderer (set externally). */
  glslError: string | null;
  /** Name of the current project (null = never saved / untitled). */
  projectName: string | null;
  /** Bumped whenever a whole new graph is loaded; remounts React Flow so it refits the view. */
  graphRevision: number;

  onNodesChange: (changes: NodeChange<RFNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  /** Move an existing edge end to a new socket (drag-to-reconnect). */
  reconnectEdge: (oldEdgeId: string, connection: Connection) => void;
  /** Delete a single edge (break a wire). */
  deleteEdge: (id: string) => void;
  /** Splice a node into an existing edge (Blender-style drop-on-wire). */
  insertNodeOnEdge: (nodeId: string, edgeId: string) => void;
  addNode: (kind: string) => void;
  /** Add a node at an explicit graph position; returns its id (null for unknown kind). */
  addNodeAt: (kind: string, x: number, y: number) => string | null;
  setSelected: (id: string | null) => void;
  /** Rename a node (display label only; blank names are ignored). */
  renameNode: (id: string, label: string) => void;
  updateNodeGlsl: (id: string, glsl: string) => void;
  updateSliderParam: (
    id: string,
    patch: Partial<{ value: number; min: number; max: number; step: number }>,
  ) => void;
  updateColorParam: (id: string, rgb: [number, number, number]) => void;
  updateVec2Param: (
    id: string,
    patch: Partial<{ vec: [number, number]; min: number; max: number }>,
  ) => void;
  setGlslError: (err: string | null) => void;
  /** Copy the selected nodes (minus Output) + wires between them. Returns count copied. */
  copySelection: () => number;
  /** Copy, then remove, the selected nodes. Returns count cut. */
  cutSelection: () => number;
  /** Paste the clipboard as fresh nodes, selected, at an offset. Returns count pasted. */
  pasteClipboard: () => number;
  setProjectName: (name: string | null) => void;
  /** Replace the whole graph (project open / import). */
  loadProject: (name: string | null, nodes: RFNode[], edges: Edge[]) => void;
  /** Reset to the default starter graph. */
  newProject: () => void;
  recompile: () => void;
}

const initial = makeDefaultGraph();

/**
 * In-app clipboard for graph nodes (module scope: survives project loads, so
 * nodes can be copied between projects within the same tab).
 */
let clipboard: { nodes: RFNode[]; edges: Edge[] } | null = null;
/** Paste count since the last copy — each paste lands a bit further down-right. */
let pasteSeq = 0;

export const useGraph = create<GraphState>((set, get) => ({
  nodes: initial.nodes,
  edges: initial.edges,
  selectedNodeId: null,
  fragSource: null,
  compileError: null,
  glslError: null,
  projectName: null,
  graphRevision: 0,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    const sel = changes.find((c) => c.type === 'select' && c.selected);
    if (sel && 'id' in sel) set({ selectedNodeId: sel.id });
    if (changes.some((c) => c.type === 'remove')) get().recompile();
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    if (changes.some((c) => c.type === 'remove')) get().recompile();
  },

  onConnect: (connection) => {
    // One incoming edge per input socket: drop any existing edge on that target.
    const filtered = get().edges.filter(
      (e) =>
        !(
          e.target === connection.target &&
          e.targetHandle === connection.targetHandle
        ),
    );
    set({ edges: addEdge(connection, filtered) });
    get().recompile();
  },

  reconnectEdge: (oldEdgeId, connection) => {
    // Drop the old edge plus whatever occupies the destination input socket
    // (same one-edge-per-input rule as onConnect).
    const filtered = get().edges.filter(
      (e) =>
        e.id !== oldEdgeId &&
        !(
          e.target === connection.target &&
          e.targetHandle === connection.targetHandle
        ),
    );
    set({ edges: addEdge(connection, filtered) });
    get().recompile();
  },

  deleteEdge: (id) => {
    set({ edges: get().edges.filter((e) => e.id !== id) });
    get().recompile();
  },

  insertNodeOnEdge: (nodeId, edgeId) => {
    const { nodes, edges } = get();
    const node = nodes.find((n) => n.id === nodeId);
    const edge = edges.find((e) => e.id === edgeId);
    if (!node || !edge) return;
    if (edge.source === nodeId || edge.target === nodeId) return;

    const output = node.data.outputs[0];
    if (!node.data.inputs.length || !output) return;

    const src = nodes.find((n) => n.id === edge.source);
    const srcType = src ? outputTypeOf(src, edge.sourceHandle) : null;
    const taken = new Set(
      edges
        .filter((e) => e.target === nodeId)
        .map((e) => e.targetHandle)
        .filter((h): h is string => typeof h === 'string'),
    );
    const chosen = chooseInputSocket(node.data.inputs, srcType, taken);
    if (!chosen) return;

    set({
      edges: [
        ...edges.filter(
          (e) =>
            e.id !== edgeId &&
            !(e.target === nodeId && e.targetHandle === chosen.id),
        ),
        {
          id: nextId('e'),
          source: edge.source,
          sourceHandle: edge.sourceHandle,
          target: nodeId,
          targetHandle: chosen.id,
        },
        {
          id: nextId('e'),
          source: nodeId,
          sourceHandle: output.id,
          target: edge.target,
          targetHandle: edge.targetHandle,
        },
      ],
    });
    get().recompile();
  },

  addNode: (kind) => {
    get().addNodeAt(kind, 200 + Math.random() * 200, 80 + Math.random() * 240);
  },

  addNodeAt: (kind, x, y) => {
    const template = NODE_TEMPLATES.find((t) => t.kind === kind);
    if (!template) return null;
    const id = nextId(kind);
    set({ nodes: [...get().nodes, template.make(id, x, y)] });
    return id;
  },

  setSelected: (id) => set({ selectedNodeId: id }),

  renameNode: (id, label) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, label: trimmed } } : n,
      ),
    });
    // No recompile: labels are display-only (GLSL names come from node ids).
  },

  updateNodeGlsl: (id, glsl) => {
    // Regular nodes derive their input sockets from `// @in` directives and
    // their output from `// @out`, so re-parse on every edit (no @out keeps
    // the current output type). Special nodes keep their sockets.
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n;
        if (n.data.isInput || n.data.isOutput || isControlNode(n.data)) {
          return { ...n, data: { ...n.data, glsl } };
        }
        const out = parseOutput(glsl);
        const outputs = out
          ? [{ id: 'out', name: out.name, type: out.type }]
          : n.data.outputs;
        return {
          ...n,
          data: { ...n.data, glsl, inputs: parseInputs(glsl), outputs },
        };
      }),
    });

    // Drop edges pointing at input handles that no longer exist.
    const valid = new Map(
      get().nodes.map((n) => [n.id, new Set(n.data.inputs.map((s) => s.id))]),
    );
    set({
      edges: get().edges.filter((e) => {
        if (!e.targetHandle) return true;
        const handles = valid.get(e.target);
        return handles ? handles.has(e.targetHandle) : true;
      }),
    });

    get().recompile();
  },

  updateSliderParam: (id, patch) => {
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n;
        const data = { ...n.data, ...patch };
        // Keep value within [min, max].
        const min = data.min ?? 0;
        const max = data.max ?? 1;
        if (typeof data.value === 'number') {
          data.value = clamp(data.value, min, max);
        }
        return { ...n, data };
      }),
    });
    // No recompile: slider value/range are pushed live via the uniform source.
  },

  updateColorParam: (id, rgb) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, rgb } } : n,
      ),
    });
    // No recompile: the color is pushed live via the uniform source.
  },

  updateVec2Param: (id, patch) => {
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n;
        const data = { ...n.data, ...patch };
        // Keep both axes within [min, max].
        const min = data.min ?? 0;
        const max = data.max ?? 1;
        if (data.vec) {
          data.vec = [clamp(data.vec[0], min, max), clamp(data.vec[1], min, max)];
        }
        return { ...n, data };
      }),
    });
    // No recompile: the value is pushed live via the uniform source.
  },

  setGlslError: (err) => set({ glslError: err }),

  copySelection: () => {
    // Output is excluded: the graph should keep exactly one.
    const picked = get().nodes.filter((n) => n.selected && !n.data.isOutput);
    if (!picked.length) return 0;
    const ids = new Set(picked.map((n) => n.id));
    const internalEdges = get().edges.filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    );
    clipboard = structuredClone({ nodes: picked, edges: internalEdges });
    pasteSeq = 0;
    return picked.length;
  },

  cutSelection: () => {
    const count = get().copySelection();
    if (!count) return 0;
    const ids = new Set(
      get()
        .nodes.filter((n) => n.selected && !n.data.isOutput)
        .map((n) => n.id),
    );
    const selectedNodeId = get().selectedNodeId;
    set({
      nodes: get().nodes.filter((n) => !ids.has(n.id)),
      edges: get().edges.filter(
        (e) => !ids.has(e.source) && !ids.has(e.target),
      ),
      selectedNodeId:
        selectedNodeId && ids.has(selectedNodeId) ? null : selectedNodeId,
    });
    get().recompile();
    return count;
  },

  pasteClipboard: () => {
    if (!clipboard) return 0;
    pasteSeq += 1;
    const offset = 40 * pasteSeq;

    const idMap = new Map<string, string>();
    const newNodes = clipboard.nodes.map((n) => {
      const id = nextId(n.data.kind || 'n');
      idMap.set(n.id, id);
      return {
        ...structuredClone(n),
        id,
        selected: true,
        position: { x: n.position.x + offset, y: n.position.y + offset },
      };
    });
    const newEdges = clipboard.edges.map((e) => ({
      ...structuredClone(e),
      id: nextId('e'),
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      selected: false,
    }));

    set({
      nodes: [
        ...get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...newNodes,
      ],
      edges: [
        ...get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
        ...newEdges,
      ],
      selectedNodeId: newNodes[0]?.id ?? get().selectedNodeId,
    });
    get().recompile();
    return newNodes.length;
  },

  setProjectName: (name) => set({ projectName: name }),

  loadProject: (name, nodes, edges) => {
    bumpIdCounterPast(nodes);
    set({
      nodes,
      edges,
      projectName: name,
      selectedNodeId: null,
      glslError: null,
      graphRevision: get().graphRevision + 1,
    });
    get().recompile();
  },

  newProject: () => {
    const graph = makeDefaultGraph();
    set({
      nodes: graph.nodes,
      edges: graph.edges,
      projectName: null,
      selectedNodeId: null,
      glslError: null,
      graphRevision: get().graphRevision + 1,
    });
    get().recompile();
  },

  recompile: () => {
    const { nodes, edges } = get();
    const { fragSource, error } = compileGraph(nodes, edges);
    set({ fragSource, compileError: error });
  },
}));

// Compile the initial graph once on load.
useGraph.getState().recompile();

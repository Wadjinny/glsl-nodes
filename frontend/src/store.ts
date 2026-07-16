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
import { compileGraph } from './compiler/compile';
import { parseInputs } from './compiler/parseInputs';
import {
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

  onNodesChange: (changes: NodeChange<RFNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (kind: string) => void;
  setSelected: (id: string | null) => void;
  updateNodeGlsl: (id: string, glsl: string) => void;
  updateSliderParam: (
    id: string,
    patch: Partial<{ value: number; min: number; max: number; step: number }>,
  ) => void;
  setGlslError: (err: string | null) => void;
  recompile: () => void;
}

const initial = makeDefaultGraph();

export const useGraph = create<GraphState>((set, get) => ({
  nodes: initial.nodes,
  edges: initial.edges,
  selectedNodeId: null,
  fragSource: null,
  compileError: null,
  glslError: null,

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

  addNode: (kind) => {
    const template = NODE_TEMPLATES.find((t) => t.kind === kind);
    if (!template) return;
    const id = nextId(kind);
    const x = 200 + Math.random() * 200;
    const y = 80 + Math.random() * 240;
    set({ nodes: [...get().nodes, template.make(id, x, y)] });
  },

  setSelected: (id) => set({ selectedNodeId: id }),

  updateNodeGlsl: (id, glsl) => {
    // Regular nodes derive their input sockets from `// @in` directives in
    // the code, so re-parse on every edit. Special nodes keep their sockets.
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n;
        if (n.data.isInput || n.data.isOutput || n.data.isSlider) {
          return { ...n, data: { ...n.data, glsl } };
        }
        return { ...n, data: { ...n.data, glsl, inputs: parseInputs(glsl) } };
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
          data.value = Math.min(max, Math.max(min, data.value));
        }
        return { ...n, data };
      }),
    });
    // No recompile: slider value/range are pushed live via the uniform source.
  },

  setGlslError: (err) => set({ glslError: err }),

  recompile: () => {
    const { nodes, edges } = get();
    const { fragSource, error } = compileGraph(nodes, edges);
    set({ fragSource, compileError: error });
  },
}));

// Compile the initial graph once on load.
useGraph.getState().recompile();

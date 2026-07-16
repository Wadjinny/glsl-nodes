# GLSL Node Shader Editor — MVP Plan

A single-page web app to build images and animations from GLSL shaders, wired together as nodes (React Flow) instead of one monolithic fragment shader. Each node is a small shader function with typed inputs and outputs; the graph compiles down to one GLSL fragment shader that renders live in a preview.

---

## 1. Concept

- **Like ShaderToy, but node-based.** ShaderToy runs one `mainImage()` fragment shader. Here the user composes that shader visually from nodes.
- **Each node = a GLSL function** with typed input/output sockets (`float`, `vec2`, `vec3`, `vec4`).
- **Input node** exposes the built-ins every shader needs: `uv` (normalized coords), `fragCoord` (pixel x,y), `resolution`, `time`, `mouse`.
- **Output node** takes a final color (`vec3`/`vec4`) and writes the pixel.
- The graph is **compiled into a single fragment shader** (not multi-pass) — simplest path to a working, fast preview.

## 2. Architecture at a glance

```
Input node ─► [Math/Color/Noise nodes] ─► Output node
                       │
                       ▼
              Graph Compiler  (topological sort → emit GLSL)
                       │
                       ▼
              WebGL2 Preview (full-screen quad, animated)
```

The whole thing is one React SPA with three resizable panels:

| Panel | Purpose | Built with |
|-------|---------|-----------|
| **Preview** | Live WebGL render of the compiled shader, animating on `time` | WebGL2 + `requestAnimationFrame` |
| **Nodes editor** | The graph: add / connect / delete nodes | React Flow (`@xyflow/react`) |
| **Node shader editor** | GLSL source of the *selected* node, editable | Monaco (the VS Code editor) |

## 3. Tech stack

- **Vite + React + TypeScript** — fast SPA scaffold.
- **`@xyflow/react`** (React Flow) — node graph, custom nodes, typed handles.
- **`@monaco-editor/react`** — VS Code editor with GLSL syntax highlighting.
- **WebGL2** raw, or a thin helper (`twgl.js`) to cut boilerplate.
- **Zustand** — single store for nodes, edges, selection, compiled shader, errors.
- **`react-resizable-panels`** (or `allotment`) — the 3-panel resizable layout.

## 4. Data model

```ts
type GLSLType = 'float' | 'vec2' | 'vec3' | 'vec4';

interface Socket { id: string; name: string; type: GLSLType; }

interface ShaderNode {
  id: string;
  kind: string;            // 'input' | 'output' | 'add' | 'noise' | 'custom' ...
  label: string;
  glsl: string;            // function body, e.g. "return a + b;"
  inputs: Socket[];
  outputs: Socket[];
  params?: Record<string, number>;  // optional UI constants
}

interface Edge {           // React Flow edge + socket info
  source: string; sourceHandle: string;   // node id + output socket id
  target: string; targetHandle: string;   // node id + input socket id
}
```

The Input node has no inputs and outputs `uv:vec2, fragCoord:vec2, resolution:vec2, time:float, mouse:vec2`. The Output node has one input `color:vec4` and no outputs.

## 5. The compiler (the heart of the project)

Turns the graph into one fragment shader string:

1. **Validate** — Output node exists and its `color` input is connected; no cycles.
2. **Topological sort** — order nodes so every input is produced before it is consumed.
3. **Emit each node as a GLSL function** with a unique name (`node_<id>(...)`), parameters typed from its input sockets, returning its output(s). (Multi-output nodes return a `struct` or out-params.)
4. **Generate `main()`** — call each node in order, storing results in uniquely named locals; wire an edge by passing the source local into the target call.
5. **Assemble** the final string: `#version 300 es` header + uniforms (`uTime`, `uResolution`, `uMouse`) + node functions + `main()` writing to `out vec4 fragColor`.
6. **Type-check edges** on connect (reject `vec3 → float`, etc.) so most errors are caught before compile.
7. Hand the string to WebGL; surface GLSL `getShaderInfoLog` errors back into the UI.

Recompile (debounced) whenever the graph or any node's code changes.

## 6. Build roadmap (phased)

### Phase 0 — Scaffold *(half day)*
- `npm create vite@latest` (React + TS), install deps.
- 3-panel resizable layout shell with placeholder content.

### Phase 1 — Preview engine *(1 day)*
- WebGL2 full-screen quad rendering a **hardcoded** fragment shader.
- Animate `uTime`, set `uResolution`, track mouse → `uMouse`.
- Goal: a moving gradient proves the render loop works.

### Phase 2 — Node graph UI *(1–2 days)*
- React Flow canvas; custom node component with typed input/output handles (color-coded by type).
- Add nodes (toolbar/right-click), connect, delete, select.
- Store nodes + edges in Zustand.

### Phase 3 — Shader code editor *(1 day)*
- Monaco panel bound to the **selected** node's `glsl`.
- Register GLSL language (Monarch tokenizer) for syntax highlighting; keyword + built-in coloring.
- Edits write back to the node in the store.

### Phase 4 — Compiler + live wiring *(2–3 days)*
- Implement graph → single GLSL string (section 5).
- Debounced recompile on any change; feed result to the Phase 1 preview.
- Show compile errors in a status bar.
- Goal: connect Input → a node → Output and see it render.

### Phase 5 — Node library + validation *(1–2 days)*
- Built-in nodes: Input, Output, plus a starter set — Add, Multiply, Mix, Sin/Time, UV transform, Color/constant, Noise.
- Type-checked connections; reject invalid edges with a hint.

### Phase 6 — Polish *(ongoing)*
- Persist graph to `localStorage`; export/import JSON.
- Export compiled GLSL (and/or a standalone ShaderToy-style snippet).
- Nicer error highlighting, node search, presets/examples.

## 7. Suggested file structure

```
src/
  App.tsx                  # 3-panel layout
  store.ts                 # Zustand: nodes, edges, selection, shader, errors
  panels/
    PreviewPanel.tsx
    GraphPanel.tsx
    CodePanel.tsx          # Monaco
  webgl/
    renderer.ts            # quad, uniforms, render loop
  nodes/
    ShaderNode.tsx         # custom React Flow node
    library.ts             # built-in node definitions
  compiler/
    compile.ts             # graph → GLSL
    topo.ts                # sort + cycle detection
    types.ts               # GLSL type system / validation
  monaco/
    glsl-language.ts       # syntax highlighting
```

## 8. Key risks & decisions

- **Single-shader vs multi-pass.** MVP = single shader (simplest, fastest). Defer multi-pass / texture-feedback (needed for buffers, blur, ping-pong) to a later version.
- **Multi-output nodes.** Start with single-output nodes to keep the compiler simple; add struct returns later.
- **Type system scope.** MVP supports `float`/`vec2`/`vec3`/`vec4` only. Add `sampler2D`, matrices, ints later.
- **Recompile cost.** Debounce and only recompile on real changes; compiling GLSL strings is cheap, linking is the cost.

## 9. Definition of done (MVP)

Connect Input → at least one transform/color node → Output, edit a node's GLSL in the Monaco panel, and watch the preview update live — all in one page with three resizable panels.

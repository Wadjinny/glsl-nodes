# GLSL Nodes

A node-based GLSL shader editor — like ShaderToy, but you build the fragment
shader from connected nodes instead of writing one big file. The graph compiles
to a single GLSL fragment shader rendered live in the preview.

## Run

```bash
npm install
npm run dev
```

Open the printed localhost URL.

## Layout

Four panels in one page:

- **Preview** (top-left) — live WebGL2 render, animated on `time`, tracks the mouse.
- **Shader Code** (bottom-left) — Monaco (VS Code) editor for the selected node's GLSL body, with syntax highlighting.
- **Nodes** (top-right) — the React Flow graph. Add nodes from the toolbar, drag between sockets to connect, press Delete to remove.
- **Controls** (bottom-right) — a slider for every Slider node, with editable min/max/step. Dragging a slider updates the shader live without recompiling.

All panel dividers are draggable.

### Exporting video

The Preview header has an **Export** control (duration, fps, resolution). It renders the shader to an `.mp4` entirely in the browser using WebCodecs (H.264) + `mp4-muxer`. Frames are rendered deterministically (`time = frame / fps`), so the output has an exact duration and locked framerate regardless of realtime performance. On browsers without WebCodecs it falls back to a realtime MediaRecorder capture (WebM, or MP4 where supported).

### Slider nodes

Add a **Slider** node from the toolbar to get a `float` output backed by a live uniform. It shows up automatically in the Controls panel. Wire its output into any `float` input (e.g. a Circle's radius, a Mix's `t`) and drag the slider to drive the shader in real time. Each slider compiles to its own `uniform float`, set every frame from the panel value.

## How it works

- **Input node** outputs built-ins: `uv`, `fragCoord`, `resolution`, `time`, `mouse`.
- **Regular nodes** are GLSL functions: their input sockets become parameters, and the body must `return` the output type. Edit the body in the code panel.
- **Inputs are declared in the code.** A regular node's input sockets come from `// @in <type> <name>` directives at the top of its body. Add a line like `// @in float radius` and a typed `radius` socket appears on the node automatically (and `radius` is usable in the body); delete the line and the socket — and any edge into it — is removed. Supported types: `float`, `vec2`, `vec3`, `vec4`.
- **Output node** takes a `color` and writes the pixel (auto-promoted to `vec4`).
- The compiler (`src/compiler/compile.ts`) topologically sorts the graph, emits one function per node, wires edges to local variables, and assembles a single fragment shader. Socket types are coerced where possible (e.g. `vec3 -> vec4`).

The default graph (`Input -> Gradient -> Output`) renders the classic animated
palette so you see something move immediately.

## Project structure

```
src/
  App.tsx                 3-panel layout
  store.ts                Zustand state + recompile
  types.ts                GLSL types, socket model
  compiler/
    compile.ts            graph -> single GLSL fragment shader
    topo.ts               topological sort + cycle detection
  webgl/renderer.ts       WebGL2 full-screen-triangle renderer
  nodes/
    library.ts            node templates + default graph
    ShaderNode.tsx        custom React Flow node
  panels/                 Preview / Graph / Code panels
  monaco/glsl-language.ts GLSL syntax highlighting
```

## Roadmap

See `PLAN.md` for the phased plan and deferred features (multi-pass / texture
feedback, multi-output nodes, more types, save/export).

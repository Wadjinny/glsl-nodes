# GLSL Nodes

A node-based GLSL shader editor — like ShaderToy, but you build the fragment shader from connected nodes instead of writing one big file. The graph compiles to a single GLSL fragment shader rendered live in the preview.

**Live:** [glsl-nodes.w-ilyas.site](https://glsl-nodes.w-ilyas.site)

## Run

```bash
cd frontend
pnpm install
pnpm dev
```

Open the printed localhost URL.

## Layout

Four panels in one page:

- **Preview** (top-left) — live WebGL2 render, animated on `time`, tracks the mouse.
- **Shader Code** (bottom-left) — Monaco editor for the selected node's GLSL body.
- **Nodes** (top-right) — React Flow graph. Add nodes from the toolbar, drag between sockets, Delete to remove.
- **Controls** (bottom-right) — sliders for every Slider node; updates the shader live without recompiling.

All panel dividers are draggable.

### Exporting video

The Preview header has an **Export** control (duration, fps, resolution). It renders to `.mp4` in the browser with WebCodecs (H.264) + `mp4-muxer`. Frames are deterministic (`time = frame / fps`). Without WebCodecs it falls back to MediaRecorder (WebM / MP4 where supported).

### Slider nodes

Add a **Slider** node for a `float` output backed by a live uniform. Wire it into any `float` input and drag the control to drive the shader in real time.

## How it works

- **Input node** outputs built-ins: `uv`, `fragCoord`, `resolution`, `time`, `mouse`.
- **Regular nodes** are GLSL functions: input sockets become parameters; the body must `return` the output type.
- **Inputs are declared in the code.** Use `// @in <type> <name>` at the top of a node's body (types: `float`, `vec2`, `vec3`, `vec4`).
- **Output node** takes a `color` and writes the pixel (auto-promoted to `vec4`).
- The compiler topologically sorts the graph, emits one function per node, and assembles a single fragment shader.

The default graph (`Input -> Gradient -> Output`) renders an animated palette so something moves immediately.

## Project structure

```
frontend/src/
  App.tsx                 layout
  store.ts                Zustand state + recompile
  types.ts                GLSL types, socket model
  compiler/
    compile.ts            graph -> fragment shader
    topo.ts               topological sort + cycle detection
  webgl/renderer.ts       WebGL2 full-screen-triangle renderer
  nodes/
    library.ts            node templates + default graph
    ShaderNode.tsx        custom React Flow node
  panels/                 Preview / Graph / Code panels
  monaco/glsl-language.ts GLSL syntax highlighting
```

## Deploy

Push to `main` builds with pnpm/Vite and deploys over SSH, then reloads the Caddy site config.

## Roadmap

See [`frontend/PLAN.md`](./frontend/PLAN.md) for deferred features (multi-pass / texture feedback, multi-output nodes, more types, save/export).

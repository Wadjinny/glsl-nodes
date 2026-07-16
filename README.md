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
- **Nodes** (top-right) — React Flow graph. Add nodes from the toolbar, drag between sockets, Delete to remove. Drag a node onto a wire to splice it in (Blender-style); double-click a node's title to rename it; Ctrl/Cmd+C/X/V copy, cut, and paste selected nodes. Break a wire by double-clicking it, or by dragging either end off its socket and dropping it on empty space (dropping on another socket rewires it).
- **Controls** (bottom-right) — sliders for every Slider node; updates the shader live without recompiling.

All panel dividers are draggable.

The top bar manages projects: **New / Open / Save** keep named projects in the browser's localStorage; **Import / Export** move a project as a portable `.json` file.

### Exporting video

The Preview header has an **Export** control (duration, fps, resolution). It renders to `.mp4` in the browser with WebCodecs (H.264) + `mp4-muxer`. Frames are deterministic (`time = frame / fps`). Without WebCodecs it falls back to MediaRecorder (WebM / MP4 where supported).

### Control nodes (Slider, Color, Vec2)

Add a **Slider** node for a `float`, a **Color** node for a `vec3`, or a **Vec2** node for a `vec2` — all backed by live uniforms. Wire them into any matching input and use the Controls panel (slider / color picker / XY pad) to drive the shader in real time without recompiling. The Vec2 pad maps both axes from its min to its max (drag the dot; x is horizontal, y is vertical).

## How it works

- **Built-ins are ambient.** Every node body can use `uv`, `fragCoord`, `resolution`, `time`, and `mouse` directly — no wiring needed.
- **Regular nodes** are GLSL functions: input sockets become parameters; the body must `return` the output type.
- **Inputs are declared in the code.** Use `// @in <type> <name>` at the top of a node's body (types: `float`, `vec2`, `vec3`, `vec4`).
- **An input named after a built-in falls back to that built-in when unconnected**; wiring it overrides the value (e.g. feed a warped `uv` into a node's `uv` input).
- **Input node** exposes the same built-ins as output sockets, for when you want the dataflow explicit.
- **Output node** takes a `color` and writes the pixel (auto-promoted to `vec4`).
- The compiler topologically sorts the graph, emits one function per node, and assembles a single fragment shader.

The default graph (`Gradient -> Output`) renders an animated palette with nothing wired into the Gradient — its `uv`/`time` inputs read the built-ins.

## Project structure

```
frontend/src/
  App.tsx                 layout
  ProjectBar.tsx          top bar: new / open / save / import / export
  project.ts              project file format + localStorage persistence
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

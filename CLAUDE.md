# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A node-based GLSL shader editor (like ShaderToy, but the fragment shader is composed from connected nodes). Single-page React app; the entire app lives in `frontend/`. The repo root only holds the `Caddyfile` and CI config.

## Commands

All commands run from `frontend/` and use **pnpm**:

```bash
pnpm install
pnpm dev          # Vite dev server
pnpm build        # tsc -b && vite build — this is also the typecheck
pnpm exec tsc -b  # typecheck only
```

There are no tests and no linter configured. `tsc -b` (strict mode) is the only automated check.

Deploy: pushing to `main` triggers `.github/workflows/frontend.yml`, which builds with pnpm/Vite and deploys over SSH via reusable workflows from `Wadjinny/workflows`, then installs the `Caddyfile`.

## Architecture

Data flow: **Zustand store → graph compiler → single fragment shader string → WebGL2 renderer**.

- `src/store.ts` — single Zustand store (`useGraph`) holding React Flow nodes/edges, selection, the compiled `fragSource`, and two separate error channels: `compileError` (graph → GLSL compilation) and `glslError` (WebGL shader compile/link, reported back by the renderer). Every structural change (connect, delete, code edit) calls `recompile()`; slider value changes deliberately do **not** recompile (see uniforms below).
- `src/compiler/compile.ts` — `compileGraph()` topo-sorts the graph (`topo.ts`, with cycle detection), emits one GLSL function per regular node (`node_<id>`), calls each in `main()` storing results in `node_<id>_out` locals, and resolves edges into arguments. The built-ins (`uv`, `fragCoord`, `resolution`, `time`, `mouse` — see `BUILTINS`) are emitted as top-level GLSL globals assigned at the start of `main()`, so every node body can reference them without wires; a node's `// @in` parameter of the same name shadows the global, which is how a wire overrides a built-in. Unconnected inputs named after a built-in fall back to that built-in; other unconnected inputs get zero defaults (`TYPE_DEFAULT`). Type mismatches are silently coerced by `coerce()` (e.g. `vec3 → vec4` appends `1.0`). Output is one `#version 300 es` fragment shader.
- `src/webgl/renderer.ts` — WebGL2 full-screen-triangle renderer (no vertex buffers; `gl_VertexID` trick, vertex shader comes from `compile.ts`). Runs a rAF loop driving `uTime`/`uResolution`/`uMouse`. Created with `preserveDrawingBuffer: true` so export can read frames.
- `src/panels/PreviewPanel.tsx` — owns the `Renderer` lifecycle, pushes new `fragSource` into it, and routes WebGL errors back into the store. Displays `exportErr ?? compileError ?? glslError`.

### Node model (cross-file contracts)

Three special node flavors are flagged on `ShaderNodeData` (`src/types.ts`) and special-cased everywhere: `isInput`, `isOutput`, `isSlider`. Everything else is a "regular" node — a GLSL function whose body must `return` its output type.

- **A regular node's input sockets are derived from its code**, not stored independently: `// @in <type> <name>` directives are parsed by `src/compiler/parseInputs.ts` (socket `id` === socket `name`). `store.updateNodeGlsl` re-parses on every edit and drops edges pointing at removed sockets. Adding a new supported type means touching `types.ts` (`GLSLType`, colors, defaults), `parseInputs.ts`, and `coerce()` in `compile.ts`.
- **Input node** output sockets map to the same `BUILTINS` globals — it exists for explicit wiring style, not necessity, and is created from the toolbar like any other node.
- **Slider nodes** compile to `uniform float uCtl_<id>`. `uniformName()` in `compile.ts` is the shared contract: the compiler declares the uniform, and `PreviewPanel` registers a callback (`renderer.setUniformSource`) that reads slider values straight from the store every frame. That's why dragging a slider updates the shader live without recompiling.
- **One incoming edge per input socket** is enforced in `store.onConnect` (a new connection replaces the existing edge on that target handle).
- Node templates and the default graph (`Gradient → Output`, unwired inputs reading built-ins) live in `src/nodes/library.ts`.

### Project persistence

`src/project.ts` owns the project file format (`{ app: 'glsl-nodes', version, name, nodes, edges }`) plus named-project storage in localStorage; `src/ProjectBar.tsx` is the top-bar UI (New / Open / Save / Import / Export). On load, `hydrateProject()` rebuilds nodes through the same makers as the library (regular nodes re-derive inputs from their GLSL) and drops invalid edges, `bumpIdCounterPast()` in `library.ts` prevents id collisions after import, and the store's `graphRevision` counter remounts React Flow so `fitView` reruns. Don't `window.confirm()` before programmatically opening a file picker — it consumes the user activation and Chrome blocks the chooser.

### Video export

`src/webgl/exportVideo.ts` renders deterministic frames (`time = frame / fps`) via `renderer.beginExport()` / `renderFrame()` / `endExport()` (which pauses the live rAF loop), encoding with WebCodecs H.264 + `mp4-muxer`, falling back to MediaRecorder when WebCodecs is unavailable.

## Roadmap

Deferred features (multi-pass / texture feedback, multi-output nodes, more GLSL types, persistence) are documented in `frontend/PLAN.md`.

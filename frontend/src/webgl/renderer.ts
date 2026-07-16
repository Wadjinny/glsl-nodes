import { getVertexShader } from '../compiler/compile';

export class Renderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null;
  private raf = 0;
  private startTime = performance.now();
  private mouse: [number, number] = [0, 0];
  /** When true, the live loop stops touching the canvas (used during export). */
  private exporting = false;

  private uTime: WebGLUniformLocation | null = null;
  private uResolution: WebGLUniformLocation | null = null;
  private uMouse: WebGLUniformLocation | null = null;

  private dynamicLocs = new Map<string, WebGLUniformLocation | null>();
  private getUniforms: () => Record<string, number> = () => ({});

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      // Keep the rendered frame readable so we can capture VideoFrames on export.
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 is not supported in this browser.');
    this.gl = gl;
    this.vao = gl.createVertexArray();

    canvas.addEventListener('pointermove', this.onPointerMove);
    this.loop();
  }

  setUniformSource(fn: () => Record<string, number>) {
    this.getUniforms = fn;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse = [
      (e.clientX - rect.left) * window.devicePixelRatio,
      (rect.height - (e.clientY - rect.top)) * window.devicePixelRatio,
    ];
  };

  setShader(fragSource: string): string | null {
    const gl = this.gl;
    const vert = this.compileShader(gl.VERTEX_SHADER, getVertexShader());
    if (typeof vert === 'string') return vert;
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSource);
    if (typeof frag === 'string') {
      gl.deleteShader(vert);
      return frag;
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'Link error';
      gl.deleteProgram(program);
      return log;
    }

    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    this.uTime = gl.getUniformLocation(program, 'uTime');
    this.uResolution = gl.getUniformLocation(program, 'uResolution');
    this.uMouse = gl.getUniformLocation(program, 'uMouse');
    this.dynamicLocs.clear();
    return null;
  }

  private compileShader(type: number, source: string): WebGLShader | string {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? 'Compile error';
      gl.deleteShader(shader);
      return log;
    }
    return shader;
  }

  private resize() {
    const gl = this.gl;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  private setDynamicUniforms() {
    const gl = this.gl;
    if (!this.program) return;
    const values = this.getUniforms();
    for (const name in values) {
      let loc = this.dynamicLocs.get(name);
      if (loc === undefined) {
        loc = gl.getUniformLocation(this.program, name);
        this.dynamicLocs.set(name, loc);
      }
      if (loc !== null) gl.uniform1f(loc, values[name]);
    }
  }

  private loop = () => {
    if (!this.exporting) {
      const gl = this.gl;
      this.resize();
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (this.program) {
        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);
        if (this.uTime)
          gl.uniform1f(this.uTime, (performance.now() - this.startTime) / 1000);
        if (this.uResolution)
          gl.uniform2f(this.uResolution, this.canvas.width, this.canvas.height);
        if (this.uMouse) gl.uniform2f(this.uMouse, this.mouse[0], this.mouse[1]);
        this.setDynamicUniforms();
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  /** Pause the live loop so frames can be rendered deterministically. */
  beginExport() {
    this.exporting = true;
  }

  /** Resume the live loop after an export (canvas size is restored next frame). */
  endExport() {
    this.exporting = false;
  }

  /**
   * Render a single frame at an explicit time and resolution, into the canvas.
   * Call between beginExport()/endExport(). The canvas is resized to w x h.
   */
  renderFrame(timeSeconds: number, w: number, h: number) {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.program) return;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    if (this.uTime) gl.uniform1f(this.uTime, timeSeconds);
    if (this.uResolution) gl.uniform2f(this.uResolution, w, h);
    if (this.uMouse) gl.uniform2f(this.uMouse, this.mouse[0], this.mouse[1]);
    this.setDynamicUniforms();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    if (this.program) this.gl.deleteProgram(this.program);
  }
}

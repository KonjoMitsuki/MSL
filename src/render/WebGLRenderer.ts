import vertexSource from './shaders/fullscreen.vert.glsl?raw';
import dropSource from './shaders/drop.frag.glsl?raw';
import displaySource from './shaders/display.frag.glsl?raw';
import transportSource from './shaders/transport.frag.glsl?raw';
import resolveSource from './shaders/resolve.frag.glsl?raw';
import profileSource from './shaders/profile.frag.glsl?raw';
import { rgb } from '../core/DropTransform';
import type { DropOperation, Point } from '../model/types';

type Surface = { texture: WebGLTexture; framebuffer: WebGLFramebuffer };

export class WebGLRenderer {
  readonly gl: WebGL2RenderingContext;
  private surfaces: Surface[] = [];
  private current = 0;
  private preview = false;
  private programs: WebGLProgram[] = [];
  private dropProgram: WebGLProgram;
  private displayProgram: WebGLProgram;
  private strokeProgram: WebGLProgram;
  private resolveProgram: WebGLProgram;
  private profileProgram: WebGLProgram;
  private profileTexture: WebGLTexture | null = null;
  private profileFramebuffer: WebGLFramebuffer | null = null;
  private mapIndex = 3;
  private transporting = false;
  private transportDirty = false;
  private velocityTexture: WebGLTexture | null = null;
  private velocitySize = 0;
  private vao: WebGLVertexArrayObject;
  zoom = 1;
  pan: Point = { x: 0, y: 0 };

  constructor(readonly canvas: HTMLCanvasElement, readonly resolution = 1024) {
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2が利用できません。対応ブラウザでハードウェアアクセラレーションを有効にしてください。');
    this.gl = gl;
    try {
      gl.disable(gl.BLEND);
      gl.disable(gl.DITHER);
      const vao = gl.createVertexArray();
      if (!vao) throw new Error('GPU描画リソースを確保できません。512pxモードをお試しください。');
      this.vao = vao;
      gl.bindVertexArray(this.vao);
      this.dropProgram = this.program(dropSource);
      this.displayProgram = this.program(displaySource);
      this.strokeProgram = this.program(transportSource);
      this.resolveProgram = this.program(resolveSource);
      this.profileProgram = this.program(profileSource);
      for (let i = 0; i < 2; i++) this.createSurface();
      this.createProfileSurface();
      this.checkError();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private createSurface() {
    const gl = this.gl, resolution = this.resolution;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      throw new Error('GPUメモリを確保できません。512pxモードをお試しください。');
    }
    this.surfaces.push({ texture, framebuffer });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, resolution, resolution);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('水面テクスチャを作成できません。512pxモードをお試しください。');
    }
  }

  private createProfileSurface() {
    const gl = this.gl;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      throw new Error('GPUメモリを確保できません。512pxモードをお試しください。');
    }
    this.profileTexture = texture;
    this.profileFramebuffer = framebuffer;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 128, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('境界プロファイルを作成できません。512pxモードをお試しください。');
    }
  }

  private program(fragmentSource: string): WebGLProgram {
    const gl = this.gl;
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    if (!program) throw new Error('シェーダープログラムを作成できません。');
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('シェーダーを作成できません。');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`シェーダー: ${gl.getShaderInfoLog(shader)}`);
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`GLリンク: ${gl.getProgramInfoLog(program)}`);
      this.programs.push(program);
      return program;
    } catch (error) {
      gl.deleteProgram(program);
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  private bind(program: WebGLProgram, source: number, target: Surface | null) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.surfaces[source].texture);
    gl.uniform1i(gl.getUniformLocation(program, 'uSurface'), 0);
    gl.viewport(0, 0, target ? this.resolution : this.canvas.width, target ? this.resolution : this.canvas.height);
  }

  clear(color: string) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.surfaces[this.current].framebuffer);
    gl.clearColor(...rgb(color), 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.preview = false;
    this.display();
  }

  // Sample 128 rays once from the fixed pre-drop surface. The drop shader then
  // reads this tiny texture while the radius animates, with no CPU readback.
  prepareDrop(center: Point) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.profileProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.profileFramebuffer);
    gl.viewport(0, 0, 128, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.surfaces[this.current].texture);
    gl.uniform1i(gl.getUniformLocation(this.profileProgram, 'uSurface'), 0);
    gl.uniform2f(gl.getUniformLocation(this.profileProgram, 'uCenter'), center.x, center.y);
    gl.uniform1f(gl.getUniformLocation(this.profileProgram, 'uStep'), 2);
    gl.uniform1i(gl.getUniformLocation(this.profileProgram, 'uSteps'), 512);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // current is a fixed pre-drop snapshot. Every preview overwrites ONLY the other surface.
  drop(operation: DropOperation, radius = operation.radius) {
    const gl = this.gl;
    this.bind(this.dropProgram, this.current, this.surfaces[1 - this.current]);
    gl.uniform2f(gl.getUniformLocation(this.dropProgram, 'uCenter'), operation.center.x, operation.center.y);
    gl.uniform1f(gl.getUniformLocation(this.dropProgram, 'uRadius'), radius);
    gl.uniform3f(gl.getUniformLocation(this.dropProgram, 'uColor'), ...rgb(operation.color));
    gl.uniform1f(gl.getUniformLocation(this.dropProgram, 'uResistance'), Math.max(0, Math.min(1, operation.boundaryResistance ?? 0)));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.profileTexture);
    gl.uniform1i(gl.getUniformLocation(this.dropProgram, 'uProfile'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.preview = true;
  }

  commit() {
    if (this.preview) this.current = 1 - this.current;
    this.preview = false;
  }

  discardPreview() { this.preview = false; }

  stroke(a: Point, b: Point, radius: number, strength: number) {
    const gl = this.gl;
    this.bind(this.strokeProgram, this.mapIndex, this.surfaces[7 - this.mapIndex]);
    gl.uniform1i(gl.getUniformLocation(this.strokeProgram, 'uMode'), 1);
    gl.uniform1i(gl.getUniformLocation(this.strokeProgram, 'uVelocity'), 0);
    gl.uniform2f(gl.getUniformLocation(this.strokeProgram, 'uA'), a.x, a.y);
    gl.uniform2f(gl.getUniformLocation(this.strokeProgram, 'uB'), b.x, b.y);
    gl.uniform1f(gl.getUniformLocation(this.strokeProgram, 'uSigma'), radius / 2);
    gl.uniform1f(gl.getUniformLocation(this.strokeProgram, 'uStrength'), strength);
    gl.uniform1f(gl.getUniformLocation(this.strokeProgram, 'uMaxStep'), 2 * 1024 / this.resolution);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.mapIndex = 7 - this.mapIndex;
    this.transportDirty = true;
  }

  beginTransport() {
    const gl = this.gl;
    // Two maps and one fixed pigment snapshot are reused for every pen gesture.
    while (this.surfaces.length < 5) this.createSurface();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.surfaces[this.current].framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, this.surfaces[2].texture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, this.resolution, this.resolution);
    this.mapIndex = 3;
    this.bind(this.strokeProgram, this.current, this.surfaces[this.mapIndex]);
    gl.uniform1i(gl.getUniformLocation(this.strokeProgram, 'uMode'), 0);
    // An inactive sampler must still have a complete, non-feedback binding.
    gl.uniform1i(gl.getUniformLocation(this.strokeProgram, 'uVelocity'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.transporting = true;
    this.transportDirty = false;
  }

  flow(velocity: Float32Array, size: number) {
    const gl = this.gl;
    if (!this.velocityTexture) {
      this.velocityTexture = gl.createTexture();
      if (!this.velocityTexture) throw new Error('流速テクスチャを確保できません。');
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG32F, size, size);
      this.velocitySize = size;
    }
    if (size !== this.velocitySize) throw new Error('流速グリッドのサイズが一致しません。');
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, size, size, gl.RG, gl.FLOAT, velocity);
    this.bind(this.strokeProgram, this.mapIndex, this.surfaces[7 - this.mapIndex]);
    gl.uniform1i(gl.getUniformLocation(this.strokeProgram, 'uMode'), 2);
    gl.uniform1i(gl.getUniformLocation(this.strokeProgram, 'uVelocity'), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.mapIndex = 7 - this.mapIndex;
    this.transportDirty = true;
  }

  private resolveTransport() {
    if (!this.transporting || !this.transportDirty) return;
    const gl = this.gl;
    this.bind(this.resolveProgram, 2, this.surfaces[this.current]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.surfaces[this.mapIndex].texture);
    gl.uniform1i(gl.getUniformLocation(this.resolveProgram, 'uMap'), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    this.transportDirty = false;
  }

  endTransport() {
    this.resolveTransport();
    this.transporting = false;
  }

  display() {
    this.resolveTransport();
    this.bind(this.displayProgram, this.preview ? 1 - this.current : this.current, null);
    this.gl.uniform1f(this.gl.getUniformLocation(this.displayProgram, 'uZoom'), this.zoom);
    this.gl.uniform2f(this.gl.getUniformLocation(this.displayProgram, 'uPan'), this.pan.x, this.pan.y);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.display();
  }

  // RGBA rows are top-to-bottom, independent of the physical viewport and display AA.
  pixels(): Uint8Array {
    this.resolveTransport();
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.surfaces[this.current].framebuffer);
    const raw = new Uint8Array(this.resolution * this.resolution * 4);
    gl.readPixels(0, 0, this.resolution, this.resolution, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const flipped = new Uint8Array(raw.length);
    const row = this.resolution * 4;
    for (let y = 0; y < this.resolution; y++) flipped.set(raw.subarray(y * row, (y + 1) * row), (this.resolution - 1 - y) * row);
    return flipped;
  }

  restore(pixels: Uint8Array) {
    this.transporting = false;
    this.transportDirty = false;
    const gl = this.gl;
    const row = this.resolution * 4;
    const flipped = new Uint8Array(pixels.length);
    for (let y = 0; y < this.resolution; y++) flipped.set(pixels.subarray(y * row, (y + 1) * row), (this.resolution - 1 - y) * row);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.surfaces[this.current].texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.resolution, this.resolution, gl.RGBA, gl.UNSIGNED_BYTE, flipped);
    this.preview = false;
  }

  checkError() {
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) throw new Error(`WebGLエラー (${error})。512pxモードで再読み込みしてください。`);
  }

  get textureCount() { return this.surfaces.length + (this.velocityTexture ? 1 : 0) + 1; }

  dispose() {
    this.gl.deleteTexture(this.velocityTexture);
    this.velocityTexture = null;
    this.gl.deleteFramebuffer(this.profileFramebuffer);
    this.gl.deleteTexture(this.profileTexture);
    this.profileFramebuffer = null;
    this.profileTexture = null;
    for (const surface of this.surfaces) {
      this.gl.deleteFramebuffer(surface.framebuffer);
      this.gl.deleteTexture(surface.texture);
    }
    for (const program of this.programs) this.gl.deleteProgram(program);
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    this.surfaces = [];
    this.programs = [];
  }
}

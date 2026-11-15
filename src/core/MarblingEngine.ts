import { WebGLRenderer } from '../render/WebGLRenderer';
import { rgb, spreadRadius } from './DropTransform';
import { StrokeSampler, strokeSteps } from './StrokeTransform';
import { OperationHistory } from '../history/OperationHistory';
import type { DropOperation, EngineStatus, Operation, Point, StrokeOperation } from '../model/types';

export class MarblingEngine {
  renderer: WebGLRenderer;
  history: OperationHistory;
  private queue: DropOperation[] = [];
  private active: DropOperation | null = null;
  private stroke: { operation: StrokeOperation; snapshot: Uint8Array; sampler: StrokeSampler } | null = null;
  private frame = 0;
  private frames = 0;
  private started = 0;
  private lastFps = 0;
  private lost = false;
  private disposed = false;
  private waiters: Array<() => void> = [];
  onChange: (state: EngineStatus) => void = () => {};
  onError: (message: string) => void = () => {};

  constructor(private canvas: HTMLCanvasElement, readonly resolution = 1024, baseColor = '#278BEC') {
    this.renderer = new WebGLRenderer(canvas, resolution);
    this.renderer.clear(baseColor);
    this.history = this.freshHistory();
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  private freshHistory() {
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    return new OperationHistory(this.renderer.pixels(), 50, memory && memory <= 4 ? 2 : 4);
  }

  get status(): EngineStatus {
    return {
      isAnimating: !!this.active, queuedDrops: this.queue.length, operations: this.history.count, fps: this.lastFps,
      canUndo: this.history.canUndo, canRedo: this.history.canRedo, isStroking: !!this.stroke, contextLost: this.lost,
    };
  }

  enqueue(operation: DropOperation): boolean {
    if (this.lost || this.disposed || this.stroke || (this.active && this.queue.length >= 10)) return false;
    const { x, y } = operation.center;
    if (![x, y, operation.radius, operation.durationMs].every(Number.isFinite) ||
        x < 0 || x > 1024 || y < 0 || y > 1024 || operation.radius < 4 || operation.radius > 180 ||
        operation.durationMs < 0 || operation.durationMs > 1500) return false;
    rgb(operation.color);
    this.queue.push({ ...operation, center: { ...operation.center } });
    if (!this.active) this.next();
    this.emit();
    return true;
  }

  private next() {
    this.active = this.queue.shift() ?? null;
    if (!this.active) {
      for (const resolve of this.waiters.splice(0)) resolve();
      this.emit();
      return;
    }
    this.started = performance.now();
    this.frames = 0;
    if (this.active.durationMs === 0) this.tick(this.started);
    else this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    const op = this.active;
    if (!op) return;
    try {
      const progress = op.durationMs === 0 ? 1 : Math.min(1, (now - this.started) / op.durationMs);
      this.renderer.drop(op, spreadRadius(op.radius, progress));
      this.frames++;
      if (progress === 1) {
        this.renderer.commit();
        this.record(op);
        if (now > this.started) this.lastFps = Math.round(this.frames * 1000 / (now - this.started));
        this.renderer.checkError();
      }
      this.renderer.display();
      if (progress === 1) this.next();
      else this.frame = requestAnimationFrame(this.tick);
    } catch (error) {
      this.cancel();
      this.onError(String(error));
    }
  };

  private apply(operation: Operation) {
    if (operation.type === 'clear') this.renderer.clear(operation.baseColor);
    if (operation.type === 'drop') { this.renderer.drop(operation); this.renderer.commit(); }
    if (operation.type === 'stroke') {
      for (let i = 1; i < operation.points.length; i++) {
        this.applySegment(operation.points[i - 1], operation.points[i], operation.radius, operation.strength);
      }
    }
  }

  private applySegment(a: Point, b: Point, radius: number, strength: number) {
    for (const end of strokeSteps(a, b, radius, strength, this.resolution)) {
      this.renderer.stroke(a, end, radius, strength);
      a = end;
    }
  }

  private record(operation: Operation) {
    this.history.append(operation, () => this.renderer.pixels(), (baseline, oldest) => {
      const current = this.renderer.pixels();
      this.renderer.restore(baseline);
      this.apply(oldest);
      const advanced = this.renderer.pixels();
      this.renderer.restore(current);
      return advanced;
    });
  }

  private replay() {
    const plan = this.history.replayPlan();
    this.renderer.restore(plan.pixels);
    for (const operation of plan.operations) this.apply(operation);
    this.renderer.display();
    this.renderer.checkError();
    this.emit();
  }

  beginStroke(point: Point, radius: number, strength: number): boolean {
    if (this.lost || this.active || this.stroke || this.disposed) return false;
    const spacing = Math.min(radius / 3, 2 * 1024 / this.resolution / strength);
    this.stroke = {
      operation: { type: 'stroke', id: crypto.randomUUID(), points: [{ ...point }], radius, strength },
      snapshot: this.renderer.pixels(),
      sampler: new StrokeSampler(point, spacing),
    };
    this.emit();
    return true;
  }

  moveStroke(point: Point) {
    if (!this.stroke || this.lost) return;
    for (const sample of this.stroke.sampler.push(point)) this.strokePoint(sample);
    this.renderer.display();
  }

  private strokePoint(point: Point) {
    const op = this.stroke!.operation;
    const last = op.points[op.points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < 1e-7) return;
    this.applySegment(last, point, op.radius, op.strength);
    op.points.push({ ...point });
  }

  endStroke(cancel = false) {
    if (!this.stroke) return;
    if (!this.lost) {
      if (cancel) this.renderer.restore(this.stroke.snapshot);
      else {
        this.strokePoint(this.stroke.sampler.endpoint);
        if (this.stroke.operation.points.length > 1) this.record(this.stroke.operation);
      }
      this.renderer.display();
    }
    this.stroke = null;
    this.emit();
  }

  undo() {
    if (this.active || this.stroke || this.lost || !this.history.canUndo) return;
    this.history.undo();
    this.replay();
  }

  redo() {
    if (this.active || this.stroke || this.lost || !this.history.canRedo) return;
    this.history.redo();
    this.replay();
  }

  clear(baseColor: string) {
    if (this.lost) return;
    this.cancel();
    this.renderer.clear(baseColor);
    this.record({ type: 'clear', id: crypto.randomUUID(), baseColor });
    this.emit();
  }

  private emit() { this.onChange(this.status); }

  whenIdle(): Promise<void> {
    return this.active ? new Promise((resolve) => this.waiters.push(resolve)) : Promise.resolve();
  }

  cancel() {
    cancelAnimationFrame(this.frame);
    this.active = null;
    this.queue = [];
    this.endStroke(true);
    this.renderer.discardPreview();
    for (const resolve of this.waiters.splice(0)) resolve();
    this.emit();
  }

  // New document / deterministic test setup. UI reset uses undoable clear().
  reset(baseColor: string) {
    if (this.lost) return;
    this.cancel();
    this.renderer.clear(baseColor);
    this.history = this.freshHistory();
    this.emit();
  }

  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.cancel();
    this.onError('WebGLコンテキストが失われました。復帰待ちです。確定済みの操作はメモリに保持しています。');
  };

  private onRestored = () => {
    if (this.disposed) return;
    try {
      const { zoom, pan } = this.renderer;
      // Context loss already destroys GPU resources. Old handles belong to the lost
      // generation; deleting them after restoration can raise INVALID_OPERATION.
      this.renderer = new WebGLRenderer(this.canvas, this.resolution);
      this.renderer.zoom = zoom;
      this.renderer.pan = pan;
      this.lost = false;
      this.replay();
      this.onError('');
    } catch (error) {
      this.lost = true;
      this.emit();
      this.onError(`復帰に失敗しました: ${String(error)}`);
    }
  };

  dispose() {
    this.disposed = true;
    this.cancel();
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.renderer.dispose();
  }
}

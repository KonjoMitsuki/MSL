import { WebGLRenderer } from '../render/WebGLRenderer';
import { rgb, spreadRadius } from './DropTransform';
import { StrokeSampler, strokeSteps } from './StrokeTransform';
import { OperationHistory } from '../history/OperationHistory';
import { FluidSolver, FLOW_DT, type FlowImpulse } from './FluidSolver';
import {
  DEFAULT_INK, effectiveDropRadius, effectiveSpreadDuration, inkGrowthRate, normalizeInk,
} from './InkModel';
import type { DropOperation, EngineStatus, FlowOperation, InkMaterial, Operation, Point, StrokeOperation, TrailOperation } from '../model/types';

export class MarblingEngine {
  renderer: WebGLRenderer;
  history: OperationHistory;
  private queue: DropOperation[] = [];
  private active: DropOperation | null = null;
  private stroke: { operation: StrokeOperation; snapshot: Uint8Array; sampler: StrokeSampler } | null = null;
  private flowState: {
    operation: FlowOperation; solver: FluidSolver; snapshot: Uint8Array; lastPoint: Point;
    pending: FlowImpulse[]; released: boolean; tail: number; clock: number; accumulator: number;
  } | null = null;
  private flowFrame = 0;
  private trail: { operation: TrailOperation; snapshot: Uint8Array; sampler: StrokeSampler } | null = null;
  private press: {
    operation: DropOperation; baseRadius: number; currentRadius: number; started: number;
    duration: number; maxRadius: number; releasing: boolean;
  } | null = null;
  private pressFrame = 0;
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
      isAnimating: !!this.active || !!this.press, queuedDrops: this.queue.length, operations: this.history.count, fps: this.lastFps,
      canUndo: this.history.canUndo, canRedo: this.history.canRedo, isStroking: !!this.stroke || !!this.flowState || !!this.trail,
      contextLost: this.lost, isFlowing: !!this.flowState, isPressing: !!this.press,
    };
  }

  enqueue(operation: DropOperation): boolean {
    if (this.flowState?.released) this.settleFlow();
    if (this.lost || this.disposed || this.stroke || this.flowState || this.trail || this.press || (this.active && this.queue.length >= 10)) return false;
    const { x, y } = operation.center;
    if (![x, y, operation.radius, operation.durationMs].every(Number.isFinite) ||
        x < 0 || x > 1024 || y < 0 || y > 1024 || operation.radius < 4 || operation.radius > 180 ||
        operation.durationMs < 0 || operation.durationMs > 1500) return false;
    rgb(operation.color);
    const ink = normalizeInk(operation.ink);
    const prepared: DropOperation = {
      ...operation,
      center: { ...operation.center },
      radius: effectiveDropRadius(operation.radius, ink),
      durationMs: effectiveSpreadDuration(operation.durationMs, ink),
      ink,
    };
    this.queue.push(prepared);
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

  // Press-and-hold growth. The fixed pre-drop surface is reused every frame, so
  // holding only changes the radius; releasing commits one ordinary DropOperation.
  beginPressDrop(
    center: Point, radius: number, color: string, durationMs: number,
    waterFade = 0, ink: Partial<InkMaterial> = DEFAULT_INK, maxRadius = 180,
  ): boolean {
    if (this.flowState?.released) this.settleFlow();
    if (this.lost || this.disposed || this.active || this.stroke || this.flowState || this.trail || this.press) return false;
    const fade = Math.max(0, Math.min(1, waterFade));
    const material = normalizeInk(ink);
    if (![center.x, center.y, radius, durationMs, fade, maxRadius].every(Number.isFinite) ||
        center.x < 0 || center.x > 1024 || center.y < 0 || center.y > 1024 ||
        radius < 4 || radius > 180 || durationMs < 0 || durationMs > 1500) return false;
    rgb(color);
    const baseRadius = effectiveDropRadius(radius, material);
    this.press = {
      operation: {
        type: 'drop', id: crypto.randomUUID(), center: { ...center }, radius: baseRadius, color,
        durationMs: 0, ink: material, waterFade: fade,
      },
      baseRadius, currentRadius: 0, started: performance.now(),
      duration: effectiveSpreadDuration(durationMs, material),
      maxRadius: Math.max(baseRadius, Math.min(180, maxRadius)), releasing: false,
    };
    this.renderer.drop(this.press.operation, 0);
    this.renderer.display();
    this.pressTick(performance.now());
    this.emit();
    return true;
  }

  private pressTick = (now: number) => {
    const press = this.press;
    if (!press) return;
    try {
      const elapsed = Math.max(0, now - press.started);
      const growth = inkGrowthRate(press.baseRadius, press.operation.ink);
      let radius: number;
      if (press.duration === 0) radius = Math.min(press.maxRadius, press.baseRadius + elapsed / 1000 * growth);
      else if (elapsed <= press.duration) radius = spreadRadius(press.baseRadius, elapsed / press.duration);
      else {
        // After reaching the chosen size, continued pressure keeps feeding the
        // same pigment. The extra radius is still the exact Jaffer displacement.
        const extra = (elapsed - press.duration) / 1000;
        radius = Math.min(press.maxRadius, press.baseRadius + extra * growth);
      }
      press.currentRadius = radius;
      this.renderer.drop(press.operation, radius);
      this.renderer.display();
      this.renderer.checkError();
      if (press.releasing && radius >= press.baseRadius - 1e-6) { this.commitPress(); return; }
      if (!press.releasing && radius >= press.maxRadius - 1e-6) return;
      this.pressFrame = requestAnimationFrame(this.pressTick);
    } catch (error) {
      this.cancelPressDrop();
      this.onError(String(error));
    }
  };

  releasePressDrop() {
    const press = this.press;
    if (!press) return;
    if (press.duration === 0 || press.currentRadius >= press.baseRadius - 1e-6) {
      this.commitPress();
      return;
    }
    // A short tap still reaches the size chosen in the panel. It simply finishes
    // the same fixed-snapshot animation after the finger leaves.
    press.releasing = true;
  }

  private commitPress() {
    const press = this.press;
    if (!press) return;
    cancelAnimationFrame(this.pressFrame);
    if (press.duration === 0 && press.currentRadius < 4) press.currentRadius = press.baseRadius;
    const radius = Math.max(4, Math.min(180, press.currentRadius));
    press.operation.radius = radius;
    press.operation.durationMs = 0;
    this.press = null;
    this.renderer.drop(press.operation, radius);
    this.renderer.commit();
    this.record(press.operation);
    this.renderer.display();
    this.renderer.checkError();
    this.emit();
    for (const resolve of this.waiters.splice(0)) resolve();
  }

  cancelPressDrop() {
    const press = this.press;
    if (!press) return;
    cancelAnimationFrame(this.pressFrame);
    this.press = null;
    if (!this.lost) { this.renderer.discardPreview(); this.renderer.display(); }
    this.emit();
    for (const resolve of this.waiters.splice(0)) resolve();
  }

  private apply(operation: Operation) {
    if (operation.type === 'clear') this.renderer.clear(operation.baseColor);
    if (operation.type === 'drop') { this.renderer.drop(operation); this.renderer.commit(); }
    if (operation.type === 'trail') {
      for (const center of operation.points) this.applyTrailDrop(operation, center);
    }
    if (operation.type === 'stroke') {
      this.renderer.beginTransport();
      for (let i = 1; i < operation.points.length; i++) {
        this.applySegment(operation.points[i - 1], operation.points[i], operation.radius, operation.strength);
      }
      this.renderer.endTransport();
    }
    if (operation.type === 'flow') {
      const solver = new FluidSolver();
      this.renderer.beginTransport();
      for (const impulses of operation.frames) {
        solver.step(impulses, operation.radius, operation.strength, operation.persistence);
        this.renderer.flow(solver.velocity, solver.size);
      }
      this.renderer.endTransport();
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
    if (this.flowState?.released) this.settleFlow();
    if (this.lost || this.active || this.stroke || this.flowState || this.trail || this.press || this.disposed) return false;
    const spacing = Math.min(radius / 3, 2 * 1024 / this.resolution / strength);
    this.stroke = {
      operation: { type: 'stroke', id: crypto.randomUUID(), points: [{ ...point }], radius, strength },
      snapshot: this.renderer.pixels(),
      sampler: new StrokeSampler(point, spacing),
    };
    this.renderer.beginTransport();
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
        this.renderer.endTransport();
        if (this.stroke.operation.points.length > 1) this.record(this.stroke.operation);
      }
      this.renderer.display();
    }
    this.stroke = null;
    this.emit();
  }

  undo() {
    if (this.active || this.stroke || this.flowState || this.trail || this.press || this.lost || !this.history.canUndo) return;
    this.history.undo();
    this.replay();
  }

  redo() {
    if (this.active || this.stroke || this.flowState || this.trail || this.press || this.lost || !this.history.canRedo) return;
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
    return this.active || this.flowState || this.press ? new Promise((resolve) => this.waiters.push(resolve)) : Promise.resolve();
  }

  beginFlow(point: Point, radius: number, strength: number, persistence = 1.2): boolean {
    if (this.flowState?.released) this.settleFlow();
    if (this.lost || this.disposed || this.active || this.stroke || this.flowState || this.trail || this.press) return false;
    if (![point.x, point.y, radius, strength, persistence].every(Number.isFinite) ||
        radius < 2 || radius > 240 || strength <= 0 || strength > 3 || persistence < 0.2 || persistence > 2) return false;
    this.flowState = {
      operation: { type: 'flow', id: crypto.randomUUID(), radius, strength, persistence, frames: [] },
      solver: new FluidSolver(), snapshot: this.renderer.pixels(), lastPoint: { ...point },
      pending: [], released: false, tail: Math.ceil(persistence / FLOW_DT),
      clock: performance.now(), accumulator: 0,
    };
    this.renderer.beginTransport();
    this.flowFrame = requestAnimationFrame(this.flowTick);
    this.emit();
    return true;
  }

  moveFlow(point: Point) {
    const flow = this.flowState;
    if (!flow || flow.released || !Number.isFinite(point.x + point.y)) return;
    if (Math.hypot(point.x - flow.lastPoint.x, point.y - flow.lastPoint.y) < 0.001) return;
    // Merge collinear coalesced events: input event density must not multiply force.
    const previous = flow.pending.at(-1);
    const a = previous?.a ?? flow.lastPoint;
    const dx = flow.lastPoint.x - a.x, dy = flow.lastPoint.y - a.y;
    const ex = point.x - flow.lastPoint.x, ey = point.y - flow.lastPoint.y;
    if (previous && Math.abs(dx * ey - dy * ex) < 1e-5 && dx * ex + dy * ey >= 0) previous.b = { ...point };
    else flow.pending.push({ a: { ...flow.lastPoint }, b: { ...point } });
    flow.lastPoint = { ...point };
  }

  endFlow(cancel = false) {
    const flow = this.flowState;
    if (!flow) return;
    if (cancel) {
      cancelAnimationFrame(this.flowFrame);
      this.flowState = null;
      if (!this.lost) { this.renderer.restore(flow.snapshot); this.renderer.display(); }
      this.emit();
      for (const resolve of this.waiters.splice(0)) resolve();
    } else flow.released = true;
  }

  // Commit the current frame, including its recorded fixed-step inputs.
  settleFlow() {
    const flow = this.flowState;
    if (!flow || this.lost) return;
    cancelAnimationFrame(this.flowFrame);
    if (flow.pending.length) {
      const impulses = flow.pending.splice(0), op = flow.operation;
      flow.solver.step(impulses, op.radius, op.strength, op.persistence);
      this.renderer.flow(flow.solver.velocity, flow.solver.size);
      op.frames.push(impulses);
    }
    this.flowState = null;
    this.renderer.endTransport();
    if (flow.operation.frames.some((frame) => frame.length)) this.record(flow.operation);
    this.renderer.display();
    this.emit();
    for (const resolve of this.waiters.splice(0)) resolve();
  }

  private flowTick = (now: number) => {
    const flow = this.flowState;
    if (!flow) return;
    try {
      flow.accumulator += Math.min(0.05, (now - flow.clock) / 1000);
      flow.clock = now;
      while (flow.accumulator >= FLOW_DT) {
        const impulses = flow.pending.splice(0);
        const op = flow.operation;
        if (!impulses.length && !op.frames.length) {
          flow.accumulator -= FLOW_DT;
          if (flow.released) { this.settleFlow(); return; }
          continue;
        }
        flow.solver.step(impulses, op.radius, op.strength, op.persistence);
        this.renderer.flow(flow.solver.velocity, flow.solver.size);
        op.frames.push(impulses);
        flow.accumulator -= FLOW_DT;
        if (flow.released && --flow.tail <= 0) { this.settleFlow(); return; }
      }
      this.renderer.display();
      this.renderer.checkError();
      this.flowFrame = requestAnimationFrame(this.flowTick);
    } catch (error) {
      this.endFlow(true);
      this.onError(String(error));
    }
  };

  beginTrail(
    point: Point, radius: number, color: string, spacingRatio = 0.7,
    ink: Partial<InkMaterial> = DEFAULT_INK,
  ): boolean {
    if (this.flowState?.released) this.settleFlow();
    if (this.lost || this.disposed || this.stroke || this.flowState || this.trail || this.press) return false;
    if (![point.x, point.y, radius, spacingRatio].every(Number.isFinite) ||
        radius < 4 || radius > 180 || spacingRatio < 0.3 || spacingRatio > 2) return false;
    rgb(color);
    const material = normalizeInk(ink);
    const effectiveRadius = effectiveDropRadius(radius, material);
    // Finish any preceding taps at their exact final radius before starting the
    // live trail. Continuous drops then commit immediately, without a lagging queue.
    if (this.active) {
      cancelAnimationFrame(this.frame);
      const waiting = [this.active, ...this.queue];
      this.active = null;
      this.queue = [];
      for (const op of waiting) { this.renderer.drop(op); this.renderer.commit(); this.record(op); }
      for (const resolve of this.waiters.splice(0)) resolve();
    }
    // Continuous drops stay opaque: overlapping faded rims would visibly ridge
    // and erode the trail. Water fade is therefore a single-drop/press feature.
    const spacing = Math.max(8, effectiveRadius * spacingRatio);
    this.trail = {
      operation: {
        type: 'trail', id: crypto.randomUUID(), points: [{ ...point }], radius: effectiveRadius,
        color, spacing, ink: material,
      },
      snapshot: this.renderer.pixels(), sampler: new StrokeSampler(point, spacing),
    };
    this.applyTrailDrop(this.trail.operation, point);
    this.renderer.display();
    this.emit();
    return true;
  }

  private applyTrailDrop(op: TrailOperation, center: Point) {
    this.renderer.drop({
      type: 'drop', id: op.id, center, radius: op.radius, color: op.color, durationMs: 0,
      ink: op.ink,
    });
    this.renderer.commit();
  }

  moveTrail(point: Point) {
    if (!this.trail || this.lost) return;
    for (const sample of this.trail.sampler.push(point)) {
      this.applyTrailDrop(this.trail.operation, sample);
      this.trail.operation.points.push(sample);
    }
    this.renderer.display();
  }

  endTrail(cancel = false) {
    const trail = this.trail;
    if (!trail) return;
    this.trail = null;
    if (!this.lost) {
      if (cancel) this.renderer.restore(trail.snapshot);
      else this.record(trail.operation);
      this.renderer.display();
    }
    this.emit();
  }

  cancel() {
    cancelAnimationFrame(this.frame);
    this.active = null;
    this.queue = [];
    this.cancelPressDrop();
    this.endFlow(true);
    this.endTrail(true);
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

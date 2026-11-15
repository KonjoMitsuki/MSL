import type { MarblingEngine } from '../core/MarblingEngine';
import type { Point, Tool } from '../model/types';

type Settings = { tool: Tool; color: string; radius: number; duration: number; brushRadius: number; strength: number };
type View = { zoom: number; pan: Point };

export function toSurface(client: Point, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, view: View): Point {
  return {
    x: (((client.x - rect.left) / rect.width - 0.5 - view.pan.x) / view.zoom + 0.5) * 1024,
    y: (((client.y - rect.top) / rect.height - 0.5 - view.pan.y) / view.zoom + 0.5) * 1024,
  };
}

export function attachPointerController(
  canvas: HTMLCanvasElement,
  engine: MarblingEngine,
  settings: () => Settings,
  onView: (view: View) => void,
  onNote: (message: string) => void,
) {
  const pointers = new Map<number, Point>();
  let space = false;
  let mode: 'none' | 'drop' | 'stroke' | 'pan' | 'pinch' = 'none';
  let pending: { point: Point; start: Point; settings: Settings } | null = null;
  let last: Point = { x: 0, y: 0 };
  let pinch: { distance: number; midpoint: Point; view: View } | null = null;
  const view = (): View => ({ zoom: engine.renderer.zoom, pan: { ...engine.renderer.pan } });
  const point = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });
  const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= 1024 && p.y <= 1024;
  const setView = (next: View) => {
    engine.renderer.zoom = Math.max(0.5, Math.min(4, next.zoom));
    engine.renderer.pan = next.pan;
    engine.renderer.display();
    onView(view());
  };
  const drop = (p: Point, s: Settings) => {
    const accepted = engine.enqueue({ type: 'drop', id: crypto.randomUUID(), center: p, radius: s.radius, color: s.color, durationMs: s.duration });
    onNote(accepted ? '新しいインクが、背景を含むすべての色を押し広げます。' : '入力待機中です。滴下キューは最大10件です。');
  };
  const pinchMetrics = () => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || engine.status.contextLost) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point(event));
    if (pointers.size >= 2) {
      pending = null;
      engine.endStroke(true);
      mode = 'pinch';
      pinch = { ...pinchMetrics(), view: view() };
      return;
    }
    last = point(event);
    const s = settings();
    if (s.tool === 'pan' || space) { mode = 'pan'; return; }
    const p = toSurface(last, canvas.getBoundingClientRect(), view());
    if (!inside(p)) { mode = 'none'; return; }
    if (s.tool === 'stroke') {
      mode = engine.beginStroke(p, s.brushRadius, s.strength) ? 'stroke' : 'none';
      if (mode === 'none') onNote('滴下が完了してから変形ペンを使えます。');
    } else {
      mode = 'drop';
      if (event.pointerType === 'mouse') drop(p, s);
      else pending = { point: p, start: last, settings: { ...s } };
    }
  };
  const move = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, point(event));
    const rect = canvas.getBoundingClientRect();
    if (mode === 'pinch' && pointers.size >= 2 && pinch) {
      const metrics = pinchMetrics();
      const zoom = Math.max(0.5, Math.min(4, pinch.view.zoom * metrics.distance / pinch.distance));
      const ratio = zoom / pinch.view.zoom;
      const origin = { x: (pinch.midpoint.x - rect.left) / rect.width - 0.5, y: (pinch.midpoint.y - rect.top) / rect.height - 0.5 };
      setView({ zoom, pan: {
        x: (metrics.midpoint.x - rect.left) / rect.width - 0.5 - (origin.x - pinch.view.pan.x) * ratio,
        y: (metrics.midpoint.y - rect.top) / rect.height - 0.5 - (origin.y - pinch.view.pan.y) * ratio,
      } });
    } else if (mode === 'pan') {
      const v = view();
      setView({ zoom: v.zoom, pan: { x: v.pan.x + (event.clientX - last.x) / rect.width, y: v.pan.y + (event.clientY - last.y) / rect.height } });
    } else if (mode === 'stroke') {
      const events = event.getCoalescedEvents?.() ?? [];
      for (const sample of events.length ? events : [event]) {
        const p = toSurface(point(sample), rect, view());
        engine.moveStroke({ x: Math.max(0, Math.min(1024, p.x)), y: Math.max(0, Math.min(1024, p.y)) });
      }
    } else if (pending && Math.hypot(event.clientX - pending.start.x, event.clientY - pending.start.y) > 8) pending = null;
    last = point(event);
  };
  const up = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    if (mode === 'stroke') { move(event); engine.endStroke(); }
    if (mode === 'drop' && pending) {
      if (Math.hypot(event.clientX - pending.start.x, event.clientY - pending.start.y) <= 8) drop(pending.point, pending.settings);
    }
    pending = null;
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    // Never interpret a remaining finger after a pinch as a new ink gesture.
    if (pointers.size === 0) { mode = 'none'; pinch = null; }
  };
  const cancel = () => {
    engine.endStroke(true);
    pointers.clear();
    pending = null;
    mode = 'none';
    pinch = null;
  };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect(), v = view();
    const zoom = Math.max(0.5, Math.min(4, v.zoom * Math.exp(-event.deltaY * 0.001)));
    const ratio = zoom / v.zoom;
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    setView({ zoom, pan: { x: x - (x - v.pan.x) * ratio, y: y - (y - v.pan.y) * ratio } });
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.code === 'Space') { space = true; event.preventDefault(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) engine.redo(); else engine.undo();
    }
  };
  const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') space = false; };
  const blur = () => { space = false; cancel(); };
  const lostCapture = (event: PointerEvent) => { if (pointers.has(event.pointerId)) cancel(); };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', lostCapture);
  canvas.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', blur);
  return () => {
    cancel();
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', cancel);
    canvas.removeEventListener('lostpointercapture', lostCapture);
    canvas.removeEventListener('wheel', wheel);
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
  };
}

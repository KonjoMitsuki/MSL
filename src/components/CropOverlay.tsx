import { useRef } from 'react';
import { aspectRatio, moveCrop, resizeCrop, type CropAspect, type CropHandle, type CropRect } from '../export/crop';

type Props = { crop: CropRect; aspect: CropAspect; onChange: (next: CropRect) => void };

export function CropOverlay({ crop, aspect, onChange }: Props) {
  const overlay = useRef<HTMLDivElement>(null);
  const drag = useRef<{ type: 'move' | CropHandle; clientX: number; clientY: number; start: CropRect } | null>(null);
  const ratio = aspectRatio(aspect);

  const toVirtual = (clientX: number, clientY: number) => {
    const rect = overlay.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width * 1024, y: (clientY - rect.top) / rect.height * 1024 };
  };
  const begin = (event: React.PointerEvent, type: 'move' | CropHandle) => {
    event.preventDefault();
    event.stopPropagation();
    overlay.current!.setPointerCapture(event.pointerId);
    drag.current = { type, clientX: event.clientX, clientY: event.clientY, start: crop };
  };
  const move = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current || !overlay.current?.hasPointerCapture(event.pointerId)) return;
    if (current.type === 'move') {
      const rect = overlay.current.getBoundingClientRect();
      const dx = (event.clientX - current.clientX) / rect.width * 1024;
      const dy = (event.clientY - current.clientY) / rect.height * 1024;
      onChange(moveCrop(current.start, dx, dy));
    } else {
      const p = toVirtual(event.clientX, event.clientY);
      onChange(resizeCrop(current.start, current.type, p.x, p.y, ratio));
    }
  };
  const end = (event: React.PointerEvent) => {
    if (overlay.current?.hasPointerCapture(event.pointerId)) overlay.current.releasePointerCapture(event.pointerId);
    drag.current = null;
  };

  return <div ref={overlay} className="crop-overlay" aria-label="切り抜き範囲"
    onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    <div className="crop-box" data-testid="crop-box" role="group" aria-label="ドラッグで移動する切り抜き範囲"
      style={{ left: `${crop.x / 10.24}%`, top: `${crop.y / 10.24}%`, width: `${crop.width / 10.24}%`, height: `${crop.height / 10.24}%` }}
      onPointerDown={(event) => begin(event, 'move')}>
      <span className="crop-grid" aria-hidden="true" />
      {(['nw', 'ne', 'se', 'sw'] as const).map((handle) => <span key={handle} className={`crop-handle crop-${handle}`}
        data-handle={handle} aria-hidden="true" onPointerDown={(event) => begin(event, handle)} />)}
    </div>
  </div>;
}

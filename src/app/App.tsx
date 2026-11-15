import { useEffect, useRef, useState } from 'react';
import { MarblingEngine } from '../core/MarblingEngine';
import { BLUE, defaults, demoDrops, RED } from '../model/defaults';
import type { EngineStatus, Point, Tool } from '../model/types';
import { attachPointerController } from '../input/pointerController';
import { SettingsPanel } from '../components/SettingsPanel';
import { downloadPng, exportPng } from '../export/exportPng';
import { version } from '../../package.json';

declare global { interface Window { __lab?: MarblingEngine } }

const toolNames = { drop: '滴下', stroke: '変形ペン', flow: '流体ペン', pan: '移動' };
const initialStatus: EngineStatus = { isAnimating: false, queuedDrops: 0, operations: 0, fps: 0, canUndo: false, canRedo: false, isStroking: false, contextLost: false };

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MarblingEngine | null>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const [color, setColor] = useState(defaults.activeColor);
  const [base, setBase] = useState(defaults.baseColor);
  const [radius, setRadius] = useState(defaults.dropRadius);
  const [duration, setDuration] = useState(defaults.spreadDurationMs);
  const [brushRadius, setBrushRadius] = useState(defaults.brushRadius);
  const [strength, setStrength] = useState(defaults.brushStrength);
  const [persistence, setPersistence] = useState(1.2);
  const [dropSpacing, setDropSpacing] = useState(0.7);
  const [tool, setTool] = useState<Tool>('drop');
  const [resolution, setResolution] = useState(() => new URLSearchParams(location.search).get('resolution') === '512' ? 512 : 1024);
  const [view, setView] = useState<{ zoom: number; pan: Point }>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [status, setStatus] = useState<EngineStatus>(initialStatus);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState('タップで一滴、なぞると指に沿って連続滴下。');
  const settingsRef = useRef({ tool, color, radius, duration, brushRadius, strength, persistence, dropSpacing });
  settingsRef.current = { tool, color, radius, duration, brushRadius, strength, persistence, dropSpacing };
  const baseRef = useRef(base);
  baseRef.current = base;
  const busy = status.isAnimating || status.isStroking || status.contextLost || !ready;

  useEffect(() => {
    const canvas = canvasRef.current!;
    let engine: MarblingEngine;
    setReady(false);
    setError('');
    try {
      engine = new MarblingEngine(canvas, resolution, baseRef.current);
      engineRef.current = engine;
      engine.onChange = setStatus;
      engine.onError = setError;
      setStatus(engine.status);
      setView({ zoom: 1, pan: { x: 0, y: 0 } });
      setReady(true);
      if (import.meta.env.DEV) window.__lab = engine;
    } catch (err) {
      setError(String(err));
      return;
    }
    const detach = attachPointerController(canvas, engine, () => settingsRef.current, setView, setNote);
    const resize = new ResizeObserver(([entry]) => {
      if (engine.status.contextLost) return;
      const size = Math.max(1, Math.round(entry.contentRect.width * Math.min(devicePixelRatio, 2)));
      engine.renderer.resize(size, size);
    });
    resize.observe(canvas);
    return () => {
      resize.disconnect();
      detach();
      engine.dispose();
      engineRef.current = null;
      delete window.__lab;
    };
  }, [resolution]);

  function fit() {
    const renderer = engineRef.current?.renderer;
    if (!renderer) return;
    renderer.zoom = 1;
    renderer.pan = { x: 0, y: 0 };
    renderer.display();
    setView({ zoom: 1, pan: { x: 0, y: 0 } });
  }

  function zoomBy(factor: number) {
    const renderer = engineRef.current?.renderer;
    if (!renderer) return;
    const zoom = Math.max(0.5, Math.min(4, renderer.zoom * factor));
    const ratio = zoom / renderer.zoom;
    renderer.pan = { x: renderer.pan.x * ratio, y: renderer.pan.y * ratio };
    renderer.zoom = zoom;
    renderer.display();
    setView({ zoom, pan: { ...renderer.pan } });
  }

  function clear() {
    if (confirm('水面を選択した背景色へ戻しますか？ Undoで元に戻せます。')) {
      engineRef.current?.clear(base);
      setNote('背景色へ戻しました。Undoで直前の水面に戻せます。');
    }
  }

  async function demo() {
    const engine = engineRef.current;
    if (!engine || status.contextLost) return;
    if (status.operations > 0 && !confirm('新しい水面でAT-03を再生しますか？ 現在の作品と履歴は置き換わります。')) return;
    engine.reset(BLUE);
    fit();
    setBase(BLUE);
    setTool('drop');
    setNote('AT-03 再生中：青い水面 → 紫 (420, 512) → 赤 (690, 512)');
    for (const op of demoDrops()) engine.enqueue(op);
    await engine.whenIdle();
    if (engine !== engineRef.current || engine.status.contextLost) return;
    setColor(RED);
    setRadius(80);
    setNote('AT-03：赤の左に青、その左に変形した紫。もう一滴で、水面全体の移動を観察できます。');
  }

  async function save() {
    const engine = engineRef.current;
    if (!engine || busy) return;
    try {
      downloadPng(await exportPng(engine.renderer.pixels(), resolution));
      setNote(`${resolution} × ${resolution} のPNGを書き出しました。表示のズームやUIは含みません。`);
    } catch (err) { setError(String(err)); }
  }

  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">◉</span><div><h1>Marbling Surface Lab</h1><span className="eyebrow">色流しの実験室 / v{version}</span></div></div>
      <nav className="actions" aria-label="編集操作">
        <button aria-label="Undo" title="Undo · Ctrl / Cmd + Z" disabled={busy || !status.canUndo} onClick={() => engineRef.current?.undo()}>↶ <span>Undo</span></button>
        <button aria-label="Redo" title="Redo · Ctrl / Cmd + Shift + Z" disabled={busy || !status.canRedo} onClick={() => engineRef.current?.redo()}>↷ <span>Redo</span></button>
        <button disabled={busy} onClick={clear}>全消去</button>
        <button disabled={busy} onClick={save}>PNG保存</button>
        <button aria-label="簡易ヘルプ" onClick={() => helpRef.current?.showModal()}>?</button>
      </nav>
      <button className="primary" disabled={busy} onClick={demo}>▶ AT-03 デモを再生</button>
    </header>
    <main className="workspace">
      <aside className="tools"><span className="eyebrow">TOOLS</span>
        {(['drop', 'stroke', 'flow', 'pan'] as const).map((name, index) => <button key={name} className={`tool ${tool === name ? 'selected' : ''}`} aria-pressed={tool === name} onClick={() => {
          setTool(name);
          setNote(name === 'flow' ? '流体ペン：色の境界を横切るようにドラッグ。余韻で流れの続く時間を調整できます。'
            : name === 'stroke' ? '変形ペン：水面をつかんで長く引き延ばせます。半径と強度を調整してみてください。'
            : name === 'drop' ? 'タップで一滴、なぞると指に沿って連続滴下します。' : 'ドラッグで移動、ホイール・ピンチで拡大縮小。');
        }}><span>{['◉', '〰', '≈', '✥'][index]}</span>{toolNames[name]}</button>)}
        <div className="tool-note">色を落とす。<br />水面が動く。</div>
      </aside>
      <section className="surface-area" aria-label="水面">
        <div className="surface-heading"><span>01 / SURFACE</span><span>{resolution} × {resolution} · WebGL2</span></div>
        <div className={`canvas-frame tool-${tool}`}>
          <canvas ref={canvasRef} tabIndex={0} aria-label="マーブリング水面"
            onPointerMove={(event) => {
              const cursor = cursorRef.current!;
              if (tool === 'pan') { cursor.style.display = 'none'; return; }
              const rect = event.currentTarget.getBoundingClientRect();
              const diameter = 2 * (tool === 'drop' ? radius : brushRadius) * view.zoom * rect.width / 1024;
              Object.assign(cursor.style, { display: 'block', width: `${diameter}px`, height: `${diameter}px`,
                left: `${event.clientX - rect.left}px`, top: `${event.clientY - rect.top}px` });
            }}
            onPointerLeave={() => { if (cursorRef.current) cursorRef.current.style.display = 'none'; }}
            onPointerUp={(event) => { if (event.pointerType !== 'mouse' && cursorRef.current) cursorRef.current.style.display = 'none'; }} />
          <div ref={cursorRef} className="brush-cursor" aria-hidden="true" />
        </div>
        <div className="view-controls"><button aria-label="縮小" disabled={!ready || status.contextLost} onClick={() => zoomBy(0.8)}>−</button><button aria-label="表示をフィット" disabled={!ready || status.contextLost} onClick={fit}>{Math.round(view.zoom * 100)}% · FIT</button><button aria-label="拡大" disabled={!ready || status.contextLost} onClick={() => zoomBy(1.25)}>＋</button><span>ホイール / ピンチで拡大</span></div>
        <p className="surface-caption" aria-live="polite"><span className="live-dot" />{note}</p>
        {status.isFlowing && <button className="stop-flow" onClick={() => engineRef.current?.settleFlow()}>流れを止めて確定</button>}
        {error && <div role="alert" className="error">{error}</div>}
      </section>
      <SettingsPanel {...{ color, base, radius, duration, brushRadius, strength, resolution, tool, persistence, setPersistence, dropSpacing, setDropSpacing, setColor, setBase, setRadius, setDuration, setBrushRadius, setStrength, clear }} disabled={busy}
        setResolution={(value) => {
          if (!confirm('解像度を変更すると、新しい水面になり作品と履歴が消えます。続けますか？')) return;
          setResolution(value);
          setNote(`${value}pxの新しい水面を作成しました。半径と座標は1024基準です。`);
        }} />
    </main>
    <footer><span><span className="live-dot" />{status.contextLost ? '復帰待ち' : status.isFlowing ? '流体計算中' : status.isAnimating ? '広がり中' : status.isStroking ? '変形中' : 'READY'} {status.queuedDrops > 0 && `· 待機 ${status.queuedDrops}/10`}</span><span>{Math.round(view.zoom * 100)}% <i />{toolNames[tool]}<i />{status.operations} 操作 {import.meta.env.DEV && <><i />{status.fps || '—'} fps</>}</span><span>LOCAL ONLY · 独立したアートツール</span></footer>
    <dialog ref={helpRef} className="help-dialog">
      <h2>水面を、動かしてみる。</h2>
      <p>滴下：クリック・タップでインクを投入。新しい円の外側では、背景を含む旧水面全体を逆写像で押し出します。</p>
      <p>連続滴下：滴下ツールでなぞると、指の軌跡に沿って一定間隔で滴を落とします。「連続滴下の間隔」で密度を調整。即時描画で指に追従し、軌跡全体がUndoの1操作になります。</p>
      <p>変形ペン：ドラッグで色の境界を引き延ばします。1本のドラッグが1操作。キャンセル時は元に戻ります。</p>
      <p>流体ペン：64×64の流速・圧力場を計算して水面全体を移流します。指を離した後の余韻も含めて1操作。流れが止まるとUndo・PNG保存が使えます。「流れを止めて確定」で途中停止できます。</p>
      <p>色：4種類のパレットと自由なHEX・カラーピッカー。「この色を保存」で最大24色をこのブラウザに保存できます。</p>
      <p>移動：移動ツールまたはSpace＋ドラッグ。ホイール・2本指ピンチで拡大縮小します。</p>
      <p>Undo：Ctrl / Cmd＋Z。Redo：Ctrl / Cmd＋Shift＋Z。最大50操作。全消去もUndoできます。</p>
      <p>AT-03：青背景に紫130px、赤80pxを順に投入。赤と紫の間に残る青と、紫の変形を観察してください。</p>
      <p>作品は自動保存されません。PNG保存で水面だけを書き出せます。DWSの公式・提携サービスではありません。</p>
      <form method="dialog"><button className="primary">閉じる</button></form>
    </dialog>
  </div>;
}

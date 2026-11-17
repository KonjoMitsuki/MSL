import { useCallback, useEffect, useRef, useState } from 'react';
import { MarblingEngine } from '../core/MarblingEngine';
import { DEFAULT_INK, effectiveDropRadius, effectiveSpreadDuration, normalizeInk } from '../core/InkModel';
import { BLUE, defaults, demoDrops, RED } from '../model/defaults';
import type { EngineStatus, InkMaterial, Point, Tool } from '../model/types';
import { attachPointerController, toSurface } from '../input/pointerController';
import { SettingsPanel } from '../components/SettingsPanel';
import { BottomSheet } from '../components/BottomSheet';
import { ColorPicker } from '../components/ColorPicker';
import { QuickControls } from '../components/QuickControls';
import { ToolDock, toolNames, toolHints } from '../components/ToolDock';
import { CropControls } from '../components/CropControls';
import { EditorHelp } from '../components/EditorHelp';
import { PhotoExport, type PhotoExportImage } from '../components/PhotoExport';
import { CropOverlay } from '../components/CropOverlay';
import { aspectRatio, clampCrop, cropOutputHeight, withAspect, type CropAspect, type CropRect } from '../export/crop';
import { createPngFile, downloadPng, exportCropPng, exportPng } from '../export/exportPng';
import { version } from '../../package.json';

declare global { interface Window { __lab?: MarblingEngine } }

const INK_STORAGE = 'msl.ink-profiles.v1';

function loadInkProfiles(): Record<string, InkMaterial> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(INK_STORAGE) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, InkMaterial> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!/^#[0-9A-F]{6}$/i.test(key) || !value || typeof value !== 'object') continue;
      const candidate = value as Partial<InkMaterial>;
      if (!Number.isFinite(candidate.viscosity) || !Number.isFinite(candidate.surfaceTension)) continue;
      result[key.toUpperCase()] = normalizeInk(candidate);
    }
    return result;
  } catch {
    return {};
  }
}

const initialStatus: EngineStatus = { isAnimating: false, queuedDrops: 0, operations: 0, fps: 0, canUndo: false, canRedo: false, isStroking: false, contextLost: false };

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MarblingEngine | null>(null);
  const [sheet, setSheet] = useState<'colors' | 'settings' | 'export' | 'help' | null>(null);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const openColors = useCallback(() => { setSampling(false); setSheet('colors'); }, []);
  const openSettings = useCallback(() => { setSampling(false); setSheet('settings'); }, []);
  const openHelp = useCallback(() => { setSampling(false); setSheet('help'); }, []);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [photoExport, setPhotoExport] = useState<PhotoExportImage | null>(null);
  const photoButtonRef = useRef<HTMLButtonElement>(null);
  const [color, setColor] = useState(defaults.activeColor);
  const [sampling, setSampling] = useState(false);
  const samplingRef = useRef(false);
  samplingRef.current = sampling;
  const [samplePoint, setSamplePoint] = useState<Point>({ x: 512, y: 512 });
  const [base, setBase] = useState(defaults.baseColor);
  const [radius, setRadius] = useState(defaults.dropRadius);
  const [duration, setDuration] = useState(defaults.spreadDurationMs);
  const [brushRadius, setBrushRadius] = useState(defaults.brushRadius);
  const [strength, setStrength] = useState(defaults.brushStrength);
  const [persistence, setPersistence] = useState(1.2);
  const [dropSpacing, setDropSpacing] = useState(0.7);
  const [inkProfiles, setInkProfiles] = useState<Record<string, InkMaterial>>(loadInkProfiles);
  const [ink, setInk] = useState<InkMaterial>(DEFAULT_INK);
  const [waterFade, setWaterFade] = useState(0);
  const [tool, setTool] = useState<Tool>('drop');
  const [resolution, setResolution] = useState(() => new URLSearchParams(location.search).get('resolution') === '512' ? 512 : 1024);
  const [view, setView] = useState<{ zoom: number; pan: Point }>({ zoom: 1, pan: { x: 0, y: 0 } });
  const [status, setStatus] = useState<EngineStatus>(initialStatus);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState('タップで一滴、押し続けるとその場で広がります。なぞると連続滴下。');
  const [cropMode, setCropMode] = useState(false);
  const cropModeRef = useRef(false);
  cropModeRef.current = cropMode;
  const [crop, setCrop] = useState<CropRect>({ x: 128, y: 128, width: 768, height: 768 });
  const [cropAspect, setCropAspect] = useState<CropAspect>('1:1');
  const [cropOutputWidth, setCropOutputWidth] = useState(1024);
  const outputWidth = Math.max(64, Math.min(2048, Math.round(cropOutputWidth || 1024)));
  const outputHeight = cropOutputHeight(crop, outputWidth, aspectRatio(cropAspect));
  useEffect(() => { setInk(inkProfiles[color.toUpperCase()] ?? DEFAULT_INK); }, [color]);
  const changeInk = (patch: Partial<InkMaterial>) => {
    const next = normalizeInk({ ...ink, ...patch });
    setInk(next);
    setInkProfiles((previous) => {
      const profiles = { ...previous, [color.toUpperCase()]: next };
      try { localStorage.setItem(INK_STORAGE, JSON.stringify(profiles)); } catch { /* storage may be unavailable */ }
      return profiles;
    });
  };
  const resetInk = () => {
    setInk({ ...DEFAULT_INK });
    setInkProfiles((previous) => {
      const profiles = { ...previous };
      delete profiles[color.toUpperCase()];
      try { localStorage.setItem(INK_STORAGE, JSON.stringify(profiles)); } catch { /* storage may be unavailable */ }
      return profiles;
    });
  };
  const effectiveRadius = effectiveDropRadius(radius, ink);
  const effectiveDuration = effectiveSpreadDuration(duration, ink);
  const settingsRef = useRef({ tool, color, radius, duration, brushRadius, strength, persistence, dropSpacing, ink, waterFade });
  settingsRef.current = { tool, color, radius, duration, brushRadius, strength, persistence, dropSpacing, ink, waterFade };
  const baseRef = useRef(base);
  baseRef.current = base;
  const busy = status.isAnimating || status.isStroking || status.contextLost || !ready || exporting;

  function sampleSurface(point: Point) {
    const engine = engineRef.current;
    if (!engine || engine.status.contextLost) return;
    try {
      const picked = engine.renderer.sampleColor(point);
      if (!picked) { setNote('水面の内側を選んでください。'); return; }
      setColor(picked);
      setSampling(false);
      setNote(`水面から ${picked} を選びました。`);
    } catch (err) {
      setSampling(false);
      setError(String(err));
    }
  }

  function startSampling() {
    const canvas = canvasRef.current;
    const renderer = engineRef.current?.renderer;
    if (!canvas || !renderer || busy) return;
    const rect = canvas.getBoundingClientRect();
    const center = toSurface({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, rect, renderer);
    setSamplePoint({ x: Math.max(0, Math.min(1023, center.x)), y: Math.max(0, Math.min(1023, center.y)) });
    setSheet(null);
    setSampling(true);
    setNote('スポイト：水面をタップして色を選択。矢印キーで位置を動かし、Enterで選択。Escで中止。');
    requestAnimationFrame(() => canvas.focus({ preventScroll: true }));
  }

  useEffect(() => {
    if (!sampling) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        setSampling(false);
        setNote('スポイトを中止しました。');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sampling]);

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
    const detach = attachPointerController(canvas, engine, () => settingsRef.current, setView, setNote,
      () => cropModeRef.current || sheetRef.current !== null, () => samplingRef.current, sampleSurface);
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
    if (confirm('水面を選択した背景色へ戻しますか？ 元に戻す（↶）で取り消せます。')) {
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

  async function save(destination: 'photo' | 'download') {
    const engine = engineRef.current;
    if (!engine || busy) return;
    setExporting(true);
    try {
      const blob = await exportPng(engine.renderer.pixels(), resolution, engine.renderer.background);
      if (destination === 'photo') {
        setPhotoExport({ file: createPngFile(blob), width: resolution, height: resolution });
        setSheet('export');
      } else {
        downloadPng(blob);
        setExportMessage('PNGのダウンロードを開始しました。');
      }
      setNote(`${resolution} × ${resolution} のPNGを書き出しました。表示のズームやUIは含みません。`);
    } catch (err) { setError(String(err)); } finally { setExporting(false); }
  }

  function toggleCrop() {
    if (busy) return;
    if (cropMode) {
      setCropMode(false);
      setNote('切り抜きを終了しました。水面の編集に戻れます。');
      return;
    }
    fit();
    setCrop((current) => withAspect(current, aspectRatio(cropAspect)));
    setCropMode(true);
    setNote('枠をドラッグして移動、四隅でリサイズ。比率と出力サイズを選んで書き出せます。');
  }

  function changeAspect(next: CropAspect) {
    setCropAspect(next);
    const ratio = aspectRatio(next);
    if (ratio) setCrop((current) => withAspect(current, ratio));
  }

  function setCropField(key: keyof CropRect, value: number) {
    setCrop((current) => {
      const ratio = aspectRatio(cropAspect);
      if (ratio && (key === 'width' || key === 'height')) {
        const width = key === 'width' ? value : value * ratio;
        const height = key === 'width' ? value / ratio : value;
        return clampCrop({ ...current, width, height });
      }
      return clampCrop({ ...current, [key]: value });
    });
  }

  async function saveCrop(destination: 'photo' | 'download') {
    const engine = engineRef.current;
    if (!engine || busy) return;
    setExporting(true);
    try {
      const blob = await exportCropPng(engine.renderer.pixels(), resolution, crop, outputWidth, outputHeight, engine.renderer.background);
      if (destination === 'photo') {
        setPhotoExport({ file: createPngFile(blob, 'marbling-crop'), width: outputWidth, height: outputHeight });
        setSheet('export');
      } else { downloadPng(blob, 'marbling-crop'); }
      setNote(`${outputWidth} × ${outputHeight}px の切り抜きPNGを書き出しました。選択範囲だけを元の色で出力します。`);
    } catch (err) { setError(String(err)); } finally { setExporting(false); }
  }

  return <div className="app">
    <header className="topbar">
      <div className="brand"><h1>MSL</h1><small>v{version}</small></div>
      <nav className="actions" aria-label="編集操作">
        <button className="icon-button" aria-label="Undo" title="元に戻す · Ctrl / Cmd + Z" disabled={busy || !status.canUndo} onClick={() => engineRef.current?.undo()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 8 4 12l5 4M4 12h10a6 6 0 0 1 6 6" /></svg></button>
        <button className="icon-button" aria-label="Redo" title="やり直す · Ctrl / Cmd + Shift + Z" disabled={busy || !status.canRedo} onClick={() => engineRef.current?.redo()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 8 5 4-5 4m5-4H10a6 6 0 0 0-6 6" /></svg></button>
        <button className="primary icon-button" aria-label="作品を書き出す" title="写真に保存・PNG保存・切り抜き" aria-haspopup="dialog" disabled={busy} onClick={() => { setExportMessage(''); setPhotoExport(null); setSheet('export'); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3" /></svg></button>
      </nav>
    </header>
    <main className="workspace">
      <section className="surface-area" aria-label="水面">
        <div className={`canvas-frame tool-${tool} ${cropMode ? 'tool-crop' : ''} ${sampling ? 'tool-sample' : ''}`}>
          <canvas ref={canvasRef} tabIndex={0} aria-label="マーブリング水面" aria-describedby="canvas-instructions"
            onKeyDown={(event) => {
              if (!sampling) return;
              if (event.key === 'Enter') { event.preventDefault(); sampleSurface(samplePoint); }
              if (event.key.startsWith('Arrow')) {
                const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
                if (!direction) return;
                event.preventDefault();
                const step = (event.shiftKey ? 1 : 16) / view.zoom;
                setSamplePoint(previous => ({
                  x: Math.max(0, Math.min(1023, previous.x + direction[0] * step)),
                  y: Math.max(0, Math.min(1023, previous.y + direction[1] * step)),
                }));
              }
            }}
            onPointerMove={(event) => {
              const cursor = cursorRef.current!;
              if (sampling || cropMode || tool === 'pan' || event.pointerType === 'touch') { cursor.style.display = 'none'; return; }
              const rect = event.currentTarget.getBoundingClientRect();
              const diameter = 2 * (tool === 'drop' ? effectiveRadius : brushRadius) * view.zoom * rect.width / 1024;
              Object.assign(cursor.style, { display: 'block', width: `${diameter}px`, height: `${diameter}px`,
                left: `${event.clientX - rect.left}px`, top: `${event.clientY - rect.top}px` });
            }}
            onPointerLeave={() => { if (cursorRef.current) cursorRef.current.style.display = 'none'; }}
            onPointerUp={(event) => { if (event.pointerType !== 'mouse' && cursorRef.current) cursorRef.current.style.display = 'none'; }} />
          <div ref={cursorRef} className="brush-cursor" aria-hidden="true" />
          {sampling && <>
            <div className="sample-marker" aria-hidden="true" style={{
              left: `${((samplePoint.x / 1024 - .5) * view.zoom + .5 + view.pan.x) * 100}%`,
              top: `${((samplePoint.y / 1024 - .5) * view.zoom + .5 + view.pan.y) * 100}%`,
            }} />
            <div className="sample-toolbar"><span>水面をタップして色を選ぶ</span><button onClick={() => { setSampling(false); setNote('スポイトを中止しました。'); }}>中止</button></div>
          </>}
          {cropMode && !status.contextLost && <CropOverlay crop={crop} aspect={cropAspect} onChange={setCrop} />}
        </div>
        <div className="view-controls"><button aria-label="縮小" title="縮小" disabled={!ready || status.contextLost || cropMode} onClick={() => zoomBy(0.8)}>−</button><button aria-label="表示をフィット" title="全体表示" disabled={!ready || status.contextLost || cropMode} onClick={fit}>{Math.round(view.zoom * 100)}%</button><button aria-label="拡大" title="拡大" disabled={!ready || status.contextLost || cropMode} onClick={() => zoomBy(1.25)}>＋</button></div>
        <p id="canvas-instructions" className="surface-caption" aria-live="polite">{note}</p>
        {status.isFlowing && <button className="stop-flow" onClick={() => engineRef.current?.settleFlow()}>流れを止めて確定</button>}
        {error && <div role="alert" className="error">{error}</div>}
      </section>
      <div className="control-area">
        {cropMode ? <CropControls {...{ cropAspect, changeAspect, crop, setCropField, cropOutputWidth, setCropOutputWidth, outputWidth, outputHeight, saveCrop, toggleCrop }} disabled={busy} /> :
          <QuickControls {...{ tool, color, radius, brushRadius, strength, persistence, dropSpacing, setRadius, setBrushRadius, setStrength, setPersistence, setDropSpacing, openColors, openSettings, openHelp }} />}
        <ToolDock tool={tool} disabled={cropMode || status.isPressing === true || (status.isStroking && !status.isFlowing)} onChange={(next) => { setSampling(false); setTool(next); setNote(toolHints[next]); }} />
      </div>
    </main>
    <footer><span>{status.contextLost ? '描画の復帰待ち' : status.isPressing ? '滴を広げています' : status.isFlowing ? '水面が流れています' : status.isAnimating ? '滴が広がっています' : status.isStroking ? '水面を変形しています' : '描画できます'} {status.queuedDrops > 0 && `· 待機 ${status.queuedDrops}/10`}</span><span>{status.operations} 操作 · 作品は自動保存されません</span></footer>
    <BottomSheet title={sheet === 'colors' ? 'カラーを選択' : sheet === 'settings' ? `${toolNames[tool]}の詳細設定` : sheet === 'export' ? '作品を書き出す' : '使い方'} open={sheet !== null} onClose={() => { setSheet(null); setPhotoExport(null); }}>
      {sheet === 'colors' && <><ColorPicker color={color} onChange={setColor} onSample={startSampling} canSample={!busy} /><button className="primary wide" onClick={() => setSheet(null)}>この色を使う</button></>}
      {sheet === 'settings' && <>
        <SettingsPanel {...{ base, duration, brushRadius, strength, resolution, tool, persistence, setPersistence, dropSpacing, setDropSpacing, ink, setInk: changeInk, resetInk, effectiveRadius, effectiveDuration, waterFade, setWaterFade, setBase, setDuration, setBrushRadius, setStrength, clear }} disabled={busy}
          setResolution={(value) => {
            if (value === resolution || !confirm('解像度を変更すると、新しい水面になり作品と履歴が消えます。続けますか？')) return;
            setResolution(value);
            setSheet(null);
            setNote(`${value}pxの新しい水面を作成しました。`);
          }} />
        <div className="settings-utilities"><button disabled={busy} onClick={clear}>全消去</button><button disabled={busy} onClick={() => { setSheet(null); void demo(); }}>▶ AT-03 デモを再生</button></div>
      </>}
      {sheet === 'export' && (photoExport ? <PhotoExport image={photoExport} onBack={() => {
        setPhotoExport(null);
        requestAnimationFrame(() => photoButtonRef.current?.focus());
      }} /> : <div className="export-options">
        <button ref={photoButtonRef} disabled={busy} onClick={() => save('photo')}><span aria-hidden="true">▣</span><div>写真に保存・共有<small>iPhoneの「写真」へ保存 · {resolution} × {resolution} px</small></div></button>
        <button disabled={busy} aria-label="PNG保存" onClick={() => save('download')}><span aria-hidden="true">↓</span><div>PNGをファイルに保存<small>「ファイル」やダウンロードフォルダへ保存</small></div></button>
        <button disabled={busy} aria-label="切り抜き" onClick={() => { setSheet(null); toggleCrop(); }}><span aria-hidden="true">▧</span><div>切り抜きPNG<small>範囲と縦横比を選んで保存</small></div></button>
        <p className="export-feedback" role="status">{exporting ? '画像を保存しています…' : exportMessage}</p>
        <p className="setting-hint">作品は自動保存されません。編集が終わったら画像を保存してください。表示の拡大率や操作ボタンは画像に含まれません。</p>
      </div>)}
      {sheet === 'help' && <EditorHelp />}
    </BottomSheet>
  </div>;
}

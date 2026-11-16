import { ColorInput } from './ColorInput';
import type { CSSProperties } from 'react';
import type { InkMaterial, Tool } from '../model/types';

type SettingsProps = {
  base: string; duration: number; brushRadius: number; strength: number; resolution: number;
  setBase: (v: string) => void; setDuration: (v: number) => void;
  setBrushRadius: (v: number) => void; setStrength: (v: number) => void; setResolution: (v: number) => void;
  clear: () => void; disabled: boolean;
  tool: Tool; persistence: number; setPersistence: (v: number) => void;
  dropSpacing: number; setDropSpacing: (v: number) => void;
  ink: InkMaterial; setInk: (patch: Partial<InkMaterial>) => void; resetInk: () => void;
  effectiveRadius: number; effectiveDuration: number;
  waterFade: number; setWaterFade: (v: number) => void;
};

export function Slider({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void;
}) {
  return <label className="slider-label">{label}<output>{value} {unit}</output>
    <input aria-label={label} aria-valuetext={`${value} ${unit}`} type="range" min={min} max={max} step={step} value={value}
      style={{ '--range-progress': `${(value - min) / (max - min) * 100}%` } as CSSProperties} onChange={(e) => onChange(+e.target.value)} />
  </label>;
}

export function SettingsPanel(p: SettingsProps) {
  const pen = p.tool === 'stroke' || p.tool === 'flow';
  return <aside className="settings">
    {p.tool === 'drop' && <>
    <section className="ink-material" aria-label="インクの物性">
      <div className="setting-label">インクの物性 <small>色ごとに保存</small></div>
      <Slider label="インク粘度" value={p.ink.viscosity} min={0.2} max={3} step={0.05} unit="" onChange={(viscosity) => p.setInk({ viscosity })} />
      <Slider label="表面張力" value={p.ink.surfaceTension} min={0.3} max={1.5} step={0.05} unit="" onChange={(surfaceTension) => p.setInk({ surfaceTension })} />
      <div className="effective-readout"><span>実効半径 {p.effectiveRadius.toFixed(1)}px</span><span>実効広がり時間 {Math.round(p.effectiveDuration)}ms</span></div>
      <p className="setting-hint">粘度を上げると、ゆっくり広がります。表面張力を下げると、同じ半径の設定でも滴が大きく広がります。「実効」は、この設定で実際に使われる大きさや時間です。</p>
      <button className="wide" disabled={p.disabled} onClick={p.resetInk}>この色の物性を初期値に戻す</button>
    </section>
    <label className="check-row"><input aria-label="外側を水で薄める" type="checkbox" checked={p.waterFade > 0}
      onChange={(event) => p.setWaterFade(event.target.checked ? 0.65 : 0)} />外側を水で薄める</label>
    {p.waterFade > 0 && <Slider label="薄まりの強さ" value={p.waterFade} min={0.1} max={1} step={0.05} unit="" onChange={p.setWaterFade} />}
    <Slider label="滴の間隔（詳細）" value={p.dropSpacing} min={0.3} max={2} step={0.1} unit="× 半径" onChange={p.setDropSpacing} />
    <p className="setting-hint">なぞると連続して滴を落とします。間隔を小さくすると滴が密に並びます。水で薄める効果は、一滴ずつ落とす場合に使えます。</p>
    <Slider label="広がり時間" value={p.duration} min={0} max={1500} step={50} unit="ms" onChange={p.setDuration} />
    </>}
    {pen && <section className="pen-settings" aria-label="ペン設定">
      <Slider label="ブラシ半径（詳細）" value={p.brushRadius} min={2} max={240} unit="px" onChange={p.setBrushRadius} />
      <Slider label="強さ（詳細）" value={p.strength} min={0.05} max={3} step={0.05} unit="" onChange={p.setStrength} />
      {p.tool === 'flow' && <><Slider label="流れが続く時間（詳細）" value={p.persistence} min={0.2} max={2} step={0.1} unit="秒" onChange={p.setPersistence} />
        <p className="setting-hint">余韻は、指を離してから流れが続く時間です。色の境界を横切るようになぞってください。</p></>}
      {p.tool !== 'flow' && <p className="setting-hint">半径を大きくすると広い範囲が動きます。強さを上げると、同じ動きでも模様が大きく変形します。</p>}
    </section>}
    <details className="advanced" open>
      <summary>詳細設定 · 背景 / 解像度</summary>
      <ColorInput label="背景色" value={p.base} onChange={p.setBase} />
      <button className="wide" disabled={p.disabled} onClick={p.clear}>この背景で全消去</button>
      <label className="resolution-label">シミュレーション解像度
        <select aria-label="シミュレーション解像度" value={p.resolution} onChange={(e) => p.setResolution(+e.target.value)}>
          <option value={1024}>1024 px · 標準</option><option value={512}>512 px · 省メモリ</option>
        </select>
      </label>
    </details>
  </aside>;
}

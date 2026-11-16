import { ColorInput } from './ColorInput';
import { ColorPalette } from './ColorPalette';
import type { Tool } from '../model/types';

type Props = {
  color: string; base: string; radius: number; duration: number; brushRadius: number; strength: number; resolution: number;
  setColor: (v: string) => void; setBase: (v: string) => void; setRadius: (v: number) => void; setDuration: (v: number) => void;
  setBrushRadius: (v: number) => void; setStrength: (v: number) => void; setResolution: (v: number) => void;
  clear: () => void; disabled: boolean;
  tool: Tool; persistence: number; setPersistence: (v: number) => void;
  dropSpacing: number; setDropSpacing: (v: number) => void;
  boundaryResistance: number; setBoundaryResistance: (v: number) => void;
  waterFade: number; setWaterFade: (v: number) => void;
};

function Slider({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void;
}) {
  return <label className="slider-label">{label}<output>{value} {unit}</output>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
  </label>;
}

export function SettingsPanel(p: Props) {
  const pen = p.tool === 'stroke' || p.tool === 'flow';
  return <aside className="settings">
    <div className="panel-heading"><span className="eyebrow">{pen ? 'SURFACE MOTION' : 'INK SETTINGS'}</span><h2>{p.tool === 'flow' ? '流れをつくる' : pen ? '水面を引き延ばす' : '一滴をつくる'}</h2></div>
    {!pen && <>
    <ColorInput label="インク色" value={p.color} onChange={p.setColor} />
    <ColorPalette color={p.color} onChange={p.setColor} />
    <Slider label="滴の半径" value={p.radius} min={4} max={180} unit="px" onChange={p.setRadius} />
    <label className="check-row"><input aria-label="外側を水で薄める" type="checkbox" checked={p.waterFade > 0}
      onChange={(event) => p.setWaterFade(event.target.checked ? 0.65 : 0)} />外側を水で薄める</label>
    {p.waterFade > 0 && <Slider label="薄まりの強さ" value={p.waterFade} min={0.1} max={1} step={0.05} unit="" onChange={p.setWaterFade} />}
    <Slider label="境界の抵抗" value={p.boundaryResistance} min={0} max={1} step={0.05} unit="" onChange={p.setBoundaryResistance} />
    <Slider label="連続滴下の間隔" value={p.dropSpacing} min={0.3} max={2} step={0.1} unit="× 半径" onChange={p.setDropSpacing} />
    <p className="setting-hint">タップで一滴、押し続けるとその場でさらに広がります。なぞると連続滴下。境界の抵抗を上げると、他の色に触れた辺だけ広がりが止まり、押し返します。「外側を水で薄める」は単発の滴下と押下成長の縁を透かし、下の水色を見せます（連続滴下は不透明）。境界の抵抗0・「外側を水で薄める」OFFが、Jafferの純粋な円形滴下です。</p>
    <Slider label="広がり時間" value={p.duration} min={0} max={1500} step={50} unit="ms" onChange={p.setDuration} />
    </>}
    {pen && <section className="pen-settings" aria-label="ペン設定">
      <Slider label="ペン半径" value={p.brushRadius} min={2} max={240} unit="px" onChange={p.setBrushRadius} />
      <Slider label="ペン強度" value={p.strength} min={0.05} max={3} step={0.05} unit="" onChange={p.setStrength} />
      {p.tool === 'flow' && <><Slider label="余韻" value={p.persistence} min={0.2} max={2} step={0.1} unit="秒" onChange={p.setPersistence} />
        <p className="setting-hint">流速と圧力を計算。色の境界を横切って、ゆっくり弧を描いてください。離した後も流れが続きます。</p></>}
      {p.tool !== 'flow' && <p className="setting-hint">変形ペンは指に追従。流体ペンは周囲を巻き込み、慣性で流れます。</p>}
    </section>}
    <details className="advanced" open={matchMedia('(min-width: 901px)').matches || undefined}>
      <summary>詳細設定 · 背景 / 解像度</summary>
      <div className="panel-divider" />
      <ColorInput label="背景色" value={p.base} onChange={p.setBase} />
      <button className="wide" disabled={p.disabled} onClick={p.clear}>この背景で全消去</button>
      <label className="resolution-label">シミュレーション解像度
        <select aria-label="シミュレーション解像度" value={p.resolution} onChange={(e) => p.setResolution(+e.target.value)}>
          <option value={1024}>1024 px · 標準</option><option value={512}>512 px · 省メモリ</option>
        </select>
      </label>
    </details>
    <div className="explanation"><span className="eyebrow">BEYOND OVERLAY</span><h3>重ねずに、押し広げる。</h3><p>一滴が生む面積のぶんだけ、そこにあった色が外へ動く。青も紫も、同じ水面の一部です。</p><code>r′ = √(r² + a²)</code></div>
  </aside>;
}

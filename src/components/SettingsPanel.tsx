import { ColorInput } from './ColorInput';

type Props = {
  color: string; base: string; radius: number; duration: number; brushRadius: number; strength: number; resolution: number;
  setColor: (v: string) => void; setBase: (v: string) => void; setRadius: (v: number) => void; setDuration: (v: number) => void;
  setBrushRadius: (v: number) => void; setStrength: (v: number) => void; setResolution: (v: number) => void;
  clear: () => void; disabled: boolean;
};

function Slider({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void;
}) {
  return <label className="slider-label">{label}<output>{value} {unit}</output>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
  </label>;
}

export function SettingsPanel(p: Props) {
  return <aside className="settings">
    <div className="panel-heading"><span className="eyebrow">INK SETTINGS</span><h2>一滴をつくる</h2></div>
    <ColorInput label="インク色" value={p.color} onChange={p.setColor} />
    <div className="swatches">{['#6929E8', '#F02045', '#278BEC', '#F6C85B', '#F7F3EA', '#171B23'].map((value) => <button key={value} aria-label={`色 ${value}`} aria-pressed={p.color.toUpperCase() === value} className={p.color.toUpperCase() === value ? 'active' : ''} style={{ background: value }} onClick={() => p.setColor(value)} />)}</div>
    <Slider label="滴の半径" value={p.radius} min={4} max={180} unit="px" onChange={p.setRadius} />
    <Slider label="広がり時間" value={p.duration} min={0} max={1500} step={50} unit="ms" onChange={p.setDuration} />
    <details className="advanced" open={matchMedia('(min-width: 901px)').matches || undefined}>
      <summary>詳細設定 · ペン / 背景 / 解像度</summary>
      <Slider label="ペン半径" value={p.brushRadius} min={2} max={120} unit="px" onChange={p.setBrushRadius} />
      <Slider label="ペン強度" value={p.strength} min={0.05} max={1} step={0.05} unit="" onChange={p.setStrength} />
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

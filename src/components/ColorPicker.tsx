import { ColorInput } from './ColorInput';
import { ColorPalette } from './ColorPalette';

// Figma Hue / 0–11 (7:381–7:392), kept in the same clockwise order as the SVGs.
const hues = ['#E0354A', '#F38035', '#FFBC39', '#E4E83A', '#83CE43', '#3EC787', '#27AFC5', '#357EF5', '#6653DF', '#AE4BDD', '#EB5EC0', '#E0354A'];
const hueNames = ['赤（上）', 'オレンジ', '黄', '黄緑', '緑', '青緑', '水色', '青', '青紫', '紫', '赤紫', '赤（左上）'];
const hueAssets = import.meta.glob('../assets/figma/hue-*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function ColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  return <div className="color-picker">
    <ColorInput label="インク色" value={color} onChange={onChange} />
    <div className="hue-wheel" role="group" aria-label="色相から選ぶ">
      {hues.map((value, i) => {
        const angle = i * Math.PI / 6;
        return <button key={i} className="hue-choice" aria-label={`色相 ${hueNames[i]}`} title={value} aria-pressed={color.toUpperCase() === value}
          style={{ left: `${108 + Math.sin(angle) * 84}px`, top: `${108 - Math.cos(angle) * 84}px` }} onClick={() => onChange(value)}>
          <img src={hueAssets[`../assets/figma/hue-${i === 11 ? 0 : i}.svg`]} width="32" height="32" alt="" />
        </button>;
      })}
      <label className="wheel-center" style={{ background: color }}>
        <span>自由に選ぶ</span><input type="color" aria-label="自由に色を選ぶ" value={color} onChange={e => onChange(e.target.value)} />
      </label>
    </div>
    <ColorPalette color={color} onChange={onChange} />
  </div>;
}

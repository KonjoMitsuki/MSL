import { useEffect, useState } from 'react';

const palettes: Record<string, string[]> = {
  ビビッド: ['#6929E8', '#F02045', '#278BEC', '#F6C85B', '#F7F3EA', '#171B23',
    '#FF593D', '#FF8A24', '#FFB800', '#F5ED35', '#A8E62E', '#36C96B',
    '#00A88F', '#23D9C5', '#35C9F1', '#1663CF', '#3535A8', '#923DED',
    '#C43EE8', '#F64BB2', '#FF90B3', '#B92150', '#794334', '#B5EDDB'],
  パステル: ['#CDB4F6', '#FFB7C8', '#AACFF5', '#FFE6A4', '#FFF8E7', '#596275',
    '#FFC8AB', '#F8D6BA', '#F5F3B0', '#D5E8A4', '#A8DEC2', '#A8E4DD',
    '#B0E3EF', '#BBC6F4', '#D8C6ED', '#EBC6E2', '#D7C2B3', '#DFE6E9'],
  アース: ['#A34A3C', '#CD7147', '#D4A260', '#D5BF8D', '#EEE3CF', '#302D2A',
    '#79543E', '#9C7356', '#A88F68', '#8D945E', '#526B46', '#294F44',
    '#417D86', '#34506E', '#61546D', '#966A7F', '#B69690', '#C7C8B4'],
  モノクロ: ['#FFFFFF', '#F7F3EA', '#E3E4E6', '#C9CDD2', '#AAB2BA', '#8794A4',
    '#667381', '#4B5868', '#354251', '#242E3A', '#171B23', '#000000'],
};
const storageKey = 'msl.saved-colors.v1';
const recentKey = 'msl.recent-colors.v1';

function loadRecent(): string[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(recentKey) ?? '[]');
    return Array.isArray(values) ? [...new Set(values.filter((v): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)).map(v => v.toUpperCase()))].slice(0, 7) : [];
  } catch { return []; }
}

export function ColorPalette({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const [palette, setPalette] = useState('ビビッド');
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      const values: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      return Array.isArray(values) ? [...new Set(values.filter((v): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)).map((v) => v.toUpperCase()))].slice(0, 24) : [];
    } catch { return []; }
  });
  const [message, setMessage] = useState('');
  const selected = color.toUpperCase();
  const [recent, setRecent] = useState(loadRecent);
  useEffect(() => {
    setRecent(previous => {
      const next = [selected, ...previous.filter(c => c !== selected)].slice(0, 7);
      try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* Available in this tab even without storage. */ }
      return next;
    });
  }, [selected]);
  function toggleSaved() {
    const next = saved.includes(selected) ? saved.filter((c) => c !== selected) : [selected, ...saved].slice(0, 24);
    setSaved(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setMessage(next.includes(selected) ? '色をこのブラウザに保存しました。' : '保存した色から外しました。'); }
    catch { setMessage('この環境では色の保存が制限されています。このタブ内で使えます。'); }
  }
  function swatch(value: string, prefix = '色') {
    return <button key={value} aria-label={`${prefix} ${value}`} title={value} aria-pressed={selected === value}
      className={selected === value ? 'active' : ''} style={{ background: value }} onClick={() => onChange(value)}>
      {selected === value && <span className="swatch-check" aria-hidden="true">✓</span>}</button>;
  }
  return <section className="palette-section" aria-label="カラーパレット">
    <p className="setting-label">最近選んだ色</p>
    <div className="swatches recent-colors" aria-label="最近選んだ色">{recent.map(value => swatch(value, '最近の色'))}</div>
    <label className="palette-label">パレット
      <select aria-label="パレット" value={palette} onChange={(e) => setPalette(e.target.value)}>
        {Object.keys(palettes).map((name) => <option key={name}>{name}</option>)}
      </select>
    </label>
    <div className="swatches">{palettes[palette].map((value) => swatch(value))}</div>
    <p className="setting-hint">色を押して選びます。HEXは「#」と6桁の英数字で指定する色番号です。</p>
    <button className="save-color" onClick={toggleSaved}>{saved.includes(selected) ? '− この色を保存色から外す' : '＋ この色を保存'}</button>
    {saved.length > 0 && <div className="swatches saved-colors" aria-label="保存した色">{saved.map((value) => swatch(value, '保存色'))}</div>}
    <span className="setting-hint" role="status">{message}</span>
  </section>;
}

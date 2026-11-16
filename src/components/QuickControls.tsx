import { memo } from 'react';
import { Slider } from './SettingsPanel';
import { toolHints, toolNames } from './ToolDock';
import type { Tool } from '../model/types';

export const QuickControls = memo(function QuickControls(p: {
  tool: Tool; color: string; radius: number; brushRadius: number; strength: number; persistence: number; dropSpacing: number;
  setRadius: (v: number) => void; setBrushRadius: (v: number) => void; setStrength: (v: number) => void;
  setPersistence: (v: number) => void; setDropSpacing: (v: number) => void;
  openColors: () => void; openSettings: () => void; openHelp: () => void;
}) {
  const pen = p.tool === 'stroke' || p.tool === 'flow';
  return <section className="quick-controls" aria-label="ツールの調整">
    <div className="current-tool"><span className="eyebrow">現在のツール</span><h2>{toolNames[p.tool]}</h2><p>{toolHints[p.tool]}</p></div>
    {p.tool === 'drop' && <Slider label="滴の半径" value={p.radius} min={4} max={180} unit="px" onChange={p.setRadius} />}
    {pen && <Slider label="ペン半径" value={p.brushRadius} min={2} max={240} unit="px" onChange={p.setBrushRadius} />}
    {p.tool === 'pan' && <p className="pan-hint">ピンチで拡大・縮小できます。全体表示で元の位置に戻ります。</p>}
    <div className="quick-actions">
      <button className="color-trigger" aria-label="カラーを選択" aria-haspopup="dialog" onClick={p.openColors}>
        <span className="current-color" style={{ background: p.color }} aria-hidden="true" />カラー</button>
      <button className="help-trigger" aria-label="簡易ヘルプ" aria-haspopup="dialog" onClick={p.openHelp}>使い方</button>
      <button className="settings-trigger" aria-label="詳細設定" aria-haspopup="dialog" onClick={p.openSettings}><span aria-hidden="true">☷</span><span className="desktop-label">設定</span></button>
    </div>
    {p.tool === 'drop' && <div className="secondary-quick"><Slider label="連続滴下の間隔" value={p.dropSpacing} min={0.3} max={2} step={0.1} unit="× 半径" onChange={p.setDropSpacing} /></div>}
    {pen && <div className="secondary-quick">
      <Slider label="ペン強度" value={p.strength} min={0.05} max={3} step={0.05} unit="" onChange={p.setStrength} />
      {p.tool === 'flow' && <Slider label="余韻" value={p.persistence} min={0.2} max={2} step={0.1} unit="秒" onChange={p.setPersistence} />}
    </div>}
  </section>;
});

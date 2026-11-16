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
    <h2 className="visually-hidden">{toolNames[p.tool]}</h2>
    <p className="visually-hidden">{toolHints[p.tool]}</p>
    <div className="quick-size">
      {p.tool === 'drop' && <Slider label="滴の半径" value={p.radius} min={4} max={180} unit="px" onChange={p.setRadius} />}
      {pen && <Slider label="ペン半径" value={p.brushRadius} min={2} max={240} unit="px" onChange={p.setBrushRadius} />}
      {p.tool === 'pan' && <span className="pan-hint">✥ <span className="visually-hidden">ピンチで拡大・縮小できます。</span></span>}
    </div>
    <div className="quick-actions">
      <button className="color-trigger" aria-label="カラーを選択" title="カラーを選択" aria-haspopup="dialog" onClick={p.openColors}>
        <span className="current-color" style={{ background: p.color }} aria-hidden="true" /></button>
      <button className="settings-trigger" aria-label="詳細設定" title="詳細設定" aria-haspopup="dialog" onClick={p.openSettings}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6m6 4v6" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></svg></button>
      <button className="help-trigger" aria-label="簡易ヘルプ" title="使い方" aria-haspopup="dialog" onClick={p.openHelp}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.2 1-1.7 1.4-1.7 3M12 17h.01" /></svg></button>
    </div>
    {p.tool === 'drop' && <div className="secondary-quick"><Slider label="連続滴下の間隔" value={p.dropSpacing} min={0.3} max={2} step={0.1} unit="× 半径" onChange={p.setDropSpacing} /></div>}
    {pen && <div className="secondary-quick">
      <Slider label="ペン強度" value={p.strength} min={0.05} max={3} step={0.05} unit="" onChange={p.setStrength} />
      {p.tool === 'flow' && <Slider label="余韻" value={p.persistence} min={0.2} max={2} step={0.1} unit="秒" onChange={p.setPersistence} />}
    </div>}
  </section>;
});

import type { Tool } from '../model/types';

export const toolNames: Record<Tool, string> = { drop: '滴下', stroke: '変形ペン', flow: '流体ペン', pan: '移動' };
export const toolHints: Record<Tool, string> = {
  drop: 'タップで一滴。押し続けて広げ、なぞると連続して滴を落とせます。',
  stroke: '色の境界をなぞると、水面の模様を引き延ばせます。',
  flow: 'なぞると周りの色が流れます。指を離しても、しばらく流れが続きます。',
  pan: 'ドラッグで水面を移動。2本指でも移動・拡大できます。',
};

export function ToolDock({ tool, onChange, disabled }: { tool: Tool; onChange: (tool: Tool) => void; disabled: boolean }) {
  return <nav className="tool-dock" aria-label="描画ツール">
    {(['drop', 'stroke', 'flow', 'pan'] as const).map((name, i) => <button key={name}
      className={`tool ${tool === name ? 'selected' : ''}`} aria-label={toolNames[name]}
      aria-pressed={tool === name} disabled={disabled} onClick={() => onChange(name)}>
      <span aria-hidden="true">{['●', '〰', '≋', '✥'][i]}</span>{toolNames[name]}
    </button>)}
  </nav>;
}

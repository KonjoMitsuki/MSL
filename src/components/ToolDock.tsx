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
    {(['drop', 'stroke', 'flow', 'pan'] as const).map((name) => <button key={name}
      className={`tool ${tool === name ? 'selected' : ''}`} aria-label={toolNames[name]} title={toolNames[name]}
      aria-pressed={tool === name} disabled={disabled} onClick={() => onChange(name)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {name === 'drop' && <path d="M12 3c-2.5 4-6 7.7-6 11a6 6 0 0 0 12 0c0-3.3-3.5-7-6-11Z" />}
        {name === 'stroke' && <><path d="m5 19 10-10 3 3L8 22H5v-3ZM13 6l3-3 5 5-3 3" /><path d="m3 6 1-2 2-1-2-1-1-2-1 2-2 1 2 1 1 2Z" /></>}
        {name === 'flow' && <><path d="M3 8c3-4 5 4 9 0s6-4 9 0M3 15c3-4 5 4 9 0s6-4 9 0" /><path d="m17 19 3-3 3 3" /></>}
        {name === 'pan' && <><path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3" /></>}
      </svg>
    </button>)}
  </nav>;
}

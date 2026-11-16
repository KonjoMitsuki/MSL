import { CROP_ASPECTS, type CropAspect, type CropRect } from '../export/crop';

export function CropControls({ cropAspect, changeAspect, crop, setCropField, cropOutputWidth, setCropOutputWidth, outputWidth, outputHeight, saveCrop, toggleCrop, disabled }: {
  cropAspect: CropAspect; changeAspect: (v: CropAspect) => void; crop: CropRect;
  setCropField: (key: keyof CropRect, v: number) => void; cropOutputWidth: number; setCropOutputWidth: (v: number) => void;
  outputWidth: number; outputHeight: number; saveCrop: () => void; toggleCrop: () => void; disabled: boolean;
}) {
  return <div className="crop-toolbar" role="region" aria-label="切り抜き設定">
          <div className="crop-ratios"><span className="eyebrow">縦横比</span>
            {CROP_ASPECTS.map((item) => <button key={item.id} className={cropAspect === item.id ? 'selected' : ''}
              aria-pressed={cropAspect === item.id} onClick={() => changeAspect(item.id)}>{item.label}</button>)}
          </div>
          <div className="crop-fields">
            {(['x', 'y', 'width', 'height'] as const).map((key) => <label key={key} className="crop-field">
              <span>{key === 'x' ? 'X' : key === 'y' ? 'Y' : key === 'width' ? '幅' : '高さ'}</span>
              <input type="number" min={0} max={1024} step={1} value={Math.round(crop[key])}
                aria-label={`切り抜き${key === 'x' ? 'X' : key === 'y' ? 'Y' : key === 'width' ? '幅' : '高さ'}`}
                onChange={(event) => setCropField(key, Number(event.target.value))} />
            </label>)}
            <label className="crop-field"><span>出力幅</span>
              <input type="number" min={64} max={2048} step={32} value={cropOutputWidth}
                aria-label="出力幅" onChange={(event) => setCropOutputWidth(Number(event.target.value))} />
              <em>px</em>
            </label>
            <span className="crop-output">{outputWidth} × {outputHeight}px</span>
          </div>
          <div className="crop-actions">
            <button className="primary" disabled={disabled} onClick={saveCrop}>切り抜きPNG</button>
            <button onClick={toggleCrop}>閉じる</button>
          </div>
        </div>;
}

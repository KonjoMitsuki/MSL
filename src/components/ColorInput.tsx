import { useEffect, useState } from 'react';

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const [hex, setHex] = useState(value.toUpperCase());
  useEffect(() => setHex(value.toUpperCase()), [value]);
  const valid = /^#[0-9a-f]{6}$/i.test(hex);
  return <div className="color-label">{label}<div className="color-field">
    <input aria-label={label} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    <input aria-label={`${label} HEX`} className="hex-input" type="text" value={hex} maxLength={7} spellCheck={false}
      aria-invalid={!valid} onChange={(e) => {
        setHex(e.target.value);
        if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value);
      }} onBlur={() => { if (!valid) setHex(value.toUpperCase()); }} />
  </div>{!valid && <small className="field-hint">#RRGGBB 形式で入力</small>}</div>;
}

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label" title={hint}>
        {label}
        {hint && <span className="hint-mark">?</span>}
      </span>
      <span className="field-control">{children}</span>
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  multiline,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {
  if (multiline) return <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
  return <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

/** 入力途中（空欄や "-"）を許す数値入力 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  allowEmpty,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === undefined ? '' : String(value));
  }, [value]);
  return (
    <input
      type="number"
      value={text}
      min={min}
      max={max}
      step={step}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(value === undefined ? '' : String(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value === '') {
          if (allowEmpty) onChange(undefined);
          return;
        }
        let n = Number(e.target.value);
        if (isNaN(n)) return;
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        onChange(n);
      }}
    />
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value || '');
  const base = m ? `#${m[1]}` : '#000000';
  const alpha = m?.[2] ?? '';
  return (
    <span className="color-input">
      <input type="color" value={base} onChange={(e) => onChange(e.target.value + alpha)} />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; group?: string }[];
}) {
  const groups = [...new Set(options.map((o) => o.group || ''))];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {groups.length > 1
        ? groups.map((g) => (
            <optgroup key={g} label={g}>
              {options
                .filter((o) => (o.group || '') === g)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          ))
        : options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
    </select>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** 画像を読み込み、長辺 maxSize に縮小して data URL にする */
export function fileToDataUrl(file: File, maxSize = 768): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const src = String(reader.result);
      if (file.type === 'image/svg+xml' || file.type === 'image/gif') return resolve(src);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export function ImageInput({ value, onChange, maxSize }: { value: string; onChange: (v: string) => void; maxSize?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="image-input">
      {value && <img src={value} alt="" />}
      <input
        type="text"
        placeholder="画像URL"
        value={value.startsWith('data:') ? '(アップロード画像)' : value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={value.startsWith('data:')}
      />
      <button type="button" onClick={() => ref.current?.click()}>
        📁
      </button>
      {value && (
        <button type="button" onClick={() => onChange('')} title="画像を外す">
          ✕
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            onChange(await fileToDataUrl(f, maxSize));
          } catch (err) {
            alert((err as Error).message);
          }
        }}
      />
    </span>
  );
}

export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`section ${open ? 'open' : ''}`}>
      <button type="button" className="section-title" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'}</span> {title}
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

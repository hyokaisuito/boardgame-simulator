import { useState } from 'react';
import { CATALOG, type Preset } from '../catalog';

export function Palette({ onAdd }: { onAdd: (p: Preset) => void }) {
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const query = q.trim().toLowerCase();
  return (
    <div className="palette">
      <input className="palette-search" placeholder="部品を検索…" value={q} onChange={(e) => setQ(e.target.value)} />
      {CATALOG.map((cat) => {
        const list = cat.presets.filter((p) => !query || (p.label + p.hint).toLowerCase().includes(query));
        if (!list.length) return null;
        const open = query || !closed[cat.label];
        return (
          <div key={cat.label} className="palette-cat">
            <button className="palette-cat-title" onClick={() => setClosed({ ...closed, [cat.label]: !closed[cat.label] })}>
              {open ? '▾' : '▸'} {cat.label}
            </button>
            {open && (
              <div className="palette-items">
                {list.map((p) => (
                  <button key={p.key} className="palette-item" title={p.hint} onClick={() => onAdd(p)}>
                    <span className="palette-icon">{p.icon}</span>
                    <span className="palette-label">{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

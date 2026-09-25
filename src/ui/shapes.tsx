import type { ReactNode } from 'react';
import { computeCells, hexPoints } from '../engine/geometry';
import type { Entity, PieceShape } from '../types';

/** 色を少し暗く／明るくする（#rrggbb のみ対応） */
export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** 明るい色かどうか（文字色の自動選択用） */
export function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || '');
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150;
}

const SHAPE_PATHS: Partial<Record<PieceShape, string>> = {
  meeple:
    'M50 6 C60 6 66 13 66 22 C66 28 63 32 60 35 L88 44 C96 47 96 58 88 60 L70 62 L82 92 C84 97 80 98 76 98 L58 98 L50 80 L42 98 L24 98 C20 98 16 97 18 92 L30 62 L12 60 C4 58 4 47 12 44 L40 35 C37 32 34 28 34 22 C34 13 40 6 50 6 Z',
  pawn: 'M50 6 C61 6 68 14 68 24 C68 31 64 37 58 40 L64 70 L80 82 L80 96 L20 96 L20 82 L36 70 L42 40 C36 37 32 31 32 24 C32 14 39 6 50 6 Z',
  triangle: 'M50 6 L96 92 L4 92 Z',
  diamond: 'M50 3 L97 50 L50 97 L3 50 Z',
  star: 'M50 4 L61 37 L96 37 L68 58 L78 93 L50 72 L22 93 L32 58 L4 37 L39 37 Z',
  heart: 'M50 92 C20 70 4 52 4 32 C4 16 16 6 29 6 C39 6 46 12 50 20 C54 12 61 6 71 6 C84 6 96 16 96 32 C96 52 80 70 50 92 Z',
  shogi: 'M50 3 L86 20 L97 97 L3 97 L14 20 Z',
  house: 'M50 6 L96 46 L84 46 L84 94 L16 94 L16 46 L4 46 Z',
  car: 'M14 58 L22 36 C24 30 28 28 34 28 L66 28 C72 28 76 30 78 36 L86 58 L94 62 L94 80 L6 80 L6 62 Z',
};

export function PieceSvg({ e, faceUp = true }: { e: Entity; faceUp?: boolean }) {
  const shape = e.shape || 'circle';
  const showBack = e.twoSided && !faceUp;
  const fill = showBack ? e.color2 : e.color;
  const stroke = shade(fill, -0.35);
  const label = showBack ? e.backText || '' : e.text || '';
  const textFill = shape === 'shogi' && showBack ? '#c0392b' : e.textColor || (isLight(fill) ? '#222' : '#fff');
  const gid = `g_${e.id}`;
  let body: ReactNode;
  switch (shape) {
    case 'circle':
      body = <circle cx="50" cy="50" r="46" fill={fill} stroke={stroke} strokeWidth="4" />;
      break;
    case 'disc':
      body = (
        <>
          <circle cx="50" cy="50" r="46" fill={fill} stroke={stroke} strokeWidth="4" />
          <circle cx="50" cy="50" r="30" fill="none" stroke={shade(fill, 0.25)} strokeWidth="6" strokeDasharray="10 6" />
        </>
      );
      break;
    case 'stone':
      body = (
        <>
          <defs>
            <radialGradient id={gid} cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor={shade(fill, 0.35)} />
              <stop offset="100%" stopColor={fill} />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="47" fill={`url(#${gid})`} stroke={shade(fill, -0.3)} strokeWidth="2" />
        </>
      );
      break;
    case 'square':
      body = <rect x="5" y="5" width="90" height="90" rx="8" fill={fill} stroke={stroke} strokeWidth="4" />;
      break;
    case 'cube':
      body = (
        <>
          <rect x="6" y="6" width="88" height="88" rx="10" fill={fill} stroke={stroke} strokeWidth="4" />
          <rect x="16" y="16" width="68" height="68" rx="6" fill={shade(fill, 0.12)} />
        </>
      );
      break;
    case 'hexagon':
      body = <polygon points={hexPoints(50, 50, 47)} fill={fill} stroke={stroke} strokeWidth="4" />;
      break;
    case 'glyph':
      body = null;
      break;
    default:
      body = <path d={SHAPE_PATHS[shape]} fill={fill} stroke={stroke} strokeWidth="4" strokeLinejoin="round" />;
  }
  const car = shape === 'car';
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ overflow: 'visible', display: 'block' }}>
      {body}
      {car && (
        <>
          <circle cx="28" cy="80" r="10" fill="#222" />
          <circle cx="72" cy="80" r="10" fill="#222" />
          <rect x="30" y="34" width="40" height="18" rx="3" fill="#cfe8ff" />
        </>
      )}
      {shape === 'glyph' ? (
        <text
          x="50"
          y="54"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="92"
          fill={fill}
          stroke={e.textColor || '#000'}
          strokeWidth="3"
          paintOrder="stroke"
          style={{ fontFamily: '"Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",sans-serif' }}
        >
          {label}
        </text>
      ) : (
        label && (
          <text
            x="50"
            y={shape === 'shogi' ? 60 : shape === 'pawn' || shape === 'meeple' ? 62 : 52}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={label.length > 2 ? 30 : shape === 'shogi' ? 52 : 42}
            fontWeight="bold"
            fill={textFill}
            style={{ fontFamily: shape === 'shogi' ? '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif' : undefined }}
          >
            {label}
          </text>
        )
      )}
    </svg>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

export function DiceSvg({ e }: { e: Entity }) {
  const face = e.faces?.[e.value ?? 0] ?? '?';
  const fill = e.color;
  const stroke = shade(fill, -0.4);
  const n = e.faces?.length ?? 6;
  const pip = e.diceStyle === 'pips' && /^[1-6]$/.test(face) ? Number(face) : 0;
  let body: ReactNode;
  if (e.shape === 'circle' || n === 2) body = <circle cx="50" cy="50" r="46" fill={fill} stroke={stroke} strokeWidth="4" />;
  else if (n === 4) body = <path d="M50 4 L96 90 L4 90 Z" fill={fill} stroke={stroke} strokeWidth="4" strokeLinejoin="round" />;
  else if (n === 8 || n === 10) body = <path d="M50 3 L95 50 L50 97 L5 50 Z" fill={fill} stroke={stroke} strokeWidth="4" strokeLinejoin="round" />;
  else if (n === 12)
    body = <path d="M50 4 L95 37 L78 94 L22 94 L5 37 Z" fill={fill} stroke={stroke} strokeWidth="4" strokeLinejoin="round" />;
  else if (n === 20) body = <polygon points={hexPoints(50, 50, 48)} fill={fill} stroke={stroke} strokeWidth="4" />;
  else body = <rect x="4" y="4" width="92" height="92" rx="16" fill={fill} stroke={stroke} strokeWidth="4" />;
  const tc = e.textColor || (isLight(fill) ? '#222' : '#fff');
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      {body}
      {pip ? (
        PIPS[pip].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" fill={pip === 1 && fill === '#ffffff' ? '#c0392b' : tc} />)
      ) : (
        <text
          x="50"
          y={n === 4 ? 62 : 52}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={face.length > 2 ? 26 : face.length > 1 ? 36 : 46}
          fontWeight="bold"
          fill={tc}
        >
          {face}
        </text>
      )}
    </svg>
  );
}

const WEDGE_COLORS = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1'];

export function SpinnerSvg({ e }: { e: Entity }) {
  const faces = e.faces?.length ? e.faces : ['?'];
  const n = faces.length;
  const step = 360 / n;
  const rot = -((e.value ?? 0) + 0.5) * step;
  const pt = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  };
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: '50px 50px', transition: 'transform 0.8s cubic-bezier(.2,.8,.3,1)' }}>
        {faces.map((f, i) => {
          const [x1, y1] = pt(i * step, 46);
          const [x2, y2] = pt((i + 1) * step, 46);
          const [tx, ty] = pt((i + 0.5) * step, 31);
          return (
            <g key={i}>
              {n === 1 ? (
                <circle cx="50" cy="50" r="46" fill={WEDGE_COLORS[0]} />
              ) : (
                <path
                  d={`M50 50 L${x1} ${y1} A46 46 0 ${step > 180 ? 1 : 0} 1 ${x2} ${y2} Z`}
                  fill={WEDGE_COLORS[i % WEDGE_COLORS.length]}
                  stroke="#fff"
                  strokeWidth="1"
                />
              )}
              <text
                x={tx}
                y={ty}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={f.length > 3 ? 7 : 10}
                fontWeight="bold"
                fill="#222"
                transform={`rotate(${(i + 0.5) * step} ${tx} ${ty})`}
              >
                {f}
              </text>
            </g>
          );
        })}
      </g>
      <circle cx="50" cy="50" r="46" fill="none" stroke="#333" strokeWidth="2" />
      <circle cx="50" cy="50" r="5" fill="#333" />
      <path d="M50 12 L44 -2 L56 -2 Z" fill="#222" />
    </svg>
  );
}

export function BagSvg({ e, count }: { e: Entity; count: number }) {
  const fill = e.color;
  return (
    <svg viewBox="0 0 100 110" width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <path
        d="M34 20 C30 12 38 6 50 6 C62 6 70 12 66 20 L64 28 C86 40 96 62 94 84 C92 100 80 106 50 106 C20 106 8 100 6 84 C4 62 14 40 36 28 Z"
        fill={fill}
        stroke={shade(fill, -0.35)}
        strokeWidth="3"
      />
      <path d="M34 26 Q50 34 66 26" fill="none" stroke={shade(fill, -0.45)} strokeWidth="4" />
      <text x="50" y="72" textAnchor="middle" dominantBaseline="central" fontSize="24" fontWeight="bold" fill={isLight(fill) ? '#222' : '#fff'}>
        {count}
      </text>
    </svg>
  );
}

/** ボードのマス・線を描画 */
export function BoardGrid({ e }: { e: Entity }) {
  const g = e.grid;
  if (!g || g.kind === 'none') return null;
  const cells = computeCells(g, e.w, e.h);
  const stroke = g.lineColor || '#333';
  const cellFill = (i: number, r: number, c: number) => {
    const custom = g.cellColors?.[i];
    if (custom) return custom;
    if (g.checker) return (r + c) % 2 === 0 ? e.color : e.color2;
    return 'transparent';
  };
  const fontSize = (c: { w: number; h: number }) => Math.max(8, Math.min(c.w, c.h) * 0.22);
  if (g.kind === 'intersection') {
    const cols = g.cols;
    const rows = g.rows;
    const first = cells[0];
    const lastCell = cells[cells.length - 1];
    const stars: number[] = [];
    if (cols === rows && [9, 13, 19].includes(cols)) {
      const pts = cols === 19 ? [3, 9, 15] : cols === 13 ? [3, 6, 9] : [2, 4, 6];
      for (const r of pts) for (const c of pts) stars.push(r * cols + c);
    }
    return (
      <svg width={e.w} height={e.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {Array.from({ length: rows }, (_, r) => (
          <line key={'r' + r} x1={first.cx} x2={lastCell.cx} y1={cells[r * cols].cy} y2={cells[r * cols].cy} stroke={stroke} strokeWidth="1" />
        ))}
        {Array.from({ length: cols }, (_, c) => (
          <line key={'c' + c} y1={first.cy} y2={lastCell.cy} x1={cells[c].cx} x2={cells[c].cx} stroke={stroke} strokeWidth="1" />
        ))}
        {stars.map((i) => cells[i] && <circle key={i} cx={cells[i].cx} cy={cells[i].cy} r="3.5" fill={stroke} />)}
        {g.labels?.map((l, i) => l && cells[i] && (
          <text key={'l' + i} x={cells[i].cx} y={cells[i].cy - 8} fontSize="10" textAnchor="middle" fill={stroke}>
            {l}
          </text>
        ))}
      </svg>
    );
  }
  return (
    <svg width={e.w} height={e.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {cells.map((c, i) => {
        const col = g.kind === 'track' ? i : i % g.cols;
        const row = g.kind === 'track' ? 0 : Math.floor(i / g.cols);
        const fill = cellFill(i, row, col);
        const label = g.labels?.[i];
        return (
          <g key={i}>
            {c.r ? (
              <polygon points={hexPoints(c.cx, c.cy, c.r - 0.5)} fill={fill === 'transparent' ? e.color2 : fill} stroke={stroke} strokeWidth="1.5" />
            ) : (
              <rect x={c.cx - c.w / 2} y={c.cy - c.h / 2} width={c.w} height={c.h} fill={fill} stroke={stroke} strokeWidth={g.kind === 'track' ? 1.5 : 1} />
            )}
            {g.showIndex && (
              <text x={c.cx - c.w / 2 + 4} y={c.cy - c.h / 2 + 4} fontSize={fontSize(c) * 0.8} dominantBaseline="hanging" fill={stroke} opacity="0.6">
                {i + 1}
              </text>
            )}
            {label && (
              <text x={c.cx} y={c.cy} fontSize={fontSize(c)} textAnchor="middle" dominantBaseline="central" fill={stroke} fontWeight="bold">
                {label.length > 8 ? label.slice(0, 8) + '…' : label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

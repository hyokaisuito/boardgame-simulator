import type { CSSProperties } from 'react';
import type { Entity } from '../types';
import { BagSvg, BoardGrid, DiceSvg, isLight, PieceSvg, SpinnerSvg } from './shapes';
import { hexPoints } from '../engine/geometry';

export interface PlayHandlers {
  onCounter?: (id: string, delta: number) => void;
  onTimerToggle?: (id: string) => void;
  onButton?: (id: string) => void;
  now?: number;
}

function bgImage(url: string): CSSProperties {
  return url ? { backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {};
}

export function CardView({ e, faceShown, w, h }: { e: Entity; faceShown: boolean; w?: number; h?: number }) {
  const width = w ?? e.w;
  const height = h ?? e.h;
  const hex = e.type === 'tile' && e.shape === 'hexagon';
  const fs = e.fontSize || Math.max(10, Math.min(width, height) * 0.2);
  if (hex) {
    const fill = faceShown ? e.color : e.color2;
    return (
      <svg viewBox="0 0 100 100" width={width} height={height} style={{ display: 'block' }}>
        <polygon points={hexPoints(50, 50, 49)} fill={fill} stroke="#0006" strokeWidth="2" />
        <text x="50" y="52" textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="bold" fill={e.textColor || (isLight(fill) ? '#222' : '#fff')}>
          {faceShown ? e.text : e.backText}
        </text>
      </svg>
    );
  }
  if (!faceShown) {
    return (
      <div className="card back" style={{ width, height, background: e.color2, ...bgImage(e.backImage), color: isLight(e.color2) ? '#222' : '#fff' }}>
        {!e.backImage && <div className="card-back-pattern" />}
        {e.backText && <span style={{ fontSize: fs * 1.2 }}>{e.backText}</span>}
      </div>
    );
  }
  return (
    <div className="card" style={{ width, height, background: e.color, ...bgImage(e.image), color: e.textColor }}>
      {e.text && (
        <span className="card-text" style={{ fontSize: fs, textShadow: e.image ? '0 0 4px #fff, 0 0 2px #fff' : undefined }}>
          {e.text}
        </span>
      )}
      {e.type === 'card' && e.text && e.text.length <= 4 && !e.text.includes('\n') && (
        <>
          <span className="card-corner tl" style={{ fontSize: fs * 0.5 }}>{e.text}</span>
          <span className="card-corner br" style={{ fontSize: fs * 0.5 }}>{e.text}</span>
        </>
      )}
    </div>
  );
}

export function EntityView({
  e,
  faceShown,
  entities,
  play,
  splitTop,
}: {
  e: Entity;
  faceShown: boolean;
  entities: Record<string, Entity>;
  play?: PlayHandlers;
  splitTop?: boolean;
}) {
  switch (e.type) {
    case 'board':
      return (
        <div className="board" style={{ width: e.w, height: e.h, background: e.color, ...bgImage(e.image) }}>
          <BoardGrid e={e} />
        </div>
      );
    case 'zone': {
      const owner = e.owner;
      return (
        <div className={`zone ${e.layout}`} style={{ width: e.w, height: e.h, background: e.color, ...bgImage(e.image) }}>
          <span className="zone-label">
            {e.name}
            {owner !== null && <span className="owner-dot">P{owner + 1}</span>}
            {e.layout !== 'free' && <span className="count-badge">{e.children?.length ?? 0}</span>}
          </span>
        </div>
      );
    }
    case 'deck': {
      const kids = e.children || [];
      const topIdx = kids.length - (splitTop ? 2 : 1);
      const top = topIdx >= 0 ? entities[kids[topIdx]] : undefined;
      const layers = Math.min(6, Math.ceil(kids.length / 6));
      const w = e.w;
      const h = e.h;
      return (
        <div className="deck" style={{ width: w, height: h }}>
          {kids.length === 0 ? (
            <div className="deck-empty">
              {e.name}
              <br />
              (空)
            </div>
          ) : (
            <>
              {Array.from({ length: layers }, (_, i) => (
                <div key={i} className="deck-layer" style={{ left: layers - i, top: layers - i, width: w, height: h, background: e.color2 }} />
              ))}
              <div style={{ position: 'absolute', left: 0, top: 0 }}>
                {top && <CardView e={top} faceShown={top.faceUp} w={w} h={h} />}
              </div>
            </>
          )}
          <span className="count-badge deck-count">{kids.length}</span>
          <span className="deck-name">{e.name}</span>
        </div>
      );
    }
    case 'card':
    case 'tile':
      return <CardView e={e} faceShown={faceShown} />;
    case 'piece':
    case 'token':
      return (
        <div style={{ width: e.w, height: e.h }}>
          <PieceSvg e={e} faceUp={faceShown} />
        </div>
      );
    case 'dice':
      return (
        <div style={{ width: e.w, height: e.h }}>
          <DiceSvg e={e} />
        </div>
      );
    case 'spinner':
      return (
        <div style={{ width: e.w, height: e.h }}>
          <SpinnerSvg e={e} />
        </div>
      );
    case 'bag':
      return (
        <div style={{ width: e.w, height: e.h, position: 'relative' }}>
          <BagSvg e={e} count={e.children?.length ?? 0} />
          <span className="deck-name">{e.name}</span>
        </div>
      );
    case 'counter':
      return (
        <div className="counter" style={{ width: e.w, height: e.h, background: e.color, color: e.textColor }}>
          <div className="counter-name">
            {e.name}
            {e.owner !== null && <span className="owner-dot">P{e.owner + 1}</span>}
          </div>
          <div className="counter-row">
            {play?.onCounter && (
              <button className="mini" onPointerDown={(ev) => ev.stopPropagation()} onClick={() => play.onCounter!(e.id, -(e.step || 1))}>
                −
              </button>
            )}
            <span className="counter-value">{e.count ?? 0}</span>
            {play?.onCounter && (
              <button className="mini" onPointerDown={(ev) => ev.stopPropagation()} onClick={() => play.onCounter!(e.id, e.step || 1)}>
                ＋
              </button>
            )}
          </div>
        </div>
      );
    case 'timer': {
      const running = !!e.runningUntil;
      const rem = running && play?.now ? Math.max(0, Math.ceil((e.runningUntil! - play.now) / 1000)) : (e.remaining ?? e.seconds ?? 0);
      const mm = Math.floor(rem / 60);
      const ss = String(rem % 60).padStart(2, '0');
      return (
        <div className="timer" style={{ width: e.w, height: e.h, background: e.color, color: e.textColor }}>
          <div className="counter-name">{e.name}</div>
          <div className="counter-row">
            <span className="counter-value" style={{ color: rem <= 5 && running ? '#ff6b6b' : undefined }}>
              {mm}:{ss}
            </span>
            {play?.onTimerToggle && (
              <button className="mini" onPointerDown={(ev) => ev.stopPropagation()} onClick={() => play.onTimerToggle!(e.id)}>
                {running ? '⏸' : '▶'}
              </button>
            )}
          </div>
        </div>
      );
    }
    case 'text':
      return (
        <div
          className="text-entity"
          style={{ width: e.w, height: e.h, background: e.color, color: e.textColor, fontSize: e.fontSize || 18 }}
        >
          {e.text}
        </div>
      );
    case 'button':
      return (
        <button
          className="entity-button"
          style={{ width: e.w, height: e.h, background: e.color, color: e.textColor, fontSize: e.fontSize || 16 }}
          onPointerDown={play?.onButton ? (ev) => ev.stopPropagation() : undefined}
          onClick={play?.onButton ? () => play.onButton!(e.id) : undefined}
          tabIndex={play ? 0 : -1}
        >
          {e.text || e.name}
        </button>
      );
    default:
      return <div style={{ width: e.w, height: e.h, background: e.color }} />;
  }
}

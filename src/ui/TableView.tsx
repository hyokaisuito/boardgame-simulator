import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Entity, GameDefinition } from '../types';
import type { DisplayItem } from './display';
import { EntityView, type PlayHandlers } from './EntityView';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface TableApi {
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  /** 画面中央のワールド座標 */
  centerWorld: () => { x: number; y: number };
  zoom: () => number;
  fit: () => void;
}

interface DragState {
  item: DisplayItem;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
  pointerId: number;
}

export interface TableViewProps {
  table: GameDefinition['table'];
  items: DisplayItem[];
  entities: Record<string, Entity>;
  selectedKey?: string | null;
  highlightKeys?: Set<string>;
  play?: PlayHandlers;
  apiRef?: React.MutableRefObject<TableApi | null>;
  /** ドラッグを開始してよいか */
  canDrag: (item: DisplayItem) => boolean;
  onDragEnd?: (item: DisplayItem, dx: number, dy: number, clientX: number, clientY: number) => void;
  onDragMove?: (item: DisplayItem, clientX: number, clientY: number) => void;
  onItemClick?: (item: DisplayItem, ev: React.PointerEvent) => void;
  onItemDoubleClick?: (item: DisplayItem) => void;
  onItemContextMenu?: (item: DisplayItem, clientX: number, clientY: number) => void;
  onBackgroundClick?: () => void;
  onBackgroundContextMenu?: (clientX: number, clientY: number) => void;
  /** 選択枠などワールド座標上に重ねるもの */
  overlay?: (view: Viewport) => ReactNode;
  className?: string;
}

export function TableView(props: TableViewProps) {
  const { table, items, entities, selectedKey, highlightKeys, play, apiRef } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean; pointerId: number; item?: DisplayItem } | null>(null);
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastTap = useRef<{ key: string; t: number } | null>(null);

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = rootRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  }, []);

  const fit = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const zoom = Math.min(r.width / (table.width + 40), r.height / (table.height + 40), 1.5);
    setView({ zoom, x: (r.width - table.width * zoom) / 2, y: (r.height - table.height * zoom) / 2 });
  }, [table.width, table.height]);

  useLayoutEffect(() => {
    fit();
    // 最初の1回だけ全体表示
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      toWorld,
      centerWorld: () => {
        const r = rootRef.current!.getBoundingClientRect();
        return toWorld(r.left + r.width / 2, r.top + r.height / 2);
      },
      zoom: () => viewRef.current.zoom,
      fit,
    };
  }, [apiRef, toWorld, fit]);

  // ホイールでズーム（passive: false が必要なので手動登録）
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      if (ev.ctrlKey || !ev.shiftKey) {
        const factor = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015));
        const zoom = Math.max(0.15, Math.min(4, v.zoom * factor));
        const px = ev.clientX - r.left;
        const py = ev.clientY - r.top;
        setView({ zoom, x: px - ((px - v.x) * zoom) / v.zoom, y: py - ((py - v.y) * zoom) / v.zoom });
      } else {
        setView({ ...v, x: v.x - ev.deltaY, y: v.y });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (f: number) => {
    const el = rootRef.current!;
    const r = el.getBoundingClientRect();
    const v = viewRef.current;
    const zoom = Math.max(0.15, Math.min(4, v.zoom * f));
    const px = r.width / 2;
    const py = r.height / 2;
    setView({ zoom, x: px - ((px - v.x) * zoom) / v.zoom, y: py - ((py - v.y) * zoom) / v.zoom });
  };

  // ---- 背景：パン ----
  const onRootPointerDown = (ev: React.PointerEvent) => {
    pinchRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (dragRef.current) return;
    if (ev.button !== 0 && ev.button !== 1) return;
    panRef.current = { sx: ev.clientX, sy: ev.clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: false, pointerId: ev.pointerId };
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  };

  const onRootPointerMove = (ev: React.PointerEvent) => {
    const pts = pinchRef.current;
    if (pts.has(ev.pointerId) && pts.size === 2) {
      // 2本指ピンチでズーム
      const [a, b] = [...pts.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const [c, d] = [...pts.values()];
      const after = Math.hypot(c.x - d.x, c.y - d.y);
      if (before > 0) zoomBy(after / before);
      return;
    }
    if (pts.has(ev.pointerId)) pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const d = dragRef.current;
    if (d && d.pointerId === ev.pointerId) {
      const z = viewRef.current.zoom;
      const dx = (ev.clientX - d.startX) / z;
      const dy = (ev.clientY - d.startY) / z;
      const moved = d.moved || Math.abs(ev.clientX - d.startX) + Math.abs(ev.clientY - d.startY) > 4;
      const next = { ...d, dx, dy, moved };
      dragRef.current = next;
      setDrag(next);
      if (moved) props.onDragMove?.(d.item, ev.clientX, ev.clientY);
      return;
    }
    const p = panRef.current;
    if (p && p.pointerId === ev.pointerId) {
      const moved = p.moved || Math.abs(ev.clientX - p.sx) + Math.abs(ev.clientY - p.sy) > 4;
      p.moved = moved;
      setView((v) => ({ ...v, x: p.vx + ev.clientX - p.sx, y: p.vy + ev.clientY - p.sy }));
    }
  };

  const handleTap = (item: DisplayItem, ev: React.PointerEvent) => {
    props.onItemClick?.(item, ev);
    // ダブルクリック／ダブルタップ判定（ポインタキャプチャ中は dblclick が届かないため自前で判定）
    const now = Date.now();
    if (lastTap.current && lastTap.current.key === item.key && now - lastTap.current.t < 350) {
      props.onItemDoubleClick?.(item);
      lastTap.current = null;
    } else lastTap.current = { key: item.key, t: now };
  };

  const onRootPointerUp = (ev: React.PointerEvent) => {
    pinchRef.current.delete(ev.pointerId);
    const d = dragRef.current;
    if (d && d.pointerId === ev.pointerId) {
      dragRef.current = null;
      setDrag(null);
      if (d.moved) props.onDragEnd?.(d.item, d.dx, d.dy, ev.clientX, ev.clientY);
      else handleTap(d.item, ev);
      return;
    }
    const p = panRef.current;
    if (p && p.pointerId === ev.pointerId) {
      panRef.current = null;
      if (!p.moved) {
        if (p.item) handleTap(p.item, ev);
        else props.onBackgroundClick?.();
      }
    }
  };

  const onItemPointerDown = (item: DisplayItem, ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    pinchRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const canDrag = props.canDrag(item);
    const d: DragState = { item, startX: ev.clientX, startY: ev.clientY, dx: 0, dy: 0, moved: false, pointerId: ev.pointerId };
    if (!canDrag) {
      // ドラッグ不可ならテーブルのパンとして扱い、動かなければクリック
      panRef.current = { sx: ev.clientX, sy: ev.clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: false, pointerId: ev.pointerId, item };
      rootRef.current?.setPointerCapture(ev.pointerId);
      return;
    }
    dragRef.current = d;
    setDrag(d);
    rootRef.current?.setPointerCapture(ev.pointerId);
  };

  const t = view;
  return (
    <div
      ref={rootRef}
      className={`table-root ${props.className || ''}`}
      onPointerDown={onRootPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerUp={onRootPointerUp}
      onPointerCancel={onRootPointerUp}
      onContextMenu={(ev) => {
        ev.preventDefault();
        if (ev.target === rootRef.current || (ev.target as HTMLElement).classList.contains('table-surface'))
          props.onBackgroundContextMenu?.(ev.clientX, ev.clientY);
      }}
    >
      <div className="table-world" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.zoom})` }}>
        <div
          className="table-surface"
          style={{
            width: table.width,
            height: table.height,
            background: table.color,
            ...(table.image ? { backgroundImage: `url("${table.image}")`, backgroundSize: 'cover' } : {}),
          }}
        />
        {items.map((item) => {
          const isDrag = drag?.item.key === item.key && drag.moved;
          const e = item.entity;
          return (
            <div
              key={item.key}
              className={`item${selectedKey === item.key ? ' selected' : ''}${highlightKeys?.has(item.key) ? ' highlight' : ''}${isDrag ? ' dragging' : ''}`}
              style={{
                left: item.x + (isDrag ? drag!.dx : 0),
                top: item.y + (isDrag ? drag!.dy : 0),
                width: item.w,
                height: item.h,
                zIndex: isDrag ? 9_999_999 : undefined,
                transform: e.rotation ? `rotate(${e.rotation}deg)` : undefined,
              }}
              onPointerDown={(ev) => onItemPointerDown(item, ev)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                props.onItemContextMenu?.(item, ev.clientX, ev.clientY);
              }}
            >
              <EntityView e={e} faceShown={item.faceShown} entities={entities} play={play} splitTop={item.splitTop} />
            </div>
          );
        })}
        {props.overlay?.(view)}
      </div>
      <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => zoomBy(1.2)} title="拡大">＋</button>
        <button onClick={() => zoomBy(1 / 1.2)} title="縮小">−</button>
        <button onClick={fit} title="全体を表示">⤢</button>
        <span>{Math.round(view.zoom * 100)}%</span>
      </div>
    </div>
  );
}

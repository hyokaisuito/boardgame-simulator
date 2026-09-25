import { useEffect, useMemo, useRef, useState } from 'react';
import type { Preset } from '../catalog';
import { isMovable } from '../model';
import type { Entity, GameDefinition } from '../types';
import { exportGameFile, saveGame } from '../storage';
import { computeDisplay, type DisplayItem } from '../ui/display';
import { TableView, type TableApi, type Viewport } from '../ui/TableView';
import { GameSettings } from './GameSettings';
import { Inspector } from './Inspector';
import { addEntities, containerAt, deleteEntity, duplicateEntity, placeOnTable, putInContainer } from './ops';
import { Palette } from './Palette';
import { RulesEditor } from './RulesEditor';
import { useEditor } from './store';

type Tab = 'table' | 'rules' | 'settings';

export function Editor({ onBack, onPlay }: { onBack: () => void; onPlay: () => void }) {
  const game = useEditor((s) => s.game)!;
  const { update, undo, redo, select, markSaved } = useEditor.getState();
  const selectedId = useEditor((s) => s.selectedId);
  const dirty = useEditor((s) => s.dirty);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [tab, setTab] = useState<Tab>('table');
  const [gridSnap, setGridSnap] = useState(true);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const apiRef = useRef<TableApi | null>(null);

  // 自動保存
  useEffect(() => {
    if (!dirty) return;
    setSaveState('saving');
    const t = setTimeout(() => {
      saveGame(game)
        .then(() => {
          markSaved();
          setSaveState('saved');
        })
        .catch((e) => {
          console.error(e);
          setSaveState('error');
        });
    }, 600);
    return () => clearTimeout(t);
  }, [game, dirty, markSaved]);

  // キーボードショートカット
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redo();
        return;
      }
      if (tab !== 'table') return;
      const sel = useEditor.getState().selectedId;
      if (!sel) return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        const parent = useEditor.getState().game?.entities[sel]?.parentId ?? null;
        update((g) => deleteEntity(g, sel));
        select(parent);
      } else if (mod && ev.key.toLowerCase() === 'd') {
        ev.preventDefault();
        let newId: string | null = null;
        update((g) => {
          newId = duplicateEntity(g, sel);
        });
        if (newId) select(newId);
      } else if (ev.key.startsWith('Arrow')) {
        ev.preventDefault();
        const d = ev.shiftKey ? 10 : 1;
        const dx = ev.key === 'ArrowLeft' ? -d : ev.key === 'ArrowRight' ? d : 0;
        const dy = ev.key === 'ArrowUp' ? -d : ev.key === 'ArrowDown' ? d : 0;
        update((g) => {
          const e = g.entities[sel];
          if (e && !e.parentId) {
            e.x += dx;
            e.y += dy;
          }
        }, `nudge.${sel}`);
      } else if (ev.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, undo, redo, update, select]);

  const items = useMemo(() => computeDisplay(game.entities, null), [game.entities]);

  const addPreset = (p: Preset) => {
    const c = apiRef.current?.centerWorld() ?? { x: 200, y: 200 };
    const list = p.create(0, 0);
    const root = list[0];
    const pos = findFreeSpot(game, root, c.x, c.y);
    root.x = pos.x;
    root.y = pos.y;
    update((g) => addEntities(g, list));
    select(root.id);
  };

  const onDragEnd = (item: DisplayItem, dx: number, dy: number, cx: number, cy: number) => {
    const id = item.entity.id;
    const w = apiRef.current!.toWorld(cx, cy);
    update((g) => {
      const e = g.entities[id];
      if (!e) return;
      const target = isMovable(e) ? containerAt(g, w.x, w.y, id) : undefined;
      if (target && target.id !== e.parentId) {
        const tgt = g.entities[target.id];
        // 山札の最初のカードでカードサイズを決める
        if (tgt.type === 'deck' && !(tgt.children || []).length && e.type === 'card') {
          tgt.cardW = e.w;
          tgt.cardH = e.h;
          tgt.w = e.w;
          tgt.h = e.h;
        }
        putInContainer(g, id, target.id);
      } else if (target && target.id === e.parentId) {
        // 同じコンテナ内：何もしない
      } else {
        placeOnTable(g, id, item.x + dx, item.y + dy, gridSnap ? 10 : 1);
      }
    });
    select(id);
  };

  const selectedItem = items.find((i) => i.key === selectedId);

  const overlay = (view: Viewport) =>
    selectedItem && !selectedItem.containerId ? (
      <ResizeHandle item={selectedItem} zoom={view.zoom} gridSnap={gridSnap} />
    ) : null;

  return (
    <div className="editor">
      <header className="topbar">
        <button onClick={onBack} title="ホームへ">
          ← ホーム
        </button>
        <input
          className="title-input"
          value={game.name}
          onChange={(e) => update((g) => (g.name = e.target.value), 'name')}
        />
        <nav className="tabs">
          <button className={tab === 'table' ? 'active' : ''} onClick={() => setTab('table')}>
            🧩 テーブル
          </button>
          <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>
            ⚙️ ルール <span className="badge">{game.rules.length}</span>
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            👥 プレイヤー・設定
          </button>
        </nav>
        <span className="grow" />
        <button onClick={undo} disabled={!canUndo} title="元に戻す (Ctrl+Z)">
          ↶
        </button>
        <button onClick={redo} disabled={!canRedo} title="やり直す (Ctrl+Y)">
          ↷
        </button>
        <span className={`save-state ${saveState}`}>
          {saveState === 'saving' ? '保存中…' : saveState === 'error' ? '⚠ 保存失敗' : '✓ 保存済み'}
        </span>
        <button onClick={() => exportGameFile(game)} title="JSONファイルとして書き出す">
          ⬇ 書き出し
        </button>
        <button
          className="primary"
          onClick={async () => {
            await saveGame(game);
            markSaved();
            onPlay();
          }}
        >
          ▶ テストプレイ
        </button>
      </header>
      {tab === 'table' && (
        <div className="editor-main">
          <aside className="left-panel">
            <Palette onAdd={addPreset} />
          </aside>
          <main className="center">
            <TableView
              table={game.table}
              items={items}
              entities={game.entities}
              selectedKey={selectedId}
              apiRef={apiRef}
              canDrag={() => true}
              onDragEnd={onDragEnd}
              onItemClick={(item) => select(item.entity.id)}
              onBackgroundClick={() => select(null)}
              overlay={overlay}
            />
            <div className="table-hint">
              <label className="check">
                <input type="checkbox" checked={gridSnap} onChange={(e) => setGridSnap(e.target.checked)} />
                10px単位で配置
              </label>
            </div>
          </main>
          <aside className="right-panel">
            <Inspector />
          </aside>
        </div>
      )}
      {tab === 'rules' && (
        <div className="scroll-page">
          <RulesEditor />
        </div>
      )}
      {tab === 'settings' && (
        <div className="scroll-page">
          <GameSettings />
        </div>
      )}
    </div>
  );
}

const BACKGROUND = new Set(['board', 'zone']);

/** 画面中央から渦巻き状に探して、同じ層の部品と重ならない位置を返す */
function findFreeSpot(game: GameDefinition, e: Entity, cx: number, cy: number): { x: number; y: number } {
  const bg = BACKGROUND.has(e.type);
  const others = Object.values(game.entities).filter((o) => !o.parentId && BACKGROUND.has(o.type) === bg);
  const gap = 12;
  const hits = (x: number, y: number) =>
    others.some((o) => x < o.x + o.w + gap && x + e.w + gap > o.x && y < o.y + o.h + gap && y + e.h + gap > o.y);
  const step = Math.max(20, Math.min(e.w, e.h) / 2);
  for (let ring = 0; ring < 40; ring++) {
    for (let i = -ring; i <= ring; i++) {
      for (const [dx, dy] of [
        [i, -ring],
        [i, ring],
        [-ring, i],
        [ring, i],
      ]) {
        const x = Math.round(cx - e.w / 2 + dx * step);
        const y = Math.round(cy - e.h / 2 + dy * step);
        if (!hits(x, y)) return { x, y };
      }
    }
  }
  return { x: Math.round(cx - e.w / 2), y: Math.round(cy - e.h / 2) };
}

function ResizeHandle({ item, zoom, gridSnap }: { item: DisplayItem; zoom: number; gridSnap: boolean }) {
  const update = useEditor((s) => s.update);
  const start = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const size = 12 / zoom;
  const e = item.entity;
  return (
    <div
      className="resize-handle"
      style={{ left: item.x + item.w - size / 2, top: item.y + item.h - size / 2, width: size, height: size }}
      onPointerDown={(ev) => {
        ev.stopPropagation();
        (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
        start.current = { x: ev.clientX, y: ev.clientY, w: e.w, h: e.h };
      }}
      onPointerMove={(ev) => {
        const s = start.current;
        if (!s) return;
        ev.stopPropagation();
        let w = Math.max(8, s.w + (ev.clientX - s.x) / zoom);
        let h = Math.max(8, s.h + (ev.clientY - s.y) / zoom);
        if (ev.shiftKey || e.type === 'dice' || e.type === 'spinner') {
          // 縦横比を保つ
          const r = s.w / s.h;
          if (w / h > r) h = w / r;
          else w = h * r;
        }
        if (gridSnap && !ev.altKey) {
          w = Math.max(10, Math.round(w / 10) * 10);
          h = Math.max(10, Math.round(h / 10) * 10);
        }
        update((g) => {
          const t = g.entities[e.id];
          t.w = Math.round(w);
          t.h = Math.round(h);
          if (t.type === 'deck') {
            t.cardW = t.w;
            t.cardH = t.h;
            for (const cid of t.children || []) {
              const c = g.entities[cid];
              if (c) {
                c.w = t.w;
                c.h = t.h;
              }
            }
          }
        }, `resize.${e.id}`);
      }}
      onPointerUp={(ev) => {
        ev.stopPropagation();
        start.current = null;
      }}
    />
  );
}

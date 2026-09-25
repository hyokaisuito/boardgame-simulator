import { computeCells, nearestCell } from '../engine/geometry';
import { isContainer, isMovable, uid } from '../model';
import type { Entity, GameDefinition } from '../types';

export function maxZ(g: GameDefinition): number {
  return Math.max(0, ...Object.values(g.entities).map((e) => e.z || 0));
}

export function addEntities(g: GameDefinition, list: Entity[]): void {
  let z = maxZ(g);
  for (const e of list) {
    if (!e.parentId && e.type !== 'board' && e.type !== 'zone') e.z = ++z;
    g.entities[e.id] = e;
  }
}

function detach(g: GameDefinition, id: string): void {
  const e = g.entities[id];
  if (!e?.parentId) return;
  const p = g.entities[e.parentId];
  if (p?.children) p.children = p.children.filter((c) => c !== id);
  e.parentId = null;
}

export function deleteEntity(g: GameDefinition, id: string): void {
  const e = g.entities[id];
  if (!e) return;
  for (const c of e.children || []) deleteEntity(g, c);
  detach(g, id);
  delete g.entities[id];
}

export function duplicateEntity(g: GameDefinition, id: string, offset = 24): string | null {
  const src = g.entities[id];
  if (!src) return null;
  const copy = (e: Entity, parentId: string | null): Entity => {
    const n: Entity = { ...structuredClone(e), id: uid('e_'), parentId };
    if (e.children) n.children = e.children.map((cid) => copy(g.entities[cid], n.id)).map((c) => c.id);
    g.entities[n.id] = n;
    return n;
  };
  const dup = copy(src, src.parentId);
  if (src.parentId) {
    g.entities[src.parentId]?.children?.push(dup.id);
  } else {
    dup.x += offset;
    dup.y += offset;
    if (!['board', 'zone'].includes(dup.type)) dup.z = maxZ(g) + 1;
  }
  return dup.id;
}

export function putInContainer(g: GameDefinition, id: string, containerId: string): void {
  const c = g.entities[containerId];
  const e = g.entities[id];
  if (!c || !e || !isContainer(c) || id === containerId) return;
  detach(g, id);
  c.children = [...(c.children || []), id];
  e.parentId = containerId;
  if (c.enterFace === 'up') e.faceUp = true;
  if (c.enterFace === 'down') e.faceUp = false;
}

/** テーブル上に置く。ボードのスナップ設定があればマスに合わせる */
export function placeOnTable(g: GameDefinition, id: string, x: number, y: number, gridSnap: number): void {
  const e = g.entities[id];
  if (!e) return;
  detach(g, id);
  e.x = x;
  e.y = y;
  if (isMovable(e)) {
    const cx = x + e.w / 2;
    const cy = y + e.h / 2;
    const board = Object.values(g.entities)
      .filter((b) => b.type === 'board' && !b.parentId && b.grid?.snap && b.grid.kind !== 'none')
      .filter((b) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h)
      .sort((a, b) => b.z - a.z)[0];
    if (board) {
      const c = nearestCell(computeCells(board.grid, board.w, board.h), cx - board.x, cy - board.y);
      if (c) {
        e.x = board.x + c.cx - e.w / 2;
        e.y = board.y + c.cy - e.h / 2;
        return;
      }
    }
  }
  if (gridSnap > 1) {
    e.x = Math.round(e.x / gridSnap) * gridSnap;
    e.y = Math.round(e.y / gridSnap) * gridSnap;
  }
}

/** ドロップ位置の下にあるコンテナ（自分自身・子孫は除く） */
export function containerAt(g: GameDefinition, x: number, y: number, excludeId: string): Entity | undefined {
  return Object.values(g.entities)
    .filter((c) => !c.parentId && isContainer(c) && c.id !== excludeId && c.type !== 'hand')
    .filter((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h)
    .sort((a, b) => {
      // エリアより山札・袋を優先
      const pa = a.type === 'zone' ? 0 : 1;
      const pb = b.type === 'zone' ? 0 : 1;
      return pb - pa || b.z - a.z;
    })[0];
}

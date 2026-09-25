import { BOX_ID } from '../engine/engine';
import type { Entity } from '../types';

export interface DisplayItem {
  key: string;
  entity: Entity;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  faceShown: boolean;
  /** コンテナの中の物として表示している場合の親 */
  containerId: string | null;
  background: boolean;
  /** 山札の一番上を別アイテムとして描画する（山札自体は2枚目を表示） */
  splitTop?: boolean;
}

const BACKGROUND_TYPES = new Set(['board', 'zone']);

/** 表面を見せてよいか（プライベートなエリアの中身は所有者だけ） */
function faceVisible(e: Entity, parent: Entity | undefined, viewer: number | null): boolean {
  if (!e.faceUp) return false;
  if (parent?.privateToOwner && viewer !== null && parent.owner !== null && parent.owner !== viewer) return false;
  return true;
}

/**
 * テーブルに描画するアイテムの一覧を作る。
 * viewer: 見ているプレイヤー（null = 全員の視点／エディタ）
 */
export function computeDisplay(entities: Record<string, Entity>, viewer: number | null): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const e of Object.values(entities)) {
    if (e.parentId !== null || e.type === 'hand' || e.id === BOX_ID) continue;
    const background = BACKGROUND_TYPES.has(e.type);
    items.push({
      key: e.id,
      entity: e,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      z: (background ? 0 : 1_000_000) + e.z,
      faceShown: e.faceUp,
      containerId: null,
      background,
    });
    if (e.type === 'zone' && e.layout && e.layout !== 'free') {
      const kids = (e.children || []).map((id) => entities[id]).filter(Boolean);
      if (!kids.length) continue;
      const baseZ = 500_000 + e.z * 1000;
      if (e.layout === 'stack') {
        const top = kids[kids.length - 1];
        items.push({
          key: top.id,
          entity: top,
          x: e.x + (e.w - top.w) / 2,
          y: e.y + (e.h - top.h) / 2,
          w: top.w,
          h: top.h,
          z: baseZ + 1,
          faceShown: faceVisible(top, e, viewer),
          containerId: e.id,
          background: false,
        });
      } else if (e.layout === 'row') {
        const pad = 8;
        const cw = kids[0].w;
        const avail = e.w - pad * 2 - cw;
        const step = kids.length > 1 ? Math.min(cw + 6, avail / (kids.length - 1)) : 0;
        kids.forEach((k, i) =>
          items.push({
            key: k.id,
            entity: k,
            x: e.x + pad + step * i,
            y: e.y + (e.h - k.h) / 2,
            w: k.w,
            h: k.h,
            z: baseZ + i + 1,
            faceShown: faceVisible(k, e, viewer),
            containerId: e.id,
            background: false,
          }),
        );
      } else {
        const pad = 8;
        const cw = kids[0].w + 6;
        const ch = kids[0].h + 6;
        const perRow = Math.max(1, Math.floor((e.w - pad * 2 + 6) / cw));
        kids.forEach((k, i) =>
          items.push({
            key: k.id,
            entity: k,
            x: e.x + pad + (i % perRow) * cw,
            y: e.y + pad + 16 + Math.floor(i / perRow) * ch,
            w: k.w,
            h: k.h,
            z: baseZ + i + 1,
            faceShown: faceVisible(k, e, viewer),
            containerId: e.id,
            background: false,
          }),
        );
      }
    }
  }
  return items.sort((a, b) => a.z - b.z);
}

/** 画面座標の点の下にあるアイテム（最前面から） */
export function itemsAt(items: DisplayItem[], x: number, y: number): DisplayItem[] {
  return items.filter((i) => x >= i.x && x <= i.x + i.w && y >= i.y && y <= i.y + i.h).reverse();
}

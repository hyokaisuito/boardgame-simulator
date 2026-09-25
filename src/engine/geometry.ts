import type { Entity, GridDef } from '../types';

export interface Cell {
  index: number;
  /** ボード左上を原点とするマスの中心 */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 六角マスの半径（hexのみ） */
  r?: number;
}

/** ボードのマス（または交点）一覧を計算する */
export function computeCells(grid: GridDef | undefined, w: number, h: number): Cell[] {
  if (!grid || grid.kind === 'none') return [];
  const cols = Math.max(1, Math.floor(grid.cols));
  const rows = Math.max(1, Math.floor(grid.rows));
  const m = Math.max(0, grid.margin || 0);
  const iw = Math.max(1, w - m * 2);
  const ih = Math.max(1, h - m * 2);
  const cells: Cell[] = [];

  switch (grid.kind) {
    case 'square': {
      const cw = iw / cols;
      const ch = ih / rows;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          cells.push({ index: cells.length, cx: m + cw * (c + 0.5), cy: m + ch * (r + 0.5), w: cw, h: ch });
      return cells;
    }
    case 'intersection': {
      const cw = cols > 1 ? iw / (cols - 1) : iw;
      const ch = rows > 1 ? ih / (rows - 1) : ih;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          cells.push({ index: cells.length, cx: m + cw * c, cy: m + ch * r, w: cw, h: ch });
      return cells;
    }
    case 'hex': {
      // pointy-top, 奇数行を右にずらす配置
      const rByW = iw / ((cols + 0.5) * Math.sqrt(3));
      const rByH = ih / (rows * 1.5 + 0.5);
      const r = Math.min(rByW, rByH);
      const hw = Math.sqrt(3) * r;
      const totalW = hw * (cols + (rows > 1 ? 0.5 : 0));
      const totalH = r * (rows * 1.5 + 0.5);
      const ox = m + (iw - totalW) / 2;
      const oy = m + (ih - totalH) / 2;
      for (let row = 0; row < rows; row++)
        for (let c = 0; c < cols; c++)
          cells.push({
            index: cells.length,
            cx: ox + hw * (c + 0.5 + (row % 2 ? 0.5 : 0)),
            cy: oy + r + row * 1.5 * r,
            w: hw,
            h: 2 * r,
            r,
          });
      return cells;
    }
    case 'track': {
      const cw = iw / cols;
      const ch = ih / rows;
      const at = (c: number, r: number) =>
        cells.push({ index: cells.length, cx: m + cw * (c + 0.5), cy: m + ch * (r + 0.5), w: cw, h: ch });
      if (grid.trackShape === 'snake') {
        // 左下から右へ、1段上がって左へ…と蛇行
        const total = Math.min(cols * rows, Math.max(1, grid.trackLength || cols * rows));
        for (let i = 0; i < total; i++) {
          const rowFromBottom = Math.floor(i / cols);
          const pos = i % cols;
          const c = rowFromBottom % 2 === 0 ? pos : cols - 1 - pos;
          at(c, rows - 1 - rowFromBottom);
        }
      } else {
        // 外周を左上から時計回り
        if (rows === 1 || cols === 1) {
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) at(c, r);
          return cells;
        }
        for (let c = 0; c < cols; c++) at(c, 0);
        for (let r = 1; r < rows; r++) at(cols - 1, r);
        for (let c = cols - 2; c >= 0; c--) at(c, rows - 1);
        for (let r = rows - 2; r >= 1; r--) at(0, r);
      }
      return cells;
    }
  }
  return cells;
}

/** ボード上のローカル座標に最も近いマス。遠すぎる場合は null */
export function nearestCell(cells: Cell[], lx: number, ly: number): Cell | null {
  let best: Cell | null = null;
  let bestD = Infinity;
  for (const c of cells) {
    const d = (c.cx - lx) ** 2 + (c.cy - ly) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return null;
  const limit = Math.max(best.w, best.h) * 0.9;
  return bestD <= limit * limit ? best : null;
}

export function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

export function containsPoint(e: Entity, x: number, y: number): boolean {
  return x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h;
}

export function center(e: Entity): { x: number; y: number } {
  return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
}

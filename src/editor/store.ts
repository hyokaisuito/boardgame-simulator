import { create } from 'zustand';
import type { GameDefinition } from '../types';

interface EditorState {
  game: GameDefinition | null;
  past: GameDefinition[];
  future: GameDefinition[];
  selectedId: string | null;
  /** 最後に保存してから変更があるか */
  dirty: boolean;
  lastMergeKey: string | null;
  lastMergeAt: number;
  setGame: (g: GameDefinition | null) => void;
  /**
   * ゲーム定義を更新する。mergeKey が同じ連続操作（文字入力など）は
   * 1つの「元に戻す」単位にまとめる。
   */
  update: (fn: (draft: GameDefinition) => void, mergeKey?: string) => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  markSaved: () => void;
}

const HISTORY_LIMIT = 100;

export const useEditor = create<EditorState>((set, get) => ({
  game: null,
  past: [],
  future: [],
  selectedId: null,
  dirty: false,
  lastMergeKey: null,
  lastMergeAt: 0,
  setGame: (g) => set({ game: g, past: [], future: [], selectedId: null, dirty: false, lastMergeKey: null }),
  update: (fn, mergeKey) => {
    const { game, past, lastMergeKey, lastMergeAt } = get();
    if (!game) return;
    const draft = structuredClone(game);
    fn(draft);
    draft.updatedAt = Date.now();
    const now = Date.now();
    const merge = !!mergeKey && mergeKey === lastMergeKey && now - lastMergeAt < 1500;
    set({
      game: draft,
      past: merge ? past : [...past, game].slice(-HISTORY_LIMIT),
      future: [],
      dirty: true,
      lastMergeKey: mergeKey ?? null,
      lastMergeAt: now,
    });
  },
  undo: () => {
    const { game, past, future, selectedId } = get();
    if (!game || !past.length) return;
    const prev = past[past.length - 1];
    set({
      game: prev,
      past: past.slice(0, -1),
      future: [game, ...future],
      dirty: true,
      lastMergeKey: null,
      selectedId: selectedId && prev.entities[selectedId] ? selectedId : null,
    });
  },
  redo: () => {
    const { game, past, future, selectedId } = get();
    if (!game || !future.length) return;
    const next = future[0];
    set({
      game: next,
      past: [...past, game],
      future: future.slice(1),
      dirty: true,
      lastMergeKey: null,
      selectedId: selectedId && next.entities[selectedId] ? selectedId : null,
    });
  },
  select: (id) => set({ selectedId: id }),
  markSaved: () => set({ dirty: false }),
}));

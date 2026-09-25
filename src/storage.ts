import { createStore, del, get, set, values } from 'idb-keyval';
import { normalizeGame } from './model';
import type { GameDefinition } from './types';

const store = createStore('boardgame-studio', 'games');

export interface GameSummary {
  id: string;
  name: string;
  description: string;
  updatedAt: number;
  entityCount: number;
  ruleCount: number;
}

export async function listGames(): Promise<GameSummary[]> {
  const all = (await values(store)) as GameDefinition[];
  return all
    .map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      updatedAt: g.updatedAt,
      entityCount: Object.values(g.entities).filter((e) => !e.parentId).length,
      ruleCount: g.rules.length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadGame(id: string): Promise<GameDefinition | undefined> {
  const g = await get(id, store);
  return g ? normalizeGame(g) : undefined;
}

export async function saveGame(g: GameDefinition): Promise<void> {
  await set(g.id, g, store);
}

export async function deleteGame(id: string): Promise<void> {
  await del(id, store);
}

export function exportGameFile(g: GameDefinition): void {
  const blob = new Blob([JSON.stringify(g, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${g.name.replace(/[\\/:*?"<>|]/g, '_') || 'game'}.bgame.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readGameFile(file: File): Promise<GameDefinition> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('JSONとして読み込めませんでした');
  }
  return normalizeGame(raw);
}

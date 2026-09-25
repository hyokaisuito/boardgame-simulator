import type { Entity, EntityType, GameDefinition, GridDef, Rule } from './types';

export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return prefix + rnd;
}

export const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1'];

export const TYPE_LABELS: Record<EntityType, string> = {
  board: 'ボード',
  zone: 'エリア',
  deck: '山札',
  card: 'カード',
  piece: '駒',
  tile: 'タイル',
  token: 'トークン',
  dice: 'ダイス',
  spinner: 'ルーレット',
  bag: '袋',
  counter: 'カウンター',
  timer: 'タイマー',
  text: 'テキスト',
  button: 'ボタン',
  hand: '手札',
};

export function defaultGrid(partial: Partial<GridDef> = {}): GridDef {
  return {
    kind: 'square',
    cols: 8,
    rows: 8,
    margin: 0,
    checker: false,
    lineColor: '#333333',
    snap: true,
    trackShape: 'loop',
    showIndex: false,
    ...partial,
  };
}

export function makeEntity(type: EntityType, partial: Partial<Entity> = {}): Entity {
  const base: Entity = {
    id: uid('e_'),
    type,
    name: TYPE_LABELS[type],
    x: 100,
    y: 100,
    w: 60,
    h: 60,
    rotation: 0,
    z: 1,
    parentId: null,
    owner: null,
    locked: false,
    faceUp: true,
    color: '#cccccc',
    color2: '#555555',
    textColor: '#222222',
    text: '',
    backText: '',
    image: '',
    backImage: '',
    group: '',
    props: {},
  };
  switch (type) {
    case 'deck':
    case 'zone':
    case 'bag':
    case 'hand':
      base.children = [];
      break;
  }
  return { ...base, ...partial, props: { ...(partial.props || {}) } };
}

export function isContainer(e: Entity | undefined): boolean {
  if (!e) return false;
  if (e.type === 'deck' || e.type === 'bag' || e.type === 'hand') return true;
  if (e.type === 'zone') return e.layout !== 'free';
  return false;
}

/** 動かしてコンテナ・ボードに入れられるもの */
export function isMovable(e: Entity): boolean {
  return ['card', 'piece', 'tile', 'token', 'dice'].includes(e.type);
}

export function canFlip(e: Entity): boolean {
  return e.type === 'card' || e.type === 'tile' || ((e.type === 'piece' || e.type === 'token') && !!e.twoSided);
}

export function newGame(name = '新しいゲーム'): GameDefinition {
  const now = Date.now();
  return {
    id: uid('g_'),
    version: 1,
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    table: { width: 1600, height: 1000, color: '#2d5a3d', image: '' },
    players: {
      min: 2,
      max: 4,
      defaultCount: 2,
      names: ['プレイヤー1', 'プレイヤー2', 'プレイヤー3', 'プレイヤー4', 'プレイヤー5', 'プレイヤー6', 'プレイヤー7', 'プレイヤー8'],
      colors: [...PLAYER_COLORS],
      hideOnSwitch: true,
    },
    phases: [],
    playerVars: [{ id: 'score', name: '得点', initial: 0 }],
    globalVars: [],
    entities: {},
    rules: [],
  };
}

export function newRule(): Rule {
  return {
    id: uid('r_'),
    name: '新しいルール',
    enabled: true,
    once: false,
    trigger: { type: 'buttonPressed', entityId: '' },
    match: 'all',
    conditions: [],
    actions: [],
  };
}

/** 保存データを現在の形式にそろえる（古い/欠けたデータへの耐性） */
export function normalizeGame(raw: unknown): GameDefinition {
  const g = raw as Partial<GameDefinition>;
  if (!g || typeof g !== 'object' || typeof g.entities !== 'object') {
    throw new Error('ゲームデータの形式が正しくありません');
  }
  const base = newGame(g.name || '無題のゲーム');
  const entities: Record<string, Entity> = {};
  for (const [id, e] of Object.entries(g.entities || {})) {
    const fixed = makeEntity(e.type, { ...e, id });
    entities[id] = fixed;
  }
  return {
    ...base,
    ...g,
    id: g.id || base.id,
    version: 1,
    table: { ...base.table, ...(g.table || {}) },
    players: { ...base.players, ...(g.players || {}) },
    phases: g.phases || [],
    playerVars: g.playerVars || [],
    globalVars: g.globalVars || [],
    rules: g.rules || [],
    entities,
  };
}

/** エンティティの表示名（ルールエディタの選択肢などで使用） */
export function entityLabel(e: Entity): string {
  return `${e.name || '(無名)'}〔${TYPE_LABELS[e.type]}〕`;
}

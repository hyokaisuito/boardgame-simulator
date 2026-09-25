import { defaultGrid, makeEntity } from './model';
import type { Entity, PieceShape } from './types';

export interface Preset {
  key: string;
  label: string;
  icon: string;
  hint: string;
  /** 生成するエンティティ。先頭が配置の基準になる。 */
  create: (x: number, y: number) => Entity[];
}

export interface PresetCategory {
  label: string;
  presets: Preset[];
}

// ---------------------------------------------------------------
// カード生成ヘルパー
// ---------------------------------------------------------------

export const SUITS = [
  { mark: '♠', key: 'spade', red: false },
  { mark: '♥', key: 'heart', red: true },
  { mark: '♦', key: 'diamond', red: true },
  { mark: '♣', key: 'club', red: false },
];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export interface CardSpec {
  name: string;
  text: string;
  color?: string;
  textColor?: string;
  image?: string;
  group?: string;
  props?: Record<string, string | number>;
}

export function playingCardSpecs(jokers = 2): CardSpec[] {
  const specs: CardSpec[] = [];
  for (const s of SUITS)
    RANKS.forEach((r, i) =>
      specs.push({
        name: `${s.mark}${r}`,
        text: `${s.mark}${r}`,
        textColor: s.red ? '#c0392b' : '#1a1a1a',
        color: '#ffffff',
        group: 'トランプ',
        props: { suit: s.key, rank: i + 1, red: s.red ? 1 : 0 },
      }),
    );
  for (let j = 0; j < jokers; j++)
    specs.push({
      name: 'JOKER',
      text: '🃏\nJOKER',
      textColor: '#8e44ad',
      color: '#ffffff',
      group: 'トランプ',
      props: { suit: 'joker', rank: 0, red: 0 },
    });
  return specs;
}

export function numberCardSpecs(from: number, to: number, colors: string[] = ['#ffffff']): CardSpec[] {
  const specs: CardSpec[] = [];
  for (const color of colors)
    for (let n = from; n <= to; n++)
      specs.push({ name: String(n), text: String(n), color, textColor: '#222', props: { number: n } });
  return specs;
}

/** 山札とカードをまとめて生成する */
export function buildDeck(deck: Entity, specs: CardSpec[]): Entity[] {
  const cards = specs.map((s, i) =>
    makeEntity('card', {
      name: s.name,
      text: s.text,
      color: s.color ?? '#ffffff',
      textColor: s.textColor ?? '#222222',
      color2: deck.color2,
      backText: deck.backText,
      backImage: deck.backImage,
      image: s.image ?? '',
      group: s.group ?? '',
      props: { ...(s.props || {}) },
      w: deck.cardW ?? deck.w,
      h: deck.cardH ?? deck.h,
      faceUp: false,
      parentId: deck.id,
      z: i + 1,
    }),
  );
  deck.children = cards.map((c) => c.id);
  return [deck, ...cards];
}

function deck(x: number, y: number, partial: Partial<Entity> = {}): Entity {
  return makeEntity('deck', {
    name: '山札',
    x,
    y,
    w: 90,
    h: 130,
    cardW: 90,
    cardH: 130,
    color: '#ffffff',
    color2: '#1f4e8c',
    backText: '★',
    enterFace: 'down',
    layout: 'stack',
    locked: true,
    ...partial,
  });
}

function piece(shape: PieceShape, x: number, y: number, partial: Partial<Entity> = {}): Entity {
  return makeEntity('piece', { name: '駒', shape, x, y, w: 44, h: 44, color: '#e74c3c', color2: '#ffffff', ...partial });
}

function dice(sides: number, x: number, y: number, partial: Partial<Entity> = {}): Entity {
  const faces = Array.from({ length: sides }, (_, i) => String(i + 1));
  return makeEntity('dice', {
    name: `${sides}面ダイス`,
    x,
    y,
    w: 56,
    h: 56,
    sides,
    faces,
    value: sides - 1,
    diceStyle: sides === 6 ? 'pips' : 'number',
    color: '#ffffff',
    textColor: '#222222',
    ...partial,
  });
}

// ---------------------------------------------------------------
// パレット
// ---------------------------------------------------------------

export const CATALOG: PresetCategory[] = [
  {
    label: 'ボード',
    presets: [
      {
        key: 'board-free',
        label: '自由ボード',
        icon: '🟫',
        hint: '画像や色を貼るだけのボード（マス目なし）',
        create: (x, y) => [
          makeEntity('board', { name: 'ボード', x, y, w: 600, h: 400, color: '#e8d3a6', locked: true, z: 0, grid: defaultGrid({ kind: 'none' }) }),
        ],
      },
      {
        key: 'board-square',
        label: 'マス目ボード',
        icon: '♟️',
        hint: 'チェス・チェッカーなどの正方形マス',
        create: (x, y) => [
          makeEntity('board', {
            name: '8×8ボード',
            x,
            y,
            w: 480,
            h: 480,
            color: '#f0d9b5',
            color2: '#b58863',
            locked: true,
            z: 0,
            grid: defaultGrid({ kind: 'square', cols: 8, rows: 8, checker: true }),
          }),
        ],
      },
      {
        key: 'board-shogi',
        label: '将棋盤 (9×9)',
        icon: '☗',
        hint: '9×9の正方形マス',
        create: (x, y) => [
          makeEntity('board', {
            name: '将棋盤',
            x,
            y,
            w: 470,
            h: 510,
            color: '#e3b85f',
            locked: true,
            z: 0,
            grid: defaultGrid({ kind: 'square', cols: 9, rows: 9, margin: 10 }),
          }),
        ],
      },
      {
        key: 'board-go',
        label: '交点ボード (碁盤)',
        icon: '⚫',
        hint: '線の交点に石を置く（囲碁・五目並べ）',
        create: (x, y) => [
          makeEntity('board', {
            name: '碁盤',
            x,
            y,
            w: 560,
            h: 560,
            color: '#dcb35c',
            locked: true,
            z: 0,
            grid: defaultGrid({ kind: 'intersection', cols: 19, rows: 19, margin: 22 }),
          }),
        ],
      },
      {
        key: 'board-hex',
        label: '六角グリッド',
        icon: '⬡',
        hint: 'ヘックス（カタン・ウォーゲーム等）',
        create: (x, y) => [
          makeEntity('board', {
            name: '六角ボード',
            x,
            y,
            w: 560,
            h: 460,
            color: '#8fbc8f',
            color2: '#a8d5a8',
            locked: true,
            z: 0,
            grid: defaultGrid({ kind: 'hex', cols: 9, rows: 7, margin: 8, lineColor: '#2f4f2f' }),
          }),
        ],
      },
      {
        key: 'board-snake',
        label: 'すごろくトラック',
        icon: '🎲',
        hint: 'スタートからゴールまで蛇行するマス',
        create: (x, y) => [
          makeEntity('board', {
            name: 'すごろく',
            x,
            y,
            w: 600,
            h: 400,
            color: '#fff5d6',
            color2: '#ffe08a',
            locked: true,
            z: 0,
            grid: defaultGrid({
              kind: 'track',
              trackShape: 'snake',
              cols: 6,
              rows: 5,
              trackLength: 30,
              checker: true,
              showIndex: true,
              labels: ['スタート'],
            }),
          }),
        ],
      },
      {
        key: 'board-loop',
        label: '周回トラック',
        icon: '🔁',
        hint: '外周をぐるぐる回る（モノポリー型）',
        create: (x, y) => [
          makeEntity('board', {
            name: '周回ボード',
            x,
            y,
            w: 560,
            h: 560,
            color: '#d5ecd4',
            color2: '#bfe0bd',
            locked: true,
            z: 0,
            grid: defaultGrid({ kind: 'track', trackShape: 'loop', cols: 8, rows: 8, checker: true, showIndex: true, labels: ['GO'] }),
          }),
        ],
      },
    ],
  },
  {
    label: 'カード',
    presets: [
      {
        key: 'deck-empty',
        label: '山札（空）',
        icon: '🂠',
        hint: '自作カードを入れる山札',
        create: (x, y) => [deck(x, y)],
      },
      {
        key: 'deck-playing',
        label: 'トランプ (54枚)',
        icon: '🂡',
        hint: '52枚＋ジョーカー2枚',
        create: (x, y) => buildDeck(deck(x, y, { name: 'トランプ', color2: '#b03a2e', backText: '♦' }), playingCardSpecs(2)),
      },
      {
        key: 'deck-number',
        label: '数字カード (1〜10×4色)',
        icon: '🔢',
        hint: 'UNO風の色つき数字カード',
        create: (x, y) =>
          buildDeck(
            deck(x, y, { name: '数字カード', color2: '#222222', backText: '?' }),
            numberCardSpecs(1, 10, ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f']),
          ),
      },
      {
        key: 'card',
        label: 'カード（単体）',
        icon: '🃏',
        hint: 'テーブルに置く1枚のカード',
        create: (x, y) => [
          makeEntity('card', { name: 'カード', text: 'カード', x, y, w: 90, h: 130, color: '#ffffff', color2: '#1f4e8c', backText: '★' }),
        ],
      },
      {
        key: 'zone-discard',
        label: '捨て札置き場',
        icon: '🗑️',
        hint: 'カードを重ねて置くエリア（表向き）',
        create: (x, y) => [
          makeEntity('zone', { name: '捨て札', x, y, w: 110, h: 150, color: '#ffffff33', layout: 'stack', enterFace: 'up', locked: true, z: 0 }),
        ],
      },
      {
        key: 'zone-row',
        label: '場札エリア（横並び）',
        icon: '🀰',
        hint: 'カードを横に並べて見せるエリア',
        create: (x, y) => [
          makeEntity('zone', { name: '場', x, y, w: 480, h: 150, color: '#ffffff22', layout: 'row', enterFace: 'up', locked: true, z: 0 }),
        ],
      },
      {
        key: 'zone-player',
        label: 'プレイヤーエリア',
        icon: '🧑',
        hint: 'プレイヤー専用の置き場（所有者を設定）',
        create: (x, y) => [
          makeEntity('zone', {
            name: 'プレイヤーエリア',
            x,
            y,
            w: 360,
            h: 160,
            color: '#e74c3c22',
            layout: 'row',
            enterFace: 'up',
            owner: 0,
            locked: true,
            z: 0,
          }),
        ],
      },
    ],
  },
  {
    label: '駒',
    presets: [
      { key: 'meeple', label: 'ミープル', icon: '🧍', hint: '人型の駒', create: (x, y) => [piece('meeple', x, y, { name: 'ミープル' })] },
      { key: 'pawn', label: 'ポーン', icon: '♟', hint: 'すごろくの駒など', create: (x, y) => [piece('pawn', x, y, { name: 'ポーン' })] },
      {
        key: 'checker',
        label: 'チェッカー駒',
        icon: '⛀',
        hint: '円盤型の駒',
        create: (x, y) => [piece('disc', x, y, { name: 'チェッカー', color: '#c0392b', color2: '#ffffff', w: 48, h: 48 })],
      },
      {
        key: 'reversi',
        label: 'リバーシ石',
        icon: '⚪',
        hint: '両面の石（ダブルクリックで裏返す）',
        create: (x, y) => [
          piece('stone', x, y, { name: 'リバーシ石', color: '#111111', color2: '#f5f5f5', twoSided: true, w: 48, h: 48 }),
        ],
      },
      {
        key: 'go-black',
        label: '碁石（黒）',
        icon: '⚫',
        hint: '囲碁・五目並べ',
        create: (x, y) => [piece('stone', x, y, { name: '黒石', color: '#111111', w: 26, h: 26, group: '黒' })],
      },
      {
        key: 'go-white',
        label: '碁石（白）',
        icon: '⚪',
        hint: '囲碁・五目並べ',
        create: (x, y) => [piece('stone', x, y, { name: '白石', color: '#f5f5f5', w: 26, h: 26, group: '白' })],
      },
      { key: 'cube', label: 'キューブ', icon: '🟥', hint: '資源・マーカー', create: (x, y) => [piece('cube', x, y, { name: 'キューブ', w: 28, h: 28 })] },
      {
        key: 'chess',
        label: 'チェス駒',
        icon: '♛',
        hint: '記号で表す駒（文字を変えて種類を変更）',
        create: (x, y) => [piece('glyph', x, y, { name: 'クイーン', text: '♛', color: '#ffffff', textColor: '#111111', w: 54, h: 54 })],
      },
      {
        key: 'shogi',
        label: '将棋駒',
        icon: '☗',
        hint: '裏返すと成り駒（裏面テキスト）',
        create: (x, y) => [
          piece('shogi', x, y, {
            name: '歩兵',
            text: '歩',
            backText: 'と',
            twoSided: true,
            color: '#f3d58a',
            color2: '#f3d58a',
            textColor: '#111111',
            w: 44,
            h: 50,
          }),
        ],
      },
      { key: 'car', label: '車', icon: '🚗', hint: '乗り物の駒', create: (x, y) => [piece('car', x, y, { name: '車', w: 56, h: 32 })] },
      { key: 'house', label: '家', icon: '🏠', hint: '建物の駒', create: (x, y) => [piece('house', x, y, { name: '家', color: '#2ecc71' })] },
      {
        key: 'shape',
        label: '図形駒',
        icon: '🔷',
        hint: '三角・星・六角など（形は変更可）',
        create: (x, y) => [piece('hexagon', x, y, { name: '図形駒', color: '#3498db' })],
      },
    ],
  },
  {
    label: 'タイル・トークン',
    presets: [
      {
        key: 'tile-square',
        label: '正方形タイル',
        icon: '🟨',
        hint: '裏返せるタイル（カルカソンヌ等）',
        create: (x, y) => [
          makeEntity('tile', { name: 'タイル', shape: 'square', text: 'A', x, y, w: 80, h: 80, color: '#f5deb3', color2: '#6b4f2a' }),
        ],
      },
      {
        key: 'tile-hex',
        label: '六角タイル',
        icon: '⬢',
        hint: '六角形のタイル',
        create: (x, y) => [
          makeEntity('tile', { name: '六角タイル', shape: 'hexagon', text: '森', x, y, w: 80, h: 80, color: '#27ae60', color2: '#6b4f2a' }),
        ],
      },
      {
        key: 'coin',
        label: 'コイン',
        icon: '🪙',
        hint: 'お金・得点用トークン',
        create: (x, y) => [
          makeEntity('token', { name: 'コイン', shape: 'circle', text: '1', x, y, w: 40, h: 40, color: '#f1c40f', textColor: '#7a5c00' }),
        ],
      },
      {
        key: 'chip',
        label: 'チップ',
        icon: '🔴',
        hint: 'ポーカーチップ等',
        create: (x, y) => [
          makeEntity('token', { name: 'チップ', shape: 'disc', text: '10', x, y, w: 44, h: 44, color: '#2980b9', color2: '#ffffff', textColor: '#ffffff' }),
        ],
      },
      {
        key: 'marker',
        label: 'マーカー',
        icon: '📍',
        hint: 'スコアトラック用などの小さい目印',
        create: (x, y) => [makeEntity('token', { name: 'マーカー', shape: 'diamond', x, y, w: 28, h: 28, color: '#e67e22' })],
      },
    ],
  },
  {
    label: 'ランダマイザー',
    presets: [
      { key: 'd6', label: '6面ダイス', icon: '🎲', hint: 'ダブルクリックで振る', create: (x, y) => [dice(6, x, y)] },
      { key: 'd4', label: '4面ダイス', icon: '🔺', hint: 'D4', create: (x, y) => [dice(4, x, y)] },
      { key: 'd8', label: '8面ダイス', icon: '🔷', hint: 'D8', create: (x, y) => [dice(8, x, y)] },
      { key: 'd10', label: '10面ダイス', icon: '🔟', hint: 'D10', create: (x, y) => [dice(10, x, y)] },
      { key: 'd12', label: '12面ダイス', icon: '⬟', hint: 'D12', create: (x, y) => [dice(12, x, y)] },
      { key: 'd20', label: '20面ダイス', icon: '💠', hint: 'D20', create: (x, y) => [dice(20, x, y)] },
      {
        key: 'dcustom',
        label: 'カスタムダイス',
        icon: '✳️',
        hint: '各面の文字を自由に設定',
        create: (x, y) =>
          [dice(6, x, y, { name: 'カスタムダイス', faces: ['★', '★', '●', '●', '▲', '✖'], diceStyle: 'number', value: 0, color: '#ffe082' })],
      },
      {
        key: 'coinflip',
        label: 'コイントス',
        icon: '🪙',
        hint: '表／裏の2面',
        create: (x, y) =>
          [dice(2, x, y, { name: 'コイン', faces: ['表', '裏'], diceStyle: 'number', value: 0, shape: 'circle', color: '#f1c40f' })],
      },
      {
        key: 'spinner',
        label: 'ルーレット',
        icon: '🎡',
        hint: '区画を回して止める',
        create: (x, y) => [
          makeEntity('spinner', {
            name: 'ルーレット',
            x,
            y,
            w: 140,
            h: 140,
            faces: ['1', '2', '3', '4', '5', '6'],
            value: 0,
            color: '#ffffff',
            textColor: '#222222',
          }),
        ],
      },
      {
        key: 'bag',
        label: '袋',
        icon: '👝',
        hint: '中からランダムに取り出す',
        create: (x, y) => [makeEntity('bag', { name: '袋', x, y, w: 80, h: 90, color: '#8e5b3a', enterFace: 'keep', locked: true })],
      },
    ],
  },
  {
    label: '情報・操作',
    presets: [
      {
        key: 'counter',
        label: 'カウンター',
        icon: '🔢',
        hint: '数値を記録（HP・資源など）',
        create: (x, y) => [
          makeEntity('counter', { name: 'カウンター', x, y, w: 120, h: 80, count: 0, step: 1, color: '#ffffff', textColor: '#222222', locked: true }),
        ],
      },
      {
        key: 'timer',
        label: 'タイマー',
        icon: '⏳',
        hint: '砂時計・持ち時間',
        create: (x, y) => [
          makeEntity('timer', { name: 'タイマー', x, y, w: 120, h: 70, seconds: 60, color: '#222222', textColor: '#ffffff', locked: true }),
        ],
      },
      {
        key: 'text',
        label: 'テキスト',
        icon: '🔤',
        hint: '説明文・ラベル',
        create: (x, y) => [
          makeEntity('text', { name: 'テキスト', text: 'テキスト', x, y, w: 200, h: 40, color: 'transparent', textColor: '#ffffff', fontSize: 20, locked: true }),
        ],
      },
      {
        key: 'button',
        label: 'ボタン',
        icon: '🔘',
        hint: '押すとルールを発動（例：カードを配る）',
        create: (x, y) => [
          makeEntity('button', { name: 'ボタン', text: 'ボタン', x, y, w: 140, h: 44, color: '#f39c12', textColor: '#ffffff', locked: true }),
        ],
      },
      {
        key: 'zone-free',
        label: 'エリア（自由配置）',
        icon: '⬜',
        hint: '範囲を示す枠。中の駒を数えられる',
        create: (x, y) => [
          makeEntity('zone', { name: 'エリア', x, y, w: 240, h: 160, color: '#ffffff22', layout: 'free', locked: true, z: 0 }),
        ],
      },
    ],
  },
];

export const PIECE_SHAPES: { value: PieceShape; label: string }[] = [
  { value: 'meeple', label: 'ミープル' },
  { value: 'pawn', label: 'ポーン' },
  { value: 'disc', label: '円盤' },
  { value: 'stone', label: '石' },
  { value: 'cube', label: 'キューブ' },
  { value: 'square', label: '四角' },
  { value: 'circle', label: '円' },
  { value: 'hexagon', label: '六角形' },
  { value: 'triangle', label: '三角形' },
  { value: 'diamond', label: 'ひし形' },
  { value: 'star', label: '星' },
  { value: 'heart', label: 'ハート' },
  { value: 'shogi', label: '将棋駒' },
  { value: 'glyph', label: '文字・記号' },
  { value: 'car', label: '車' },
  { value: 'house', label: '家' },
];

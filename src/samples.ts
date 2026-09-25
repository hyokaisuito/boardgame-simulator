import { buildDeck, numberCardSpecs, playingCardSpecs } from './catalog';
import { defaultGrid, makeEntity, newGame, newRule, uid } from './model';
import type { Entity, GameDefinition, Operand, Rule } from './types';

const n = (value: number): Operand => ({ kind: 'number', value });

function add(g: GameDefinition, ...list: Entity[]) {
  for (const e of list) g.entities[e.id] = e;
}

function rule(partial: Partial<Rule>): Rule {
  return { ...newRule(), ...partial };
}

// ------------------------------------------------------------
// すごろく
// ------------------------------------------------------------
function sugoroku(): GameDefinition {
  const g = newGame('すごろく');
  g.description =
    'サイコロを振ると自分の駒が自動で進みます。止まったマスの指示に従い、最初にゴールした人の勝ち！\n（ルールタブで「ダイス→駒を進める」「マスの効果」などの仕組みを確認できます）';
  g.players = { ...g.players, min: 2, max: 4, defaultCount: 2 };
  g.table = { ...g.table, width: 1200, height: 760, color: '#3d6b4f' };
  const labels = Array(30).fill('');
  labels[0] = 'スタート';
  labels[5] = '3マス進む';
  labels[12] = '2マス戻る';
  labels[16] = 'もう一回';
  labels[22] = 'スタートへ';
  labels[29] = 'ゴール';
  const colors = Array(30).fill('');
  colors[5] = '#b8f5b0';
  colors[12] = '#ffc9c9';
  colors[16] = '#c9e4ff';
  colors[22] = '#ffb3b3';
  colors[29] = '#ffd966';
  const board = makeEntity('board', {
    name: 'すごろく盤',
    x: 80,
    y: 120,
    w: 720,
    h: 500,
    z: 0,
    color: '#fff8e1',
    color2: '#ffecb3',
    locked: true,
    grid: defaultGrid({ kind: 'track', trackShape: 'snake', cols: 6, rows: 5, trackLength: 30, checker: true, showIndex: true, labels, cellColors: colors, lineColor: '#6d4c41' }),
  });
  add(g, board);
  const pawns: Entity[] = [];
  for (let i = 0; i < 4; i++) {
    const p = makeEntity('piece', {
      name: `${i + 1}Pの駒`,
      shape: 'pawn',
      owner: i,
      color: g.players.colors[i],
      w: 34,
      h: 40,
      x: board.x + 60 - 17 + (i % 2) * 26 - 13,
      y: board.y + 450 - 20 + Math.floor(i / 2) * 26 - 13,
      z: 10 + i,
    });
    pawns.push(p);
    add(g, p);
  }
  const dice = makeEntity('dice', {
    name: 'サイコロ',
    x: 900,
    y: 300,
    w: 90,
    h: 90,
    faces: ['1', '2', '3', '4', '5', '6'],
    value: 0,
    diceStyle: 'pips',
    color: '#ffffff',
    textColor: '#222222',
    locked: true,
    z: 20,
  });
  const title = makeEntity('text', { name: 'タイトル', text: '🎲 すごろく', x: 80, y: 40, w: 400, h: 60, color: 'transparent', textColor: '#ffffff', fontSize: 36, locked: true });
  const hint = makeEntity('text', {
    name: '説明',
    text: 'サイコロをダブルクリックして振ろう',
    x: 850,
    y: 410,
    w: 300,
    h: 40,
    color: 'transparent',
    textColor: '#ffffffcc',
    fontSize: 16,
    locked: true,
  });
  add(g, dice, title, hint);

  g.rules = [
    rule({
      name: '使わない駒を片付ける（3人未満）',
      trigger: { type: 'gameStart' },
      conditions: [{ left: { kind: 'playerCount' }, op: '<', right: n(3) }],
      actions: [{ type: 'move', what: { kind: 'entity', entityId: pawns[2].id }, to: { kind: 'removed' } }],
    }),
    rule({
      name: '使わない駒を片付ける（4人未満）',
      trigger: { type: 'gameStart' },
      conditions: [{ left: { kind: 'playerCount' }, op: '<', right: n(4) }],
      actions: [{ type: 'move', what: { kind: 'entity', entityId: pawns[3].id }, to: { kind: 'removed' } }],
    }),
    rule({
      name: 'サイコロの目だけ進んで次の人へ',
      trigger: { type: 'diceRolled', entityId: dice.id },
      actions: [
        { type: 'advance', what: { kind: 'playerPiece', boardId: board.id, player: 'current' }, boardId: board.id, steps: { kind: 'eventValue' }, wrap: false },
        { type: 'nextTurn' },
      ],
    }),
    rule({
      name: 'マス6：3マス進む',
      trigger: { type: 'entityEntered', entityId: board.id },
      conditions: [{ left: { kind: 'eventValue' }, op: '==', right: n(6) }],
      actions: [
        { type: 'message', text: '{eventPlayer}：3マス進む！' },
        { type: 'advance', what: { kind: 'event' }, boardId: board.id, steps: n(3), wrap: false },
      ],
    }),
    rule({
      name: 'マス13：2マス戻る',
      trigger: { type: 'entityEntered', entityId: board.id },
      conditions: [{ left: { kind: 'eventValue' }, op: '==', right: n(13) }],
      actions: [
        { type: 'message', text: '{eventPlayer}：2マス戻る…' },
        { type: 'advance', what: { kind: 'event' }, boardId: board.id, steps: n(-2), wrap: false },
      ],
    }),
    rule({
      name: 'マス17：もう一回',
      trigger: { type: 'entityEntered', entityId: board.id },
      conditions: [{ left: { kind: 'eventValue' }, op: '==', right: n(17) }],
      actions: [
        { type: 'message', text: '{eventPlayer}：もう一回振れる！' },
        { type: 'extraTurn' },
      ],
    }),
    rule({
      name: 'マス23：スタートへ戻る',
      trigger: { type: 'entityEntered', entityId: board.id },
      conditions: [{ left: { kind: 'eventValue' }, op: '==', right: n(23) }],
      actions: [
        { type: 'message', text: '{eventPlayer}：スタートに戻る！' },
        { type: 'move', what: { kind: 'event' }, to: { kind: 'cell', boardId: board.id, cell: n(1) } },
      ],
    }),
    rule({
      name: 'ゴール',
      trigger: { type: 'entityEntered', entityId: board.id },
      conditions: [{ left: { kind: 'eventValue' }, op: '==', right: n(30) }],
      actions: [{ type: 'winner', who: 'event' }],
    }),
  ];
  g.playerVars = [];
  return g;
}

// ------------------------------------------------------------
// トランプ
// ------------------------------------------------------------
function cards(): GameDefinition {
  const g = newGame('トランプ（フリー）');
  g.description = 'トランプ54枚で自由に遊べるテーブル。開始時にシャッフルして5枚ずつ配ります。「1枚引く」ボタンで山札から引けます。';
  g.players = { ...g.players, min: 2, max: 6, defaultCount: 3 };
  g.table = { ...g.table, width: 1200, height: 700, color: '#1e5631' };
  const deck = makeEntity('deck', {
    name: '山札',
    x: 360,
    y: 260,
    w: 90,
    h: 130,
    cardW: 90,
    cardH: 130,
    color2: '#b03a2e',
    backText: '♦',
    enterFace: 'down',
    layout: 'stack',
    locked: true,
    z: 5,
  });
  const discard = makeEntity('zone', { name: '捨て札', x: 500, y: 250, w: 110, h: 150, color: '#ffffff22', layout: 'stack', enterFace: 'up', locked: true, z: 0 });
  const field = makeEntity('zone', { name: '場', x: 300, y: 450, w: 600, h: 160, color: '#ffffff18', layout: 'row', enterFace: 'up', locked: true, z: 0 });
  const btn = makeEntity('button', { name: '引くボタン', text: '1枚引く', x: 680, y: 300, w: 140, h: 48, color: '#f39c12', textColor: '#ffffff', locked: true, z: 6 });
  const reset = makeEntity('button', { name: '回収ボタン', text: '全部回収', x: 680, y: 360, w: 140, h: 40, color: '#7f8c8d', textColor: '#ffffff', locked: true, z: 6 });
  add(g, ...buildDeck(deck, playingCardSpecs(2)), discard, field, btn, reset);
  g.rules = [
    rule({
      name: 'シャッフルして5枚ずつ配る',
      trigger: { type: 'gameStart' },
      actions: [
        { type: 'shuffle', entityId: deck.id },
        { type: 'draw', deckId: deck.id, count: n(5), to: 'all' },
      ],
    }),
    rule({
      name: 'ボタンで1枚引く',
      trigger: { type: 'buttonPressed', entityId: btn.id },
      actions: [{ type: 'draw', deckId: deck.id, count: n(1), to: 'current' }],
    }),
    rule({
      name: '全カード回収',
      trigger: { type: 'buttonPressed', entityId: reset.id },
      actions: [
        { type: 'gather', from: '__all__', to: deck.id, shuffle: true },
        { type: 'message', text: 'カードを回収してシャッフルしました' },
      ],
    }),
  ];
  g.playerVars = [{ id: 'score', name: '得点', initial: 0 }];
  return g;
}

// ------------------------------------------------------------
// ナンバーレース（ルールのデモ）
// ------------------------------------------------------------
function numberRace(): GameDefinition {
  const g = newGame('ナンバーレース');
  g.description =
    '手番の最初に1枚引きます。手札から1枚を「場」に出すと、その数字が得点になります。先に30点に達した人の勝ち。山札が尽きたら得点が一番高い人の勝ち。';
  g.players = { ...g.players, min: 2, max: 4, defaultCount: 2 };
  g.table = { ...g.table, width: 1100, height: 640, color: '#2c3e50' };
  const deck = makeEntity('deck', {
    name: '山札',
    x: 220,
    y: 220,
    w: 90,
    h: 130,
    cardW: 90,
    cardH: 130,
    color2: '#34495e',
    backText: '?',
    enterFace: 'down',
    layout: 'stack',
    locked: true,
    z: 5,
  });
  const field = makeEntity('zone', { name: '場', x: 380, y: 200, w: 520, h: 170, color: '#ffffff18', layout: 'row', enterFace: 'up', locked: true, z: 0 });
  const title = makeEntity('text', {
    name: '説明',
    text: '手札のカードを「場」にドラッグして得点！ 30点で勝利',
    x: 220,
    y: 110,
    w: 680,
    h: 40,
    color: 'transparent',
    textColor: '#ecf0f1',
    fontSize: 20,
    locked: true,
  });
  add(g, ...buildDeck(deck, numberCardSpecs(1, 10, ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'])), field, title);
  g.playerVars = [{ id: 'score', name: '得点', initial: 0 }];
  g.rules = [
    rule({
      name: '準備：シャッフルして3枚ずつ',
      trigger: { type: 'gameStart' },
      actions: [
        { type: 'shuffle', entityId: deck.id },
        { type: 'draw', deckId: deck.id, count: n(3), to: 'all' },
      ],
    }),
    rule({
      name: '手番の最初に1枚引く',
      trigger: { type: 'turnStart' },
      conditions: [{ left: { kind: 'turn' }, op: '>', right: n(1) }],
      actions: [{ type: 'draw', deckId: deck.id, count: n(1), to: 'current' }],
    }),
    rule({
      name: '場に出したら数字が得点',
      trigger: { type: 'entityEntered', entityId: field.id },
      actions: [
        { type: 'setVar', scope: 'player', varId: 'score', player: 'current', op: 'add', value: { kind: 'eventProp', prop: 'number' } },
        { type: 'message', text: '{player}が{text}を出した！' },
        { type: 'nextTurn' },
      ],
    }),
    rule({
      name: '30点で勝利',
      once: true,
      trigger: { type: 'variableChanged', varId: 'score' },
      conditions: [{ left: { kind: 'eventValue' }, op: '>=', right: n(30) }],
      actions: [{ type: 'winner', who: 'event' }],
    }),
    rule({
      name: '山札切れで終了',
      once: true,
      trigger: { type: 'stateCheck' },
      conditions: [{ left: { kind: 'count', containerId: deck.id }, op: '==', right: n(0) }],
      actions: [{ type: 'winner', who: 'highest', varId: 'score' }],
    }),
  ];
  return g;
}

// ------------------------------------------------------------
// チェス
// ------------------------------------------------------------
function chess(): GameDefinition {
  const g = newGame('チェス');
  g.description = '駒をドラッグして動かします（ルールの自動判定はなし）。取った駒は盤の外に置きましょう。';
  g.players = { ...g.players, min: 2, max: 2, defaultCount: 2, names: ['白', '黒', ...g.players.names.slice(2)], colors: ['#f5f5f5', '#222222', ...g.players.colors.slice(2)], hideOnSwitch: false };
  g.table = { ...g.table, width: 1100, height: 760, color: '#4a3526' };
  g.playerVars = [];
  const S = 70;
  const board = makeEntity('board', {
    name: 'チェス盤',
    x: 270,
    y: 100,
    w: S * 8,
    h: S * 8,
    z: 0,
    color: '#f0d9b5',
    color2: '#b58863',
    locked: true,
    grid: defaultGrid({ kind: 'square', cols: 8, rows: 8, checker: true, lineColor: '#7a5230' }),
  });
  add(g, board);
  const back = ['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜'];
  const names: Record<string, string> = { '♜': 'ルーク', '♞': 'ナイト', '♝': 'ビショップ', '♛': 'クイーン', '♚': 'キング', '♟': 'ポーン' };
  const place = (glyph: string, col: number, row: number, white: boolean) =>
    add(
      g,
      makeEntity('piece', {
        name: `${white ? '白' : '黒'}${names[glyph]}`,
        shape: 'glyph',
        text: glyph,
        color: white ? '#ffffff' : '#1a1a1a',
        textColor: white ? '#1a1a1a' : '#bbbbbb',
        owner: white ? 0 : 1,
        group: white ? '白' : '黒',
        w: 60,
        h: 60,
        x: board.x + col * S + (S - 60) / 2,
        y: board.y + row * S + (S - 60) / 2,
        z: 10 + row * 8 + col,
      }),
    );
  back.forEach((p, c) => {
    place(p, c, 0, false);
    place('♟', c, 1, false);
    place('♟', c, 6, true);
    place(p, c, 7, true);
  });
  return g;
}

// ------------------------------------------------------------
// リバーシ
// ------------------------------------------------------------
function reversi(): GameDefinition {
  const g = newGame('リバーシ');
  g.description = '袋をダブルクリックして石を取り出し、盤に置きます。石はダブルクリックで裏返せます。';
  g.players = { ...g.players, min: 2, max: 2, defaultCount: 2, names: ['黒', '白', ...g.players.names.slice(2)], colors: ['#111111', '#f5f5f5', ...g.players.colors.slice(2)], hideOnSwitch: false };
  g.table = { ...g.table, width: 1000, height: 700, color: '#5d4037' };
  g.playerVars = [];
  const S = 64;
  const board = makeEntity('board', {
    name: 'リバーシ盤',
    x: 200,
    y: 80,
    w: S * 8,
    h: S * 8,
    z: 0,
    color: '#2e8b57',
    color2: '#2e8b57',
    locked: true,
    grid: defaultGrid({ kind: 'square', cols: 8, rows: 8, lineColor: '#0b3d20' }),
  });
  const bag = makeEntity('bag', { name: '石袋', x: 780, y: 280, w: 90, h: 100, color: '#6d4c41', enterFace: 'keep', locked: true, z: 5, children: [] });
  add(g, board, bag);
  const stone = (partial: Partial<Entity>) =>
    makeEntity('piece', { name: '石', shape: 'stone', color: '#111111', color2: '#f5f5f5', twoSided: true, w: 54, h: 54, ...partial });
  for (let i = 0; i < 60; i++) {
    const s = stone({ parentId: bag.id, id: uid('e_') });
    bag.children!.push(s.id);
    add(g, s);
  }
  const init: [number, number, boolean][] = [
    [3, 3, false],
    [4, 4, false],
    [3, 4, true],
    [4, 3, true],
  ];
  init.forEach(([c, r, black], i) =>
    add(g, stone({ faceUp: black, x: board.x + c * S + 5, y: board.y + r * S + 5, z: 10 + i })),
  );
  return g;
}

// ------------------------------------------------------------
// 囲碁（五目並べ）
// ------------------------------------------------------------
function gomoku(): GameDefinition {
  const g = newGame('五目並べ');
  g.description = '碁笥（袋）から石を取り出して交点に置きます。先に5つ並べた人の勝ち（判定は目視）。';
  g.players = { ...g.players, min: 2, max: 2, defaultCount: 2, names: ['黒', '白', ...g.players.names.slice(2)], colors: ['#111111', '#f5f5f5', ...g.players.colors.slice(2)], hideOnSwitch: false };
  g.table = { ...g.table, width: 1100, height: 760, color: '#3e2723' };
  g.playerVars = [];
  const board = makeEntity('board', {
    name: '碁盤',
    x: 240,
    y: 60,
    w: 620,
    h: 620,
    z: 0,
    color: '#dcb35c',
    locked: true,
    grid: defaultGrid({ kind: 'intersection', cols: 15, rows: 15, margin: 28, lineColor: '#3b2a10' }),
  });
  const blackBag = makeEntity('bag', { name: '黒の碁笥', x: 80, y: 300, w: 100, h: 100, color: '#222222', locked: true, children: [] });
  const whiteBag = makeEntity('bag', { name: '白の碁笥', x: 920, y: 300, w: 100, h: 100, color: '#eeeeee', locked: true, children: [] });
  add(g, board, blackBag, whiteBag);
  for (let i = 0; i < 60; i++) {
    const b = makeEntity('piece', { name: '黒石', shape: 'stone', color: '#111111', w: 36, h: 36, parentId: blackBag.id, group: '黒' });
    const w = makeEntity('piece', { name: '白石', shape: 'stone', color: '#f5f5f5', w: 36, h: 36, parentId: whiteBag.id, group: '白' });
    blackBag.children!.push(b.id);
    whiteBag.children!.push(w.id);
    add(g, b, w);
  }
  return g;
}

export interface Sample {
  key: string;
  name: string;
  icon: string;
  desc: string;
  make: () => GameDefinition;
}

export const SAMPLES: Sample[] = [
  { key: 'sugoroku', name: 'すごろく', icon: '🎲', desc: 'ダイス・トラック・マス効果のルール例', make: sugoroku },
  { key: 'race', name: 'ナンバーレース', icon: '🔢', desc: 'カード・得点・勝利条件のルール例', make: numberRace },
  { key: 'cards', name: 'トランプ（フリー）', icon: '🃏', desc: '54枚の山札・捨て札・ボタン', make: cards },
  { key: 'chess', name: 'チェス', icon: '♞', desc: '8×8マスと記号の駒', make: chess },
  { key: 'reversi', name: 'リバーシ', icon: '⚫', desc: '両面の石と袋', make: reversi },
  { key: 'gomoku', name: '五目並べ', icon: '⚪', desc: '交点ボードと碁笥', make: gomoku },
];

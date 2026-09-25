import type { Action, ActionType, CompareOp, EntityType, MathOp, Operand, OperandKind, TriggerType } from './types';

export interface TriggerMeta {
  label: string;
  help: string;
  /** 対象を選ぶエンティティの種類（なければ対象指定なし） */
  entityTypes?: EntityType[];
  entityLabel?: string;
  /** イベント値の意味 */
  valueMeaning?: string;
}

export const TRIGGERS: Record<TriggerType, TriggerMeta> = {
  gameStart: { label: 'ゲーム開始時', help: 'テストプレイ開始直後に1回だけ。初期配布などに。' },
  turnStart: { label: '手番の開始時', help: '各プレイヤーの手番が始まるたび。' },
  turnEnd: { label: '手番の終了時', help: '手番が終わるたび（次の人に移る前）。' },
  phaseStart: { label: 'フェーズ開始時', help: '指定したフェーズになったとき。' },
  buttonPressed: {
    label: 'ボタンが押された',
    help: 'テーブル上のボタンを押したとき。',
    entityTypes: ['button'],
    entityLabel: 'ボタン',
  },
  diceRolled: {
    label: 'ダイス／ルーレットを振った',
    help: '出目は「イベントの値」で参照できます。',
    entityTypes: ['dice', 'spinner'],
    entityLabel: 'ダイス',
    valueMeaning: '出目',
  },
  cardDrawn: {
    label: 'カードを引いた／取り出した',
    help: '山札・袋から何かが出たとき（1枚ごと）。',
    entityTypes: ['deck', 'bag'],
    entityLabel: '引いた元',
  },
  entityEntered: {
    label: '置かれた・入った',
    help: 'ボード・エリア・山札・手札に何かが置かれたとき。ボードの場合「イベントの値」はマス番号（1始まり）。',
    entityTypes: ['board', 'zone', 'deck', 'bag'],
    entityLabel: '置き場',
    valueMeaning: 'マス番号',
  },
  entityFlipped: {
    label: '裏返した',
    help: 'カード・タイル・両面駒を裏返したとき（値：表=1／裏=0）。',
    entityTypes: ['card', 'tile', 'piece', 'token'],
    entityLabel: '対象',
  },
  counterChanged: {
    label: 'カウンターが変化した',
    help: '変化後の値が「イベントの値」。',
    entityTypes: ['counter'],
    entityLabel: 'カウンター',
    valueMeaning: '新しい値',
  },
  variableChanged: { label: '変数が変化した', help: '変化後の値が「イベントの値」。', valueMeaning: '新しい値' },
  timerEnded: { label: 'タイマーが0になった', help: '時間切れのとき。', entityTypes: ['timer'], entityLabel: 'タイマー' },
  stateCheck: {
    label: '常時チェック',
    help: '何か操作するたびに条件を確認します。勝利条件などに（「1回だけ」推奨）。',
  },
};

export const OPERANDS: Record<OperandKind, string> = {
  number: '数値',
  text: '文字',
  eventValue: 'イベントの値（出目・マス番号等）',
  eventText: 'イベントの文字（出目の文字・名前）',
  eventProp: 'イベント対象のプロパティ',
  playerVar: 'プレイヤー変数',
  globalVar: '共通変数',
  entityValue: 'コンポーネントの値（出目・カウンター等）',
  count: '置き場の中の数',
  handCount: '手札の枚数',
  turn: 'ターン数（通算）',
  round: 'ラウンド数',
  currentPlayer: '手番プレイヤーの番号',
  playerCount: 'プレイヤー人数',
  random: 'ランダムな数',
};

export function defaultOperand(kind: OperandKind): Operand {
  switch (kind) {
    case 'number':
      return { kind, value: 0 };
    case 'text':
      return { kind, value: '' };
    case 'globalVar':
      return { kind, varId: '' };
    case 'playerVar':
      return { kind, varId: '', player: 'current' };
    case 'eventProp':
      return { kind, prop: 'name' };
    case 'entityValue':
      return { kind, entityId: '' };
    case 'count':
      return { kind, containerId: '' };
    case 'handCount':
      return { kind, player: 'current' };
    case 'random':
      return { kind, min: 1, max: 6 };
    default:
      return { kind } as Operand;
  }
}

export const COMPARE_OPS: { value: CompareOp; label: string }[] = [
  { value: '==', label: '＝ 等しい' },
  { value: '!=', label: '≠ 等しくない' },
  { value: '>', label: '＞ より大きい' },
  { value: '>=', label: '≧ 以上' },
  { value: '<', label: '＜ より小さい' },
  { value: '<=', label: '≦ 以下' },
  { value: 'contains', label: '∋ を含む（文字）' },
];

export const MATH_OPS: { value: MathOp; label: string }[] = [
  { value: 'add', label: '増やす（＋）' },
  { value: 'sub', label: '減らす（−）' },
  { value: 'set', label: 'にする（＝）' },
  { value: 'mul', label: '倍にする（×）' },
];

export interface ActionMeta {
  label: string;
  category: string;
  create: () => Action;
}

const num = (value: number): Operand => ({ kind: 'number', value });

export const ACTIONS: Record<ActionType, ActionMeta> = {
  draw: { label: '山札からカードを引く／配る', category: 'カード', create: () => ({ type: 'draw', deckId: '', count: num(1), to: 'current' }) },
  reveal: { label: '山札の一番上をめくる', category: 'カード', create: () => ({ type: 'reveal', deckId: '', to: '' }) },
  shuffle: { label: 'シャッフルする', category: 'カード', create: () => ({ type: 'shuffle', entityId: '' }) },
  gather: {
    label: 'カードを集めて戻す',
    category: 'カード',
    create: () => ({ type: 'gather', from: '__all__', to: '', shuffle: true }),
  },
  move: {
    label: '移動する',
    category: '移動',
    create: () => ({ type: 'move', what: { kind: 'event' }, to: { kind: 'hand', player: 'current' } }),
  },
  advance: {
    label: 'トラック上を進める／戻す',
    category: '移動',
    create: () => ({
      type: 'advance',
      what: { kind: 'playerPiece', boardId: '', player: 'current' },
      boardId: '',
      steps: { kind: 'eventValue' },
      wrap: false,
    }),
  },
  flip: { label: '裏返す', category: '移動', create: () => ({ type: 'flip', what: { kind: 'event' }, face: 'toggle' }) },
  setOwner: {
    label: '所有者を変える',
    category: '移動',
    create: () => ({ type: 'setOwner', what: { kind: 'event' }, player: 'current' }),
  },
  roll: { label: 'ダイスを振る', category: 'ランダム', create: () => ({ type: 'roll', entityId: '' }) },
  setVar: {
    label: '変数を変える（得点など）',
    category: '数値',
    create: () => ({ type: 'setVar', scope: 'player', varId: '', player: 'current', op: 'add', value: num(1) }),
  },
  setCounter: {
    label: 'カウンターを変える',
    category: '数値',
    create: () => ({ type: 'setCounter', entityId: '', op: 'add', value: num(1) }),
  },
  nextTurn: { label: '次の手番へ', category: '手番', create: () => ({ type: 'nextTurn' }) },
  extraTurn: { label: 'もう一度同じ人の手番', category: '手番', create: () => ({ type: 'extraTurn' }) },
  setPlayer: { label: '手番プレイヤーを指定', category: '手番', create: () => ({ type: 'setPlayer', player: num(1) }) },
  reverseOrder: { label: '手番の順番を逆にする', category: '手番', create: () => ({ type: 'reverseOrder' }) },
  setPhase: { label: 'フェーズを変える', category: '手番', create: () => ({ type: 'setPhase', phase: '' }) },
  startTimer: { label: 'タイマーを開始', category: 'その他', create: () => ({ type: 'startTimer', entityId: '' }) },
  message: { label: 'メッセージを表示', category: 'その他', create: () => ({ type: 'message', text: '{player}の番です' }) },
  winner: { label: '勝者を決める', category: '勝敗', create: () => ({ type: 'winner', who: 'current' }) },
  endGame: { label: 'ゲームを終了する', category: '勝敗', create: () => ({ type: 'endGame', text: '引き分け' }) },
};

export const PLAYER_REF_OPTIONS: { value: string; label: string }[] = [
  { value: 'current', label: '手番プレイヤー' },
  { value: 'event', label: 'イベントのプレイヤー' },
  { value: 'next', label: '次のプレイヤー' },
  { value: 'previous', label: '前のプレイヤー' },
  ...Array.from({ length: 8 }, (_, i) => ({ value: String(i), label: `プレイヤー${i + 1}` })),
];

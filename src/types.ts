// ============================================================
// ゲーム定義（エディタで作るもの）と、プレイ中の状態の型定義
// ============================================================

export type EntityType =
  | 'board'
  | 'zone'
  | 'deck'
  | 'card'
  | 'piece'
  | 'tile'
  | 'token'
  | 'dice'
  | 'spinner'
  | 'bag'
  | 'counter'
  | 'timer'
  | 'text'
  | 'button'
  | 'hand';

export type PieceShape =
  | 'meeple'
  | 'pawn'
  | 'disc'
  | 'stone'
  | 'cube'
  | 'square'
  | 'circle'
  | 'hexagon'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'heart'
  | 'shogi'
  | 'glyph'
  | 'car'
  | 'house';

export type GridKind = 'none' | 'square' | 'hex' | 'intersection' | 'track';

export interface GridDef {
  kind: GridKind;
  cols: number;
  rows: number;
  /** 盤端の余白（px, 交点グリッド等） */
  margin: number;
  /** トラック（すごろく）の形状 */
  trackShape?: 'loop' | 'snake';
  /** トラックのマス数（snakeの場合のみ使用。未指定なら cols*rows） */
  trackLength?: number;
  /** 市松模様 */
  checker?: boolean;
  lineColor: string;
  /** マスごとのラベル（インデックス順） */
  labels?: string[];
  /** マスごとの色（インデックス順、空なら既定色） */
  cellColors?: string[];
  showIndex?: boolean;
  /** 駒をマスにスナップするか */
  snap: boolean;
}

/** コンテナへ入ったときの表裏 */
export type EnterFace = 'keep' | 'up' | 'down';

export type ZoneLayout = 'free' | 'stack' | 'row' | 'grid';

export type PropValue = number | string;

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
  /** 親コンテナ（山札・エリア・袋・手札）。null ならテーブル上 */
  parentId: string | null;
  /** 所有プレイヤー（0始まり）。null は共有 */
  owner: number | null;
  /** テストプレイ中に動かせない */
  locked: boolean;
  /** 表向きか */
  faceUp: boolean;

  color: string;
  /** 裏面・第2色 */
  color2: string;
  textColor: string;
  /** 表面テキスト */
  text: string;
  /** 裏面テキスト */
  backText: string;
  /** 表面画像（URL / data URL） */
  image: string;
  /** 裏面画像 */
  backImage: string;
  /** 分類タグ（ルールの絞り込みに使用） */
  group: string;
  /** 自由プロパティ（ルールの条件で参照可能） */
  props: Record<string, PropValue>;

  // --- 駒・タイル・トークン ---
  shape?: PieceShape;
  /** 裏返せる（両面駒） */
  twoSided?: boolean;

  // --- ダイス・ルーレット ---
  faces?: string[];
  /** 現在の出目のインデックス */
  value?: number;
  diceStyle?: 'pips' | 'number';
  sides?: number;

  // --- カウンター ---
  count?: number;
  min?: number;
  max?: number;
  step?: number;

  // --- コンテナ（山札・エリア・袋・手札） ---
  children?: string[];
  layout?: ZoneLayout;
  enterFace?: EnterFace;
  /** 中身を持ち主以外に見せない */
  privateToOwner?: boolean;

  // --- ボード ---
  grid?: GridDef;

  // --- タイマー ---
  seconds?: number;
  /** 実行中なら終了予定時刻（ms, プレイ中のみ） */
  runningUntil?: number | null;
  remaining?: number;

  // --- カード（山札内のカードサイズの基準） ---
  cardW?: number;
  cardH?: number;

  fontSize?: number;
}

// ------------------------------------------------------------
// 変数・プレイヤー
// ------------------------------------------------------------

export interface VariableDef {
  id: string;
  name: string;
  initial: number;
}

export interface PlayerSettings {
  min: number;
  max: number;
  defaultCount: number;
  names: string[];
  colors: string[];
  /** 交代時に画面を隠す（手札を見せない） */
  hideOnSwitch: boolean;
}

// ------------------------------------------------------------
// ルール（イベント → 条件 → アクション）
// ------------------------------------------------------------

export type TriggerType =
  | 'gameStart'
  | 'turnStart'
  | 'turnEnd'
  | 'phaseStart'
  | 'buttonPressed'
  | 'diceRolled'
  | 'cardDrawn'
  | 'entityEntered'
  | 'entityFlipped'
  | 'counterChanged'
  | 'variableChanged'
  | 'timerEnded'
  | 'stateCheck';

export interface Trigger {
  type: TriggerType;
  /** 対象エンティティ（'' = どれでも） */
  entityId?: string;
  /** 対象グループ（entityEntered で入ってきたもの） */
  group?: string;
  phase?: string;
  varId?: string;
}

/** 値の取り出し元 */
export type Operand =
  | { kind: 'number'; value: number }
  | { kind: 'text'; value: string }
  | { kind: 'globalVar'; varId: string }
  | { kind: 'playerVar'; varId: string; player: PlayerRef }
  | { kind: 'eventValue' }
  | { kind: 'eventText' }
  | { kind: 'eventProp'; prop: string }
  | { kind: 'entityValue'; entityId: string }
  | { kind: 'count'; containerId: string }
  | { kind: 'handCount'; player: PlayerRef }
  | { kind: 'turn' }
  | { kind: 'round' }
  | { kind: 'currentPlayer' }
  | { kind: 'playerCount' }
  | { kind: 'random'; min: number; max: number };

export type OperandKind = Operand['kind'];

/** プレイヤー指定。数値は0始まりのプレイヤー番号 */
export type PlayerRef = 'current' | 'event' | 'next' | 'previous' | number;

export type CompareOp = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains';

export interface Condition {
  left: Operand;
  op: CompareOp;
  right: Operand;
}

/** エンティティの指定 */
export type EntityRef =
  | { kind: 'entity'; entityId: string }
  | { kind: 'event' }
  | { kind: 'top'; containerId: string }
  | { kind: 'playerPiece'; boardId: string; player: PlayerRef };

/** 移動先の指定 */
export type Destination =
  | { kind: 'container'; containerId: string }
  | { kind: 'hand'; player: PlayerRef }
  | { kind: 'cell'; boardId: string; cell: Operand }
  | { kind: 'removed' };

export type MathOp = 'set' | 'add' | 'sub' | 'mul';

export type Action =
  | { type: 'setVar'; scope: 'global' | 'player'; varId: string; player: PlayerRef; op: MathOp; value: Operand }
  | { type: 'setCounter'; entityId: string; op: MathOp; value: Operand }
  | { type: 'roll'; entityId: string }
  | { type: 'shuffle'; entityId: string }
  | { type: 'draw'; deckId: string; count: Operand; to: 'current' | 'all' | 'event' }
  | { type: 'reveal'; deckId: string; to: string }
  | { type: 'move'; what: EntityRef; to: Destination }
  | { type: 'advance'; what: EntityRef; boardId: string; steps: Operand; wrap: boolean }
  | { type: 'flip'; what: EntityRef; face: 'toggle' | 'up' | 'down' }
  | { type: 'gather'; from: string; to: string; shuffle: boolean }
  | { type: 'setOwner'; what: EntityRef; player: PlayerRef | 'none' }
  | { type: 'nextTurn' }
  | { type: 'extraTurn' }
  | { type: 'setPlayer'; player: Operand }
  | { type: 'reverseOrder' }
  | { type: 'setPhase'; phase: string }
  | { type: 'startTimer'; entityId: string }
  | { type: 'message'; text: string }
  | { type: 'winner'; who: 'current' | 'event' | 'highest' | 'lowest'; varId?: string }
  | { type: 'endGame'; text: string };

export type ActionType = Action['type'];

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  /** 1ゲームで1回だけ発動 */
  once: boolean;
  trigger: Trigger;
  match: 'all' | 'any';
  conditions: Condition[];
  actions: Action[];
}

// ------------------------------------------------------------
// ゲーム定義
// ------------------------------------------------------------

export interface GameDefinition {
  id: string;
  version: 1;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  table: { width: number; height: number; color: string; image: string };
  players: PlayerSettings;
  phases: string[];
  playerVars: VariableDef[];
  globalVars: VariableDef[];
  entities: Record<string, Entity>;
  rules: Rule[];
}

// ------------------------------------------------------------
// プレイ中の状態
// ------------------------------------------------------------

export interface PlayerState {
  name: string;
  color: string;
  vars: Record<string, number>;
  handId: string;
}

export interface LogEntry {
  id: number;
  text: string;
  kind: 'info' | 'rule' | 'system' | 'win';
}

export interface PlayState {
  entities: Record<string, Entity>;
  players: PlayerState[];
  globals: Record<string, number>;
  current: number;
  direction: 1 | -1;
  turn: number;
  phase: string;
  log: LogEntry[];
  logSeq: number;
  winners: number[] | null;
  ended: boolean;
  endText: string;
  firedOnce: string[];
  /** 次の手番交代で同じプレイヤーを続ける */
  extraTurn: boolean;
  nextZ: number;
  /** 画面に出すトースト通知 */
  toasts: { id: number; text: string }[];
}

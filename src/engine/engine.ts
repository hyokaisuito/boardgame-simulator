import { canFlip, isContainer, isMovable, makeEntity } from '../model';
import type {
  Action,
  CompareOp,
  Condition,
  Destination,
  Entity,
  EntityRef,
  GameDefinition,
  LogEntry,
  MathOp,
  Operand,
  PlayerRef,
  PlayState,
  Rule,
  TriggerType,
} from '../types';
import { center, computeCells, containsPoint, nearestCell } from './geometry';

/** ゲーム外（取り除かれた物）置き場 */
export const BOX_ID = '__box__';

export interface GameEvent {
  type: TriggerType;
  /** 主役のエンティティ（振ったダイス・引いたカード・移動した駒など） */
  entityId?: string;
  /** 関係するコンテナ／ボード（入った先・引いた元） */
  containerId?: string;
  value?: number;
  text?: string;
  player?: number;
  phase?: string;
  varId?: string;
}

export type MoveTarget =
  | { kind: 'table'; x: number; y: number }
  | { kind: 'container'; id: string }
  | { kind: 'hand'; player: number }
  | { kind: 'cell'; boardId: string; index: number }
  | { kind: 'removed' };

const MAX_DEPTH = 24;
const MAX_STEPS = 3000;

export function handId(player: number): string {
  return `__hand_${player}`;
}

/** 数字として解釈できれば数値、そうでなければ文字列 */
function toComparable(v: number | string): number | string {
  if (typeof v === 'number') return v;
  const t = v.trim();
  if (t !== '' && !isNaN(Number(t))) return Number(t);
  return v;
}

export function compare(a: number | string, op: CompareOp, b: number | string): boolean {
  if (op === 'contains') return String(a).includes(String(b));
  const x = toComparable(a);
  const y = toComparable(b);
  if (typeof x === 'number' && typeof y === 'number') {
    switch (op) {
      case '==':
        return x === y;
      case '!=':
        return x !== y;
      case '>':
        return x > y;
      case '>=':
        return x >= y;
      case '<':
        return x < y;
      case '<=':
        return x <= y;
    }
  }
  const sx = String(x);
  const sy = String(y);
  switch (op) {
    case '==':
      return sx === sy;
    case '!=':
      return sx !== sy;
    case '>':
      return sx > sy;
    case '>=':
      return sx >= sy;
    case '<':
      return sx < sy;
    case '<=':
      return sx <= sy;
  }
  return false;
}

function applyMath(cur: number, op: MathOp, v: number): number {
  switch (op) {
    case 'set':
      return v;
    case 'add':
      return cur + v;
    case 'sub':
      return cur - v;
    case 'mul':
      return cur * v;
  }
}

function toNumber(v: number | string): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ================================================================
// 初期化
// ================================================================

export function createPlayState(def: GameDefinition, playerCount: number, rng: () => number = Math.random): PlayState {
  const n = Math.max(1, Math.min(8, Math.floor(playerCount)));
  const entities: Record<string, Entity> = structuredClone(def.entities);
  for (const e of Object.values(entities)) {
    if (e.type === 'timer') {
      e.remaining = e.seconds ?? 60;
      e.runningUntil = null;
    }
    if (isContainer(e) && !e.children) e.children = [];
  }
  entities[BOX_ID] = makeEntity('bag', { id: BOX_ID, name: 'ゲーム外', x: -9999, y: -9999, w: 0, h: 0, children: [] });
  const players = Array.from({ length: n }, (_, i) => {
    const id = handId(i);
    entities[id] = makeEntity('hand', {
      id,
      name: `${def.players.names[i] || `プレイヤー${i + 1}`}の手札`,
      owner: i,
      enterFace: 'up',
      children: [],
      x: -9999,
      y: -9999,
      w: 0,
      h: 0,
    });
    return {
      name: def.players.names[i] || `プレイヤー${i + 1}`,
      color: def.players.colors[i] || '#888888',
      vars: Object.fromEntries(def.playerVars.map((v) => [v.id, v.initial])),
      handId: id,
    };
  });
  const maxZ = Math.max(1, ...Object.values(entities).map((e) => e.z || 0));
  const state: PlayState = {
    entities,
    players,
    globals: Object.fromEntries(def.globalVars.map((v) => [v.id, v.initial])),
    current: 0,
    direction: 1,
    turn: 1,
    phase: def.phases[0] || '',
    log: [],
    logSeq: 0,
    winners: null,
    ended: false,
    endText: '',
    firedOnce: [],
    extraTurn: false,
    nextZ: maxZ + 1,
    toasts: [],
  };
  return applyPlay(def, state, (e) => {
    e.log(`ゲーム開始（${n}人）`, 'system');
    e.emit({ type: 'gameStart', player: 0 });
    e.emit({ type: 'turnStart', player: 0 });
    if (state.phase) e.emit({ type: 'phaseStart', phase: state.phase, player: 0 });
  }, rng);
}

/**
 * 状態をコピーして操作を適用し、新しい状態を返す。
 * 操作の後に「常時チェック」ルールを評価する。
 */
export function applyPlay(
  def: GameDefinition,
  state: PlayState,
  fn: (e: Engine) => void,
  rng: () => number = Math.random,
): PlayState {
  const s = structuredClone(state);
  s.toasts = [];
  const eng = new Engine(def, s, rng);
  fn(eng);
  eng.emit({ type: 'stateCheck' });
  if (s.log.length > 300) s.log = s.log.slice(-300);
  return s;
}

// ================================================================
// エンジン本体
// ================================================================

export class Engine {
  private depth = 0;
  private steps = 0;
  private halted = false;

  constructor(
    readonly def: GameDefinition,
    readonly s: PlayState,
    private rng: () => number = Math.random,
  ) {}

  // ---------------- 基本 ----------------

  ent(id: string | undefined | null): Entity | undefined {
    return id ? this.s.entities[id] : undefined;
  }

  get playerCount(): number {
    return this.s.players.length;
  }

  playerName(i: number): string {
    return this.s.players[i]?.name ?? `P${i + 1}`;
  }

  log(text: string, kind: LogEntry['kind'] = 'info'): void {
    this.s.logSeq += 1;
    this.s.log.push({ id: this.s.logSeq, text, kind });
  }

  toast(text: string): void {
    this.s.logSeq += 1;
    this.s.toasts.push({ id: this.s.logSeq, text });
  }

  randInt(min: number, max: number): number {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(this.rng() * (hi - lo + 1));
  }

  /** コンテナの中身（free エリア・ボードは範囲内にある物） */
  contents(containerId: string): string[] {
    const c = this.ent(containerId);
    if (!c) return [];
    if (isContainer(c)) return [...(c.children || [])];
    if (c.type === 'board' || c.type === 'zone') {
      return Object.values(this.s.entities)
        .filter((e) => e.parentId === null && isMovable(e) && e.id !== c.id)
        .filter((e) => {
          const p = center(e);
          return containsPoint(c, p.x, p.y);
        })
        .map((e) => e.id);
    }
    return [];
  }

  /** プレイヤー参照を番号に解決 */
  resolvePlayer(ref: PlayerRef, ev?: GameEvent): number {
    const n = this.playerCount;
    switch (ref) {
      case 'current':
        return this.s.current;
      case 'event':
        return ev?.player ?? this.s.current;
      case 'next':
        return (((this.s.current + this.s.direction) % n) + n) % n;
      case 'previous':
        return (((this.s.current - this.s.direction) % n) + n) % n;
      default:
        return Math.max(0, Math.min(n - 1, Number(ref) || 0));
    }
  }

  /** ダイスの出目などエンティティの数値 */
  entityValue(e: Entity | undefined): number | string {
    if (!e) return 0;
    switch (e.type) {
      case 'dice':
      case 'spinner': {
        const face = e.faces?.[e.value ?? 0] ?? '';
        const n = Number(face);
        return face !== '' && !isNaN(n) ? n : face;
      }
      case 'counter':
        return e.count ?? 0;
      case 'timer':
        return e.remaining ?? 0;
      case 'deck':
      case 'bag':
      case 'zone':
      case 'hand':
      case 'board':
        return this.contents(e.id).length;
      default:
        return e.props.value ?? 0;
    }
  }

  // ---------------- 移動 ----------------

  private detach(id: string): string | null {
    const e = this.ent(id);
    if (!e || !e.parentId) return null;
    const parent = this.ent(e.parentId);
    const from = e.parentId;
    if (parent?.children) parent.children = parent.children.filter((c) => c !== id);
    e.parentId = null;
    return from;
  }

  private attach(id: string, containerId: string): void {
    const e = this.ent(id);
    const c = this.ent(containerId);
    if (!e || !c) return;
    if (!c.children) c.children = [];
    c.children.push(id);
    e.parentId = containerId;
    if (c.enterFace === 'up') e.faceUp = true;
    else if (c.enterFace === 'down') e.faceUp = false;
  }

  /** ボード上のマス（1始まり）を求める。ボード上になければ 0 */
  cellOf(boardId: string, id: string): number {
    const b = this.ent(boardId);
    const e = this.ent(id);
    if (!b || !e || e.parentId !== null) return 0;
    const p = center(e);
    if (!containsPoint(b, p.x, p.y)) return 0;
    const cells = computeCells(b.grid, b.w, b.h);
    const c = nearestCell(cells, p.x - b.x, p.y - b.y);
    return c ? c.index + 1 : 0;
  }

  /** 同じマスに既にいる駒の数（重ならないようずらすため） */
  private occupants(boardId: string, cell: number, except: string): number {
    return this.contents(boardId).filter((id) => id !== except && this.cellOf(boardId, id) === cell).length;
  }

  private placeAtCell(id: string, boardId: string, cell: number): boolean {
    const b = this.ent(boardId);
    const e = this.ent(id);
    if (!b || !e) return false;
    const cells = computeCells(b.grid, b.w, b.h);
    const c = cells[cell - 1];
    if (!c) return false;
    const stack = b.grid?.kind === 'track' ? this.occupants(boardId, cell, id) : 0;
    e.x = b.x + c.cx - e.w / 2 + stack * 7;
    e.y = b.y + c.cy - e.h / 2 - stack * 7;
    return true;
  }

  /** エンティティを移動する（UI操作・ルールの両方から使う） */
  move(id: string, target: MoveTarget, player: number = this.s.current): void {
    const e = this.ent(id);
    if (!e) return;
    if (target.kind === 'container' && target.id === id) return;
    const from = this.detach(id);
    const fromEnt = this.ent(from);
    let enteredContainer: string | null = null;
    let enteredPlayer = player;

    switch (target.kind) {
      case 'table': {
        e.x = target.x;
        e.y = target.y;
        e.z = this.s.nextZ++;
        break;
      }
      case 'container': {
        const c = this.ent(target.id);
        if (!c) break;
        if (!isContainer(c)) {
          // 自由エリア・ボードは中心に置く
          e.x = c.x + c.w / 2 - e.w / 2;
          e.y = c.y + c.h / 2 - e.h / 2;
          e.z = this.s.nextZ++;
          break;
        }
        this.attach(id, target.id);
        enteredContainer = target.id;
        if (c.type === 'hand' && c.owner !== null) enteredPlayer = c.owner;
        break;
      }
      case 'hand': {
        const h = handId(target.player);
        this.attach(id, h);
        enteredContainer = h;
        enteredPlayer = target.player;
        break;
      }
      case 'cell': {
        e.z = this.s.nextZ++;
        this.placeAtCell(id, target.boardId, target.index);
        break;
      }
      case 'removed': {
        this.attach(id, BOX_ID);
        break;
      }
    }

    if (fromEnt && (fromEnt.type === 'deck' || fromEnt.type === 'bag') && from !== enteredContainer) {
      this.emit({ type: 'cardDrawn', entityId: id, containerId: from!, value: 1, text: e.name, player: enteredPlayer });
    }
    if (enteredContainer) {
      this.emit({ type: 'entityEntered', entityId: id, containerId: enteredContainer, text: e.name, player: enteredPlayer });
    } else if (target.kind === 'table' || target.kind === 'cell' || target.kind === 'container') {
      this.afterTablePlace(id, player, target.kind !== 'cell');
    }
  }

  /** テーブルに置いた後：ボードへのスナップと「入った」イベント */
  private afterTablePlace(id: string, player: number, snap: boolean): void {
    const e = this.ent(id);
    if (!e) return;
    const p = center(e);
    const areas = Object.values(this.s.entities)
      .filter((a) => a.parentId === null && (a.type === 'board' || (a.type === 'zone' && a.layout === 'free')))
      .filter((a) => containsPoint(a, p.x, p.y))
      .sort((a, b) => b.z - a.z);
    for (const a of areas) {
      if (a.type === 'board') {
        let cell = 0;
        const cells = computeCells(a.grid, a.w, a.h);
        const c = nearestCell(cells, p.x - a.x, p.y - a.y);
        if (c) {
          cell = c.index + 1;
          if (snap && a.grid?.snap) this.placeAtCell(id, a.id, cell);
        }
        this.emit({ type: 'entityEntered', entityId: id, containerId: a.id, value: cell, text: e.name, player });
      } else {
        this.emit({ type: 'entityEntered', entityId: id, containerId: a.id, value: 0, text: e.name, player });
      }
    }
  }

  // ---------------- 各種操作 ----------------

  flip(id: string, face: 'toggle' | 'up' | 'down' = 'toggle', player = this.s.current): void {
    const e = this.ent(id);
    if (!e) return;
    if (e.type === 'deck' || e.type === 'zone') {
      // 山の一番上を裏返す
      const top = e.children?.[e.children.length - 1];
      if (top) this.flip(top, face, player);
      return;
    }
    if (!canFlip(e)) return;
    const next = face === 'toggle' ? !e.faceUp : face === 'up';
    if (next === e.faceUp) return;
    e.faceUp = next;
    this.emit({ type: 'entityFlipped', entityId: id, value: next ? 1 : 0, text: e.name, player });
  }

  roll(id: string, player = this.s.current): void {
    const e = this.ent(id);
    if (!e || (e.type !== 'dice' && e.type !== 'spinner')) return;
    const n = e.faces?.length || 1;
    e.value = Math.floor(this.rng() * n);
    const face = e.faces?.[e.value] ?? '';
    this.log(`${this.playerName(player)}が${e.name}を振った：${face}`);
    const v = this.entityValue(e);
    this.emit({ type: 'diceRolled', entityId: id, value: toNumber(v), text: face, player });
  }

  shuffle(id: string): void {
    const e = this.ent(id);
    if (!e?.children) return;
    const a = e.children;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    this.log(`${e.name}をシャッフルした`);
  }

  /** 山札の上から手札へ */
  draw(deckId: string, count: number, player: number): number {
    let drawn = 0;
    for (let i = 0; i < count; i++) {
      const d = this.ent(deckId);
      const top = d?.children?.[d.children.length - 1];
      if (!top) break;
      this.move(top, { kind: 'hand', player }, player);
      drawn++;
    }
    const d = this.ent(deckId);
    if (drawn > 0) this.log(`${this.playerName(player)}が${d?.name ?? ''}から${drawn}枚引いた`);
    if (drawn < count) this.log(`${d?.name ?? '山札'}が足りません`, 'system');
    return drawn;
  }

  /** 袋・山札からランダムに1つ取り出してテーブルに置く */
  drawRandomToTable(containerId: string, player = this.s.current): void {
    const c = this.ent(containerId);
    if (!c?.children?.length) return;
    const idx = Math.floor(this.rng() * c.children.length);
    const id = c.children[idx];
    const e = this.ent(id)!;
    this.move(id, { kind: 'table', x: c.x + c.w + 12 + this.randInt(0, 30), y: c.y + this.randInt(0, 30) }, player);
    this.log(`${this.playerName(player)}が${c.name}から${e.name}を取り出した`);
  }

  /** 山札の一番上をめくって指定の場所へ（空なら横に置く） */
  reveal(deckId: string, toId: string, player = this.s.current): void {
    const d = this.ent(deckId);
    const top = d?.children?.[d.children.length - 1];
    if (!d || !top) return;
    const card = this.ent(top)!;
    card.faceUp = true;
    if (toId && this.ent(toId)) this.move(top, { kind: 'container', id: toId }, player);
    else this.move(top, { kind: 'table', x: d.x + d.w + 16, y: d.y }, player);
    card.faceUp = true;
    this.log(`${d.name}から${card.name}をめくった`);
  }

  /** 全部集めて戻す */
  gather(fromId: string, toId: string, doShuffle: boolean): void {
    const to = this.ent(toId);
    if (!to || !isContainer(to)) return;
    let ids: string[] = [];
    if (fromId === '__all_hands__') {
      for (const p of this.s.players) ids.push(...(this.ent(p.handId)?.children || []));
    } else if (fromId === '__all__') {
      // 元々この山札にあったカードを全て戻す
      const orig = this.def.entities[toId]?.children || [];
      ids = orig.filter((id) => this.ent(id) && this.ent(id)!.parentId !== toId);
    } else {
      ids = this.contents(fromId);
    }
    for (const id of ids) {
      if (id === toId) continue;
      this.detach(id);
      this.attach(id, toId);
    }
    if (doShuffle) this.shuffle(toId);
    this.log(`${to.name}にカードを集めた（${ids.length}枚）`);
  }

  setCounter(id: string, op: MathOp, v: number, player = this.s.current): void {
    const e = this.ent(id);
    if (!e || e.type !== 'counter') return;
    let next = applyMath(e.count ?? 0, op, v);
    if (typeof e.min === 'number') next = Math.max(e.min, next);
    if (typeof e.max === 'number') next = Math.min(e.max, next);
    if (next === e.count) return;
    e.count = next;
    this.emit({ type: 'counterChanged', entityId: id, value: next, player });
  }

  setVar(scope: 'global' | 'player', varId: string, player: number, op: MathOp, v: number): void {
    if (scope === 'global') {
      const cur = this.s.globals[varId] ?? 0;
      const next = applyMath(cur, op, v);
      if (next === cur) return;
      this.s.globals[varId] = next;
      this.emit({ type: 'variableChanged', varId, value: next, player: this.s.current });
    } else {
      const p = this.s.players[player];
      if (!p) return;
      const cur = p.vars[varId] ?? 0;
      const next = applyMath(cur, op, v);
      if (next === cur) return;
      p.vars[varId] = next;
      this.emit({ type: 'variableChanged', varId, value: next, player });
    }
  }

  nextTurn(): void {
    if (this.s.ended) return;
    const cur = this.s.current;
    this.emit({ type: 'turnEnd', player: cur });
    if (this.s.ended) return;
    const n = this.playerCount;
    if (!this.s.extraTurn) this.s.current = (((this.s.current + this.s.direction) % n) + n) % n;
    this.s.extraTurn = false;
    this.s.turn += 1;
    this.log(`―― ${this.s.turn}ターン目：${this.playerName(this.s.current)}の番 ――`, 'system');
    this.emit({ type: 'turnStart', player: this.s.current });
    if (this.def.phases.length) this.setPhase(this.def.phases[0]);
  }

  setPhase(phase: string): void {
    this.s.phase = phase;
    this.log(`フェーズ：${phase}`, 'system');
    this.emit({ type: 'phaseStart', phase, player: this.s.current });
  }

  startTimer(id: string, now = Date.now()): void {
    const e = this.ent(id);
    if (!e || e.type !== 'timer') return;
    e.remaining = e.seconds ?? 60;
    e.runningUntil = now + e.remaining * 1000;
  }

  timerEnded(id: string): void {
    const e = this.ent(id);
    if (!e) return;
    e.runningUntil = null;
    e.remaining = 0;
    this.log(`${e.name}の時間切れ`, 'system');
    this.emit({ type: 'timerEnded', entityId: id, player: this.s.current });
  }

  declareWinners(ws: number[], text?: string): void {
    this.s.winners = ws;
    this.s.ended = true;
    const names = ws.map((w) => this.playerName(w)).join('、');
    this.s.endText = text || (ws.length ? `${names}の勝利！` : 'ゲーム終了');
    this.log(this.s.endText, 'win');
    this.halted = true;
  }

  pressButton(id: string, player = this.s.current): void {
    const e = this.ent(id);
    if (!e) return;
    this.emit({ type: 'buttonPressed', entityId: id, text: e.name, player });
  }

  // ---------------- ルール評価 ----------------

  emit(ev: GameEvent): void {
    if (this.halted) return;
    if (this.depth >= MAX_DEPTH) {
      this.log('ルールの連鎖が深すぎるため中断しました（無限ループの可能性）', 'system');
      this.halted = true;
      return;
    }
    const rules = this.def.rules.filter((r) => r.enabled && r.trigger.type === ev.type && this.triggerMatches(r, ev));
    if (!rules.length) return;
    this.depth++;
    try {
      for (const r of rules) {
        if (this.halted) break;
        if (r.once && this.s.firedOnce.includes(r.id)) continue;
        if (!this.conditionsPass(r, ev)) continue;
        if (r.once) this.s.firedOnce.push(r.id);
        if (ev.type !== 'stateCheck' || r.actions.some((a) => a.type !== 'message')) this.log(`ルール「${r.name}」`, 'rule');
        for (const a of r.actions) {
          if (this.halted) break;
          if (++this.steps > MAX_STEPS) {
            this.log('処理が多すぎるため中断しました', 'system');
            this.halted = true;
            break;
          }
          this.runAction(a, ev);
        }
      }
    } finally {
      this.depth--;
    }
  }

  private triggerMatches(r: Rule, ev: GameEvent): boolean {
    const t = r.trigger;
    switch (t.type) {
      case 'buttonPressed':
      case 'diceRolled':
      case 'entityFlipped':
      case 'counterChanged':
      case 'timerEnded':
        return !t.entityId || t.entityId === ev.entityId;
      case 'cardDrawn':
        return !t.entityId || t.entityId === ev.containerId;
      case 'entityEntered': {
        if (t.entityId === '__any_hand__') {
          if (!ev.containerId?.startsWith('__hand_')) return false;
        } else if (t.entityId && t.entityId !== ev.containerId) return false;
        if (t.group && this.ent(ev.entityId)?.group !== t.group) return false;
        return true;
      }
      case 'phaseStart':
        return !t.phase || t.phase === ev.phase;
      case 'variableChanged':
        return !t.varId || t.varId === ev.varId;
      default:
        return true;
    }
  }

  conditionsPass(r: Pick<Rule, 'conditions' | 'match'>, ev: GameEvent): boolean {
    if (!r.conditions.length) return true;
    const results = r.conditions.map((c) => this.evalCondition(c, ev));
    return r.match === 'any' ? results.some(Boolean) : results.every(Boolean);
  }

  evalCondition(c: Condition, ev: GameEvent): boolean {
    return compare(this.evalOperand(c.left, ev), c.op, this.evalOperand(c.right, ev));
  }

  evalOperand(o: Operand, ev: GameEvent): number | string {
    switch (o.kind) {
      case 'number':
        return Number(o.value) || 0;
      case 'text':
        return o.value ?? '';
      case 'globalVar':
        return this.s.globals[o.varId] ?? 0;
      case 'playerVar':
        return this.s.players[this.resolvePlayer(o.player, ev)]?.vars[o.varId] ?? 0;
      case 'eventValue':
        return ev.value ?? 0;
      case 'eventText':
        return ev.text ?? '';
      case 'eventProp': {
        const e = this.ent(ev.entityId);
        if (!e) return '';
        switch (o.prop) {
          case 'name':
            return e.name;
          case 'group':
            return e.group;
          case 'text':
            return e.text;
          case 'owner':
            return e.owner === null ? 0 : e.owner + 1;
          case 'color':
            return e.color;
          default:
            return e.props[o.prop] ?? '';
        }
      }
      case 'entityValue':
        return this.entityValue(this.ent(o.entityId));
      case 'count':
        return this.contents(o.containerId).length;
      case 'handCount':
        return this.ent(handId(this.resolvePlayer(o.player, ev)))?.children?.length ?? 0;
      case 'turn':
        return this.s.turn;
      case 'round':
        return Math.floor((this.s.turn - 1) / this.playerCount) + 1;
      case 'currentPlayer':
        return this.s.current + 1;
      case 'playerCount':
        return this.playerCount;
      case 'random':
        return this.randInt(o.min, o.max);
    }
  }

  private resolveEntity(ref: EntityRef, ev: GameEvent): string | undefined {
    switch (ref.kind) {
      case 'entity':
        return this.ent(ref.entityId)?.id;
      case 'event':
        return ev.entityId;
      case 'top': {
        const c = this.ent(ref.containerId);
        return c?.children?.[c.children.length - 1];
      }
      case 'playerPiece': {
        const p = this.resolvePlayer(ref.player, ev);
        const candidates = Object.values(this.s.entities).filter(
          (e) => e.owner === p && e.parentId === null && isMovable(e) && e.type !== 'card',
        );
        if (ref.boardId) {
          const onBoard = candidates.find((e) => this.cellOf(ref.boardId, e.id) > 0);
          if (onBoard) return onBoard.id;
        }
        return candidates.sort((a, b) => a.z - b.z)[0]?.id;
      }
    }
  }

  private toMoveTarget(d: Destination, ev: GameEvent): MoveTarget | null {
    switch (d.kind) {
      case 'container':
        return this.ent(d.containerId) ? { kind: 'container', id: d.containerId } : null;
      case 'hand':
        return { kind: 'hand', player: this.resolvePlayer(d.player, ev) };
      case 'cell':
        return { kind: 'cell', boardId: d.boardId, index: toNumber(this.evalOperand(d.cell, ev)) };
      case 'removed':
        return { kind: 'removed' };
    }
  }

  formatText(text: string, ev: GameEvent): string {
    return text
      .replace(/\{player\}/g, this.playerName(this.s.current))
      .replace(/\{eventPlayer\}/g, this.playerName(ev.player ?? this.s.current))
      .replace(/\{value\}/g, String(ev.value ?? ''))
      .replace(/\{text\}/g, ev.text ?? '')
      .replace(/\{turn\}/g, String(this.s.turn));
  }

  runAction(a: Action, ev: GameEvent): void {
    const num = (o: Operand) => toNumber(this.evalOperand(o, ev));
    switch (a.type) {
      case 'setVar':
        this.setVar(a.scope, a.varId, this.resolvePlayer(a.player, ev), a.op, num(a.value));
        break;
      case 'setCounter':
        this.setCounter(a.entityId, a.op, num(a.value));
        break;
      case 'roll':
        this.roll(a.entityId);
        break;
      case 'shuffle':
        this.shuffle(a.entityId);
        break;
      case 'draw': {
        const count = Math.max(0, Math.floor(num(a.count)));
        if (a.to === 'all') {
          // 1枚ずつ順番に配る
          for (let i = 0; i < count; i++)
            for (let k = 0; k < this.playerCount; k++) {
              const p = (this.s.current + k) % this.playerCount;
              const d = this.ent(a.deckId);
              const top = d?.children?.[d.children.length - 1];
              if (top) this.move(top, { kind: 'hand', player: p }, p);
            }
          this.log(`各プレイヤーに${count}枚ずつ配った`);
        } else {
          this.draw(a.deckId, count, a.to === 'event' ? this.resolvePlayer('event', ev) : this.s.current);
        }
        break;
      }
      case 'reveal':
        this.reveal(a.deckId, a.to);
        break;
      case 'move': {
        const id = this.resolveEntity(a.what, ev);
        const t = this.toMoveTarget(a.to, ev);
        if (id && t) this.move(id, t, ev.player ?? this.s.current);
        break;
      }
      case 'advance': {
        const id = this.resolveEntity(a.what, ev);
        const b = this.ent(a.boardId);
        if (!id || !b) break;
        const cells = computeCells(b.grid, b.w, b.h);
        if (!cells.length) break;
        const steps = Math.trunc(num(a.steps));
        const cur = this.cellOf(a.boardId, id);
        let next = cur + steps;
        if (a.wrap) next = ((((next - 1) % cells.length) + cells.length) % cells.length) + 1;
        else next = Math.max(1, Math.min(cells.length, next));
        const e = this.ent(id)!;
        this.log(`${e.name}が${steps >= 0 ? steps + 'マス進んだ' : -steps + 'マス戻った'}（マス${next}）`);
        this.move(id, { kind: 'cell', boardId: a.boardId, index: next }, ev.player ?? this.s.current);
        break;
      }
      case 'flip': {
        const id = this.resolveEntity(a.what, ev);
        if (id) this.flip(id, a.face);
        break;
      }
      case 'gather':
        this.gather(a.from, a.to, a.shuffle);
        break;
      case 'setOwner': {
        const id = this.resolveEntity(a.what, ev);
        const e = this.ent(id);
        if (e) e.owner = a.player === 'none' ? null : this.resolvePlayer(a.player, ev);
        break;
      }
      case 'nextTurn':
        this.nextTurn();
        break;
      case 'extraTurn':
        this.s.extraTurn = true;
        this.log(`${this.playerName(this.s.current)}はもう一度手番を行う`);
        break;
      case 'setPlayer': {
        const p = Math.floor(num(a.player)) - 1;
        if (p >= 0 && p < this.playerCount) this.s.current = p;
        break;
      }
      case 'reverseOrder':
        this.s.direction = this.s.direction === 1 ? -1 : 1;
        this.log('手番の順番が逆になった');
        break;
      case 'setPhase':
        this.setPhase(a.phase);
        break;
      case 'startTimer':
        this.startTimer(a.entityId);
        break;
      case 'message': {
        const text = this.formatText(a.text, ev);
        this.log(text);
        this.toast(text);
        break;
      }
      case 'winner': {
        let ws: number[] = [];
        if (a.who === 'current') ws = [this.s.current];
        else if (a.who === 'event') ws = [this.resolvePlayer('event', ev)];
        else if (a.varId) {
          const vals = this.s.players.map((p) => p.vars[a.varId!] ?? 0);
          const best = a.who === 'highest' ? Math.max(...vals) : Math.min(...vals);
          ws = vals.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
        }
        this.declareWinners(ws);
        break;
      }
      case 'endGame':
        this.declareWinners([], this.formatText(a.text || 'ゲーム終了', ev));
        break;
    }
  }
}

/** 手札のエンティティ一覧（UI 用） */
export function handCards(state: PlayState, player: number): Entity[] {
  const h = state.entities[handId(player)];
  return (h?.children || []).map((id) => state.entities[id]).filter(Boolean);
}

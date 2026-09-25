import { describe, expect, it } from 'vitest';
import { buildDeck, playingCardSpecs } from '../catalog';
import { defaultGrid, makeEntity, newGame, newRule } from '../model';
import type { GameDefinition } from '../types';
import { applyPlay, createPlayState, handCards } from './engine';
import { computeCells } from './geometry';

function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

function addAll(g: GameDefinition, ...es: ReturnType<typeof makeEntity>[]) {
  for (const e of es) g.entities[e.id] = e;
}

describe('geometry', () => {
  it('computes track cells', () => {
    expect(computeCells(defaultGrid({ kind: 'track', trackShape: 'loop', cols: 5, rows: 4 }), 500, 400)).toHaveLength(14);
    expect(computeCells(defaultGrid({ kind: 'track', trackShape: 'snake', cols: 6, rows: 5, trackLength: 28 }), 600, 500)).toHaveLength(28);
    expect(computeCells(defaultGrid({ kind: 'intersection', cols: 19, rows: 19 }), 500, 500)).toHaveLength(361);
    expect(computeCells(defaultGrid({ kind: 'hex', cols: 5, rows: 4 }), 500, 400)).toHaveLength(20);
  });
});

describe('engine', () => {
  it('deals cards at game start and draws on button press', () => {
    const g = newGame();
    const deck = makeEntity('deck', { name: '山札', enterFace: 'down', w: 90, h: 130 });
    const btn = makeEntity('button', { name: '引く' });
    addAll(g, ...buildDeck(deck, playingCardSpecs(0)), btn);
    const r1 = newRule();
    r1.trigger = { type: 'gameStart' };
    r1.actions = [
      { type: 'shuffle', entityId: deck.id },
      { type: 'draw', deckId: deck.id, count: { kind: 'number', value: 5 }, to: 'all' },
    ];
    const r2 = newRule();
    r2.trigger = { type: 'buttonPressed', entityId: btn.id };
    r2.actions = [{ type: 'draw', deckId: deck.id, count: { kind: 'number', value: 1 }, to: 'current' }];
    g.rules = [r1, r2];

    let s = createPlayState(g, 3);
    expect(handCards(s, 0)).toHaveLength(5);
    expect(handCards(s, 2)).toHaveLength(5);
    expect(s.entities[deck.id].children).toHaveLength(52 - 15);
    expect(handCards(s, 0).every((c) => c.faceUp)).toBe(true);

    s = applyPlay(g, s, (e) => e.pressButton(btn.id));
    expect(handCards(s, 0)).toHaveLength(6);
    // 元の定義は変更されない
    expect(g.entities[deck.id].children).toHaveLength(52);
  });

  it('runs a sugoroku: dice → advance → landing rule → next turn → win', () => {
    const g = newGame();
    const board = makeEntity('board', {
      x: 0,
      y: 0,
      w: 600,
      h: 100,
      grid: defaultGrid({ kind: 'track', trackShape: 'snake', cols: 10, rows: 1, trackLength: 10 }),
    });
    const die = makeEntity('dice', { faces: ['1', '2', '3', '4', '5', '6'], value: 0 });
    const p1 = makeEntity('piece', { owner: 0, x: 5, y: 5, w: 40, h: 40 });
    const p2 = makeEntity('piece', { owner: 1, x: 5, y: 5, w: 40, h: 40 });
    addAll(g, board, die, p1, p2);

    const move = newRule();
    move.trigger = { type: 'diceRolled', entityId: die.id };
    move.actions = [
      { type: 'advance', what: { kind: 'playerPiece', boardId: board.id, player: 'current' }, boardId: board.id, steps: { kind: 'eventValue' }, wrap: false },
      { type: 'nextTurn' },
    ];
    const bonus = newRule();
    bonus.trigger = { type: 'entityEntered', entityId: board.id };
    bonus.conditions = [{ left: { kind: 'eventValue' }, op: '==', right: { kind: 'number', value: 4 } }];
    bonus.actions = [{ type: 'setVar', scope: 'player', varId: 'score', player: 'event', op: 'add', value: { kind: 'number', value: 10 } }];
    const goal = newRule();
    goal.trigger = { type: 'entityEntered', entityId: board.id };
    goal.conditions = [{ left: { kind: 'eventValue' }, op: '>=', right: { kind: 'number', value: 10 } }];
    goal.actions = [{ type: 'winner', who: 'event' }];
    g.rules = [move, bonus, goal];

    // rng=0.5 → 6面ダイスで index 3 → 出目4
    let s = createPlayState(g, 2, seq([0.5]));
    expect(s.current).toBe(0);
    s = applyPlay(g, s, (e) => e.roll(die.id), seq([0.5]));
    // マス1から4進んでマス5（ボーナスはマス4なので発動しない）
    expect(s.players[0].vars.score).toBe(0);
    expect(s.current).toBe(1);
    // rng=0.4 → index 2 → 出目3 : マス1→4
    s = applyPlay(g, s, (e) => e.roll(die.id), seq([0.4]));
    expect(s.players[1].vars.score).toBe(10);
    expect(s.current).toBe(0);
    // 出目6 → マス5→10 でゴール
    s = applyPlay(g, s, (e) => e.roll(die.id), seq([0.99]));
    expect(s.ended).toBe(true);
    expect(s.winners).toEqual([0]);
  });

  it('stateCheck with once declares the highest scorer', () => {
    const g = newGame();
    const r = newRule();
    r.trigger = { type: 'stateCheck' };
    r.once = true;
    r.conditions = [{ left: { kind: 'turn' }, op: '>', right: { kind: 'number', value: 2 } }];
    r.actions = [{ type: 'winner', who: 'highest', varId: 'score' }];
    g.rules = [r];
    let s = createPlayState(g, 2);
    s = applyPlay(g, s, (e) => e.setVar('player', 'score', 1, 'add', 3));
    s = applyPlay(g, s, (e) => e.nextTurn());
    expect(s.ended).toBe(false);
    s = applyPlay(g, s, (e) => e.nextTurn());
    expect(s.ended).toBe(true);
    expect(s.winners).toEqual([1]);
  });

  it('stops infinite rule loops', () => {
    const g = newGame();
    const c = makeEntity('counter', { count: 0 });
    addAll(g, c);
    const r = newRule();
    r.trigger = { type: 'counterChanged', entityId: c.id };
    r.actions = [{ type: 'setCounter', entityId: c.id, op: 'add', value: { kind: 'number', value: 1 } }];
    g.rules = [r];
    let s = createPlayState(g, 2);
    s = applyPlay(g, s, (e) => e.setCounter(c.id, 'add', 1));
    expect(s.log.some((l) => l.text.includes('無限ループ'))).toBe(true);
  });

  it('extra turn keeps the same player across operations', () => {
    const g = newGame();
    const r = newRule();
    r.trigger = { type: 'turnEnd' };
    r.conditions = [{ left: { kind: 'turn' }, op: '==', right: { kind: 'number', value: 1 } }];
    r.actions = [{ type: 'extraTurn' }];
    g.rules = [r];
    let s = createPlayState(g, 2);
    s = applyPlay(g, s, (e) => e.nextTurn());
    expect(s.current).toBe(0);
    s = applyPlay(g, s, (e) => e.nextTurn());
    expect(s.current).toBe(1);
  });
});

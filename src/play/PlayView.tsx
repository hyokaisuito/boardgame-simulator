import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyPlay, createPlayState, handCards, handId, type Engine } from '../engine/engine';
import { canFlip, isContainer, isMovable } from '../model';
import type { Entity, GameDefinition, PlayState } from '../types';
import { computeDisplay, type DisplayItem } from '../ui/display';
import { CardView } from '../ui/EntityView';
import { TableView, type TableApi } from '../ui/TableView';

interface MenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  title: string;
  items: MenuItem[];
}

const HISTORY_LIMIT = 60;

export function PlayView({ def, onExit, exitLabel }: { def: GameDefinition; onExit: () => void; exitLabel: string }) {
  const [state, setState] = useState<PlayState | null>(null);
  const [playerCount, setPlayerCount] = useState(def.players.defaultCount);
  const [names, setNames] = useState<string[]>(() => def.players.names.slice(0, 8));
  const [setupOpen, setSetupOpen] = useState(true);

  const start = () => {
    const d: GameDefinition = { ...def, players: { ...def.players, names } };
    setState(createPlayState(d, playerCount));
    setSetupOpen(false);
  };

  if (setupOpen || !state) {
    return (
      <div className="play-setup">
        <div className="dialog">
          <h2>▶ テストプレイ：{def.name}</h2>
          {def.description && <p className="desc">{def.description}</p>}
          <label className="field">
            <span className="field-label">人数</span>
            <span className="field-control">
              <select value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))}>
                {Array.from({ length: def.players.max - def.players.min + 1 }, (_, i) => def.players.min + i).map((n) => (
                  <option key={n} value={n}>
                    {n}人
                  </option>
                ))}
              </select>
            </span>
          </label>
          <div className="player-list">
            {Array.from({ length: playerCount }, (_, i) => (
              <div className="var-row" key={i}>
                <span className="swatch big" style={{ background: def.players.colors[i] }} />
                <input
                  value={names[i] || ''}
                  onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
                  placeholder={`プレイヤー${i + 1}`}
                />
              </div>
            ))}
          </div>
          <p className="muted small">1台の画面を順番に渡しながら遊びます（ホットシート）。</p>
          <div className="row gap end">
            <button onClick={onExit}>{exitLabel}</button>
            <button className="primary" onClick={start}>
              ゲーム開始
            </button>
          </div>
        </div>
      </div>
    );
  }
  const d: GameDefinition = { ...def, players: { ...def.players, names } };
  return <PlaySession def={d} initial={state} onExit={onExit} exitLabel={exitLabel} onRestart={() => setSetupOpen(true)} />;
}

function PlaySession({
  def,
  initial,
  onExit,
  exitLabel,
  onRestart,
}: {
  def: GameDefinition;
  initial: PlayState;
  onExit: () => void;
  exitLabel: string;
  onRestart: () => void;
}) {
  const [state, setState] = useState<PlayState>(initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [history, setHistory] = useState<PlayState[]>([]);
  const [god, setGod] = useState(false);
  const [handOf, setHandOf] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [now, setNow] = useState(Date.now());
  const [shownPlayer, setShownPlayer] = useState<number>(initial.current);
  const [hidden, setHidden] = useState(false);
  const [handDrag, setHandDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [showLog, setShowLog] = useState(true);
  const apiRef = useRef<TableApi | null>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const act = useCallback(
    (fn: (e: Engine) => void) => {
      const prev = stateRef.current;
      const next = applyPlay(def, prev, fn);
      stateRef.current = next;
      setHistory((h) => [...h.slice(-HISTORY_LIMIT), prev]);
      setState(next);
      if (next.toasts.length) {
        setToasts((t) => [...t, ...next.toasts]);
        for (const tt of next.toasts) setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== tt.id)), 3500);
      }
    },
    [def],
  );

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      stateRef.current = prev;
      setState(prev);
      setShownPlayer(prev.current);
      return h.slice(0, -1);
    });
  };

  // 初期状態のトースト
  useEffect(() => {
    if (initial.toasts.length) {
      setToasts(initial.toasts);
      setTimeout(() => setToasts([]), 3500);
    }
  }, [initial]);

  // 手番交代で画面を隠す
  useEffect(() => {
    if (state.current !== shownPlayer) {
      if (def.players.hideOnSwitch && state.players.length > 1 && !god && !state.ended) setHidden(true);
      setShownPlayer(state.current);
    }
  }, [state.current, shownPlayer, def.players.hideOnSwitch, state.players.length, god, state.ended]);

  // タイマー
  const anyRunning = Object.values(state.entities).some((e) => e.type === 'timer' && e.runningUntil);
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      const ended = Object.values(stateRef.current.entities).filter((e) => e.type === 'timer' && e.runningUntil && e.runningUntil <= n);
      if (ended.length) act((eng) => ended.forEach((e) => eng.timerEnded(e.id)));
    }, 200);
    return () => clearInterval(t);
  }, [anyRunning, act]);

  const viewer = god ? null : state.current;
  const handPlayer = handOf ?? state.current;
  const items = useMemo(() => {
    const list = computeDisplay(state.entities, viewer);
    // 山札の一番上のカードを個別にドラッグできるようにする
    const extra: DisplayItem[] = [];
    for (const it of list) {
      const e = it.entity;
      if (e.type === 'deck' && e.children?.length) {
        it.splitTop = true;
        const top = state.entities[e.children[e.children.length - 1]];
        if (top)
          extra.push({
            key: top.id,
            entity: top,
            x: e.x,
            y: e.y,
            w: e.w,
            h: e.h,
            z: it.z + 0.5,
            faceShown: top.faceUp,
            containerId: e.id,
            background: false,
          });
      }
    }
    return [...list, ...extra].sort((a, b) => a.z - b.z);
  }, [state.entities, viewer]);

  const ent = (id: string | null | undefined): Entity | undefined => (id ? state.entities[id] : undefined);

  // ------------ ドロップ処理 ------------

  const overHand = (cx: number, cy: number) => {
    const r = handRef.current?.getBoundingClientRect();
    return !!r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  };
  const overTable = (cx: number, cy: number) => {
    const r = tableWrapRef.current?.getBoundingClientRect();
    return !!r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  };

  /** ワールド座標の下にある置き場（コンテナ） */
  const containerAtPoint = (x: number, y: number, exclude: string): Entity | undefined =>
    Object.values(stateRef.current.entities)
      .filter((c) => c.parentId === null && isContainer(c) && c.type !== 'hand' && c.id !== exclude)
      .filter((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h)
      .sort((a, b) => (a.type === 'zone' ? 0 : 1) - (b.type === 'zone' ? 0 : 1) || a.z - b.z)
      .pop();

  const dropEntity = (id: string, cx: number, cy: number, tableX: number, tableY: number) => {
    const e = stateRef.current.entities[id];
    if (!e) return;
    if (overHand(cx, cy) && (e.type === 'card' || e.type === 'tile' || isMovable(e))) {
      act((eng) => eng.move(id, { kind: 'hand', player: handPlayer }, handPlayer));
      return;
    }
    if (!overTable(cx, cy)) return;
    const w = apiRef.current!.toWorld(cx, cy);
    const target = isMovable(e) ? containerAtPoint(w.x, w.y, id) : undefined;
    if (target) {
      if (target.id === e.parentId) return;
      act((eng) => eng.move(id, { kind: 'container', id: target.id }));
    } else {
      act((eng) => eng.move(id, { kind: 'table', x: Math.round(tableX), y: Math.round(tableY) }));
    }
  };

  // ------------ メニュー ------------

  const primaryAction = (item: DisplayItem) => {
    const e = item.entity;
    const parent = ent(item.containerId);
    if (parent?.type === 'deck') {
      act((eng) => eng.draw(parent.id, 1, state.current));
      return;
    }
    switch (e.type) {
      case 'dice':
      case 'spinner':
        act((eng) => eng.roll(e.id));
        break;
      case 'deck':
        act((eng) => eng.draw(e.id, 1, state.current));
        break;
      case 'bag':
        act((eng) => eng.drawRandomToTable(e.id));
        break;
      default:
        if (canFlip(e)) act((eng) => eng.flip(e.id));
    }
  };

  const menuFor = (item: DisplayItem): MenuState => {
    const e = item.entity;
    const parent = ent(item.containerId);
    const list: MenuItem[] = [];
    const deckMenu = (d: Entity) => {
      list.push({ label: '1枚引いて手札へ', run: () => act((eng) => eng.draw(d.id, 1, state.current)) });
      list.push({ label: '一番上をめくって横に出す', run: () => act((eng) => eng.reveal(d.id, '')) });
      list.push({ label: 'シャッフル', run: () => act((eng) => eng.shuffle(d.id)) });
      list.push({
        label: '全員に配る…',
        run: () => {
          const n = Number(prompt('1人あたり何枚配りますか？', '5'));
          if (n > 0)
            act((eng) =>
              eng.runAction({ type: 'draw', deckId: d.id, count: { kind: 'number', value: n }, to: 'all' }, { type: 'buttonPressed' }),
            );
        },
      });
      list.push({ label: '一番上を裏返す', run: () => act((eng) => eng.flip(d.id)) });
      list.push({ label: 'カードを全て回収してシャッフル', run: () => act((eng) => eng.gather('__all__', d.id, true)) });
    };
    if (parent?.type === 'deck') {
      deckMenu(parent);
      return { x: 0, y: 0, title: parent.name, items: list };
    }
    switch (e.type) {
      case 'deck':
        deckMenu(e);
        break;
      case 'bag':
        list.push({ label: 'ランダムに1つ取り出す', run: () => act((eng) => eng.drawRandomToTable(e.id)) });
        list.push({ label: 'ランダムに1つ手札へ', run: () => act((eng) => {
          const c = eng.s.entities[e.id];
          const kids = c.children || [];
          if (kids.length) eng.move(kids[Math.floor(Math.random() * kids.length)], { kind: 'hand', player: eng.s.current });
        }) });
        break;
      case 'dice':
      case 'spinner':
        list.push({ label: '振る', run: () => act((eng) => eng.roll(e.id)) });
        break;
      case 'zone':
        if (e.layout !== 'free') {
          list.push({ label: 'シャッフル', run: () => act((eng) => eng.shuffle(e.id)) });
          list.push({ label: '一番上を手札へ', run: () => act((eng) => eng.draw(e.id, 1, state.current)) });
          list.push({ label: '全て表にする', run: () => act((eng) => (eng.s.entities[e.id].children || []).forEach((c) => eng.flip(c, 'up'))) });
          list.push({ label: '全て裏にする', run: () => act((eng) => (eng.s.entities[e.id].children || []).forEach((c) => eng.flip(c, 'down'))) });
        }
        break;
      case 'timer':
        list.push({ label: '開始／一時停止', run: () => toggleTimer(e.id) });
        list.push({ label: 'リセット', run: () => act((eng) => {
          const t = eng.s.entities[e.id];
          t.runningUntil = null;
          t.remaining = t.seconds ?? 60;
        }) });
        break;
      case 'counter':
        list.push({ label: 'リセット', run: () => act((eng) => eng.setCounter(e.id, 'set', def.entities[e.id]?.count ?? 0)) });
        break;
      case 'button':
        list.push({ label: '押す', run: () => act((eng) => eng.pressButton(e.id)) });
        break;
    }
    if (canFlip(e)) list.push({ label: '裏返す', run: () => act((eng) => eng.flip(e.id)) });
    if (e.type === 'card' || e.type === 'tile' || isMovable(e)) {
      list.push({ label: '手札に加える', run: () => act((eng) => eng.move(e.id, { kind: 'hand', player: state.current })) });
    }
    if (isMovable(e) || e.type === 'card') {
      list.push({
        label: '90°回転',
        run: () => act((eng) => (eng.s.entities[e.id].rotation = ((eng.s.entities[e.id].rotation || 0) + 90) % 360)),
      });
      if (parent)
        list.push({
          label: 'テーブルに出す',
          run: () => act((eng) => eng.move(e.id, { kind: 'table', x: parent.x + parent.w + 16, y: parent.y })),
        });
      list.push({ label: 'ゲームから取り除く', danger: true, run: () => act((eng) => eng.move(e.id, { kind: 'removed' })) });
    }
    return { x: 0, y: 0, title: e.name, items: list };
  };

  const toggleTimer = (id: string) =>
    act((eng) => {
      const t = eng.s.entities[id];
      const n = Date.now();
      if (t.runningUntil) {
        t.remaining = Math.max(0, Math.ceil((t.runningUntil - n) / 1000));
        t.runningUntil = null;
      } else {
        if (!t.remaining || t.remaining <= 0) t.remaining = t.seconds ?? 60;
        t.runningUntil = n + t.remaining * 1000;
      }
      setNow(n);
    });

  // ------------ 手札 ------------

  const hand = handCards(state, handPlayer);
  const handMenu = (card: Entity, x: number, y: number) =>
    setMenu({
      x,
      y,
      title: card.name,
      items: [
        {
          label: '表向きで場に出す',
          run: () =>
            act((eng) => {
              const c = apiRef.current!.centerWorld();
              eng.s.entities[card.id].faceUp = true;
              eng.move(card.id, { kind: 'table', x: Math.round(c.x - card.w / 2), y: Math.round(c.y - card.h / 2) });
            }),
        },
        {
          label: '裏向きで場に出す',
          run: () =>
            act((eng) => {
              const c = apiRef.current!.centerWorld();
              eng.s.entities[card.id].faceUp = false;
              eng.move(card.id, { kind: 'table', x: Math.round(c.x - card.w / 2), y: Math.round(c.y - card.h / 2) });
            }),
        },
        ...Object.values(state.entities)
          .filter((c) => c.parentId === null && (c.type === 'deck' || (c.type === 'zone' && c.layout !== 'free')))
          .map((c) => ({ label: `${c.name}に置く`, run: () => act((eng) => eng.move(card.id, { kind: 'container', id: c.id })) })),
      ],
    });

  const onHandPointerDown = (card: Entity, ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const sx = ev.clientX;
    const sy = ev.clientY;
    let moved = false;
    const onMove = (e2: PointerEvent) => {
      if (!moved && Math.abs(e2.clientX - sx) + Math.abs(e2.clientY - sy) < 6) return;
      moved = true;
      setHandDrag({ id: card.id, x: e2.clientX, y: e2.clientY });
    };
    const onUp = (e2: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setHandDrag(null);
      if (!moved) return;
      if (overHand(e2.clientX, e2.clientY)) return;
      const w = apiRef.current?.toWorld(e2.clientX, e2.clientY);
      if (!w) return;
      dropEntity(card.id, e2.clientX, e2.clientY, w.x - card.w / 2, w.y - card.h / 2);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const cur = state.players[state.current];
  const winners = state.winners;
  const handScale = (e: Entity) => Math.min(1, 118 / e.h);

  return (
    <div className="play" onClick={() => menu && setMenu(null)}>
      <header className="topbar play-bar">
        <button onClick={onExit}>{exitLabel}</button>
        <span className="play-title">{def.name}</span>
        <span className="turn-info" style={{ borderColor: cur?.color }}>
          <span className="swatch" style={{ background: cur?.color }} />
          {state.turn}ターン目：<b>{cur?.name}</b>の番{state.phase && <span className="phase">（{state.phase}）</span>}
        </span>
        <span className="grow" />
        <button onClick={undo} disabled={!history.length} title="1つ前の状態に戻す">
          ↶ 戻す
        </button>
        <button
          onClick={() => {
            if (confirm('最初からやり直しますか？')) onRestart();
          }}
        >
          ⟲ 最初から
        </button>
        <label className="check" title="すべての手札・非公開エリアを見る（デバッグ用）">
          <input type="checkbox" checked={god} onChange={(e) => setGod(e.target.checked)} /> 全員の視点
        </label>
        <button onClick={() => setShowLog(!showLog)}>📜 ログ</button>
        {def.phases.length > 1 && (
          <button
            onClick={() =>
              act((eng) => {
                const i = def.phases.indexOf(eng.s.phase);
                if (i >= 0 && i < def.phases.length - 1) eng.setPhase(def.phases[i + 1]);
                else eng.nextTurn();
              })
            }
            disabled={state.ended}
          >
            次のフェーズ ▸
          </button>
        )}
        <button className="primary" onClick={() => act((eng) => eng.nextTurn())} disabled={state.ended}>
          手番終了 ⏭
        </button>
      </header>

      <div className="play-main">
        <aside className="players-panel">
          {state.players.map((p, i) => (
            <div key={i} className={`player-card ${i === state.current ? 'current' : ''} ${winners?.includes(i) ? 'winner' : ''}`} style={{ borderColor: p.color }}>
              <div className="player-name">
                <span className="swatch" style={{ background: p.color }} />
                {p.name}
                {i === state.current && <span className="turn-mark">手番</span>}
                {winners?.includes(i) && <span>🏆</span>}
              </div>
              {def.playerVars.map((v) => (
                <div key={v.id} className="var-line">
                  <span>{v.name}</span>
                  <span className="var-ctrl">
                    <button className="mini" onClick={() => act((eng) => eng.setVar('player', v.id, i, 'sub', 1))}>
                      −
                    </button>
                    <b>{p.vars[v.id] ?? 0}</b>
                    <button className="mini" onClick={() => act((eng) => eng.setVar('player', v.id, i, 'add', 1))}>
                      ＋
                    </button>
                  </span>
                </div>
              ))}
              <div className="var-line muted">
                <span>手札</span>
                <span>
                  {state.entities[handId(i)]?.children?.length ?? 0}枚
                  {god && (
                    <button className="link" onClick={() => setHandOf(i === handOf ? null : i)}>
                      {handPlayer === i ? '表示中' : '見る'}
                    </button>
                  )}
                </span>
              </div>
            </div>
          ))}
          {def.globalVars.length > 0 && (
            <div className="player-card">
              <div className="player-name">共通</div>
              {def.globalVars.map((v) => (
                <div key={v.id} className="var-line">
                  <span>{v.name}</span>
                  <span className="var-ctrl">
                    <button className="mini" onClick={() => act((eng) => eng.setVar('global', v.id, 0, 'sub', 1))}>
                      −
                    </button>
                    <b>{state.globals[v.id] ?? 0}</b>
                    <button className="mini" onClick={() => act((eng) => eng.setVar('global', v.id, 0, 'add', 1))}>
                      ＋
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="help-box muted small">
            <b>操作</b>
            <br />
            ドラッグ：移動
            <br />
            ダブルクリック：振る／裏返す／引く
            <br />
            右クリック（長押し）：メニュー
            <br />
            ホイール：拡大縮小
          </div>
        </aside>

        <div className="play-center">
          <div className="play-table" ref={tableWrapRef}>
            <TableView
              table={def.table}
              items={items}
              entities={state.entities}
              apiRef={apiRef}
              play={{
                now,
                onButton: (id) => act((eng) => eng.pressButton(id)),
                onCounter: (id, delta) => act((eng) => eng.setCounter(id, 'add', delta)),
                onTimerToggle: toggleTimer,
              }}
              canDrag={(item) => {
                if (item.containerId) return true;
                const e = item.entity;
                return !e.locked && isMovable(e);
              }}
              onDragEnd={(item, dx, dy, cx, cy) => dropEntity(item.entity.id, cx, cy, item.x + dx, item.y + dy)}
              onItemDoubleClick={primaryAction}
              onItemContextMenu={(item, x, y) => {
                const m = menuFor(item);
                if (m.items.length) setMenu({ ...m, x, y });
              }}
              onBackgroundClick={() => setMenu(null)}
            />
            <LongPressMenu apiRef={apiRef} items={items} onOpen={(item, x, y) => {
              const m = menuFor(item);
              if (m.items.length) setMenu({ ...m, x, y });
            }} />
          </div>
          <div className={`hand-tray ${handDrag ? 'drop-ok' : ''}`} ref={handRef}>
            <div className="hand-title" style={{ color: state.players[handPlayer]?.color }}>
              {state.players[handPlayer]?.name}の手札（{hand.length}）
            </div>
            <div className="hand-cards">
              {hand.length === 0 && <span className="muted small">カードをここにドラッグすると手札に加わります</span>}
              {hand.map((c) => {
                const s = handScale(c);
                return (
                  <div
                    key={c.id}
                    className={`hand-card ${handDrag?.id === c.id ? 'ghosted' : ''}`}
                    style={{ width: c.w * s, height: c.h * s }}
                    onPointerDown={(ev) => onHandPointerDown(c, ev)}
                    onDoubleClick={() =>
                      act((eng) => {
                        const p = apiRef.current!.centerWorld();
                        eng.move(c.id, { kind: 'table', x: Math.round(p.x - c.w / 2), y: Math.round(p.y - c.h / 2) });
                      })
                    }
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      handMenu(c, ev.clientX, ev.clientY);
                    }}
                    title={c.name}
                  >
                    <div style={{ transform: `scale(${s})`, transformOrigin: 'top left' }}>
                      <CardView e={c} faceShown />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {showLog && (
          <aside className="log-panel">
            <div className="log-title">ログ</div>
            <LogList state={state} />
          </aside>
        )}
      </div>

      {handDrag && ent(handDrag.id) && (
        <div className="drag-ghost" style={{ left: handDrag.x, top: handDrag.y }}>
          <CardView e={ent(handDrag.id)!} faceShown />
        </div>
      )}

      {menu && (
        <div
          className="context-menu"
          style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 40 - menu.items.length * 34) }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="menu-title">{menu.title}</div>
          {menu.items.map((m, i) => (
            <button
              key={i}
              className={m.danger ? 'danger' : ''}
              onClick={() => {
                setMenu(null);
                m.run();
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.text}
          </div>
        ))}
      </div>

      {hidden && !state.ended && (
        <div className="pass-overlay">
          <div className="dialog center">
            <div className="swatch huge" style={{ background: cur?.color }} />
            <h2>{cur?.name}の番です</h2>
            <p>端末を{cur?.name}に渡してください。</p>
            <button className="primary big" onClick={() => setHidden(false)}>
              準備OK
            </button>
          </div>
        </div>
      )}

      {state.ended && (
        <div className="win-banner">
          <div className="win-text">🏆 {state.endText}</div>
          <div className="row gap">
            <button onClick={undo} disabled={!history.length}>
              ↶ 1手戻す
            </button>
            <button onClick={onRestart}>もう一度遊ぶ</button>
            <button onClick={onExit}>{exitLabel}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LogList({ state }: { state: PlayState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [state.log.length]);
  return (
    <div className="log-list" ref={ref}>
      {state.log.map((l) => (
        <div key={l.id} className={`log-entry ${l.kind}`}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

/** タッチ端末用：長押しでメニューを開く */
function LongPressMenu({
  apiRef,
  items,
  onOpen,
}: {
  apiRef: React.MutableRefObject<TableApi | null>;
  items: DisplayItem[];
  onOpen: (item: DisplayItem, x: number, y: number) => void;
}) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const target = e.target as HTMLElement;
      if (!target.closest('.play-table')) return;
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        const w = apiRef.current?.toWorld(start!.x, start!.y);
        if (!w) return;
        const hit = itemsRef.current
          .filter((i) => w.x >= i.x && w.x <= i.x + i.w && w.y >= i.y && w.y <= i.y + i.h)
          .pop();
        if (hit) openRef.current(hit, start!.x, start!.y);
      }, 600);
    };
    const cancel = (e: PointerEvent) => {
      if (start && e.type === 'pointermove' && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 8) return;
      if (timer) clearTimeout(timer);
      timer = null;
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', cancel);
    window.addEventListener('pointerup', cancel);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', cancel);
      window.removeEventListener('pointerup', cancel);
    };
  }, [apiRef]);
  return null;
}

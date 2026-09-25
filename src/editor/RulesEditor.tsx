import { useMemo, useState } from 'react';
import { entityLabel, newRule, uid } from '../model';
import {
  ACTIONS,
  COMPARE_OPS,
  defaultOperand,
  MATH_OPS,
  OPERANDS,
  PLAYER_REF_OPTIONS,
  TRIGGERS,
} from '../ruleMeta';
import type {
  Action,
  ActionType,
  CompareOp,
  Condition,
  Destination,
  EntityRef,
  EntityType,
  GameDefinition,
  MathOp,
  Operand,
  OperandKind,
  PlayerRef,
  Rule,
  Trigger,
  TriggerType,
} from '../types';
import { Check, NumberInput, Select, TextInput } from '../ui/fields';
import { useEditor } from './store';

// ------------------------------------------------------------
// 共通の選択肢
// ------------------------------------------------------------

function useEntityOptions(types?: EntityType[], anyLabel?: string) {
  const game = useEditor((s) => s.game)!;
  return useMemo(() => {
    const list = Object.values(game.entities)
      .filter((e) => !e.parentId && (!types || types.includes(e.type)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      .map((e) => ({ value: e.id, label: entityLabel(e) }));
    return anyLabel !== undefined ? [{ value: '', label: anyLabel }, ...list] : [{ value: '', label: '（選択してください）' }, ...list];
  }, [game.entities, types, anyLabel]);
}

function EntitySelect({
  value,
  onChange,
  types,
  anyLabel,
  extra,
}: {
  value: string;
  onChange: (v: string) => void;
  types?: EntityType[];
  anyLabel?: string;
  extra?: { value: string; label: string }[];
}) {
  const options = useEntityOptions(types, anyLabel);
  const game = useEditor((s) => s.game)!;
  const all = [...(extra || []), ...options];
  const missing = value && !all.some((o) => o.value === value) && !game.entities[value];
  return (
    <Select
      value={value}
      onChange={onChange}
      options={missing ? [{ value, label: '⚠ 削除された部品' }, ...all] : all}
    />
  );
}

function PlayerSelect({ value, onChange, allowEvent = true }: { value: PlayerRef; onChange: (v: PlayerRef) => void; allowEvent?: boolean }) {
  const game = useEditor((s) => s.game)!;
  const options = PLAYER_REF_OPTIONS.filter((o) => allowEvent || o.value !== 'event')
    .filter((o) => isNaN(Number(o.value)) || Number(o.value) < game.players.max)
    .map((o) => (isNaN(Number(o.value)) ? o : { ...o, label: game.players.names[Number(o.value)] || o.label }));
  return (
    <Select
      value={String(value)}
      onChange={(v) => onChange(isNaN(Number(v)) ? (v as PlayerRef) : Number(v))}
      options={options}
    />
  );
}

function VarSelect({ scope, value, onChange }: { scope: 'global' | 'player'; value: string; onChange: (v: string) => void }) {
  const game = useEditor((s) => s.game)!;
  const vars = scope === 'global' ? game.globalVars : game.playerVars;
  return (
    <Select
      value={value}
      onChange={onChange}
      options={[{ value: '', label: vars.length ? '（変数を選択）' : '（「設定」タブで変数を追加）' }, ...vars.map((v) => ({ value: v.id, label: v.name }))]}
    />
  );
}

const VALUE_TYPES: EntityType[] = ['dice', 'spinner', 'counter', 'timer', 'deck', 'bag', 'zone', 'board'];
const PLACE_TYPES: EntityType[] = ['board', 'zone', 'deck', 'bag'];
const CONTAINER_TYPES: EntityType[] = ['deck', 'zone', 'bag'];

// ------------------------------------------------------------
// 値（オペランド）
// ------------------------------------------------------------

function OperandEditor({ value, onChange, propKeys }: { value: Operand; onChange: (o: Operand) => void; propKeys: string[] }) {
  const listId = useMemo(() => uid('dl_'), []);
  const kindOptions = (Object.keys(OPERANDS) as OperandKind[]).map((k) => ({ value: k, label: OPERANDS[k] }));
  return (
    <span className="operand">
      <Select<OperandKind> value={value.kind} onChange={(k) => onChange(defaultOperand(k))} options={kindOptions} />
      {value.kind === 'number' && (
        <NumberInput value={value.value} onChange={(v) => onChange({ ...value, value: v ?? 0 })} />
      )}
      {value.kind === 'text' && <TextInput value={value.value} onChange={(v) => onChange({ ...value, value: v })} />}
      {value.kind === 'globalVar' && <VarSelect scope="global" value={value.varId} onChange={(v) => onChange({ ...value, varId: v })} />}
      {value.kind === 'playerVar' && (
        <>
          <PlayerSelect value={value.player} onChange={(p) => onChange({ ...value, player: p })} />
          <span className="joiner">の</span>
          <VarSelect scope="player" value={value.varId} onChange={(v) => onChange({ ...value, varId: v })} />
        </>
      )}
      {value.kind === 'eventProp' && (
        <>
          <input list={listId} value={value.prop} onChange={(e) => onChange({ ...value, prop: e.target.value })} placeholder="プロパティ名" />
          <datalist id={listId}>
            <option value="name">名前</option>
            <option value="group">グループ</option>
            <option value="text">表の文字</option>
            <option value="owner">所有者（番号）</option>
            <option value="color">色</option>
            {propKeys.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </>
      )}
      {value.kind === 'entityValue' && (
        <EntitySelect value={value.entityId} types={VALUE_TYPES} onChange={(v) => onChange({ ...value, entityId: v })} />
      )}
      {value.kind === 'count' && (
        <EntitySelect value={value.containerId} types={PLACE_TYPES} onChange={(v) => onChange({ ...value, containerId: v })} />
      )}
      {value.kind === 'handCount' && <PlayerSelect value={value.player} onChange={(p) => onChange({ ...value, player: p })} />}
      {value.kind === 'random' && (
        <>
          <NumberInput value={value.min} onChange={(v) => onChange({ ...value, min: v ?? 0 })} />
          <span className="joiner">〜</span>
          <NumberInput value={value.max} onChange={(v) => onChange({ ...value, max: v ?? 0 })} />
        </>
      )}
    </span>
  );
}

// ------------------------------------------------------------
// 対象・移動先
// ------------------------------------------------------------

function EntityRefEditor({ value, onChange }: { value: EntityRef; onChange: (r: EntityRef) => void }) {
  return (
    <span className="operand">
      <Select
        value={value.kind}
        onChange={(k) => {
          if (k === 'event') onChange({ kind: 'event' });
          else if (k === 'entity') onChange({ kind: 'entity', entityId: '' });
          else if (k === 'top') onChange({ kind: 'top', containerId: '' });
          else onChange({ kind: 'playerPiece', boardId: '', player: 'current' });
        }}
        options={[
          { value: 'event', label: 'イベントの対象（引いたカード・置いた駒など）' },
          { value: 'entity', label: '指定した部品' },
          { value: 'top', label: '置き場の一番上' },
          { value: 'playerPiece', label: 'プレイヤーの駒（所有者で判定）' },
        ]}
      />
      {value.kind === 'entity' && <EntitySelect value={value.entityId} onChange={(v) => onChange({ ...value, entityId: v })} />}
      {value.kind === 'top' && (
        <EntitySelect value={value.containerId} types={CONTAINER_TYPES} onChange={(v) => onChange({ ...value, containerId: v })} />
      )}
      {value.kind === 'playerPiece' && (
        <>
          <PlayerSelect value={value.player} onChange={(p) => onChange({ ...value, player: p })} />
          <span className="joiner">の駒（</span>
          <EntitySelect value={value.boardId} types={['board']} anyLabel="どのボードでも" onChange={(v) => onChange({ ...value, boardId: v })} />
          <span className="joiner">上）</span>
        </>
      )}
    </span>
  );
}

function DestinationEditor({ value, onChange, propKeys }: { value: Destination; onChange: (d: Destination) => void; propKeys: string[] }) {
  return (
    <span className="operand">
      <Select
        value={value.kind}
        onChange={(k) => {
          if (k === 'hand') onChange({ kind: 'hand', player: 'current' });
          else if (k === 'container') onChange({ kind: 'container', containerId: '' });
          else if (k === 'cell') onChange({ kind: 'cell', boardId: '', cell: { kind: 'number', value: 1 } });
          else onChange({ kind: 'removed' });
        }}
        options={[
          { value: 'hand', label: '手札へ' },
          { value: 'container', label: '置き場へ（山札・エリア・袋・ボード）' },
          { value: 'cell', label: 'ボードのマスへ' },
          { value: 'removed', label: 'ゲームから取り除く' },
        ]}
      />
      {value.kind === 'hand' && <PlayerSelect value={value.player} onChange={(p) => onChange({ ...value, player: p })} />}
      {value.kind === 'container' && (
        <EntitySelect value={value.containerId} types={PLACE_TYPES} onChange={(v) => onChange({ ...value, containerId: v })} />
      )}
      {value.kind === 'cell' && (
        <>
          <EntitySelect value={value.boardId} types={['board']} onChange={(v) => onChange({ ...value, boardId: v })} />
          <span className="joiner">のマス</span>
          <OperandEditor value={value.cell} onChange={(o) => onChange({ ...value, cell: o })} propKeys={propKeys} />
        </>
      )}
    </span>
  );
}

// ------------------------------------------------------------
// アクション
// ------------------------------------------------------------

function MathSelect({ value, onChange }: { value: MathOp; onChange: (v: MathOp) => void }) {
  return <Select value={value} onChange={onChange} options={MATH_OPS} />;
}

function ActionEditor({ a, onChange, propKeys }: { a: Action; onChange: (a: Action) => void; propKeys: string[] }) {
  const game = useEditor((s) => s.game)!;
  const opnd = (v: Operand, f: (o: Operand) => void) => <OperandEditor value={v} onChange={f} propKeys={propKeys} />;
  switch (a.type) {
    case 'setVar':
      return (
        <>
          <Select
            value={a.scope}
            onChange={(v) => onChange({ ...a, scope: v, varId: '' })}
            options={[
              { value: 'player', label: 'プレイヤー変数' },
              { value: 'global', label: '共通変数' },
            ]}
          />
          {a.scope === 'player' && <PlayerSelect value={a.player} onChange={(p) => onChange({ ...a, player: p })} />}
          <VarSelect scope={a.scope} value={a.varId} onChange={(v) => onChange({ ...a, varId: v })} />
          <span className="joiner">を</span>
          {opnd(a.value, (o) => onChange({ ...a, value: o }))}
          <MathSelect value={a.op} onChange={(op) => onChange({ ...a, op })} />
        </>
      );
    case 'setCounter':
      return (
        <>
          <EntitySelect value={a.entityId} types={['counter']} onChange={(v) => onChange({ ...a, entityId: v })} />
          <span className="joiner">を</span>
          {opnd(a.value, (o) => onChange({ ...a, value: o }))}
          <MathSelect value={a.op} onChange={(op) => onChange({ ...a, op })} />
        </>
      );
    case 'roll':
      return <EntitySelect value={a.entityId} types={['dice', 'spinner']} onChange={(v) => onChange({ ...a, entityId: v })} />;
    case 'shuffle':
      return <EntitySelect value={a.entityId} types={['deck', 'bag', 'zone']} onChange={(v) => onChange({ ...a, entityId: v })} />;
    case 'draw':
      return (
        <>
          <EntitySelect value={a.deckId} types={['deck', 'zone']} onChange={(v) => onChange({ ...a, deckId: v })} />
          <span className="joiner">から</span>
          {opnd(a.count, (o) => onChange({ ...a, count: o }))}
          <span className="joiner">枚を</span>
          <Select
            value={a.to}
            onChange={(v) => onChange({ ...a, to: v })}
            options={[
              { value: 'current', label: '手番プレイヤーの手札へ' },
              { value: 'event', label: 'イベントのプレイヤーの手札へ' },
              { value: 'all', label: '全員に配る' },
            ]}
          />
        </>
      );
    case 'reveal':
      return (
        <>
          <EntitySelect value={a.deckId} types={['deck']} onChange={(v) => onChange({ ...a, deckId: v })} />
          <span className="joiner">をめくって</span>
          <EntitySelect
            value={a.to}
            types={['zone', 'deck']}
            anyLabel="山札の横に置く"
            onChange={(v) => onChange({ ...a, to: v })}
          />
          <span className="joiner">へ</span>
        </>
      );
    case 'gather':
      return (
        <>
          <EntitySelect
            value={a.from}
            types={['zone', 'board', 'bag', 'deck']}
            extra={[
              { value: '__all__', label: 'この山札の全カード（どこにあっても）' },
              { value: '__all_hands__', label: '全員の手札' },
            ]}
            onChange={(v) => onChange({ ...a, from: v })}
          />
          <span className="joiner">を</span>
          <EntitySelect value={a.to} types={['deck', 'bag', 'zone']} onChange={(v) => onChange({ ...a, to: v })} />
          <span className="joiner">へ</span>
          <Check checked={a.shuffle} onChange={(v) => onChange({ ...a, shuffle: v })} label="シャッフル" />
        </>
      );
    case 'move':
      return (
        <>
          <EntityRefEditor value={a.what} onChange={(w) => onChange({ ...a, what: w })} />
          <span className="joiner">を</span>
          <DestinationEditor value={a.to} onChange={(d) => onChange({ ...a, to: d })} propKeys={propKeys} />
        </>
      );
    case 'advance':
      return (
        <>
          <EntityRefEditor value={a.what} onChange={(w) => onChange({ ...a, what: w })} />
          <span className="joiner">を</span>
          <EntitySelect
            value={a.boardId}
            types={['board']}
            onChange={(v) =>
              onChange({ ...a, boardId: v, what: a.what.kind === 'playerPiece' ? { ...a.what, boardId: v } : a.what })
            }
          />
          <span className="joiner">上で</span>
          {opnd(a.steps, (o) => onChange({ ...a, steps: o }))}
          <span className="joiner">マス進める（負の数で戻る）</span>
          <Check checked={a.wrap} onChange={(v) => onChange({ ...a, wrap: v })} label="周回する" />
        </>
      );
    case 'flip':
      return (
        <>
          <EntityRefEditor value={a.what} onChange={(w) => onChange({ ...a, what: w })} />
          <span className="joiner">を</span>
          <Select
            value={a.face}
            onChange={(v) => onChange({ ...a, face: v })}
            options={[
              { value: 'toggle', label: '裏返す' },
              { value: 'up', label: '表にする' },
              { value: 'down', label: '裏にする' },
            ]}
          />
        </>
      );
    case 'setOwner':
      return (
        <>
          <EntityRefEditor value={a.what} onChange={(w) => onChange({ ...a, what: w })} />
          <span className="joiner">の所有者を</span>
          <Select
            value={String(a.player)}
            onChange={(v) => onChange({ ...a, player: v === 'none' ? 'none' : isNaN(Number(v)) ? (v as PlayerRef) : Number(v) })}
            options={[{ value: 'none', label: 'なし' }, ...PLAYER_REF_OPTIONS.filter((o) => isNaN(Number(o.value)) || Number(o.value) < game.players.max)]}
          />
          <span className="joiner">にする</span>
        </>
      );
    case 'setPlayer':
      return (
        <>
          <span className="joiner">プレイヤー番号</span>
          {opnd(a.player, (o) => onChange({ ...a, player: o }))}
          <span className="joiner">の手番にする</span>
        </>
      );
    case 'setPhase':
      return (
        <Select
          value={a.phase}
          onChange={(v) => onChange({ ...a, phase: v })}
          options={[
            { value: '', label: game.phases.length ? '（フェーズを選択）' : '（「設定」タブでフェーズを追加）' },
            ...game.phases.map((p) => ({ value: p, label: p })),
          ]}
        />
      );
    case 'startTimer':
      return <EntitySelect value={a.entityId} types={['timer']} onChange={(v) => onChange({ ...a, entityId: v })} />;
    case 'message':
      return (
        <input
          className="wide"
          value={a.text}
          onChange={(e) => onChange({ ...a, text: e.target.value })}
          placeholder="{player}=手番の人 {value}=イベントの値 {text}=イベントの文字"
        />
      );
    case 'winner':
      return (
        <>
          <Select
            value={a.who}
            onChange={(v) => onChange({ ...a, who: v })}
            options={[
              { value: 'current', label: '手番プレイヤーの勝ち' },
              { value: 'event', label: 'イベントのプレイヤーの勝ち' },
              { value: 'highest', label: '変数が一番大きい人の勝ち' },
              { value: 'lowest', label: '変数が一番小さい人の勝ち' },
            ]}
          />
          {(a.who === 'highest' || a.who === 'lowest') && (
            <VarSelect scope="player" value={a.varId || ''} onChange={(v) => onChange({ ...a, varId: v })} />
          )}
        </>
      );
    case 'endGame':
      return <input value={a.text} onChange={(e) => onChange({ ...a, text: e.target.value })} placeholder="終了メッセージ" />;
    default:
      return null;
  }
}

// ------------------------------------------------------------
// トリガー
// ------------------------------------------------------------

function TriggerEditor({ t, onChange }: { t: Trigger; onChange: (t: Trigger) => void }) {
  const game = useEditor((s) => s.game)!;
  const meta = TRIGGERS[t.type];
  return (
    <div className="rule-line">
      <Select<TriggerType>
        value={t.type}
        onChange={(v) => onChange({ type: v, entityId: '' })}
        options={(Object.keys(TRIGGERS) as TriggerType[]).map((k) => ({ value: k, label: TRIGGERS[k].label }))}
      />
      {meta.entityTypes && (
        <>
          <span className="joiner">{meta.entityLabel}：</span>
          <EntitySelect
            value={t.entityId || ''}
            types={meta.entityTypes}
            anyLabel="どれでも"
            extra={t.type === 'entityEntered' ? [{ value: '__any_hand__', label: 'だれかの手札' }] : undefined}
            onChange={(v) => onChange({ ...t, entityId: v })}
          />
        </>
      )}
      {t.type === 'entityEntered' && (
        <>
          <span className="joiner">グループ：</span>
          <input value={t.group || ''} onChange={(e) => onChange({ ...t, group: e.target.value })} placeholder="（指定なし）" />
        </>
      )}
      {t.type === 'phaseStart' && (
        <Select
          value={t.phase || ''}
          onChange={(v) => onChange({ ...t, phase: v })}
          options={[{ value: '', label: 'どのフェーズでも' }, ...game.phases.map((p) => ({ value: p, label: p }))]}
        />
      )}
      {t.type === 'variableChanged' && (
        <Select
          value={t.varId || ''}
          onChange={(v) => onChange({ ...t, varId: v })}
          options={[
            { value: '', label: 'どの変数でも' },
            ...game.playerVars.map((v) => ({ value: v.id, label: `${v.name}（プレイヤー）` })),
            ...game.globalVars.map((v) => ({ value: v.id, label: `${v.name}（共通）` })),
          ]}
        />
      )}
      <div className="rule-help">{meta.help}</div>
    </div>
  );
}

// ------------------------------------------------------------
// ルール1件
// ------------------------------------------------------------

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const a = [...arr];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}

function RuleCard({ rule, index, total, propKeys }: { rule: Rule; index: number; total: number; propKeys: string[] }) {
  const update = useEditor((s) => s.update);
  const [open, setOpen] = useState(true);
  const setRule = (fn: (r: Rule) => Rule, key?: string) =>
    update((g) => {
      const i = g.rules.findIndex((r) => r.id === rule.id);
      if (i >= 0) g.rules[i] = fn(g.rules[i]);
    }, key ? `${rule.id}.${key}` : undefined);

  const actionOptions = (Object.keys(ACTIONS) as ActionType[]).map((k) => ({
    value: k,
    label: ACTIONS[k].label,
    group: ACTIONS[k].category,
  }));

  const setCond = (i: number, c: Condition, key?: string) =>
    setRule((r) => ({ ...r, conditions: r.conditions.map((x, j) => (j === i ? c : x)) }), key && `c${i}.${key}`);
  const setAction = (i: number, a: Action) => setRule((r) => ({ ...r, actions: r.actions.map((x, j) => (j === i ? a : x)) }), `a${i}`);

  return (
    <div className={`rule-card ${rule.enabled ? '' : 'disabled'}`}>
      <div className="rule-head">
        <button className="mini" onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'}
        </button>
        <input type="checkbox" checked={rule.enabled} title="有効／無効" onChange={(e) => setRule((r) => ({ ...r, enabled: e.target.checked }))} />
        <input className="rule-name" value={rule.name} onChange={(e) => setRule((r) => ({ ...r, name: e.target.value }), 'name')} />
        {!open && (
          <span className="muted small">
            {TRIGGERS[rule.trigger.type].label} ／ 条件{rule.conditions.length} ／ 動作{rule.actions.length}
          </span>
        )}
        <span className="grow" />
        <Check checked={rule.once} onChange={(v) => setRule((r) => ({ ...r, once: v }))} label="1回だけ" />
        <button className="mini" disabled={index === 0} onClick={() => update((g) => (g.rules = move(g.rules, index, -1)))} title="上へ">
          ↑
        </button>
        <button className="mini" disabled={index === total - 1} onClick={() => update((g) => (g.rules = move(g.rules, index, 1)))} title="下へ">
          ↓
        </button>
        <button
          className="mini"
          title="複製"
          onClick={() => update((g) => g.rules.splice(index + 1, 0, { ...structuredClone(rule), id: uid('r_'), name: rule.name + '（コピー）' }))}
        >
          ⧉
        </button>
        <button
          className="mini danger"
          title="削除"
          onClick={() => {
            if (confirm(`ルール「${rule.name}」を削除しますか？`)) update((g) => (g.rules = g.rules.filter((r) => r.id !== rule.id)));
          }}
        >
          ✕
        </button>
      </div>
      {open && (
        <div className="rule-body">
          <div className="rule-block when">
            <div className="rule-label">いつ</div>
            <TriggerEditor t={rule.trigger} onChange={(t) => setRule((r) => ({ ...r, trigger: t }))} />
          </div>
          <div className="rule-block if">
            <div className="rule-label">もし</div>
            <div className="rule-lines">
              {rule.conditions.length === 0 && <div className="muted small">条件なし（いつでも実行）</div>}
              {rule.conditions.length > 1 && (
                <Select
                  value={rule.match}
                  onChange={(v) => setRule((r) => ({ ...r, match: v }))}
                  options={[
                    { value: 'all', label: '次の条件をすべて満たす' },
                    { value: 'any', label: '次の条件のどれかを満たす' },
                  ]}
                />
              )}
              {rule.conditions.map((c, i) => (
                <div className="rule-line" key={i}>
                  <OperandEditor value={c.left} onChange={(o) => setCond(i, { ...c, left: o }, 'l')} propKeys={propKeys} />
                  <Select<CompareOp> value={c.op} onChange={(op) => setCond(i, { ...c, op })} options={COMPARE_OPS} />
                  <OperandEditor value={c.right} onChange={(o) => setCond(i, { ...c, right: o }, 'r')} propKeys={propKeys} />
                  <button className="mini danger" onClick={() => setRule((r) => ({ ...r, conditions: r.conditions.filter((_, j) => j !== i) }))}>
                    ✕
                  </button>
                </div>
              ))}
              <button
                className="add"
                onClick={() =>
                  setRule((r) => ({
                    ...r,
                    conditions: [...r.conditions, { left: { kind: 'eventValue' }, op: '==', right: { kind: 'number', value: 6 } }],
                  }))
                }
              >
                ＋条件を追加
              </button>
            </div>
          </div>
          <div className="rule-block then">
            <div className="rule-label">したら</div>
            <div className="rule-lines">
              {rule.actions.length === 0 && <div className="muted small">アクションを追加してください</div>}
              {rule.actions.map((a, i) => (
                <div className="rule-line action" key={i}>
                  <span className="step-no">{i + 1}</span>
                  <Select<ActionType> value={a.type} onChange={(t) => setAction(i, ACTIONS[t].create())} options={actionOptions} />
                  <ActionEditor a={a} onChange={(na) => setAction(i, na)} propKeys={propKeys} />
                  <span className="grow" />
                  <button className="mini" disabled={i === 0} onClick={() => setRule((r) => ({ ...r, actions: move(r.actions, i, -1) }))}>
                    ↑
                  </button>
                  <button
                    className="mini"
                    disabled={i === rule.actions.length - 1}
                    onClick={() => setRule((r) => ({ ...r, actions: move(r.actions, i, 1) }))}
                  >
                    ↓
                  </button>
                  <button className="mini danger" onClick={() => setRule((r) => ({ ...r, actions: r.actions.filter((_, j) => j !== i) }))}>
                    ✕
                  </button>
                </div>
              ))}
              <button className="add" onClick={() => setRule((r) => ({ ...r, actions: [...r.actions, ACTIONS.message.create()] }))}>
                ＋アクションを追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// テンプレート
// ------------------------------------------------------------

interface Template {
  label: string;
  make: (g: GameDefinition) => Rule;
}

function first(g: GameDefinition, type: EntityType): string {
  return Object.values(g.entities).find((e) => e.type === type && !e.parentId)?.id || '';
}

function firstVar(g: GameDefinition): string {
  return g.playerVars[0]?.id || '';
}

const n = (value: number): Operand => ({ kind: 'number', value });

const TEMPLATES: Template[] = [
  {
    label: '開始時にシャッフルして5枚ずつ配る',
    make: (g) => ({
      ...newRule(),
      name: '初期手札を配る',
      trigger: { type: 'gameStart' },
      actions: [
        { type: 'shuffle', entityId: first(g, 'deck') },
        { type: 'draw', deckId: first(g, 'deck'), count: n(5), to: 'all' },
      ],
    }),
  },
  {
    label: '手番の開始時に1枚引く',
    make: (g) => ({
      ...newRule(),
      name: 'ドロー',
      trigger: { type: 'turnStart' },
      actions: [{ type: 'draw', deckId: first(g, 'deck'), count: n(1), to: 'current' }],
    }),
  },
  {
    label: 'ダイスの出目だけ自分の駒を進めて次の人へ',
    make: (g) => {
      const board = first(g, 'board');
      return {
        ...newRule(),
        name: '駒を進める',
        trigger: { type: 'diceRolled', entityId: first(g, 'dice') },
        actions: [
          { type: 'advance', what: { kind: 'playerPiece', boardId: board, player: 'current' }, boardId: board, steps: { kind: 'eventValue' }, wrap: false },
          { type: 'nextTurn' },
        ],
      };
    },
  },
  {
    label: '特定のマスに止まったら○マス進む',
    make: (g) => ({
      ...newRule(),
      name: 'すすむマス',
      trigger: { type: 'entityEntered', entityId: first(g, 'board') },
      conditions: [{ left: { kind: 'eventValue' }, op: '==', right: n(5) }],
      actions: [
        { type: 'message', text: '{player}は3マス進む！' },
        { type: 'advance', what: { kind: 'event' }, boardId: first(g, 'board'), steps: n(3), wrap: false },
      ],
    }),
  },
  {
    label: 'ボタンを押したら1枚引く',
    make: (g) => ({
      ...newRule(),
      name: 'カードを引く',
      trigger: { type: 'buttonPressed', entityId: first(g, 'button') },
      actions: [{ type: 'draw', deckId: first(g, 'deck'), count: n(1), to: 'current' }],
    }),
  },
  {
    label: '得点が10以上になったら勝利',
    make: (g) => ({
      ...newRule(),
      name: '勝利条件',
      once: true,
      trigger: { type: 'variableChanged', varId: firstVar(g) },
      conditions: [{ left: { kind: 'eventValue' }, op: '>=', right: n(10) }],
      actions: [{ type: 'winner', who: 'event' }],
    }),
  },
  {
    label: '山札がなくなったら得点が一番高い人の勝ち',
    make: (g) => ({
      ...newRule(),
      name: '山札切れで終了',
      once: true,
      trigger: { type: 'stateCheck' },
      conditions: [{ left: { kind: 'count', containerId: first(g, 'deck') }, op: '==', right: n(0) }],
      actions: [{ type: 'winner', who: 'highest', varId: firstVar(g) }],
    }),
  },
  {
    label: '手札が0枚になった人の勝ち',
    make: () => ({
      ...newRule(),
      name: '手札がなくなったら勝ち',
      once: true,
      trigger: { type: 'stateCheck' },
      conditions: [
        { left: { kind: 'handCount', player: 'current' }, op: '==', right: n(0) },
        { left: { kind: 'turn' }, op: '>', right: n(1) },
      ],
      actions: [{ type: 'winner', who: 'current' }],
    }),
  },
  {
    label: '6が出たらもう一度',
    make: (g) => ({
      ...newRule(),
      name: 'ゾロ目ボーナス',
      trigger: { type: 'diceRolled', entityId: first(g, 'dice') },
      conditions: [{ left: { kind: 'eventValue' }, op: '==', right: n(6) }],
      actions: [{ type: 'extraTurn' }, { type: 'message', text: '6が出たのでもう一度！' }],
    }),
  },
];

// ------------------------------------------------------------
// 画面
// ------------------------------------------------------------

export function RulesEditor() {
  const game = useEditor((s) => s.game)!;
  const update = useEditor((s) => s.update);
  const propKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const e of Object.values(game.entities)) for (const k of Object.keys(e.props)) keys.add(k);
    return [...keys];
  }, [game.entities]);

  return (
    <div className="rules-editor">
      <div className="rules-intro">
        <h2>ルール</h2>
        <p>
          「<b>いつ</b>（きっかけ）」「<b>もし</b>（条件）」「<b>したら</b>（アクション）」を組み合わせて、ゲームの自動処理を作ります。
          ルールがなくても、テストプレイでは部品を自由に動かして遊べます。
        </p>
        <div className="row gap wrap">
          <button className="primary" onClick={() => update((g) => g.rules.push(newRule()))}>
            ＋空のルール
          </button>
          <select
            value=""
            onChange={(e) => {
              const t = TEMPLATES[Number(e.target.value)];
              if (t) update((g) => g.rules.push(t.make(g)));
            }}
          >
            <option value="">テンプレートから追加…</option>
            {TEMPLATES.map((t, i) => (
              <option key={i} value={i}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {game.rules.length === 0 && <div className="empty-rules">まだルールがありません。</div>}
      {game.rules.map((r, i) => (
        <RuleCard key={r.id} rule={r} index={i} total={game.rules.length} propKeys={propKeys} />
      ))}
    </div>
  );
}

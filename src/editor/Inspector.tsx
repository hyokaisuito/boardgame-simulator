import { useState } from 'react';
import { buildDeck, numberCardSpecs, PIECE_SHAPES, playingCardSpecs, type CardSpec } from '../catalog';
import { canFlip, defaultGrid, isContainer, makeEntity, TYPE_LABELS } from '../model';
import type { Entity, EnterFace, GameDefinition, GridKind, PieceShape, ZoneLayout } from '../types';
import { Check, ColorInput, Field, ImageInput, NumberInput, Section, Select, TextInput } from '../ui/fields';
import { addEntities, deleteEntity, duplicateEntity, maxZ } from './ops';
import { useEditor } from './store';

const BACK_FIELDS: (keyof Entity)[] = ['color2', 'backText', 'backImage'];

export function Inspector() {
  const game = useEditor((s) => s.game)!;
  const selectedId = useEditor((s) => s.selectedId);
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const e = selectedId ? game.entities[selectedId] : undefined;

  if (!e) {
    return (
      <div className="inspector empty">
        <p>コンポーネントを選択すると、ここで設定を変更できます。</p>
        <p className="muted">
          左のパレットから部品を追加し、ドラッグで配置します。
          <br />
          ホイール：拡大縮小 ／ 背景ドラッグ：移動
          <br />
          Delete：削除 ／ Ctrl+D：複製 ／ Ctrl+Z：元に戻す
        </p>
        <Summary game={game} />
      </div>
    );
  }

  const set = <K extends keyof Entity>(key: K, value: Entity[K]) =>
    update((g) => {
      const t = g.entities[e.id];
      t[key] = value;
      // 山札の裏面・サイズは中のカードにも反映
      if (t.type === 'deck' && (BACK_FIELDS.includes(key) || key === 'cardW' || key === 'cardH')) {
        for (const cid of t.children || []) {
          const c = g.entities[cid];
          if (!c) continue;
          if (key === 'cardW') c.w = value as number;
          else if (key === 'cardH') c.h = value as number;
          else (c as unknown as Record<string, unknown>)[key] = value;
        }
        if (key === 'cardW') t.w = value as number;
        if (key === 'cardH') t.h = value as number;
      }
    }, `${e.id}.${String(key)}`);

  const parent = e.parentId ? game.entities[e.parentId] : undefined;
  const hasFaces = e.type === 'dice' || e.type === 'spinner';
  const isPieceLike = e.type === 'piece' || e.type === 'token' || e.type === 'tile';

  return (
    <div className="inspector">
      <div className="inspector-head">
        {parent && (
          <button className="link" onClick={() => select(parent.id)}>
            ← {parent.name}
          </button>
        )}
        <div className="inspector-type">{TYPE_LABELS[e.type]}</div>
        <div className="row gap">
          <button
            onClick={() =>
              update((g) => {
                const id = duplicateEntity(g, e.id);
                if (id) setTimeout(() => select(id));
              })
            }
            title="複製 (Ctrl+D)"
          >
            ⧉ 複製
          </button>
          <button
            className="danger"
            onClick={() => {
              update((g) => deleteEntity(g, e.id));
              select(parent?.id ?? null);
            }}
            title="削除 (Delete)"
          >
            🗑 削除
          </button>
        </div>
      </div>

      <Section title="基本">
        <Field label="名前">
          <TextInput value={e.name} onChange={(v) => set('name', v)} />
        </Field>
        {!parent && (
          <>
            <div className="grid2">
              <Field label="X">
                <NumberInput value={Math.round(e.x)} onChange={(v) => set('x', v ?? 0)} />
              </Field>
              <Field label="Y">
                <NumberInput value={Math.round(e.y)} onChange={(v) => set('y', v ?? 0)} />
              </Field>
            </div>
          </>
        )}
        <div className="grid2">
          <Field label="幅">
            <NumberInput value={Math.round(e.w)} min={4} onChange={(v) => set(e.type === 'deck' ? 'cardW' : 'w', v ?? 4)} />
          </Field>
          <Field label="高さ">
            <NumberInput value={Math.round(e.h)} min={4} onChange={(v) => set(e.type === 'deck' ? 'cardH' : 'h', v ?? 4)} />
          </Field>
        </div>
        {!parent && e.type !== 'board' && (
          <Field label="回転 (度)">
            <NumberInput value={e.rotation} step={15} onChange={(v) => set('rotation', v ?? 0)} />
          </Field>
        )}
        <Field label="グループ" hint="ルールで「このグループの物が置かれたら」のように絞り込むための分類名">
          <TextInput value={e.group} onChange={(v) => set('group', v)} placeholder="例：兵士、資源、赤" />
        </Field>
        <Field label="所有者" hint="プレイヤー専用の駒・エリアにする。ルールの「プレイヤーの駒」でも使います">
          <Select
            value={e.owner === null ? '' : String(e.owner)}
            onChange={(v) => set('owner', v === '' ? null : Number(v))}
            options={[
              { value: '', label: 'なし（共有）' },
              ...Array.from({ length: game.players.max }, (_, i) => ({
                value: String(i),
                label: game.players.names[i] || `プレイヤー${i + 1}`,
              })),
            ]}
          />
        </Field>
        {!parent && (
          <Check checked={e.locked} onChange={(v) => set('locked', v)} label="テストプレイ中は動かせない（固定）" />
        )}
        {!parent && e.type !== 'board' && e.type !== 'zone' && (
          <div className="row gap">
            <button onClick={() => update((g) => (g.entities[e.id].z = maxZ(g) + 1))}>最前面へ</button>
            <button
              onClick={() =>
                update((g) => {
                  const minZ = Math.min(...Object.values(g.entities).filter((x) => !['board', 'zone'].includes(x.type)).map((x) => x.z));
                  g.entities[e.id].z = minZ - 1;
                })
              }
            >
              最背面へ
            </button>
          </div>
        )}
      </Section>

      <Section title="見た目">
        {(e.type === 'card' || e.type === 'tile' || isPieceLike || e.type === 'text' || e.type === 'button') && (
            <Field label={e.type === 'text' ? '文章' : '表の文字'}>
              <TextInput value={e.text} onChange={(v) => set('text', v)} multiline={e.type === 'card' || e.type === 'text'} rows={2} />
            </Field>
          )}
        {e.type !== 'deck' && (
          <Field label={e.type === 'card' || e.type === 'tile' ? '表の色' : '色'}>
            <ColorInput value={e.color} onChange={(v) => set('color', v)} />
          </Field>
        )}
        {(e.type === 'card' || e.type === 'tile' || e.type === 'deck' || e.twoSided || e.type === 'board' || e.shape === 'disc') && (
          <Field label={e.type === 'board' ? '第2色（市松・六角）' : e.type === 'piece' && !e.twoSided ? '第2色' : '裏の色'}>
            <ColorInput value={e.color2} onChange={(v) => set('color2', v)} />
          </Field>
        )}
        {!['board', 'zone', 'deck', 'bag'].includes(e.type) && (
          <Field label="文字色">
            <ColorInput value={e.textColor} onChange={(v) => set('textColor', v)} />
          </Field>
        )}
        {(canFlip(e) || e.type === 'deck') && (
          <Field label="裏の文字">
            <TextInput value={e.backText} onChange={(v) => set('backText', v)} />
          </Field>
        )}
        {['card', 'tile', 'board', 'zone'].includes(e.type) && (
          <Field label={e.type === 'card' || e.type === 'tile' ? '表の画像' : '画像'}>
            <ImageInput value={e.image} onChange={(v) => set('image', v)} maxSize={e.type === 'board' ? 1600 : 768} />
          </Field>
        )}
        {(e.type === 'card' || e.type === 'tile' || e.type === 'deck') && (
          <Field label="裏の画像">
            <ImageInput value={e.backImage} onChange={(v) => set('backImage', v)} />
          </Field>
        )}
        {['card', 'tile', 'text', 'button'].includes(e.type) && (
          <Field label="文字サイズ">
            <NumberInput value={e.fontSize} min={6} max={200} allowEmpty onChange={(v) => set('fontSize', v)} />
          </Field>
        )}
        {isPieceLike && (
          <Field label="形">
            <Select
              value={(e.shape || 'circle') as PieceShape}
              onChange={(v) => set('shape', v)}
              options={
                e.type === 'tile'
                  ? [
                      { value: 'square', label: '四角' },
                      { value: 'hexagon', label: '六角形' },
                    ]
                  : PIECE_SHAPES
              }
            />
          </Field>
        )}
        {(e.type === 'piece' || e.type === 'token') && (
          <Check checked={!!e.twoSided} onChange={(v) => set('twoSided', v)} label="両面駒（裏返せる）" />
        )}
        {canFlip(e) && <Check checked={e.faceUp} onChange={(v) => set('faceUp', v)} label="表向きで置く" />}
        {e.type === 'dice' && (
          <Field label="表示">
            <Select
              value={e.diceStyle || 'number'}
              onChange={(v) => set('diceStyle', v)}
              options={[
                { value: 'pips', label: '目（●）' },
                { value: 'number', label: '数字・文字' },
              ]}
            />
          </Field>
        )}
      </Section>

      {hasFaces && <FacesEditor e={e} set={set} />}
      {e.type === 'board' && <BoardSettings e={e} />}
      {e.type === 'counter' && (
        <Section title="カウンター">
          <Field label="初期値">
            <NumberInput value={e.count ?? 0} onChange={(v) => set('count', v ?? 0)} />
          </Field>
          <div className="grid2">
            <Field label="最小">
              <NumberInput value={e.min} allowEmpty onChange={(v) => set('min', v)} />
            </Field>
            <Field label="最大">
              <NumberInput value={e.max} allowEmpty onChange={(v) => set('max', v)} />
            </Field>
          </div>
          <Field label="増減幅">
            <NumberInput value={e.step ?? 1} min={1} onChange={(v) => set('step', v ?? 1)} />
          </Field>
        </Section>
      )}
      {e.type === 'timer' && (
        <Section title="タイマー">
          <Field label="秒数">
            <NumberInput value={e.seconds ?? 60} min={1} onChange={(v) => set('seconds', v ?? 60)} />
          </Field>
        </Section>
      )}
      {isContainer(e) || e.type === 'zone' ? <ContainerSettings e={e} /> : null}
      <PropsEditor e={e} />
    </div>
  );
}

function Summary({ game }: { game: GameDefinition }) {
  const all = Object.values(game.entities);
  const counts = new Map<string, number>();
  for (const e of all) counts.set(TYPE_LABELS[e.type], (counts.get(TYPE_LABELS[e.type]) || 0) + 1);
  return (
    <div className="summary">
      <h4>このゲームの部品</h4>
      {counts.size === 0 && <p className="muted">まだありません</p>}
      <ul>
        {[...counts].map(([k, v]) => (
          <li key={k}>
            {k}：{v}
          </li>
        ))}
      </ul>
      <p className="muted">ルール：{game.rules.length}件</p>
    </div>
  );
}

function FacesEditor({ e, set }: { e: Entity; set: <K extends keyof Entity>(k: K, v: Entity[K]) => void }) {
  const [text, setText] = useState((e.faces || []).join('\n'));
  const apply = (faces: string[]) => {
    setText(faces.join('\n'));
    set('faces', faces);
    set('value', 0);
  };
  return (
    <Section title={e.type === 'dice' ? 'ダイスの面' : 'ルーレットの区画'}>
      <Field label="面（1行に1つ）" hint="数字の面は、ルールで数値として使えます">
        <textarea
          rows={6}
          value={text}
          onChange={(ev) => {
            setText(ev.target.value);
            const faces = ev.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
            if (faces.length) set('faces', faces);
            if ((e.value ?? 0) >= faces.length) set('value', 0);
          }}
        />
      </Field>
      <div className="row gap wrap">
        {[2, 4, 6, 8, 10, 12, 20].map((n) => (
          <button key={n} onClick={() => apply(Array.from({ length: n }, (_, i) => String(i + 1)))}>
            1〜{n}
          </button>
        ))}
      </div>
    </Section>
  );
}

function linesOf(arr: string[] | undefined): string {
  return (arr || []).join('\n');
}

function BoardSettings({ e }: { e: Entity }) {
  const update = useEditor((s) => s.update);
  const g = e.grid || defaultGrid({ kind: 'none' });
  const setGrid = (patch: Partial<typeof g>, key: string) =>
    update((game) => {
      const t = game.entities[e.id];
      t.grid = { ...(t.grid || defaultGrid({ kind: 'none' })), ...patch };
    }, `${e.id}.grid.${key}`);
  return (
    <Section title="マス目">
      <Field label="種類">
        <Select<GridKind>
          value={g.kind}
          onChange={(v) => setGrid({ kind: v }, 'kind')}
          options={[
            { value: 'none', label: 'なし（自由）' },
            { value: 'square', label: '正方形マス' },
            { value: 'hex', label: '六角マス' },
            { value: 'intersection', label: '交点（碁盤）' },
            { value: 'track', label: 'トラック（すごろく）' },
          ]}
        />
      </Field>
      {g.kind !== 'none' && (
        <>
          <div className="grid2">
            <Field label="横の数">
              <NumberInput value={g.cols} min={1} max={60} onChange={(v) => setGrid({ cols: v ?? 1 }, 'cols')} />
            </Field>
            <Field label="縦の数">
              <NumberInput value={g.rows} min={1} max={60} onChange={(v) => setGrid({ rows: v ?? 1 }, 'rows')} />
            </Field>
          </div>
          {g.kind === 'track' && (
            <>
              <Field label="トラックの形">
                <Select
                  value={g.trackShape || 'loop'}
                  onChange={(v) => setGrid({ trackShape: v }, 'shape')}
                  options={[
                    { value: 'loop', label: '外周をぐるっと（周回）' },
                    { value: 'snake', label: '蛇行（スタート→ゴール）' },
                  ]}
                />
              </Field>
              {g.trackShape === 'snake' && (
                <Field label="マスの数">
                  <NumberInput
                    value={g.trackLength ?? g.cols * g.rows}
                    min={1}
                    max={g.cols * g.rows}
                    onChange={(v) => setGrid({ trackLength: v }, 'len')}
                  />
                </Field>
              )}
            </>
          )}
          <Field label="余白">
            <NumberInput value={g.margin} min={0} onChange={(v) => setGrid({ margin: v ?? 0 }, 'margin')} />
          </Field>
          <Field label="線の色">
            <ColorInput value={g.lineColor} onChange={(v) => setGrid({ lineColor: v }, 'line')} />
          </Field>
          <Check checked={!!g.checker} onChange={(v) => setGrid({ checker: v }, 'checker')} label="市松模様（色と第2色）" />
          <Check checked={g.snap} onChange={(v) => setGrid({ snap: v }, 'snap')} label="駒をマスに吸着させる" />
          <Check checked={!!g.showIndex} onChange={(v) => setGrid({ showIndex: v }, 'idx')} label="マス番号を表示" />
          <Field label="マスの名前（1行に1マス）" hint="1行目がマス1。ルールの条件ではマス番号を使います">
            <textarea
              rows={5}
              value={linesOf(g.labels)}
              onChange={(ev) => setGrid({ labels: ev.target.value.split('\n') }, 'labels')}
              placeholder={'スタート\n\n3マス進む\n...'}
            />
          </Field>
          <Field label="マスの色（1行に1マス）" hint="空行は既定の色。例：#ff8888">
            <textarea
              rows={3}
              value={linesOf(g.cellColors)}
              onChange={(ev) => setGrid({ cellColors: ev.target.value.split('\n').map((s) => s.trim()) }, 'colors')}
              placeholder={'#ffcccc\n\n#ccffcc'}
            />
          </Field>
        </>
      )}
    </Section>
  );
}

/** 一括入力の1行をカードに変換：テキスト,枚数,色,key=val;key=val */
function parseBulk(text: string): CardSpec[] {
  const specs: CardSpec[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const [t, countStr, color, propStr] = line.split(',').map((s) => s?.trim());
    const count = Math.max(1, Math.min(200, Number(countStr) || 1));
    const props: Record<string, string | number> = {};
    for (const kv of (propStr || '').split(';')) {
      const [k, v] = kv.split('=').map((s) => s?.trim());
      if (k) props[k] = v !== undefined && v !== '' && !isNaN(Number(v)) ? Number(v) : (v ?? '');
    }
    for (let i = 0; i < count; i++)
      specs.push({ name: t.replace(/\\n/g, ' '), text: t.replace(/\\n/g, '\n'), color: color || undefined, props });
  }
  return specs;
}

function ContainerSettings({ e }: { e: Entity }) {
  const game = useEditor((s) => s.game)!;
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const kids = (e.children || []).map((id) => game.entities[id]).filter(Boolean);
  const isDeckLike = e.type === 'deck' || e.type === 'zone';

  const addCards = (specs: CardSpec[]) =>
    update((g) => {
      const t = g.entities[e.id];
      const tmp = { ...t, children: [] as string[] };
      const cards = buildDeck(tmp, specs).slice(1);
      for (const c of cards) {
        c.parentId = t.id;
        c.w = t.cardW ?? (t.type === 'zone' ? 90 : t.w);
        c.h = t.cardH ?? (t.type === 'zone' ? 130 : t.h);
        c.color2 = t.type === 'deck' ? t.color2 : '#1f4e8c';
        c.faceUp = t.enterFace === 'up';
        g.entities[c.id] = c;
      }
      t.children = [...(t.children || []), ...cards.map((c) => c.id)];
    });

  return (
    <Section title={e.type === 'bag' ? '袋の中身' : e.type === 'deck' ? 'カード' : 'エリア'}>
      {e.type === 'zone' && (
        <Field label="並べ方">
          <Select<ZoneLayout>
            value={e.layout || 'free'}
            onChange={(v) => update((g) => (g.entities[e.id].layout = v))}
            options={[
              { value: 'free', label: '自由配置（範囲を示すだけ）' },
              { value: 'stack', label: '重ねる（捨て札など）' },
              { value: 'row', label: '横に並べる（場札）' },
              { value: 'grid', label: '格子状に並べる' },
            ]}
          />
        </Field>
      )}
      {(e.type !== 'zone' || e.layout !== 'free') && (
        <>
          <Field label="入れたときの向き">
            <Select<EnterFace>
              value={e.enterFace || 'keep'}
              onChange={(v) => update((g) => (g.entities[e.id].enterFace = v))}
              options={[
                { value: 'keep', label: 'そのまま' },
                { value: 'up', label: '表向きにする' },
                { value: 'down', label: '裏向きにする' },
              ]}
            />
          </Field>
          {e.type === 'zone' && (
            <Check
              checked={!!e.privateToOwner}
              onChange={(v) => update((g) => (g.entities[e.id].privateToOwner = v))}
              label="中身は所有者にしか見えない"
            />
          )}
          <div className="contents-head">
            中身：{kids.length}
            {kids.length > 0 && (
              <button
                className="link danger"
                onClick={() => {
                  if (confirm(`${e.name}の中身${kids.length}個を全て削除しますか？`))
                    update((g) => {
                      for (const k of [...(g.entities[e.id].children || [])]) deleteEntity(g, k);
                    });
                }}
              >
                全削除
              </button>
            )}
          </div>
          <ul className="contents-list">
            {kids.map((k, i) => (
              <li key={k.id} onClick={() => select(k.id)}>
                <span className="swatch" style={{ background: k.color }} />
                <span className="grow">
                  {i + 1}. {k.name || k.text}
                </span>
                <span className="muted">{k.faceUp ? '表' : '裏'}</span>
              </li>
            ))}
          </ul>
          {isDeckLike && (
            <div className="row gap wrap">
              <button onClick={() => addCards([{ name: 'カード', text: 'カード', color: '#ffffff' }])}>＋カード</button>
              <button onClick={() => setShowBulk(!showBulk)}>一括追加…</button>
              <button onClick={() => addCards(playingCardSpecs(2))}>＋トランプ54枚</button>
              <button onClick={() => addCards(numberCardSpecs(1, 10))}>＋数字1〜10</button>
            </div>
          )}
          {showBulk && isDeckLike && (
            <div className="bulk">
              <p className="muted small">
                1行に1種類：<code>文字,枚数,色,プロパティ</code>
                <br />
                例：<code>炎の剣,2,#ffdddd,攻撃=3;種類=武器</code>
                <br />
                改行したい場合は <code>\n</code>
              </p>
              <textarea rows={6} value={bulk} onChange={(ev) => setBulk(ev.target.value)} placeholder={'スライム,4,#ccffcc,HP=3\nドラゴン,1,#ffcccc,HP=20'} />
              <button
                className="primary"
                onClick={() => {
                  const specs = parseBulk(bulk);
                  if (!specs.length) return;
                  addCards(specs);
                  setBulk('');
                  setShowBulk(false);
                }}
              >
                追加する
              </button>
            </div>
          )}
          {e.type === 'bag' && <BagAdder e={e} />}
          <p className="muted small">テーブル上のカードや駒をこの上にドラッグしても入れられます。</p>
        </>
      )}
    </Section>
  );
}

function BagAdder({ e }: { e: Entity }) {
  const update = useEditor((s) => s.update);
  const [shape, setShape] = useState<PieceShape>('cube');
  const [color, setColor] = useState('#e74c3c');
  const [count, setCount] = useState(5);
  const [name, setName] = useState('キューブ');
  return (
    <div className="bulk">
      <div className="grid2">
        <Field label="名前">
          <TextInput value={name} onChange={setName} />
        </Field>
        <Field label="形">
          <Select value={shape} onChange={setShape} options={PIECE_SHAPES} />
        </Field>
        <Field label="色">
          <ColorInput value={color} onChange={setColor} />
        </Field>
        <Field label="個数">
          <NumberInput value={count} min={1} max={200} onChange={(v) => setCount(v ?? 1)} />
        </Field>
      </div>
      <button
        onClick={() =>
          update((g) => {
            const t = g.entities[e.id];
            const list = Array.from({ length: count }, () =>
              makeEntity('piece', { name, shape, color, w: shape === 'cube' ? 28 : 40, h: shape === 'cube' ? 28 : 40, parentId: t.id }),
            );
            addEntities(g, list);
            t.children = [...(t.children || []), ...list.map((p) => p.id)];
          })
        }
      >
        ＋袋に入れる
      </button>
    </div>
  );
}

function PropsEditor({ e }: { e: Entity }) {
  const update = useEditor((s) => s.update);
  const entries = Object.entries(e.props);
  const setProps = (props: Record<string, string | number>, key: string) =>
    update((g) => (g.entities[e.id].props = props), `${e.id}.props.${key}`);
  return (
    <Section title="プロパティ（ルール用の値）" defaultOpen={entries.length > 0}>
      <p className="muted small">例：攻撃力=3、色=赤。ルールの条件「イベント対象のプロパティ」で参照できます。</p>
      {entries.map(([k, v], i) => (
        <div className="prop-row" key={i}>
          <input
            value={k}
            onChange={(ev) => {
              const next = Object.fromEntries(entries.map(([kk, vv], j) => (j === i ? [ev.target.value, vv] : [kk, vv])));
              setProps(next, 'k' + i);
            }}
          />
          <input
            value={String(v)}
            onChange={(ev) => {
              const raw = ev.target.value;
              const val = raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
              setProps({ ...e.props, [k]: val }, 'v' + i);
            }}
          />
          <button
            className="mini"
            onClick={() => {
              const next = { ...e.props };
              delete next[k];
              setProps(next, 'del');
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => {
          let n = 1;
          while (`prop${n}` in e.props) n++;
          setProps({ ...e.props, [`prop${n}`]: 0 }, 'add');
        }}
      >
        ＋プロパティ
      </button>
    </Section>
  );
}


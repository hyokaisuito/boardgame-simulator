import { uid } from '../model';
import type { VariableDef } from '../types';
import { Check, ColorInput, Field, ImageInput, NumberInput, TextInput } from '../ui/fields';
import { useEditor } from './store';

function VarList({ scope }: { scope: 'playerVars' | 'globalVars' }) {
  const game = useEditor((s) => s.game)!;
  const update = useEditor((s) => s.update);
  const list = game[scope];
  const setVar = (i: number, v: VariableDef, key: string) => update((g) => (g[scope][i] = v), `${scope}.${i}.${key}`);
  return (
    <div className="var-list">
      {list.map((v, i) => (
        <div className="var-row" key={v.id}>
          <input value={v.name} onChange={(e) => setVar(i, { ...v, name: e.target.value }, 'name')} placeholder="変数名" />
          <span className="muted small">初期値</span>
          <NumberInput value={v.initial} onChange={(n) => setVar(i, { ...v, initial: n ?? 0 }, 'init')} />
          <button
            className="mini danger"
            onClick={() => {
              if (confirm(`変数「${v.name}」を削除しますか？（ルールで使っている場合は動かなくなります）`))
                update((g) => g[scope].splice(i, 1));
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => update((g) => g[scope].push({ id: uid('v_'), name: scope === 'playerVars' ? 'お金' : '共通値', initial: 0 }))}>
        ＋変数を追加
      </button>
    </div>
  );
}

export function GameSettings() {
  const game = useEditor((s) => s.game)!;
  const update = useEditor((s) => s.update);
  const p = game.players;
  return (
    <div className="settings">
      <section className="card-section">
        <h3>ゲーム情報</h3>
        <Field label="ゲーム名">
          <TextInput value={game.name} onChange={(v) => update((g) => (g.name = v), 'name')} />
        </Field>
        <Field label="説明・遊び方">
          <TextInput value={game.description} multiline rows={5} onChange={(v) => update((g) => (g.description = v), 'desc')} />
        </Field>
      </section>

      <section className="card-section">
        <h3>テーブル</h3>
        <div className="grid2">
          <Field label="幅">
            <NumberInput value={game.table.width} min={400} max={10000} onChange={(v) => update((g) => (g.table.width = v ?? 1600), 'tw')} />
          </Field>
          <Field label="高さ">
            <NumberInput value={game.table.height} min={300} max={10000} onChange={(v) => update((g) => (g.table.height = v ?? 1000), 'th')} />
          </Field>
        </div>
        <Field label="色">
          <ColorInput value={game.table.color} onChange={(v) => update((g) => (g.table.color = v), 'tc')} />
        </Field>
        <Field label="画像">
          <ImageInput value={game.table.image} maxSize={2000} onChange={(v) => update((g) => (g.table.image = v))} />
        </Field>
      </section>

      <section className="card-section">
        <h3>プレイヤー</h3>
        <div className="grid3">
          <Field label="最少人数">
            <NumberInput value={p.min} min={1} max={8} onChange={(v) => update((g) => (g.players.min = Math.min(v ?? 1, g.players.max)), 'pmin')} />
          </Field>
          <Field label="最多人数">
            <NumberInput value={p.max} min={1} max={8} onChange={(v) => update((g) => (g.players.max = Math.max(v ?? 1, g.players.min)), 'pmax')} />
          </Field>
          <Field label="標準人数">
            <NumberInput
              value={p.defaultCount}
              min={p.min}
              max={p.max}
              onChange={(v) => update((g) => (g.players.defaultCount = v ?? g.players.min), 'pdef')}
            />
          </Field>
        </div>
        <div className="player-list">
          {Array.from({ length: p.max }, (_, i) => (
            <div className="var-row" key={i}>
              <input
                type="color"
                value={p.colors[i] || '#888888'}
                onChange={(e) => update((g) => (g.players.colors[i] = e.target.value), `pc${i}`)}
              />
              <input value={p.names[i] || ''} onChange={(e) => update((g) => (g.players.names[i] = e.target.value), `pn${i}`)} />
            </div>
          ))}
        </div>
        <Check
          checked={p.hideOnSwitch}
          onChange={(v) => update((g) => (g.players.hideOnSwitch = v))}
          label="手番交代のときに画面を隠す（手札を他の人に見せない）"
        />
      </section>

      <section className="card-section">
        <h3>プレイヤー変数</h3>
        <p className="muted small">各プレイヤーが個別に持つ数値（得点・お金・HPなど）。プレイ画面に表示され、ルールで増減できます。</p>
        <VarList scope="playerVars" />
      </section>

      <section className="card-section">
        <h3>共通変数</h3>
        <p className="muted small">全員で共有する数値（ラウンド数・場の状態など）。</p>
        <VarList scope="globalVars" />
      </section>

      <section className="card-section">
        <h3>フェーズ</h3>
        <p className="muted small">手番の中の段階（例：ドロー → メイン → 終了）。手番が始まると最初のフェーズになります。空なら使いません。</p>
        {game.phases.map((ph, i) => (
          <div className="var-row" key={i}>
            <span className="step-no">{i + 1}</span>
            <input value={ph} onChange={(e) => update((g) => (g.phases[i] = e.target.value), `ph${i}`)} />
            <button className="mini danger" onClick={() => update((g) => g.phases.splice(i, 1))}>
              ✕
            </button>
          </div>
        ))}
        <button onClick={() => update((g) => g.phases.push(`フェーズ${g.phases.length + 1}`))}>＋フェーズを追加</button>
      </section>
    </div>
  );
}

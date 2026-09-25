import { useEffect, useRef, useState } from 'react';
import { newGame, uid } from './model';
import { SAMPLES } from './samples';
import { deleteGame, exportGameFile, listGames, loadGame, readGameFile, saveGame, type GameSummary } from './storage';

export function Home({ onEdit, onPlay }: { onEdit: (id: string) => void; onPlay: (id: string) => void }) {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listGames()
      .then(setGames)
      .catch((e) => {
        console.error(e);
        setError('ブラウザの保存領域（IndexedDB）にアクセスできません。プライベートブラウズでは保存できない場合があります。');
        setGames([]);
      });

  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    const g = newGame();
    await saveGame(g);
    onEdit(g.id);
  };

  const fromSample = async (make: () => ReturnType<typeof newGame>) => {
    const g = make();
    await saveGame(g);
    onEdit(g.id);
  };

  return (
    <div className="home">
      <header className="home-header">
        <h1>🎲 ボードゲーム工房</h1>
        <p>部品を並べて、ルールをノーコードで設定して、すぐにテストプレイ。</p>
      </header>

      {error && <div className="error-box">{error}</div>}

      <section>
        <div className="section-head">
          <h2>マイゲーム</h2>
          <div className="row gap">
            <button className="primary" onClick={create}>
              ＋ 新しいゲームを作る
            </button>
            <button onClick={() => fileRef.current?.click()}>⬆ ファイルから読み込む</button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const g = await readGameFile(f);
                  // 同じIDがあれば別のゲームとして取り込む
                  if (await loadGame(g.id)) g.id = uid('g_');
                  await saveGame(g);
                  refresh();
                } catch (err) {
                  alert(`読み込みに失敗しました：${(err as Error).message}`);
                }
              }}
            />
          </div>
        </div>
        {games === null ? (
          <p className="muted">読み込み中…</p>
        ) : games.length === 0 ? (
          <div className="empty-games">
            まだゲームがありません。「新しいゲームを作る」か、下のサンプルから始めましょう。
          </div>
        ) : (
          <div className="game-grid">
            {games.map((g) => (
              <div key={g.id} className="game-card">
                <div className="game-card-body" onClick={() => onEdit(g.id)}>
                  <h3>{g.name || '(無題)'}</h3>
                  <p className="desc">{g.description || '説明なし'}</p>
                  <p className="muted small">
                    部品 {g.entityCount} ・ ルール {g.ruleCount} ・ 更新 {new Date(g.updatedAt).toLocaleString('ja-JP')}
                  </p>
                </div>
                <div className="game-card-actions">
                  <button onClick={() => onEdit(g.id)}>✏ 編集</button>
                  <button className="primary" onClick={() => onPlay(g.id)}>
                    ▶ プレイ
                  </button>
                  <button
                    title="複製"
                    onClick={async () => {
                      const src = await loadGame(g.id);
                      if (!src) return;
                      const now = Date.now();
                      await saveGame({ ...src, id: uid('g_'), name: `${src.name}のコピー`, createdAt: now, updatedAt: now });
                      refresh();
                    }}
                  >
                    ⧉
                  </button>
                  <button
                    title="ファイルに書き出す"
                    onClick={async () => {
                      const src = await loadGame(g.id);
                      if (src) exportGameFile(src);
                    }}
                  >
                    ⬇
                  </button>
                  <button
                    className="danger"
                    title="削除"
                    onClick={async () => {
                      if (!confirm(`「${g.name}」を削除しますか？この操作は取り消せません。`)) return;
                      await deleteGame(g.id);
                      refresh();
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>サンプルから始める</h2>
        <div className="sample-grid">
          {SAMPLES.map((s) => (
            <button key={s.key} className="sample-card" onClick={() => fromSample(s.make)}>
              <span className="sample-icon">{s.icon}</span>
              <span className="sample-name">{s.name}</span>
              <span className="muted small">{s.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <footer className="home-footer muted small">
        作ったゲームはこのブラウザに自動保存されます。別の端末で使う・人に渡すときは「書き出し」したファイルを「読み込む」してください。
      </footer>
    </div>
  );
}

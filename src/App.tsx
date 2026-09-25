import { useEffect, useState } from 'react';
import { Editor } from './editor/Editor';
import { useEditor } from './editor/store';
import { Home } from './Home';
import { PlayView } from './play/PlayView';
import { loadGame } from './storage';
import type { GameDefinition } from './types';

type Route = { page: 'home' } | { page: 'edit'; id: string } | { page: 'play'; id: string; from: 'edit' | 'home' };

function parseHash(): Route {
  const m = /^#\/(edit|play)\/([\w-]+)(?:\?from=(edit|home))?/.exec(location.hash);
  if (!m) return { page: 'home' };
  if (m[1] === 'edit') return { page: 'edit', id: m[2] };
  return { page: 'play', id: m[2], from: (m[3] as 'edit' | 'home') || 'home' };
}

function toHash(r: Route): string {
  if (r.page === 'home') return '#/';
  if (r.page === 'edit') return `#/edit/${r.id}`;
  return `#/play/${r.id}?from=${r.from}`;
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [playDef, setPlayDef] = useState<GameDefinition | null>(null);
  const [error, setError] = useState('');
  const game = useEditor((s) => s.game);

  const go = (r: Route) => {
    location.hash = toHash(r);
  };

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // ページに応じてゲームを読み込む
  useEffect(() => {
    setError('');
    if (route.page === 'edit') {
      if (useEditor.getState().game?.id === route.id) return;
      loadGame(route.id).then((g) => {
        if (g) useEditor.getState().setGame(g);
        else setError('ゲームが見つかりませんでした');
      });
    } else if (route.page === 'play') {
      const cur = useEditor.getState().game;
      if (cur?.id === route.id) setPlayDef(cur);
      else
        loadGame(route.id).then((g) => {
          if (g) setPlayDef(g);
          else setError('ゲームが見つかりませんでした');
        });
    } else {
      useEditor.getState().setGame(null);
      setPlayDef(null);
    }
  }, [route]);

  if (error)
    return (
      <div className="home">
        <div className="error-box">{error}</div>
        <button onClick={() => go({ page: 'home' })}>ホームへ</button>
      </div>
    );

  if (route.page === 'edit') {
    if (!game || game.id !== route.id) return <div className="loading">読み込み中…</div>;
    return <Editor onBack={() => go({ page: 'home' })} onPlay={() => go({ page: 'play', id: route.id, from: 'edit' })} />;
  }
  if (route.page === 'play') {
    if (!playDef || playDef.id !== route.id) return <div className="loading">読み込み中…</div>;
    return (
      <PlayView
        def={playDef}
        exitLabel={route.from === 'edit' ? '← 編集に戻る' : '← ホーム'}
        onExit={() => go(route.from === 'edit' ? { page: 'edit', id: route.id } : { page: 'home' })}
      />
    );
  }
  return <Home onEdit={(id) => go({ page: 'edit', id })} onPlay={(id) => go({ page: 'play', id, from: 'home' })} />;
}

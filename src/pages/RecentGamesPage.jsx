import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Trophy, RotateCcw, BarChart3, Search, Clock, Award } from 'lucide-react';
import { gameStore } from '../services/storage/gameStore';

export function RecentGamesPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadGames() {
      try {
        const stored = await gameStore.getRecentGames(30);
        setGames(stored || []);
      } catch (e) {
        console.warn('Failed to load games from storage', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadGames();
  }, []);

  const handleLaunchReview = (game) => {
    navigate(`/review?id=${game.id}`, {
      state: {
        pgn: game.pgn,
        moves: game.moves || [],
        playerColor: game.playerColor || 'w',
        whiteName: game.playerColor === 'w' ? 'You' : game.opponent,
        blackName: game.playerColor === 'b' ? 'You' : game.opponent,
        result: game.result
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-canvas-border">
        <div>
          <h1 className="text-2xl font-extrabold text-ivory flex items-center gap-2">
            <History className="w-6 h-6 text-accent-400" />
            <span>Recent Completed Games</span>
          </h1>
          <p className="text-xs text-ivory-muted">
            Stored locally in your browser &bull; Revisit any game anytime without an account
          </p>
        </div>

        <button
          onClick={() => navigate('/computer')}
          className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
        >
          Play New Game
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-ivory-muted text-xs">
          Loading game archives...
        </div>
      ) : games.length === 0 ? (
        <div className="bg-canvas-card border border-canvas-border rounded-2xl p-12 text-center max-w-md mx-auto space-y-4">
          <History className="w-12 h-12 text-ivory-faint mx-auto" />
          <h2 className="text-base font-bold text-ivory">No Games Played Yet</h2>
          <p className="text-xs text-ivory-muted leading-relaxed">
            Play a game against Stockfish or challenge a friend to start building your game review library.
          </p>
          <button
            onClick={() => navigate('/computer')}
            className="px-5 py-2.5 bg-accent-600 hover:bg-accent-500 text-white text-xs font-bold rounded-xl transition-colors shadow-md"
          >
            Start Playing
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {games.map((g) => {
            const isWinner = (g.result?.winner === 'white' && g.playerColor === 'w') ||
                             (g.result?.winner === 'black' && g.playerColor === 'b');
            const isDraw = g.result?.winner === 'draw';

            return (
              <div
                key={g.id}
                className="bg-canvas-card border border-canvas-border hover:border-canvas-hover rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 transition-all shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isDraw
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : isWinner
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}
                  >
                    {isDraw ? <Award className="w-5 h-5" /> : <Trophy className="w-5 h-5" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-ivory">{g.opponent}</span>
                      <span className="text-xs text-ivory-muted">
                        ({g.playerColor === 'w' ? 'White' : 'Black'})
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-ivory-muted mt-0.5">
                      {g.opening && (
                        <span className="text-purple-300 font-medium">
                          {g.eco ? `[${g.eco}] ` : ''}{g.opening}
                        </span>
                      )}
                      <span>&bull;</span>
                      <span>{g.movesCount || 0} moves</span>
                      <span>&bull;</span>
                      <span>{new Date(g.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleLaunchReview(g)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-600/30 hover:bg-accent-600 text-accent-200 hover:text-white border border-accent-500/40 rounded-lg text-xs font-semibold transition-all"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>Review Game</span>
                  </button>

                  <button
                    onClick={() => navigate('/analysis', { state: { pgn: g.pgn } })}
                    className="p-1.5 rounded-lg bg-canvas hover:bg-canvas-hover border border-canvas-border text-ivory-muted hover:text-white transition-colors"
                    title="Open in Analysis"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


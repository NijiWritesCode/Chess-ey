// Game Card Component for Recent Games List
// Renders individual game item with outcome, players, move count, timestamps, and quick action buttons.

import React from 'react';
import { Calendar, Clock, Award, Trash2, ArrowRight, Download, BarChart2 } from 'lucide-react';

export default function GameCard({
  game,
  onReview = () => {},
  onDelete = () => {},
  className = ''
}) {
  if (!game) return null;

  const dateStr = game.timestamp
    ? new Date(game.timestamp).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : 'Unknown Date';

  const timeStr = game.timestamp
    ? new Date(game.timestamp).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      })
    : '';

  const whitePlayer = game.players?.white?.name || 'White';
  const blackPlayer = game.players?.black?.name || 'Black';
  const totalMoves = game.moves?.length || 0;
  const movePairs = Math.ceil(totalMoves / 2);

  const winner = game.result?.winner; // 'w' | 'b' | null
  const pgnResult = game.result?.pgnResult || (winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2');

  const copyOrDownloadPgn = (e) => {
    e.stopPropagation();
    if (!game.pgn) return;
    const blob = new Blob([game.pgn], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chessey_game_${game.id || 'export'}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getModeLabel = (mode) => {
    switch (mode) {
      case 'computer':
        return 'vs Stockfish';
      case 'multiplayer':
        return 'Online Match';
      case 'analysis':
        return 'Analysis Board';
      default:
        return 'Pass & Play';
    }
  };

  return (
    <div
      onClick={() => onReview(game.id)}
      className={`group relative bg-slate-900/90 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-cyan-950/20 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left Info: Mode & Date */}
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium text-[11px]">
            {getModeLabel(game.gameMode)}
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            {dateStr} {timeStr && `• ${timeStr}`}
          </span>
        </div>

        {/* Right Info: Outcome badge */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
            {pgnResult}
          </span>
        </div>
      </div>

      {/* Players Section */}
      <div className="mt-3.5 grid grid-cols-2 gap-3 items-center">
        {/* White Player */}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-slate-200 border border-slate-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${winner === 'w' ? 'text-emerald-400' : 'text-slate-200'}`}>
              {whitePlayer}
            </p>
            {winner === 'w' && <span className="text-[10px] text-emerald-400/80 font-medium">Winner</span>}
          </div>
        </div>

        {/* Black Player */}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-slate-700 border border-slate-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${winner === 'b' ? 'text-emerald-400' : 'text-slate-200'}`}>
              {blackPlayer}
            </p>
            {winner === 'b' && <span className="text-[10px] text-emerald-400/80 font-medium">Winner</span>}
          </div>
        </div>
      </div>

      {/* Details & Action Footer */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span>{movePairs} {movePairs === 1 ? 'move' : 'moves'}</span>
          {game.review?.whiteAccuracy !== undefined && (
            <span className="text-cyan-400 font-medium flex items-center gap-1">
              <Award className="w-3.5 h-3.5" />
              Reviewed
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copyOrDownloadPgn}
            title="Download PGN"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(game.id);
            }}
            title="Delete from history"
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onReview(game.id)}
            className="ml-1 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold transition-colors"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Review
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}

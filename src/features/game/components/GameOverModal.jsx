import React from 'react';
import { Trophy, Award, RotateCcw, Search, X, Play } from 'lucide-react';

/**
 * GameOverModal announces match conclusion (checkmate, resignation, timeout, draws)
 * with direct actions for rematch and game review/analysis.
 */
export function GameOverModal({
  isOpen,
  result,
  playerColor = 'w',
  whiteName = 'White',
  blackName = 'Black',
  whiteAccuracy = null,
  blackAccuracy = null,
  onStartReview,
  onNewGame,
  onRematch,
  onOpenAnalysis,
  onClose
}) {
  if (!isOpen || !result) return null;

  const { winner, reason } = result;

  const isPlayerWinner =
    (winner === 'white' && playerColor === 'w') ||
    (winner === 'black' && playerColor === 'b');
  const isDraw = winner === 'draw';

  let title = 'Game Finished';
  let subtitle = '';

  if (isDraw) {
    title = 'Match Drawn';
    subtitle =
      reason === 'stalemate'
        ? 'Drawn by stalemate: no legal moves available.'
        : reason === 'insufficient'
        ? 'Drawn by insufficient mating material.'
        : reason === 'threefold'
        ? 'Drawn by threefold repetition.'
        : reason === 'fifty-move'
        ? 'Drawn by the fifty-move rule.'
        : 'Drawn by mutual agreement.';
  } else if (isPlayerWinner) {
    title = 'Victory!';
    subtitle =
      reason === 'checkmate'
        ? 'Flawless checkmate executed!'
        : reason === 'timeout'
        ? 'Opponent ran out of time.'
        : reason === 'resignation'
        ? 'Opponent conceded the game.'
        : 'You won the match!';
  } else {
    title = 'Defeat';
    subtitle =
      reason === 'checkmate'
        ? 'Checkmated on the board.'
        : reason === 'timeout'
        ? 'Time elapsed.'
        : reason === 'resignation'
        ? 'Game resigned.'
        : 'Opponent claimed victory.';
  }

  const handleRestart = onRematch || onNewGame;
  const handleReview = onStartReview || onOpenAnalysis;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="bg-canvas-card border border-canvas-border rounded-2xl max-w-md w-full p-6 shadow-2xl text-center relative overflow-hidden">
        {/* Close icon */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-ivory-muted hover:text-white rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Decorative badge */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center border shadow-lg bg-canvas-subtle">
          {isDraw ? (
            <Award className="w-8 h-8 text-amber-400" />
          ) : isPlayerWinner ? (
            <Trophy className="w-8 h-8 text-emerald-400" />
          ) : (
            <Trophy className="w-8 h-8 text-red-400" />
          )}
        </div>

        <h2 className="text-2xl font-bold text-ivory mb-1">{title}</h2>
        <p className="text-sm text-ivory-muted mb-6">{subtitle}</p>

        {/* Accuracies display if provided */}
        {(whiteAccuracy !== null || blackAccuracy !== null) && (
          <div className="grid grid-cols-2 gap-3 bg-canvas-subtle border border-canvas-border rounded-xl p-3 mb-6">
            <div className="text-center">
              <span className="text-xs text-ivory-muted block">{whiteName}</span>
              <span className="text-lg font-mono font-bold text-accent-300">
                {whiteAccuracy !== null ? `${whiteAccuracy}%` : '--'}
              </span>
              <span className="text-[10px] text-ivory-faint block uppercase">Accuracy</span>
            </div>
            <div className="text-center">
              <span className="text-xs text-ivory-muted block">{blackName}</span>
              <span className="text-lg font-mono font-bold text-accent-300">
                {blackAccuracy !== null ? `${blackAccuracy}%` : '--'}
              </span>
              <span className="text-[10px] text-ivory-faint block uppercase">Accuracy</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {handleRestart && (
            <button
              onClick={handleRestart}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-accent-600 hover:bg-accent-500 text-white font-bold transition-all shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Play Again</span>
            </button>
          )}

          {handleReview && (
            <button
              onClick={handleReview}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory font-semibold transition-colors"
            >
              <Search className="w-4 h-4 text-accent-400" />
              <span>Review / Analyze Game</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default GameOverModal;

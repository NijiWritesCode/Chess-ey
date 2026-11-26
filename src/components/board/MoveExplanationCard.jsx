import React from 'react';
import { MoveClassificationBadge } from './MoveClassificationBadge';
import { Lightbulb, ArrowRight, Play } from 'lucide-react';

export function MoveExplanationCard({
  selectedMove, // analyzed move object
  onPlaySuggestedLine = null
}) {
  if (!selectedMove) {
    return (
      <div className="bg-canvas-card border border-canvas-border rounded-xl p-4 text-center">
        <p className="text-xs text-ivory-muted">Select a move to inspect engine analysis and tactical notes.</p>
      </div>
    );
  }

  const {
    moveNumber,
    turn,
    san,
    classification,
    bestMoveSan,
    explanation,
    cpLoss,
    pv = []
  } = selectedMove;

  const player = turn === 'w' ? 'White' : 'Black';
  const hasSuggestedLine = (bestMoveSan || pv.length > 0) && onPlaySuggestedLine;

  return (
    <div className="bg-canvas-card border border-canvas-border rounded-xl p-4 space-y-3 shadow-lg">
      {/* Top: Move & Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-bold text-white">
            {moveNumber}.{turn === 'b' ? '..' : ''} {san}
          </span>
          <span className="text-xs text-ivory-muted">({player})</span>
        </div>

        {classification && (
          <MoveClassificationBadge classification={classification} size="md" />
        )}
      </div>

      {/* Explanation text */}
      <p className="text-sm text-ivory leading-relaxed font-sans">
        {explanation || classification?.description || 'Move analyzed by Stockfish.'}
      </p>

      {/* Engine Best Alternative (if not best/book) */}
      {bestMoveSan && classification?.id !== 'best' && classification?.id !== 'book' && (
        <div className="bg-canvas-subtle border border-canvas-border/80 rounded-lg p-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong className="text-ivory">Better was: </strong>
              <code className="bg-canvas px-1.5 py-0.5 rounded text-amber-300 font-mono font-bold ml-1">
                {bestMoveSan}
              </code>
            </span>
          </div>

          {cpLoss > 0 && (
            <span className="text-red-400 font-medium">
              -{(cpLoss / 100).toFixed(1)} pawns
            </span>
          )}
        </div>
      )}

      {/* Action: Play suggested continuation */}
      {hasSuggestedLine && (
        <button
          onClick={() => onPlaySuggestedLine(selectedMove)}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-accent-600/30 hover:bg-accent-600 text-accent-200 hover:text-white border border-accent-500/40 rounded-lg text-xs font-semibold transition-all"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Explore Suggested Variation</span>
        </button>
      )}
    </div>
  );
}


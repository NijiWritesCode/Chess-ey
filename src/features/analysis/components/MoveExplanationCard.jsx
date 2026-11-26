import React from 'react';
import { MoveClassificationBadge } from './MoveClassificationBadge';
import { Lightbulb, Play } from 'lucide-react';

/**
 * MoveExplanationCard displaying natural tactical insights and engine recommendations
 * for a selected move.
 */
export function MoveExplanationCard({
  selectedMove = null,
  moveData = null, // supports alias for backward compatibility
  onPlaySuggestedLine = null
}) {
  const move = selectedMove || moveData;

  if (!move) {
    return (
      <div className="bg-canvas-card border border-canvas-border rounded-xl p-4 text-center">
        <p className="text-xs text-ivory-muted">
          Select a move to inspect engine analysis and tactical notes.
        </p>
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
  } = move;

  const player = turn === 'w' ? 'White' : 'Black';
  const hasSuggestedLine = (bestMoveSan || pv.length > 0) && onPlaySuggestedLine;

  const explanationText =
    typeof explanation === 'string'
      ? explanation
      : explanation?.summary || explanation?.text || classification?.description || 'Move analyzed by Stockfish.';

  return (
    <div className="bg-canvas-card border border-canvas-border rounded-xl p-3.5 space-y-2.5 shadow-md">
      {/* Top: Move Notation & Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-white">
            {moveNumber ? `${moveNumber}.` : ''}
            {turn === 'b' && moveNumber ? '..' : ''} {san}
          </span>
          <span className="text-[11px] text-ivory-muted">({player})</span>
        </div>

        {classification && (
          <MoveClassificationBadge classification={classification} size="sm" />
        )}
      </div>

      {/* Explanation text */}
      <p className="text-xs text-ivory leading-relaxed font-sans">
        {explanationText}
      </p>

      {/* Alternative suggestion if suboptimal */}
      {bestMoveSan && classification?.id !== 'best' && classification?.id !== 'book' && (
        <div className="bg-canvas-subtle border border-canvas-border/80 rounded-lg p-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong className="text-ivory">Better was: </strong>
              <code className="bg-canvas px-1 py-0.5 rounded text-amber-300 font-mono font-bold ml-1">
                {bestMoveSan}
              </code>
            </span>
          </div>

          {cpLoss > 0 && (
            <span className="text-red-400 font-medium text-[11px]">
              -{(cpLoss / 100).toFixed(1)} pawns
            </span>
          )}
        </div>
      )}

      {/* Suggested variation action */}
      {hasSuggestedLine && (
        <button
          onClick={() => onPlaySuggestedLine(move)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-accent-600/25 hover:bg-accent-600 text-accent-200 hover:text-white border border-accent-500/40 rounded-lg text-xs font-semibold transition-all"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Explore Suggested Variation</span>
        </button>
      )}
    </div>
  );
}

export default MoveExplanationCard;

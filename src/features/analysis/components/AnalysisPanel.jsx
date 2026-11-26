import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { formatEvaluation } from '../services/classifier';
import { MoveExplanationCard } from './MoveExplanationCard';

/**
 * AnalysisPanel consolidating engine score, depth, principal variation,
 * and move explanation into an organized sidebar widget.
 */
export function AnalysisPanel({
  evaluation = null,
  isThinking = false,
  selectedMove = null,
  onPlayPvMove = null
}) {
  const scoreText = formatEvaluation(evaluation);
  const depth = evaluation?.depth || 0;
  const pv = evaluation?.principalVariation || evaluation?.pv || [];

  return (
    <div className="flex flex-col gap-2.5">
      {/* Engine Score & Status Card */}
      <div className="bg-canvas-card border border-canvas-border rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent-400" />
            <span className="text-xs font-bold text-ivory uppercase tracking-wider">
              Stockfish Engine
            </span>
          </div>
          <div>
            {isThinking ? (
              <span className="text-[11px] text-accent-400 animate-pulse font-medium">
                Evaluating...
              </span>
            ) : (
              <span className="text-[11px] text-ivory-muted font-mono">
                Depth {depth}
              </span>
            )}
          </div>
        </div>

        {/* Score indicator */}
        <div className="flex items-baseline justify-between bg-canvas-subtle p-2.5 rounded-lg border border-canvas-border mb-2">
          <span className="text-xs text-ivory-muted font-medium">Engine Score:</span>
          <span className="text-xl font-bold font-mono text-ivory">
            {scoreText}
          </span>
        </div>

        {/* Principal Variation Line */}
        {pv.length > 0 && (
          <div>
            <span className="text-[11px] text-ivory-muted block mb-1 font-medium">
              Top Line:
            </span>
            <div className="flex flex-wrap gap-1 font-mono text-xs bg-canvas-subtle p-2 rounded-lg border border-canvas-border max-h-16 overflow-y-auto leading-relaxed">
              {pv.slice(0, 8).map((uci, idx) => (
                <button
                  key={`${uci}-${idx}`}
                  onClick={() => onPlayPvMove && onPlayPvMove(uci)}
                  className="px-1 py-0.5 rounded hover:bg-canvas-card text-accent-300 hover:text-white transition-colors"
                  title={`Play ${uci}`}
                >
                  {uci}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Selected Move Explanation */}
      {selectedMove && (
        <MoveExplanationCard selectedMove={selectedMove} />
      )}
    </div>
  );
}

export default AnalysisPanel;

import React from 'react';
import { scoreToWhiteCp, cpToWinChance, formatEvaluation } from '../services/classifier';

/**
 * Vertical Evaluation Bar displaying engine advantage visually and numerically.
 * Normalized to White's perspective, responding dynamically to board orientation.
 */
export function EvaluationBar({ evaluation, orientation = 'white', height = '100%' }) {
  if (!evaluation) {
    return (
      <div
        className="w-6 md:w-7 bg-canvas-card rounded-lg overflow-hidden flex flex-col border border-canvas-border shadow-inner"
        style={{ height }}
      >
        <div className="w-full h-1/2 bg-[#1e232a]" />
        <div className="w-full h-1/2 bg-[#f0f3f6]" />
      </div>
    );
  }

  const cp = scoreToWhiteCp(evaluation);
  const whiteWinChance = cpToWinChance(cp); // 0 to 100%

  // Invert height if orientation is 'black'
  const whitePercentage = orientation === 'white' ? whiteWinChance : 100 - whiteWinChance;
  const blackPercentage = 100 - whitePercentage;

  const scoreText = formatEvaluation(evaluation);
  const isWhiteLeading = cp >= 0;

  return (
    <div
      role="progressbar"
      aria-label={`Evaluation: ${scoreText}`}
      aria-valuenow={Math.round(whiteWinChance)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="w-6 md:w-7 bg-canvas-card rounded-lg overflow-hidden flex flex-col border border-canvas-border shadow-inner relative select-none"
      style={{ height }}
      title={`Evaluation: ${scoreText} (White: ${Math.round(whiteWinChance)}%)`}
    >
      {/* Black's portion (Dark top) */}
      <div
        className="w-full bg-[#1e232a] transition-all duration-300 ease-out flex items-start justify-center pt-1"
        style={{ height: `${blackPercentage}%` }}
      >
        {!isWhiteLeading && (
          <span className="text-[10px] font-mono font-bold text-gray-300 px-0.5 leading-tight">
            {scoreText}
          </span>
        )}
      </div>

      {/* White's portion (Light bottom) */}
      <div
        className="w-full bg-[#f0f3f6] transition-all duration-300 ease-out flex items-end justify-center pb-1"
        style={{ height: `${whitePercentage}%` }}
      >
        {isWhiteLeading && (
          <span className="text-[10px] font-mono font-bold text-gray-900 px-0.5 leading-tight">
            {scoreText}
          </span>
        )}
      </div>
    </div>
  );
}

export default EvaluationBar;

import React from 'react';
import { scoreToWhiteCp, cpToWinChance } from '../../services/analysis/classifier';

export function EvaluationBar({ evaluation, orientation = 'white', height = '100%' }) {
  if (!evaluation) {
    return (
      <div className="w-5 bg-canvas-card rounded overflow-hidden flex flex-col border border-canvas-border" style={{ height }}>
        <div className="w-full h-1/2 bg-[#30363d]" />
        <div className="w-full h-1/2 bg-[#f0f3f6]" />
      </div>
    );
  }

  const cp = scoreToWhiteCp(evaluation);
  const whiteWinChance = cpToWinChance(cp); // 0 to 100%

  // If orientation is 'black', invert height display so black is at bottom
  const whitePercentage = orientation === 'white' ? whiteWinChance : 100 - whiteWinChance;
  const blackPercentage = 100 - whitePercentage;

  let scoreText = '0.0';
  if (evaluation.mate !== undefined && evaluation.mate !== null) {
    scoreText = evaluation.mate > 0 ? `M${evaluation.mate}` : `-M${Math.abs(evaluation.mate)}`;
  } else if (evaluation.cp !== undefined) {
    scoreText = (Math.abs(evaluation.cp) / 100).toFixed(1);
    if (evaluation.cp > 0) scoreText = `+${scoreText}`;
    else if (evaluation.cp < 0) scoreText = `-${scoreText}`;
    else scoreText = '0.0';
  }

  const isWhiteLeading = cp >= 0;

  return (
    <div
      className="w-6 md:w-7 bg-canvas-card rounded-md overflow-hidden flex flex-col border border-canvas-border shadow-inner relative select-none"
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


// Review Summary Card for Game Review
// Displays player accuracies, opening identification, game result, and side-by-side move classification counts.

import React from 'react';
import { MOVE_CLASSES } from '../../analysis/services/classifier';

export default function ReviewSummaryCard({
  reviewData,
  players = { white: { name: 'White' }, black: { name: 'Black' } },
  result = null,
  className = ''
}) {
  if (!reviewData) return null;

  const whiteAcc = reviewData.whiteAccuracy ?? 100;
  const blackAcc = reviewData.blackAccuracy ?? 100;
  const whiteTally = reviewData.whiteBreakdown || {};
  const blackTally = reviewData.blackBreakdown || {};

  const rows = [
    { key: 'brilliant', label: 'Brilliant', symbol: '!!', color: '#1baaa7' },
    { key: 'great', label: 'Great', symbol: '!', color: '#5c8bb0' },
    { key: 'best', label: 'Best', symbol: '★', color: '#81b64c' },
    { key: 'excellent', label: 'Excellent', symbol: '👍', color: '#96bc4b' },
    { key: 'good', label: 'Good', symbol: '✔', color: '#86a666' },
    { key: 'book', label: 'Book', symbol: '📖', color: '#d5a47e' },
    { key: 'inaccuracy', label: 'Inaccuracies', symbol: '?!', color: '#f0c15c' },
    { key: 'mistake', label: 'Mistakes', symbol: '?', color: '#e58f2a' },
    { key: 'miss', label: 'Missed Wins', symbol: '❌', color: '#ef4444' },
    { key: 'blunder', label: 'Blunders', symbol: '??', color: '#fa412d' }
  ];

  const whiteName = players?.white?.name || 'White';
  const blackName = players?.black?.name || 'Black';

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl ${className}`}>
      {/* Accuracy Section */}
      <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-800">
        {/* White */}
        <div className="flex flex-col items-center bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
            <span className="text-xs font-semibold text-slate-200 truncate max-w-[120px]">{whiteName}</span>
          </div>
          <span className="text-3xl font-extrabold text-white tracking-tight">{whiteAcc.toFixed(1)}%</span>
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">CAPS Accuracy</span>
        </div>

        {/* Black */}
        <div className="flex flex-col items-center bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
            <span className="text-xs font-semibold text-slate-200 truncate max-w-[120px]">{blackName}</span>
          </div>
          <span className="text-3xl font-extrabold text-white tracking-tight">{blackAcc.toFixed(1)}%</span>
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">CAPS Accuracy</span>
        </div>
      </div>

      {/* Opening & Outcome */}
      {(reviewData.openingName || reviewData.eco || result) && (
        <div className="py-3 px-1 border-b border-slate-800 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400">Opening: </span>
            <span className="font-semibold text-slate-200">{reviewData.openingName || 'Standard Opening'}</span>
            {reviewData.eco && <span className="ml-1 text-slate-500 font-mono">({reviewData.eco})</span>}
          </div>
          {result && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-[11px]">
              {result.pgnResult || result.reason || 'Game Finished'}
            </span>
          )}
        </div>
      )}

      {/* Classification Breakdown Table */}
      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-2 pb-1">
          <span>{whiteName}</span>
          <span className="uppercase text-[10px] tracking-wider text-slate-500">Move Quality</span>
          <span>{blackName}</span>
        </div>

        {rows.map(({ key, label, symbol, color }) => {
          const wCount = whiteTally[key] || 0;
          const bCount = blackTally[key] || 0;
          if (wCount === 0 && bCount === 0) return null;

          return (
            <div
              key={key}
              className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-800/30 hover:bg-slate-800/60 transition-colors text-xs font-medium"
            >
              <span className={`w-6 text-left font-bold ${wCount > 0 ? 'text-white' : 'text-slate-600'}`}>
                {wCount}
              </span>

              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: color }}
                >
                  {symbol}
                </span>
                <span className="text-slate-300 font-normal">{label}</span>
              </div>

              <span className={`w-6 text-right font-bold ${bCount > 0 ? 'text-white' : 'text-slate-600'}`}>
                {bCount}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

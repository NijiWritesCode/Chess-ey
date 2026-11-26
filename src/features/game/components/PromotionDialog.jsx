import React from 'react';

/**
 * PromotionDialog allows the player to choose which piece to promote their pawn to:
 * Queen, Rook, Bishop, or Knight.
 */
export function PromotionDialog({ isOpen, turn = 'w', onSelect, onCancel }) {
  if (!isOpen) return null;

  const isWhite = turn === 'w';

  const pieces = [
    { type: 'q', name: 'Queen', symbol: isWhite ? '♕' : '♛' },
    { type: 'r', name: 'Rook', symbol: isWhite ? '♖' : '♜' },
    { type: 'b', name: 'Bishop', symbol: isWhite ? '♗' : '♝' },
    { type: 'n', name: 'Knight', symbol: isWhite ? '♘' : '♞' }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Promote Pawn"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="bg-canvas-card border border-canvas-border rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center">
        <h3 className="text-lg font-bold text-ivory mb-1">Promote Pawn</h3>
        <p className="text-xs text-ivory-muted mb-5">Select a promotion piece:</p>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {pieces.map((p) => (
            <button
              key={p.type}
              onClick={() => onSelect(p.type)}
              className="flex flex-col items-center justify-center p-3 bg-canvas-subtle hover:bg-accent-500/20 border border-canvas-border hover:border-accent-500 rounded-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-accent-500"
              aria-label={`Promote to ${p.name}`}
            >
              <span className="text-4xl leading-none select-none drop-shadow-sm">{p.symbol}</span>
              <span className="text-xs text-ivory-muted mt-2 font-medium">{p.name}</span>
            </button>
          ))}
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-ivory-faint hover:text-ivory transition-colors"
          >
            Cancel Move
          </button>
        )}
      </div>
    </div>
  );
}

export default PromotionDialog;

import React from 'react';

export function PromotionModal({ isOpen, turn = 'w', onSelect, onCancel }) {
  if (!isOpen) return null;

  const pieces = [
    { type: 'q', name: 'Queen', symbol: turn === 'w' ? '♕' : '♛' },
    { type: 'r', name: 'Rook', symbol: turn === 'w' ? '♖' : '♜' },
    { type: 'b', name: 'Bishop', symbol: turn === 'w' ? '♗' : '♝' },
    { type: 'n', name: 'Knight', symbol: turn === 'w' ? '♘' : '♞' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-canvas-card border border-canvas-border rounded-xl p-6 shadow-2xl max-w-sm w-full text-center">
        <h3 className="text-lg font-bold text-ivory mb-2">Promote Pawn</h3>
        <p className="text-sm text-ivory-muted mb-4">Select a piece to promote your pawn to:</p>
        
        <div className="grid grid-cols-4 gap-3 mb-4">
          {pieces.map((p) => (
            <button
              key={p.type}
              onClick={() => onSelect(p.type)}
              className="flex flex-col items-center justify-center p-3 bg-canvas hover:bg-accent-500/20 border border-canvas-border hover:border-accent-500 rounded-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span className="text-4xl leading-none select-none">{p.symbol}</span>
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


import React, { useEffect, useRef } from 'react';
import { ChevronFirst, ChevronLeft, ChevronRight, ChevronLast } from 'lucide-react';
import { MoveClassificationBadge } from './MoveClassificationBadge';

export function MoveList({
  moves = [], // array of move items with { moveNumber, ply, turn, san, classification }
  currentPly = 0,
  onSelectPly = () => {},
  isLive = true,
  showDenotations = true
}) {
  const activeMoveRef = useRef(null);
  const containerRef = useRef(null);

  // Group moves into pairs (White move, Black move)
  const movePairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || null
    });
  }

  // Scroll active move into view smoothly
  useEffect(() => {
    if (activeMoveRef.current) {
      activeMoveRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [currentPly]);

  // Keyboard navigation (ArrowLeft, ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onSelectPly(Math.max(0, currentPly - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onSelectPly(Math.min(moves.length, currentPly + 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        onSelectPly(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        onSelectPly(moves.length);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPly, moves.length, onSelectPly]);

  return (
    <div className="flex flex-col h-full bg-canvas-card border border-canvas-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-canvas-border flex items-center justify-between bg-canvas-subtle">
        <h3 className="font-semibold text-sm text-ivory flex items-center gap-2">
          <span>Move Notation</span>
          <span className="text-xs text-ivory-muted font-normal">({moves.length} plies)</span>
        </h3>
        {!isLive && (
          <button
            onClick={() => onSelectPly(moves.length)}
            className="text-xs bg-accent-600 hover:bg-accent-500 text-white px-2 py-0.5 rounded font-medium transition-colors"
          >
            Go to Live
          </button>
        )}
      </div>

      {/* Move list table */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto divide-y divide-canvas-border/40 text-sm font-mono"
      >
        {movePairs.length === 0 ? (
          <div className="p-8 text-center text-ivory-muted text-xs font-sans">
            Moves will appear here as the game progresses.
          </div>
        ) : (
          movePairs.map((pair) => (
            <div key={pair.moveNumber} className="flex items-center hover:bg-canvas-hover/40 transition-colors">
              <span className="w-12 px-3 py-1.5 text-xs text-ivory-faint select-none font-sans">
                {pair.moveNumber}.
              </span>

              {/* White Move */}
              <button
                ref={currentPly === pair.white.ply ? activeMoveRef : null}
                onClick={() => onSelectPly(pair.white.ply)}
                className={`flex-1 px-3 py-1.5 flex items-center justify-between text-left transition-colors ${
                  currentPly === pair.white.ply
                    ? 'bg-accent-500/25 text-accent-200 font-bold'
                    : 'text-ivory hover:text-white'
                }`}
              >
                <span>{pair.white.san}</span>
                {showDenotations && pair.white.classification && (
                  <MoveClassificationBadge classification={pair.white.classification} size="sm" showLabel={false} />
                )}
              </button>

              {/* Black Move */}
              <div className="flex-1">
                {pair.black ? (
                  <button
                    ref={currentPly === pair.black.ply ? activeMoveRef : null}
                    onClick={() => onSelectPly(pair.black.ply)}
                    className={`w-full px-3 py-1.5 flex items-center justify-between text-left transition-colors ${
                      currentPly === pair.black.ply
                        ? 'bg-accent-500/25 text-accent-200 font-bold'
                        : 'text-ivory hover:text-white'
                    }`}
                  >
                    <span>{pair.black.san}</span>
                    {showDenotations && pair.black.classification && (
                      <MoveClassificationBadge classification={pair.black.classification} size="sm" showLabel={false} />
                    )}
                  </button>
                ) : (
                  <div className="w-full px-3 py-1.5 text-ivory-faint">-</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Navigation Footer */}
      <div className="px-3 py-2 bg-canvas-subtle border-t border-canvas-border flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSelectPly(0)}
            disabled={currentPly === 0}
            className="p-1.5 rounded hover:bg-canvas-hover text-ivory-muted hover:text-ivory disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="First Move (Home)"
          >
            <ChevronFirst className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectPly(Math.max(0, currentPly - 1))}
            disabled={currentPly === 0}
            className="p-1.5 rounded hover:bg-canvas-hover text-ivory-muted hover:text-ivory disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Previous Move (Left Arrow)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectPly(Math.min(moves.length, currentPly + 1))}
            disabled={currentPly === moves.length}
            className="p-1.5 rounded hover:bg-canvas-hover text-ivory-muted hover:text-ivory disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Next Move (Right Arrow)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectPly(moves.length)}
            disabled={currentPly === moves.length}
            className="p-1.5 rounded hover:bg-canvas-hover text-ivory-muted hover:text-ivory disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Latest Move (End)"
          >
            <ChevronLast className="w-4 h-4" />
          </button>
        </div>

        <span className="text-xs text-ivory-muted font-sans font-medium">
          {currentPly} / {moves.length}
        </span>
      </div>
    </div>
  );
}


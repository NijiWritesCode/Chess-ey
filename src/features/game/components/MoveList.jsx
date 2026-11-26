import React, { useEffect, useRef } from 'react';
import { ChevronFirst, ChevronLeft, ChevronRight, ChevronLast } from 'lucide-react';
import { MoveClassificationBadge } from '../../../components/board/MoveClassificationBadge';

/**
 * MoveList displays the move notation table and history navigation controls.
 * Read-only with respect to game state; selecting plies only changes the presentation view.
 */
export function MoveList({
  moves = [],
  currentPly = 0,
  onSelectPly = () => {},
  isLive = true,
  showDenotations = true
}) {
  const activeMoveRef = useRef(null);
  const containerRef = useRef(null);

  // Group plies into White/Black pairs
  const movePairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || null
    });
  }

  // Auto-scroll active ply into view
  useEffect(() => {
    if (activeMoveRef.current && typeof activeMoveRef.current.scrollIntoView === 'function') {
      activeMoveRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [currentPly]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
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
    <div className="flex flex-col h-full bg-canvas-card border border-canvas-border rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-canvas-border flex items-center justify-between bg-canvas-subtle shrink-0">
        <h3 className="font-semibold text-sm text-ivory flex items-center gap-2">
          <span>Move Notation</span>
          <span className="text-xs text-ivory-muted font-normal">({moves.length} plies)</span>
        </h3>
        {!isLive && (
          <button
            onClick={() => onSelectPly(moves.length)}
            className="text-xs bg-accent-600 hover:bg-accent-500 text-white px-2.5 py-1 rounded-md font-medium transition-colors shadow-sm"
          >
            Go to Live
          </button>
        )}
      </div>

      {/* Move list table */}
      <div
        ref={containerRef}
        tabIndex={0}
        aria-label="Move history notation list"
        className="flex-1 overflow-y-auto divide-y divide-canvas-border/40 text-sm font-mono focus:outline-none"
      >
        {movePairs.length === 0 ? (
          <div className="p-8 text-center text-ivory-muted text-xs font-sans">
            Moves will appear here as the game progresses.
          </div>
        ) : (
          movePairs.map((pair) => (
            <div
              key={pair.moveNumber}
              className="flex items-center hover:bg-canvas-hover/40 transition-colors"
            >
              <span className="w-12 px-3 py-1.5 text-xs text-ivory-faint select-none font-sans font-medium">
                {pair.moveNumber}.
              </span>

              {/* White Move */}
              <button
                ref={currentPly === pair.white.ply ? activeMoveRef : null}
                onClick={() => onSelectPly(pair.white.ply)}
                className={`flex-1 px-3 py-1.5 flex items-center justify-between text-left transition-colors rounded-sm ${
                  currentPly === pair.white.ply
                    ? 'bg-accent-500/25 text-accent-200 font-bold'
                    : 'text-ivory hover:text-white'
                }`}
              >
                <span>{pair.white.san}</span>
                {showDenotations && pair.white.classification && (
                  <MoveClassificationBadge
                    classification={pair.white.classification}
                    size="sm"
                    showLabel={false}
                  />
                )}
              </button>

              {/* Black Move */}
              <div className="flex-1">
                {pair.black ? (
                  <button
                    ref={currentPly === pair.black.ply ? activeMoveRef : null}
                    onClick={() => onSelectPly(pair.black.ply)}
                    className={`w-full px-3 py-1.5 flex items-center justify-between text-left transition-colors rounded-sm ${
                      currentPly === pair.black.ply
                        ? 'bg-accent-500/25 text-accent-200 font-bold'
                        : 'text-ivory hover:text-white'
                    }`}
                  >
                    <span>{pair.black.san}</span>
                    {showDenotations && pair.black.classification && (
                      <MoveClassificationBadge
                        classification={pair.black.classification}
                        size="sm"
                        showLabel={false}
                      />
                    )}
                  </button>
                ) : (
                  <div className="w-full px-3 py-1.5 text-ivory-faint select-none">-</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Navigation Footer */}
      <div className="px-3 py-2 bg-canvas-subtle border-t border-canvas-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSelectPly(0)}
            disabled={currentPly === 0}
            className="p-1.5 rounded hover:bg-canvas-hover text-ivory-muted hover:text-ivory disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="First Move (Home)"
            aria-label="First Move"
          >
            <ChevronFirst className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectPly(Math.max(0, currentPly - 1))}
            disabled={currentPly === 0}
            className="p-1.5 rounded hover:bg-canvas-hover text-ivory-muted hover:text-ivory disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Previous Move (Left Arrow)"
            aria-label="Previous Move"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectPly(Math.min(moves.length, currentPly + 1))}
            disabled={currentPly === moves.length}
            className="p-1.5 rounded hover:bg-canvas-hover text-ivory-muted hover:text-ivory disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Next Move (Right Arrow)"
            aria-label="Next Move"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => onSelectPly(moves.length)}
            disabled={currentPly === moves.length}
            className="p-1.5 rounded hover:bg-canvas-hover text-ivory-muted hover:text-ivory disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title="Latest Move (End)"
            aria-label="Latest Move"
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

export default MoveList;

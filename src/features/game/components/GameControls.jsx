import React, { useState } from 'react';
import {
  RotateCcw,
  Flag,
  Handshake,
  Settings,
  Download,
  Copy,
  Check,
  Eye,
  EyeOff,
  Undo2,
  Volume2,
  VolumeX,
  Play
} from 'lucide-react';

/**
 * GameControls component providing board flipping, resign, undo, rematch/restart,
 * sound controls, PGN export, and settings trigger.
 */
export function GameControls({
  onFlipBoard,
  onRestart,
  onNewGame,
  onResign,
  onOfferDraw,
  onUndo,
  canUndo = false,
  isGameOver = false,
  isMuted = false,
  onToggleSound,
  isLiveAnalysisEnabled = false,
  onToggleLiveAnalysis,
  onOpenSettings,
  pgn = '',
  isMultiplayer = false
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyPgn = () => {
    if (!pgn) return;
    navigator.clipboard.writeText(pgn).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownloadPgn = () => {
    if (!pgn) return;
    const blob = new Blob([pgn], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess-ey-game-${Date.now()}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleNewGame = onNewGame || onRestart;

  return (
    <div className="bg-canvas-card border border-canvas-border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-md">
      {/* Primary gameplay actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {onFlipBoard && (
          <button
            onClick={onFlipBoard}
            className="p-2 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory hover:text-white transition-colors"
            title="Flip Board Perspective"
            aria-label="Flip Board"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}

        {/* Rematch / New Game Button - Highlighted when game is concluded */}
        {isGameOver && handleNewGame && (
          <button
            onClick={handleNewGame}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md transform hover:-translate-y-0.5 active:translate-y-0"
            title="Start New Game"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>New Game</span>
          </button>
        )}

        {/* Undo button */}
        {canUndo && !isGameOver && onUndo && (
          <button
            onClick={onUndo}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-xs font-medium text-ivory transition-colors"
            title="Undo Move"
            aria-label="Undo Move"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
        )}

        {/* Active Game: Draw and Resign */}
        {!isGameOver && (
          <>
            {isMultiplayer && onOfferDraw && (
              <button
                onClick={onOfferDraw}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-xs font-medium text-ivory transition-colors"
                title="Offer Draw"
              >
                <Handshake className="w-3.5 h-3.5 text-blue-400" />
                <span>Draw</span>
              </button>
            )}

            {onResign && (
              <button
                onClick={onResign}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/35 border border-red-500/60 text-xs font-bold text-red-300 hover:text-white transition-all shadow-sm active:scale-95"
                title="Resign this match"
              >
                <Flag className="w-3.5 h-3.5 text-red-400 fill-red-400/40" />
                <span>Resign</span>
              </button>
            )}
          </>
        )}

        {/* Restart active match */}
        {!isGameOver && onRestart && (
          <button
            onClick={onRestart}
            className="p-2 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory-muted hover:text-ivory transition-colors"
            title="Restart Match"
            aria-label="Restart Match"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Auxiliary tools & toggles */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Sound toggle */}
        {onToggleSound && (
          <button
            onClick={onToggleSound}
            className="p-2 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory-muted hover:text-ivory transition-colors"
            title={isMuted ? 'Unmute Game Sounds' : 'Mute Game Sounds'}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}

        {/* Live Analysis Toggle */}
        {onToggleLiveAnalysis && (
          <button
            onClick={onToggleLiveAnalysis}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isLiveAnalysisEnabled
                ? 'bg-accent-600/30 border-accent-500 text-accent-200'
                : 'bg-canvas-subtle border-canvas-border text-ivory-muted hover:text-ivory'
            }`}
            title={isLiveAnalysisEnabled ? 'Disable Live Engine Classification' : 'Enable Live Engine Classification'}
          >
            {isLiveAnalysisEnabled ? (
              <>
                <Eye className="w-3.5 h-3.5 text-accent-400" />
                <span>Live Intel: ON</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-ivory-muted" />
                <span>Live Intel: OFF</span>
              </>
            )}
          </button>
        )}

        {/* PGN Tools */}
        {pgn && (
          <>
            <button
              onClick={handleCopyPgn}
              className="p-2 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory-muted hover:text-ivory transition-colors"
              title="Copy PGN to clipboard"
              aria-label="Copy PGN"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDownloadPgn}
              className="p-2 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory-muted hover:text-ivory transition-colors"
              title="Download PGN file"
              aria-label="Download PGN"
            >
              <Download className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Settings button */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory-muted hover:text-ivory transition-colors"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default GameControls;

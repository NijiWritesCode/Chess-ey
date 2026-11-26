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
  Undo2
} from 'lucide-react';

export function GameControls({
  onFlipBoard,
  onResign,
  onRematch,
  onOfferDraw,
  onUndo,
  canUndo = false,
  isLiveAnalysisEnabled = true,
  onToggleLiveAnalysis,
  onOpenSettings,
  pgn = '',
  isMultiplayer = false,
  isGameOver = false
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

  return (
    <div className="bg-canvas-card border border-canvas-border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-md">
      {/* Primary gameplay actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onFlipBoard}
          className="p-2 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory hover:text-white transition-colors"
          title="Flip Board Perspective"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Rematch Button - Displayed prominently whenever match is concluded */}
        {isGameOver && onRematch && (
          <button
            onClick={onRematch}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md transform hover:-translate-y-0.5 active:translate-y-0"
            title="Start Rematch"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Rematch</span>
          </button>
        )}

        {/* Undo button */}
        {canUndo && !isGameOver && (
          <button
            onClick={onUndo}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-xs font-medium text-ivory transition-colors"
            title="Undo Move"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
        )}

        {/* Resign & Draw controls during active play */}
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
      </div>

      {/* Analysis, PGN & Settings tools */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Prominent Live Analysis Toggle */}
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

        {pgn && (
          <>
            <button
              onClick={handleCopyPgn}
              className="p-2 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory-muted hover:text-ivory transition-colors"
              title="Copy PGN"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDownloadPgn}
              className="p-2 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory-muted hover:text-ivory transition-colors"
              title="Download PGN"
            >
              <Download className="w-4 h-4" />
            </button>
          </>
        )}

        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-ivory-muted hover:text-ivory transition-colors"
          title="Board & Engine Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}


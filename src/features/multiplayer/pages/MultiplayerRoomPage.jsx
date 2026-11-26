import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Users,
  Copy,
  Check,
  Share2,
  AlertTriangle,
  RotateCcw,
  Flag,
  Handshake,
  Settings,
  ArrowLeft,
  MessageCircle,
  Wifi,
  WifiOff,
  Sparkles,
  Download
} from 'lucide-react';
import { useMultiplayerRoom } from '../hooks/useMultiplayerRoom';
import { Chessboard } from '../../game/components/Chessboard';
import { MoveList } from '../../game/components/MoveList';
import { Clock } from '../../game/components/Clock';
import { GameOverModal } from '../../game/components/GameOverModal';
import { SettingsModal } from '../../../components/modals/SettingsModal';
import { settingsManager } from '../../../services/storage/settingsStore';
import { reconstructGame } from '../../game/domain/moveHistory';

export function MultiplayerRoomPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || '';
  const navigate = useNavigate();

  // Settings
  const [settings, setSettings] = useState(settingsManager.getAll());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    return settingsManager.subscribe(setSettings);
  }, []);

  // Use dedicated multiplayer room hook
  const {
    room,
    status,
    error,
    playerColor,
    isMyTurn,
    isOpponentOnline,
    displayFen,
    moves,
    currentPly,
    lastMove,
    isCheck,
    isLive,
    isGameOver,
    result,
    rematchOfferedBy,
    rematchRoomId,
    clocks,
    players,
    makeMove,
    resign,
    offerDraw,
    respondDraw,
    claimTimeout,
    requestRematch,
    declineRematch,
    acceptRematch,
    navigatePly
  } = useMultiplayerRoom(roomId, { inviteToken });

  // Auto-navigate to fresh rematch room when created (Phase 7.4)
  useEffect(() => {
    if (rematchRoomId) {
      navigate(`/play/${rematchRoomId}`);
    }
  }, [rematchRoomId, navigate]);

  // Visual board orientation
  const [userFlipped, setUserFlipped] = useState(false);
  const orientation = useMemo(() => {
    const base = playerColor === 'b' ? 'black' : 'white';
    if (!userFlipped) return base;
    return base === 'white' ? 'black' : 'white';
  }, [playerColor, userFlipped]);

  // Modal / Confirmations
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedPgn, setCopiedPgn] = useState(false);

  const opponentColor = playerColor === 'w' ? 'b' : 'w';
  const opponentName = playerColor === 'w' ? players.black.name : players.white.name;
  const myName = playerColor === 'w' ? players.white.name : players.black.name;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = `${origin}/play/${roomId}${inviteToken ? `?invite=${inviteToken}` : ''}`;

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    });
  };

  const handleShareWhatsApp = () => {
    const msg = encodeURIComponent(
      `Join my chess match on Chess-ey! Play instantly with no registration required:\n${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  };

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: 'Join my Chess game on Chess-ey!',
          text: 'Play chess with me instantly without registration:',
          url: shareUrl
        })
        .catch(() => {});
    } else {
      handleCopyInvite();
    }
  };

  // Generate PGN string from current canonical moves
  const currentPgn = useMemo(() => {
    try {
      const reconstructed = reconstructGame(moves);
      return reconstructed.pgn || '';
    } catch (e) {
      return '';
    }
  }, [moves]);

  const handleCopyPgn = () => {
    if (!currentPgn) return;
    navigator.clipboard.writeText(currentPgn).then(() => {
      setCopiedPgn(true);
      setTimeout(() => setCopiedPgn(false), 2000);
    });
  };

  // Loading State
  if (status === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-bold text-ivory">Connecting to Room...</h2>
        <p className="text-xs text-ivory-muted mt-1">Establishing authenticated game session.</p>
      </div>
    );
  }

  // Error State
  if (status === 'error' || error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto shadow-lg">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold text-ivory">Unable to Join Match</h2>
        <p className="text-sm text-ivory-muted leading-relaxed">
          {error || 'This room does not exist, has expired, or both player seats are already occupied.'}
        </p>
        <button
          onClick={() => navigate('/multiplayer')}
          className="px-6 py-3 rounded-xl bg-accent-500 hover:bg-accent-400 text-canvas font-bold text-sm transition-all shadow-lg flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Multiplayer</span>
        </button>
      </div>
    );
  }

  // Waiting State (Room created, waiting for opponent to join)
  if (status === 'waiting') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-lg mx-auto w-full space-y-6">
        <div className="p-6 sm:p-8 rounded-3xl bg-canvas-card border border-canvas-border shadow-2xl text-center space-y-6 w-full">
          <div className="w-16 h-16 rounded-3xl bg-accent-500/10 border border-accent-500/20 text-accent-400 flex items-center justify-center mx-auto shadow-inner">
            <Users className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-ivory">Waiting for Opponent</h2>
            <p className="text-xs sm:text-sm text-ivory-muted max-w-sm mx-auto">
              Share the invitation link with a friend. The match will start immediately once they open it.
            </p>
          </div>

          {/* Seat Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-canvas-subtle border border-canvas-border text-xs font-semibold text-ivory">
            <span>You are playing as</span>
            <span className="font-bold text-accent-400">
              {playerColor === 'w' ? 'White (Move first)' : 'Black (Move second)'}
            </span>
          </div>

          {/* Share Box */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-4 py-3 rounded-xl bg-canvas-subtle border border-canvas-border text-ivory font-mono text-xs select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyInvite}
                className={`px-4 py-3 rounded-xl border font-semibold text-xs transition-all flex items-center gap-1.5 shrink-0 ${
                  copiedInvite
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-canvas-subtle border-canvas-border text-ivory hover:border-ivory/40'
                }`}
              >
                {copiedInvite ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedInvite ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 shadow-md"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={handleNativeShare}
                className="py-3 px-3 rounded-xl bg-canvas-subtle hover:bg-canvas-border border border-canvas-border text-ivory font-semibold text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-4 h-4 text-accent-400" />
                <span>Share</span>
              </button>
            </div>
          </div>

          {/* Pulse indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-ivory-faint pt-2">
            <div className="w-2 h-2 rounded-full bg-accent-400 animate-ping" />
            <span>Listening for peer connection...</span>
          </div>
        </div>
      </div>
    );
  }

  // Active / Completed Match View
  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-2 sm:p-4 md:p-6 flex flex-col lg:flex-row gap-4 items-center lg:items-start justify-center">
      {/* Board & Player Bars Column */}
      <div className="flex flex-col items-center w-full max-w-[600px] shrink-0 space-y-2">
        {/* Opponent Bar */}
        <div className="w-full flex items-center justify-between px-3 py-2 rounded-2xl bg-canvas-card border border-canvas-border shadow-sm">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-3.5 h-3.5 rounded-full border border-canvas-border shadow-sm ${
                opponentColor === 'w' ? 'bg-white' : 'bg-zinc-800'
              }`}
            />
            <div className="flex flex-col">
              <span className="font-bold text-xs sm:text-sm text-ivory flex items-center gap-1.5">
                {opponentName}
                <span className="text-[10px] text-ivory-faint font-normal">
                  ({opponentColor === 'w' ? 'White' : 'Black'})
                </span>
              </span>
              <span className="text-[10px] flex items-center gap-1">
                {isOpponentOnline ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-emerald-400 font-medium">Online</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span className="text-amber-400 font-medium">Reconnecting...</span>
                  </>
                )}
              </span>
            </div>
          </div>

          <Clock
            timeMs={opponentColor === 'w' ? clocks.whiteMs : clocks.blackMs}
            isActive={room?.status === 'active' && room?.turn === opponentColor}
            player={opponentColor === 'w' ? 'White' : 'Black'}
            onTimeout={claimTimeout}
          />
        </div>

        {/* Board Component */}
        <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-2xl border border-canvas-border relative">
          <Chessboard
            fen={displayFen}
            orientation={orientation}
            isInteractive={isMyTurn && room?.status === 'active'}
            playerTurnColor={isMyTurn ? playerColor : null}
            lastMove={lastMove}
            onMove={makeMove}
            themeId={settings.boardTheme}
            showLegalMoves={settings.showLegalMoves ?? true}
            showHighlights={settings.showHighlights ?? true}
          />

          {/* Jump to live overlay if user is browsing past moves */}
          {!isLive && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30">
              <button
                onClick={() => navigatePly(moves.length)}
                className="px-4 py-2 rounded-full bg-accent-500 hover:bg-accent-400 text-canvas text-xs font-bold shadow-xl transition-all animate-bounce"
              >
                Jump to Live Move
              </button>
            </div>
          )}
        </div>

        {/* User Player Bar */}
        <div className="w-full flex items-center justify-between px-3 py-2 rounded-2xl bg-canvas-card border border-canvas-border shadow-sm">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-3.5 h-3.5 rounded-full border border-canvas-border shadow-sm ${
                playerColor === 'w' ? 'bg-white' : 'bg-zinc-800'
              }`}
            />
            <div className="flex flex-col">
              <span className="font-bold text-xs sm:text-sm text-ivory flex items-center gap-1.5">
                {myName}
                <span className="text-[10px] text-accent-400 font-semibold">(You)</span>
              </span>
              <span className="text-[10px] text-ivory-faint">
                {isMyTurn ? (
                  <span className="text-emerald-400 font-bold">Your turn</span>
                ) : room?.status === 'active' ? (
                  <span>Opponent's turn</span>
                ) : (
                  <span>Game Over</span>
                )}
              </span>
            </div>
          </div>

          <Clock
            timeMs={playerColor === 'w' ? clocks.whiteMs : clocks.blackMs}
            isActive={room?.status === 'active' && room?.turn === playerColor}
            player={playerColor === 'w' ? 'White' : 'Black'}
            onTimeout={() => {}}
          />
        </div>
      </div>

      {/* Side Panel: Move List, Draw Offer, Actions */}
      <div className="w-full lg:w-[380px] flex flex-col space-y-3">
        {/* Opponent Draw Offer Banner */}
        {room?.draw_offered_by === opponentColor && (
          <div className="p-4 rounded-2xl bg-accent-500/15 border border-accent-500/30 text-ivory space-y-3 shadow-lg animate-fade-in">
            <div className="flex items-center gap-2 text-accent-400 font-bold text-xs uppercase tracking-wider">
              <Handshake className="w-4 h-4" />
              <span>Draw Offer Received</span>
            </div>
            <p className="text-xs text-ivory-muted">
              {opponentName} has offered a draw. Would you like to accept?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => respondDraw(true)}
                className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md"
              >
                Accept Draw
              </button>
              <button
                type="button"
                onClick={() => respondDraw(false)}
                className="py-2 px-3 rounded-xl bg-canvas-subtle hover:bg-canvas-border text-ivory font-semibold text-xs border border-canvas-border transition-all"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* User sent Draw Offer Banner */}
        {room?.draw_offered_by === playerColor && (
          <div className="p-3 rounded-xl bg-canvas-subtle border border-canvas-border text-xs text-ivory-muted flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Handshake className="w-3.5 h-3.5 text-accent-400" />
              <span>Draw offer sent to opponent...</span>
            </div>
          </div>
        )}

        {/* Rematch Offer Received Banner (Phase 7.4) */}
        {isGameOver && rematchOfferedBy === opponentColor && (
          <div className="p-4 rounded-2xl bg-accent-500/20 border border-accent-500/40 text-ivory space-y-3 shadow-lg animate-fade-in">
            <div className="flex items-center gap-2 text-accent-400 font-bold text-xs uppercase tracking-wider">
              <RotateCcw className="w-4 h-4" />
              <span>Rematch Challenge!</span>
            </div>
            <p className="text-xs text-ivory-muted">
              {opponentName} requested a rematch with swapped pieces. Ready for round 2?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={acceptRematch}
                className="py-2.5 px-3 rounded-xl bg-accent-500 hover:bg-accent-400 text-canvas font-bold text-xs transition-all shadow-md"
              >
                Accept Rematch
              </button>
              <button
                type="button"
                onClick={declineRematch}
                className="py-2.5 px-3 rounded-xl bg-canvas-subtle hover:bg-canvas-border text-ivory font-semibold text-xs border border-canvas-border transition-all"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* Rematch Offer Sent Waiting Banner (Phase 7.4) */}
        {isGameOver && rematchOfferedBy === playerColor && (
          <div className="p-3.5 rounded-xl bg-accent-500/10 border border-accent-500/30 text-xs text-ivory-muted flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-accent-400 animate-spin" />
              <span className="text-accent-300 font-medium">Rematch requested. Waiting for opponent to accept...</span>
            </div>
          </div>
        )}

        {/* Move History Table */}
        <div className="flex-1 min-h-[280px] max-h-[360px] bg-canvas-card border border-canvas-border rounded-2xl overflow-hidden shadow-md flex flex-col">
          <div className="px-4 py-2.5 border-b border-canvas-border/80 flex items-center justify-between text-xs font-bold text-ivory">
            <span>Move History</span>
            <span className="text-[11px] text-ivory-faint font-normal">{moves.length} plies</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <MoveList
              moves={moves}
              currentPly={currentPly}
              onSelectPly={navigatePly}
              isLive={isLive}
            />
          </div>
        </div>

        {/* Match Controls */}
        <div className="p-3 bg-canvas-card border border-canvas-border rounded-2xl space-y-2 shadow-sm">
          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => setUserFlipped((prev) => !prev)}
              className="p-2.5 rounded-xl bg-canvas-subtle hover:bg-canvas-border text-ivory-muted hover:text-ivory text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all"
              title="Flip Board"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-[10px]">Flip</span>
            </button>

            <button
              type="button"
              disabled={room?.status !== 'active' || room?.draw_offered_by === playerColor}
              onClick={offerDraw}
              className="p-2.5 rounded-xl bg-canvas-subtle hover:bg-canvas-border disabled:opacity-40 text-ivory-muted hover:text-ivory text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all"
              title="Offer Draw"
            >
              <Handshake className="w-4 h-4" />
              <span className="text-[10px]">Draw</span>
            </button>

            <button
              type="button"
              disabled={room?.status !== 'active'}
              onClick={() => setShowResignConfirm(true)}
              className="p-2.5 rounded-xl bg-canvas-subtle hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40 text-ivory-muted text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all"
              title="Resign Match"
            >
              <Flag className="w-4 h-4" />
              <span className="text-[10px]">Resign</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 rounded-xl bg-canvas-subtle hover:bg-canvas-border text-ivory-muted hover:text-ivory text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
              <span className="text-[10px]">Settings</span>
            </button>
          </div>

          {/* Quick PGN Copy */}
          {moves.length > 0 && (
            <div className="pt-2 border-t border-canvas-border/60 flex items-center justify-between text-xs px-1">
              <span className="text-ivory-faint text-[11px]">Match PGN</span>
              <button
                type="button"
                onClick={handleCopyPgn}
                className="text-xs text-accent-400 hover:text-accent-300 font-semibold flex items-center gap-1 transition-colors"
              >
                {copiedPgn ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPgn ? 'Copied' : 'Copy PGN'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Resignation Confirmation Dialog */}
      {showResignConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-canvas-card border border-canvas-border rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-fade-in">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
              <Flag className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-ivory">Resign the Match?</h3>
            <p className="text-xs text-ivory-muted">
              Are you sure you want to forfeit this game? This will concede the match to your opponent.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResignConfirm(false);
                  resign();
                }}
                className="py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all shadow-md"
              >
                Yes, Resign
              </button>
              <button
                type="button"
                onClick={() => setShowResignConfirm(false)}
                className="py-2.5 px-4 rounded-xl bg-canvas-subtle hover:bg-canvas-border text-ivory font-semibold text-xs border border-canvas-border transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      <GameOverModal
        isOpen={isGameOver}
        result={result}
        playerColor={playerColor}
        whiteName={players.white.name}
        blackName={players.black.name}
        onRematch={requestRematch}
        onStartReview={() => navigate(`/review/${roomId}`)}
        onNewGame={() => navigate('/multiplayer')}
        onClose={() => {}}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default MultiplayerRoomPage;
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Users, Wifi, WifiOff, Share2, Copy, Check, Handshake, AlertCircle, Sparkles, User, Flag, ExternalLink } from 'lucide-react';
import { ChessboardWrapper } from '../components/board/ChessboardWrapper';
import { MoveList } from '../components/board/MoveList';
import { EvaluationBar } from '../components/board/EvaluationBar';
import { GameControls } from '../components/board/GameControls';
import { Clock } from '../components/board/Clock';
import { MoveExplanationCard } from '../components/board/MoveExplanationCard';
import { GameOverModal } from '../components/modals/GameOverModal';
import { SettingsModal } from '../components/modals/SettingsModal';
import { roomService } from '../services/multiplayer/roomService';
import { analysisEngine } from '../services/engine/stockfishService';
import { classifyMove } from '../services/analysis/classifier';
import { identifyOpening } from '../services/openings/openingBook';
import { soundEngine } from '../utils/sound';
import { settingsManager } from '../services/storage/settingsStore';
import { isSupabaseConfigured } from '../services/supabase/supabaseClient';

export function MultiplayerRoomPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || '';
  const navigate = useNavigate();

  // Settings
  const [settings, setSettings] = useState(settingsManager.getAll());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Room & Seating State
  const [room, setRoom] = useState(null);
  const [playerColor, setPlayerColor] = useState(null); // 'w' | 'b' (authoritative seat)
  const [boardOrientation, setBoardOrientation] = useState('white'); // 'white' | 'black' (visual only)
  const [isJoining, setIsJoining] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isOpponentOnline, setIsOpponentOnline] = useState(false);
  const [soloTestMode, setSoloTestMode] = useState(false);

  // Chess Game State
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [moves, setMoves] = useState([]);
  const [currentPly, setCurrentPly] = useState(0);
  const [lastMove, setLastMove] = useState(null);
  const [currentEval, setCurrentEval] = useState({ cp: 20 });
  const [bestMoveArrow, setBestMoveArrow] = useState(null);
  const [selectedMoveForExplanation, setSelectedMoveForExplanation] = useState(null);

  // Clocks
  const [whiteTimeMs, setWhiteTimeMs] = useState(600000);
  const [blackTimeMs, setBlackTimeMs] = useState(600000);
  const [gameOverResult, setGameOverResult] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    return settingsManager.subscribe(setSettings);
  }, []);

  // Async Live Stockfish Evaluation for Multiplayer Moves
  const analyzeMoveLive = useCallback(async (fenBefore, moveObj, turn) => {
    if (!settings.enableLiveAnalysis) return;
    try {
      const fenAfter = chess.fen();
      const preResult = await analysisEngine.evaluatePosition(fenBefore, {
        depth: settings.liveDepth || 10,
        movetime: 250
      });
      const postResult = await analysisEngine.evaluatePosition(fenAfter, {
        depth: settings.liveDepth || 10,
        movetime: 250
      });

      const preEval = preResult?.evaluation || currentEval;
      const postEval = postResult?.evaluation || preEval;

      setCurrentEval(postEval);
      if (postResult?.bestMove && postResult.bestMove.length >= 4) {
        setBestMoveArrow({
          from: postResult.bestMove.slice(0, 2),
          to: postResult.bestMove.slice(2, 4)
        });
      }

      const allSans = chess.history();
      const opening = identifyOpening(allSans, fenAfter);

      const classification = classifyMove({
        playedMove: moveObj,
        engineBestMove: preResult?.bestMove,
        preEval,
        postEval,
        turn,
        isBook: opening.isBookMove,
        legalMovesCount: chess.moves().length,
        chessBefore: new Chess(fenBefore),
        chessAfter: new Chess(fenAfter)
      });

      setSelectedMoveForExplanation({
        san: moveObj.san,
        from: moveObj.from,
        to: moveObj.to,
        classification: classification.classification,
        cpLoss: classification.cpLoss,
        evalAfter: postEval
      });
    } catch (e) {
      console.warn('Live multiplayer evaluation warning:', e);
    }
  }, [chess, currentEval, settings.enableLiveAnalysis, settings.liveDepth]);

  // Join Room on mount
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setErrorMsg('Supabase is not configured.');
      setIsJoining(false);
      return;
    }

    let isMounted = true;

    async function initRoom() {
      try {
        const joinResult = await roomService.joinRoom({
          roomId,
          inviteToken,
          playerName: 'Guest Player'
        });

        if (!isMounted) return;

        setRoom(joinResult.room);
        setPlayerColor(joinResult.color);
        setBoardOrientation(joinResult.color === 'b' ? 'black' : 'white');
        setWhiteTimeMs(joinResult.room.white_time_ms);
        setBlackTimeMs(joinResult.room.black_time_ms);

        // Load authoritative FEN and moves if game has already progressed
        if (joinResult.room.fen) {
          chess.load(joinResult.room.fen);
          setFen(joinResult.room.fen);
        }
        if (Array.isArray(joinResult.room.moves)) {
          setMoves(joinResult.room.moves);
          setCurrentPly(joinResult.room.moves.length);
          if (joinResult.room.moves.length > 0) {
            const last = joinResult.room.moves[joinResult.room.moves.length - 1];
            setLastMove({ from: last.from, to: last.to });
          }
        }

        // Check if room completed
        if (joinResult.room.status === 'completed') {
          setGameOverResult({
            winner: joinResult.room.winner,
            reason: joinResult.room.termination_reason
          });
        }

        // If game is active (e.g. 2nd player just joined), broadcast room state so opponent activates instantly
        if (joinResult.room.status === 'active') {
          roomService.broadcastRoomState(roomId, joinResult.room);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Error joining room:', err);
        setErrorMsg(err.message || 'Could not join room.');
      } finally {
        if (isMounted) setIsJoining(false);
      }
    }

    initRoom();

    return () => {
      isMounted = false;
    };
  }, [roomId, inviteToken, chess]);

  // Realtime subscription
  useEffect(() => {
    if (!roomId || !roomService) return;

    const unsubscribe = roomService.subscribeToRoom(roomId, {
      onMove: (incomingMove) => {
        // Ignore self-broadcast
        if (incomingMove.senderColor === playerColor) return;

        try {
          const fenBefore = chess.fen();
          let moveObj = null;
          try {
            moveObj = chess.move({
              from: incomingMove.from,
              to: incomingMove.to,
              promotion: incomingMove.promotion || 'q'
            });
          } catch (e) {
            if (incomingMove.newFen) {
              chess.load(incomingMove.newFen);
            }
          }

          const fenAfter = incomingMove.newFen || chess.fen();
          setFen(fenAfter);
          setMoves((prev) => [...prev, incomingMove]);
          setCurrentPly((prev) => prev + 1);
          setLastMove({ from: incomingMove.from, to: incomingMove.to });

          if (chess.inCheck()) soundEngine.playCheck();
          else if (incomingMove.san?.includes('x') || moveObj?.captured) soundEngine.playCapture();
          else if (incomingMove.san?.includes('O-O')) soundEngine.playCastle();
          else soundEngine.playMove();

          analyzeMoveLive(fenBefore, incomingMove, incomingMove.senderColor);

          if (chess.isGameOver()) {
            let winner = null;
            let reason = null;
            if (chess.isCheckmate()) {
              winner = incomingMove.senderColor === 'w' ? 'white' : 'black';
              reason = 'checkmate';
            } else {
              winner = 'draw';
              reason = 'draw';
            }
            setGameOverResult({ winner, reason });
            soundEngine.playGameEnd();
          }
        } catch (err) {
          console.warn('Error applying broadcast move:', err);
        }
      },
      onRoomUpdate: (updatedRoom) => {
        setRoom(updatedRoom);
        setWhiteTimeMs(updatedRoom.white_time_ms);
        setBlackTimeMs(updatedRoom.black_time_ms);

        // Check incoming moves
        if (updatedRoom.fen && updatedRoom.fen !== chess.fen()) {
          try {
            const fenBefore = chess.fen();
            chess.load(updatedRoom.fen);
            setFen(updatedRoom.fen);

            if (Array.isArray(updatedRoom.moves)) {
              setMoves(updatedRoom.moves);
              setCurrentPly(updatedRoom.moves.length);
              const latest = updatedRoom.moves[updatedRoom.moves.length - 1];
              if (latest) {
                setLastMove({ from: latest.from, to: latest.to });
                setSelectedMoveForExplanation(latest);

                // Sound feedback
                if (chess.inCheck()) soundEngine.playCheck();
                else if (latest.san?.includes('x')) soundEngine.playCapture();
                else if (latest.san?.includes('O-O')) soundEngine.playCastle();
                else soundEngine.playMove();

                // Trigger live analysis for incoming move
                analyzeMoveLive(fenBefore, latest, latest.turn || (chess.turn() === 'w' ? 'b' : 'w'));
              }
            }
          } catch (e) {
            console.warn('Sync FEN error:', e);
          }
        }

        // Check game completion
        if (updatedRoom.status === 'completed') {
          setGameOverResult({
            winner: updatedRoom.winner,
            reason: updatedRoom.termination_reason
          });
          soundEngine.playGameEnd();
        }
      },
      onPresenceChange: (presence) => {
        const count = Object.keys(presence).length;
        setIsOpponentOnline(count >= 2);
      }
    });

    return () => unsubscribe();
  }, [roomId, chess, analyzeMoveLive]);

  // Resilient 2-Second Polling Fallback (ensures room sync even if Realtime drops or publication is unconfigured)
  useEffect(() => {
    if (!roomId || !roomService) return;

    let isPolling = true;

    const interval = setInterval(async () => {
      if (!isPolling) return;
      try {
        const latestRoom = await roomService.getRoom(roomId);
        if (!latestRoom || !isPolling) return;

        setRoom((prev) => {
          if (!prev) return latestRoom;

          // If room transitioned from waiting to active (opponent joined)
          if (prev.status === 'waiting' && latestRoom.status === 'active') {
            chess.load(latestRoom.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            setFen(chess.fen());
            setMoves(Array.isArray(latestRoom.moves) ? latestRoom.moves : []);
            setCurrentPly(Array.isArray(latestRoom.moves) ? latestRoom.moves.length : 0);
            setLastMove(null);
            soundEngine.playMove();
          }

          // If incoming moves arrived in active game
          if (latestRoom.status === 'active' && latestRoom.fen && latestRoom.fen !== chess.fen()) {
            const fenBefore = chess.fen();
            chess.load(latestRoom.fen);
            setFen(latestRoom.fen);

            if (Array.isArray(latestRoom.moves)) {
              setMoves(latestRoom.moves);
              setCurrentPly(latestRoom.moves.length);
              const latest = latestRoom.moves[latestRoom.moves.length - 1];
              if (latest) {
                setLastMove({ from: latest.from, to: latest.to });
                if (chess.inCheck()) soundEngine.playCheck();
                else if (latest.san?.includes('x')) soundEngine.playCapture();
                else if (latest.san?.includes('O-O')) soundEngine.playCastle();
                else soundEngine.playMove();

                analyzeMoveLive(fenBefore, latest, latest.turn || (chess.turn() === 'w' ? 'b' : 'w'));
              }
            }
          }

          if (latestRoom.status === 'completed' && prev.status !== 'completed') {
            setGameOverResult({
              winner: latestRoom.winner,
              reason: latestRoom.termination_reason
            });
            soundEngine.playGameEnd();
          }

          return latestRoom;
        });

        setWhiteTimeMs(latestRoom.white_time_ms);
        setBlackTimeMs(latestRoom.black_time_ms);
      } catch (err) {
        console.warn('Poll room warning:', err);
      }
    }, 2000);

    return () => {
      isPolling = false;
      clearInterval(interval);
    };
  }, [roomId, chess, analyzeMoveLive]);

  // Clocks countdown
  useEffect(() => {
    if (!room || room.status !== 'active' || gameOverResult) return;

    const interval = setInterval(() => {
      const turn = chess.turn();
      if (turn === 'w') {
        setWhiteTimeMs((prev) => Math.max(0, prev - 100));
      } else {
        setBlackTimeMs((prev) => Math.max(0, prev - 100));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [room, chess, gameOverResult]);

  // Submit player move
  const handlePlayerMove = useCallback(({ from, to, promotion = 'q' }) => {
    if (gameOverResult) return false;
    const isWaiting = room?.status === 'waiting';

    // In active game, require active room and matching turn; in solo or waiting mode allow moves freely
    if (!soloTestMode && !isWaiting) {
      if (!room || room.status !== 'active') return false;
      if (chess.turn() !== playerColor) return false;
    }

    const turn = chess.turn();
    const fenBefore = chess.fen();
    const currentVersion = room?.version || 1;

    let moveObj = null;
    try {
      moveObj = chess.move({ from, to, promotion });
    } catch (e) {
      return false;
    }

    if (!moveObj) return false;

    const newFen = chess.fen();
    const isGameOver = chess.isGameOver();
    let winner = null;
    let reason = null;

    if (isGameOver) {
      if (chess.isCheckmate()) {
        winner = turn === 'w' ? 'white' : 'black';
        reason = 'checkmate';
      } else {
        winner = 'draw';
        reason = 'draw';
      }
    }

    // Optimistically update local board immediately
    setFen(newFen);
    setLastMove({ from, to });

    if (chess.inCheck()) soundEngine.playCheck();
    else if (moveObj.captured) soundEngine.playCapture();
    else if (moveObj.flags && (moveObj.flags.includes('k') || moveObj.flags.includes('q'))) soundEngine.playCastle();
    else soundEngine.playMove();

    // Run live analysis on player's move
    analyzeMoveLive(fenBefore, moveObj, turn);

    // 1. Broadcast move immediately to opponent (< 50ms peer-to-peer delivery)
    roomService.broadcastMove(roomId, {
      from,
      to,
      promotion,
      san: moveObj.san,
      newFen,
      senderColor: playerColor || (turn === 'w' ? 'w' : 'b')
    });

    // 2. Commit to server in background if room is live
    if (room && room.status === 'active') {
      roomService.commitMove({
        roomId,
        from,
        to,
        promotion,
        san: moveObj.san,
        newFen,
        expectedVersion: currentVersion,
        isGameOver,
        winner,
        reason
      }).catch((err) => {
        console.warn('Commit move warning (move delivered via broadcast):', err.message);
      });
    }

    return true;
  }, [room, gameOverResult, chess, playerColor, roomId, soloTestMode, analyzeMoveLive]);

  const handleCopyInvite = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleResign = async () => {
    if (soloTestMode || !room || room.status !== 'active') {
      const winner = playerColor === 'w' ? 'black' : 'white';
      const result = { winner, reason: 'resignation' };
      setGameOverResult(result);
      soundEngine.playGameEnd();
      return;
    }
    try {
      await roomService.resignGame(roomId);
    } catch (e) {
      console.error('Failed to resign match:', e);
    }
  };

  const handleOfferDraw = async () => {
    if (!room || room.status !== 'active') return;
    await roomService.offerDraw(roomId, playerColor);
  };

  const handleRespondDraw = async (accept) => {
    if (!room) return;
    await roomService.respondDraw(roomId, accept);
  };

  if (isJoining) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-accent-500/20 border-t-accent-500 rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-bold text-ivory">Connecting to match room...</h2>
        <p className="text-xs text-ivory-muted mt-1">Establishing secure connection</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-canvas-card border border-red-500/40 rounded-2xl text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h2 className="text-xl font-bold text-ivory">Unable to Join Match</h2>
        <p className="text-xs text-red-300">{errorMsg}</p>
        <button
          onClick={() => navigate('/multiplayer')}
          className="px-5 py-2.5 bg-accent-600 hover:bg-accent-500 text-white rounded-xl text-xs font-semibold transition-colors"
        >
          Back to Multiplayer
        </button>
      </div>
    );
  }

  const isWaitingForOpponent = room?.status === 'waiting';
  const opponentName = playerColor === 'w' ? room?.black_name : room?.white_name;
  const myName = playerColor === 'w' ? room?.white_name : room?.black_name;
  const isMyTurn = chess.turn() === playerColor;

  const currentMove = currentPly > 0 && moves[currentPly - 1] ? moves[currentPly - 1] : null;
  const currentClassification = currentMove ? currentMove.classification : null;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-1.5 h-[calc(100dvh-55px)] overflow-hidden flex flex-col justify-between">
      {/* Waiting Room Header Banner */}
      {isWaitingForOpponent && (
        <div className="mb-1.5 bg-blue-950/40 border border-blue-500/40 rounded-xl px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-sm shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400 animate-pulse shrink-0" />
            <div>
              <span className="font-bold text-xs text-ivory">Waiting for opponent to connect</span>
              <span className="text-[11px] text-ivory-muted ml-1 hidden sm:inline">&bull; Board is in Practice Mode until opponent joins</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const inviteUrl = `${window.location.origin}/play/${roomId}?invite=${inviteToken}`;
                window.open(inviteUrl, '_blank');
              }}
              className="px-2.5 py-1 bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-xs font-semibold text-ivory-muted hover:text-ivory rounded-lg transition-colors flex items-center gap-1"
              title="Open a second tab to test both sides in real time on this machine"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span>Test in 2nd Tab</span>
            </button>

            <button
              onClick={() => setSoloTestMode(!soloTestMode)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                soloTestMode
                  ? 'bg-accent-600 text-white'
                  : 'bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-ivory-muted'
              }`}
              title="Practice and test moves for both sides while waiting"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{soloTestMode ? 'Solo Mode Active' : 'Test Both Sides'}</span>
            </button>

            <button
              onClick={handleCopyInvite}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Draw Offer Notification */}
      {room?.draw_offered_by && room.draw_offered_by !== playerColor && (
        <div className="mb-1.5 bg-amber-500/20 border border-amber-500 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs max-w-md mx-auto shrink-0">
          <div className="flex items-center gap-2 text-amber-200">
            <Handshake className="w-4 h-4 text-amber-400" />
            <span>Opponent offered a draw. Accept?</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleRespondDraw(true)}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg"
            >
              Accept
            </button>
            <button
              onClick={() => handleRespondDraw(false)}
              className="px-2.5 py-1 bg-canvas hover:bg-canvas-hover text-ivory-muted rounded-lg"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Main Arena: Viewport-constrained Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-6 items-start flex-1 min-h-0">
        {/* Left / Center: Chessboard Area */}
        <div className="lg:col-span-8 flex flex-col items-center justify-between h-full min-h-0">
          {/* Top Player (Opponent) */}
          <div className="w-full max-w-[560px] flex items-center justify-between pb-1 px-1 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-canvas-card border border-canvas-border flex items-center justify-center text-ivory-muted">
                <Users className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div>
                <span className="font-bold text-xs text-ivory block leading-tight">{opponentName || 'Opponent'}</span>
                <span className="text-[10px] text-ivory-muted flex items-center gap-1 leading-tight">
                  {isOpponentOnline ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Online</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span>{soloTestMode ? 'Solo Testing' : 'Waiting...'}</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            <Clock
              timeMs={playerColor === 'w' ? blackTimeMs : whiteTimeMs}
              isActive={(room?.status === 'active' || soloTestMode) && !isMyTurn}
              player="Opponent"
            />
          </div>

          {/* Chessboard with Evaluation Bar */}
          <div className="flex items-center justify-center gap-2 w-full my-auto">
            {settings.showEvalBar && settings.enableLiveAnalysis && (
              <div className="h-[min(94vw,calc(100dvh-230px),480px)] lg:h-[min(44vw,calc(100dvh-230px),560px)] xl:h-[min(46vw,calc(100dvh-210px),620px)] flex items-center">
                <EvaluationBar evaluation={currentEval} orientation={boardOrientation} />
              </div>
            )}

            <ChessboardWrapper
              chess={chess}
              fen={fen}
              orientation={boardOrientation}
              isInteractive={isWaitingForOpponent || soloTestMode || (room?.status === 'active' && isMyTurn)}
              playerTurnColor={(isWaitingForOpponent || soloTestMode) ? null : playerColor}
              onMove={handlePlayerMove}
              bestMoveArrow={bestMoveArrow}
              lastMove={lastMove}
              lastMoveClassification={settings.enableLiveAnalysis ? currentClassification : null}
              themeId={settings.boardTheme}
              showLegalMoves={settings.showLegalMoves}
              showHighlights={settings.highlightLastMove}
            />
          </div>

          {/* Bottom Player (Self) */}
          <div className="w-full max-w-[560px] flex items-center justify-between pt-1 px-1 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-accent-600/30 border border-accent-500/40 flex items-center justify-center text-accent-200">
                <User className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-xs text-ivory block leading-tight">{myName || 'You'}</span>
                <span className="text-[10px] leading-tight">
                  {isWaitingForOpponent ? (
                    <span className="text-amber-300 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Practice Mode (Move Pieces Freely)
                    </span>
                  ) : soloTestMode ? (
                    <span className="text-accent-300 font-semibold">● Solo Mode Active</span>
                  ) : isMyTurn ? (
                    <span className="text-emerald-400 font-semibold">● Your Turn</span>
                  ) : (
                    <span className="text-ivory-muted">Waiting for opponent move...</span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!gameOverResult && (room?.status === 'active' || soloTestMode) && (
                <button
                  type="button"
                  onClick={handleResign}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/35 border border-red-500/60 text-xs font-bold text-red-300 hover:text-white transition-all shadow-sm active:scale-95"
                  title="Resign this match"
                >
                  <Flag className="w-3.5 h-3.5 text-red-400 fill-red-400/40" />
                  <span>Resign</span>
                </button>
              )}

              <Clock
                timeMs={playerColor === 'w' ? whiteTimeMs : blackTimeMs}
                isActive={(room?.status === 'active' || soloTestMode) && isMyTurn}
                player="You"
              />
            </div>
          </div>

          {/* Game Controls */}
          <div className="w-full max-w-[560px] pt-1.5 shrink-0">
            <GameControls
              onFlipBoard={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
              onResign={handleResign}
              onRematch={() => {
                chess.reset();
                setFen(chess.fen());
                setMoves([]);
                setCurrentPly(0);
                setLastMove(null);
                setGameOverResult(null);
              }}
              onOfferDraw={handleOfferDraw}
              canUndo={false}
              isLiveAnalysisEnabled={settings.enableLiveAnalysis}
              onToggleLiveAnalysis={() => settingsManager.update({ enableLiveAnalysis: !settings.enableLiveAnalysis })}
              onOpenSettings={() => setIsSettingsOpen(true)}
              pgn={chess.pgn()}
              isMultiplayer={true}
              isGameOver={Boolean(gameOverResult)}
            />
          </div>
        </div>

        {/* Right: Move History & Explanation Card */}
        <div className="lg:col-span-4 flex flex-col gap-4 h-full">
          {settings.enableLiveAnalysis && (
            <MoveExplanationCard selectedMove={selectedMoveForExplanation} />
          )}

          <div className="h-[380px] lg:h-[480px]">
            <MoveList
              moves={moves}
              currentPly={currentPly}
              showDenotations={settings.enableLiveAnalysis}
              onSelectPly={(ply) => {
                setCurrentPly(ply);
                if (ply === 0) {
                  setFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
                } else {
                  const m = moves[ply - 1];
                  if (m) setFen(m.fen || m.fenAfter);
                }
              }}
              isLive={currentPly === moves.length}
            />
          </div>
        </div>
      </div>

      {/* Game Over Modal */}
      <GameOverModal
        isOpen={Boolean(gameOverResult)}
        result={gameOverResult}
        playerColor={playerColor}
        whiteName={room?.white_name || 'White'}
        blackName={room?.black_name || 'Black'}
        onRematch={() => {
          chess.reset();
          setFen(chess.fen());
          setMoves([]);
          setCurrentPly(0);
          setLastMove(null);
          setGameOverResult(null);
        }}
        onStartReview={() => {
          navigate('/review', {
            state: {
              pgn: chess.pgn(),
              moves,
              playerColor,
              whiteName: room?.white_name || 'White',
              blackName: room?.black_name || 'Black',
              result: gameOverResult
            }
          });
        }}
        onNewGame={() => navigate('/multiplayer')}
        onOpenAnalysis={() => navigate('/analysis', { state: { pgn: chess.pgn() } })}
        onClose={() => setGameOverResult(null)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}


import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import {
  BarChart3,
  Award,
  BookOpen,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Download,
  Copy,
  Check,
  Search,
  Play,
  Lightbulb,
  AlertTriangle,
  Flame,
  Layers,
  History
} from 'lucide-react';
import { ChessboardWrapper } from '../components/board/ChessboardWrapper';
import { MoveList } from '../components/board/MoveList';
import { EvaluationGraph } from '../components/review/EvaluationGraph';
import { EvaluationBar } from '../components/board/EvaluationBar';
import { MoveClassificationBadge } from '../components/board/MoveClassificationBadge';
import { analyzeFullGame } from '../services/analysis/reviewService';
import { MOVE_CLASSES, formatEvaluation } from '../services/analysis/classifier';
import { settingsManager } from '../services/storage/settingsStore';
import { gameStore } from '../services/storage/gameStore';

export function GameReviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const gameId = searchParams.get('id');

  // Read initial game state or load asynchronously from gameStore
  const [game, setGame] = useState(() => location.state || null);
  const [isLoadingStorage, setIsLoadingStorage] = useState(!location.state);

  const [settings] = useState(settingsManager.getAll());

  // Review Engine State
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [reviewReport, setReviewReport] = useState(null);

  // Active Board State
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [currentPly, setCurrentPly] = useState(0);
  const [selectedMove, setSelectedMove] = useState(null);
  const [boardOrientation, setBoardOrientation] = useState('white');

  // Variation Exploration State
  const [isExploringVariation, setIsExploringVariation] = useState(false);
  const [variationMoves, setVariationMoves] = useState([]);
  const [variationIndex, setVariationIndex] = useState(0);

  const [copiedPgn, setCopiedPgn] = useState(false);

  // Load game from storage if location.state is missing (survives refresh / direct URL)
  useEffect(() => {
    if (game && (game.pgn || game.moves?.length)) return;

    let mounted = true;
    async function loadGame() {
      setIsLoadingStorage(true);
      try {
        let loaded = null;
        if (gameId) {
          loaded = await gameStore.getGameById(gameId);
        }
        if (!loaded) {
          const recents = await gameStore.getRecentGames(1);
          if (recents && recents.length > 0) {
            loaded = recents[0];
          }
        }
        if (loaded && mounted) {
          setGame({
            pgn: loaded.pgn,
            moves: loaded.moves || [],
            playerColor: loaded.playerColor || 'w',
            whiteName: loaded.playerColor === 'w' ? 'You' : (loaded.opponent || 'White'),
            blackName: loaded.playerColor === 'b' ? 'You' : (loaded.opponent || 'Black'),
            result: loaded.result
          });
          setBoardOrientation(loaded.playerColor === 'b' ? 'black' : 'white');
        }
      } catch (err) {
        console.warn('Failed to load game from storage for review:', err);
      } finally {
        if (mounted) setIsLoadingStorage(false);
      }
    }
    loadGame();

    return () => {
      mounted = false;
    };
  }, [gameId, game]);

  // Set initial orientation if game provided in location.state
  useEffect(() => {
    if (game?.playerColor) {
      setBoardOrientation(game.playerColor === 'b' ? 'black' : 'white');
    }
  }, [game?.playerColor]);

  // Run deep analysis on mount
  useEffect(() => {
    if (!game || (!game.pgn && (!game.moves || game.moves.length === 0))) {
      setIsAnalyzing(false);
      return;
    }

    let cancelled = false;

    async function runReview() {
      setIsAnalyzing(true);
      setAnalysisProgress(0);

      try {
        const report = await analyzeFullGame({
          pgn: game.pgn,
          moves: game.moves || [],
          depth: settings.reviewDepth || 14,
          onProgress: ({ percent }) => {
            if (!cancelled) setAnalysisProgress(percent);
          }
        });

        if (!cancelled) {
          setReviewReport(report);
          if (report.analyzedMoves?.length > 0) {
            const firstTurningPoint = report.turningPoints[0] || report.analyzedMoves[0];
            setSelectedMove(firstTurningPoint);
            setCurrentPly(firstTurningPoint.ply);
            setFen(firstTurningPoint.fenAfter);
          }
        }
      } catch (err) {
        console.error('Full game review failed:', err);
      } finally {
        if (!cancelled) setIsAnalyzing(false);
      }
    }

    runReview();

    return () => {
      cancelled = true;
    };
  }, [game, settings.reviewDepth]);

  // Handle ply selection from MoveList or EvaluationGraph
  const handleSelectPly = useCallback((ply) => {
    setIsExploringVariation(false);
    setCurrentPly(ply);

    if (ply === 0) {
      setFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      setSelectedMove(null);
    } else {
      const targetMove = reviewReport?.analyzedMoves?.[ply - 1] || game?.moves?.[ply - 1];
      if (targetMove) {
        setFen(targetMove.fenAfter);
        setSelectedMove(targetMove);
      }
    }
  }, [reviewReport, game]);

  // Start exploring the engine's suggested line from root position
  const handleExploreVariation = (moveItem) => {
    if (!moveItem?.fenBefore || (!moveItem.bestMoveSan && !moveItem.pv?.length)) return;

    const tempChess = new Chess(moveItem.fenBefore);
    const variationSans = [];

    // First move is engine best move
    if (moveItem.bestMoveUci && moveItem.bestMoveUci.length >= 4) {
      try {
        const res = tempChess.move({
          from: moveItem.bestMoveUci.slice(0, 2),
          to: moveItem.bestMoveUci.slice(2, 4),
          promotion: moveItem.bestMoveUci[4] || 'q'
        });
        if (res) variationSans.push(res.san);
      } catch (e) {}
    }

    // Append remaining principal variation moves
    if (moveItem.pv && moveItem.pv.length > 0) {
      for (const uci of moveItem.pv.slice(1, 6)) {
        if (uci.length >= 4) {
          try {
            const res = tempChess.move({
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              promotion: uci[4] || 'q'
            });
            if (res) variationSans.push(res.san);
          } catch (e) {
            break;
          }
        }
      }
    }

    if (variationSans.length > 0) {
      setIsExploringVariation(true);
      setVariationMoves(variationSans);
      setVariationIndex(0);
      const playChess = new Chess(moveItem.fenBefore);
      playChess.move(variationSans[0]);
      setFen(playChess.fen());
    }
  };

  const handleNextVariationMove = () => {
    if (!selectedMove || variationIndex >= variationMoves.length - 1) return;
    const nextIdx = variationIndex + 1;
    const playChess = new Chess(selectedMove.fenBefore);
    for (let i = 0; i <= nextIdx; i++) {
      playChess.move(variationMoves[i]);
    }
    setVariationIndex(nextIdx);
    setFen(playChess.fen());
  };

  const handleExitVariation = () => {
    setIsExploringVariation(false);
    if (selectedMove) {
      setFen(selectedMove.fenAfter);
    }
  };

  const handleCopyPgn = () => {
    if (!game?.pgn) return;
    navigator.clipboard.writeText(game.pgn).then(() => {
      setCopiedPgn(true);
      setTimeout(() => setCopiedPgn(false), 2000);
    });
  };

  if (isLoadingStorage) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-accent-500/20 border-t-accent-500 rounded-full animate-spin mb-3" />
        <p className="text-xs text-ivory-muted">Loading game review data...</p>
      </div>
    );
  }

  if (!game || (!game.pgn && (!game.moves || game.moves.length === 0))) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-canvas-card border border-canvas-border rounded-2xl text-center space-y-4 shadow-xl">
        <History className="w-12 h-12 text-accent-400 mx-auto" />
        <h2 className="text-lg font-bold text-ivory">No Game Selected for Review</h2>
        <p className="text-xs text-ivory-muted leading-relaxed">
          Complete a game against Stockfish or a friend to analyze turning points, or select a past match from your game archive.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => navigate('/history')}
            className="px-4 py-2 bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border rounded-xl text-xs font-semibold text-ivory transition-colors"
          >
            Game History
          </button>
          <button
            onClick={() => navigate('/computer')}
            className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Play Game
          </button>
        </div>
      </div>
    );
  }

  const whiteName = game.whiteName || 'White Player';
  const blackName = game.blackName || 'Black Player';

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Header bar with Back button and Export */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-canvas-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-ivory-muted hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-ivory flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-accent-400" />
              <span>Full Game Review & Analysis</span>
            </h1>
            <p className="text-xs text-ivory-muted">
              Deep Stockfish examination of every turning point, tactical flaw, and opening line
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyPgn}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-xs font-semibold text-ivory transition-colors"
          >
            {copiedPgn ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedPgn ? 'Copied PGN' : 'Copy PGN'}</span>
          </button>

          <button
            onClick={() => navigate('/analysis', { state: { pgn: game.pgn } })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-xs font-semibold text-white transition-colors shadow-sm"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Open in Analysis Board</span>
          </button>
        </div>
      </div>

      {/* Progress Bar during deep analysis */}
      {isAnalyzing && (
        <div className="bg-canvas-card border border-accent-500/40 rounded-xl p-4 shadow-lg space-y-2 animate-pulse">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-accent-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-accent-400" />
              <span>Running Deep Stockfish Analysis...</span>
            </span>
            <span className="font-mono text-ivory font-bold">{analysisProgress}%</span>
          </div>
          <div className="w-full h-2 bg-canvas-subtle rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-500 transition-all duration-300"
              style={{ width: `${analysisProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Game Summary Cards */}
      {reviewReport && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Accuracy & Match Details */}
          <div className="bg-canvas-card border border-canvas-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between border-b border-canvas-border/60 pb-3 mb-3">
              <div>
                <span className="text-xs text-ivory-muted uppercase tracking-wider block">Game Accuracy</span>
                <span className="text-xs font-semibold text-ivory-faint">Calibrated Win% Model</span>
              </div>
              <Award className="w-6 h-6 text-amber-400" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-center my-2">
              <div className="p-2.5 bg-canvas-subtle rounded-lg border border-canvas-border">
                <span className="text-xs text-ivory-muted block truncate">{whiteName}</span>
                <span className="text-2xl font-mono font-extrabold text-accent-300">
                  {reviewReport.whiteAccuracy}%
                </span>
                <span className="text-[10px] text-ivory-faint block uppercase">White</span>
              </div>

              <div className="p-2.5 bg-canvas-subtle rounded-lg border border-canvas-border">
                <span className="text-xs text-ivory-muted block truncate">{blackName}</span>
                <span className="text-2xl font-mono font-extrabold text-accent-300">
                  {reviewReport.blackAccuracy}%
                </span>
                <span className="text-[10px] text-ivory-faint block uppercase">Black</span>
              </div>
            </div>

            <div className="text-[11px] text-ivory-muted pt-2 border-t border-canvas-border/50">
              Total Plies: <strong>{reviewReport.analyzedMoves.length}</strong> &bull; Turning Points: <strong>{reviewReport.turningPoints.length}</strong>
            </div>
          </div>

          {/* Card 2: Opening Recognition Report */}
          <div className="bg-canvas-card border border-canvas-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between border-b border-canvas-border/60 pb-3 mb-2">
              <span className="text-xs text-ivory-muted uppercase tracking-wider block">Opening Theory</span>
              <BookOpen className="w-5 h-5 text-purple-400" />
            </div>

            <div className="space-y-2 my-auto">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold text-xs">
                  {reviewReport.gameOpening?.eco || 'ECO'}
                </span>
                <h3 className="text-sm font-bold text-ivory truncate">
                  {reviewReport.gameOpening?.name || 'Standard Game'}
                </h3>
              </div>
              <p className="text-xs text-ivory-muted leading-relaxed">
                {reviewReport.gameOpening?.totalBookMovesCount > 0
                  ? `Followed standard theory for ${reviewReport.gameOpening.totalBookMovesCount} moves before branching into independent middlegame plans.`
                  : 'Game departed from recognized opening databases in the early phase.'}
              </p>
            </div>

            <div className="pt-2 border-t border-canvas-border/50 text-[11px] text-ivory-faint">
              Standard Lichess ECO Database Match
            </div>
          </div>

          {/* Card 3: Key Tactical Lesson */}
          <div className="bg-canvas-card border border-canvas-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between border-b border-canvas-border/60 pb-3 mb-2">
              <span className="text-xs text-ivory-muted uppercase tracking-wider block">Primary Takeaway</span>
              <Flame className="w-5 h-5 text-amber-500" />
            </div>

            <p className="text-xs text-ivory leading-relaxed my-auto">
              {reviewReport.turningPoints?.length > 0
                ? `Key turning point occurred at move ${reviewReport.turningPoints[0].moveNumber} (${reviewReport.turningPoints[0].san}), where evaluation shifted noticeably. Examining recommended continuations prevents similar tactical oversight.`
                : 'Balanced positional play maintained throughout the game with consistent piece defense and king safety.'}
            </p>

            <div className="pt-2 border-t border-canvas-border/50 text-[11px] text-accent-300 font-medium">
              Grounded in Stockfish calculation
            </div>
          </div>
        </div>
      )}

      {/* Main Review Arena */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Chessboard */}
        <div className="lg:col-span-7 flex flex-col items-center">
          {/* Variation Bar Banner if exploring alternate line */}
          {isExploringVariation && (
            <div className="w-full max-w-[620px] mb-3 bg-amber-500/20 border border-amber-500/50 rounded-xl p-3 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-2 text-amber-200 text-xs font-semibold">
                <Play className="w-4 h-4 text-amber-400 fill-current" />
                <span>
                  Exploring Suggested Line: Move {variationIndex + 1} of {variationMoves.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleNextVariationMove}
                  disabled={variationIndex >= variationMoves.length - 1}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-xs disabled:opacity-40 transition-colors"
                >
                  Step Next Move &rarr;
                </button>
                <button
                  onClick={handleExitVariation}
                  className="px-2.5 py-1 bg-canvas hover:bg-canvas-hover text-ivory-muted hover:text-white rounded-lg text-xs transition-colors"
                >
                  Exit Line
                </button>
              </div>
            </div>
          )}

          {/* Board with Evaluation Bar */}
          <div className="flex items-center justify-center gap-2 w-full">
            <div className="h-[min(88vw,560px)] lg:h-[min(44vw,620px)] flex items-center">
              <EvaluationBar
                evaluation={selectedMove?.evalAfter || { cp: 0 }}
                orientation={boardOrientation}
              />
            </div>

            <ChessboardWrapper
              chess={chess}
              fen={fen}
              orientation={boardOrientation}
              isInteractive={false}
              bestMoveArrow={
                selectedMove?.bestMoveUci?.length >= 4
                  ? {
                      from: selectedMove.bestMoveUci.slice(0, 2),
                      to: selectedMove.bestMoveUci.slice(2, 4)
                    }
                  : null
              }
              lastMove={
                selectedMove ? { from: selectedMove.from, to: selectedMove.to } : null
              }
              lastMoveClassification={selectedMove?.classification}
              themeId={settings.boardTheme}
              showLegalMoves={false}
              showHighlights={true}
            />
          </div>

          {/* Board Orientation Flip */}
          <div className="w-full max-w-[620px] flex items-center justify-between pt-3 px-1 text-xs text-ivory-muted">
            <button
              onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Flip Board ({boardOrientation})</span>
            </button>

            {selectedMove && (
              <span className="font-mono">
                Evaluation: <strong>{formatEvaluation(selectedMove.evalAfter, selectedMove.turn)}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Right: Detailed Move Review, Explanations & List */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Detailed Move Card */}
          {selectedMove ? (
            <div className="bg-canvas-card border border-canvas-border rounded-xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xl font-mono font-extrabold text-white">
                    {selectedMove.moveNumber}.{selectedMove.turn === 'b' ? '..' : ''} {selectedMove.san}
                  </span>
                  <span className="text-xs text-ivory-muted ml-2">
                    ({selectedMove.turn === 'w' ? 'White' : 'Black'})
                  </span>
                </div>

                {selectedMove.classification && (
                  <MoveClassificationBadge classification={selectedMove.classification} size="md" />
                )}
              </div>

              {/* Grounded explanation */}
              <p className="text-sm text-ivory leading-relaxed font-sans bg-canvas-subtle p-3.5 rounded-lg border border-canvas-border/80">
                {selectedMove.explanation}
              </p>

              {/* Best alternative box */}
              {selectedMove.bestMoveSan && selectedMove.classification?.id !== 'best' && selectedMove.classification?.id !== 'book' && (
                <div className="bg-canvas border border-canvas-border rounded-lg p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <span className="text-ivory-muted">Stockfish preferred: </span>
                      <strong className="text-amber-300 font-mono font-bold text-sm ml-1">
                        {selectedMove.bestMoveSan}
                      </strong>
                    </span>
                  </div>

                  {selectedMove.cpLoss > 0 && (
                    <span className="text-red-400 font-medium">
                      -{(selectedMove.cpLoss / 100).toFixed(1)} pawns
                    </span>
                  )}
                </div>
              )}

              {/* Action: Explore suggested variation line */}
              {(selectedMove.bestMoveSan || selectedMove.pv?.length > 0) && (
                <button
                  onClick={() => handleExploreVariation(selectedMove)}
                  className="w-full py-2.5 px-4 bg-accent-600/30 hover:bg-accent-600 text-accent-200 hover:text-white border border-accent-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play Through Recommended Variation</span>
                </button>
              )}
            </div>
          ) : (
            <div className="bg-canvas-card border border-canvas-border rounded-xl p-6 text-center text-ivory-muted text-xs">
              Select any move from the list or chart below to inspect engine suggestions.
            </div>
          )}

          {/* Move list */}
          <div className="h-[340px]">
            <MoveList
              moves={reviewReport?.analyzedMoves || game.moves || []}
              currentPly={currentPly}
              onSelectPly={handleSelectPly}
              isLive={false}
            />
          </div>
        </div>
      </div>

      {/* Evaluation Graph */}
      {reviewReport && (
        <div className="pt-2">
          <EvaluationGraph
            evalHistory={reviewReport.evalHistory}
            currentPly={currentPly}
            onSelectPly={handleSelectPly}
          />
        </div>
      )}

      {/* Critical Turning Points List */}
      {reviewReport?.turningPoints?.length > 0 && (
        <div className="bg-canvas-card border border-canvas-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            <h2 className="text-base font-bold text-ivory">Critical Turning Points ({reviewReport.turningPoints.length})</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {reviewReport.turningPoints.map((tp) => (
              <button
                key={tp.ply}
                onClick={() => handleSelectPly(tp.ply)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  currentPly === tp.ply
                    ? 'border-accent-500 bg-accent-500/15'
                    : 'border-canvas-border bg-canvas-subtle hover:bg-canvas-hover'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-sm font-bold text-white">
                    {tp.moveNumber}.{tp.turn === 'b' ? '..' : ''} {tp.san}
                  </span>
                  <MoveClassificationBadge classification={tp.classification} size="sm" />
                </div>
                <p className="text-xs text-ivory-muted line-clamp-2 leading-relaxed">
                  {tp.explanation}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


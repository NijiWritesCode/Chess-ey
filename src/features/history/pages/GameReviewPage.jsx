// Full Game Review & Interactive Analysis Page
// Reconstructs games move-by-move with Stockfish evaluations, accuracy metrics, momentum graphs, and mistake navigation.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { historyStorage } from '../services/historyStorage';
import { analyzeFullGame } from '../services/reviewService';
import Chessboard from '../../game/components/Chessboard';
import MoveList from '../../game/components/MoveList';
import EvaluationBar from '../../analysis/components/EvaluationBar';
import EvaluationGraph from '../components/EvaluationGraph';
import ReviewSummaryCard from '../components/ReviewSummaryCard';
import MoveExplanationCard from '../../analysis/components/MoveExplanationCard';
import {
  ArrowLeft,
  RotateCcw,
  Volume2,
  VolumeX,
  Play,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  AlertTriangle,
  Flame,
  Award,
  RefreshCw,
  Share2,
  Download
} from 'lucide-react';

export default function GameReviewPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();

  const [game, setGame] = useState(null);
  const [review, setReview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(null); // { currentPly, totalPlies, currentMove, percent }

  const [currentPly, setCurrentPly] = useState(0);
  const [orientation, setOrientation] = useState('white');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Load game from storage
  useEffect(() => {
    let isCancelled = false;

    async function loadAndReview() {
      if (!gameId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const storedGame = await historyStorage.getGameById(gameId);
        if (!storedGame) {
          setIsLoading(false);
          return;
        }

        if (isCancelled) return;
        setGame(storedGame);

        // Check if game already has a cached review
        let existingReview = storedGame.review;
        if (!existingReview) {
          existingReview = await historyStorage.getGameReview(gameId);
        }

        if (existingReview && existingReview.analyzedMoves) {
          if (isCancelled) return;
          setReview(existingReview);
          setCurrentPly(existingReview.analyzedMoves.length);
          setIsLoading(false);
          return;
        }

        // Run full game analysis
        setAnalysisProgress({ currentPly: 0, totalPlies: storedGame.moves?.length || 10, percent: 0 });
        const analysisResult = await analyzeFullGame({
          pgn: storedGame.pgn,
          moves: storedGame.moves,
          gameId,
          depth: 12,
          onProgress: (p) => {
            if (!isCancelled) setAnalysisProgress(p);
          }
        });

        if (isCancelled) return;
        setReview(analysisResult);
        setCurrentPly(analysisResult.analyzedMoves.length);
      } catch (err) {
        console.error('[GameReviewPage] Failed to run review:', err);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          setAnalysisProgress(null);
        }
      }
    }

    loadAndReview();

    return () => {
      isCancelled = true;
    };
  }, [gameId]);

  // Replay moves up to currentPly
  const currentPosition = useMemo(() => {
    const c = new Chess(game?.initialFen || undefined);
    const moves = review?.analyzedMoves || game?.moves || [];
    const clampedPly = Math.max(0, Math.min(moves.length, currentPly));

    let lastMoveObj = null;
    for (let i = 0; i < clampedPly; i++) {
      const m = moves[i];
      try {
        if (m.from && m.to) {
          lastMoveObj = c.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
        } else if (m.san) {
          lastMoveObj = c.move(m.san);
        }
      } catch (e) {}
    }

    const currentAnalyzed = clampedPly > 0 ? moves[clampedPly - 1] : null;

    return {
      fen: c.fen(),
      lastMove: lastMoveObj ? { from: lastMoveObj.from, to: lastMoveObj.to } : null,
      currentAnalyzed,
      totalPlies: moves.length,
      turn: c.turn(),
      isGameOver: c.isGameOver(),
      isCheck: c.inCheck()
    };
  }, [game, review, currentPly]);

  // Current move evaluation for EvaluationBar
  const currentEval = useMemo(() => {
    if (!currentPosition.currentAnalyzed) {
      return { cp: 0 };
    }
    return currentPosition.currentAnalyzed.postScore || { cp: currentPosition.currentAnalyzed.postCp || 0 };
  }, [currentPosition]);

  // Key moment navigation
  const jumpToNextMoment = (type) => {
    if (!review?.analyzedMoves) return;
    const moves = review.analyzedMoves;
    for (let i = currentPly; i < moves.length; i++) {
      const m = moves[i];
      const id = m.classification?.id;
      if (type === 'mistake' && (id === 'mistake' || id === 'inaccuracy')) {
        setCurrentPly(m.ply);
        return;
      }
      if (type === 'blunder' && (id === 'blunder' || id === 'miss')) {
        setCurrentPly(m.ply);
        return;
      }
      if (type === 'brilliant' && (id === 'brilliant' || id === 'great')) {
        setCurrentPly(m.ply);
        return;
      }
    }
    // Loop back from beginning if none found forward
    for (let i = 0; i < currentPly; i++) {
      const m = moves[i];
      const id = m.classification?.id;
      if (type === 'mistake' && (id === 'mistake' || id === 'inaccuracy')) {
        setCurrentPly(m.ply);
        return;
      }
      if (type === 'blunder' && (id === 'blunder' || id === 'miss')) {
        setCurrentPly(m.ply);
        return;
      }
      if (type === 'brilliant' && (id === 'brilliant' || id === 'great')) {
        setCurrentPly(m.ply);
        return;
      }
    }
  };

  const downloadPgn = () => {
    if (!game?.pgn) return;
    const blob = new Blob([game.pgn], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review_${game.id}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && analysisProgress) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
          <div>
            <h2 className="text-lg font-bold text-white">Analyzing Game Performance</h2>
            <p className="text-xs text-slate-400 mt-1">
              Stockfish is evaluating every move to determine accuracies, missed tactics, and turning points.
            </p>
          </div>

          <div className="space-y-1.5 pt-2">
            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-cyan-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${analysisProgress.percent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span>Move: {analysisProgress.currentMove || '...'}</span>
              <span>{analysisProgress.percent}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
        <h2 className="text-xl font-bold text-white">Game Not Found</h2>
        <p className="text-xs text-slate-400 max-w-sm mt-1 mb-6">
          The requested game review could not be found in local storage.
        </p>
        <button
          onClick={() => navigate('/history')}
          className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-semibold text-xs transition-colors hover:bg-cyan-400"
        >
          Back to History
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/history')}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Back to History"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-cyan-400" />
                Game Review
              </h1>
              <p className="text-[11px] text-slate-400">
                {game.players?.white?.name || 'White'} vs {game.players?.black?.name || 'Black'} •{' '}
                {new Date(game.timestamp).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs flex items-center gap-1.5"
              title="Flip Board"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Flip</span>
            </button>

            <button
              onClick={() => setSoundEnabled((s) => !s)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Toggle Sound"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={downloadPgn}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs flex items-center gap-1.5"
              title="Download PGN"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">PGN</span>
            </button>

            <button
              onClick={() => navigate('/play/computer')}
              className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors shadow-md shadow-cyan-500/20"
            >
              Play Again
            </button>
          </div>
        </div>

        {/* Main Grid: Board & Graph on left, Review Panels on right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Board + EvalBar + Graph */}
          <div className="lg:col-span-7 flex flex-col items-center gap-4">
            {/* Board Row with Evaluation Bar */}
            <div className="relative flex items-center justify-center gap-3 w-full max-w-[540px]">
              <EvaluationBar
                evaluation={currentEval}
                orientation={orientation}
                height={500}
                className="hidden sm:flex"
              />

              <div className="flex-1 aspect-square max-w-[500px]">
                <Chessboard
                  fen={currentPosition.fen}
                  lastMove={currentPosition.lastMove}
                  orientation={orientation}
                  interactive={false}
                  soundEnabled={soundEnabled}
                  className="rounded-xl overflow-hidden shadow-2xl border border-slate-800"
                />
              </div>
            </div>

            {/* Stepper Controls */}
            <div className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-xl w-full max-w-[540px]">
              <button
                onClick={() => setCurrentPly(0)}
                disabled={currentPly === 0}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Start of game"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={() => setCurrentPly((p) => Math.max(0, p - 1))}
                disabled={currentPly === 0}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Previous move (Left arrow)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <span className="font-mono text-xs text-slate-300 font-semibold px-4">
                {currentPly} / {currentPosition.totalPlies}
              </span>

              <button
                onClick={() => setCurrentPly((p) => Math.min(currentPosition.totalPlies, p + 1))}
                disabled={currentPly === currentPosition.totalPlies}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Next move (Right arrow)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <button
                onClick={() => setCurrentPly(currentPosition.totalPlies)}
                disabled={currentPly === currentPosition.totalPlies}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Current final move"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Key Moments Quick Jumper */}
            <div className="flex items-center justify-center gap-2 w-full max-w-[540px] text-xs">
              <span className="text-slate-500 font-medium text-[11px] mr-1">Jump to:</span>
              <button
                onClick={() => jumpToNextMoment('blunder')}
                className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 font-medium text-[11px] transition-colors flex items-center gap-1"
              >
                <AlertTriangle className="w-3 h-3" />
                Blunder
              </button>
              <button
                onClick={() => jumpToNextMoment('mistake')}
                className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 font-medium text-[11px] transition-colors"
              >
                Mistake
              </button>
              <button
                onClick={() => jumpToNextMoment('brilliant')}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20 font-medium text-[11px] transition-colors flex items-center gap-1"
              >
                <Flame className="w-3 h-3" />
                Brilliant
              </button>
            </div>

            {/* Evaluation Momentum Graph */}
            <div className="w-full max-w-[540px]">
              <EvaluationGraph
                evalHistory={review?.evalHistory || []}
                currentPly={currentPly}
                onSelectPly={setCurrentPly}
                height={120}
              />
            </div>
          </div>

          {/* Right Column: Move List, Explanation Card, and Accuracy Summary */}
          <div className="lg:col-span-5 space-y-4">
            {/* Move Explanation Card for Current Ply */}
            {currentPosition.currentAnalyzed ? (
              <MoveExplanationCard
                move={currentPosition.currentAnalyzed}
                classification={currentPosition.currentAnalyzed.classification}
                explanation={currentPosition.currentAnalyzed.explanation}
                engineBestMove={currentPosition.currentAnalyzed.bestMove}
                winChanceLoss={currentPosition.currentAnalyzed.winChanceLoss}
              />
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center text-xs text-slate-400">
                Starting position. Use the arrows or move list to inspect moves and classifications.
              </div>
            )}

            {/* Accuracy & Breakdown Card */}
            <ReviewSummaryCard
              reviewData={review}
              players={game.players}
              result={game.result}
            />

            {/* Move List with Analysis Badges */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl max-h-[360px] overflow-hidden flex flex-col">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Move Notation</h3>
              <div className="overflow-y-auto flex-1 pr-1">
                <MoveList
                  moves={review?.analyzedMoves || game.moves || []}
                  currentPly={currentPly}
                  onSelectPly={setCurrentPly}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

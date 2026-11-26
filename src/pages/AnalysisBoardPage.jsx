import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Chess } from 'chess.js';
import {
  Search,
  RotateCcw,
  Play,
  Copy,
  Check,
  Upload,
  AlertCircle,
  Sparkles,
  Layers,
  ChevronFirst,
  ChevronLeft,
  ChevronRight,
  ChevronLast
} from 'lucide-react';
import { ChessboardWrapper } from '../components/board/ChessboardWrapper';
import { MoveList } from '../components/board/MoveList';
import { EvaluationBar } from '../components/board/EvaluationBar';
import { analysisEngine } from '../services/engine/stockfishService';
import { identifyOpening } from '../services/openings/openingBook';
import { formatEvaluation } from '../services/analysis/classifier';
import { settingsManager } from '../services/storage/settingsStore';
import { soundEngine } from '../utils/sound';

export function AnalysisBoardPage() {
  const location = useLocation();
  const initialPgn = location.state?.pgn || '';

  const [settings] = useState(settingsManager.getAll());

  // Chessboard state
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [moves, setMoves] = useState([]);
  const [currentPly, setCurrentPly] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState('white');
  const [lastMove, setLastMove] = useState(null);

  // Analysis state
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [currentEval, setCurrentEval] = useState({ cp: 20 });
  const [bestMoveArrow, setBestMoveArrow] = useState(null);
  const [principalVariation, setPrincipalVariation] = useState([]);
  const [currentOpening, setCurrentOpening] = useState(null);

  // Import modals & inputs
  const [showImportModal, setShowImportModal] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [importError, setImportError] = useState(null);

  const [copiedFen, setCopiedFen] = useState(false);
  const [copiedPgn, setCopiedPgn] = useState(false);

  // Trigger evaluation for active position
  const evaluateActivePosition = useCallback(async (currentFen) => {
    setIsEngineThinking(true);
    try {
      const res = await analysisEngine.evaluatePosition(currentFen, {
        depth: 14,
        movetime: 500
      });

      if (res?.evaluation) {
        setCurrentEval(res.evaluation);
        setPrincipalVariation(res.evaluation.pv || []);
      }
      if (res?.bestMove && res.bestMove.length >= 4) {
        setBestMoveArrow({
          from: res.bestMove.slice(0, 2),
          to: res.bestMove.slice(2, 4)
        });
      }
    } catch (e) {
      console.warn('Analysis eval error:', e);
    } finally {
      setIsEngineThinking(false);
    }
  }, []);

  // Load initial PGN if passed
  useEffect(() => {
    if (initialPgn) {
      try {
        chess.loadPgn(initialPgn);
        const history = chess.history({ verbose: true });
        const moveItems = history.map((m, idx) => ({
          index: idx,
          moveNumber: Math.floor(idx / 2) + 1,
          ply: idx + 1,
          turn: m.color,
          san: m.san,
          from: m.from,
          to: m.to,
          fenAfter: m.after
        }));
        setMoves(moveItems);
        setCurrentPly(moveItems.length);
        setFen(chess.fen());
        if (moveItems.length > 0) {
          const last = moveItems[moveItems.length - 1];
          setLastMove({ from: last.from, to: last.to });
        }
        evaluateActivePosition(chess.fen());
      } catch (e) {
        console.warn('Initial PGN load failed', e);
      }
    } else {
      evaluateActivePosition(chess.fen());
    }
  }, [initialPgn, chess, evaluateActivePosition]);

  // Handle freeform move on analysis board with clean variation branching
  const handleBoardMove = ({ from, to, promotion = 'q' }) => {
    // If user made a move from a previous ply, ensure chess is synchronized to that ply first
    if (currentPly < moves.length) {
      if (currentPly === 0) {
        chess.reset();
      } else {
        const target = moves[currentPly - 1];
        chess.load(target.fenAfter);
      }
    }

    let moveObj = null;
    try {
      moveObj = chess.move({ from, to, promotion });
    } catch (e) {
      return false;
    }

    if (!moveObj) return false;

    const newFen = chess.fen();
    if (chess.inCheck()) soundEngine.playCheck();
    else if (moveObj.captured) soundEngine.playCapture();
    else soundEngine.playMove();

    const baseMoves = moves.slice(0, currentPly);
    const newMoveItem = {
      index: baseMoves.length,
      moveNumber: Math.floor(baseMoves.length / 2) + 1,
      ply: baseMoves.length + 1,
      turn: moveObj.color,
      san: moveObj.san,
      from,
      to,
      fenAfter: newFen
    };

    const nextMoves = [...baseMoves, newMoveItem];
    setFen(newFen);
    setMoves(nextMoves);
    setCurrentPly(nextMoves.length);
    setLastMove({ from, to });

    const allSans = nextMoves.map(m => m.san);
    const opening = identifyOpening(allSans, newFen);
    setCurrentOpening(opening);

    evaluateActivePosition(newFen);
    return true;
  };

  // Inspect ply
  const handleSelectPly = (ply) => {
    setCurrentPly(ply);
    if (ply === 0) {
      chess.reset();
      setFen(chess.fen());
      setLastMove(null);
      evaluateActivePosition(chess.fen());
    } else {
      const target = moves[ply - 1];
      if (target) {
        chess.load(target.fenAfter);
        setFen(target.fenAfter);
        setLastMove({ from: target.from, to: target.to });
        evaluateActivePosition(target.fenAfter);
      }
    }
  };

  // Reset board
  const handleResetBoard = () => {
    chess.reset();
    setFen(chess.fen());
    setMoves([]);
    setCurrentPly(0);
    setLastMove(null);
    setCurrentOpening(null);
    evaluateActivePosition(chess.fen());
  };

  // Handle Import (PGN or FEN)
  const handleImportSubmit = (e) => {
    e.preventDefault();
    setImportError(null);
    const trimmed = importInput.trim();

    if (!trimmed) {
      setImportError('Please enter a valid FEN or PGN string.');
      return;
    }

    // Check if FEN
    const fenParts = trimmed.split(/\s+/);
    if (fenParts.length >= 2 && trimmed.includes('/')) {
      try {
        chess.load(trimmed);
        setFen(chess.fen());
        setMoves([]);
        setCurrentPly(0);
        setLastMove(null);
        evaluateActivePosition(chess.fen());
        setShowImportModal(false);
        setImportInput('');
        return;
      } catch (err) {
        setImportError(`Invalid FEN: ${err.message}`);
        return;
      }
    }

    // Try PGN
    try {
      chess.loadPgn(trimmed);
      const history = chess.history({ verbose: true });
      const moveItems = history.map((m, idx) => ({
        index: idx,
        moveNumber: Math.floor(idx / 2) + 1,
        ply: idx + 1,
        turn: m.color,
        san: m.san,
        from: m.from,
        to: m.to,
        fenAfter: m.after
      }));

      setMoves(moveItems);
      setCurrentPly(moveItems.length);
      setFen(chess.fen());
      if (moveItems.length > 0) {
        const last = moveItems[moveItems.length - 1];
        setLastMove({ from: last.from, to: last.to });
      }

      evaluateActivePosition(chess.fen());
      setShowImportModal(false);
      setImportInput('');
    } catch (err) {
      setImportError(`Invalid PGN: ${err.message}`);
    }
  };

  const handleCopyFen = () => {
    navigator.clipboard.writeText(fen).then(() => {
      setCopiedFen(true);
      setTimeout(() => setCopiedFen(false), 2000);
    });
  };

  const handleCopyPgn = () => {
    const pgn = chess.pgn();
    navigator.clipboard.writeText(pgn).then(() => {
      setCopiedPgn(true);
      setTimeout(() => setCopiedPgn(false), 2000);
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-1.5 h-[calc(100dvh-55px)] overflow-hidden flex flex-col justify-between">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-canvas-border shrink-0">
        <div>
          <h1 className="text-sm sm:text-base font-extrabold text-ivory flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-400" />
            <span>Analysis Board Workspace</span>
          </h1>
          <p className="text-[11px] text-ivory-muted hidden sm:block">
            Freeform chess exploration with Stockfish WebAssembly calculations, FEN/PGN import & PV lines
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-xs font-semibold text-ivory transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            <span>Import</span>
          </button>

          <button
            onClick={handleCopyFen}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-xs font-semibold text-ivory transition-colors"
          >
            {copiedFen ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedFen ? 'Copied' : 'FEN'}</span>
          </button>

          <button
            onClick={handleCopyPgn}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-xs font-semibold text-ivory transition-colors"
          >
            {copiedPgn ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedPgn ? 'Copied' : 'PGN'}</span>
          </button>

          <button
            onClick={handleResetBoard}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-xs font-semibold text-ivory-muted hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-6 items-start flex-1 min-h-0">
        {/* Left: Chessboard */}
        <div className="lg:col-span-7 flex flex-col items-center justify-between h-full min-h-0">
          <div className="flex items-center justify-center gap-2 w-full my-auto">
            <div className="h-[min(94vw,calc(100dvh-230px),480px)] lg:h-[min(44vw,calc(100dvh-230px),560px)] xl:h-[min(46vw,calc(100dvh-210px),620px)] flex items-center">
              <EvaluationBar evaluation={currentEval} orientation={boardOrientation} />
            </div>

            <ChessboardWrapper
              chess={chess}
              fen={fen}
              orientation={boardOrientation}
              isInteractive={true}
              playerTurnColor={null} // allows both sides to move
              onMove={handleBoardMove}
              bestMoveArrow={bestMoveArrow}
              lastMove={lastMove}
              lastMoveClassification={settings.enableLiveAnalysis && currentPly > 0 && moves[currentPly - 1] ? moves[currentPly - 1].classification : null}
              themeId={settings.boardTheme}
              showLegalMoves={true}
              showHighlights={true}
            />
          </div>

          {/* Bottom Board Controls */}
          <div className="w-full max-w-[560px] flex items-center justify-between pt-1.5 px-1 text-xs text-ivory-muted shrink-0">
            <button
              onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Flip Board ({boardOrientation})</span>
            </button>

            <button
              onClick={() => evaluateActivePosition(fen)}
              disabled={isEngineThinking}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-accent-600 hover:bg-accent-500 text-white font-semibold transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent-300" />
              <span>{isEngineThinking ? 'Analyzing...' : 'Deep Re-Analyze'}</span>
            </button>
          </div>
        </div>

        {/* Right: Engine Calculation & Notation */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Engine Analysis Panel */}
          <div className="bg-canvas-card border border-canvas-border rounded-xl p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between border-b border-canvas-border/60 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-sm text-ivory">Stockfish Evaluation</span>
              </div>
              <span className="font-mono text-base font-extrabold text-accent-300">
                {formatEvaluation(currentEval, chess.turn())}
              </span>
            </div>

            {/* Depth & Speed */}
            <div className="flex items-center justify-between text-xs text-ivory-muted">
              <span>Depth: <strong className="text-ivory">{currentEval.depth || 14}</strong></span>
              {currentOpening && (
                <span className="text-purple-300 font-mono truncate max-w-[200px]">
                  {currentOpening.name} ({currentOpening.eco})
                </span>
              )}
            </div>

            {/* Principal Variation Line */}
            {principalVariation.length > 0 && (
              <div className="bg-canvas-subtle p-3 rounded-lg border border-canvas-border text-xs space-y-1">
                <span className="text-ivory-muted font-semibold block">Principal Continuation (PV):</span>
                <p className="font-mono text-amber-300 break-words leading-relaxed">
                  {principalVariation.slice(0, 8).join(' ')}
                </p>
              </div>
            )}
          </div>

          {/* Move History */}
          <div className="h-[360px]">
            <MoveList
              moves={moves}
              currentPly={currentPly}
              onSelectPly={handleSelectPly}
              isLive={currentPly === moves.length}
            />
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-canvas-card border border-canvas-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-ivory flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-400" />
              <span>Import Position or Game</span>
            </h2>

            <p className="text-xs text-ivory-muted leading-relaxed">
              Paste a standard FEN (e.g. <code className="text-amber-300">rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1</code>) or a full PGN game notation:
            </p>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <textarea
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
                rows={6}
                placeholder="Paste FEN or PGN here..."
                className="w-full bg-canvas-subtle border border-canvas-border rounded-xl p-3 text-xs font-mono text-ivory focus:outline-none focus:border-accent-500"
              />

              {importError && (
                <div className="p-2.5 bg-red-500/20 border border-red-500/40 rounded-lg text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-canvas hover:bg-canvas-hover text-ivory-muted text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-accent-600 hover:bg-accent-500 text-white text-xs font-bold rounded-lg transition-colors shadow-md"
                >
                  Load Position
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


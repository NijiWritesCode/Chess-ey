import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
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
  ChevronLast,
  BookOpen
} from 'lucide-react';
import { Chessboard } from '../../game/components/Chessboard';
import { MoveList } from '../../game/components/MoveList';
import { EvaluationBar } from '../../../components/board/EvaluationBar';
import { analysisEngine } from '../../../services/engine/stockfishService';
import { identifyOpening } from '../../../services/openings/openingBook';
import { formatEvaluation } from '../../../services/analysis/classifier';
import { settingsManager } from '../../../services/storage/settingsStore';
import { soundEngine } from '../../../utils/sound';
import {
  STARTING_FEN,
  isValidFen,
  applyMove,
  parsePgn,
  exportPgn,
  isInCheck
} from '../../game/domain/chessRules';

export function AnalysisBoardPage() {
  const location = useLocation();
  const initialPgn = location.state?.pgn || '';

  const [settings, setSettings] = useState(settingsManager.getAll());

  useEffect(() => {
    return settingsManager.subscribe(setSettings);
  }, []);

  // Board presentation & history state
  const [fen, setFen] = useState(STARTING_FEN);
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

  const evalGenerationRef = useRef(0);

  // Trigger evaluation for active position using the dedicated analysisEngine
  const evaluatePosition = useCallback(async (targetFen) => {
    evalGenerationRef.current += 1;
    const currentGen = evalGenerationRef.current;
    setIsEngineThinking(true);

    try {
      const res = await analysisEngine.evaluatePosition(targetFen, {
        depth: 14,
        movetime: 500
      });

      if (currentGen !== evalGenerationRef.current) return;

      if (res?.evaluation) {
        setCurrentEval(res.evaluation);
        setPrincipalVariation(res.evaluation.pv || []);
      }
      if (res?.bestMove && res.bestMove.length >= 4) {
        setBestMoveArrow({
          from: res.bestMove.slice(0, 2),
          to: res.bestMove.slice(2, 4)
        });
      } else {
        setBestMoveArrow(null);
      }
    } catch (e) {
      console.warn('Analysis eval error:', e);
    } finally {
      if (currentGen === evalGenerationRef.current) {
        setIsEngineThinking(false);
      }
    }
  }, []);

  // Load initial PGN if passed
  useEffect(() => {
    if (initialPgn) {
      try {
        const parsed = parsePgn(initialPgn);
        if (parsed.length > 0) {
          const moveItems = parsed.map((m, idx) => ({
            index: idx,
            moveNumber: Math.floor(idx / 2) + 1,
            ply: idx + 1,
            turn: m.color,
            san: m.san,
            from: m.from,
            to: m.to,
            fenBefore: m.before,
            fenAfter: m.after
          }));
          const finalFen = moveItems[moveItems.length - 1].fenAfter;
          setMoves(moveItems);
          setCurrentPly(moveItems.length);
          setFen(finalFen);
          const last = moveItems[moveItems.length - 1];
          setLastMove({ from: last.from, to: last.to });
          evaluatePosition(finalFen);
          return;
        }
      } catch (e) {
        console.warn('Initial PGN load failed', e);
      }
    }
    evaluatePosition(STARTING_FEN);
  }, [initialPgn, evaluatePosition]);

  // Handle freeform move on analysis board with variation branching
  const handleBoardMove = useCallback(
    ({ from, to, promotion = 'q' }) => {
      // Find the FEN from which the move is being played
      let baseFen = STARTING_FEN;
      let baseMoves = [];

      if (currentPly > 0 && currentPly <= moves.length) {
        baseFen = moves[currentPly - 1].fenAfter;
        baseMoves = moves.slice(0, currentPly);
      }

      const outcome = applyMove(baseFen, { from, to, promotion });
      if (!outcome.valid) return false;

      // Sound feedback
      if (outcome.isCheck) soundEngine.playCheck();
      else if (outcome.isCastle) soundEngine.playCastle();
      else if (outcome.captured) soundEngine.playCapture();
      else soundEngine.playMove();

      const newMoveItem = {
        index: baseMoves.length,
        moveNumber: Math.floor(baseMoves.length / 2) + 1,
        ply: baseMoves.length + 1,
        turn: outcome.turnBefore,
        san: outcome.san,
        from: outcome.from,
        to: outcome.to,
        fenBefore: baseFen,
        fenAfter: outcome.fen
      };

      const nextMoves = [...baseMoves, newMoveItem];
      setFen(outcome.fen);
      setMoves(nextMoves);
      setCurrentPly(nextMoves.length);
      setLastMove({ from, to });

      // Opening recognition
      try {
        const allSans = nextMoves.map((m) => m.san);
        const opening = identifyOpening(allSans, outcome.fen);
        setCurrentOpening(opening);
      } catch (e) {}

      evaluatePosition(outcome.fen);
      return true;
    },
    [currentPly, moves, evaluatePosition]
  );

  // Inspect ply from move list
  const handleSelectPly = useCallback(
    (ply) => {
      setCurrentPly(ply);
      if (ply === 0) {
        setFen(STARTING_FEN);
        setLastMove(null);
        evaluatePosition(STARTING_FEN);
      } else {
        const target = moves[ply - 1];
        if (target) {
          setFen(target.fenAfter);
          setLastMove({ from: target.from, to: target.to });
          evaluatePosition(target.fenAfter);
        }
      }
    },
    [moves, evaluatePosition]
  );

  // Reset board
  const handleResetBoard = () => {
    setFen(STARTING_FEN);
    setMoves([]);
    setCurrentPly(0);
    setLastMove(null);
    setCurrentOpening(null);
    evaluatePosition(STARTING_FEN);
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
    if (isValidFen(trimmed)) {
      setFen(trimmed);
      setMoves([]);
      setCurrentPly(0);
      setLastMove(null);
      evaluatePosition(trimmed);
      setShowImportModal(false);
      setImportInput('');
      return;
    }

    // Try PGN
    try {
      const parsed = parsePgn(trimmed);
      if (parsed.length > 0) {
        const moveItems = parsed.map((m, idx) => ({
          index: idx,
          moveNumber: Math.floor(idx / 2) + 1,
          ply: idx + 1,
          turn: m.color,
          san: m.san,
          from: m.from,
          to: m.to,
          fenBefore: m.before,
          fenAfter: m.after
        }));
        const finalFen = moveItems[moveItems.length - 1].fenAfter;
        setMoves(moveItems);
        setCurrentPly(moveItems.length);
        setFen(finalFen);
        const last = moveItems[moveItems.length - 1];
        setLastMove({ from: last.from, to: last.to });
        evaluatePosition(finalFen);
        setShowImportModal(false);
        setImportInput('');
        return;
      }
    } catch (err) {
      // Continue to error reporting below
    }

    setImportError('Invalid FEN or PGN format. Please verify the chess notation.');
  };

  const handleCopyFen = () => {
    navigator.clipboard.writeText(fen).then(() => {
      setCopiedFen(true);
      setTimeout(() => setCopiedFen(false), 2000);
    });
  };

  const handleCopyPgn = () => {
    const pgn = exportPgn(moves.map((m) => m.san), { Event: 'Analysis Board' });
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
            title="Copy FEN to clipboard"
          >
            {copiedFen ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">FEN</span>
          </button>

          <button
            onClick={handleCopyPgn}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-xs font-semibold text-ivory transition-colors"
            title="Copy PGN to clipboard"
          >
            {copiedPgn ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">PGN</span>
          </button>

          <button
            onClick={() => setBoardOrientation((prev) => (prev === 'white' ? 'black' : 'white'))}
            className="p-1 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-ivory transition-colors"
            title="Flip Board"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={handleResetBoard}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-canvas-card hover:bg-canvas-hover border border-canvas-border text-xs font-semibold text-ivory transition-colors"
            title="Reset to starting position"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 items-center py-1">
        {/* Evaluation Bar */}
        <div className="hidden lg:flex lg:col-span-1 justify-center h-full max-h-[75vh] py-1">
          <EvaluationBar
            evaluation={currentEval}
            orientation={boardOrientation}
            height="100%"
          />
        </div>

        {/* Center: Interactive Chessboard */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center h-full max-h-[78vh]">
          <div className="w-full max-w-[min(74vh,570px)] aspect-square flex items-center justify-center">
            <Chessboard
              fen={fen}
              orientation={boardOrientation}
              isInteractive={true}
              playerTurnColor={null} // Allows moving both White and Black freely
              onMove={handleBoardMove}
              bestMoveArrow={bestMoveArrow}
              lastMove={lastMove}
              themeId={settings.boardTheme}
              showLegalMoves={settings.showLegalMoves}
              showHighlights={settings.highlightLastMove}
            />
          </div>
        </div>

        {/* Right Sidebar: Engine Status, Principal Variation, Notation */}
        <div className="lg:col-span-4 flex flex-col h-full max-h-[78vh] gap-2">
          {/* Engine Evaluation Card */}
          <div className="bg-canvas-card border border-canvas-border rounded-xl p-3 shadow-sm shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent-400" />
                <span className="text-xs font-bold text-ivory uppercase tracking-wider">
                  Stockfish 16 WASM
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {isEngineThinking ? (
                  <span className="text-[11px] text-accent-400 animate-pulse font-medium">
                    Calculating...
                  </span>
                ) : (
                  <span className="text-[11px] text-ivory-muted font-mono">
                    Depth 14
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-baseline justify-between bg-canvas-subtle p-2.5 rounded-lg border border-canvas-border mb-2">
              <span className="text-xs text-ivory-muted">Score:</span>
              <span className="text-xl font-bold font-mono text-ivory">
                {formatEvaluation(currentEval)}
              </span>
            </div>

            {/* Principal Variation (Best Line) */}
            {principalVariation && principalVariation.length > 0 && (
              <div>
                <span className="text-[11px] text-ivory-muted block mb-1 font-medium">
                  Engine Line:
                </span>
                <p className="text-xs font-mono text-accent-200 bg-canvas-subtle p-2 rounded border border-canvas-border break-words max-h-16 overflow-y-auto leading-relaxed">
                  {principalVariation.slice(0, 8).join(' ')}
                </p>
              </div>
            )}
          </div>

          {/* Opening recognition chip */}
          {currentOpening && (
            <div className="bg-canvas-card border border-canvas-border rounded-xl px-3 py-1.5 text-xs flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-amber-400 font-bold shrink-0">{currentOpening.eco}</span>
                <span className="text-ivory font-medium truncate">{currentOpening.name}</span>
              </div>
            </div>
          )}

          {/* Move List */}
          <div className="flex-1 min-h-[160px] overflow-hidden">
            <MoveList
              moves={moves}
              currentPly={currentPly}
              onSelectPly={handleSelectPly}
              isLive={currentPly === moves.length}
              showDenotations={false}
            />
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-canvas-card border border-canvas-border rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-ivory mb-2 flex items-center gap-2">
              <Upload className="w-5 h-5 text-accent-400" />
              <span>Import Position or Game</span>
            </h2>
            <p className="text-xs text-ivory-muted mb-4">
              Paste a valid FEN string (position) or PGN notation (game history) below.
            </p>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <textarea
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
                placeholder="e.g. rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1 or 1. e4 e5 2. Nf3..."
                rows={4}
                className="w-full bg-canvas-subtle border border-canvas-border rounded-xl p-3 text-xs font-mono text-ivory placeholder:text-ivory-faint focus:outline-none focus:ring-1 focus:ring-accent-500"
              />

              {importError && (
                <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/30">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-ivory-muted hover:text-ivory transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-accent-600 hover:bg-accent-500 text-white transition-all shadow-md"
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

export default AnalysisBoardPage;

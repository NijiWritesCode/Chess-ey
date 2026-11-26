import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Bot, User, Sparkles, AlertCircle, RefreshCw, Trophy, RotateCcw, Flag, Shuffle, ChevronDown, ChevronUp } from 'lucide-react';
import { ChessboardWrapper } from '../components/board/ChessboardWrapper';
import { MoveList } from '../components/board/MoveList';
import { EvaluationBar } from '../components/board/EvaluationBar';
import { GameControls } from '../components/board/GameControls';
import { Clock } from '../components/board/Clock';
import { MoveExplanationCard } from '../components/board/MoveExplanationCard';
import { GameOverModal } from '../components/modals/GameOverModal';
import { SettingsModal } from '../components/modals/SettingsModal';
import { playEngine } from '../services/engine/stockfishService';
import { classifyMove } from '../services/analysis/classifier';
import { identifyOpening } from '../services/openings/openingBook';
import { soundEngine } from '../utils/sound';
import { settingsManager, TIME_CONTROLS } from '../services/storage/settingsStore';
import { gameStore } from '../services/storage/gameStore';
import { BOT_PERSONAS, getPersona } from '../data/botPersonas';
import { BotSelector } from '../components/board/BotSelector';
import { PersonaAvatar } from '../components/board/PersonaAvatar';

// Re-export BOT_LEVELS for backward compatibility with tests
export const BOT_LEVELS = BOT_PERSONAS.map(p => ({
  level: p.level,
  elo: p.elo,
  label: `${p.name} (~${p.elo} ELO)`,
  skillLevel: p.skillLevel,
  depth: p.depth,
  movetime: p.movetime,
  blunderChance: p.blunderChance
}));

export function ComputerGamePage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Settings
  const [settings, setSettings] = useState(settingsManager.getAll());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Match Configuration & Player Seating (supports Randomise Color)
  const [colorPreference, setColorPreference] = useState('random');
  const [initialColor] = useState(() => (Math.random() < 0.5 ? 'w' : 'b'));
  const [playerColor, setPlayerColor] = useState(initialColor); // 'w' | 'b' (authoritative seat)
  const [boardOrientation, setBoardOrientation] = useState(initialColor === 'b' ? 'black' : 'white'); // 'white' | 'black'
  const initialBotLevel = location.state?.botLevel || 1;
  const [botLevel, setBotLevel] = useState(initialBotLevel);
  const [selectedTimeControl, setSelectedTimeControl] = useState(TIME_CONTROLS[0]);
  const [showBotPicker, setShowBotPicker] = useState(false);

  // Active bot config
  const activeBotConfig = BOT_LEVELS.find((b) => b.level === botLevel) || BOT_LEVELS[0];
  const activePersona = getPersona(botLevel);

  // Chess Game State
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [moves, setMoves] = useState([]);
  const [currentPly, setCurrentPly] = useState(0);
  const [lastMove, setLastMove] = useState(null);
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [engineError, setEngineError] = useState(null);

  // Generation counter to protect async callbacks against stale game races
  const gameGenerationRef = useRef(0);
  const playerBestMoveRef = useRef(null);

  // Evaluation & Arrows
  const [currentEval, setCurrentEval] = useState({ cp: 20 });
  const [bestMoveArrow, setBestMoveArrow] = useState(null);
  const [selectedMoveForExplanation, setSelectedMoveForExplanation] = useState(null);

  // Clocks
  const [whiteTimeMs, setWhiteTimeMs] = useState(selectedTimeControl.initialSeconds * 1000);
  const [blackTimeMs, setBlackTimeMs] = useState(selectedTimeControl.initialSeconds * 1000);
  const [isGameActive, setIsGameActive] = useState(true);
  const [gameOverResult, setGameOverResult] = useState(null);

  // Opening info
  const [currentOpening, setCurrentOpening] = useState(null);

  // Subscribe to settings changes
  useEffect(() => {
    return settingsManager.subscribe(setSettings);
  }, []);

  // Initialize engine skill level and pre-warm worker on mount
  useEffect(() => {
    playEngine.init().catch(err => console.warn('Pre-warm engine error:', err));
    playEngine.setSkillLevel(activeBotConfig.skillLevel);
    if (activeBotConfig.elo) {
      playEngine.setElo(activeBotConfig.elo);
    }
  }, [activeBotConfig]);

  // Clock countdown timer
  useEffect(() => {
    if (!isGameActive || selectedTimeControl.initialSeconds === 0 || gameOverResult) return;

    const interval = setInterval(() => {
      const turn = chess.turn();
      if (turn === 'w') {
        setWhiteTimeMs((prev) => {
          if (prev <= 100) {
            handleTimeout('w');
            return 0;
          }
          return prev - 100;
        });
      } else {
        setBlackTimeMs((prev) => {
          if (prev <= 100) {
            handleTimeout('b');
            return 0;
          }
          return prev - 100;
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isGameActive, chess, selectedTimeControl, gameOverResult]);

  const handleTimeout = useCallback((color) => {
    setIsGameActive(false);
    const winner = color === 'w' ? 'black' : 'white';
    const result = { winner, reason: 'timeout' };
    setGameOverResult(result);
    soundEngine.playGameEnd();
    persistGame(result);
  }, []);

  // Save completed game snapshot to local storage
  const persistGame = async (result) => {
    const pgn = chess.pgn();
    const gameRecord = {
      id: `game_${Date.now()}`,
      timestamp: Date.now(),
      opponent: `${activePersona.name} (~${activePersona.elo} ELO)`,
      playerColor,
      result,
      movesCount: moves.length,
      opening: currentOpening?.name || 'Standard Game',
      eco: currentOpening?.eco || '',
      pgn,
      moves: [...moves]
    };
    try {
      await gameStore.saveGame(gameRecord);
    } catch (e) {
      console.warn('Could not save game locally', e);
    }
  };

  // Check game endings
  const checkGameOver = useCallback(() => {
    if (chess.isGameOver()) {
      setIsGameActive(false);
      let result = null;

      if (chess.isCheckmate()) {
        const winner = chess.turn() === 'w' ? 'black' : 'white';
        result = { winner, reason: 'checkmate' };
      } else if (chess.isStalemate()) {
        result = { winner: 'draw', reason: 'stalemate' };
      } else if (chess.isThreefoldRepetition()) {
        result = { winner: 'draw', reason: 'threefold' };
      } else if (chess.isInsufficientMaterial()) {
        result = { winner: 'draw', reason: 'insufficient' };
      } else if (chess.isDraw()) {
        result = { winner: 'draw', reason: 'fifty-move' };
      }

      setGameOverResult(result);
      soundEngine.playGameEnd();
      persistGame(result);
      return true;
    }
    return false;
  }, [chess]);

  // Execute authentic computer response calibrated to botLevel
  const triggerComputerMove = useCallback(async () => {
    if (chess.isGameOver() || gameOverResult) return;

    const currentGen = gameGenerationRef.current;
    setIsEngineThinking(true);
    setEngineError(null);

    const turn = chess.turn();
    const fenBefore = chess.fen();
    const preEval = { ...currentEval };

    try {
      const searchResult = await playEngine.evaluatePosition(fenBefore, {
        depth: activeBotConfig.depth,
        movetime: activeBotConfig.movetime,
        skillLevel: activeBotConfig.skillLevel,
        elo: activeBotConfig.elo,
        timeout: 4000
      });

      // Verify game generation hasn't changed while awaiting engine
      if (currentGen !== gameGenerationRef.current) return;

      const uci = searchResult?.bestMove;
      const engineEval = searchResult?.evaluation;

      // Retroactively update the previous player move with the authentic engine evaluation of fenBefore
      if (engineEval) {
        setMoves((prev) => {
          if (prev.length === 0) return prev;
          const lastIdx = prev.length - 1;
          const last = prev[lastIdx];
          if (last && last.turn === playerColor && last.fenAfter === fenBefore) {
            const chessBefore = new Chess(last.fenBefore);
            const chessAfter = new Chess(last.fenAfter);
            const prevOppMove = prev.length >= 2 ? prev[prev.length - 2] : null;
            const oppBlundered = Boolean(prevOppMove && ['blunder', 'mistake'].includes(prevOppMove.classification?.id));

            const accurateClass = classifyMove({
              playedMove: {
                from: last.from,
                to: last.to,
                piece: last.piece || chessBefore.get(last.from)?.type || 'p',
                captured: last.captured,
                san: last.san
              },
              engineBestMove: playerBestMoveRef.current || null,
              preEval: last.evalBefore || preEval,
              postEval: engineEval,
              turn: playerColor,
              isBook: last.isBook,
              legalMovesCount: last.legalMovesCount || 20,
              chessBefore,
              chessAfter,
              oppBlunderOnPrevTurn: oppBlundered
            });

            const updated = [...prev];
            const updatedItem = {
              ...last,
              classification: accurateClass.classification,
              cpLoss: accurateClass.cpLoss,
              winChanceLoss: accurateClass.winChanceLoss,
              evalAfter: engineEval
            };
            updated[lastIdx] = updatedItem;
            return updated;
          }
          return prev;
        });
      }

      let moveObj = null;
      const legalMoves = chess.moves({ verbose: true });

      if (!legalMoves || legalMoves.length === 0) {
        checkGameOver();
        return;
      }

      // For beginner and novice levels (~250 to 1400), inject natural human beginner variance
      let chosenMoveData = null;
      if (activeBotConfig.blunderChance > 0 && legalMoves.length > 1 && Math.random() < activeBotConfig.blunderChance) {
        // Filter out moves that hang immediate checkmate if possible, or select beginner move
        const nonEngineMoves = uci
          ? legalMoves.filter((m) => `${m.from}${m.to}` !== uci.slice(0, 4))
          : legalMoves;
        const candidatePool = nonEngineMoves.length > 0 ? nonEngineMoves : legalMoves;
        chosenMoveData = candidatePool[Math.floor(Math.random() * candidatePool.length)];
      }

      // If not injecting blunder, execute Stockfish's top calculation
      if (!chosenMoveData && uci && uci.length >= 4) {
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci[4] || 'q';
        chosenMoveData = { from, to, promotion };
      }

      // Execute selected move
      if (chosenMoveData) {
        try {
          moveObj = chess.move(chosenMoveData);
        } catch (e) {
          console.warn('Move execution warning:', e);
        }
      }

      // Fallback to first legal move if not played yet
      if (!moveObj && legalMoves.length > 0) {
        try {
          moveObj = chess.move(legalMoves[0]);
        } catch (e) {}
      }

      if (!moveObj) {
        if (chess.isGameOver()) {
          checkGameOver();
          return;
        }
        setEngineError('Stockfish engine did not return a move in time.');
        return;
      }

      const newFen = chess.fen();
      const isCapture = Boolean(moveObj.captured);
      const isCheck = chess.inCheck();
      const isCastle = moveObj.flags && (moveObj.flags.includes('k') || moveObj.flags.includes('q'));

      // Play sound
      if (isCheck) soundEngine.playCheck();
      else if (isCastle) soundEngine.playCastle();
      else if (isCapture) soundEngine.playCapture();
      else soundEngine.playMove();

      // Opening recognition with FEN transposition
      const allSans = chess.history();
      let opening = { name: 'Standard Game', isBookMove: false };
      try {
        opening = identifyOpening(allSans, newFen);
        setCurrentOpening(opening);
      } catch (e) {}

      const postEval = engineEval || { cp: 0 };
      setCurrentEval(postEval);

      // Classify computer move
      let classification = { classification: null, cpLoss: 0, isBook: false };
      try {
        classification = classifyMove({
          playedMove: moveObj,
          engineBestMove: uci || `${moveObj.from}${moveObj.to}`,
          preEval,
          postEval,
          turn,
          isBook: opening.isBookMove,
          legalMovesCount: legalMoves.length
        });
      } catch (e) {}

      const newMoveItem = {
        index: chess.history().length - 1,
        moveNumber: Math.floor((chess.history().length - 1) / 2) + 1,
        ply: chess.history().length,
        turn,
        san: moveObj.san,
        from: moveObj.from,
        to: moveObj.to,
        fenBefore,
        fenAfter: newFen,
        classification: classification.classification,
        cpLoss: classification.cpLoss,
        isBook: classification.isBook,
        evalAfter: postEval
      };

      setFen(newFen);
      setMoves((prev) => [...prev, newMoveItem]);
      setCurrentPly(chess.history().length);
      setLastMove({ from: moveObj.from, to: moveObj.to });
      setSelectedMoveForExplanation(newMoveItem);

      checkGameOver();
    } catch (err) {
      if (currentGen !== gameGenerationRef.current) return;
      console.error('Stockfish move error:', err);
      setEngineError('Stockfish calculation error.');
    } finally {
      if (currentGen === gameGenerationRef.current) {
        setIsEngineThinking(false);
      }
    }
  }, [chess, activeBotConfig, currentEval, checkGameOver, gameOverResult]);

  // Start new game or rematch (respects colorPreference or explicit choice)
  const handleStartNewGame = useCallback((colorChoice = colorPreference, level = botLevel, tc = selectedTimeControl) => {
    gameGenerationRef.current += 1;
    playEngine.stopSearch();
    chess.reset();

    let assigned = colorChoice;
    if (colorChoice === 'random') {
      assigned = Math.random() < 0.5 ? 'white' : 'black';
    }
    const colorChar = assigned === 'white' ? 'w' : 'b';

    setPlayerColor(colorChar);
    setBoardOrientation(assigned);
    setBotLevel(level);
    setSelectedTimeControl(tc);
    setFen(chess.fen());
    setMoves([]);
    setCurrentPly(0);
    setLastMove(null);
    setCurrentEval({ cp: 20 });
    setBestMoveArrow(null);
    setSelectedMoveForExplanation(null);
    setGameOverResult(null);
    setIsEngineThinking(false);
    setEngineError(null);
    setCurrentOpening(null);

    const ms = tc.initialSeconds * 1000;
    setWhiteTimeMs(ms);
    setBlackTimeMs(ms);
    setIsGameActive(true);

    const targetBot = BOT_LEVELS.find((b) => b.level === level) || BOT_LEVELS[0];
    playEngine.setSkillLevel(targetBot.skillLevel);
    if (targetBot.elo) {
      playEngine.setElo(targetBot.elo);
    }

    // If player is Black, Computer moves first!
    if (colorChar === 'b') {
      setTimeout(() => triggerComputerMove(), 300);
    }
  }, [colorPreference, botLevel, selectedTimeControl, chess, triggerComputerMove]);

  // If initialized as Black on initial mount, trigger computer's opening move
  useEffect(() => {
    if (initialColor === 'b' && moves.length === 0 && !gameOverResult) {
      const timer = setTimeout(() => {
        triggerComputerMove();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialColor, triggerComputerMove]);

  // Handle player's move
  const handlePlayerMove = useCallback(({ from, to, promotion = 'q' }) => {
    if (!isGameActive || gameOverResult || isEngineThinking) return false;
    if (chess.turn() !== playerColor) return false;

    const turn = chess.turn();
    const fenBefore = chess.fen();
    const preEval = { ...currentEval };
    const legalMovesCount = chess.moves().length;

    let moveObj = null;
    try {
      moveObj = chess.move({ from, to, promotion });
    } catch (e) {
      return false;
    }

    if (!moveObj) return false;

    const newFen = chess.fen();
    const isCapture = Boolean(moveObj.captured);
    const isCheck = chess.inCheck();
    const isCastle = moveObj.flags && (moveObj.flags.includes('k') || moveObj.flags.includes('q'));

    // Play sound immediately
    if (isCheck) soundEngine.playCheck();
    else if (isCastle) soundEngine.playCastle();
    else if (isCapture) soundEngine.playCapture();
    else soundEngine.playMove();

    // Opening book check with FEN transposition
    const allSans = chess.history();
    const opening = identifyOpening(allSans, newFen);
    setCurrentOpening(opening);

    playerBestMoveRef.current = bestMoveArrow ? `${bestMoveArrow.from}${bestMoveArrow.to}` : null;

    // Initial provisional classification
    const provisionalClass = classifyMove({
      playedMove: moveObj,
      engineBestMove: playerBestMoveRef.current,
      preEval,
      postEval: preEval,
      turn,
      isBook: opening.isBookMove,
      legalMovesCount,
      chessBefore: new Chess(fenBefore),
      chessAfter: new Chess(newFen)
    });

    const moveIndex = moves.length;
    const newMoveItem = {
      index: moveIndex,
      moveNumber: Math.floor(moveIndex / 2) + 1,
      ply: moveIndex + 1,
      turn: playerColor,
      san: moveObj.san,
      piece: moveObj.piece,
      captured: moveObj.captured,
      from,
      to,
      fenBefore,
      fenAfter: newFen,
      classification: provisionalClass.classification,
      cpLoss: 0,
      isBook: provisionalClass.isBook,
      evalBefore: preEval,
      evalAfter: preEval,
      legalMovesCount
    };

    setFen(newFen);
    setMoves((prev) => [...prev, newMoveItem]);
    setCurrentPly(moveIndex + 1);
    setLastMove({ from, to });
    setSelectedMoveForExplanation(newMoveItem);

    // Check game ending
    const isFinished = checkGameOver();

    if (!isFinished) {
      // Trigger computer turn after short natural pause (150ms)
      setTimeout(() => triggerComputerMove(), 150);
    }

    return true;
  }, [
    isGameActive,
    gameOverResult,
    isEngineThinking,
    chess,
    playerColor,
    currentEval,
    moves.length,
    checkGameOver,
    triggerComputerMove
  ]);

  // Undo move (reverts both player & bot turn)
  const handleUndo = useCallback(() => {
    if (!isGameActive || moves.length === 0 || isEngineThinking) return;

    // Undo twice to revert both computer and player
    chess.undo();
    chess.undo();

    const newMoves = moves.slice(0, -2);
    setMoves(newMoves);
    setFen(chess.fen());
    setCurrentPly(newMoves.length);
    setLastMove(newMoves.length > 0 ? { from: newMoves[newMoves.length - 1].from, to: newMoves[newMoves.length - 1].to } : null);
    setSelectedMoveForExplanation(newMoves.length > 0 ? newMoves[newMoves.length - 1] : null);
  }, [isGameActive, moves, isEngineThinking, chess]);

  // Resign active game immediately
  const handleResign = useCallback(() => {
    if (gameOverResult) return;
    gameGenerationRef.current += 1;
    playEngine.stopSearch();
    setIsEngineThinking(false);
    setIsGameActive(false);
    const winner = playerColor === 'w' ? 'black' : 'white';
    const result = { winner, reason: 'resignation' };
    setGameOverResult(result);
    soundEngine.playGameEnd();
    persistGame(result);
  }, [gameOverResult, playerColor]);

  // Inspect previous position in move list
  const handleSelectPly = (ply) => {
    setCurrentPly(ply);
    if (ply === 0) {
      setFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      setSelectedMoveForExplanation(null);
    } else {
      const targetMove = moves[ply - 1];
      if (targetMove) {
        setFen(targetMove.fenAfter);
        setSelectedMoveForExplanation(targetMove);
      }
    }
  };

  // Launch full Game Review
  const handleStartReview = () => {
    const pgn = chess.pgn();
    navigate('/review', {
      state: {
        pgn,
        moves,
        playerColor,
        whiteName: playerColor === 'w' ? 'You' : activePersona.name,
        blackName: playerColor === 'b' ? 'You' : activePersona.name,
        result: gameOverResult
      }
    });
  };

  const currentMove = currentPly > 0 && moves[currentPly - 1] ? moves[currentPly - 1] : null;
  const currentClassification = currentMove ? currentMove.classification : null;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-1.5 h-[calc(100dvh-55px)] overflow-hidden flex flex-col justify-between">
      {/* Top Banner: Opponent Persona & Match Controls */}
      <div className="bg-canvas-card border border-canvas-border rounded-xl px-3 py-1.5 mb-1.5 flex items-center justify-between gap-2 shadow-sm shrink-0">
        {/* Left: Current opponent persona */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowBotPicker(!showBotPicker)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            title="Change opponent"
          >
            <div className="rounded-lg overflow-hidden border border-canvas-border">
              <PersonaAvatar persona={activePersona} size={32} />
            </div>
            <div>
              <span className="font-bold text-xs sm:text-sm text-ivory block leading-tight">
                {activePersona.name}
              </span>
              <span className="text-[10px] text-ivory-muted leading-tight">
                {activePersona.elo} ELO{activePersona.title ? ` · ${activePersona.title}` : ''}
              </span>
            </div>
            {showBotPicker ? <ChevronUp className="w-3.5 h-3.5 text-ivory-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-ivory-muted" />}
          </button>

          {currentOpening && (
            <div className="hidden sm:flex items-center gap-2 border-l border-canvas-border pl-3 text-xs">
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold text-[10px]">
                {currentOpening.eco || 'ECO'}
              </span>
              <span className="text-ivory font-medium truncate max-w-xs text-xs">
                {currentOpening.name}
              </span>
            </div>
          )}
        </div>

        {/* Right: Color Preference Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-canvas-subtle p-0.5 rounded-lg border border-canvas-border text-[11px]">
            <button
              type="button"
              onClick={() => {
                setColorPreference('white');
                handleStartNewGame('white');
              }}
              className={`px-2 py-0.5 rounded font-medium transition-all ${
                colorPreference === 'white'
                  ? 'bg-accent-600 text-white font-bold shadow-sm'
                  : 'text-ivory-muted hover:text-ivory'
              }`}
              title="Play as White"
            >
              ⚪ White
            </button>
            <button
              type="button"
              onClick={() => {
                setColorPreference('random');
                handleStartNewGame('random');
              }}
              className={`px-2 py-0.5 rounded font-medium transition-all flex items-center gap-1 ${
                colorPreference === 'random'
                  ? 'bg-accent-600 text-white font-bold shadow-sm'
                  : 'text-ivory-muted hover:text-ivory'
              }`}
              title="Randomise Color"
            >
              <Shuffle className="w-3 h-3" />
              <span>Random</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setColorPreference('black');
                handleStartNewGame('black');
              }}
              className={`px-2 py-0.5 rounded font-medium transition-all ${
                colorPreference === 'black'
                  ? 'bg-accent-600 text-white font-bold shadow-sm'
                  : 'text-ivory-muted hover:text-ivory'
              }`}
              title="Play as Black"
            >
              ⚫ Black
            </button>
          </div>
        </div>
      </div>

      {/* Bot Persona Picker (expandable) */}
      {showBotPicker && (
        <div className="bg-canvas-card border border-canvas-border rounded-xl px-3 py-3 mb-1.5 shadow-lg shrink-0 max-h-[280px] overflow-y-auto">
          <BotSelector
            selectedLevel={botLevel}
            onSelectBot={(lvl) => {
              setShowBotPicker(false);
              handleStartNewGame(colorPreference, lvl);
            }}
          />
        </div>
      )}

      {/* Engine Error Warning */}
      {engineError && (
        <div className="bg-amber-500/20 border border-amber-500/50 rounded-xl px-3 py-1.5 mb-1.5 flex items-center justify-between gap-2 text-xs text-amber-200 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{engineError}</span>
          </div>
          <button
            onClick={() => triggerComputerMove()}
            className="px-2.5 py-1 bg-amber-500/30 hover:bg-amber-500/50 border border-amber-400/50 rounded-lg text-amber-100 font-semibold flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Engine Move</span>
          </button>
        </div>
      )}

      {/* Main Arena: Desktop Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-6 items-start flex-1 min-h-0">
        {/* Left / Center: Chessboard Area (Viewport-fit with NO scrolling) */}
        <div className="lg:col-span-8 flex flex-col items-center justify-between h-full min-h-0">
          {/* Top Player (Opponent Persona) Bar */}
          <div className="w-full max-w-[560px] flex items-center justify-between pb-1 px-1 shrink-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg overflow-hidden border border-canvas-border shadow-sm">
                <PersonaAvatar persona={activePersona} size={30} />
              </div>
              <div>
                <div className="flex items-center gap-1.5 leading-tight">
                  <span className="font-bold text-xs text-ivory">
                    {activePersona.name}
                  </span>
                  <span className="text-[10px] text-accent-400 font-mono font-bold">
                    ({activePersona.elo} ELO)
                  </span>
                  <span className="text-[9px] text-ivory-muted uppercase hidden sm:inline">
                    · {activePersona.gender}
                  </span>
                </div>
                {isEngineThinking ? (
                  <span className="text-[10px] text-accent-300 flex items-center gap-1 font-mono leading-tight mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
                    <span>Thinking...</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-ivory-muted leading-tight block">
                    {playerColor === 'w' ? 'Black' : 'White'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBotPicker((prev) => !prev)}
                className="px-2 py-0.5 rounded bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-[11px] text-ivory-muted hover:text-ivory transition-colors"
                title="Switch bot opponent"
              >
                Change Bot
              </button>

              <Clock
                timeMs={playerColor === 'w' ? blackTimeMs : whiteTimeMs}
                isActive={isGameActive && chess.turn() !== playerColor}
                player={activePersona.name.split(' ')[0]}
              />
            </div>
          </div>

          {/* Board with Evaluation Bar (Sized to fit perfectly on screen) */}
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
              isInteractive={isGameActive && currentPly === moves.length && chess.turn() === playerColor && !isEngineThinking}
              playerTurnColor={playerColor}
              onMove={handlePlayerMove}
              bestMoveArrow={bestMoveArrow}
              lastMove={lastMove}
              lastMoveClassification={settings.enableLiveAnalysis ? currentClassification : null}
              themeId={settings.boardTheme}
              showLegalMoves={settings.showLegalMoves}
              showHighlights={settings.highlightLastMove}
            />
          </div>

          {/* Bottom Player (User) Bar */}
          <div className="w-full max-w-[560px] flex items-center justify-between pt-1 px-1 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-accent-600/30 border border-accent-500/40 flex items-center justify-center text-accent-200">
                <User className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-xs text-ivory block leading-tight">You</span>
                <span className="text-[10px] text-ivory-muted leading-tight">
                  {playerColor === 'w' ? 'White' : 'Black'} &bull; {chess.turn() === playerColor ? 'Your turn' : 'Waiting...'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isGameActive && !gameOverResult && (
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
                isActive={isGameActive && chess.turn() === playerColor}
                player="You"
              />
            </div>
          </div>

          {/* Bottom Controls with prominent Rematch and Resign */}
          <div className="w-full max-w-[550px] pt-1.5 shrink-0">
            <GameControls
              onFlipBoard={() => setBoardOrientation((prev) => (prev === 'white' ? 'black' : 'white'))}
              onResign={handleResign}
              onRematch={() => handleStartNewGame(colorPreference)}
              onUndo={handleUndo}
              canUndo={moves.length >= 2}
              isLiveAnalysisEnabled={settings.enableLiveAnalysis}
              onToggleLiveAnalysis={() => settingsManager.update({ enableLiveAnalysis: !settings.enableLiveAnalysis })}
              onOpenSettings={() => setIsSettingsOpen(true)}
              pgn={chess.pgn()}
              isMultiplayer={false}
              isGameOver={Boolean(gameOverResult)}
            />
          </div>
        </div>

        {/* Right: Live Move History & Analysis Card */}
        <div className="lg:col-span-4 flex flex-col gap-2 h-full min-h-0">
          {/* Explanation Card */}
          {settings.enableLiveAnalysis && (
            <div className="shrink-0">
              <MoveExplanationCard
                selectedMove={selectedMoveForExplanation}
                onPlaySuggestedLine={null}
              />
            </div>
          )}

          {/* Notation Panel */}
          <div className="flex-1 min-h-[180px] overflow-hidden">
            <MoveList
              moves={moves}
              currentPly={currentPly}
              onSelectPly={handleSelectPly}
              isLive={currentPly === moves.length}
              showDenotations={settings.enableLiveAnalysis}
            />
          </div>
        </div>
      </div>

      {/* Game Over Modal with Rematch as top primary button */}
      <GameOverModal
        isOpen={Boolean(gameOverResult)}
        result={gameOverResult}
        playerColor={playerColor}
        whiteName={playerColor === 'w' ? 'You' : activePersona.name}
        blackName={playerColor === 'b' ? 'You' : activePersona.name}
        onStartReview={handleStartReview}
        onRematch={() => handleStartNewGame(colorPreference)}
        onNewGame={() => handleStartNewGame(colorPreference)}
        onOpenAnalysis={() => navigate('/analysis', { state: { pgn: chess.pgn() } })}
        onClose={() => setGameOverResult(null)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}


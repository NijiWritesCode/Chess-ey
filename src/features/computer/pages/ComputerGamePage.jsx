import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bot, User, Sparkles, AlertCircle, RefreshCw, Trophy, RotateCcw, Flag, Shuffle, ChevronDown, ChevronUp } from 'lucide-react';
import { useGameSession } from '../../game/hooks/useGameSession';
import { GAME_STATUS } from '../../game/domain/gameReducer';
import { Chessboard } from '../../game/components/Chessboard';
import { MoveList } from '../../game/components/MoveList';
import { GameControls } from '../../game/components/GameControls';
import { Clock } from '../../game/components/Clock';
import { GameOverModal } from '../../game/components/GameOverModal';
import { EvaluationBar } from '../../../components/board/EvaluationBar';
import { MoveExplanationCard } from '../../../components/board/MoveExplanationCard';
import { SettingsModal } from '../../../components/modals/SettingsModal';
import { BotSelector } from '../../../components/board/BotSelector';
import { PersonaAvatar } from '../../../components/board/PersonaAvatar';
import { computeBotMove } from '../botController';
import { playEngine } from '../../../services/engine/stockfishService';
import { classifyMove, calculateAccuracy } from '../../../services/analysis/classifier';
import { identifyOpening } from '../../../services/openings/openingBook';
import { soundEngine } from '../../../utils/sound';
import { settingsManager, TIME_CONTROLS } from '../../../services/storage/settingsStore';
import { gameStore } from '../../../services/storage/gameStore';
import { BOT_PERSONAS, getPersona } from '../../../data/botPersonas';

// Re-export BOT_LEVELS for full backward compatibility
export const BOT_LEVELS = BOT_PERSONAS.map((p) => ({
  level: p.level,
  name: p.name,
  elo: p.elo,
  label: `${p.name} (~${p.elo} ELO)`,
  skillLevel: p.skillLevel,
  depth: p.depth,
  movetime: p.movetime,
  blunderChance: p.blunderChance,
  maxBookPlies: p.maxBookPlies
}));

export function ComputerGamePage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Settings
  const [settings, setSettings] = useState(settingsManager.getAll());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLiveAnalysisEnabled, setIsLiveAnalysisEnabled] = useState(false);
  const [isGameOverDismissed, setIsGameOverDismissed] = useState(false);

  // Match Configuration & Seating
  const [colorPreference, setColorPreference] = useState('random');
  const [initialColor] = useState(() => (Math.random() < 0.5 ? 'w' : 'b'));
  const [playerColor, setPlayerColor] = useState(initialColor);
  const [boardOrientation, setBoardOrientation] = useState(initialColor === 'b' ? 'black' : 'white');
  const initialBotLevel = location.state?.botLevel || 1;
  const [botLevel, setBotLevel] = useState(initialBotLevel);
  const [selectedTimeControl, setSelectedTimeControl] = useState(TIME_CONTROLS[0]);
  const [showBotPicker, setShowBotPicker] = useState(false);

  // Bot persona config
  const activeBotConfig = BOT_LEVELS.find((b) => b.level === botLevel) || BOT_LEVELS[0];
  const activePersona = getPersona(botLevel);

  // Generation counter to protect async bot callbacks against stale game races
  const gameGenerationRef = useRef(0);
  const savedGameIdRef = useRef(null);
  const botTimerRef = useRef(null);
  const isEngineThinkingRef = useRef(false);

  // Authoritative Game Session Hook from Phase 1
  const session = useGameSession({
    initialTimeMs: selectedTimeControl.initialSeconds * 1000,
    incrementMs: selectedTimeControl.increment * 1000,
    playerWhite: playerColor === 'w' ? 'You' : activePersona.name,
    playerBlack: playerColor === 'b' ? 'You' : activePersona.name
  });

  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Bot thinking state & error
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [engineError, setEngineError] = useState(null);

  // Clocks
  const [whiteTimeMs, setWhiteTimeMs] = useState(selectedTimeControl.initialSeconds * 1000);
  const [blackTimeMs, setBlackTimeMs] = useState(selectedTimeControl.initialSeconds * 1000);

  // Live Analysis & opening details
  const [currentEval, setCurrentEval] = useState({ cp: 20 });
  const [bestMoveArrow, setBestMoveArrow] = useState(null);
  const [currentOpening, setCurrentOpening] = useState(null);
  const [selectedMoveForExplanation, setSelectedMoveForExplanation] = useState(null);
  const [matchAccuracies, setMatchAccuracies] = useState({ white: null, black: null });

  // Subscribe to settings changes
  useEffect(() => {
    return settingsManager.subscribe(setSettings);
  }, []);

  // Pre-warm Stockfish engine on mount
  useEffect(() => {
    playEngine.init().catch((err) => console.warn('Pre-warm engine error:', err));
    playEngine.setSkillLevel(activeBotConfig.skillLevel);
    if (activeBotConfig.elo) {
      playEngine.setElo(activeBotConfig.elo);
    }
  }, [activeBotConfig]);

  // Clock countdown timer
  useEffect(() => {
    if (
      session.status !== GAME_STATUS.ACTIVE ||
      selectedTimeControl.initialSeconds === 0 ||
      session.isGameOver
    ) {
      return;
    }

    const interval = setInterval(() => {
      const turn = sessionRef.current.turn;
      if (turn === 'w') {
        setWhiteTimeMs((prev) => {
          if (prev <= 100) {
            sessionRef.current.timeout('w');
            return 0;
          }
          return prev - 100;
        });
      } else {
        setBlackTimeMs((prev) => {
          if (prev <= 100) {
            sessionRef.current.timeout('b');
            return 0;
          }
          return prev - 100;
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [session.status, session.turn, session.isGameOver, selectedTimeControl.id]);

  // Persist completed game to local IndexedDB store
  const persistGame = useCallback(
    async (result) => {
      const currentSession = sessionRef.current;
      const pgn = currentSession.state.pgn;
      const gameId = `game_${Date.now()}`;
      savedGameIdRef.current = gameId;
      const gameRecord = {
        id: gameId,
        gameMode: 'computer',
        timestamp: Date.now(),
        opponent: `${activePersona.name} (~${activePersona.elo} ELO)`,
        playerColor,
        players: {
          white: { name: playerColor === 'w' ? 'You' : activePersona.name, isBot: playerColor !== 'w' },
          black: { name: playerColor === 'b' ? 'You' : activePersona.name, isBot: playerColor !== 'b' }
        },
        result,
        movesCount: currentSession.moves.length,
        opening: currentOpening?.name || 'Standard Game',
        eco: currentOpening?.eco || '',
        pgn,
        moves: [...currentSession.moves]
      };
      try {
        await gameStore.saveGame(gameRecord);
      } catch (e) {
        console.warn('Could not save game locally', e);
      }
    },
    [activePersona, playerColor, currentOpening]
  );

  // Monitor game over events and handle game-end effects
  useEffect(() => {
    if (session.isGameOver && session.result) {
      soundEngine.playGameEnd();
      persistGame(session.result);

      if (session.moves.length > 0) {
        const whiteMoves = session.moves.filter((_, idx) => idx % 2 === 0);
        const blackMoves = session.moves.filter((_, idx) => idx % 2 === 1);
        const wAcc = calculateAccuracy(whiteMoves);
        const bAcc = calculateAccuracy(blackMoves);
        setMatchAccuracies({ white: wAcc, black: bAcc });
      }
    }
  }, [session.isGameOver, session.result, persistGame, session.moves]);

  // Reactive Sound Effects & Opening Recognition on any move
  const prevMovesCountRef = useRef(session.moves.length);
  useEffect(() => {
    if (session.moves.length > prevMovesCountRef.current) {
      const lastMoveRecord = session.moves[session.moves.length - 1];
      if (session.isCheck) soundEngine.playCheck();
      else if (lastMoveRecord?.isCastle) soundEngine.playCastle();
      else if (lastMoveRecord?.captured) soundEngine.playCapture();
      else soundEngine.playMove();

      try {
        const allSans = session.moves.map((m) => m.san);
        const opening = identifyOpening(allSans, session.state.fen);
        setCurrentOpening(opening);
      } catch (e) {}
    }
    prevMovesCountRef.current = session.moves.length;
  }, [session.moves, session.isCheck, session.state.fen]);

  // Bot move trigger
  const triggerComputerMove = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (currentSession.status !== GAME_STATUS.ACTIVE || currentSession.isGameOver) return;
    if (isEngineThinkingRef.current) return;

    const currentGen = gameGenerationRef.current;
    isEngineThinkingRef.current = true;
    setIsEngineThinking(true);
    setEngineError(null);

    const fenBefore = currentSession.state.fen;
    const allSans = currentSession.moves.map((m) => m.san);

    try {
      const result = await computeBotMove(fenBefore, activeBotConfig, {
        isCancelled: () => currentGen !== gameGenerationRef.current,
        timeout: 4000,
        playedSans: allSans,
        persona: activePersona
      });

      if (currentGen !== gameGenerationRef.current || !result || !result.move) {
        return;
      }

      // Execute bot move in authoritative game session
      const moveSuccess = sessionRef.current.makeMove(result.move);
      if (moveSuccess) {
        if (result.evaluation) {
          setCurrentEval(result.evaluation);
        }
      } else {
        setEngineError('Stockfish engine attempted an invalid move.');
      }
    } catch (err) {
      console.warn('Bot computation error:', err);
      setEngineError('Stockfish calculation encountered an issue.');
    } finally {
      if (currentGen === gameGenerationRef.current) {
        isEngineThinkingRef.current = false;
        setIsEngineThinking(false);
      }
    }
  }, [activeBotConfig]);

  // Check if it's the computer's turn to play
  useEffect(() => {
    const isBotTurn =
      session.status === GAME_STATUS.ACTIVE &&
      !session.isGameOver &&
      session.turn !== playerColor;

    if (!isBotTurn) {
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }
      return;
    }

    if (!isEngineThinking && !botTimerRef.current) {
      botTimerRef.current = setTimeout(() => {
        botTimerRef.current = null;
        triggerComputerMove();
      }, 150);
    }
  }, [session.status, session.turn, session.isGameOver, playerColor, isEngineThinking, triggerComputerMove]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current);
      }
      playEngine.stopSearch();
    };
  }, []);

  // Player move handler
  const handlePlayerMove = useCallback(
    ({ from, to, promotion = 'q' }) => {
      if (
        session.status !== GAME_STATUS.ACTIVE ||
        session.isGameOver ||
        isEngineThinking ||
        session.turn !== playerColor
      ) {
        return false;
      }

      return session.makeMove({ from, to, promotion });
    },
    [session.status, session.isGameOver, isEngineThinking, session.turn, playerColor, session.makeMove]
  );

  // Undo move (reverts both player & bot turn)
  const handleUndo = useCallback(() => {
    if (session.moves.length === 0) return;

    gameGenerationRef.current += 1;
    if (botTimerRef.current) {
      clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
    playEngine.stopSearch();
    isEngineThinkingRef.current = false;
    setIsEngineThinking(false);

    // If it's player's turn, undo 2 plies (bot's move + player's move)
    // If it was bot's turn (bot was thinking), undo 1 ply (player's move)
    if (session.turn === playerColor && session.moves.length >= 2) {
      session.undoMove(2);
    } else {
      session.undoMove(1);
    }
  }, [session.moves.length, session.turn, playerColor, session.undoMove]);

  // Resign active match
  const handleResign = useCallback(() => {
    if (session.isGameOver) return;
    gameGenerationRef.current += 1;
    if (botTimerRef.current) {
      clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
    playEngine.stopSearch();
    isEngineThinkingRef.current = false;
    setIsEngineThinking(false);
    session.resign(playerColor);
  }, [session.isGameOver, playerColor, session.resign]);

  // Restart match with fresh state
  const handleRestart = useCallback(
    (forcedColor, newTimeControl) => {
      gameGenerationRef.current += 1;
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }
      playEngine.stopSearch();
      isEngineThinkingRef.current = false;
      setIsEngineThinking(false);

      const tc = newTimeControl || selectedTimeControl;
      const newColor =
        forcedColor ||
        (colorPreference === 'random'
          ? Math.random() < 0.5
            ? 'w'
            : 'b'
          : colorPreference === 'white'
          ? 'w'
          : 'b');

      setPlayerColor(newColor);
      setBoardOrientation(newColor === 'b' ? 'black' : 'white');
      setWhiteTimeMs(tc.initialSeconds * 1000);
      setBlackTimeMs(tc.initialSeconds * 1000);
      setCurrentOpening(null);
      setSelectedMoveForExplanation(null);
      setEngineError(null);
      setIsGameOverDismissed(false);
      setMatchAccuracies({ white: null, black: null });

      session.resetGame({
        initialTimeMs: tc.initialSeconds * 1000,
        incrementMs: tc.increment * 1000,
        whitePlayer: {
          name: newColor === 'w' ? 'You' : activePersona.name,
          type: newColor === 'w' ? 'human' : 'bot'
        },
        blackPlayer: {
          name: newColor === 'b' ? 'You' : activePersona.name,
          type: newColor === 'b' ? 'human' : 'bot'
        }
      });
    },
    [colorPreference, selectedTimeControl, activePersona, session.resetGame]
  );

  // Select persona from picker
  const handleSelectBot = (level) => {
    setBotLevel(level);
    setShowBotPicker(false);
    gameGenerationRef.current += 1;
    if (botTimerRef.current) {
      clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
    playEngine.stopSearch();
    isEngineThinkingRef.current = false;
    setIsEngineThinking(false);

    const persona = getPersona(level);
    const newColor =
      colorPreference === 'random'
        ? Math.random() < 0.5
          ? 'w'
          : 'b'
        : colorPreference === 'white'
        ? 'w'
        : 'b';

    setPlayerColor(newColor);
    setBoardOrientation(newColor === 'b' ? 'black' : 'white');
    setWhiteTimeMs(selectedTimeControl.initialSeconds * 1000);
    setBlackTimeMs(selectedTimeControl.initialSeconds * 1000);
    setCurrentOpening(null);
    setSelectedMoveForExplanation(null);
    setEngineError(null);

    session.resetGame({
      initialTimeMs: selectedTimeControl.initialSeconds * 1000,
      incrementMs: selectedTimeControl.increment * 1000,
      whitePlayer: {
        name: newColor === 'w' ? 'You' : persona.name,
        type: newColor === 'w' ? 'human' : 'bot'
      },
      blackPlayer: {
        name: newColor === 'b' ? 'You' : persona.name,
        type: newColor === 'b' ? 'human' : 'bot'
      }
    });
  };

  // Launch full Game Review
  const handleStartReview = () => {
    if (savedGameIdRef.current) {
      navigate(`/review/${savedGameIdRef.current}`);
    } else {
      navigate('/review', {
        state: {
          pgn: session.state.pgn,
          moves: session.moves,
          playerColor,
          whiteName: playerColor === 'w' ? 'You' : activePersona.name,
          blackName: playerColor === 'b' ? 'You' : activePersona.name,
          result: session.result
        }
      });
    }
  };

  // Historical move selection
  const handleSelectPly = (ply) => {
    session.navigatePly(ply);
    if (ply > 0 && session.moves[ply - 1]) {
      setSelectedMoveForExplanation(session.moves[ply - 1]);
    } else {
      setSelectedMoveForExplanation(null);
    }
  };

  const currentMove =
    session.currentPly > 0 && session.moves[session.currentPly - 1]
      ? session.moves[session.currentPly - 1]
      : null;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-1.5 h-[calc(100dvh-55px)] overflow-hidden flex flex-col justify-between">
      {/* Top Banner: Opponent Persona & Match Controls */}
      <div className="bg-canvas-card border border-canvas-border rounded-xl px-3 py-1.5 mb-1.5 flex items-center justify-between gap-2 shadow-sm shrink-0">
        {/* Left: Current opponent persona */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBotPicker((prev) => !prev)}
            className="flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-canvas-hover border border-canvas-border transition-all text-left"
            title="Choose Bot Opponent"
          >
            <div className="relative">
              <PersonaAvatar
                avatarId={activePersona.avatarId}
                name={activePersona.name}
                size="md"
                gender={activePersona.gender}
                skinTone={activePersona.skinTone}
                hairColor={activePersona.hairColor}
                shirtColor={activePersona.shirtColor}
                bgColor={activePersona.bgColor}
              />
              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-canvas-card rounded-full" />
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-ivory">{activePersona.name}</span>
                <span className="text-[10px] bg-canvas-subtle border border-canvas-border text-ivory-muted px-1.5 py-0.2 rounded font-mono font-medium">
                  ~{activePersona.elo} ELO
                </span>
                {showBotPicker ? (
                  <ChevronUp className="w-3.5 h-3.5 text-ivory-muted" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-ivory-muted" />
                )}
              </div>
              <span className="text-[11px] text-ivory-muted block line-clamp-1">
                {activePersona.title}
              </span>
            </div>
          </button>

          {/* Engine thinking indicator */}
          {isEngineThinking && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-500/10 border border-accent-500/30 text-accent-300 text-xs animate-pulse">
              <Sparkles className="w-3 h-3 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
        </div>

        {/* Right: Quick Match Controls (Color, Time Control, Rematch) */}
        <div className="flex items-center gap-2">
          {/* Color Switcher */}
          <div className="flex items-center bg-canvas-subtle border border-canvas-border rounded-lg p-0.5">
            <button
              onClick={() => {
                setColorPreference('white');
                handleRestart('w');
              }}
              className={`p-1.5 rounded text-xs font-semibold transition-colors ${
                playerColor === 'w' && colorPreference !== 'random'
                  ? 'bg-canvas-card text-white shadow-sm'
                  : 'text-ivory-muted hover:text-white'
              }`}
              title="Play as White"
            >
              ♔
            </button>
            <button
              onClick={() => {
                setColorPreference('random');
                handleRestart();
              }}
              className={`p-1.5 rounded text-xs font-semibold transition-colors ${
                colorPreference === 'random'
                  ? 'bg-canvas-card text-white shadow-sm'
                  : 'text-ivory-muted hover:text-white'
              }`}
              title="Random Color"
            >
              <Shuffle className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                setColorPreference('black');
                handleRestart('b');
              }}
              className={`p-1.5 rounded text-xs font-semibold transition-colors ${
                playerColor === 'b' && colorPreference !== 'random'
                  ? 'bg-canvas-card text-white shadow-sm'
                  : 'text-ivory-muted hover:text-white'
              }`}
              title="Play as Black"
            >
              ♚
            </button>
          </div>

          {/* Time control dropdown */}
          <select
            value={selectedTimeControl.id}
            onChange={(e) => {
              const tc = TIME_CONTROLS.find((t) => t.id === e.target.value) || TIME_CONTROLS[0];
              setSelectedTimeControl(tc);
              handleRestart(null, tc);
            }}
            className="bg-canvas-subtle border border-canvas-border text-ivory text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-500 font-medium"
          >
            {TIME_CONTROLS.map((tc) => (
              <option key={tc.id} value={tc.id}>
                {tc.name} ({tc.category})
              </option>
            ))}
          </select>

          {/* Restart button */}
          <button
            onClick={() => handleRestart()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-canvas-subtle hover:bg-canvas-hover border border-canvas-border text-xs font-semibold text-ivory transition-colors"
            title="Start New Game"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Restart</span>
          </button>
        </div>
      </div>

      {/* Bot Selector Drawer / Overlay */}
      {showBotPicker && (
        <div className="mb-2 z-40 bg-canvas-card border border-canvas-border rounded-xl p-3 shadow-xl max-h-72 overflow-y-auto">
          <BotSelector
            currentLevel={botLevel}
            onSelectBot={handleSelectBot}
            onClose={() => setShowBotPicker(false)}
          />
        </div>
      )}

      {/* Main Board Layout: EvalBar, Chessboard, MoveList & Controls */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 items-center">
        {/* Left: Evaluation Bar (shown if enabled) */}
        {isLiveAnalysisEnabled && settings.showEvalBar && (
          <div className="hidden lg:flex lg:col-span-1 justify-center h-full max-h-[72vh] py-1">
            <EvaluationBar
              evaluation={currentEval}
              orientation={boardOrientation}
              height="100%"
            />
          </div>
        )}

        {/* Center: Opponent bar, Chessboard, Player bar */}
        <div
          className={`${
            isLiveAnalysisEnabled && settings.showEvalBar ? 'lg:col-span-7' : 'lg:col-span-8'
          } flex flex-col items-center justify-center h-full max-h-[78vh]`}
        >
          {/* Opponent Player Bar */}
          <div className="w-full max-w-[min(72vh,560px)] flex items-center justify-between px-2 py-1 mb-1 text-xs">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-ivory-muted" />
              <span className="font-semibold text-ivory">{activePersona.name}</span>
              <span className="text-ivory-muted text-[11px] font-mono">
                ({playerColor === 'w' ? 'Black' : 'White'})
              </span>
            </div>
            {selectedTimeControl.initialSeconds > 0 && (
              <Clock
                timeMs={playerColor === 'w' ? blackTimeMs : whiteTimeMs}
                isActive={
                  session.status === GAME_STATUS.ACTIVE &&
                  !session.isGameOver &&
                  session.turn !== playerColor
                }
                player={activePersona.name}
                onTimeout={() => session.timeout(playerColor === 'w' ? 'b' : 'w')}
              />
            )}
          </div>

          {/* Reusable, Authoritative Chessboard */}
          <div className="w-full max-w-[min(72vh,560px)] aspect-square flex items-center justify-center">
            <Chessboard
              fen={session.displayFen}
              orientation={boardOrientation}
              isInteractive={session.status === GAME_STATUS.ACTIVE && !session.isGameOver && !isEngineThinking}
              playerTurnColor={playerColor}
              onMove={handlePlayerMove}
              bestMoveArrow={isLiveAnalysisEnabled ? bestMoveArrow : null}
              lastMove={session.lastMove}
              lastMoveClassification={currentMove?.classification}
              themeId={settings.boardTheme}
              showLegalMoves={settings.showLegalMoves}
              showHighlights={settings.highlightLastMove}
            />
          </div>

          {/* User Player Bar */}
          <div className="w-full max-w-[min(72vh,560px)] flex items-center justify-between px-2 py-1 mt-1 text-xs">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-accent-400" />
              <span className="font-semibold text-ivory">You</span>
              <span className="text-ivory-muted text-[11px] font-mono">
                ({playerColor === 'w' ? 'White' : 'Black'})
              </span>
            </div>
            {selectedTimeControl.initialSeconds > 0 && (
              <Clock
                timeMs={playerColor === 'w' ? whiteTimeMs : blackTimeMs}
                isActive={
                  session.status === GAME_STATUS.ACTIVE &&
                  !session.isGameOver &&
                  session.turn === playerColor
                }
                player="You"
                onTimeout={() => session.timeout(playerColor)}
              />
            )}
          </div>
        </div>

        {/* Right Sidebar: Move List, Explanation, and Game Controls */}
        <div
          className={`${
            isLiveAnalysisEnabled && settings.showEvalBar ? 'lg:col-span-4' : 'lg:col-span-4'
          } flex flex-col h-full max-h-[78vh] gap-2`}
        >
          {/* Opening info chip */}
          {currentOpening && (
            <div className="bg-canvas-card border border-canvas-border rounded-xl px-3 py-1.5 text-xs flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="text-amber-400 font-bold shrink-0">
                  {currentOpening.eco || 'ECO'}
                </span>
                <span className="text-ivory font-medium truncate">{currentOpening.name}</span>
              </div>
            </div>
          )}

          {/* Move List */}
          <div className="flex-1 min-h-[160px] overflow-hidden">
            <MoveList
              moves={session.moves}
              currentPly={session.currentPly}
              onSelectPly={handleSelectPly}
              isLive={session.isLive}
              showDenotations={isLiveAnalysisEnabled}
            />
          </div>

          {/* Move Explanation Card (when analysis is enabled) */}
          {isLiveAnalysisEnabled && selectedMoveForExplanation && (
            <div className="shrink-0">
              <MoveExplanationCard moveData={selectedMoveForExplanation} />
            </div>
          )}

          {/* Game Controls */}
          <div className="shrink-0">
            <GameControls
              onFlipBoard={() =>
                setBoardOrientation((prev) => (prev === 'white' ? 'black' : 'white'))
              }
              onRestart={handleRestart}
              onNewGame={handleRestart}
              onResign={handleResign}
              onUndo={handleUndo}
              canUndo={session.moves.length > 0 && !session.isGameOver}
              isGameOver={session.isGameOver}
              isLiveAnalysisEnabled={isLiveAnalysisEnabled}
              onToggleLiveAnalysis={() => setIsLiveAnalysisEnabled((prev) => !prev)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              pgn={session.state.pgn}
              isMultiplayer={false}
            />
          </div>
        </div>
      </div>

      {/* Game Over Modal */}
      <GameOverModal
        isOpen={session.isGameOver && !isGameOverDismissed}
        result={session.result}
        playerColor={playerColor}
        whiteName={playerColor === 'w' ? 'You' : activePersona.name}
        blackName={playerColor === 'b' ? 'You' : activePersona.name}
        whiteAccuracy={matchAccuracies.white}
        blackAccuracy={matchAccuracies.black}
        onNewGame={() => handleRestart()}
        onRematch={() => handleRestart()}
        onStartReview={handleStartReview}
        onClose={() => setIsGameOverDismissed(true)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default ComputerGamePage;

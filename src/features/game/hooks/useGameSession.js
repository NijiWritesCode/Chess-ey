// Centralized React hook managing local game session lifecycle and interactions
// Connects UI components to the pure gameReducer domain model.

import { useReducer, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  createInitialGameState,
  gameReducer,
  GAME_ACTIONS,
  GAME_STATUS
} from '../domain/gameReducer';
import { getDisplayFen, isPlayerTurn, getLastMove, getCapturedPieces } from '../domain/gameState';
import { isInCheck, isLegalMove, getLegalMoves } from '../domain/chessRules';
import { historyStorage } from '../../history/services/historyStorage';

export function useGameSession(initialOptions = {}) {
  const [state, dispatch] = useReducer(
    gameReducer,
    { autoStart: true, ...initialOptions },
    createInitialGameState
  );

  const savedGameIdRef = useRef(null);
  const sessionGameIdRef = useRef(
    initialOptions.id ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
  );

  useEffect(() => {
    if (state.status === GAME_STATUS.COMPLETED && state.moves && state.moves.length > 0) {
      const targetId = state.id || sessionGameIdRef.current;
      if (savedGameIdRef.current !== targetId) {
        savedGameIdRef.current = targetId;
        const gameRecord = {
          id: targetId,
          gameMode: initialOptions.gameMode || 'offline',
          timestamp: state.startedAt || Date.now(),
          completedAt: state.endedAt || Date.now(),
          players: state.players,
          result: state.result,
          initialFen: state.initialFen,
          finalFen: state.fen,
          moves: state.moves,
          pgn: state.pgn,
          timeControl: initialOptions.timeControl || null
        };
        historyStorage.saveGame(gameRecord).catch(() => {});
      }
    }
  }, [state.status, state.id, state.result, state.moves, state.pgn, state.fen, initialOptions]);

  const displayFen = useMemo(() => getDisplayFen(state), [state]);
  const lastMove = useMemo(() => getLastMove(state), [state]);
  const capturedPieces = useMemo(() => getCapturedPieces(state), [state]);
  const isCheck = useMemo(() => isInCheck(displayFen), [displayFen]);

  const isLive = state.currentPly === state.moves.length;
  const isGameOver = state.status === GAME_STATUS.COMPLETED;

  const makeMove = useCallback(
    ({ from, to, promotion = 'q' }, timestamp = Date.now()) => {
      // Allow move if active or waiting (auto-start on first move)
      if (state.status !== GAME_STATUS.ACTIVE && state.status !== GAME_STATUS.WAITING) return false;
      const valid = isLegalMove(state.fen, { from, to, promotion });
      if (!valid) return false;

      if (state.status === GAME_STATUS.WAITING) {
        dispatch({
          type: GAME_ACTIONS.START_GAME,
          payload: { timestamp }
        });
      }

      dispatch({
        type: GAME_ACTIONS.MAKE_MOVE,
        payload: {
          move: { from, to, promotion },
          timestamp
        }
      });
      return true;
    },
    [state.status, state.fen]
  );

  const startGame = useCallback((timestamp = Date.now()) => {
    dispatch({
      type: GAME_ACTIONS.START_GAME,
      payload: { timestamp }
    });
  }, []);

  const resign = useCallback((color) => {
    dispatch({
      type: GAME_ACTIONS.RESIGN,
      payload: { color }
    });
  }, []);

  const timeout = useCallback((color) => {
    dispatch({
      type: GAME_ACTIONS.TIMEOUT,
      payload: { color }
    });
  }, []);

  const agreeDraw = useCallback(() => {
    dispatch({
      type: GAME_ACTIONS.DRAW_AGREEMENT
    });
  }, []);

  const undoMove = useCallback((plies = 1) => {
    dispatch({
      type: GAME_ACTIONS.UNDO_MOVE,
      payload: { plies }
    });
  }, []);

  const navigatePly = useCallback((ply) => {
    dispatch({
      type: GAME_ACTIONS.NAVIGATE_PLY,
      payload: { ply }
    });
  }, []);

  const setTime = useCallback((whiteMs, blackMs) => {
    dispatch({
      type: GAME_ACTIONS.SET_TIME,
      payload: { whiteMs, blackMs }
    });
  }, []);

  return {
    state,
    displayFen,
    currentPly: state.currentPly,
    turn: state.turn,
    status: state.status,
    moves: state.moves,
    lastMove,
    isCheck,
    isLive,
    isGameOver,
    result: state.result,
    clocks: state.clocks,
    capturedPieces,
    players: state.players,
    version: state.version,

    // Actions
    makeMove,
    startGame,
    resign,
    timeout,
    agreeDraw,
    undoMove,
    navigatePly,
    setTime
  };
}

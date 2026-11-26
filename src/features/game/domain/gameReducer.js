// Pure Game State Reducer & Action Handlers
// Manages local game state transitions, move applications, clocks, and game lifecycles.

import { STARTING_FEN, applyMove } from './chessRules';
import { GAME_STATUS, TERMINATION_REASONS, WINNERS, createGameResult } from './gameLifecycle';
import { createMoveRecord, reconstructGame } from './moveHistory';

export { GAME_STATUS, TERMINATION_REASONS, WINNERS };

export const GAME_ACTIONS = {
  START_GAME: 'START_GAME',
  RESET_GAME: 'RESET_GAME',
  MAKE_MOVE: 'MAKE_MOVE',
  SET_TIME: 'SET_TIME',
  RESIGN: 'RESIGN',
  TIMEOUT: 'TIMEOUT',
  DRAW_AGREEMENT: 'DRAW_AGREEMENT',
  UNDO_MOVE: 'UNDO_MOVE',
  NAVIGATE_PLY: 'NAVIGATE_PLY'
};

/**
 * Creates a clean, well-formed initial game state.
 */
export function createInitialGameState(options = {}) {
  const initialSeconds = options.timeControl?.initialSeconds ?? (options.initialTimeMs !== undefined ? options.initialTimeMs / 1000 : 600);
  const incrementSeconds = options.timeControl?.increment ?? (options.incrementMs !== undefined ? options.incrementMs / 1000 : 0);
  const initialMs = initialSeconds * 1000;
  const incrementMs = incrementSeconds * 1000;
  const status = options.status || (options.autoStart ? GAME_STATUS.ACTIVE : GAME_STATUS.WAITING);

  return {
    id: options.id || null,
    fen: options.initialFen || STARTING_FEN,
    initialFen: options.initialFen || STARTING_FEN,
    pgn: '',
    moves: [],
    currentPly: 0,
    turn: 'w',
    status,
    result: null,
    version: 1,

    players: {
      white: {
        id: options.whitePlayer?.id || null,
        name: options.whitePlayer?.name || 'White',
        type: options.whitePlayer?.type || 'human'
      },
      black: {
        id: options.blackPlayer?.id || null,
        name: options.blackPlayer?.name || 'Black',
        type: options.blackPlayer?.type || 'bot'
      }
    },

    clocks: {
      initialMs,
      incrementMs,
      whiteMs: initialMs,
      blackMs: initialMs,
      lastTurnTimestamp: null,
      isRunning: false
    },

    capturedPieces: {
      w: [],
      b: []
    }
  };
}

/**
 * Pure state reducer for game transitions.
 */
export function gameReducer(state, action) {
  switch (action.type) {
    case GAME_ACTIONS.START_GAME: {
      if (state.status === GAME_STATUS.ACTIVE) return state;
      const now = action.payload?.timestamp || Date.now();
      return {
        ...state,
        status: GAME_STATUS.ACTIVE,
        clocks: {
          ...state.clocks,
          isRunning: state.clocks.initialMs > 0,
          lastTurnTimestamp: now
        }
      };
    }

    case GAME_ACTIONS.RESET_GAME: {
      return createInitialGameState({
        initialFen: action.payload?.initialFen || STARTING_FEN,
        timeControl: action.payload?.timeControl,
        initialTimeMs: action.payload?.initialTimeMs,
        incrementMs: action.payload?.incrementMs,
        whitePlayer: action.payload?.whitePlayer || state.players?.white,
        blackPlayer: action.payload?.blackPlayer || state.players?.black,
        autoStart: action.payload?.autoStart ?? true,
        id: action.payload?.id
      });
    }

    case GAME_ACTIONS.MAKE_MOVE: {
      if (state.status !== GAME_STATUS.ACTIVE) return state;

      const { move, timestamp = Date.now() } = action.payload || {};
      if (!move) return state;

      const currentTurn = state.turn;
      const moveResult = applyMove(state.fen, move);

      if (!moveResult.valid) {
        return state; // Reject illegal move without state mutation
      }

      // Calculate clock deduction and increment for the moving side
      let newWhiteMs = state.clocks.whiteMs;
      let newBlackMs = state.clocks.blackMs;

      if (state.clocks.isRunning && state.clocks.lastTurnTimestamp) {
        const elapsed = Math.max(0, timestamp - state.clocks.lastTurnTimestamp);
        if (currentTurn === 'w') {
          newWhiteMs = Math.max(0, newWhiteMs - elapsed + state.clocks.incrementMs);
        } else {
          newBlackMs = Math.max(0, newBlackMs - elapsed + state.clocks.incrementMs);
        }
      }

      // Track captured pieces
      const newCaptured = {
        w: [...state.capturedPieces.w],
        b: [...state.capturedPieces.b]
      };
      if (moveResult.captured) {
        newCaptured[currentTurn].push(moveResult.captured);
      }

      const ply = state.moves.length + 1;
      const moveRecord = createMoveRecord({
        ply,
        moveNumber: Math.floor((ply - 1) / 2) + 1,
        turn: currentTurn,
        from: moveResult.from,
        to: moveResult.to,
        piece: moveResult.piece,
        captured: moveResult.captured,
        promotion: moveResult.promotion,
        san: moveResult.san,
        fenBefore: state.fen,
        fenAfter: moveResult.fen,
        timestamp,
        durationMs: state.clocks.lastTurnTimestamp ? timestamp - state.clocks.lastTurnTimestamp : null,
        flags: moveResult.flags
      });

      const nextMoves = [...state.moves, moveRecord];

      // Check terminal conditions
      let newStatus = state.status;
      let newResult = state.result;
      let clocksRunning = state.clocks.isRunning;

      if (moveResult.isGameOver) {
        newStatus = GAME_STATUS.COMPLETED;
        newResult = createGameResult(moveResult.winner, moveResult.reason);
        clocksRunning = false;
      }

      return {
        ...state,
        fen: moveResult.fen,
        turn: moveResult.turnAfter,
        moves: nextMoves,
        currentPly: ply,
        version: state.version + 1,
        status: newStatus,
        result: newResult,
        capturedPieces: newCaptured,
        clocks: {
          ...state.clocks,
          whiteMs: newWhiteMs,
          blackMs: newBlackMs,
          lastTurnTimestamp: timestamp,
          isRunning: clocksRunning
        }
      };
    }

    case GAME_ACTIONS.SET_TIME: {
      const { whiteMs, blackMs } = action.payload || {};
      return {
        ...state,
        clocks: {
          ...state.clocks,
          whiteMs: typeof whiteMs === 'number' ? whiteMs : state.clocks.whiteMs,
          blackMs: typeof blackMs === 'number' ? blackMs : state.clocks.blackMs
        }
      };
    }

    case GAME_ACTIONS.RESIGN: {
      if (state.status !== GAME_STATUS.ACTIVE) return state;
      const { color } = action.payload || {};
      const winner = color === 'w' ? WINNERS.BLACK : WINNERS.WHITE;
      return {
        ...state,
        status: GAME_STATUS.COMPLETED,
        result: createGameResult(winner, TERMINATION_REASONS.RESIGNATION),
        clocks: {
          ...state.clocks,
          isRunning: false
        }
      };
    }

    case GAME_ACTIONS.TIMEOUT: {
      if (state.status !== GAME_STATUS.ACTIVE) return state;
      const { color } = action.payload || {};
      const winner = color === 'w' ? WINNERS.BLACK : WINNERS.WHITE;
      return {
        ...state,
        status: GAME_STATUS.COMPLETED,
        result: createGameResult(winner, TERMINATION_REASONS.TIMEOUT),
        clocks: {
          ...state.clocks,
          isRunning: false
        }
      };
    }

    case GAME_ACTIONS.DRAW_AGREEMENT: {
      if (state.status !== GAME_STATUS.ACTIVE) return state;
      return {
        ...state,
        status: GAME_STATUS.COMPLETED,
        result: createGameResult(WINNERS.DRAW, TERMINATION_REASONS.AGREEMENT),
        clocks: {
          ...state.clocks,
          isRunning: false
        }
      };
    }

    case GAME_ACTIONS.UNDO_MOVE: {
      if (state.moves.length === 0) return state;
      const pliesToUndo = Math.min(state.moves.length, action.payload?.plies || 1);
      const remainingMoves = state.moves.slice(0, state.moves.length - pliesToUndo);

      // Reconstruct state up to remaining plies
      if (remainingMoves.length === 0) {
        return {
          ...state,
          fen: state.initialFen,
          moves: [],
          currentPly: 0,
          turn: 'w',
          capturedPieces: { w: [], b: [] },
          status: GAME_STATUS.ACTIVE,
          result: null,
          version: state.version + 1
        };
      }

      const reconstructed = reconstructGame(remainingMoves, state.initialFen);
      const lastMove = remainingMoves[remainingMoves.length - 1];

      return {
        ...state,
        fen: reconstructed.finalFen,
        moves: remainingMoves,
        currentPly: remainingMoves.length,
        turn: lastMove.turn === 'w' ? 'b' : 'w',
        capturedPieces: reconstructed.capturedPieces,
        status: GAME_STATUS.ACTIVE,
        result: null,
        version: state.version + 1
      };
    }

    case GAME_ACTIONS.NAVIGATE_PLY: {
      const targetPly = Math.max(0, Math.min(state.moves.length, action.payload?.ply ?? state.moves.length));
      return {
        ...state,
        currentPly: targetPly
      };
    }

    default:
      return state;
  }
}

import { describe, it, expect } from 'vitest';
import {
  createInitialGameState,
  gameReducer,
  GAME_ACTIONS,
  GAME_STATUS
} from '../../features/game/domain/gameReducer';
import { reconstructGame, createMoveRecord } from '../../features/game/domain/moveHistory';
import { STARTING_FEN } from '../../features/game/domain/chessRules';

describe('Phase 1.2 & 1.3: Game State Controller & Move History', () => {
  describe('Initial State & Game Creation', () => {
    it('creates well-formed initial game state', () => {
      const state = createInitialGameState({
        timeControl: { initialSeconds: 600, increment: 0 },
        whitePlayer: { id: 'p1', name: 'Alice', type: 'human' },
        blackPlayer: { id: 'bot1', name: 'Allen', type: 'bot' }
      });

      expect(state.fen).toBe(STARTING_FEN);
      expect(state.turn).toBe('w');
      expect(state.status).toBe(GAME_STATUS.WAITING);
      expect(state.moves.length).toBe(0);
      expect(state.version).toBe(1);
      expect(state.clocks.whiteMs).toBe(600000);
      expect(state.clocks.blackMs).toBe(600000);
      expect(state.players.white.name).toBe('Alice');
      expect(state.players.black.name).toBe('Allen');
    });
  });

  describe('Game Reducer Actions', () => {
    it('handles START_GAME action cleanly', () => {
      const initialState = createInitialGameState();
      const started = gameReducer(initialState, {
        type: GAME_ACTIONS.START_GAME,
        payload: { timestamp: 1000 }
      });

      expect(started.status).toBe(GAME_STATUS.ACTIVE);
      expect(started.clocks.isRunning).toBe(true);
      expect(started.clocks.lastTurnTimestamp).toBe(1000);
    });

    it('handles MAKE_MOVE action, updating turn, FEN, moves, version, and clock increment', () => {
      let state = createInitialGameState({
        timeControl: { initialSeconds: 300, increment: 2 }
      });
      state = gameReducer(state, {
        type: GAME_ACTIONS.START_GAME,
        payload: { timestamp: 1000 }
      });

      // 1. e4
      const nextState = gameReducer(state, {
        type: GAME_ACTIONS.MAKE_MOVE,
        payload: {
          move: { from: 'e2', to: 'e4' },
          timestamp: 3000 // 2 seconds spent
        }
      });

      expect(nextState.turn).toBe('b');
      expect(nextState.moves.length).toBe(1);
      expect(nextState.moves[0].san).toBe('e4');
      expect(nextState.moves[0].ply).toBe(1);
      expect(nextState.version).toBe(2);
      expect(nextState.clocks.lastTurnTimestamp).toBe(3000);
      // 300000 - 2000 spent + 2000 increment = 300000 ms
      expect(nextState.clocks.whiteMs).toBe(300000);
    });

    it('rejects illegal moves without modifying state', () => {
      let state = createInitialGameState();
      state = gameReducer(state, { type: GAME_ACTIONS.START_GAME, payload: { timestamp: 1000 } });

      const illegalState = gameReducer(state, {
        type: GAME_ACTIONS.MAKE_MOVE,
        payload: { move: { from: 'e2', to: 'e5' } }
      });

      expect(illegalState).toBe(state); // Strict referential equality on rejected move
      expect(illegalState.moves.length).toBe(0);
      expect(illegalState.turn).toBe('w');
    });

    it('handles RESIGN action correctly', () => {
      let state = createInitialGameState();
      state = gameReducer(state, { type: GAME_ACTIONS.START_GAME, payload: { timestamp: 1000 } });

      const resigned = gameReducer(state, {
        type: GAME_ACTIONS.RESIGN,
        payload: { color: 'w' }
      });

      expect(resigned.status).toBe(GAME_STATUS.COMPLETED);
      expect(resigned.result.winner).toBe('black');
      expect(resigned.result.reason).toBe('resignation');
      expect(resigned.clocks.isRunning).toBe(false);
    });

    it('handles TIMEOUT action correctly', () => {
      let state = createInitialGameState();
      state = gameReducer(state, { type: GAME_ACTIONS.START_GAME, payload: { timestamp: 1000 } });

      const timedOut = gameReducer(state, {
        type: GAME_ACTIONS.TIMEOUT,
        payload: { color: 'b' }
      });

      expect(timedOut.status).toBe(GAME_STATUS.COMPLETED);
      expect(timedOut.result.winner).toBe('white');
      expect(timedOut.result.reason).toBe('timeout');
    });

    it('handles DRAW_AGREEMENT action correctly', () => {
      let state = createInitialGameState();
      state = gameReducer(state, { type: GAME_ACTIONS.START_GAME, payload: { timestamp: 1000 } });

      const drawn = gameReducer(state, {
        type: GAME_ACTIONS.DRAW_AGREEMENT
      });

      expect(drawn.status).toBe(GAME_STATUS.COMPLETED);
      expect(drawn.result.winner).toBe('draw');
      expect(drawn.result.reason).toBe('agreement');
    });

    it('handles UNDO_MOVE cleanly (reverts specified number of plies)', () => {
      let state = createInitialGameState();
      state = gameReducer(state, { type: GAME_ACTIONS.START_GAME, payload: { timestamp: 1000 } });
      // 1. e4
      state = gameReducer(state, { type: GAME_ACTIONS.MAKE_MOVE, payload: { move: { from: 'e2', to: 'e4' } } });
      // 1... e5
      state = gameReducer(state, { type: GAME_ACTIONS.MAKE_MOVE, payload: { move: { from: 'e7', to: 'e5' } } });

      expect(state.moves.length).toBe(2);

      // Undo 1 move (back to after 1. e4)
      const undo1 = gameReducer(state, { type: GAME_ACTIONS.UNDO_MOVE, payload: { plies: 1 } });
      expect(undo1.moves.length).toBe(1);
      expect(undo1.turn).toBe('b');

      // Undo another move (back to initial position)
      const undo2 = gameReducer(undo1, { type: GAME_ACTIONS.UNDO_MOVE, payload: { plies: 1 } });
      expect(undo2.moves.length).toBe(0);
      expect(undo2.fen).toBe(STARTING_FEN);
      expect(undo2.turn).toBe('w');
    });

    it('tracks captured pieces accurately', () => {
      let state = createInitialGameState();
      state = gameReducer(state, { type: GAME_ACTIONS.START_GAME, payload: { timestamp: 1000 } });
      // 1. e4 d5 2. exd5 (White pawn captures Black pawn)
      state = gameReducer(state, { type: GAME_ACTIONS.MAKE_MOVE, payload: { move: { from: 'e2', to: 'e4' } } });
      state = gameReducer(state, { type: GAME_ACTIONS.MAKE_MOVE, payload: { move: { from: 'd7', to: 'd5' } } });
      state = gameReducer(state, { type: GAME_ACTIONS.MAKE_MOVE, payload: { move: { from: 'e4', to: 'd5' } } });

      expect(state.capturedPieces.w).toEqual(['p']);
      expect(state.capturedPieces.b).toEqual([]);
    });
  });

  describe('Move History Reconstruction', () => {
    it('reconstructs complete game state and intermediate FENs from move history', () => {
      const moves = [
        { from: 'e2', to: 'e4' },
        { from: 'e7', to: 'e5' },
        { from: 'g1', to: 'f3' },
        { from: 'b8', to: 'c6' }
      ];

      const reconstruction = reconstructGame(moves);
      expect(reconstruction.success).toBe(true);
      expect(reconstruction.history.length).toBe(4);
      expect(reconstruction.history[0].san).toBe('e4');
      expect(reconstruction.history[1].san).toBe('e5');
      expect(reconstruction.history[2].san).toBe('Nf3');
      expect(reconstruction.history[3].san).toBe('Nc6');
      expect(reconstruction.finalFen).toContain('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
    });

    it('detects threefold repetition through complete move sequence history', () => {
      // Knights move out and back repeatedly: 1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8
      const moves = [
        { from: 'g1', to: 'f3' },
        { from: 'g8', to: 'f6' },
        { from: 'f3', to: 'g1' },
        { from: 'f6', to: 'g8' },
        { from: 'g1', to: 'f3' },
        { from: 'g8', to: 'f6' },
        { from: 'f3', to: 'g1' },
        { from: 'f6', to: 'g8' }
      ];

      const reconstruction = reconstructGame(moves);
      expect(reconstruction.isThreefold).toBe(true);
    });
  });
});

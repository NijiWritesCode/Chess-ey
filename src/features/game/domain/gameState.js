// Game State Controller & Selectors
// Provides pure query functions, historical inspection selectors, and session factories.

import { STARTING_FEN } from './chessRules';
import { createInitialGameState, gameReducer, GAME_ACTIONS, GAME_STATUS } from './gameReducer';

export { createInitialGameState, gameReducer, GAME_ACTIONS, GAME_STATUS };

/**
 * Returns the FEN string to display for the currently viewed ply.
 * If inspecting historical plies (currentPly < moves.length), returns historical FEN.
 * Otherwise returns the active game's current FEN.
 */
export function getDisplayFen(state) {
  if (!state) return STARTING_FEN;
  if (state.currentPly === 0) {
    return state.initialFen || STARTING_FEN;
  }
  if (state.currentPly < state.moves.length) {
    const move = state.moves[state.currentPly - 1];
    return move ? move.fenAfter : state.fen;
  }
  return state.fen;
}

/**
 * Returns whether it is currently a given player's turn to move.
 * @param {Object} state - current game state
 * @param {'w'|'b'} playerColor - 'w' or 'b'
 */
export function isPlayerTurn(state, playerColor) {
  if (!state || state.status !== GAME_STATUS.ACTIVE) return false;
  return state.turn === playerColor;
}

/**
 * Returns the last played move item if available.
 */
export function getLastMove(state) {
  if (!state || state.moves.length === 0) return null;
  const ply = state.currentPly > 0 ? state.currentPly : state.moves.length;
  return state.moves[ply - 1] || null;
}

/**
 * Returns captured pieces count or lists.
 */
export function getCapturedPieces(state) {
  if (!state || !state.capturedPieces) {
    return { w: [], b: [] };
  }
  return state.capturedPieces;
}

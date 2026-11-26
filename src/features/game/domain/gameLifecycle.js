// Game Lifecycle & Terminal Outcomes Domain Model
// Distinguishes between automatic draws, claimable draws, checkmate, resignation, and timeouts.

export const GAME_STATUS = {
  WAITING: 'waiting',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ABORTED: 'aborted',
  EXPIRED: 'expired'
};

export const TERMINATION_REASONS = {
  CHECKMATE: 'checkmate',
  STALEMATE: 'stalemate',
  INSUFFICIENT_MATERIAL: 'insufficient',
  THREEFOLD_REPETITION: 'threefold',
  FIFTY_MOVE_RULE: 'fifty-move',
  RESIGNATION: 'resignation',
  TIMEOUT: 'timeout',
  AGREEMENT: 'agreement',
  ABORTED: 'aborted'
};

export const WINNERS = {
  WHITE: 'white',
  BLACK: 'black',
  DRAW: 'draw'
};

/**
 * Checks whether a reason represents an automatic draw under FIDE rules.
 */
export function isAutomaticDrawReason(reason) {
  return [
    TERMINATION_REASONS.STALEMATE,
    TERMINATION_REASONS.INSUFFICIENT_MATERIAL
  ].includes(reason);
}

/**
 * Checks whether a reason represents a claimable draw under FIDE rules.
 */
export function isClaimableDrawReason(reason) {
  return [
    TERMINATION_REASONS.THREEFOLD_REPETITION,
    TERMINATION_REASONS.FIFTY_MOVE_RULE
  ].includes(reason);
}

/**
 * Evaluates a completed game outcome object.
 */
export function createGameResult(winner, reason) {
  return {
    winner,
    reason,
    timestamp: Date.now()
  };
}

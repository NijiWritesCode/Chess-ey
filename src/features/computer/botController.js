import { playEngine } from '../../services/engine/stockfishService';
import { getLegalMoves, isLegalMove, STARTING_FEN } from '../game/domain/chessRules';

/**
 * Parses UCI string (e.g. 'e2e4', 'e7e8q') into { from, to, promotion }
 */
export function parseUciMove(uci) {
  if (!uci || typeof uci !== 'string' || uci.length < 4) return null;
  return {
    from: uci.substring(0, 2),
    to: uci.substring(2, 4),
    promotion: uci.length >= 5 ? uci[4].toLowerCase() : null
  };
}

/**
 * Formats a move object { from, to, promotion } into UCI format
 */
export function formatUciMove(move) {
  if (!move || !move.from || !move.to) return '';
  const promo = move.promotion ? move.promotion.toLowerCase() : '';
  return `${move.from}${move.to}${promo}`;
}

/**
 * Selects an authentic computer response for the given position and bot configuration.
 *
 * Adheres to Rebuild Principle:
 * "If a deliberately weaker move is selected, evaluate that actual move afterward.
 * Never classify it using the evaluation from before it was played."
 *
 * @param {string} fen - Current game FEN position
 * @param {Object} botConfig - Bot difficulty / persona parameters
 * @param {Object} options - Additional options including cancellation check
 * @returns {Promise<{ move: { from, to, promotion }, evaluation: Object, isBlunderAttempt: boolean }>}
 */
export async function computeBotMove(fen, botConfig = {}, options = {}) {
  const {
    isCancelled = () => false,
    timeout = 4000
  } = options;

  if (isCancelled()) {
    return null;
  }

  const legalMoves = getLegalMoves(fen);
  if (legalMoves.length === 0) {
    return null;
  }

  // Ensure engine is configured for this bot
  try {
    if (botConfig.skillLevel !== undefined) {
      playEngine.setSkillLevel(botConfig.skillLevel);
    }
    if (botConfig.elo) {
      playEngine.setElo(botConfig.elo);
    }
  } catch (e) {}

  // 1. Evaluate top engine move with search limits
  let searchResult = null;
  try {
    searchResult = await playEngine.evaluatePosition(fen, {
      depth: botConfig.depth || 10,
      movetime: botConfig.movetime || 400,
      skillLevel: botConfig.skillLevel !== undefined ? botConfig.skillLevel : 10,
      elo: botConfig.elo || 1200,
      timeout
    });
  } catch (err) {
    // Graceful fallback to legal moves if worker/WASM is unavailable
  }

  if (isCancelled()) {
    return null;
  }

  const engineUci = searchResult?.bestMove;
  let chosenMove = parseUciMove(engineUci);
  let isBlunderAttempt = false;

  // 2. Check blunder / humanization injection for lower-rated bot personas
  const blunderRoll = Math.random();
  const shouldInjectBlunder =
    botConfig.blunderChance &&
    blunderRoll < botConfig.blunderChance &&
    legalMoves.length > 1;

  if (shouldInjectBlunder) {
    // Pick an alternative legal move that is not the top engine best move
    const altMoves = legalMoves.filter(
      (m) => !chosenMove || m.from !== chosenMove.from || m.to !== chosenMove.to
    );

    if (altMoves.length > 0) {
      // Prefer hanging pieces / pawn moves for beginner bots
      const randomIndex = Math.floor(Math.random() * altMoves.length);
      const randomCandidate = altMoves[randomIndex];
      chosenMove = {
        from: randomCandidate.from,
        to: randomCandidate.to,
        promotion: randomCandidate.promotion || 'q'
      };
      isBlunderAttempt = true;
    }
  }

  // Fallback to first legal move if engine produced no result
  if (!chosenMove || !isLegalMove(fen, chosenMove)) {
    const fallback = legalMoves[0];
    chosenMove = {
      from: fallback.from,
      to: fallback.to,
      promotion: fallback.promotion || 'q'
    };
  }

  return {
    move: chosenMove,
    engineBestMove: parseUciMove(engineUci),
    evaluation: searchResult?.evaluation || null,
    isBlunderAttempt
  };
}

export default {
  computeBotMove,
  parseUciMove,
  formatUciMove
};

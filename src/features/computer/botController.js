import { Chess } from 'chess.js';
import { playEngine } from '../../services/engine/stockfishService';
import { getLegalMoves, isLegalMove, getPieceAt, STARTING_FEN } from '../game/domain/chessRules';
import { identifyOpening } from '../../services/openings/openingBook';

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
 * Selects an authentic opening book move for the given bot configuration.
 */
export function selectOpeningBookMove(fen, playedSans = [], botConfig = {}) {
  const maxBookPlies = botConfig.maxBookPlies ?? 8;
  if (playedSans.length >= maxBookPlies) return null;

  try {
    const openingInfo = identifyOpening(playedSans, fen);
    const candidateMoves = openingInfo?.bookMoves || [];
    if (!candidateMoves || candidateMoves.length === 0) return null;

    const chess = new Chess(fen);
    const legalBookCandidates = [];

    for (const san of candidateMoves) {
      try {
        const m = chess.move(san);
        if (m) {
          legalBookCandidates.push({
            san,
            from: m.from,
            to: m.to,
            promotion: m.promotion || 'q',
            uci: `${m.from}${m.to}${m.promotion || ''}`
          });
          chess.undo();
        }
      } catch (e) {}
    }

    if (legalBookCandidates.length === 0) return null;

    // For White on move 1:
    if (playedSans.length === 0) {
      // Mufty (800) favors 1. e4 (King's Pawn / Open Game) or 1. d4
      if (botConfig.name === 'Mufty' || botConfig.level === 3) {
        const preferred = legalBookCandidates.filter((c) => c.san === 'e4' || c.san === 'd4');
        if (preferred.length > 0) {
          const pick = Math.random() < 0.75 ? preferred.find((c) => c.san === 'e4') : preferred.find((c) => c.san === 'd4');
          return pick || preferred[0];
        }
      }
    }

    // For Black on move 1:
    if (playedSans.length === 1) {
      const whiteMove = playedSans[0];
      if (whiteMove === 'e4') {
        // Mufty vs e4: 1... e5 (King's Pawn, 60%), 1... c5 (Sicilian, 20%), 1... e6 (French, 10%), 1... c6 (Caro, 10%)
        if (botConfig.name === 'Mufty' || botConfig.level === 3) {
          const e5Move = legalBookCandidates.find((c) => c.san === 'e5');
          const c5Move = legalBookCandidates.find((c) => c.san === 'c5');
          const e6Move = legalBookCandidates.find((c) => c.san === 'e6');
          const c6Move = legalBookCandidates.find((c) => c.san === 'c6');
          const rand = Math.random();
          if (rand < 0.6 && e5Move) return e5Move;
          if (rand < 0.8 && c5Move) return c5Move;
          if (rand < 0.9 && e6Move) return e6Move;
          if (c6Move) return c6Move;
          if (e5Move) return e5Move;
        }
      } else if (whiteMove === 'd4') {
        // Mufty vs d4: 1... d5 (70%) or 1... Nf6 (30%)
        if (botConfig.name === 'Mufty' || botConfig.level === 3) {
          const d5Move = legalBookCandidates.find((c) => c.san === 'd5');
          const nf6Move = legalBookCandidates.find((c) => c.san === 'Nf6');
          if (Math.random() < 0.7 && d5Move) return d5Move;
          if (nf6Move) return nf6Move;
          if (d5Move) return d5Move;
        }
      }
    }

    // Subsequent book moves: Pick randomly among theoretical candidate lines
    const randomIndex = Math.floor(Math.random() * legalBookCandidates.length);
    return legalBookCandidates[randomIndex];
  } catch (err) {
    return null;
  }
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
 * @param {Object} options - Additional options including cancellation check, playedSans, persona
 * @returns {Promise<{ move: { from, to, promotion }, evaluation: Object, isBlunderAttempt: boolean }>}
 */
export async function computeBotMove(fen, botConfig = {}, options = {}) {
  const {
    isCancelled = () => false,
    timeout = 4000,
    playedSans = []
  } = options;

  if (isCancelled()) {
    return null;
  }

  const legalMoves = getLegalMoves(fen);
  if (legalMoves.length === 0) {
    return null;
  }

  // 1. Check opening book for authentic theoretical opening moves
  const bookCandidate = selectOpeningBookMove(fen, playedSans, botConfig);
  if (bookCandidate) {
    const bookMove = {
      from: bookCandidate.from,
      to: bookCandidate.to,
      promotion: bookCandidate.promotion || 'q'
    };
    return {
      move: bookMove,
      engineBestMove: bookMove,
      evaluation: {
        score: { type: 'cp', value: 20 },
        cp: 20,
        depth: 1,
        pv: [bookCandidate.uci]
      },
      isBook: true,
      isBlunderAttempt: false
    };
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

  // 2. Evaluate engine move with calibrated persona depth & movetime
  let searchResult = null;
  try {
    searchResult = await playEngine.evaluatePosition(fen, {
      depth: botConfig.depth || 6,
      movetime: botConfig.movetime || 350,
      skillLevel: botConfig.skillLevel !== undefined ? botConfig.skillLevel : 5,
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

  // 3. Check blunder / humanization injection for lower-rated bot personas
  // NEVER inject artificial random blunders during the opening phase (first 6 plies)
  const isOpeningPhase = playedSans.length < 6;
  const blunderRoll = Math.random();
  const shouldInjectBlunder =
    !isOpeningPhase &&
    botConfig.blunderChance &&
    blunderRoll < botConfig.blunderChance &&
    legalMoves.length > 1;

  if (shouldInjectBlunder) {
    // Pick an alternative legal move that is sensible (avoiding king walks or suicide)
    const altMoves = legalMoves.filter(
      (m) => !chosenMove || m.from !== chosenMove.from || m.to !== chosenMove.to
    );

    if (altMoves.length > 0) {
      const sensibleMoves = altMoves.filter((m) => {
        const piece = getPieceAt(fen, m.from);
        if (piece?.type === 'k' && !(m.flags && (m.flags.includes('k') || m.flags.includes('q')))) {
          return false;
        }
        return true;
      });

      const candidatePool = sensibleMoves.length > 0 ? sensibleMoves : altMoves;
      const randomIndex = Math.floor(Math.random() * candidatePool.length);
      const randomCandidate = candidatePool[randomIndex];
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
    isBook: false,
    isBlunderAttempt
  };
}

export default {
  computeBotMove,
  parseUciMove,
  formatUciMove
};

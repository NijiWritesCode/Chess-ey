// Centralized Chess Rules Service wrapping chess.js
// Provides authoritative move generation, execution, validation, check/mate/draw rules, and FEN/PGN handling.

import { Chess, validateFen } from 'chess.js';

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Validates whether a FEN string is syntactically and legally valid.
 */
export function isValidFen(fen) {
  if (typeof fen !== 'string') return false;
  try {
    const result = validateFen(fen);
    return Boolean(result && result.ok);
  } catch (e) {
    return false;
  }
}

/**
 * Extracts the side to move ('w' | 'b') from a FEN string.
 */
export function getTurn(fen = STARTING_FEN) {
  if (!fen || typeof fen !== 'string') return 'w';
  const parts = fen.trim().split(/\s+/);
  return parts[1] === 'b' ? 'b' : 'w';
}

/**
 * Returns all legal moves from a position, optionally filtered by origin square.
 */
export function getLegalMoves(fen = STARTING_FEN, square = null) {
  try {
    const chess = new Chess(fen);
    const options = { verbose: true };
    if (square) {
      options.square = square;
    }
    return chess.moves(options);
  } catch (e) {
    return [];
  }
}

/**
 * Checks whether a proposed move is legal in the given position.
 * @param {string} fen
 * @param {Object|string} move - { from, to, promotion } or SAN string
 */
export function isLegalMove(fen, move) {
  try {
    const chess = new Chess(fen);
    let moveResult = null;
    if (typeof move === 'string') {
      moveResult = chess.move(move);
    } else if (move && typeof move === 'object') {
      moveResult = chess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || 'q'
      });
    }
    return Boolean(moveResult);
  } catch (e) {
    return false;
  }
}

/**
 * Applies a move to a FEN position and returns the full result payload.
 * Pure function: does not mutate external state.
 * @param {string} fen
 * @param {Object|string} move - { from, to, promotion } or SAN string
 */
export function applyMove(fen, move) {
  try {
    const chess = new Chess(fen);
    const turnBefore = chess.turn();

    let moveObj = null;
    if (typeof move === 'string') {
      moveObj = chess.move(move);
    } else if (move && typeof move === 'object') {
      moveObj = chess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || 'q'
      });
    }

    if (!moveObj) {
      return {
        valid: false,
        error: 'Illegal move'
      };
    }

    const newFen = chess.fen();
    const turnAfter = chess.turn();
    const isCheck = chess.inCheck();
    const isCheckmate = chess.isCheckmate();
    const isStalemate = chess.isStalemate();
    const isInsufficientMaterial = chess.isInsufficientMaterial();
    const isThreefold = chess.isThreefoldRepetition();
    const isDraw = chess.isDraw();
    const isGameOver = chess.isGameOver();

    const isCastle = Boolean(moveObj.flags && (moveObj.flags.includes('k') || moveObj.flags.includes('q')));
    const isEnPassant = Boolean(moveObj.flags && moveObj.flags.includes('e'));

    let winner = null;
    let reason = null;

    if (isCheckmate) {
      winner = turnBefore === 'w' ? 'white' : 'black';
      reason = 'checkmate';
    } else if (isStalemate) {
      winner = 'draw';
      reason = 'stalemate';
    } else if (isInsufficientMaterial) {
      winner = 'draw';
      reason = 'insufficient';
    } else if (isThreefold) {
      winner = 'draw';
      reason = 'threefold';
    } else if (isDraw) {
      winner = 'draw';
      reason = 'fifty-move';
    }

    return {
      valid: true,
      fen: newFen,
      fenBefore: fen,
      san: moveObj.san,
      from: moveObj.from,
      to: moveObj.to,
      piece: moveObj.piece,
      promotion: moveObj.promotion || null,
      captured: moveObj.captured || null,
      capturedColor: moveObj.captured ? (turnBefore === 'w' ? 'b' : 'w') : null,
      flags: moveObj.flags,
      isCastle,
      isEnPassant,
      turnBefore,
      turnAfter,
      isCheck,
      isCheckmate,
      isStalemate,
      isInsufficientMaterial,
      isThreefold,
      isDraw,
      isGameOver,
      winner,
      reason
    };
  } catch (err) {
    return {
      valid: false,
      error: err.message || 'Error executing move'
    };
  }
}

/**
 * Checks if the current side to move is in check.
 */
export function isInCheck(fen) {
  try {
    const chess = new Chess(fen);
    return chess.inCheck();
  } catch (e) {
    return false;
  }
}

/**
 * Checks if the position is checkmate.
 */
export function isCheckmate(fen) {
  try {
    const chess = new Chess(fen);
    return chess.isCheckmate();
  } catch (e) {
    return false;
  }
}

/**
 * Checks if the position is stalemate.
 */
export function isStalemate(fen) {
  try {
    const chess = new Chess(fen);
    return chess.isStalemate();
  } catch (e) {
    return false;
  }
}

/**
 * Checks if draw by insufficient material has occurred.
 */
export function isInsufficientMaterial(fen) {
  try {
    const chess = new Chess(fen);
    return chess.isInsufficientMaterial();
  } catch (e) {
    return false;
  }
}

/**
 * Checks if the position is an automatic or claimable draw.
 */
export function isDraw(fen) {
  try {
    const chess = new Chess(fen);
    return chess.isDraw();
  } catch (e) {
    return false;
  }
}

/**
 * Parses a PGN string into verbose move objects.
 */
export function parsePgn(pgnString) {
  if (!pgnString || typeof pgnString !== 'string') return [];
  try {
    const chess = new Chess();
    chess.loadPgn(pgnString);
    return chess.history({ verbose: true });
  } catch (e) {
    return [];
  }
}

/**
 * Exports an array of SAN moves with headers to a standard PGN string.
 */
export function exportPgn(movesList = [], headers = {}) {
  try {
    const chess = new Chess();
    for (const [key, value] of Object.entries(headers)) {
      chess.header(key, String(value));
    }
    for (const m of movesList) {
      if (typeof m === 'string') {
        chess.move(m);
      } else if (m && m.san) {
        chess.move(m.san);
      } else if (m && m.from && m.to) {
        chess.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
      }
    }
    return chess.pgn();
  } catch (e) {
    return '';
  }
}

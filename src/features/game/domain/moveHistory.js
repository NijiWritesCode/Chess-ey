// Move History Manager & Full Game Reconstruction
// Produces immutable ply representations and reconstructs complete games from move sequences.

import { Chess } from 'chess.js';
import { STARTING_FEN } from './chessRules';

/**
 * Creates an immutable, standardized move history record for a single ply.
 */
export function createMoveRecord({
  ply,
  moveNumber,
  turn,
  from,
  to,
  piece,
  captured = null,
  promotion = null,
  san,
  fenBefore,
  fenAfter,
  timestamp = Date.now(),
  durationMs = null,
  flags = ''
}) {
  return Object.freeze({
    ply,
    moveNumber: moveNumber || Math.floor((ply - 1) / 2) + 1,
    turn,
    from,
    to,
    piece,
    captured,
    promotion,
    san,
    fenBefore,
    fenAfter,
    timestamp,
    durationMs,
    flags
  });
}

/**
 * Reconstructs a complete game from a sequence of moves (coordinates or SANs).
 * Replays moves in chess.js to establish verified intermediate positions, full PGN,
 * captured pieces history, and threefold repetition detection.
 *
 * @param {Array<Object|string>} movesList - list of moves ({ from, to, promotion } or SAN string)
 * @param {string} initialFen - starting FEN (defaults to standard STARTING_FEN)
 */
export function reconstructGame(movesList = [], initialFen = STARTING_FEN) {
  try {
    const chess = new Chess(initialFen);
    const history = [];
    const fenMap = new Map();

    // Record initial board position for repetition detection
    const normalizeFen = (f) => f.split(' ').slice(0, 4).join(' ');
    fenMap.set(normalizeFen(chess.fen()), 1);

    const capturedPieces = { w: [], b: [] };

    for (let i = 0; i < movesList.length; i++) {
      const m = movesList[i];
      const fenBefore = chess.fen();
      const turnBefore = chess.turn();

      let moveObj = null;
      if (typeof m === 'string') {
        moveObj = chess.move(m);
      } else if (m && typeof m === 'object') {
        if (m.from && m.to) {
          moveObj = chess.move({
            from: m.from,
            to: m.to,
            promotion: m.promotion || 'q'
          });
        } else if (m.san) {
          moveObj = chess.move(m.san);
        }
      }

      if (!moveObj) {
        return {
          success: false,
          error: `Illegal move at ply ${i + 1}`,
          history,
          failedPly: i + 1
        };
      }

      const fenAfter = chess.fen();
      const key = normalizeFen(fenAfter);
      const count = (fenMap.get(key) || 0) + 1;
      fenMap.set(key, count);

      if (moveObj.captured) {
        const capturingSide = turnBefore; // 'w' captured 'b' piece
        capturedPieces[capturingSide].push(moveObj.captured);
      }

      const ply = i + 1;
      const record = createMoveRecord({
        ply,
        moveNumber: Math.floor(i / 2) + 1,
        turn: turnBefore,
        from: moveObj.from,
        to: moveObj.to,
        piece: moveObj.piece,
        captured: moveObj.captured || null,
        promotion: moveObj.promotion || null,
        san: moveObj.san,
        fenBefore,
        fenAfter,
        timestamp: m.timestamp || Date.now(),
        durationMs: m.durationMs || null,
        flags: moveObj.flags
      });

      history.push(record);
    }

    const isThreefold = Array.from(fenMap.values()).some((c) => c >= 3);

    return {
      success: true,
      history,
      finalFen: chess.fen(),
      pgn: chess.pgn(),
      isThreefold,
      isCheckmate: chess.isCheckmate(),
      isStalemate: chess.isStalemate(),
      isDraw: chess.isDraw(),
      isGameOver: chess.isGameOver(),
      capturedPieces
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      history: []
    };
  }
}

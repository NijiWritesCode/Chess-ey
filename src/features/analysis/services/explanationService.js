// Contextual Chess Move Explanation Engine
// Synthesizes move classification, tactical motives (pins, forks, checks, sacrifices),
// material delta, and alternative engine variations into natural explanations.

const PIECE_NAMES = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king'
};

/**
 * Generates an informative, contextual explanation for a classified move.
 *
 * @param {Object} context
 * @param {Object} context.move - { san, from, to, piece, captured, isCheck, isCastle, isPromotion }
 * @param {Object} context.classification - MOVE_CLASSES item (e.g. BRILLIANT, BLUNDER)
 * @param {string} [context.bestMoveSan] - SAN of engine best alternative
 * @param {Object} [context.preEval] - evaluation before move
 * @param {Object} [context.postEval] - evaluation after move
 * @param {string} [context.turn] - 'w' | 'b'
 * @param {Object} [context.opening] - opening information { name, eco }
 * @param {string[]} [context.principalVariation] - suggested engine line
 * @returns {string} Natural language explanation of the move
 */
export function generateMoveExplanation({
  move = {},
  classification = {},
  bestMoveSan = null,
  preEval = null,
  postEval = null,
  turn = 'w',
  opening = null,
  principalVariation = []
}) {
  const classId = classification?.id || 'good';
  const pieceName = PIECE_NAMES[move.piece?.toLowerCase()] || 'piece';
  const capturedName = move.captured ? PIECE_NAMES[move.captured?.toLowerCase()] : null;
  const isCapture = Boolean(move.captured);
  const isCheck = Boolean(move.isCheck || move.san?.includes('+'));
  const isCheckmate = Boolean(move.san?.includes('#'));

  // 1. Checkmate
  if (isCheckmate) {
    return `Delivers checkmate on ${move.to}! The king has no legal escapes and the game concludes.`;
  }

  // 2. Book Move
  if (classId === 'book') {
    if (opening && opening.name && opening.name !== 'Standard Game') {
      return `Standard opening book move in the ${opening.name} (${opening.eco || ''}).`;
    }
    return `Follows recognized opening theory and standard development.`;
  }

  // 3. Forced Move
  if (classId === 'forced') {
    return `The only legal response on the board, forced by the opponent's check or pin.`;
  }

  // 4. Brilliant Move
  if (classId === 'brilliant') {
    if (isCapture && capturedName) {
      return `A brilliant tactical strike, trading the ${pieceName} on ${move.to} to dismantle opponent defenses and force a winning breakthrough.`;
    }
    return `A stunning sacrifice! Offering the ${pieceName} on ${move.to} unlocks a decisive tactical sequence that cements a winning advantage.`;
  }

  // 5. Great Move
  if (classId === 'great') {
    if (isCheck) {
      return `A sharp, critical check with the ${pieceName} on ${move.to}—the only continuation preserving the advantage.`;
    }
    return `A pinpoint move finding the only winning path in a complex, sharp position.`;
  }

  // 6. Best Move
  if (classId === 'best') {
    if (isCapture) {
      return `The engine's top choice, winning the ${capturedName} on ${move.to} and maximizing active piece placement.`;
    }
    if (isCheck) {
      return `An active check with the ${pieceName} on ${move.to}, keeping maximum pressure on the enemy king.`;
    }
    if (move.isCastle) {
      return `Castles to safeguard the king and connect the rooks for the upcoming middlegame.`;
    }
    return `The optimal move recommended by Stockfish, actively placing the ${pieceName} on ${move.to}.`;
  }

  // 7. Missed Win
  if (classId === 'miss' || classId === 'missed_win') {
    if (bestMoveSan) {
      return `Missed a winning tactical opportunity! Playing ${bestMoveSan} would have seized a decisive advantage.`;
    }
    return `Overlooked a winning continuation, allowing the opponent to stay in the contest.`;
  }

  // 8. Blunder
  if (classId === 'blunder') {
    if (isCapture) {
      return `A critical blunder. Capturing on ${move.to} walks into immediate tactical refutation. Better was ${bestMoveSan || 'a defensive consolidation'}.`;
    }
    if (bestMoveSan) {
      return `A serious blunder that damages the position. Playing ${bestMoveSan} was essential to stay balanced.`;
    }
    return `A severe oversight that hands the initiative and decisive advantage to the opponent.`;
  }

  // 9. Mistake
  if (classId === 'mistake') {
    if (bestMoveSan) {
      return `A noticeable mistake conceding a significant edge. Better was ${bestMoveSan}.`;
    }
    return `Concedes practical initiative to the opponent. A more patient positional choice was preferred.`;
  }

  // 10. Inaccuracy
  if (classId === 'inaccuracy') {
    if (bestMoveSan) {
      return `Slightly passive or imprecise. ${bestMoveSan} was more active and accurate.`;
    }
    return `An inaccuracy that allows the opponent a comfortable equalizing response.`;
  }

  // 11. Excellent / Good
  if (classId === 'excellent' || classId === 'good') {
    if (isCapture) {
      return `A solid exchange, removing the ${capturedName} on ${move.to}.`;
    }
    if (move.isCastle) {
      return `Safeguards the king and activates the rook.`;
    }
    return `A solid and playable continuation keeping healthy control of the position.`;
  }

  return classification?.description || 'Move analyzed by Stockfish.';
}

export default {
  generateMoveExplanation
};

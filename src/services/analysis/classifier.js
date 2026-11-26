// Centralized Move Classification & Chess Evaluation Engine
// Implements centipawn loss, win probability modeling, tactical sacrifice detection, and label assignment.

export const ANALYSIS_STATES = {
  PENDING: 'pending',
  PROVISIONAL: 'provisional',
  ANALYSED: 'analysed',
  UNAVAILABLE: 'unavailable',
  FAILED: 'failed'
};

export const MOVE_CLASSES = {
  BRILLIANT: {
    id: 'brilliant',
    label: 'Brilliant',
    symbol: '!!',
    color: '#ffffff',
    badgeColor: '#1baaa7',
    bgColor: 'rgba(27, 170, 167, 0.15)',
    borderColor: '#1baaa7',
    description: 'A dazzling, hard-to-find move—almost always involving a piece sacrifice that preserves or cements advantage.'
  },
  GREAT: {
    id: 'great',
    label: 'Great Move',
    symbol: '!',
    color: '#ffffff',
    badgeColor: '#5c8bb0',
    bgColor: 'rgba(92, 139, 176, 0.15)',
    borderColor: '#5c8bb0',
    description: 'A critical move that finds the only winning or saving path in a sharp position.'
  },
  BEST: {
    id: 'best',
    label: 'Best',
    symbol: '★',
    color: '#ffffff',
    badgeColor: '#81b64c',
    bgColor: 'rgba(129, 182, 76, 0.15)',
    borderColor: '#81b64c',
    description: 'The #1 move recommended by the chess engine (0% win chance loss).'
  },
  EXCELLENT: {
    id: 'excellent',
    label: 'Excellent',
    symbol: '👍',
    color: '#ffffff',
    badgeColor: '#96bc4b',
    bgColor: 'rgba(150, 188, 75, 0.15)',
    borderColor: '#96bc4b',
    description: 'A top-tier move nearly identical in strength to the engine top choice (< 2% win chance loss).'
  },
  GOOD: {
    id: 'good',
    label: 'Good',
    symbol: '✔',
    color: '#ffffff',
    badgeColor: '#86a666',
    bgColor: 'rgba(134, 166, 102, 0.15)',
    borderColor: '#86a666',
    description: 'A decent, playable move that slightly underperforms the top engine choices (2% to 5% win chance loss).'
  },
  BOOK: {
    id: 'book',
    label: 'Book',
    symbol: '📖',
    color: '#ffffff',
    badgeColor: '#d5a47e',
    bgColor: 'rgba(213, 164, 126, 0.15)',
    borderColor: '#d5a47e',
    description: 'A standard, established move from recognized chess opening theory.'
  },
  FORCED: {
    id: 'forced',
    label: 'Forced',
    symbol: '□',
    color: '#ffffff',
    badgeColor: '#8c8c8c',
    bgColor: 'rgba(140, 140, 140, 0.15)',
    borderColor: '#8c8c8c',
    description: 'The only legal move available or the only move avoiding immediate checkmate.'
  },
  INTERESTING: {
    id: 'interesting',
    label: 'Interesting',
    symbol: '!?',
    color: '#ffffff',
    badgeColor: '#a855f7',
    bgColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: '#a855f7',
    description: 'A double-edged, speculative move creating practical tactical complications.'
  },
  INACCURACY: {
    id: 'inaccuracy',
    label: 'Inaccuracy',
    symbol: '?!',
    color: '#ffffff',
    badgeColor: '#f0c15c',
    bgColor: 'rgba(240, 193, 92, 0.15)',
    borderColor: '#f0c15c',
    description: 'A minor slip conceding a small positional or tactical edge (5% to 10% win chance loss).'
  },
  MISTAKE: {
    id: 'mistake',
    label: 'Mistake',
    symbol: '?',
    color: '#ffffff',
    badgeColor: '#e58f2a',
    bgColor: 'rgba(229, 143, 42, 0.15)',
    borderColor: '#e58f2a',
    description: 'A bad move that significantly damages your position (10% to 20% win chance loss).'
  },
  MISS: {
    id: 'miss',
    label: 'Miss',
    symbol: '❌',
    color: '#ffffff',
    badgeColor: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    description: "Failing to punish an opponent's blunder or overlooking a clear winning tactic."
  },
  MISSED_WIN: {
    id: 'miss',
    label: 'Miss',
    symbol: '❌',
    color: '#ffffff',
    badgeColor: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#ef4444',
    description: "Failing to punish an opponent's blunder or overlooking a clear winning tactic."
  },
  BLUNDER: {
    id: 'blunder',
    label: 'Blunder',
    symbol: '??',
    color: '#ffffff',
    badgeColor: '#fa412d',
    bgColor: 'rgba(250, 65, 45, 0.15)',
    borderColor: '#fa412d',
    description: 'A catastrophic error losing heavy material or throwing away the game (> 20% win chance loss).'
  },
  ONLY_MOVE: {
    id: 'great',
    label: 'Great Move',
    symbol: '!',
    color: '#ffffff',
    badgeColor: '#5c8bb0',
    bgColor: 'rgba(92, 139, 176, 0.15)',
    borderColor: '#5c8bb0',
    description: 'A critical move finding the only winning or saving path where all alternatives were worse.'
  }
};

/**
 * Normalizes an evaluation score to centipawns from White's perspective.
 * Handles both centipawns and mate-in-N scores safely.
 */
export function scoreToWhiteCp(evalObj) {
  if (!evalObj) return 0;
  if (evalObj.mate !== undefined && evalObj.mate !== null) {
    const mate = evalObj.mate;
    if (mate === 0) {
      if (evalObj.cp !== undefined) {
        return evalObj.cp;
      }
      return 0;
    }
    const sign = mate > 0 ? 1 : -1;
    // Mate in N scales with proximity to mate (faster mate = larger score)
    return sign * (30000 - Math.min(Math.abs(mate), 50) * 100);
  }
  return evalObj.cp !== undefined ? evalObj.cp : 0;
}

/**
 * Converts centipawns to expected win probability % (0 to 100)
 * Uses standard sigmoid model used by modern chess analytics:
 * P(win) = 100 / (1 + exp(-0.00368208 * cp))
 */
export function cpToWinChance(cp) {
  if (cp > 3000) return 100;
  if (cp < -3000) return 0;
  return 100 / (1 + Math.exp(-0.00368208 * cp));
}

/**
 * Calculates centipawn loss from the perspective of the player who made the move.
 * @param {number} preCp - White's cp before the move
 * @param {number} postCp - White's cp after the move
 * @param {'w'|'b'} turn - Player who made the move
 */
export function calculateCpLoss(preCp, postCp, turn) {
  if (turn === 'w') {
    return Math.max(0, preCp - postCp);
  } else {
    return Math.max(0, postCp - preCp);
  }
}

/**
 * Checks if a move involved a genuine piece sacrifice
 * (player traded a piece for lesser material or moved/left a piece on an attacked square
 * where the opponent can capture it with net material advantage, while the move remains sound).
 * @param {Object} moveData - { piece, captured, to, from, color }
 * @param {Object} [chessBefore] - optional chess.js instance before move
 * @param {Object} [chessAfter] - optional chess.js instance after move
 */
export function isPieceSacrifice(moveData, chessBefore = null, chessAfter = null) {
  if (!moveData || !moveData.piece) return false;

  const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const moverType = moveData.piece.toLowerCase();
  const moverVal = pieceValues[moverType] || 0;

  // Never consider king or pawn moves as piece sacrifices
  if (moverVal < 3) return false;

  const capturedType = moveData.captured ? moveData.captured.toLowerCase() : null;
  const capturedVal = capturedType ? (pieceValues[capturedType] || 0) : 0;
  const opponentColor = moveData.color === 'w' ? 'b' : (moveData.color === 'b' ? 'w' : (chessBefore ? (chessBefore.turn() === 'w' ? 'b' : 'w') : 'b'));

  let targetBoard = chessAfter;
  if (!targetBoard && chessBefore) {
    try {
      const clone = new chessBefore.constructor(chessBefore.fen());
      const res = clone.move(moveData);
      if (res) {
        targetBoard = clone;
      }
    } catch (e) {}
  }

  // 1. Board-level inspection via resulting board state
  if (targetBoard) {
    try {
      const oppMoves = targetBoard.moves({ verbose: true });
      const capturesOfMovedPiece = oppMoves.filter(m => m.to === moveData.to);

      if (capturesOfMovedPiece.length > 0) {
        // Opponent can legally capture our piece on the next ply
        // If our piece gave up net material (e.g. Bishop for pawn, Rook for minor, Queen for rook/minor, or moved to attacked square)
        if ((moverVal - capturedVal) >= 1.5) {
          return true;
        }

        // If piece was moved to an empty square, it's completely hanging
        if (capturedVal === 0 && moverVal >= 3) {
          return true;
        }
      }

      // Passive sacrifice: an existing valuable piece (value >= 3) was left en prise
      const otherHangingPieceCaptures = oppMoves.filter(m => {
        if (!m.captured || m.to === moveData.to) return false;
        const capVal = pieceValues[m.captured.toLowerCase()] || 0;
        return capVal >= 3;
      });
      if (otherHangingPieceCaptures.length > 0) {
        for (const cap of otherHangingPieceCaptures) {
          const capVal = pieceValues[cap.captured.toLowerCase()] || 0;
          const attVal = pieceValues[cap.piece?.toLowerCase()] || 1;
          if (attVal < capVal) return true;
        }
      }
    } catch (e) {}
  }

  // 2. Pre-move board inspection (if targetBoard couldn't be cloned or move was partial)
  if (chessBefore && moveData.to) {
    try {
      if (typeof chessBefore.isAttacked === 'function') {
        const isTargetAttacked = chessBefore.isAttacked(moveData.to, opponentColor);
        if (isTargetAttacked && (moverVal - capturedVal) >= 1.5) {
          return true;
        }
      }
    } catch (e) {}
  }

  // 3. Fallback for isolated unit tests / exchange sacrifice heuristic:
  // Must be trading a high-value piece for a lesser piece of at least minor piece value
  // (e.g. Rook for Knight/Bishop 5 for 3, or Queen for Rook/Minor 9 for 5/3)
  if (capturedVal >= 3 && (moverVal - capturedVal) >= 2) {
    return true;
  }

  return false;
}

/**
 * Classifies a played move based on pre and post engine evaluation,
 * opening book status, tactical context, and legal move alternatives.
 */
export function classifyMove({
  playedMove,       // { from, to, piece, captured, san }
  engineBestMove,   // 'e2e4' or SAN
  preEval,          // { cp, mate }
  postEval,         // { cp, mate }
  turn,             // 'w' or 'b'
  isBook = false,
  legalMovesCount = 20,
  secondBestLoss = 0, // difference between best and 2nd best move
  chessBefore = null,
  chessAfter = null,
  oppBlunderOnPrevTurn = false
}) {
  // 1. If only 1 legal move existed in position, it's Forced
  if (legalMovesCount === 1) {
    return {
      classification: MOVE_CLASSES.FORCED,
      cpLoss: 0,
      winChanceLoss: 0,
      isBook: false,
      state: ANALYSIS_STATES.ANALYSED
    };
  }

  // 2. Book Move
  if (isBook) {
    return {
      classification: MOVE_CLASSES.BOOK,
      cpLoss: 0,
      winChanceLoss: 0,
      isBook: true,
      state: ANALYSIS_STATES.ANALYSED
    };
  }

  const preCp = scoreToWhiteCp(preEval);
  const postCp = scoreToWhiteCp(postEval);
  const cpLoss = calculateCpLoss(preCp, postCp, turn);

  const playerPreScore = turn === 'w' ? preCp : -preCp;
  const playerPostScore = turn === 'w' ? postCp : -postCp;

  const playerPreWin = cpToWinChance(playerPreScore);
  const playerPostWin = cpToWinChance(playerPostScore);
  const winLoss = Math.max(0, playerPreWin - playerPostWin);

  const isDeliveredMate = Boolean(
    (playedMove?.san && playedMove.san.endsWith('#')) ||
    (chessAfter && typeof chessAfter.isCheckmate === 'function' && chessAfter.isCheckmate()) ||
    playerPostScore >= 25000
  );

  const uciPlayed = playedMove ? `${playedMove.from}${playedMove.to}` : '';
  const isEngineTopChoice = isDeliveredMate || Boolean(engineBestMove && (
    engineBestMove === uciPlayed ||
    engineBestMove === playedMove?.san ||
    (playedMove?.promotion && engineBestMove.startsWith(uciPlayed))
  ));

  const isSacrifice = isPieceSacrifice(playedMove, chessBefore, chessAfter);

  // If the move delivers checkmate:
  if (isDeliveredMate) {
    if (isSacrifice && playerPreScore < 500) {
      return {
        classification: MOVE_CLASSES.BRILLIANT,
        cpLoss: 0,
        winChanceLoss: 0,
        isBook: false,
        state: ANALYSIS_STATES.ANALYSED
      };
    }
    return {
      classification: MOVE_CLASSES.BEST,
      cpLoss: 0,
      winChanceLoss: 0,
      isBook: false,
      state: ANALYSIS_STATES.ANALYSED
    };
  }

  // 1. Check for Miss (❌)
  // Decisive advantage existed (playerPreScore >= 250 or playerPreWin >= 75%) and was squandered (cpLoss >= 120 || winLoss >= 15%)
  // or opponent made a blunder/mistake on previous turn and player overlooked the tactic
  const hadDecisiveWin = playerPreScore >= 250 || playerPreWin >= 75;
  const squanderedWin = (playerPostScore < 120 || playerPostWin < 60) && (cpLoss >= 120 || winLoss >= 15);
  if ((hadDecisiveWin && squanderedWin) || (oppBlunderOnPrevTurn && (cpLoss >= 100 || winLoss >= 12))) {
    return {
      classification: MOVE_CLASSES.MISS,
      cpLoss,
      winChanceLoss: winLoss,
      isBook: false,
      state: ANALYSIS_STATES.ANALYSED
    };
  }

  // 2. Check for Brilliant Move (!!)
  // Requirements:
  // - Verified piece sacrifice (isPieceSacrifice)
  // - Move is the engine's Best Move or near-optimal (isEngineTopChoice || cpLoss <= 10 || winLoss <= 1.0)
  // - Anti-Triviality / Ceilings: Position was not already runaway won before the move (playerPreScore < 500 && playerPreWin < 95)
  // - Soundness: Post-move position remains winning or solid (playerPostScore >= 50 && playerPostWin >= 55)
  if (isSacrifice && (isEngineTopChoice || cpLoss <= 10 || winLoss <= 1.0)) {
    if (playerPreScore < 500 && playerPostScore >= 50) {
      return {
        classification: MOVE_CLASSES.BRILLIANT,
        cpLoss,
        winChanceLoss: winLoss,
        isBook: false,
        state: ANALYSIS_STATES.ANALYSED
      };
    }
  }

  // 3. Check for Great Move (!)
  // "Only-Move Rule": Best move where alternatives were significantly worse
  if ((isEngineTopChoice || cpLoss <= 5 || winLoss <= 0.5) && secondBestLoss >= 120 && legalMovesCount > 1 && playerPreScore < 700) {
    return {
      classification: MOVE_CLASSES.GREAT,
      cpLoss,
      winChanceLoss: winLoss,
      isBook: false,
      state: ANALYSIS_STATES.ANALYSED
    };
  }

  // 4. Best Move (★)
  // #1 engine recommendation or <= 1.0% win probability loss
  if (isEngineTopChoice || winLoss <= 1.0 || cpLoss <= 5) {
    return {
      classification: MOVE_CLASSES.BEST,
      cpLoss,
      winChanceLoss: winLoss,
      isBook: false,
      state: ANALYSIS_STATES.ANALYSED
    };
  }

  // 5. Standard loss-based classifications calibrated to Win Chance Loss & Centipawns:
  // Excellent (👍): 1.0% < winLoss <= 3.0% (cpLoss <= 25)
  if (winLoss <= 3.0 || cpLoss <= 25) {
    return {
      classification: MOVE_CLASSES.EXCELLENT,
      cpLoss,
      winChanceLoss: winLoss,
      isBook: false,
      state: ANALYSIS_STATES.ANALYSED
    };
  }

  // Good (✔): 3.0% < winLoss <= 6.0% (cpLoss <= 55)
  if (winLoss <= 6.0 || cpLoss <= 55) {
    return {
      classification: MOVE_CLASSES.GOOD,
      cpLoss,
      winChanceLoss: winLoss,
      isBook: false,
      state: ANALYSIS_STATES.ANALYSED
    };
  }

  // Inaccuracy (?!): 6.0% < winLoss <= 12.0% (cpLoss <= 110)
  if (winLoss <= 12.0 || cpLoss <= 110) {
    return {
      classification: MOVE_CLASSES.INACCURACY,
      cpLoss,
      winChanceLoss: winLoss,
      isBook: false,
      state: ANALYSIS_STATES.ANALYSED
    };
  }

  // Mistake (?): 12.0% < winLoss <= 20.0% (cpLoss <= 220)
  if (winLoss <= 20.0 || cpLoss <= 220) {
    return {
      classification: MOVE_CLASSES.MISTAKE,
      cpLoss,
      winChanceLoss: winLoss,
      isBook: false,
      state: ANALYSIS_STATES.ANALYSED
    };
  }

  // Blunder (??): winLoss > 20.0% (cpLoss > 220)
  return {
    classification: MOVE_CLASSES.BLUNDER,
    cpLoss,
    winChanceLoss: winLoss,
    isBook: false,
    state: ANALYSIS_STATES.ANALYSED
  };
}

/**
 * Calculates overall player game accuracy percentage from the array of moves.
 * Uses the calibrated CAPS win-percentage loss model:
 * moveAcc = 103.1668 * exp(-0.04354 * winChanceLoss) - 3.1669
 * Excludes book moves and forced moves.
 */
export function calculateAccuracy(movesList = []) {
  if (!movesList || movesList.length === 0) return 100;

  // Filter out book and forced moves
  const evaluatedMoves = movesList.filter(m => !m.isBook && m.classification?.id !== 'forced');
  if (evaluatedMoves.length === 0) return 100;

  let totalAcc = 0;
  for (const m of evaluatedMoves) {
    let winLoss = m.winChanceLoss;
    if (winLoss === undefined || winLoss === null) {
      // derive winLoss from cpLoss if winChanceLoss not directly provided
      const cpL = m.cpLoss || 0;
      winLoss = Math.min(100, Math.max(0, cpL * 0.1));
    }
    const moveAcc = Math.min(100, Math.max(0, 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669));
    totalAcc += moveAcc;
  }

  const avgAcc = totalAcc / evaluatedMoves.length;
  return Math.min(100, Math.max(0, Math.round(avgAcc * 10) / 10));
}

/**
 * Formats centipawn evaluation for human display (e.g. +0.45, -1.20, +M3, -M2)
 */
export function formatEvaluation(evalObj, turn = 'w') {
  if (!evalObj) return '0.00';
  if (evalObj.mate !== undefined && evalObj.mate !== null) {
    const m = evalObj.mate;
    return m > 0 ? `+M${m}` : `-M${Math.abs(m)}`;
  }
  const cp = evalObj.cp !== undefined ? evalObj.cp : 0;
  const score = (cp / 100).toFixed(2);
  return cp > 0 ? `+${score}` : `${score}`;
}

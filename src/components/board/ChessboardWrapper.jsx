import React, { useState, useMemo, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { PromotionModal } from '../modals/PromotionModal';
import { BOARD_THEMES } from '../../services/storage/settingsStore';
import { BoardClassificationBadge } from './MoveClassificationBadge';

export function ChessboardWrapper({
  chess,
  fen,
  orientation = 'white',
  isInteractive = true,
  playerTurnColor = null, // 'w' | 'b' | null (null means both allowed, e.g. analysis)
  onMove = () => {},
  bestMoveArrow = null, // { from: 'e2', to: 'e4' } or null
  lastMove = null, // { from: 'e2', to: 'e4' }
  lastMoveClassification = null, // e.g. 'brilliant' | 'blunder' | MOVE_CLASSES.BRILLIANT
  themeId = 'classic-green',
  showLegalMoves = true,
  showHighlights = true
}) {
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  const currentTheme = useMemo(() => {
    return BOARD_THEMES.find(t => t.id === themeId) || BOARD_THEMES[0];
  }, [themeId]);

  // Find legal moves from the currently selected square
  const legalMovesForSelected = useMemo(() => {
    if (!selectedSquare || !chess || !showLegalMoves) return [];
    try {
      return chess.moves({ square: selectedSquare, verbose: true });
    } catch (e) {
      return [];
    }
  }, [selectedSquare, chess, showLegalMoves]);

  // Compute square styles for selected square, legal move dots, last move, and check
  const customSquareStyles = useMemo(() => {
    const styles = {};

    // 1. Last move highlighting (tinted with move classification color if available, like Chess.com)
    if (showHighlights && lastMove && lastMove.from && lastMove.to) {
      const badgeId = (typeof lastMoveClassification === 'string'
        ? lastMoveClassification
        : lastMoveClassification?.id)?.toLowerCase();

      const classificationColors = {
        brilliant: 'rgba(27, 170, 167, 0.45)',
        great: 'rgba(92, 139, 176, 0.45)',
        best: 'rgba(129, 182, 76, 0.45)',
        excellent: 'rgba(150, 188, 75, 0.45)',
        good: 'rgba(134, 166, 102, 0.45)',
        book: 'rgba(213, 164, 126, 0.45)',
        inaccuracy: 'rgba(240, 193, 92, 0.45)',
        mistake: 'rgba(229, 143, 42, 0.45)',
        blunder: 'rgba(250, 65, 45, 0.45)',
        miss: 'rgba(239, 68, 68, 0.45)',
        missed_win: 'rgba(239, 68, 68, 0.45)',
        forced: 'rgba(140, 140, 140, 0.4)',
        interesting: 'rgba(168, 85, 247, 0.45)',
        only_move: 'rgba(92, 139, 176, 0.45)'
      };

      const highlightBg = (badgeId && classificationColors[badgeId]) || 'rgba(255, 255, 0, 0.32)';
      const originBg = (badgeId && classificationColors[badgeId])
        ? classificationColors[badgeId].replace(/0\.\d+\)/, '0.26)')
        : 'rgba(255, 255, 0, 0.22)';

      styles[lastMove.from] = {
        backgroundColor: originBg
      };
      styles[lastMove.to] = {
        backgroundColor: highlightBg
      };
    }

    // 2. Selected square
    if (selectedSquare) {
      styles[selectedSquare] = {
        backgroundColor: 'rgba(56, 189, 248, 0.45)',
        boxShadow: 'inset 0 0 0 2px #38bdf8'
      };
    }

    // 3. Legal move target squares (clean circle indicator)
    if (showLegalMoves && legalMovesForSelected.length > 0) {
      for (const m of legalMovesForSelected) {
        const isCapture = chess.get(m.to) !== null || (m.flags && m.flags.includes('e'));
        styles[m.to] = {
          background: isCapture
            ? 'radial-gradient(circle, rgba(239, 68, 68, 0.5) 45%, transparent 50%)'
            : 'radial-gradient(circle, rgba(0, 0, 0, 0.25) 25%, transparent 28%)',
          borderRadius: isCapture ? '50%' : '0'
        };
      }
    }

    // 4. King in check highlight
    if (chess && chess.inCheck && chess.inCheck()) {
      const turn = chess.turn();
      const board = chess.board();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece && piece.type === 'k' && piece.color === turn) {
            const sq = `${String.fromCharCode(97 + c)}${8 - r}`;
            styles[sq] = {
              backgroundColor: 'rgba(239, 68, 68, 0.65)',
              boxShadow: '0 0 12px 2px rgba(239, 68, 68, 0.8)'
            };
          }
        }
      }
    }

    return styles;
  }, [chess, selectedSquare, legalMovesForSelected, lastMove, lastMoveClassification, showHighlights, showLegalMoves]);

  // Compute arrows for best move
  const arrows = useMemo(() => {
    if (!bestMoveArrow || !bestMoveArrow.from || !bestMoveArrow.to) return [];
    return [
      {
        startSquare: bestMoveArrow.from,
        endSquare: bestMoveArrow.to,
        color: 'rgba(234, 179, 8, 0.85)' // gold/amber arrow
      }
    ];
  }, [bestMoveArrow]);

  // Handle piece drop (drag & drop)
  const handlePieceDrop = ({ piece, sourceSquare, targetSquare }) => {
    if (!isInteractive || !chess || !targetSquare) return false;
    if (sourceSquare === targetSquare) return false;

    // Check player turn lock
    const currentTurn = chess.turn();
    if (playerTurnColor && currentTurn !== playerTurnColor) {
      return false;
    }

    // Check pawn promotion
    const pType = piece?.pieceType?.toLowerCase() || '';
    const isPawn = pType.endsWith('p');
    const isPromoting = isPawn && ((currentTurn === 'w' && targetSquare[1] === '8') || (currentTurn === 'b' && targetSquare[1] === '1'));

    if (isPromoting) {
      // Check if move is legal with queen promotion before showing modal
      try {
        const moves = chess.moves({ square: sourceSquare, verbose: true });
        const valid = moves.some(m => m.to === targetSquare);
        if (valid) {
          setPendingPromotion({ from: sourceSquare, to: targetSquare });
          return true; // will complete after user selects promotion piece
        }
      } catch (e) {}
      return false;
    }

    // Execute standard move
    try {
      const move = onMove({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (move) {
        setSelectedSquare(null);
        return true;
      }
    } catch (e) {
      console.warn('Move rejected:', e);
    }

    return false;
  };

  // Handle click-to-move and click-to-select
  const handleSquareClick = (args) => {
    if (!isInteractive || !chess) return;

    // Defensively handle both { square } object or raw string
    const square = typeof args === 'string' ? args : args?.square;
    if (!square) return;

    const currentTurn = chess.turn();
    if (playerTurnColor && currentTurn !== playerTurnColor) {
      setSelectedSquare(null);
      return;
    }

    // If a square is already selected, try moving to clicked square
    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }

      // Check promotion
      const piece = chess.get(selectedSquare);
      const isPawn = piece && piece.type === 'p';
      const isPromoting = isPawn && ((piece.color === 'w' && square[1] === '8') || (piece.color === 'b' && square[1] === '1'));

      if (isPromoting) {
        const moves = chess.moves({ square: selectedSquare, verbose: true });
        const valid = moves.some(m => m.to === square);
        if (valid) {
          setPendingPromotion({ from: selectedSquare, to: square });
          setSelectedSquare(null);
          return;
        }
      }

      const move = onMove({ from: selectedSquare, to: square, promotion: 'q' });
      if (move) {
        setSelectedSquare(null);
        return;
      }
    }

    // Otherwise, select piece if it belongs to current player
    const piece = chess.get(square);
    if (piece && piece.color === currentTurn) {
      setSelectedSquare(square);
    } else {
      setSelectedSquare(null);
    }
  };

  const handlePromotionSelect = (promotionPiece) => {
    if (!pendingPromotion) return;
    onMove({
      from: pendingPromotion.from,
      to: pendingPromotion.to,
      promotion: promotionPiece
    });
    setPendingPromotion(null);
  };

  // Custom square renderer to draw pieces and on-board move classification badges
  const squareRenderer = useCallback(({ piece, square, children }) => {
    const isTarget = Boolean(lastMove && lastMove.to === square && lastMoveClassification);

    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...(customSquareStyles[square] || {})
        }}
      >
        {children}
        {isTarget && (
          <BoardClassificationBadge classification={lastMoveClassification} />
        )}
      </div>
    );
  }, [lastMove, lastMoveClassification, customSquareStyles]);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="board-container shadow-2xl rounded-lg overflow-hidden border border-canvas-border">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: isInteractive,
            canDragPiece: (args) => {
              if (!isInteractive || !chess) return false;
              const turn = chess.turn();
              if (playerTurnColor && turn !== playerTurnColor) return false;
              const p = args?.piece?.pieceType || args?.piece || args?.pieceType || '';
              const pStr = typeof p === 'string' ? p : '';
              if (pStr.length > 0) {
                return pStr[0].toLowerCase() === turn.toLowerCase();
              }
              return true;
            },
            onPieceDrop: handlePieceDrop,
            onSquareClick: handleSquareClick,
            squareRenderer,
            squareStyles: customSquareStyles,
            arrows,
            darkSquareStyle: { backgroundColor: currentTheme.dark },
            lightSquareStyle: { backgroundColor: currentTheme.light },
            showNotation: true,
            boardStyle: {
              borderRadius: '6px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)'
            }
          }}
        />
      </div>

      <PromotionModal
        isOpen={Boolean(pendingPromotion)}
        turn={chess?.turn() || 'w'}
        onSelect={handlePromotionSelect}
        onCancel={() => setPendingPromotion(null)}
      />
    </div>
  );
}


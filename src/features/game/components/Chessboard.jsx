import React, { useState, useMemo, useCallback } from 'react';
import { Chessboard as ReactChessboard } from 'react-chessboard';
import { PromotionDialog } from './PromotionDialog';
import { BoardClassificationBadge } from '../../../components/board/MoveClassificationBadge';
import { BOARD_THEMES } from '../../../services/storage/settingsStore';
import {
  STARTING_FEN,
  getLegalMoves,
  isLegalMove,
  isInCheck,
  getTurn,
  getPieceAt,
  getKingSquare
} from '../domain/chessRules';

/**
 * Reusable, authoritative Chessboard presentation component.
 * Decoupled from game networking and mutative state; receives game state and callbacks.
 */
export function Chessboard({
  fen = STARTING_FEN,
  orientation = 'white',
  isInteractive = true,
  playerTurnColor = null, // 'w' | 'b' | null (null allows both sides to move, e.g. analysis)
  onMove = () => {},
  bestMoveArrow = null, // { from: 'e2', to: 'e4' } or null
  lastMove = null, // { from: 'e2', to: 'e4' }
  lastMoveClassification = null, // e.g. 'brilliant' | 'blunder' | object
  themeId = 'classic-green',
  showLegalMoves = true,
  showHighlights = true,
  customSquareStyles: externalStyles = {}
}) {
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  const currentTurn = useMemo(() => getTurn(fen), [fen]);
  const isCheck = useMemo(() => isInCheck(fen), [fen]);

  const currentTheme = useMemo(() => {
    return BOARD_THEMES.find((t) => t.id === themeId) || BOARD_THEMES[0];
  }, [themeId]);

  // Find legal moves from the currently selected square using pure domain rules
  const legalMovesForSelected = useMemo(() => {
    if (!selectedSquare || !showLegalMoves || !isInteractive) return [];
    try {
      return getLegalMoves(fen, selectedSquare);
    } catch (e) {
      return [];
    }
  }, [fen, selectedSquare, showLegalMoves, isInteractive]);

  // Compute square styles (last move, selected square, legal move dots, check glow)
  const customSquareStyles = useMemo(() => {
    const styles = { ...externalStyles };

    // 1. Last move highlighting
    if (showHighlights && lastMove?.from && lastMove?.to) {
      const badgeId = (
        typeof lastMoveClassification === 'string'
          ? lastMoveClassification
          : lastMoveClassification?.id
      )?.toLowerCase();

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
        ...styles[lastMove.from],
        backgroundColor: originBg
      };
      styles[lastMove.to] = {
        ...styles[lastMove.to],
        backgroundColor: highlightBg
      };
    }

    // 2. Selected square
    if (selectedSquare) {
      styles[selectedSquare] = {
        ...styles[selectedSquare],
        backgroundColor: 'rgba(56, 189, 248, 0.45)',
        boxShadow: 'inset 0 0 0 2px #38bdf8'
      };
    }

    // 3. Legal move targets from selected piece
    if (showLegalMoves && legalMovesForSelected.length > 0) {
      for (const m of legalMovesForSelected) {
        const destPiece = getPieceAt(fen, m.to);
        const isCapture = destPiece !== null || (m.flags && m.flags.includes('e'));
        styles[m.to] = {
          ...styles[m.to],
          background: isCapture
            ? 'radial-gradient(circle, rgba(239, 68, 68, 0.5) 45%, transparent 50%)'
            : 'radial-gradient(circle, rgba(0, 0, 0, 0.25) 25%, transparent 28%)',
          borderRadius: isCapture ? '50%' : '0'
        };
      }
    }

    // 4. King in check highlight
    if (isCheck) {
      const kingSq = getKingSquare(fen, currentTurn);
      if (kingSq) {
        styles[kingSq] = {
          ...styles[kingSq],
          backgroundColor: 'rgba(239, 68, 68, 0.65)',
          boxShadow: '0 0 14px 3px rgba(239, 68, 68, 0.85)'
        };
      }
    }

    return styles;
  }, [
    fen,
    currentTurn,
    isCheck,
    selectedSquare,
    legalMovesForSelected,
    lastMove,
    lastMoveClassification,
    showHighlights,
    showLegalMoves,
    externalStyles
  ]);

  // Compute best move arrows
  const arrows = useMemo(() => {
    if (!bestMoveArrow?.from || !bestMoveArrow?.to) return [];
    return [
      {
        startSquare: bestMoveArrow.from,
        endSquare: bestMoveArrow.to,
        color: 'rgba(234, 179, 8, 0.85)'
      }
    ];
  }, [bestMoveArrow]);

  // Handle piece drop (drag & drop)
  const handlePieceDrop = ({ piece, sourceSquare, targetSquare }) => {
    if (!isInteractive || !targetSquare) return false;
    if (sourceSquare === targetSquare) return false;

    // Check turn lock
    if (playerTurnColor && currentTurn !== playerTurnColor) {
      return false;
    }

    // Detect pawn promotion
    const pType = piece?.pieceType?.toLowerCase() || '';
    const isPawn = pType.endsWith('p') || pType === 'p';
    const isPromoting =
      isPawn &&
      ((currentTurn === 'w' && targetSquare[1] === '8') ||
        (currentTurn === 'b' && targetSquare[1] === '1'));

    if (isPromoting) {
      // Check if move is legal with promotion queen before prompting
      const legal = isLegalMove(fen, { from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (legal) {
        setPendingPromotion({ from: sourceSquare, to: targetSquare });
        return true;
      }
      return false;
    }

    // Check legality and execute
    const legal = isLegalMove(fen, { from: sourceSquare, to: targetSquare, promotion: 'q' });
    if (!legal) return false;

    try {
      const success = onMove({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (success !== false) {
        setSelectedSquare(null);
        return true;
      }
    } catch (e) {
      console.warn('Move rejected by handler:', e);
    }
    return false;
  };

  // Handle click-to-move and click-to-select
  const handleSquareClick = (args) => {
    if (!isInteractive) return;

    const square = typeof args === 'string' ? args : args?.square;
    if (!square) return;

    if (playerTurnColor && currentTurn !== playerTurnColor) {
      setSelectedSquare(null);
      return;
    }

    // If already selecting a square, attempt move to clicked square
    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }

      const piece = getPieceAt(fen, selectedSquare);
      const isPawn = piece && piece.type === 'p';
      const isPromoting =
        isPawn &&
        ((piece.color === 'w' && square[1] === '8') ||
          (piece.color === 'b' && square[1] === '1'));

      if (isPromoting) {
        const legal = isLegalMove(fen, { from: selectedSquare, to: square, promotion: 'q' });
        if (legal) {
          setPendingPromotion({ from: selectedSquare, to: square });
          setSelectedSquare(null);
          return;
        }
      }

      if (isLegalMove(fen, { from: selectedSquare, to: square, promotion: 'q' })) {
        const success = onMove({ from: selectedSquare, to: square, promotion: 'q' });
        if (success !== false) {
          setSelectedSquare(null);
          return;
        }
      }
    }

    // Select piece if it belongs to side to move
    const piece = getPieceAt(fen, square);
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

  // Custom square renderer for piece rendering and authentic move badges
  const squareRenderer = useCallback(
    ({ piece, square, children }) => {
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
    },
    [lastMove, lastMoveClassification, customSquareStyles]
  );

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none">
      <div className="board-container shadow-2xl rounded-xl overflow-hidden border border-canvas-border">
        <ReactChessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: isInteractive,
            canDragPiece: (args) => {
              if (!isInteractive) return false;
              if (playerTurnColor && currentTurn !== playerTurnColor) return false;
              const p = args?.piece?.pieceType || args?.piece || args?.pieceType || '';
              const pStr = typeof p === 'string' ? p : '';
              if (pStr.length > 0) {
                return pStr[0].toLowerCase() === currentTurn.toLowerCase();
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
              borderRadius: '8px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)'
            }
          }}
        />
      </div>

      <PromotionDialog
        isOpen={Boolean(pendingPromotion)}
        turn={currentTurn}
        onSelect={handlePromotionSelect}
        onCancel={() => setPendingPromotion(null)}
      />
    </div>
  );
}

export default Chessboard;

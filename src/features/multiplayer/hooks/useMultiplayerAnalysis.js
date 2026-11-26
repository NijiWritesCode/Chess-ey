// Multiplayer Live Stockfish Analysis Hook (Rebuild Blueprint Phase 8)
// Handles position snapshotting, asynchronous move classification, natural language explanations,
// and engine privacy (purely local client calculations).

import { useState, useEffect, useRef, useCallback } from 'react';
import { analyzeMove, evaluatePosition } from '../../analysis/services/analysisService';
import { STARTING_FEN } from '../../game/domain/chessRules';

/**
 * Dedicated hook for live engine analysis during multiplayer games.
 *
 * @param {Object} params
 * @param {string} params.roomId
 * @param {Array} params.moves - Canonical moves array
 * @param {string} params.displayFen - Current visible FEN
 * @param {number} params.currentPly - Current inspected ply (moves.length when live)
 * @param {boolean} [params.isEnabled=true] - Live analysis toggle
 * @param {number} [params.depth=12] - Engine search depth
 * @returns {Object} Analysis state, best move arrow, and evaluated moves map
 */
export function useMultiplayerAnalysis({
  roomId,
  moves = [],
  displayFen = STARTING_FEN,
  currentPly = 0,
  isEnabled = true,
  depth = 12
}) {
  const [currentEvaluation, setCurrentEvaluation] = useState(null);
  const [bestMoveArrow, setBestMoveArrow] = useState(null);
  const [selectedMoveAnalysis, setSelectedMoveAnalysis] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState(null);

  // Cache: ply -> analysisResult
  const cacheRef = useRef(new Map());
  const activeRequestIdRef = useRef(0);

  // Clear cache if roomId changes
  useEffect(() => {
    cacheRef.current.clear();
    setCurrentEvaluation(null);
    setBestMoveArrow(null);
    setSelectedMoveAnalysis(null);
    setError(null);
  }, [roomId]);

  // Main Analysis Pipeline (Phase 8.1 & 8.2)
  useEffect(() => {
    if (!isEnabled || !roomId) {
      setCurrentEvaluation(null);
      setBestMoveArrow(null);
      setSelectedMoveAnalysis(null);
      setIsThinking(false);
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    let isCancelled = false;

    async function runAnalysis() {
      setIsThinking(true);
      setError(null);

      // Case 1: Initial position (no moves yet or viewing ply 0)
      if (currentPly === 0 || moves.length === 0) {
        try {
          const evalRes = await evaluatePosition(displayFen || STARTING_FEN, { depth });
          if (isCancelled || requestId !== activeRequestIdRef.current) return;

          setCurrentEvaluation(evalRes);
          setSelectedMoveAnalysis(null);
          if (evalRes?.bestMove && evalRes.bestMove.length >= 4) {
            setBestMoveArrow({
              from: evalRes.bestMove.slice(0, 2),
              to: evalRes.bestMove.slice(2, 4)
            });
          } else {
            setBestMoveArrow(null);
          }
        } catch (err) {
          if (!isCancelled && requestId === activeRequestIdRef.current) {
            console.warn('[useMultiplayerAnalysis] Initial pos eval failed:', err);
            setError(err.message);
          }
        } finally {
          if (!isCancelled && requestId === activeRequestIdRef.current) {
            setIsThinking(false);
          }
        }
        return;
      }

      // Case 2: Inspecting an executed move (ply 1..moves.length)
      const targetPly = currentPly;
      const targetMove = moves[targetPly - 1];

      if (!targetMove) {
        setIsThinking(false);
        return;
      }

      // Check cache first for instant retrieval
      const cached = cacheRef.current.get(targetPly);
      if (cached) {
        setSelectedMoveAnalysis(cached);
        setCurrentEvaluation(cached.evalAfter);
        if (cached.bestMove && cached.bestMove.length >= 4) {
          setBestMoveArrow({
            from: cached.bestMove.slice(0, 2),
            to: cached.bestMove.slice(2, 4)
          });
        } else {
          setBestMoveArrow(null);
        }
        setIsThinking(false);
        return;
      }

      // Immutable Position Snapshot (Section 8.1)
      const fenBefore = targetPly === 1 ? STARTING_FEN : moves[targetPly - 2]?.fen || STARTING_FEN;
      const fenAfter = targetMove.fen;

      const snapshot = {
        roomId,
        targetPly,
        fenBefore,
        fenAfter,
        move: targetMove,
        turn: targetMove.turn || (targetPly % 2 === 1 ? 'w' : 'b'),
        depth
      };

      try {
        const analysisResult = await analyzeMove(snapshot);

        if (isCancelled || requestId !== activeRequestIdRef.current) return;

        // Cache completed analysis
        cacheRef.current.set(targetPly, analysisResult);

        // Update presentation only if result belongs to the expected position
        setSelectedMoveAnalysis(analysisResult);
        setCurrentEvaluation(analysisResult.evalAfter);

        if (analysisResult.bestMove && analysisResult.bestMove.length >= 4) {
          setBestMoveArrow({
            from: analysisResult.bestMove.slice(0, 2),
            to: analysisResult.bestMove.slice(2, 4)
          });
        } else {
          setBestMoveArrow(null);
        }
      } catch (err) {
        // Engine failures must NEVER break multiplayer gameplay (Section 8.3 & Completion Criteria)
        if (!isCancelled && requestId === activeRequestIdRef.current) {
          console.warn('[useMultiplayerAnalysis] Engine analysis error:', err);
          setError(err.message || 'Analysis temporarily unavailable.');
        }
      } finally {
        if (!isCancelled && requestId === activeRequestIdRef.current) {
          setIsThinking(false);
        }
      }
    }

    runAnalysis();

    return () => {
      isCancelled = true;
    };
  }, [roomId, currentPly, moves, displayFen, isEnabled, depth]);

  // Read-only map of all analyzed moves for badge rendering in MoveList
  const analyzedMovesMap = useCallback(
    (ply) => cacheRef.current.get(ply) || null,
    [cacheRef.current]
  );

  return {
    currentEvaluation,
    bestMoveArrow: isEnabled ? bestMoveArrow : null,
    selectedMoveAnalysis,
    isThinking,
    error,
    getAnalysisForPly: analyzedMovesMap
  };
}

export default useMultiplayerAnalysis;

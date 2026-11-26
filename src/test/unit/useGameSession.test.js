import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameSession } from '../../features/game/hooks/useGameSession';
import { GAME_STATUS } from '../../features/game/domain/gameReducer';
import { STARTING_FEN } from '../../features/game/domain/chessRules';

describe('Phase 2.1: useGameSession Hook & Game Controller', () => {
  it('initializes with active game state and starting FEN', () => {
    const { result } = renderHook(() =>
      useGameSession({
        timeControl: { initialSeconds: 300, increment: 2 },
        whitePlayer: { name: 'Player' },
        blackPlayer: { name: 'Stockfish' }
      })
    );

    expect(result.current.displayFen).toBe(STARTING_FEN);
    expect(result.current.turn).toBe('w');
    expect(result.current.status).toBe(GAME_STATUS.ACTIVE);
    expect(result.current.moves.length).toBe(0);
    expect(result.current.isLive).toBe(true);
    expect(result.current.isGameOver).toBe(false);
  });

  it('executes valid moves and alternates turns', () => {
    const { result } = renderHook(() => useGameSession());

    act(() => {
      const moved = result.current.makeMove({ from: 'e2', to: 'e4' });
      expect(moved).toBe(true);
    });

    expect(result.current.turn).toBe('b');
    expect(result.current.moves.length).toBe(1);
    expect(result.current.moves[0].san).toBe('e4');
    expect(result.current.lastMove.from).toBe('e2');
    expect(result.current.lastMove.to).toBe('e4');

    // Black responds
    act(() => {
      const moved = result.current.makeMove({ from: 'e7', to: 'e5' });
      expect(moved).toBe(true);
    });

    expect(result.current.turn).toBe('w');
    expect(result.current.moves.length).toBe(2);
    expect(result.current.moves[1].san).toBe('e5');
  });

  it('rejects illegal moves cleanly without modifying state', () => {
    const { result } = renderHook(() => useGameSession());

    act(() => {
      const moved = result.current.makeMove({ from: 'e2', to: 'e5' }); // illegal jump
      expect(moved).toBe(false);
    });

    expect(result.current.turn).toBe('w');
    expect(result.current.moves.length).toBe(0);
    expect(result.current.displayFen).toBe(STARTING_FEN);
  });

  it('handles resignation and concludes the game', () => {
    const { result } = renderHook(() => useGameSession());

    act(() => {
      result.current.resign('w');
    });

    expect(result.current.isGameOver).toBe(true);
    expect(result.current.result.winner).toBe('black');
    expect(result.current.result.reason).toBe('resignation');
  });

  it('handles timeout and concludes the game', () => {
    const { result } = renderHook(() => useGameSession());

    act(() => {
      result.current.timeout('b');
    });

    expect(result.current.isGameOver).toBe(true);
    expect(result.current.result.winner).toBe('white');
    expect(result.current.result.reason).toBe('timeout');
  });

  it('handles undo moves cleanly', () => {
    const { result } = renderHook(() => useGameSession());

    act(() => {
      result.current.makeMove({ from: 'e2', to: 'e4' });
    });
    act(() => {
      result.current.makeMove({ from: 'e7', to: 'e5' });
    });

    expect(result.current.moves.length).toBe(2);

    act(() => {
      result.current.undoMove(1);
    });

    expect(result.current.moves.length).toBe(1);
    expect(result.current.turn).toBe('b');

    act(() => {
      result.current.undoMove(1);
    });

    expect(result.current.moves.length).toBe(0);
    expect(result.current.turn).toBe('w');
    expect(result.current.displayFen).toBe(STARTING_FEN);
  });

  it('allows safe historical ply navigation without mutating active game', () => {
    const { result } = renderHook(() => useGameSession());

    act(() => {
      result.current.makeMove({ from: 'e2', to: 'e4' });
    });
    act(() => {
      result.current.makeMove({ from: 'e7', to: 'e5' });
    });
    act(() => {
      result.current.makeMove({ from: 'g1', to: 'f3' });
    });

    expect(result.current.currentPly).toBe(3);
    expect(result.current.isLive).toBe(true);

    // Inspect ply 1 (after 1. e4)
    act(() => {
      result.current.navigatePly(1);
    });

    expect(result.current.currentPly).toBe(1);
    expect(result.current.isLive).toBe(false);
    // Active moves are preserved!
    expect(result.current.moves.length).toBe(3);

    // Return to live
    act(() => {
      result.current.navigatePly(3);
    });

    expect(result.current.currentPly).toBe(3);
    expect(result.current.isLive).toBe(true);
  });
});

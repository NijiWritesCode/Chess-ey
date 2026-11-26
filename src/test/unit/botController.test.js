import { describe, it, expect, vi } from 'vitest';
import {
  parseUciMove,
  formatUciMove,
  computeBotMove
} from '../../features/computer/botController';
import { STARTING_FEN, isLegalMove } from '../../features/game/domain/chessRules';

describe('Phase 2.4: Bot Controller and Move Selection', () => {
  it('parses standard UCI move string correctly', () => {
    expect(parseUciMove('e2e4')).toEqual({
      from: 'e2',
      to: 'e4',
      promotion: null
    });

    expect(parseUciMove('g8f6')).toEqual({
      from: 'g8',
      to: 'f6',
      promotion: null
    });

    expect(parseUciMove('e7e8n')).toEqual({
      from: 'e7',
      to: 'e8',
      promotion: 'n'
    });
  });

  it('formats move object into UCI string correctly', () => {
    expect(formatUciMove({ from: 'e2', to: 'e4' })).toBe('e2e4');
    expect(formatUciMove({ from: 'e7', to: 'e8', promotion: 'r' })).toBe('e7e8r');
  });

  it('computes a legal bot move from the starting position', async () => {
    const result = await computeBotMove(STARTING_FEN, {
      depth: 2,
      movetime: 100,
      skillLevel: 5
    });

    expect(result).toBeDefined();
    expect(result.move).toBeDefined();
    expect(isLegalMove(STARTING_FEN, result.move)).toBe(true);
  });

  it('honors cancellation token and returns null when aborted', async () => {
    const result = await computeBotMove(
      STARTING_FEN,
      { depth: 10, movetime: 500 },
      { isCancelled: () => true }
    );

    expect(result).toBeNull();
  });
});

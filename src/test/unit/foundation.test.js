import { describe, it, expect } from 'vitest';

describe('Phase 0: Foundation & Environment Verification', () => {
  it('runs in jsdom with standard Web APIs and testing environment ready', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
    expect(typeof crypto).toBe('object');
  });

  it('supports ES Modules and modern JavaScript features', () => {
    const featureSet = new Set(['chess', 'stockfish', 'supabase']);
    expect(featureSet.has('chess')).toBe(true);
    expect([...featureSet].length).toBe(3);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StockfishEngine, ENGINE_STATES, EnginePool } from '../../features/analysis/engine/StockfishEngine';
import { STARTING_FEN } from '../../features/game/domain/chessRules';

class MockWorker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.currentFen = null;
    this.isSearching = false;
  }

  postMessage(cmd) {
    if (cmd === 'uci') {
      setTimeout(() => {
        this.onmessage?.({ data: 'id name Stockfish 16' });
        this.onmessage?.({ data: 'option name Skill Level type spin default 20 min 0 max 20' });
        this.onmessage?.({ data: 'uciok' });
      }, 5);
      return;
    }

    if (cmd === 'isready') {
      setTimeout(() => {
        this.onmessage?.({ data: 'readyok' });
      }, 5);
      return;
    }

    if (cmd.startsWith('position fen ')) {
      this.currentFen = cmd.replace('position fen ', '');
      return;
    }

    if (cmd.startsWith('go')) {
      this.isSearching = true;
      const turn = this.currentFen ? this.currentFen.split(' ')[1] : 'w';
      setTimeout(() => {
        if (!this.isSearching) return;
        this.onmessage?.({
          data: `info depth 12 score cp 45 pv e2e4 e7e5`
        });
        this.onmessage?.({
          data: 'bestmove e2e4'
        });
        this.isSearching = false;
      }, 15);
      return;
    }

    if (cmd === 'stop') {
      this.isSearching = false;
      setTimeout(() => {
        this.onmessage?.({ data: 'bestmove e2e4' });
      }, 5);
    }
  }

  terminate() {
    this.isSearching = false;
  }
}

describe('Phase 3.1 & 3.2: Stockfish Engine Architecture & Lifecycle', () => {
  let originalWorker;

  beforeEach(() => {
    originalWorker = global.Worker;
    global.Worker = MockWorker;
  });

  afterEach(() => {
    global.Worker = originalWorker;
  });

  it('initializes engine through handshake and transitions states', async () => {
    const engine = new StockfishEngine('test-lifecycle');
    expect(engine.getStatus()).toBe(ENGINE_STATES.IDLE);

    await engine.init();
    expect(engine.getStatus()).toBe(ENGINE_STATES.READY);
    expect(engine.isReady).toBe(true);

    engine.terminate();
    expect(engine.getStatus()).toBe(ENGINE_STATES.TERMINATED);
  });

  it('evaluates starting position with white-perspective normalization', async () => {
    const engine = new StockfishEngine('test-eval');
    const result = await engine.evaluatePosition(STARTING_FEN, { depth: 10 });

    expect(result).toBeDefined();
    expect(result.fen).toBe(STARTING_FEN);
    expect(result.score.type).toBe('cp');
    expect(result.score.value).toBe(45);
    expect(result.bestMove).toBe('e2e4');
    expect(result.principalVariation).toEqual(['e2e4', 'e7e5']);
    expect(result.depth).toBe(12);
    expect(result.status).toBe('complete');

    engine.terminate();
  });

  it('resolves checkmate terminal positions immediately with correct mate signs', async () => {
    const engine = new StockfishEngine('test-terminal');

    // Scholar's mate: White delivered checkmate against Black (turn is 'b')
    const scholarsMateFen = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
    const mateResult = await engine.evaluatePosition(scholarsMateFen);

    expect(mateResult.score.type).toBe('mate');
    // White is winning -> +mate / +30000
    expect(mateResult.cp).toBe(30000);
    expect(mateResult.status).toBe('complete');

    // Stalemate: drawn position
    const stalemateFen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
    const staleResult = await engine.evaluatePosition(stalemateFen);
    expect(staleResult.score.value).toBe(0);
    expect(staleResult.cp).toBe(0);
    expect(staleResult.status).toBe('complete');

    engine.terminate();
  });

  it('cancels an active search cleanly without leaving hanging promises', async () => {
    const engine = new StockfishEngine('test-cancel');
    await engine.init();

    const evalPromise = engine.evaluatePosition(STARTING_FEN, { depth: 20 });
    await new Promise((r) => setTimeout(r, 2));
    await engine.cancel();
    const result = await evalPromise;

    expect(result.status).toBe('cancelled');
    expect(engine.isThinking).toBe(false);
    expect(engine.getStatus()).toBe(ENGINE_STATES.READY);

    engine.terminate();
  });

  it('rejects with error when Worker class is not available and does not return fabricated zero', async () => {
    global.Worker = undefined;
    const engine = new StockfishEngine('test-fail');

    await expect(engine.evaluatePosition(STARTING_FEN)).rejects.toThrow();
    expect(engine.getStatus()).toBe(ENGINE_STATES.ERROR);
  });

  it('provides isolated engine instances in EnginePool', () => {
    expect(EnginePool.playEngine).toBeInstanceOf(StockfishEngine);
    expect(EnginePool.analysisEngine).toBeInstanceOf(StockfishEngine);
    expect(EnginePool.reviewEngine).toBeInstanceOf(StockfishEngine);
    expect(EnginePool.liveEngine).toBeInstanceOf(StockfishEngine);
    expect(EnginePool.playEngine.name).toBe('play');
    expect(EnginePool.analysisEngine.name).toBe('analysis');
  });
});

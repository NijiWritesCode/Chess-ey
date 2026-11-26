import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Chess } from 'chess.js';
import { StockfishEngine, EnginePool, playEngine, analysisEngine, reviewEngine, liveEngine } from '../services/engine/stockfishService';

// Mock Worker implementation simulating Stockfish UCI Engine
class MockStockfishWorker {
  constructor(scriptUrl) {
    this.scriptUrl = scriptUrl;
    this.onmessage = null;
    this.onerror = null;
    this.currentFen = null;
    this.isSearching = false;
    this.searchTimer = null;
    this.receivedCommands = [];

    // Simulate script load failure for fallback testing if requested
    if (MockStockfishWorker.failWasm && scriptUrl.includes('wasm')) {
      setTimeout(() => {
        if (this.onerror) {
          this.onerror(new Error('WASM compilation failed'));
        }
      }, 10);
    }
  }

  postMessage(cmd) {
    this.receivedCommands.push(cmd);

    if (cmd === 'uci') {
      setTimeout(() => {
        this._emit('id name Stockfish 16');
        this._emit('option name Skill Level type spin default 20 min 0 max 20');
        this._emit('option name UCI_LimitStrength type check default false');
        this._emit('option name UCI_Elo type spin default 1350 min 1320 max 3190');
        this._emit('option name MultiPV type spin default 1 min 1 max 500');
        this._emit('uciok');
      }, 5);
      return;
    }

    if (cmd === 'isready') {
      setTimeout(() => {
        this._emit('readyok');
      }, 5);
      return;
    }

    if (cmd.startsWith('position fen ')) {
      this.currentFen = cmd.replace('position fen ', '');
      return;
    }

    if (cmd.startsWith('go')) {
      this.isSearching = true;
      const fen = this.currentFen;
      const turn = fen ? fen.split(' ')[1] : 'w';
      
      // Determine dummy bestmove based on FEN so tests can verify move-FEN alignment
      let move = 'e2e4';
      if (fen && fen.includes('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR')) {
        move = 'e7e5';
      } else if (fen && fen.includes('4k3/8/8/8/8/8/4P3/4K3')) {
        move = 'e2e4';
      } else if (fen && fen.includes('black_win')) {
        move = 'c7c5';
      }

      this.searchTimer = setTimeout(() => {
        if (!this.isSearching) return;
        this._emit(`info depth 10 seldepth 12 multipv 1 score cp 35 nodes 50000 nps 1000000 pv ${move}`);
        this._emit(`bestmove ${move}`);
        this.isSearching = false;
      }, 40);
      return;
    }

    if (cmd === 'stop') {
      if (this.isSearching) {
        if (this.searchTimer) clearTimeout(this.searchTimer);
        const fen = this.currentFen;
        const move = fen && fen.includes('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR') ? 'e7e5' : 'e2e4';
        setTimeout(() => {
          this._emit(`bestmove ${move}`);
          this.isSearching = false;
        }, 10);
      }
      return;
    }
  }

  _emit(data) {
    if (this.onmessage) {
      this.onmessage({ data });
    }
  }

  terminate() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.isSearching = false;
  }
}

describe('Phase 1: Engine Layer Acceptance & Regression Suite', () => {
  let originalWorker;

  beforeEach(() => {
    originalWorker = global.Worker;
    MockStockfishWorker.failWasm = false;
    global.Worker = MockStockfishWorker;
  });

  afterEach(() => {
    global.Worker = originalWorker;
  });

  // E1: Stale bestmove desync & cancel barrier
  describe('E1: Stale bestmove desync prevention', () => {
    it('handles rapid sequential cancellations without stale bestmove leaking into next search', async () => {
      const engine = new StockfishEngine('test-e1');
      await engine.init();

      const fen1 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const fen2 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

      // Start search 1, then immediately start search 2
      const search1Promise = engine.evaluatePosition(fen1, { depth: 10 });
      // Cancel search 1 by starting search 2 immediately
      const search2Promise = engine.evaluatePosition(fen2, { depth: 10 });

      const result2 = await search2Promise;
      // Result 2 must correspond to fen2's response (e7e5), NOT fen1 (e2e4)
      expect(result2.bestMove).toBe('e7e5');

      engine.terminate();
    });

    it('ignores dangling engine output when no search job is active', async () => {
      const engine = new StockfishEngine('test-dangling');
      await engine.init();

      // Emit stray info message to worker when idle
      engine.worker._emit('info depth 20 score cp 999 pv a1a2');
      engine.worker._emit('bestmove a1a2');

      // The status should remain ready, no error thrown
      expect(engine.getStatus()).toBe('ready');

      engine.terminate();
    });
  });

  // E2: Depth and movetime formatting and timeout safety net
  describe('E2: Depth and movetime formatting', () => {
    it('sends both depth and movetime in go command when both options are provided', async () => {
      const engine = new StockfishEngine('test-e2');
      await engine.init();

      await engine.evaluatePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', {
        depth: 14,
        movetime: 500
      });

      const goCmd = engine.worker.receivedCommands.find(c => c.startsWith('go '));
      expect(goCmd).toBe('go depth 14 movetime 500');

      engine.terminate();
    });
  });

  // E3: Cancel and stop methods
  describe('E3: Cancel and stop methods', () => {
    it('provides cancel() and stopSearch() aliases without throwing', async () => {
      const engine = new StockfishEngine('test-e3');
      await engine.init();

      expect(typeof engine.cancel).toBe('function');
      expect(typeof engine.stopSearch).toBe('function');
      expect(typeof engine.stop).toBe('function');

      // Calling stopSearch while idle or active should not throw
      expect(() => engine.stopSearch()).not.toThrow();

      engine.terminate();
    });
  });

  // E4: UCI handshake & fallback
  describe('E4: UCI handshake & fallback to asm.js', () => {
    it('completes uci -> uciok -> isready -> readyok handshake', async () => {
      const engine = new StockfishEngine('test-e4');
      await engine.init();

      expect(engine.isReady).toBe(true);
      expect(engine.getStatus()).toBe('ready');
      expect(engine.worker.receivedCommands).toContain('uci');
      expect(engine.worker.receivedCommands).toContain('isready');

      engine.terminate();
    });

    it('falls back to asm.js (/engine/stockfish.js) if WASM fails to load', async () => {
      MockStockfishWorker.failWasm = true;
      const engine = new StockfishEngine('test-fallback');
      
      await engine.init();
      expect(engine.isReady).toBe(true);
      expect(engine.worker.scriptUrl).toContain('stockfish.js');
      expect(engine.worker.scriptUrl).not.toContain('stockfish.wasm.js');

      engine.terminate();
    });
  });

  // E5: Output parsing and terminal position detection
  describe('E5: Output parsing and terminal positions', () => {
    it('resolves checkmate immediately via chess.js without calling worker', async () => {
      const engine = new StockfishEngine('test-terminal');
      await engine.init();

      const initialCommandsCount = engine.worker.receivedCommands.length;

      // Fool's mate FEN (Black mated White: 0-1)
      const foolsMateFen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
      const result = await engine.evaluatePosition(foolsMateFen);

      // Should not have sent go command to worker
      const commandsSince = engine.worker.receivedCommands.slice(initialCommandsCount);
      expect(commandsSince.some(c => c.startsWith('go'))).toBe(false);

      expect(result.bestMove).toBeNull();
      // White is checkmated: mate score should be -0 or evaluation indicating loss for White
      expect(result.evaluation.mate).toBe(-0);

      engine.terminate();
    });

    it('resolves stalemate immediately via chess.js with cp 0', async () => {
      const engine = new StockfishEngine('test-stalemate');
      await engine.init();

      const initialCommandsCount = engine.worker.receivedCommands.length;

      // Classic stalemate FEN (Black king has no legal moves, not in check)
      const stalemateFen = 'k7/8/1Q6/8/8/8/8/7K b - - 0 1';
      const result = await engine.evaluatePosition(stalemateFen);

      const commandsSince = engine.worker.receivedCommands.slice(initialCommandsCount);
      expect(commandsSince.some(c => c.startsWith('go'))).toBe(false);

      expect(result.bestMove).toBeNull();
      expect(result.evaluation.cp).toBe(0);

      engine.terminate();
    });

    it('parses multipv, nodes, nps and returns lines array', async () => {
      const engine = new StockfishEngine('test-multipv');
      await engine.init();

      const line = 'info depth 12 seldepth 14 multipv 1 score cp 45 nodes 123456 nps 789000 time 156 pv e2e4 e7e5 g1f3';
      const parsed = engine._parseInfoLine(line, 'w');

      expect(parsed.depth).toBe(12);
      expect(parsed.multipv).toBe(1);
      expect(parsed.nodes).toBe(123456);
      expect(parsed.nps).toBe(789000);
      expect(parsed.cp).toBe(45);
      expect(parsed.pv).toEqual(['e2e4', 'e7e5', 'g1f3']);

      engine.terminate();
    });

    it('ignores lowerbound and upperbound info lines when parsing exact evaluation', async () => {
      const engine = new StockfishEngine('test-bounds');
      await engine.init();

      const exactLine = 'info depth 10 score cp 50 pv e2e4';
      const parsedExact = engine._parseInfoLine(exactLine, 'w');
      expect(parsedExact.isBound).toBeFalsy();
      expect(parsedExact.cp).toBe(50);

      const boundLine = 'info depth 10 score cp 80 lowerbound pv e2e4';
      const parsedBound = engine._parseInfoLine(boundLine, 'w');
      expect(parsedBound.isBound).toBe(true);

      engine.terminate();
    });
  });

  // E6 & E7: Strength isolation and EnginePool
  describe('E6 & E7: Strength isolation & EnginePool', () => {
    it('provides isolated play, analysis, and review engines via EnginePool', () => {
      expect(EnginePool.getEngine('play')).toBeDefined();
      expect(EnginePool.getEngine('analysis')).toBeDefined();
      expect(EnginePool.getEngine('review')).toBeDefined();

      // Instances must be distinct
      expect(playEngine).not.toBe(reviewEngine);
      expect(playEngine).not.toBe(analysisEngine);
    });

    it('preserves liveEngine export for backward compatibility', () => {
      expect(liveEngine).toBeDefined();
      expect(typeof liveEngine.evaluatePosition).toBe('function');
      expect(typeof liveEngine.stopSearch).toBe('function');
    });

    it('allows setting skill level and elo on playEngine without affecting analysisEngine', async () => {
      await playEngine.init();
      await analysisEngine.init();

      playEngine.setSkillLevel(5);
      const playCommands = playEngine.worker.receivedCommands;
      const analysisCommands = analysisEngine.worker.receivedCommands;

      expect(playCommands).toContain('setoption name Skill Level value 5');
      expect(analysisCommands).not.toContain('setoption name Skill Level value 5');

      playEngine.terminate();
      analysisEngine.terminate();
    });
  });
});

// Stockfish WebAssembly / Web Worker UCI Engine Controller
// Manages worker lifecycle, request barriers, search evaluation, and score normalization.

import { Chess } from 'chess.js';
import { getTurn } from '../../game/domain/chessRules';

export const ENGINE_STATES = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  READY: 'ready',
  THINKING: 'thinking',
  CANCELLING: 'cancelling',
  ERROR: 'error',
  TERMINATED: 'terminated'
};

export class StockfishEngine {
  constructor(name = 'default') {
    this.name = name;
    this.worker = null;
    this.status = ENGINE_STATES.IDLE;
    this.isReady = false;
    this.isThinking = false;
    this.currentJob = null;
    this.initPromise = null;
    this.errorState = null;
    this.jobCounter = 0;
    this.advertisedOptions = new Map();
    this.statusListeners = new Set();
    this._barrierResolvers = [];
    this._readyResolvers = [];
    this._workerScript = null;
  }

  _setStatus(newStatus) {
    if (this.status === newStatus) return;
    this.status = newStatus;
    for (const listener of this.statusListeners) {
      try {
        listener(newStatus);
      } catch (e) {
        console.warn(`[StockfishEngine ${this.name}] Listener error:`, e);
      }
    }
  }

  getStatus() {
    return this.status;
  }

  subscribeStatus(callback) {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  /**
   * Initializes the UCI engine worker with handshake (uci -> uciok -> isready -> readyok).
   * Automatically falls back from WASM to asm.js on script error.
   */
  async init() {
    if (this.isReady && this.worker) return this.worker;
    if (this.initPromise) return this.initPromise;

    this._setStatus(ENGINE_STATES.INITIALIZING);

    const baseUrl =
      (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    const isWasmSupported =
      typeof WebAssembly === 'object' &&
      typeof WebAssembly.validate === 'function' &&
      WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));

    const wasmScript = `${normalizedBase}engine/stockfish.wasm.js`;
    const jsScript = `${normalizedBase}engine/stockfish.js`;

    const tryInitWorker = (scriptUrl) => {
      return new Promise((resolve, reject) => {
        try {
          const WorkerClass =
            (typeof window !== 'undefined' && window.Worker) ||
            (typeof global !== 'undefined' && global.Worker);

          if (!WorkerClass) {
            this._setStatus(ENGINE_STATES.ERROR);
            return reject(new Error('Web Workers are not supported in this environment.'));
          }

          const worker = new WorkerClass(scriptUrl);
          this.advertisedOptions.clear();

          const timeout = setTimeout(() => {
            if (!this.isReady) {
              console.warn(`[Stockfish ${this.name}] Init handshake timeout, forcing ready...`);
              this.isReady = true;
              this._setStatus(ENGINE_STATES.READY);
              resolve(worker);
            }
          }, 6000);

          worker.onmessage = (event) => {
            const line = typeof event.data === 'string' ? event.data : '';
            this._handleUciMessage(line);

            if (line.startsWith('option name ')) {
              const nameMatch = line.match(/option name\s+([^ ]+)/);
              if (nameMatch) {
                this.advertisedOptions.set(nameMatch[1], line);
              }
            }

            if (line === 'uciok') {
              worker.postMessage('isready');
            }

            if (line === 'readyok') {
              clearTimeout(timeout);
              this.isReady = true;
              this._setStatus(ENGINE_STATES.READY);
              resolve(worker);
            }
          };

          worker.onerror = (err) => {
            clearTimeout(timeout);
            reject(err);
          };

          worker.postMessage('uci');
        } catch (err) {
          reject(err);
        }
      });
    };

    this.initPromise = (async () => {
      const primaryScript = isWasmSupported ? wasmScript : jsScript;
      try {
        this.worker = await tryInitWorker(primaryScript);
        this._workerScript = primaryScript;
      } catch (err) {
        console.warn(
          `[Stockfish ${this.name}] Primary engine init failed (${primaryScript}), attempting fallback...`,
          err
        );
        if (primaryScript !== jsScript) {
          try {
            this.worker = await tryInitWorker(jsScript);
            this._workerScript = jsScript;
          } catch (fallbackErr) {
            this.errorState = fallbackErr.message || 'Stockfish engine failed to initialize';
            this._setStatus(ENGINE_STATES.ERROR);
            this.initPromise = null;
            throw fallbackErr;
          }
        } else {
          this.errorState = err.message || 'Stockfish engine failed to initialize';
          this._setStatus(ENGINE_STATES.ERROR);
          this.initPromise = null;
          throw err;
        }
      }

      this.worker.onmessage = (event) => {
        const line = typeof event.data === 'string' ? event.data : '';
        this._handleUciMessage(line);
      };

      this.worker.onerror = (err) => {
        console.error(`[Stockfish ${this.name}] Worker runtime error:`, err);
        this.errorState = err?.message || 'Worker runtime error';
        this._setStatus(ENGINE_STATES.ERROR);
        this._failCurrentJob(new Error('Worker crashed during execution'));
        this.restart().catch((e) => console.warn('Auto-restart error:', e));
      };

      this._setStatus(ENGINE_STATES.READY);
      return this.worker;
    })();

    return this.initPromise;
  }

  /**
   * Internal UCI message dispatcher
   */
  _handleUciMessage(line) {
    if (!line) return;

    if (line === 'readyok') {
      while (this._readyResolvers.length > 0) {
        const resolveReady = this._readyResolvers.shift();
        resolveReady();
      }
    }

    // Parse info line
    if (line.startsWith('info ') && line.includes(' score ')) {
      const parsed = this._parseInfoLine(line, this.currentJob?.fen || 'w');
      if (parsed && this.currentJob) {
        this.currentJob.lastEval = parsed;
        if (this.currentJob.onProgress) {
          try {
            this.currentJob.onProgress(parsed);
          } catch (e) {}
        }
      }
    }

    // Parse bestmove line
    if (line.startsWith('bestmove ')) {
      const parts = line.split(/\s+/);
      const bestMove = parts[1] !== '(none)' ? parts[1] : null;
      const ponder = parts[3] && parts[3] !== '(none)' ? parts[3] : null;

      // Drain barrier resolvers if currently awaiting cancel barrier
      if (this._barrierResolvers.length > 0) {
        while (this._barrierResolvers.length > 0) {
          const resolveBarrier = this._barrierResolvers.shift();
          resolveBarrier(bestMove);
        }
        return;
      }

      if (!this.currentJob) return;

      const job = this.currentJob;
      this.currentJob = null;
      this.isThinking = false;
      this._setStatus(ENGINE_STATES.READY);

      const evaluation = job.lastEval || {
        requestId: job.id,
        fen: job.fen,
        score: { type: 'cp', value: 0 },
        bestMove,
        principalVariation: bestMove ? [bestMove] : [],
        pv: bestMove ? [bestMove] : [],
        depth: 0,
        status: 'complete'
      };

      evaluation.bestMove = bestMove;
      evaluation.ponder = ponder;
      evaluation.status = 'complete';
      evaluation.evaluation = {
        score: evaluation.score,
        cp: evaluation.cp !== undefined ? evaluation.cp : 0,
        mate: evaluation.mate,
        pv: evaluation.pv || [],
        depth: evaluation.depth || 0
      };
      evaluation.lines = [];

      job.resolve(evaluation);
    }
  }

  /**
   * Parses an UCI info line and normalizes score to White's perspective throughout.
   */
  _parseInfoLine(line, fenOrTurn) {
    const turn =
      fenOrTurn === 'w' || fenOrTurn === 'b'
        ? fenOrTurn
        : typeof fenOrTurn === 'string'
        ? getTurn(fenOrTurn)
        : 'w';

    const depthMatch = line.match(/\bdepth\s+(\d+)/);
    const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;

    const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
    const multipv = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;

    const nodesMatch = line.match(/\bnodes\s+(\d+)/);
    const nodes = nodesMatch ? parseInt(nodesMatch[1], 10) : 0;

    const npsMatch = line.match(/\bnps\s+(\d+)/);
    const nps = npsMatch ? parseInt(npsMatch[1], 10) : 0;

    const isBound = Boolean(line.includes('lowerbound') || line.includes('upperbound'));

    let scoreType = 'cp';
    let scoreVal = 0;

    const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
    const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);

    if (mateMatch) {
      scoreType = 'mate';
      const uciMate = parseInt(mateMatch[1], 10);
      scoreVal = turn === 'w' ? uciMate : -uciMate;
    } else if (cpMatch) {
      scoreType = 'cp';
      const uciCp = parseInt(cpMatch[1], 10);
      scoreVal = turn === 'w' ? uciCp : -uciCp;
    }

    const pvMatch = line.match(/\bpv\s+(.+)$/);
    const principalVariation = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];
    const bestMove = principalVariation.length > 0 ? principalVariation[0] : null;

    const evalObj = {
      requestId: this.currentJob?.id,
      fen: typeof fenOrTurn === 'string' && fenOrTurn.length > 2 ? fenOrTurn : '',
      score: {
        type: scoreType,
        value: scoreVal
      },
      cp: scoreType === 'cp' ? scoreVal : scoreVal > 0 ? 30000 : -30000,
      mate: scoreType === 'mate' ? scoreVal : undefined,
      bestMove,
      principalVariation,
      pv: principalVariation,
      depth,
      multipv,
      nodes,
      nps,
      isBound,
      status: 'evaluating'
    };

    evalObj.evaluation = {
      score: evalObj.score,
      cp: evalObj.cp,
      mate: evalObj.mate,
      pv: evalObj.pv,
      depth: evalObj.depth
    };

    return evalObj;
  }

  /**
   * Sets the engine UCI Skill Level (0 to 20)
   */
  setSkillLevel(level) {
    const clamped = Math.max(0, Math.min(20, Math.round(level)));
    if (this.worker && this.isReady) {
      this.worker.postMessage(`setoption name Skill Level value ${clamped}`);
    }
  }

  /**
   * Sets target Elo rating (1320 to 3190) via UCI_LimitStrength
   */
  setElo(elo) {
    if (this.worker && this.isReady) {
      if (elo && elo < 2850) {
        this.worker.postMessage('setoption name UCI_LimitStrength value true');
        const clamped = Math.max(1320, Math.min(3190, Math.round(elo)));
        this.worker.postMessage(`setoption name UCI_Elo value ${clamped}`);
      } else {
        this.worker.postMessage('setoption name UCI_LimitStrength value false');
      }
    }
  }

  /**
   * Awaits isready -> readyok from worker
   */
  _awaitReady() {
    return new Promise((resolve) => {
      this._readyResolvers.push(resolve);
      if (this.worker) {
        this.worker.postMessage('isready');
      } else {
        resolve();
      }
    });
  }

  /**
   * Executes a clean cancel barrier:
   * Sends 'stop', awaits and drains the search's 'bestmove', then sends 'isready' and awaits 'readyok'.
   */
  async _cancelBarrier() {
    if (!this.worker || !this.isThinking) return null;

    let capturedMove = null;
    const movePromise = new Promise((resolve) => {
      this._barrierResolvers.push(resolve);
    });

    try {
      this.worker.postMessage('stop');
    } catch (e) {}

    capturedMove = await Promise.race([
      movePromise,
      new Promise((res) => setTimeout(() => res(null), 500))
    ]);

    await this._awaitReady();

    const cancelledJob = this.currentJob;
    this.currentJob = null;
    this.isThinking = false;
    this._setStatus(ENGINE_STATES.READY);

    if (cancelledJob) {
      cancelledJob.resolve({
        requestId: cancelledJob.id,
        fen: cancelledJob.fen,
        score: cancelledJob.lastEval?.score || { type: 'cp', value: 0 },
        bestMove: capturedMove,
        principalVariation: [],
        pv: [],
        depth: cancelledJob.lastEval?.depth || 0,
        status: 'cancelled',
        evaluation: cancelledJob.lastEval?.evaluation || { cp: 0, depth: 0, pv: [] },
        lines: []
      });
    }

    return capturedMove;
  }

  /**
   * Stops any currently executing engine search cleanly and awaits readyok barrier.
   */
  async cancel() {
    this._setStatus(ENGINE_STATES.CANCELLING);
    return this._cancelBarrier();
  }

  stop() {
    this.cancel().catch(() => {});
  }

  stopSearch() {
    this.cancel().catch(() => {});
  }

  _failCurrentJob(error) {
    if (this.currentJob) {
      const job = this.currentJob;
      this.currentJob = null;
      if (typeof job.reject === 'function') {
        job.reject(error);
      }
    }
  }

  /**
   * Terminates the worker thread completely.
   */
  terminate() {
    this._failCurrentJob(new Error('Engine terminated'));
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (e) {}
      this.worker = null;
    }
    this.isReady = false;
    this.isThinking = false;
    this.initPromise = null;
    this._setStatus(ENGINE_STATES.TERMINATED);
  }

  /**
   * Restarts the engine worker cleanly.
   */
  async restart() {
    this.terminate();
    return this.init();
  }

  /**
   * Evaluates a chess position with full request lifecycle and validation.
   * Resolves terminal positions (checkmate/draw) immediately without worker overhead.
   *
   * @param {string} fen
   * @param {Object} options - { depth, movetime, skillLevel, elo, timeout, onProgress }
   * @returns {Promise<Object>} Formatted evaluation model
   */
  async evaluatePosition(fen, options = {}) {
    if (!fen || typeof fen !== 'string') {
      throw new Error('evaluatePosition requires a valid FEN string');
    }

    // Check terminal position immediately via chess.js
    try {
      const tempChess = new Chess(fen);
      if (tempChess.isGameOver()) {
        const turn = tempChess.turn();
        let evalResult = { cp: 0, depth: 0, pv: [] };

        if (tempChess.isCheckmate()) {
          const mateSign = turn === 'b' ? 1 : -1;
          evalResult = {
            mate: mateSign === 1 ? 0 : -0,
            cp: mateSign * 30000,
            depth: 0,
            pv: []
          };
        } else {
          evalResult = {
            cp: 0,
            depth: 0,
            pv: []
          };
        }

        return {
          requestId: `term_${Date.now()}`,
          fen,
          score: {
            type: evalResult.mate !== undefined ? 'mate' : 'cp',
            value: evalResult.mate !== undefined ? evalResult.mate : evalResult.cp
          },
          cp: evalResult.cp,
          mate: evalResult.mate,
          bestMove: null,
          ponder: null,
          principalVariation: [],
          pv: [],
          depth: 0,
          status: 'complete',
          evaluation: evalResult,
          lines: []
        };
      }
    } catch (e) {
      // Continue to engine
    }

    if (!this.isReady || !this.worker) {
      await this.init();
    }

    // Cancel prior search on this worker if running and await barrier
    if (this.isThinking) {
      await this.cancel();
    }

    if (!this.worker) {
      throw new Error('Stockfish worker is unavailable');
    }

    this.jobCounter += 1;
    const jobId = `req_${this.name}_${this.jobCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      this.isThinking = true;
      this._setStatus(ENGINE_STATES.THINKING);

      let timeoutTimer = null;
      if (options.timeout) {
        timeoutTimer = setTimeout(() => {
          this.cancel().catch(() => {});
          reject(new Error(`Stockfish search timed out after ${options.timeout}ms`));
        }, options.timeout);
      }

      this.currentJob = {
        id: jobId,
        fen,
        resolve: (result) => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          resolve(result);
        },
        reject: (err) => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          reject(err);
        },
        onProgress: options.onProgress,
        lastEval: null
      };

      // Apply strength options if specified
      if (typeof options.skillLevel === 'number') {
        this.setSkillLevel(options.skillLevel);
      }
      if (typeof options.elo === 'number') {
        this.setElo(options.elo);
      }

      // Send position
      this.worker.postMessage(`position fen ${fen}`);

      // Send search constraints
      if (options.depth && options.movetime) {
        this.worker.postMessage(`go depth ${options.depth} movetime ${options.movetime}`);
      } else if (options.depth) {
        this.worker.postMessage(`go depth ${options.depth}`);
      } else if (options.movetime) {
        this.worker.postMessage(`go movetime ${options.movetime}`);
      } else {
        this.worker.postMessage('go depth 10');
      }
    });
  }
}

/**
 * Dedicated Engine Pool maintaining isolated worker instances for separate features.
 */
export const EnginePool = {
  playEngine: new StockfishEngine('play'),
  analysisEngine: new StockfishEngine('analysis'),
  reviewEngine: new StockfishEngine('review'),
  liveEngine: new StockfishEngine('live'),

  getEngine(role) {
    switch (role) {
      case 'play':
        return this.playEngine;
      case 'analysis':
        return this.analysisEngine;
      case 'review':
        return this.reviewEngine;
      case 'live':
        return this.liveEngine;
      default:
        return this.playEngine;
    }
  },

  terminateAll() {
    this.playEngine.terminate();
    this.analysisEngine.terminate();
    this.reviewEngine.terminate();
    this.liveEngine.terminate();
  }
};

export const playEngine = EnginePool.playEngine;
export const analysisEngine = EnginePool.analysisEngine;
export const reviewEngine = EnginePool.reviewEngine;
export const liveEngine = EnginePool.liveEngine;

export default StockfishEngine;

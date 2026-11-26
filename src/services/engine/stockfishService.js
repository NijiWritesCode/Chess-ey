// Stockfish UCI Engine Controller & Web Worker Management
// Handles WebAssembly / Web Worker communication, job queue, search limits, skill level, and evaluation parsing.

import { Chess } from 'chess.js';

export class StockfishEngine {
  constructor(name = 'default') {
    this.name = name;
    this.worker = null;
    this.isReady = false;
    this.isThinking = false;
    this.currentJob = null;
    this.initPromise = null;
    this.errorState = null;
    this.status = 'uninitialized'; // 'uninitialized' | 'loading' | 'ready' | 'thinking' | 'error' | 'unsupported'
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.jobCounter = 0;
    this.advertisedOptions = new Map();
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
        console.warn(`[Stockfish ${this.name}] Status listener error:`, e);
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
   * Automatically falls back from WASM to asm.js on error.
   */
  async init() {
    if (this.isReady && this.worker) return;
    if (this.initPromise) return this.initPromise;

    this._setStatus('loading');

    const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    const isWasmSupported = typeof WebAssembly === 'object' &&
      typeof WebAssembly.validate === 'function' &&
      WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));

    const wasmScript = `${normalizedBase}engine/stockfish.wasm.js`;
    const jsScript = `${normalizedBase}engine/stockfish.js`;

    const tryInitWorker = (scriptUrl) => {
      return new Promise((resolve, reject) => {
        try {
          if (typeof window === 'undefined' && typeof global === 'undefined') {
            this._setStatus('unsupported');
            return reject(new Error('Workers not supported in this environment.'));
          }

          const WorkerClass = (typeof window !== 'undefined' && window.Worker) || (typeof global !== 'undefined' && global.Worker);
          if (!WorkerClass) {
            this._setStatus('unsupported');
            return reject(new Error('Web Workers are not supported in this environment.'));
          }

          const worker = new WorkerClass(scriptUrl);
          let uciOkReceived = false;
          let readyOkReceived = false;
          this.advertisedOptions.clear();

          const timeout = setTimeout(() => {
            if (!this.isReady) {
              console.warn(`[Stockfish ${this.name}] Init handshake timeout, forcing ready...`);
              this.isReady = true;
              this._setStatus('ready');
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
              uciOkReceived = true;
              worker.postMessage('isready');
            }

            if (line === 'readyok') {
              readyOkReceived = true;
              clearTimeout(timeout);
              this.isReady = true;
              this._setStatus('ready');
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
      // First attempt: WASM (if supported) or JS fallback
      const primaryScript = isWasmSupported ? wasmScript : jsScript;
      try {
        this.worker = await tryInitWorker(primaryScript);
        this._workerScript = primaryScript;
      } catch (err) {
        console.warn(`[Stockfish ${this.name}] Primary engine init failed (${primaryScript}), attempting fallback...`, err);
        if (primaryScript !== jsScript) {
          try {
            this.worker = await tryInitWorker(jsScript);
            this._workerScript = jsScript;
          } catch (fallbackErr) {
            this.errorState = fallbackErr.message || 'Stockfish engine failed to initialize';
            this._setStatus('error');
            this.initPromise = null;
            throw fallbackErr;
          }
        } else {
          this.errorState = err.message || 'Stockfish engine failed to initialize';
          this._setStatus('error');
          this.initPromise = null;
          throw err;
        }
      }
    })();

    return this.initPromise;
  }

  _handleUciMessage(line) {
    for (const listener of this.listeners) {
      try {
        listener(line);
      } catch (e) {}
    }

    if (line === 'readyok') {
      const resolvers = [...this._readyResolvers];
      this._readyResolvers = [];
      for (const resolve of resolvers) {
        resolve();
      }
    }

    // If an abort drain barrier is waiting for the discarded bestmove:
    if (this._barrierResolvers.length > 0 && line.startsWith('bestmove')) {
      const parts = line.split(' ');
      const move = parts[1] === '(none)' ? null : parts[1];
      const resolvers = [...this._barrierResolvers];
      this._barrierResolvers = [];
      for (const res of resolvers) {
        res(move);
      }
      return;
    }

    // Ignore engine output if no active job is running
    if (!this.currentJob) return;

    // Parse info lines
    if (line.startsWith('info') && line.includes('score')) {
      const fen = this.currentJob.fen || '';
      const turn = fen.split(' ')[1] || 'w';
      const parsed = this._parseInfoLine(line, turn);
      if (parsed) {
        const mpvIndex = parsed.multipv || 1;
        this.currentJob.lines[mpvIndex] = parsed;

        if (mpvIndex === 1 && !parsed.isBound) {
          this.currentJob.lastEval = parsed;
        } else if (mpvIndex === 1 && !this.currentJob.lastEval) {
          this.currentJob.lastEval = parsed;
        }

        if (this.currentJob.onProgress) {
          try {
            this.currentJob.onProgress(this.currentJob.lastEval || parsed);
          } catch (e) {}
        }
      }
    }

    // Parse bestmove
    if (line.startsWith('bestmove')) {
      const parts = line.split(' ');
      const bestMove = parts[1] === '(none)' ? null : parts[1];
      const ponder = parts[3] || null;

      const job = this.currentJob;
      this.currentJob = null;
      this.isThinking = false;
      this._setStatus('ready');

      if (job) {
        if (job.timer) clearTimeout(job.timer);
        if (job.resolve) {
          job.resolve({
            bestMove,
            ponder,
            evaluation: job.lastEval || { cp: 0, depth: 0, pv: [] },
            lines: job.lines.filter(Boolean)
          });
        }
      }
    }
  }

  _parseInfoLine(line, turn = 'w') {
    const depthMatch = line.match(/depth\s+(\d+)/);
    const seldepthMatch = line.match(/seldepth\s+(\d+)/);
    const multipvMatch = line.match(/multipv\s+(\d+)/);
    const nodesMatch = line.match(/nodes\s+(\d+)/);
    const npsMatch = line.match(/nps\s+(\d+)/);
    const timeMatch = line.match(/time\s+(\d+)/);
    const cpMatch = line.match(/score\s+cp\s+(-?\d+)/);
    const mateMatch = line.match(/score\s+mate\s+(-?\d+)/);
    const pvIndex = line.indexOf(' pv ');

    const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
    const seldepth = seldepthMatch ? parseInt(seldepthMatch[1], 10) : undefined;
    const multipv = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;
    const nodes = nodesMatch ? parseInt(nodesMatch[1], 10) : undefined;
    const nps = npsMatch ? parseInt(npsMatch[1], 10) : undefined;
    const time = timeMatch ? parseInt(timeMatch[1], 10) : undefined;

    const isLowerBound = line.includes('lowerbound');
    const isUpperBound = line.includes('upperbound');
    const isBound = isLowerBound || isUpperBound;
    const bound = isLowerBound ? 'lower' : isUpperBound ? 'upper' : 'exact';

    let rawCp = cpMatch ? parseInt(cpMatch[1], 10) : undefined;
    let rawMate = mateMatch ? parseInt(mateMatch[1], 10) : undefined;

    // UCI protocol convention: Stockfish outputs scores from the active side-to-move's perspective.
    // We normalize evaluation scores to ALWAYS be from White's perspective (+ is White advantage, - is Black advantage)
    // across the entire application and analysis pipeline.
    const multiplier = turn === 'b' ? -1 : 1;
    const cp = rawCp !== undefined ? rawCp * multiplier : undefined;
    const mate = rawMate !== undefined ? rawMate * multiplier : undefined;

    let pv = [];
    if (pvIndex !== -1) {
      pv = line.slice(pvIndex + 4).trim().split(/\s+/).filter(Boolean);
    }

    return {
      depth,
      seldepth,
      multipv,
      nodes,
      nps,
      time,
      isBound,
      bound,
      cp,
      mate,
      rawCp,
      rawMate,
      sideToMove: turn,
      pv
    };
  }

  /**
   * Sets Stockfish skill level (0 - 20)
   */
  setSkillLevel(level) {
    if (!this.worker) return;
    const clamped = Math.max(0, Math.min(20, Math.round(level)));
    this.worker.postMessage(`setoption name Skill Level value ${clamped}`);
  }

  /**
   * Sets Stockfish Elo rating if engine advertises UCI_LimitStrength and UCI_Elo
   */
  setElo(elo) {
    if (!this.worker) return;
    if (this.advertisedOptions.has('UCI_LimitStrength')) {
      this.worker.postMessage('setoption name UCI_LimitStrength value true');
      this.worker.postMessage(`setoption name UCI_Elo value ${Math.round(elo)}`);
    }
  }

  /**
   * Awaits readyok barrier from the engine
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

    // Await bestmove with a short safety timeout
    capturedMove = await Promise.race([
      movePromise,
      new Promise((res) => setTimeout(() => res(null), 500))
    ]);

    // Send isready and await readyok
    await this._awaitReady();

    this.isThinking = false;
    this.currentJob = null;
    this._setStatus('ready');
    return capturedMove;
  }

  /**
   * Stops any currently executing engine search cleanly and awaits readyok barrier.
   */
  async cancel() {
    if (this.currentJob && this.currentJob.timer) {
      clearTimeout(this.currentJob.timer);
    }
    const capturedMove = await this._cancelBarrier();
    return capturedMove;
  }

  // Aliases for compatibility
  stop() {
    this.cancel().catch(() => {});
  }

  stopSearch() {
    this.cancel().catch(() => {});
  }

  /**
   * Restarts the engine worker cleanly
   */
  async restart() {
    this.terminate();
    return this.init();
  }

  /**
   * Evaluates a position or calculates best move.
   * Resolves terminal positions (mate/draw) immediately via chess.js without engine invocation.
   */
  async evaluatePosition(fen, options = {}) {
    // Check terminal position immediately via chess.js (E5)
    try {
      const tempChess = new Chess(fen);
      if (tempChess.isGameOver()) {
        const turn = tempChess.turn(); // 'w' | 'b'
        let evalResult = { cp: 0, depth: 0, pv: [] };

        if (tempChess.isCheckmate()) {
          // If turn is 'b', White delivered checkmate -> White winning (+mate / +30000 cp)
          // If turn is 'w', Black delivered checkmate -> Black winning (-mate / -30000 cp)
          const mateSign = turn === 'b' ? 1 : -1;
          evalResult = {
            mate: mateSign === 1 ? 0 : -0,
            cp: mateSign * 30000,
            depth: 0,
            pv: []
          };
        } else {
          // Stalemate, insufficient material, repetition, 50-move rule
          evalResult = {
            cp: 0,
            depth: 0,
            pv: []
          };
        }

        return {
          bestMove: null,
          ponder: null,
          evaluation: evalResult,
          lines: []
        };
      }
    } catch (e) {
      // If FEN is invalid, continue to engine or handle error
    }

    await this.init();

    // Cancel prior search on this worker if running and await barrier (E1)
    if (this.isThinking) {
      await this.cancel();
    }

    if (!this.worker) {
      return { bestMove: null, evaluation: { cp: 0, depth: 0, pv: [] }, lines: [] };
    }

    this.jobCounter += 1;
    const jobId = this.jobCounter;

    return new Promise((resolve) => {
      this.isThinking = true;
      this._setStatus('thinking');

      this.currentJob = {
        id: jobId,
        fen,
        resolve,
        reject: resolve,
        onProgress: options.onProgress,
        lastEval: null,
        lines: []
      };

      // Apply strength options if specified per search (E6)
      if (typeof options.skillLevel === 'number') {
        this.setSkillLevel(options.skillLevel);
      }
      if (typeof options.elo === 'number') {
        this.setElo(options.elo);
      }

      // Set position
      this.worker.postMessage(`position fen ${fen}`);

      // Set search constraints (E2)
      if (options.depth && options.movetime) {
        this.worker.postMessage(`go depth ${options.depth} movetime ${options.movetime}`);
      } else if (options.depth) {
        this.worker.postMessage(`go depth ${options.depth}`);
      } else if (options.movetime) {
        this.worker.postMessage(`go movetime ${options.movetime}`);
      } else {
        this.worker.postMessage('go depth 10');
      }

      // Timeout safety guard (E2 & E3)
      const maxWait = options.timeout || (options.movetime ? Math.max(2 * options.movetime, 10000) : 10000);
      const timer = setTimeout(async () => {
        if (this.currentJob && this.currentJob.id === jobId) {
          console.warn(`[Stockfish ${this.name}] Evaluation exceeded timeout, stopping...`);
          const fallbackEval = this.currentJob.lastEval || { cp: 0, depth: 0, pv: [] };
          const lines = this.currentJob.lines ? this.currentJob.lines.filter(Boolean) : [];
          // Stop and capture move emitted upon stop (E3)
          const move = await this.cancel();
          resolve({ bestMove: move || null, evaluation: fallbackEval, lines });
        }
      }, maxWait);

      this.currentJob.timer = timer;
    });
  }

  terminate() {
    if (this.currentJob && this.currentJob.timer) {
      clearTimeout(this.currentJob.timer);
    }
    this.currentJob = null;
    this.isThinking = false;
    this._barrierResolvers = [];
    this._readyResolvers = [];

    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (e) {}
      this.worker = null;
    }
    this.isReady = false;
    this.initPromise = null;
    this._setStatus('uninitialized');
  }
}

// Engine Pool Manager (E7)
class EnginePoolManager {
  constructor() {
    this.engines = new Map();
  }

  getEngine(name) {
    if (!this.engines.has(name)) {
      this.engines.set(name, new StockfishEngine(name));
    }
    return this.engines.get(name);
  }

  terminateAll() {
    for (const engine of this.engines.values()) {
      engine.terminate();
    }
    this.engines.clear();
  }
}

export const EnginePool = new EnginePoolManager();

// Dedicated instances for specific app roles
export const playEngine = EnginePool.getEngine('play');
export const analysisEngine = EnginePool.getEngine('analysis');
export const reviewEngine = EnginePool.getEngine('review');

// liveEngine points to analysisEngine for backward compatibility
export const liveEngine = analysisEngine;

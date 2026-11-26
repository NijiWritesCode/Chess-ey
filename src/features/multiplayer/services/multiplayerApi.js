// Authoritative Multiplayer API Service (Rebuild Blueprint Phase 5)
// Encapsulates Supabase RPCs, cryptographic invitation tokens, independent seat recovery credentials,
// and server-authoritative move validation.

import { Chess } from 'chess.js';
import { supabase, ensureAnonymousAuth, isSupabaseConfigured } from '../../../lib/supabase/client';
import {
  generateSecureToken,
  hashToken,
  storeSeatRecoveryCredential,
  getSeatRecoveryCredential,
  clearSeatRecoveryCredential
} from './seatRecovery';

export { generateSecureToken, hashToken };

export const multiplayerApi = {
  /**
   * Creates a new multiplayer room via secure stored procedure.
   * Generates both an invitation token and an independent seat recovery credential.
   */
  async createRoom({ creatorColor = 'random', timeControl, playerName = 'Player' }) {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
      );
    }

    const user = await ensureAnonymousAuth();
    if (!user) {
      throw new Error('Could not establish an anonymous session.');
    }

    const inviteToken = generateSecureToken();
    const tokenHash = await hashToken(inviteToken);

    const recoveryCredential = generateSecureToken();
    const recoveryHash = await hashToken(recoveryCredential);

    const initialMs = (timeControl?.initialSeconds || 600) * 1000;
    const incrementMs = (timeControl?.increment || 0) * 1000;

    const { data, error } = await supabase.rpc('create_chess_room', {
      p_token_hash: tokenHash,
      p_recovery_token_hash: recoveryHash,
      p_initial_time_ms: initialMs,
      p_increment_ms: incrementMs,
      p_color_choice: creatorColor,
      p_player_name: playerName
    });

    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || 'Failed to create room.');
    }

    // Store seat recovery credential locally for seamless reconnection
    storeSeatRecoveryCredential(data.roomId, recoveryCredential);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareUrl = `${origin}/play/${data.roomId}?invite=${inviteToken}`;

    return {
      roomId: data.roomId,
      inviteToken,
      recoveryCredential,
      shareUrl,
      playerColor: data.playerColor,
      room: data.room
    };
  },

  /**
   * Joins an open room using the invitation token.
   * Generates an independent seat recovery credential for the joining player.
   */
  async joinRoom({ roomId, inviteToken, playerName = 'Friend' }) {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }

    const user = await ensureAnonymousAuth();
    if (!user) {
      throw new Error('Could not establish an anonymous session.');
    }

    // First check if user can recover existing seat via local credential
    const existingRecoveryCred = getSeatRecoveryCredential(roomId);
    if (existingRecoveryCred) {
      try {
        const recovered = await this.recoverSeat({
          roomId,
          recoveryCredential: existingRecoveryCred
        });
        if (recovered?.success) {
          return {
            ...recovered,
            reconnect: true
          };
        }
      } catch (e) {
        // Fall through to regular join if recovery fails
      }
    }

    const tokenHash = await hashToken(inviteToken);
    const newRecoveryCredential = generateSecureToken();
    const newRecoveryHash = await hashToken(newRecoveryCredential);

    const { data, error } = await supabase.rpc('join_chess_room', {
      p_room_id: roomId,
      p_token_hash: tokenHash,
      p_player_name: playerName,
      p_recovery_token_hash: newRecoveryHash
    });

    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || 'Failed to join match.');
    }

    // Store recovery credential locally
    storeSeatRecoveryCredential(roomId, newRecoveryCredential);

    return {
      roomId,
      playerColor: data.color,
      recoveryCredential: newRecoveryCredential,
      reconnect: Boolean(data.reconnect),
      room: data.room
    };
  },

  /**
   * Recovers a player seat using an independent recovery credential.
   * Rotates the recovery credential upon successful reclamation.
   */
  async recoverSeat({ roomId, recoveryCredential }) {
    if (!isSupabaseConfigured || !roomId || !recoveryCredential) return null;

    await ensureAnonymousAuth();

    const oldHash = await hashToken(recoveryCredential);
    const newCredential = generateSecureToken();
    const newHash = await hashToken(newCredential);

    const { data, error } = await supabase.rpc('recover_room_seat', {
      p_room_id: roomId,
      p_recovery_token_hash: oldHash,
      p_new_recovery_token_hash: newHash
    });

    if (error || !data?.success) {
      return null;
    }

    // Rotate local credential
    storeSeatRecoveryCredential(roomId, newCredential);

    return {
      success: true,
      roomId,
      playerColor: data.color,
      playerName: data.playerName,
      newRecoveryCredential: newCredential,
      room: data.room
    };
  },

  /**
   * Submits a move intent to the server-authoritative backend.
   * Pre-validates move locally with chess.js, then executes atomic server transaction.
   */
  async submitMove({
    roomId,
    from,
    to,
    promotion = 'q',
    currentFen,
    expectedVersion
  }) {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }

    // 1. Client-side pre-validation using chess.js
    let moveObj = null;
    let newFen = null;
    let isGameOver = false;
    let winner = null;
    let reason = null;

    try {
      const chess = new Chess(currentFen);
      try {
        moveObj = chess.move({ from, to, promotion: promotion || 'q' });
      } catch (e) {
        throw new Error(`Illegal move from ${from} to ${to}`);
      }
      if (!moveObj) {
        throw new Error(`Illegal move from ${from} to ${to}`);
      }
      newFen = chess.fen();
      isGameOver = chess.isGameOver();

      if (isGameOver) {
        if (chess.isCheckmate()) {
          winner = moveObj.color === 'w' ? 'white' : 'black';
          reason = 'checkmate';
        } else if (chess.isStalemate()) {
          winner = 'draw';
          reason = 'stalemate';
        } else if (chess.isInsufficientMaterial()) {
          winner = 'draw';
          reason = 'insufficient_material';
        } else if (chess.isThreefoldRepetition()) {
          winner = 'draw';
          reason = 'repetition';
        } else if (chess.isDraw()) {
          winner = 'draw';
          reason = '50_move_rule';
        }
      }
    } catch (err) {
      throw new Error(`Move validation failed: ${err.message}`);
    }

    // 2. Submit to atomic server procedure
    const { data, error } = await supabase.rpc('commit_chess_move', {
      p_room_id: roomId,
      p_from: from,
      p_to: to,
      p_promotion: promotion || 'q',
      p_san: moveObj.san,
      p_new_fen: newFen,
      p_expected_version: expectedVersion,
      p_is_game_over: isGameOver,
      p_winner: winner,
      p_reason: reason
    });

    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || 'Move rejected by server.');
    }

    return {
      success: true,
      version: data.version,
      ply: data.ply,
      newFen: data.newFen,
      san: moveObj.san,
      turn: data.turn,
      isGameOver: data.isGameOver,
      winner: data.winner,
      reason: data.reason
    };
  },

  /**
   * Resigns an active match.
   */
  async resignMatch(roomId) {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

    const { data, error } = await supabase.rpc('resign_match', {
      p_room_id: roomId
    });

    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || 'Failed to resign match.');
    }

    clearSeatRecoveryCredential(roomId);
    return data;
  },

  /**
   * Offers a draw to the opponent.
   */
  async offerDraw(roomId) {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

    const { data, error } = await supabase.rpc('offer_draw', {
      p_room_id: roomId
    });

    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || 'Failed to offer draw.');
    }

    return data;
  },

  /**
   * Responds to an opponent's draw offer.
   */
  async respondDraw(roomId, accept = true) {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

    const { data, error } = await supabase.rpc('respond_draw', {
      p_room_id: roomId,
      p_accept: Boolean(accept)
    });

    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || 'Failed to respond to draw offer.');
    }

    if (accept) {
      clearSeatRecoveryCredential(roomId);
    }

    return data;
  },

  /**
   * Claims a win on time if the opponent's clock has run out.
   */
  async claimTimeout(roomId) {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

    const { data, error } = await supabase.rpc('claim_timeout', {
      p_room_id: roomId
    });

    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || 'Failed to claim timeout.');
    }

    clearSeatRecoveryCredential(roomId);
    return data;
  },

  /**
   * Retrieves the current room row.
   */
  async getRoomState(roomId) {
    if (!isSupabaseConfigured) return null;

    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (error) {
      console.warn('[MultiplayerApi] Failed to fetch room state:', error);
      return null;
    }

    return data;
  },

  /**
   * Retrieves the canonical move log from room_moves.
   */
  async getRoomMoves(roomId) {
    if (!isSupabaseConfigured) return [];

    const { data, error } = await supabase
      .from('room_moves')
      .select('*')
      .eq('room_id', roomId)
      .order('ply', { ascending: true });

    if (error) {
      return [];
    }

    return data || [];
  }
};

export default multiplayerApi;

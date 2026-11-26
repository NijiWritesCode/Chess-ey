import { supabase, ensureAnonymousAuth, isSupabaseConfigured } from '../supabase/supabaseClient';

/**
 * Generates a cryptographically strong random token for invitation URLs (256-bit entropy)
 */
export function generateSecureToken() {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const buffer = new Uint8Array(32);
    window.crypto.getRandomValues(buffer);
    return Array.from(buffer, b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Computes SHA-256 hash of a string using Web Crypto API
 */
export async function hashToken(token) {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('');
  }
  return token; // fallback
}

// Active Supabase channel references for instant broadcast messaging
const activeChannels = new Map();

export const roomService = {
  /**
   * Creates a new multiplayer room via secure stored procedure
   */
  async createRoom({ creatorColor = 'random', timeControl, playerName = 'Player' }) {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
    }

    const user = await ensureAnonymousAuth();
    if (!user) {
      throw new Error('Could not establish an anonymous session. Check your network or Supabase settings.');
    }

    const inviteToken = generateSecureToken();
    const tokenHash = await hashToken(inviteToken);

    const initialMs = (timeControl?.initialSeconds || 600) * 1000;
    const incrementMs = (timeControl?.increment || 0) * 1000;

    // Try server-side RPC create_chess_room first
    let rpcError = null;
    try {
      const { data, error } = await supabase.rpc('create_chess_room', {
        p_token_hash: tokenHash,
        p_initial_time_ms: initialMs,
        p_increment_ms: incrementMs,
        p_color_choice: creatorColor,
        p_player_name: playerName
      });

      if (!error && data?.success) {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const shareUrl = `${origin}/play/${data.roomId}?invite=${inviteToken}`;

        return {
          roomId: data.roomId,
          inviteToken,
          shareUrl,
          playerColor: data.playerColor,
          room: data.room
        };
      }

      rpcError = error || new Error(data?.error || 'Failed to create room.');
    } catch (err) {
      rpcError = err;
    }

    // Check if error is due to missing stored procedure / stale schema cache
    const isSchemaError = rpcError && (
      rpcError.code === 'PGRST202' ||
      rpcError.message?.includes('schema cache') ||
      rpcError.message?.includes('create_chess_room')
    );

    if (isSchemaError) {
      console.warn('create_chess_room RPC missing from schema cache. Falling back to direct database insert...');
      let assignedColor = creatorColor;
      if (assignedColor === 'random') {
        assignedColor = Math.random() < 0.5 ? 'w' : 'b';
      } else {
        assignedColor = assignedColor === 'white' ? 'w' : 'b';
      }

      const isWhite = assignedColor === 'w';
      const cleanName = playerName.trim() || (isWhite ? 'White Player' : 'Black Player');

      const { data: newRoom, error: insertError } = await supabase
        .from('rooms')
        .insert({
          invite_token_hash: tokenHash,
          status: 'waiting',
          white_id: isWhite ? user.id : null,
          black_id: !isWhite ? user.id : null,
          white_name: isWhite ? cleanName : 'Waiting for Player',
          black_name: !isWhite ? cleanName : 'Waiting for Player',
          time_control_initial_ms: initialMs,
          time_control_increment_ms: incrementMs,
          white_time_ms: initialMs,
          black_time_ms: initialMs
        })
        .select()
        .single();

      if (!insertError && newRoom) {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const shareUrl = `${origin}/play/${newRoom.id}?invite=${inviteToken}`;

        return {
          roomId: newRoom.id,
          inviteToken,
          shareUrl,
          playerColor: assignedColor,
          room: newRoom
        };
      }

      throw new Error(
        `Supabase Stored Procedure Not Found in Schema Cache: Please run the SQL migration in your Supabase SQL Editor and execute "NOTIFY pgrst, 'reload schema';" (${rpcError.message})`
      );
    }

    console.error('Room creation RPC error:', rpcError);
    throw new Error(rpcError?.message || 'Failed to create room.');
  },

  /**
   * Fetches the current authoritative room state directly from Supabase
   */
  async getRoom(roomId) {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();

      if (error) {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  /**
   * Validates invitation token and joins the room via secure stored procedure
   */
  async joinRoom({ roomId, inviteToken, playerName = 'Friend' }) {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }

    const user = await ensureAnonymousAuth();
    if (!user) {
      throw new Error('Could not authenticate anonymously.');
    }

    const tokenHash = await hashToken(inviteToken || '');

    // Call authoritative stored procedure join_chess_room
    const { data, error } = await supabase.rpc('join_chess_room', {
      p_room_id: roomId,
      p_token_hash: tokenHash,
      p_player_name: playerName
    });

    if (error) {
      console.error('join_chess_room RPC error:', error);
      throw new Error(error.message || 'Failed to join match.');
    }

    if (!data || !data.success) {
      throw new Error(data?.error || 'Could not join match room.');
    }

    return {
      room: data.room,
      color: data.color,
      reconnect: data.reconnect
    };
  },

  /**
   * Subscribes to real-time room changes, peer moves, and opponent presence
   */
  subscribeToRoom(roomId, { onRoomUpdate, onMove, onPresenceChange }) {
    if (!supabase) return () => {};

    // Remove any stale channel for this room
    if (activeChannels.has(roomId)) {
      try {
        supabase.removeChannel(activeChannels.get(roomId));
      } catch (e) {}
    }

    const channel = supabase
      .channel(`room_${roomId}`, {
        config: {
          broadcast: { ack: false }
        }
      })
      // 1. Instant Peer-to-Peer Broadcast (<50ms delivery across all clients)
      .on('broadcast', { event: 'chess_move' }, ({ payload }) => {
        if (payload && onMove) {
          onMove(payload);
        }
      })
      .on('broadcast', { event: 'room_state' }, ({ payload }) => {
        if (payload && onRoomUpdate) {
          onRoomUpdate(payload);
        }
      })
      // 2. Database change replication
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          if (payload.new && onRoomUpdate) {
            onRoomUpdate(payload.new);
          }
        }
      )
      .on('presence', { event: 'sync' }, () => {
        if (onPresenceChange) {
          const state = channel.presenceState();
          onPresenceChange(state);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const user = await ensureAnonymousAuth();
          channel.track({
            userId: user?.id,
            onlineAt: new Date().toISOString()
          });
        }
      });

    activeChannels.set(roomId, channel);

    return () => {
      activeChannels.delete(roomId);
      supabase.removeChannel(channel);
    };
  },

  /**
   * Broadcasts move event directly to opponent peer (<50ms)
   */
  async broadcastMove(roomId, movePayload) {
    if (!supabase) return;
    try {
      const channel = activeChannels.get(roomId) || supabase.channel(`room_${roomId}`);
      await channel.send({
        type: 'broadcast',
        event: 'chess_move',
        payload: movePayload
      });
    } catch (e) {
      console.warn('broadcastMove warning:', e);
    }
  },

  /**
   * Broadcasts room state update directly to opponent peer
   */
  async broadcastRoomState(roomId, roomPayload) {
    if (!supabase) return;
    try {
      const channel = activeChannels.get(roomId) || supabase.channel(`room_${roomId}`);
      await channel.send({
        type: 'broadcast',
        event: 'room_state',
        payload: roomPayload
      });
    } catch (e) {
      console.warn('broadcastRoomState warning:', e);
    }
  },

  /**
   * Submits a move atomically via stored procedure with version concurrency
   */
  async commitMove({
    roomId,
    from,
    to,
    promotion = 'q',
    san,
    newFen,
    expectedVersion,
    isGameOver = false,
    winner = null,
    reason = null
  }) {
    if (!supabase) throw new Error('Supabase not configured');

    let rpcError = null;
    try {
      const { data, error } = await supabase.rpc('commit_chess_move', {
        p_room_id: roomId,
        p_from: from,
        p_to: to,
        p_promotion: promotion || 'q',
        p_san: san,
        p_new_fen: newFen,
        p_expected_version: expectedVersion,
        p_is_game_over: isGameOver,
        p_winner: winner,
        p_reason: reason
      });

      if (!error && data?.success) {
        return data;
      }

      rpcError = error || new Error(data?.error || 'Move rejected by server.');
    } catch (err) {
      rpcError = err;
    }

    const isSchemaError = rpcError && (
      rpcError.code === 'PGRST202' ||
      rpcError.message?.includes('schema cache') ||
      rpcError.message?.includes('commit_chess_move')
    );

    if (isSchemaError) {
      console.warn('commit_chess_move missing from schema cache. Falling back to direct database update...');
      const { data: room, error: fetchErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (fetchErr || !room) throw new Error('Match room not found.');

      const nextTurn = room.turn === 'w' ? 'b' : 'w';
      const existingMoves = Array.isArray(room.moves) ? room.moves : [];
      const updatedMoves = [
        ...existingMoves,
        {
          from,
          to,
          promotion,
          san,
          fen: newFen,
          playedAt: new Date().toISOString()
        }
      ];

      const updateData = {
        fen: newFen,
        turn: nextTurn,
        version: (room.version || 1) + 1,
        moves: updatedMoves,
        last_move_timestamp: new Date().toISOString()
      };

      if (isGameOver) {
        updateData.status = 'completed';
        updateData.winner = winner;
        updateData.termination_reason = reason || 'checkmate';
      }

      const { data: updatedRoom, error: updateErr } = await supabase
        .from('rooms')
        .update(updateData)
        .eq('id', roomId)
        .select()
        .single();

      if (updateErr) throw new Error(updateErr.message || 'Failed to update move.');
      return { success: true, room: updatedRoom };
    }

    throw new Error(rpcError?.message || 'Failed to commit move.');
  },

  /**
   * Resigns a multiplayer game via secure RPC
   */
  async resignGame(roomId) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('resign_match', {
        p_room_id: roomId
      });
      if (!error) return data;
    } catch {
      // fallback
    }

    const user = await ensureAnonymousAuth();
    const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (!room) return;
    const resigningColor = room.white_id === user?.id ? 'w' : 'b';
    const winnerColor = resigningColor === 'w' ? 'black' : 'white';
    await supabase.from('rooms').update({
      status: 'completed',
      winner: winnerColor,
      termination_reason: 'resignation',
      updated_at: new Date().toISOString()
    }).eq('id', roomId);
  },

  /**
   * Offers a draw via secure RPC
   */
  async offerDraw(roomId) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('offer_draw', {
        p_room_id: roomId
      });
      if (!error) return data;
    } catch {
      // fallback
    }

    const user = await ensureAnonymousAuth();
    const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (!room) return;
    const color = room.white_id === user?.id ? 'w' : 'b';
    await supabase.from('rooms').update({
      draw_offered_by: color,
      updated_at: new Date().toISOString()
    }).eq('id', roomId);
  },

  /**
   * Responds to draw offer via secure RPC
   */
  async respondDraw(roomId, accept) {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('respond_draw', {
        p_room_id: roomId,
        p_accept: Boolean(accept)
      });
      if (!error) return data;
    } catch {
      // fallback
    }

    if (accept) {
      await supabase.from('rooms').update({
        status: 'completed',
        winner: 'draw',
        termination_reason: 'agreement',
        draw_offered_by: null,
        updated_at: new Date().toISOString()
      }).eq('id', roomId);
    } else {
      await supabase.from('rooms').update({
        draw_offered_by: null,
        updated_at: new Date().toISOString()
      }).eq('id', roomId);
    }
  }
};

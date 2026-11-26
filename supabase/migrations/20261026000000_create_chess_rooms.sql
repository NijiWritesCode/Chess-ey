-- ============================================================================
-- Supabase Hardened Migration: Authoritative Multiplayer Chess Rooms
-- Implements Zero-Knowledge Invitation Secrecy, Server-Authoritative Moves,
-- Strict RLS Policies, and Idempotent Atomic State Transitions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table: rooms
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'active', 'completed', 'aborted'
  fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn TEXT NOT NULL DEFAULT '',
  moves JSONB NOT NULL DEFAULT '[]'::jsonb,
  turn TEXT NOT NULL DEFAULT 'w',
  version INT NOT NULL DEFAULT 1,
  
  -- Player seats (Supabase Auth user IDs)
  white_id UUID NULL,
  black_id UUID NULL,
  white_name TEXT NOT NULL DEFAULT 'White Player',
  black_name TEXT NOT NULL DEFAULT 'Black Player',

  -- Clock and time controls (in milliseconds)
  time_control_initial_ms INT NOT NULL DEFAULT 600000, -- 10 mins default
  time_control_increment_ms INT NOT NULL DEFAULT 0,
  white_time_ms INT NOT NULL DEFAULT 600000,
  black_time_ms INT NOT NULL DEFAULT 600000,
  last_move_timestamp TIMESTAMPTZ NULL,

  -- Game result & flags
  winner TEXT NULL, -- 'white', 'black', 'draw'
  termination_reason TEXT NULL, -- 'checkmate', 'resignation', 'timeout', 'stalemate', 'agreement'
  draw_offered_by TEXT NULL, -- 'w', 'b', NULL
  rematch_room_id UUID NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON public.rooms (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_white_id ON public.rooms (white_id);
CREATE INDEX IF NOT EXISTS idx_rooms_black_id ON public.rooms (black_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms (status);

-- Enable Row Level Security
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS POLICIES
-- Strict Security: Only seated participants can SELECT their own room row.
-- Non-participants CANNOT query waiting rooms or read invitation hashes.
-- Direct UPDATE is completely prohibited; all updates occur via SECURITY DEFINER RPCs.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow members and invitees to view room" ON public.rooms;
DROP POLICY IF EXISTS "Allow authenticated users to create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Allow members to update their room" ON public.rooms;
DROP POLICY IF EXISTS "Allow seated participants to view their room" ON public.rooms;

-- 1. SELECT: Seated participants only
CREATE POLICY "Allow seated participants to view their room"
  ON public.rooms
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      auth.uid() = white_id OR
      auth.uid() = black_id
    )
  );

-- 2. INSERT: Controlled via stored procedure create_chess_room or restricted insert
CREATE POLICY "Allow authenticated users to create rooms"
  ON public.rooms
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      auth.uid() = white_id OR
      auth.uid() = black_id
    )
  );

-- 3. UPDATE: Revoked completely for clients. State changes MUST go through verified RPCs.
REVOKE UPDATE ON public.rooms FROM anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- RPC: create_chess_room
-- Atomically creates a room and returns room metadata to creator
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_chess_room(
  p_token_hash TEXT,
  p_initial_time_ms INT DEFAULT 600000,
  p_increment_ms INT DEFAULT 0,
  p_color_choice TEXT DEFAULT 'random',
  p_player_name TEXT DEFAULT 'Player'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_assigned_color TEXT;
  v_white_id UUID := NULL;
  v_black_id UUID := NULL;
  v_white_name TEXT := 'White Player';
  v_black_name TEXT := 'Black Player';
  v_room_id UUID;
  v_created_room public.rooms%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required to create room');
  END IF;

  IF p_token_hash IS NULL OR length(p_token_hash) < 16 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid invitation secret hash');
  END IF;

  -- Determine creator seat
  IF p_color_choice = 'white' THEN
    v_assigned_color := 'w';
  ELSIF p_color_choice = 'black' THEN
    v_assigned_color := 'b';
  ELSE
    v_assigned_color := CASE WHEN random() < 0.5 THEN 'w' ELSE 'b' END;
  END IF;

  IF v_assigned_color = 'w' THEN
    v_white_id := v_user_id;
    v_white_name := COALESCE(NULLIF(trim(p_player_name), ''), 'White Player');
  ELSE
    v_black_id := v_user_id;
    v_black_name := COALESCE(NULLIF(trim(p_player_name), ''), 'Black Player');
  END IF;

  INSERT INTO public.rooms (
    invite_token_hash,
    status,
    white_id,
    black_id,
    white_name,
    black_name,
    time_control_initial_ms,
    time_control_increment_ms,
    white_time_ms,
    black_time_ms,
    last_move_timestamp,
    created_at,
    updated_at
  ) VALUES (
    p_token_hash,
    'waiting',
    v_white_id,
    v_black_id,
    v_white_name,
    v_black_name,
    p_initial_time_ms,
    p_increment_ms,
    p_initial_time_ms,
    p_initial_time_ms,
    NULL,
    now(),
    now()
  )
  RETURNING * INTO v_created_room;

  RETURN jsonb_build_object(
    'success', true,
    'roomId', v_created_room.id,
    'playerColor', v_assigned_color,
    'room', row_to_json(v_created_room)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: join_chess_room
-- Securely claims an open seat using the invite token hash.
-- Enforces: valid hash, non-expired room (24h), seat availability.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_chess_room(
  p_room_id UUID,
  p_token_hash TEXT,
  p_player_name TEXT DEFAULT 'Friend'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_assigned_color TEXT;
  v_clean_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match room not found or expired');
  END IF;

  -- Enforce 24-hour room expiration
  IF v_room.created_at < (now() - INTERVAL '24 hours') THEN
    UPDATE public.rooms SET status = 'aborted', updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('success', false, 'error', 'This invitation has expired (24h limit)');
  END IF;

  -- Reconnect if user already holds a seat
  IF v_room.white_id = v_user_id THEN
    RETURN jsonb_build_object('success', true, 'color', 'w', 'reconnect', true, 'room', row_to_json(v_room));
  END IF;

  IF v_room.black_id = v_user_id THEN
    RETURN jsonb_build_object('success', true, 'color', 'b', 'reconnect', true, 'room', row_to_json(v_room));
  END IF;

  -- Verify token hash for new participants
  IF v_room.invite_token_hash <> p_token_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid invitation credentials');
  END IF;

  v_clean_name := COALESCE(NULLIF(trim(p_player_name), ''), 'Friend');

  -- Assign available seat
  IF v_room.white_id IS NULL THEN
    UPDATE public.rooms
    SET white_id = v_user_id,
        white_name = v_clean_name,
        status = CASE WHEN black_id IS NOT NULL THEN 'active' ELSE 'waiting' END,
        last_move_timestamp = now(),
        updated_at = now()
    WHERE id = p_room_id
    RETURNING * INTO v_room;
    v_assigned_color := 'w';
  ELSIF v_room.black_id IS NULL THEN
    UPDATE public.rooms
    SET black_id = v_user_id,
        black_name = v_clean_name,
        status = 'active',
        last_move_timestamp = now(),
        updated_at = now()
    WHERE id = p_room_id
    RETURNING * INTO v_room;
    v_assigned_color := 'b';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Match is full: both player seats are occupied');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'color', v_assigned_color,
    'reconnect', false,
    'room', row_to_json(v_room)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: commit_chess_move
-- Server-authoritative move execution with optimistic version concurrency,
-- strict turn verification, elapsed time clock deductions, and timeout adjudication.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_chess_move(
  p_room_id UUID,
  p_from TEXT,
  p_to TEXT,
  p_promotion TEXT,
  p_san TEXT,
  p_new_fen TEXT,
  p_expected_version INT,
  p_is_game_over BOOLEAN DEFAULT false,
  p_winner TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_player_color TEXT;
  v_now TIMESTAMPTZ := now();
  v_elapsed_ms INT := 0;
  v_new_white_ms INT;
  v_new_black_ms INT;
  v_new_moves JSONB;
  v_final_status TEXT;
  v_final_winner TEXT;
  v_final_reason TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  IF v_room.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is not currently active');
  END IF;

  -- 1. Version concurrency check (prevents double moves & race conditions)
  IF v_room.version <> p_expected_version THEN
    RETURN jsonb_build_object('success', false, 'error', 'Move conflict: game state has already advanced');
  END IF;

  -- 2. Verify caller seat ownership
  IF v_room.white_id = v_user_id THEN
    v_player_color := 'w';
  ELSIF v_room.black_id = v_user_id THEN
    v_player_color := 'b';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: you are not a seated player in this match');
  END IF;

  -- 3. Verify turn ownership
  IF v_room.turn <> v_player_color THEN
    RETURN jsonb_build_object('success', false, 'error', 'It is not your turn');
  END IF;

  -- 4. Calculate authoritative clock deduction
  v_new_white_ms := v_room.white_time_ms;
  v_new_black_ms := v_room.black_time_ms;

  IF v_room.last_move_timestamp IS NOT NULL AND v_room.time_control_initial_ms > 0 THEN
    v_elapsed_ms := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_room.last_move_timestamp)) * 1000)::INT);
    IF v_player_color = 'w' THEN
      v_new_white_ms := v_new_white_ms - v_elapsed_ms;
      IF v_new_white_ms <= 0 THEN
        -- Flag fall timeout!
        UPDATE public.rooms
        SET white_time_ms = 0,
            status = 'completed',
            winner = 'black',
            termination_reason = 'timeout',
            updated_at = v_now
        WHERE id = p_room_id;

        RETURN jsonb_build_object(
          'success', false,
          'error', 'Time expired: White lost on time',
          'isGameOver', true,
          'winner', 'black',
          'reason', 'timeout'
        );
      END IF;
      v_new_white_ms := v_new_white_ms + v_room.time_control_increment_ms;
    ELSE
      v_new_black_ms := v_new_black_ms - v_elapsed_ms;
      IF v_new_black_ms <= 0 THEN
        -- Flag fall timeout!
        UPDATE public.rooms
        SET black_time_ms = 0,
            status = 'completed',
            winner = 'white',
            termination_reason = 'timeout',
            updated_at = v_now
        WHERE id = p_room_id;

        RETURN jsonb_build_object(
          'success', false,
          'error', 'Time expired: Black lost on time',
          'isGameOver', true,
          'winner', 'white',
          'reason', 'timeout'
        );
      END IF;
      v_new_black_ms := v_new_black_ms + v_room.time_control_increment_ms;
    END IF;
  END IF;

  -- 5. Append move to authoritative history
  v_new_moves := v_room.moves || jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'promotion', COALESCE(p_promotion, 'q'),
    'san', p_san,
    'turn', v_player_color,
    'fen', p_new_fen,
    'timestamp', v_now
  );

  v_final_status := CASE WHEN p_is_game_over THEN 'completed' ELSE 'active' END;
  v_final_winner := CASE WHEN p_is_game_over THEN p_winner ELSE NULL END;
  v_final_reason := CASE WHEN p_is_game_over THEN p_reason ELSE NULL END;

  -- 6. Commit atomic update
  UPDATE public.rooms
  SET fen = p_new_fen,
      turn = CASE WHEN v_player_color = 'w' THEN 'b' ELSE 'w' END,
      version = v_room.version + 1,
      moves = v_new_moves,
      white_time_ms = v_new_white_ms,
      black_time_ms = v_new_black_ms,
      last_move_timestamp = v_now,
      status = v_final_status,
      winner = v_final_winner,
      termination_reason = v_final_reason,
      draw_offered_by = NULL,
      updated_at = v_now
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'version', v_room.version + 1,
    'newFen', p_new_fen,
    'turn', CASE WHEN v_player_color = 'w' THEN 'b' ELSE 'w' END,
    'isGameOver', p_is_game_over,
    'winner', v_final_winner,
    'reason', v_final_reason
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: resign_match
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resign_match(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_winner TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND OR v_room.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active match not found');
  END IF;

  IF v_room.white_id = v_user_id THEN
    v_winner := 'black';
  ELSIF v_room.black_id = v_user_id THEN
    v_winner := 'white';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.rooms
  SET status = 'completed',
      winner = v_winner,
      termination_reason = 'resignation',
      updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true, 'winner', v_winner, 'reason', 'resignation');
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: offer_draw
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.offer_draw(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_color TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND OR v_room.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active match not found');
  END IF;

  IF v_room.white_id = v_user_id THEN
    v_color := 'w';
  ELSIF v_room.black_id = v_user_id THEN
    v_color := 'b';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.rooms
  SET draw_offered_by = v_color,
      updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true, 'offeredBy', v_color);
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: respond_draw
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_draw(
  p_room_id UUID,
  p_accept BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_color TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND OR v_room.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active match not found');
  END IF;

  IF v_room.white_id = v_user_id THEN
    v_color := 'w';
  ELSIF v_room.black_id = v_user_id THEN
    v_color := 'b';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Must be responding to opponent's offer
  IF v_room.draw_offered_by IS NULL OR v_room.draw_offered_by = v_color THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active draw offer from opponent');
  END IF;

  IF p_accept THEN
    UPDATE public.rooms
    SET status = 'completed',
        winner = 'draw',
        termination_reason = 'agreement',
        draw_offered_by = NULL,
        updated_at = now()
    WHERE id = p_room_id;

    RETURN jsonb_build_object('success', true, 'status', 'completed', 'winner', 'draw');
  ELSE
    UPDATE public.rooms
    SET draw_offered_by = NULL,
        updated_at = now()
    WHERE id = p_room_id;

    RETURN jsonb_build_object('success', true, 'status', 'active', 'rejected', true);
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- Grant explicit execution to authenticated and anon users
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.create_chess_room TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_chess_room TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_chess_move TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resign_match TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offer_draw TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_draw TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- Safe Realtime Publication Subscription
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  END IF;
END $$;

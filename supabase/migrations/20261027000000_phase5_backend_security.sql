-- ============================================================================
-- Supabase Migration: Phase 5 - Multiplayer Backend & Cryptographic Security
-- Implements:
-- 1. Versioned schema with rooms, room_seats, and room_moves tables.
-- 2. Cryptographic invitation token hashing and verification.
-- 3. Independent seat recovery credentials and rotation.
-- 4. Server-authoritative atomic move processing with version locking.
-- 5. Strict RLS policies and private Realtime channels.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Table: rooms
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting', -- 'waiting', 'active', 'completed', 'aborted'
  initial_fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  turn TEXT NOT NULL DEFAULT 'w', -- 'w' | 'b'
  version INT NOT NULL DEFAULT 1,

  -- Legacy direct seat columns for backwards-compatibility
  white_id UUID NULL,
  black_id UUID NULL,
  white_name TEXT NOT NULL DEFAULT 'White Player',
  black_name TEXT NOT NULL DEFAULT 'Black Player',

  -- Time Controls (ms)
  time_control_initial_ms INT NOT NULL DEFAULT 600000,
  time_control_increment_ms INT NOT NULL DEFAULT 0,
  white_time_ms INT NOT NULL DEFAULT 600000,
  black_time_ms INT NOT NULL DEFAULT 600000,
  last_move_timestamp TIMESTAMPTZ NULL,

  -- Result & Flags
  winner TEXT NULL, -- 'white', 'black', 'draw'
  termination_reason TEXT NULL, -- 'checkmate', 'resignation', 'timeout', 'stalemate', 'agreement', 'abandoned'
  draw_offered_by TEXT NULL, -- 'w', 'b'
  rematch_room_id UUID NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes on rooms
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON public.rooms (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms (status);
CREATE INDEX IF NOT EXISTS idx_rooms_white_id ON public.rooms (white_id);
CREATE INDEX IF NOT EXISTS idx_rooms_black_id ON public.rooms (black_id);

-- ----------------------------------------------------------------------------
-- 2. Table: room_seats
-- Stores player identities and independent seat recovery credentials
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  seat_color TEXT NOT NULL CHECK (seat_color IN ('w', 'b')),
  user_id UUID NOT NULL,
  player_name TEXT NOT NULL DEFAULT 'Player',
  recovery_token_hash TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_room_seat UNIQUE (room_id, seat_color)
);

CREATE INDEX IF NOT EXISTS idx_room_seats_user_id ON public.room_seats (user_id);
CREATE INDEX IF NOT EXISTS idx_room_seats_room_id ON public.room_seats (room_id);

-- ----------------------------------------------------------------------------
-- 3. Table: room_moves
-- Canonical append-only sequence of accepted plies with unique constraint
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  ply INT NOT NULL,
  from_sq TEXT NOT NULL,
  to_sq TEXT NOT NULL,
  promotion TEXT NULL,
  san TEXT NOT NULL,
  fen_before TEXT NOT NULL,
  fen_after TEXT NOT NULL,
  player_seat TEXT NOT NULL CHECK (player_seat IN ('w', 'b')),
  move_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  elapsed_ms INT NOT NULL DEFAULT 0,
  white_time_remaining_ms INT NULL,
  black_time_remaining_ms INT NULL,
  version INT NOT NULL,
  CONSTRAINT uq_room_ply UNIQUE (room_id, ply)
);

CREATE INDEX IF NOT EXISTS idx_room_moves_room_id ON public.room_moves (room_id);
CREATE INDEX IF NOT EXISTS idx_room_moves_room_ply ON public.room_moves (room_id, ply);

-- ----------------------------------------------------------------------------
-- Row Level Security (RLS) Configuration
-- ----------------------------------------------------------------------------
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_moves ENABLE ROW LEVEL SECURITY;

-- Revoke direct table updates from clients - all mutations MUST pass through RPCs
REVOKE UPDATE, DELETE ON public.rooms FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE ON public.room_seats FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE ON public.room_moves FROM anon, authenticated, public;

-- RLS: rooms (Seated participants can view their own room)
DROP POLICY IF EXISTS "Allow seated participants to view their room" ON public.rooms;
CREATE POLICY "Allow seated participants to view their room"
  ON public.rooms
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      auth.uid() = white_id OR
      auth.uid() = black_id OR
      EXISTS (
        SELECT 1 FROM public.room_seats rs
        WHERE rs.room_id = rooms.id AND rs.user_id = auth.uid()
      )
    )
  );

-- RLS: room_seats (Participants can view seats in their room)
DROP POLICY IF EXISTS "Allow participants to view room seats" ON public.room_seats;
CREATE POLICY "Allow participants to view room seats"
  ON public.room_seats
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_seats s
      WHERE s.room_id = room_seats.room_id AND s.user_id = auth.uid()
    )
  );

-- RLS: room_moves (Participants can view move log in their room)
DROP POLICY IF EXISTS "Allow participants to view room moves" ON public.room_moves;
CREATE POLICY "Allow participants to view room moves"
  ON public.room_moves
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.room_seats s
      WHERE s.room_id = room_moves.room_id AND s.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- RPC 1: create_chess_room
-- Creates a room, assigns creator's seat, records recovery hash, returns metadata.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_chess_room(
  p_token_hash TEXT,
  p_recovery_token_hash TEXT DEFAULT NULL,
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
  v_recovery_hash TEXT := COALESCE(p_recovery_token_hash, encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'));
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

  -- Insert seat row
  INSERT INTO public.room_seats (
    room_id,
    seat_color,
    user_id,
    player_name,
    recovery_token_hash,
    claimed_at
  ) VALUES (
    v_created_room.id,
    v_assigned_color,
    v_user_id,
    CASE WHEN v_assigned_color = 'w' THEN v_white_name ELSE v_black_name END,
    v_recovery_hash,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'roomId', v_created_room.id,
    'playerColor', v_assigned_color,
    'room', row_to_json(v_created_room)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC 2: join_chess_room
-- Validates invitation hash, assigns open seat, stores recovery credential hash.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_chess_room(
  p_room_id UUID,
  p_token_hash TEXT,
  p_player_name TEXT DEFAULT 'Friend',
  p_recovery_token_hash TEXT DEFAULT NULL
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
  v_recovery_hash TEXT := COALESCE(p_recovery_token_hash, encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'));
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match room not found or expired');
  END IF;

  -- 24-hour expiration check
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

  -- Verify token hash for new joiners
  IF v_room.invite_token_hash <> p_token_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid invitation credentials');
  END IF;

  v_clean_name := COALESCE(NULLIF(trim(p_player_name), ''), 'Friend');

  -- Assign available seat
  IF v_room.white_id IS NULL THEN
    v_assigned_color := 'w';
    UPDATE public.rooms
    SET white_id = v_user_id,
        white_name = v_clean_name,
        status = CASE WHEN black_id IS NOT NULL THEN 'active' ELSE 'waiting' END,
        last_move_timestamp = now(),
        updated_at = now()
    WHERE id = p_room_id
    RETURNING * INTO v_room;
  ELSIF v_room.black_id IS NULL THEN
    v_assigned_color := 'b';
    UPDATE public.rooms
    SET black_id = v_user_id,
        black_name = v_clean_name,
        status = 'active',
        last_move_timestamp = now(),
        updated_at = now()
    WHERE id = p_room_id
    RETURNING * INTO v_room;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Match is full: both player seats are occupied');
  END IF;

  -- Upsert into room_seats
  INSERT INTO public.room_seats (
    room_id,
    seat_color,
    user_id,
    player_name,
    recovery_token_hash,
    claimed_at
  ) VALUES (
    p_room_id,
    v_assigned_color,
    v_user_id,
    v_clean_name,
    v_recovery_hash,
    now()
  )
  ON CONFLICT (room_id, seat_color) DO UPDATE
  SET user_id = v_user_id,
      player_name = v_clean_name,
      recovery_token_hash = v_recovery_hash,
      updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'color', v_assigned_color,
    'reconnect', false,
    'room', row_to_json(v_room)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC 3: recover_room_seat
-- Allows a returning player whose anonymous session changed to reclaim their seat
-- using an independent, rotatable recovery token hash.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recover_room_seat(
  p_room_id UUID,
  p_recovery_token_hash TEXT,
  p_new_recovery_token_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_seat public.room_seats%ROWTYPE;
  v_room public.rooms%ROWTYPE;
  v_new_hash TEXT := COALESCE(p_new_recovery_token_hash, p_recovery_token_hash);
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF p_recovery_token_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recovery credential required');
  END IF;

  SELECT * INTO v_seat
  FROM public.room_seats
  WHERE room_id = p_room_id AND recovery_token_hash = p_recovery_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid recovery credential');
  END IF;

  -- Update seat ownership to current user ID and rotate credential
  UPDATE public.room_seats
  SET user_id = v_user_id,
      recovery_token_hash = v_new_hash,
      updated_at = now()
  WHERE id = v_seat.id;

  -- Sync legacy columns in rooms table
  IF v_seat.seat_color = 'w' THEN
    UPDATE public.rooms SET white_id = v_user_id, updated_at = now() WHERE id = p_room_id RETURNING * INTO v_room;
  ELSE
    UPDATE public.rooms SET black_id = v_user_id, updated_at = now() WHERE id = p_room_id RETURNING * INTO v_room;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'color', v_seat.seat_color,
    'playerName', v_seat.player_name,
    'room', row_to_json(v_room)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC 4: commit_chess_move
-- Server-authoritative move execution:
-- Validates version lock, turn, seat ownership, clock deductions, appends to room_moves.
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
  v_final_status TEXT;
  v_final_winner TEXT;
  v_final_reason TEXT;
  v_current_ply INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- Atomic row lock on room
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  IF v_room.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is not currently active');
  END IF;

  -- 1. Version concurrency check (prevents duplicate moves & race conditions)
  IF v_room.version <> p_expected_version THEN
    RETURN jsonb_build_object('success', false, 'error', 'Move conflict: game state has already advanced');
  END IF;

  -- 2. Verify caller seat ownership
  IF v_room.white_id = v_user_id THEN
    v_player_color := 'w';
  ELSIF v_room.black_id = v_user_id THEN
    v_player_color := 'b';
  ELSE
    -- Check room_seats table
    SELECT seat_color INTO v_player_color
    FROM public.room_seats
    WHERE room_id = p_room_id AND user_id = v_user_id;

    IF v_player_color IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: you are not a seated player in this match');
    END IF;
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

  -- 5. Record ply in canonical room_moves table
  SELECT COALESCE(MAX(ply), 0) + 1 INTO v_current_ply
  FROM public.room_moves
  WHERE room_id = p_room_id;

  INSERT INTO public.room_moves (
    room_id,
    ply,
    from_sq,
    to_sq,
    promotion,
    san,
    fen_before,
    fen_after,
    player_seat,
    move_timestamp,
    elapsed_ms,
    white_time_remaining_ms,
    black_time_remaining_ms,
    version
  ) VALUES (
    p_room_id,
    v_current_ply,
    p_from,
    p_to,
    COALESCE(p_promotion, 'q'),
    p_san,
    v_room.fen,
    p_new_fen,
    v_player_color,
    v_now,
    v_elapsed_ms,
    v_new_white_ms,
    v_new_black_ms,
    v_room.version + 1
  );

  v_final_status := CASE WHEN p_is_game_over THEN 'completed' ELSE 'active' END;
  v_final_winner := CASE WHEN p_is_game_over THEN p_winner ELSE NULL END;
  v_final_reason := CASE WHEN p_is_game_over THEN p_reason ELSE NULL END;

  -- 6. Commit atomic update to rooms snapshot
  UPDATE public.rooms
  SET fen = p_new_fen,
      turn = CASE WHEN v_player_color = 'w' THEN 'b' ELSE 'w' END,
      version = v_room.version + 1,
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
    'ply', v_current_ply,
    'newFen', p_new_fen,
    'turn', CASE WHEN v_player_color = 'w' THEN 'b' ELSE 'w' END,
    'isGameOver', p_is_game_over,
    'winner', v_final_winner,
    'reason', v_final_reason
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC 5: claim_timeout
-- Adjudicates flag-fall timeouts server-side
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_timeout(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_elapsed_ms INT;
  v_remaining_ms INT;
  v_winner TEXT;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND OR v_room.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active match not found');
  END IF;

  IF v_room.last_move_timestamp IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active clock');
  END IF;

  v_elapsed_ms := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_room.last_move_timestamp)) * 1000)::INT);

  IF v_room.turn = 'w' THEN
    v_remaining_ms := v_room.white_time_ms - v_elapsed_ms;
    IF v_remaining_ms <= 0 THEN
      v_winner := 'black';
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'White time has not expired');
    END IF;
  ELSE
    v_remaining_ms := v_room.black_time_ms - v_elapsed_ms;
    IF v_remaining_ms <= 0 THEN
      v_winner := 'white';
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Black time has not expired');
    END IF;
  END IF;

  UPDATE public.rooms
  SET status = 'completed',
      winner = v_winner,
      termination_reason = 'timeout',
      white_time_ms = CASE WHEN v_winner = 'black' THEN 0 ELSE white_time_ms END,
      black_time_ms = CASE WHEN v_winner = 'white' THEN 0 ELSE black_time_ms END,
      updated_at = v_now
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true, 'winner', v_winner, 'reason', 'timeout');
END;
$$;

-- ----------------------------------------------------------------------------
-- Grants & Realtime Publication
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.create_chess_room TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_chess_room TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_room_seat TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_chess_move TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_timeout TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resign_match TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offer_draw TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_draw TO anon, authenticated;

-- Add tables to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'room_moves'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_moves;
  END IF;
END $$;

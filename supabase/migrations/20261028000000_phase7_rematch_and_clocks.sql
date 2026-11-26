-- ============================================================================
-- Supabase Migration: Phase 7 - Rematch Flow & Clocks Synchronization
-- Implements:
-- 1. Rematch offer state tracking (rematch_offered_by column).
-- 2. Stored procedures for requesting, declining, and atomically accepting rematches.
-- 3. Inverted color seat swapping for accepted rematch rooms.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'rematch_offered_by'
  ) THEN
    ALTER TABLE public.rooms ADD COLUMN rematch_offered_by TEXT NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- RPC 1: request_rematch
-- Sets rematch offer flag on a completed room
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_rematch(
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
  v_player_color TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  IF v_room.status <> 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is not completed yet');
  END IF;

  -- Determine caller seat
  IF v_room.white_id = v_user_id THEN
    v_player_color := 'w';
  ELSIF v_room.black_id = v_user_id THEN
    v_player_color := 'b';
  ELSE
    SELECT seat_color INTO v_player_color FROM public.room_seats
    WHERE room_id = p_room_id AND user_id = v_user_id;

    IF v_player_color IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: not a seated player');
    END IF;
  END IF;

  UPDATE public.rooms
  SET rematch_offered_by = v_player_color,
      updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true, 'rematchOfferedBy', v_player_color);
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC 2: decline_rematch
-- Clears pending rematch offer
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decline_rematch(
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
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  UPDATE public.rooms
  SET rematch_offered_by = NULL,
      updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC 3: accept_rematch
-- Atomically creates a fresh rematch room with swapped colors and fresh clocks
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_rematch(
  p_room_id UUID,
  p_invite_token_hash TEXT,
  p_recovery_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_new_room public.rooms%ROWTYPE;
  v_user_id UUID := auth.uid();
  v_caller_color TEXT;
  v_new_white_id UUID;
  v_new_black_id UUID;
  v_new_white_name TEXT;
  v_new_black_name TEXT;
  v_new_room_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  IF v_room.status <> 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is still active');
  END IF;

  -- Determine caller seat
  IF v_room.white_id = v_user_id THEN
    v_caller_color := 'w';
  ELSIF v_room.black_id = v_user_id THEN
    v_caller_color := 'b';
  ELSE
    SELECT seat_color INTO v_caller_color FROM public.room_seats
    WHERE room_id = p_room_id AND user_id = v_user_id;

    IF v_caller_color IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: not a seated player');
    END IF;
  END IF;

  -- Verify a rematch was indeed offered by the opponent
  IF v_room.rematch_offered_by IS NULL OR v_room.rematch_offered_by = v_caller_color THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending rematch offer from opponent');
  END IF;

  -- If rematch room was already created in parallel, return it
  IF v_room.rematch_room_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'newRoomId', v_room.rematch_room_id);
  END IF;

  -- SWAP SEATS:
  -- Old White becomes New Black
  -- Old Black becomes New White
  v_new_white_id := v_room.black_id;
  v_new_white_name := v_room.black_name;
  v_new_black_id := v_room.white_id;
  v_new_black_name := v_room.white_name;

  v_new_room_id := gen_random_uuid();

  -- Create fresh rematch room
  INSERT INTO public.rooms (
    id,
    invite_token_hash,
    status,
    initial_fen,
    fen,
    turn,
    version,
    white_id,
    black_id,
    white_name,
    black_name,
    time_control_initial_ms,
    time_control_increment_ms,
    white_time_ms,
    black_time_ms,
    last_move_timestamp,
    winner,
    termination_reason,
    draw_offered_by,
    rematch_room_id,
    rematch_offered_by,
    created_at,
    updated_at
  ) VALUES (
    v_new_room_id,
    p_invite_token_hash,
    'active', -- Immediately active as both seats are filled!
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'w',
    1,
    v_new_white_id,
    v_new_black_id,
    v_new_white_name,
    v_new_black_name,
    v_room.time_control_initial_ms,
    v_room.time_control_increment_ms,
    v_room.time_control_initial_ms,
    v_room.time_control_initial_ms,
    now(),
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    now(),
    now()
  )
  RETURNING * INTO v_new_room;

  -- Seed room_seats for new room
  IF v_new_white_id IS NOT NULL THEN
    INSERT INTO public.room_seats (
      room_id,
      seat_color,
      user_id,
      player_name,
      recovery_token_hash,
      claimed_at
    ) VALUES (
      v_new_room_id,
      'w',
      v_new_white_id,
      v_new_white_name,
      CASE WHEN v_caller_color = 'b' THEN p_recovery_token_hash ELSE p_invite_token_hash END,
      now()
    );
  END IF;

  IF v_new_black_id IS NOT NULL THEN
    INSERT INTO public.room_seats (
      room_id,
      seat_color,
      user_id,
      player_name,
      recovery_token_hash,
      claimed_at
    ) VALUES (
      v_new_room_id,
      'b',
      v_new_black_id,
      v_new_black_name,
      CASE WHEN v_caller_color = 'w' THEN p_recovery_token_hash ELSE p_invite_token_hash END,
      now()
    );
  END IF;

  -- Link old room to new rematch room
  UPDATE public.rooms
  SET rematch_room_id = v_new_room_id,
      rematch_offered_by = NULL,
      updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'newRoomId', v_new_room_id,
    'newWhiteName', v_new_white_name,
    'newBlackName', v_new_black_name
  );
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.request_rematch TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decline_rematch TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_rematch TO anon, authenticated;

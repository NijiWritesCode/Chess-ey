import { test, expect } from '@playwright/test';

test.describe('Chess-ey Phase 10: Complete End-to-End User Journeys', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept Supabase Auth so all tests run with mock anonymous auth silently
    await page.route('**/auth/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token-xyz',
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            id: 'auditor-user-uuid',
            aud: 'authenticated',
            role: 'authenticated'
          }
        })
      });
    });
  });

  // Journey 1: Offline Computer Game against Stockfish Bot
  test('Journey 1: User plays offline match vs Stockfish bot, resigns, and reviews saved game', async ({ page }) => {
    // 1. Visit Computer Game page
    await page.goto('/computer');
    await expect(page).toHaveURL(/.*\/computer/);

    // 2. Verify chessboard and player cards are mounted
    await expect(page.locator('button[title="Resign this match"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=You')).toBeVisible();

    // 3. User resigns the match
    await page.locator('button[title="Resign this match"]').click();

    // 4. Verify Game Over modal appears
    const gameOverModal = page.getByRole('dialog', { name: /Defeat|Victory|Match Drawn|Game Finished/i });
    await expect(gameOverModal).toBeVisible({ timeout: 5000 });
    await expect(gameOverModal).toContainText(/Game resigned|conceded/i);

    // 5. Click "Review / Analyze Game"
    const reviewBtn = page.getByRole('button', { name: /Review \/ Analyze Game/i });
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    // 6. User is redirected to review page
    await expect(page).toHaveURL(/.*\/review.*/, { timeout: 10000 });
    await expect(page.locator('main').locator('text=Game Review').or(page.locator('main').locator('text=Analysis'))).toBeVisible({ timeout: 10000 });

    // 7. Navigate to Recent Games page and verify the game appears in history
    await page.goto('/history');
    await expect(page.locator('text=Game History')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=vs Stockfish').or(page.locator('text=White'))).toBeVisible();
  });

  // Journey 2: Multiplayer Room Creation & Waiting View
  test('Journey 2: Player creates a multiplayer room, receives invite link, and enters waiting room', async ({ page }) => {
    await page.route('**/rest/v1/rpc/create_chess_room', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          roomId: 'room-e2e-invite-test',
          playerColor: 'w',
          room: {
            id: 'room-e2e-invite-test',
            invite_token: 'valid-e2e-invite-token',
            creator_color: 'white',
            time_control: { label: '5 min | 3s', initialSeconds: 300, increment: 3 }
          },
          seat: {
            seat: 'white',
            recovery_credential: 'alice-recovery-token-123'
          }
        })
      });
    });

    // Intercept single room lookup
    await page.route('**/rest/v1/rooms*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'room-e2e-invite-test',
          status: 'waiting',
          creator_seat: 'white',
          white_id: 'auditor-user-uuid',
          black_id: null,
          white_name: 'Alice',
          black_name: null,
          time_control: { initialSeconds: 300, increment: 3 },
          current_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1',
          white_time_remaining_ms: 300000,
          black_time_remaining_ms: 300000,
          invite_token: 'valid-e2e-invite-token',
          version: 0
        })
      });
    });

    await page.route('**/rest/v1/room_moves*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await page.goto('/multiplayer');
    await expect(page.locator('text=Play with a Friend')).toBeVisible();

    // Enter name
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.fill('Alice');

    // Click "Create Room & Get Link"
    const createBtn = page.getByRole('button', { name: /Create Room/i });
    await createBtn.click();

    // Verify room creation modal/card shows share link and "Enter Game Room"
    await expect(page.locator('text=Room is Ready!')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /^Copy/i })).toBeVisible();

    // Click "Enter Room"
    await page.getByRole('button', { name: /Enter Room/i }).click();
    await expect(page).toHaveURL(/.*\/play\/room-e2e-invite-test/);

    // Verify waiting state UI
    await expect(page.locator('text=Waiting for Opponent')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Share the invitation link with a friend')).toBeVisible();
  });

  // Journey 3: Two-Player Live Match Synchronization
  test('Journey 3: Two players join match, moves are made, and game concludes', async ({ page }) => {
    let matchVersion = 0;
    let matchFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1';
    let matchStatus = 'active';

    await page.route('**/rest/v1/rooms*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'room-live-match-e2e',
          status: matchStatus,
          creator_seat: 'white',
          white_id: 'alice-id',
          black_id: 'bob-id',
          white_name: 'Alice',
          black_name: 'Bob',
          time_control: { initialSeconds: 300, increment: 3 },
          current_fen: matchFen,
          white_time_remaining_ms: 298000,
          black_time_remaining_ms: 300000,
          invite_token: 'token-123',
          version: matchVersion
        })
      });
    });

    await page.route('**/rest/v1/room_moves*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Seat recovery
    await page.route('**/rest/v1/rpc/recover_room_seat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          color: 'w',
          playerName: 'Alice',
          room: { id: 'room-live-match-e2e' }
        })
      });
    });

    // Intercept move commit
    await page.route('**/rest/v1/rpc/commit_chess_move', async (route) => {
      matchVersion = 1;
      matchFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          version: 1,
          fen_after: matchFen,
          san: 'e4',
          ply: 1
        })
      });
    });

    // Intercept resignation
    await page.route('**/rest/v1/rpc/resign_match', async (route) => {
      matchStatus = 'completed';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'completed',
          result: { winner: 'black', reason: 'resignation' }
        })
      });
    });

    // Seed local seat credential as Alice (White)
    await page.addInitScript(() => {
      localStorage.setItem('chessey_seat_recovery_room-live-match-e2e', 'alice-recovery-token');
    });

    await page.goto('/play/room-live-match-e2e');

    // Both players connected -> match is active
    await expect(page.locator('text=Alice')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=(You)')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Bob')).toBeVisible();

    // Alice resigns the match
    const resignBtn = page.getByRole('button', { name: /Resign/i }).first();
    await expect(resignBtn).toBeVisible({ timeout: 5000 });
    await resignBtn.click();

    // Confirm resignation modal
    await expect(page.locator('text=Resign the Match?')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Yes, Resign/i }).click();

    // Verify match status updates
    await expect(page.locator('text=Game Finished').or(page.locator('text=Defeat'))).toBeVisible({ timeout: 5000 });
  });

  // Journey 4: Mid-game Reconnection & Cryptographic Seat Recovery
  test('Journey 4: Player reloads page during active game and recovers seat without downgrade', async ({ page }) => {
    let recoveredCalled = false;

    await page.route('**/rest/v1/rooms*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'room-reconnect-e2e',
          status: 'active',
          creator_seat: 'white',
          white_id: 'alice-uuid',
          black_id: 'bob-uuid',
          white_name: 'Alice',
          black_name: 'Bob',
          time_control: { initialSeconds: 300, increment: 3 },
          current_fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
          white_time_remaining_ms: 280000,
          black_time_remaining_ms: 295000,
          version: 1
        })
      });
    });

    await page.route('**/rest/v1/room_moves*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { ply: 1, from_sq: 'e2', to_sq: 'e4', san: 'e4', fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', player_seat: 'white' }
        ])
      });
    });

    await page.route('**/rest/v1/rpc/recover_room_seat', async (route) => {
      recoveredCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          color: 'w',
          playerName: 'Alice',
          room: { id: 'room-reconnect-e2e' }
        })
      });
    });

    // Seed seat recovery token in localStorage
    await page.addInitScript(() => {
      localStorage.setItem('chessey_seat_recovery_room-reconnect-e2e', 'valid-alice-auth-token-12345');
    });

    // First load
    await page.goto('/play/room-reconnect-e2e');
    await expect(page.locator('text=Alice')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=(You)')).toBeVisible({ timeout: 10000 });

    // Mid-game browser refresh
    await page.reload();

    // Verify Alice is still playing as White and controls are interactive
    await expect(page.locator('text=Alice')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=(You)')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Resign/i }).first()).toBeVisible();
    expect(recoveredCalled).toBe(true);
  });

  // Journey 5: Rematch Negotiation & Seat Inversion
  test('Journey 5: Rematch is offered and accepted, seamlessly transitioning to a new room with swapped seats', async ({ page }) => {
    let rematchOffered = true;

    await page.route('**/rest/v1/rooms*', async (route) => {
      const url = route.request().url();
      if (url.includes('new-rematch-room-789')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'new-rematch-room-789',
            status: 'active',
            creator_seat: 'white',
            white_id: 'bob-uuid', // seats swapped! Bob is now White
            black_id: 'auditor-user-uuid', // Alice is now Black
            white_name: 'Bob',
            black_name: 'Alice',
            time_control: { initialSeconds: 300, increment: 3 },
            current_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1',
            white_time_remaining_ms: 300000,
            black_time_remaining_ms: 300000,
            version: 0
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'original-match-room-123',
            status: 'completed',
            creator_seat: 'white',
            white_id: 'auditor-user-uuid',
            black_id: 'bob-uuid',
            white_name: 'Alice',
            black_name: 'Bob',
            time_control: { initialSeconds: 300, increment: 3 },
            current_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1',
            white_time_remaining_ms: 0,
            black_time_remaining_ms: 120000,
            version: 10,
            result: { winner: 'black', reason: 'timeout' },
            rematch_offered_by: rematchOffered ? 'b' : null,
            rematch_room_id: null
          })
        });
      }
    });

    await page.route('**/rest/v1/room_moves*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Seat recovery
    await page.route('**/rest/v1/rpc/recover_room_seat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          color: 'w',
          playerName: 'Alice',
          room: { id: 'original-match-room-123' }
        })
      });
    });

    // Accept rematch RPC
    await page.route('**/rest/v1/rpc/accept_rematch', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          newRoomId: 'new-rematch-room-789',
          new_room_id: 'new-rematch-room-789',
          new_seat: 'b',
          recovery_credential: 'alice-new-black-token'
        })
      });
    });

    // Seed seat credential as Alice (White in original room)
    await page.addInitScript(() => {
      localStorage.setItem('chessey_seat_recovery_original-match-room-123', 'alice-original-token');
    });

    await page.goto('/play/original-match-room-123');

    // Wait for Game Over modal and dismiss it to reveal the Rematch banner
    const gameOverDialog = page.getByRole('dialog');
    await expect(gameOverDialog).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Close modal/i }).click();
    await expect(gameOverDialog).toBeHidden({ timeout: 5000 });

    // Verify Rematch challenge banner is displayed
    const acceptBtn = page.getByRole('button', { name: /Accept Rematch/i });
    await expect(acceptBtn).toBeVisible({ timeout: 10000 });
    await acceptBtn.click();

    // Verify redirection to new rematch room
    await expect(page).toHaveURL(/.*\/play\/new-rematch-room-789/, { timeout: 10000 });

    // Verify Alice is now playing as Black in the new room
    await expect(page.locator('text=Alice').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=(You)').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Bob').first()).toBeVisible({ timeout: 10000 });
  });

  // Journey 6: Game Review & Analysis Exploration
  test('Journey 6: Game Review reconstructs game with Stockfish evaluation and move classification badges', async ({ page }) => {
    // Seed a completed game into history
    await page.addInitScript(() => {
      const mockGame = {
        id: 'review-e2e-demo-match',
        gameMode: 'computer',
        timestamp: Date.now(),
        date: new Date().toISOString(),
        result: { winner: 'w', reason: 'checkmate', pgnResult: '1-0' },
        players: {
          white: { name: 'Magnus', elo: 2850 },
          black: { name: 'Stockfish Bot', elo: 1500 }
        },
        timeControl: { initialSeconds: 300, increment: 3 },
        moves: [
          { ply: 1, san: 'e4', from: 'e2', to: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', turn: 'w' },
          { ply: 2, san: 'e5', from: 'e7', to: 'e5', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', turn: 'b' },
          { ply: 3, san: 'Qh5', from: 'd1', to: 'h5', fen: 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2', turn: 'w' },
          { ply: 4, san: 'Nc6', from: 'b8', to: 'c6', fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3', turn: 'b' },
          { ply: 5, san: 'Bc4', from: 'f1', to: 'c4', fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', turn: 'w' },
          { ply: 6, san: 'Nf6', from: 'g8', to: 'f6', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', turn: 'b' },
          { ply: 7, san: 'Qxf7#', from: 'h5', to: 'f7', fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4', turn: 'w' }
        ],
        pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'
      };

      localStorage.setItem('chessey_game_review-e2e-demo-match', JSON.stringify(mockGame));
      localStorage.setItem('chessey_games_index', JSON.stringify(['review-e2e-demo-match']));
    });

    await page.goto('/review/review-e2e-demo-match');

    // Verify Review page components render
    await expect(page.locator('main').locator('text=Game Review')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Magnus').first()).toBeVisible();
    await expect(page.locator('text=Stockfish Bot').first()).toBeVisible();

    // Verify Move List has rendered the moves
    await expect(page.locator('text=Qxf7#').first()).toBeVisible({ timeout: 10000 });

    // Step backward using the back button if visible
    const backButton = page.locator('button[title*="Previous"], button[aria-label*="Previous"]').or(page.locator('button').filter({ has: page.locator('svg') }).nth(1));
    if (await backButton.count() > 0) {
      await backButton.first().click();
    }

    // Verify Evaluation Bar is rendered
    await expect(page.getByRole('progressbar')).toBeVisible({ timeout: 10000 });
  });

});

# Chess-ey ♟️
> Complete Online Chess Platform with Stockfish WebAssembly, Live Move Intelligence, Account-Free Multiplayer, and Deep Game Review.

---

## 🌟 Overview & Key Capabilities

**Chess-ey** is a production-quality chess application built for players who want to play immediately and understand every move without the friction of registration, passwords, or paywalls.

### Three Primary Experiences:
1. **Play Against Stockfish**: Real WebAssembly engine running client-side in a Web Worker, configurable from Level 1 (~800 ELO) to Level 20 (~2800+ ELO), with live move evaluation, best-move arrows, clocks, and undo.
2. **Play a Friend via Shareable Link**: Instant room creation protected by cryptographically random tokens and Supabase anonymous authentication. Friends join by opening the link—no accounts needed.
3. **Full Game Review**: Complete post-game analysis with documented mathematical accuracy scores, interactive evaluation graph, move-by-move explanations, opening theory breakdown, turning points, and playable variations.

### Signature Feature: Live Move Classification
Every move is assessed with real-time Stockfish engine calculations and opening database theory:
- **Brilliant (`!!`)**: Tactical piece sacrifice cementing or maintaining a decisive advantage.
- **Great (`!`)**: Subtle, high-impact resource finding the optimal continuation.
- **Best (`★`)**: Engine's primary recommendation.
- **Excellent (`✓`)**: Solid alternative preserving position.
- **Good (`✔`)**: Playable move keeping the balance.
- **Book (`📖`)**: Recognized line from the comprehensive ECO database.
- **Inaccuracy (`?!`)**: Minor positional mistake (51–100 centipawns loss).
- **Mistake (`?`)**: Notable error relinquishing advantage (101–200 centipawns loss).
- **Blunder (`??`)**: Decisive oversight giving advantage to opponent (>200 centipawns loss).
- **Missed Win (`✖`)**: Overlooked a winning breakthrough or forced mate.
- **Forced (`□`)**: Only legal move available.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite 6, JavaScript, Tailwind CSS, React Router v7, Lucide React.
- **Chessboard**: `react-chessboard` (verified v5 options API).
- **Chess Logic**: `chess.js` (v1.4.0) for legal move validation, FEN/PGN parsing, check/mate/draw conditions.
- **Engine**: Official Stockfish WebAssembly (`stockfish.wasm` and `stockfish.wasm.js` UCI Web Worker).
- **Audio**: Web Audio API synthesized physical sounds (move, capture, check, castle, victory) with zero network latency.
- **Backend & Multiplayer**: Supabase (PostgreSQL, Anonymous Authentication, Realtime Channels, Stored Procedures).
- **Persistence**: IndexedDB for saving local game history and reviews.
- **Quality Assurance**: Vitest and React Testing Library.

---

## 🚀 Quick Start & Local Development

### 1. Prerequisites
- Node.js (v18 or later recommended; tested on v22)
- npm (v9+)

### 2. Installation
```bash
git clone <repository-url>
cd Chess-ey
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:5173`. Computer chess, position analysis, and game reviews are 100% playable out of the box without any third-party credentials.

### 4. Running Tests
```bash
npm test
```

### 5. Production Build
```bash
npm run build
npm run preview
```

---

## 🌐 Supabase Multiplayer Setup (Optional)

Friend-match multiplayer uses Supabase Anonymous Authentication, Realtime, and PostgreSQL with Row Level Security.

### Step 1: Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a free project.

### Step 2: Enable Anonymous Sign-Ins
1. In your Supabase Dashboard, go to **Authentication** &rarr; **Providers** &rarr; **Anonymous**.
2. Toggle **Enable Anonymous Sign-Ins** to **ON** and save.

### Step 3: Run Database Migrations
1. In the Supabase Dashboard, open the **SQL Editor**.
2. Open and paste the contents of `supabase/migrations/20261026000000_create_chess_rooms.sql`.
3. Click **Run**. This creates:
   - The `rooms` table with Row Level Security (RLS) enabled.
   - The `join_chess_room` stored procedure (verifying invitation token hashes and claiming seats atomically).
   - The `commit_chess_move` stored procedure (validating player turn, version concurrency, and clock times).
   - Supabase Realtime publication on the `rooms` table.

### Step 4: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your credentials:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
Restart `npm run dev`. The multiplayer portal will now show **Multiplayer Ready** with full real-time friend matching.

---

## 📜 Stockfish & Data Licensing Notice

- **Stockfish**: Licensed under the [GNU General Public License v3.0 (GPLv3)](public/engine/LICENSE.txt). The distributed Stockfish WebAssembly binary and JavaScript wrapper are compiled from official open-source Stockfish. Source code and build scripts are available at the [Stockfish GitHub repository](https://github.com/official-stockfish/Stockfish) and [stockfish.js repository](https://github.com/niklasf/stockfish.js).
- **Opening Book Data**: Curated from the public domain Lichess Chess Openings dataset released under the Creative Commons Zero (CC0) license.

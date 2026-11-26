// Comprehensive Opening Book with ECO codes, names, moves, and FEN matching for transpositions
// Grounded in standard chess opening theory and Lichess open datasets (CC0 / Public Domain)
import { Chess } from 'chess.js';

export const OPENINGS_DATA = [
  // A00 - Flank & Irregular Openings
  { eco: 'A00', name: 'Grob Opening', moves: ['g4'] },
  { eco: 'A00', name: 'Polish / Sokolsky Opening', moves: ['b4'] },
  { eco: 'A00', name: 'Van \'t Kruijs Opening', moves: ['e3'] },
  { eco: 'A00', name: 'Mieses Opening', moves: ['d3'] },
  { eco: 'A00', name: 'Saragossa Opening', moves: ['c3'] },
  { eco: 'A01', name: 'Nimzowitsch-Larsen Attack', moves: ['b3'] },
  { eco: 'A02', name: 'Bird\'s Opening', moves: ['f4'] },
  { eco: 'A04', name: 'Réti Opening', moves: ['Nf3'] },
  { eco: 'A05', name: 'Réti: King\'s Indian Attack', moves: ['Nf3', 'Nf6', 'g3'] },
  { eco: 'A06', name: 'Réti: Nimzowitsch Variation', moves: ['Nf3', 'd5', 'b3'] },
  { eco: 'A07', name: 'King\'s Indian Attack', moves: ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2'] },
  { eco: 'A10', name: 'English Opening', moves: ['c4'] },
  { eco: 'A13', name: 'English: Agincourt Defense', moves: ['c4', 'e6'] },
  { eco: 'A15', name: 'English: Anglo-Indian Defense', moves: ['c4', 'Nf6'] },
  { eco: 'A16', name: 'English: Anglo-Indian, Queen\'s Knight', moves: ['c4', 'Nf6', 'Nc3'] },
  { eco: 'A20', name: 'English: King\'s English', moves: ['c4', 'e5'] },
  { eco: 'A22', name: 'English: Two Knights Variation', moves: ['c4', 'e5', 'Nc3', 'Nf6'] },
  { eco: 'A28', name: 'English: Four Knights System', moves: ['c4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6'] },
  { eco: 'A30', name: 'English: Symmetrical Variation', moves: ['c4', 'c5'] },
  { eco: 'A40', name: 'Queen\'s Pawn Game', moves: ['d4'] },
  { eco: 'A41', name: 'Queen\'s Pawn: Modern Defense', moves: ['d4', 'd6'] },
  { eco: 'A43', name: 'Old Benoni Defense', moves: ['d4', 'c5'] },
  { eco: 'A45', name: 'Trompowsky Attack', moves: ['d4', 'Nf6', 'Bg5'] },
  { eco: 'A46', name: 'Torre Attack', moves: ['d4', 'Nf6', 'Nf3', 'e6', 'Bg5'] },
  { eco: 'A48', name: 'London System', moves: ['d4', 'Nf6', 'Nf3', 'g6', 'Bf4'] },
  { eco: 'A46', name: 'London System (Classical)', moves: ['d4', 'd5', 'Bf4'] },
  { eco: 'A46', name: 'London System: 2.Nf3', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4'] },
  { eco: 'A51', name: 'Budapest Gambit', moves: ['d4', 'Nf6', 'c4', 'e5'] },
  { eco: 'A56', name: 'Benoni Defense', moves: ['d4', 'Nf6', 'c4', 'c5'] },
  { eco: 'A80', name: 'Dutch Defense', moves: ['d4', 'f5'] },

  // B00 - Semi-Open Games (other than French)
  { eco: 'B00', name: 'King\'s Pawn Game', moves: ['e4'] },
  { eco: 'B00', name: 'Nimzowitsch Defense', moves: ['e4', 'Nc6'] },
  { eco: 'B00', name: 'Owen\'s Defense', moves: ['e4', 'b6'] },
  { eco: 'B01', name: 'Scandinavian Defense', moves: ['e4', 'd5'] },
  { eco: 'B01', name: 'Scandinavian: Main Line', moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5'] },
  { eco: 'B01', name: 'Scandinavian: Modern Variation', moves: ['e4', 'd5', 'exd5', 'Nf6'] },
  { eco: 'B02', name: 'Alekhine\'s Defense', moves: ['e4', 'Nf6'] },
  { eco: 'B03', name: 'Alekhine: Four Pawns Attack', moves: ['e4', 'Nf6', 'e5', 'Nd5', 'd4', 'd6', 'c4', 'Nb6', 'f4'] },
  { eco: 'B06', name: 'Modern Defense', moves: ['e4', 'g6'] },
  { eco: 'B07', name: 'Pirc Defense', moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6'] },

  // B10 - Caro-Kann Defense
  { eco: 'B10', name: 'Caro-Kann Defense', moves: ['e4', 'c6'] },
  { eco: 'B12', name: 'Caro-Kann: Advance Variation', moves: ['e4', 'c6', 'd4', 'd5', 'e5'] },
  { eco: 'B12', name: 'Caro-Kann: Advance, Short Variation', moves: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2'] },
  { eco: 'B13', name: 'Caro-Kann: Exchange Variation', moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'] },
  { eco: 'B13', name: 'Caro-Kann: Panov-Botvinnik Attack', moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4'] },
  { eco: 'B15', name: 'Caro-Kann: Classical Variation', moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'] },
  { eco: 'B17', name: 'Caro-Kann: Steinitz Variation', moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nd7'] },
  { eco: 'B18', name: 'Caro-Kann: Tartakower Variation', moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nf6', 'Nxf6+', 'exf6'] },

  // B20 - Sicilian Defense
  { eco: 'B20', name: 'Sicilian Defense', moves: ['e4', 'c5'] },
  { eco: 'B20', name: 'Sicilian: Bowdler Attack', moves: ['e4', 'c5', 'Bc4'] },
  { eco: 'B21', name: 'Sicilian: Grand Prix Attack', moves: ['e4', 'c5', 'f4'] },
  { eco: 'B21', name: 'Sicilian: Smith-Morra Gambit', moves: ['e4', 'c5', 'd4', 'cxd4', 'c3'] },
  { eco: 'B22', name: 'Sicilian: Alapin Variation', moves: ['e4', 'c5', 'c3'] },
  { eco: 'B23', name: 'Sicilian: Closed', moves: ['e4', 'c5', 'Nc3'] },
  { eco: 'B27', name: 'Sicilian: Open Sicilian', moves: ['e4', 'c5', 'Nf3'] },
  { eco: 'B30', name: 'Sicilian: Old Sicilian', moves: ['e4', 'c5', 'Nf3', 'Nc6'] },
  { eco: 'B33', name: 'Sicilian: Sveshnikov Variation', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5'] },
  { eco: 'B34', name: 'Sicilian: Accelerated Dragon', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6'] },
  { eco: 'B40', name: 'Sicilian: French Variation', moves: ['e4', 'c5', 'Nf3', 'e6'] },
  { eco: 'B41', name: 'Sicilian: Kan Variation', moves: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'a6'] },
  { eco: 'B45', name: 'Sicilian: Taimanov Variation', moves: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'Nc6', 'Nc3', 'a6'] },
  { eco: 'B50', name: 'Sicilian: Classical / Modern', moves: ['e4', 'c5', 'Nf3', 'd6'] },
  { eco: 'B51', name: 'Sicilian: Moscow Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'Bb5+'] },
  { eco: 'B70', name: 'Sicilian: Dragon Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'] },
  { eco: 'B75', name: 'Sicilian: Dragon, Yugoslav Attack', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'f3'] },
  { eco: 'B90', name: 'Sicilian: Najdorf Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'] },
  { eco: 'B90', name: 'Sicilian: Najdorf, English Attack', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5', 'Nb3'] },

  // C00 - French Defense
  { eco: 'C00', name: 'French Defense', moves: ['e4', 'e6'] },
  { eco: 'C02', name: 'French: Advance Variation', moves: ['e4', 'e6', 'd4', 'd5', 'e5'] },
  { eco: 'C03', name: 'French: Tarrasch Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nd2'] },
  { eco: 'C10', name: 'French: Classical Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'] },
  { eco: 'C11', name: 'French: Steinitz Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'e5', 'Nfd7'] },
  { eco: 'C15', name: 'French: Winawer Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'] },

  // C20 - Open Games (1.e4 e5)
  { eco: 'C20', name: 'King\'s Pawn: Open Game', moves: ['e4', 'e5'] },
  { eco: 'C21', name: 'Center Game', moves: ['e4', 'e5', 'd4', 'exd4', 'Qxd4'] },
  { eco: 'C21', name: 'Danish Gambit', moves: ['e4', 'e5', 'd4', 'exd4', 'c3'] },
  { eco: 'C23', name: 'Bishop\'s Opening', moves: ['e4', 'e5', 'Bc4'] },
  { eco: 'C25', name: 'Vienna Game', moves: ['e4', 'e5', 'Nc3'] },
  { eco: 'C30', name: 'King\'s Gambit', moves: ['e4', 'e5', 'f4'] },
  { eco: 'C33', name: 'King\'s Gambit Accepted', moves: ['e4', 'e5', 'f4', 'exf4'] },
  { eco: 'C40', name: 'King\'s Knight Opening', moves: ['e4', 'e5', 'Nf3'] },
  { eco: 'C41', name: 'Philidor Defense', moves: ['e4', 'e5', 'Nf3', 'd6'] },
  { eco: 'C42', name: 'Petrov\'s Defense', moves: ['e4', 'e5', 'Nf3', 'Nf6'] },
  { eco: 'C44', name: 'Scotch Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'] },
  { eco: 'C45', name: 'Scotch: Mieses Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6'] },
  { eco: 'C46', name: 'Three Knights Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3'] },
  { eco: 'C47', name: 'Four Knights Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'] },
  { eco: 'C50', name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { eco: 'C50', name: 'Italian: Hungarian Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Be7'] },
  { eco: 'C51', name: 'Evans Gambit', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'] },
  { eco: 'C53', name: 'Italian: Giuoco Piano', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'] },
  { eco: 'C54', name: 'Italian: Giuoco Pianissimo', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3'] },
  { eco: 'C55', name: 'Two Knights Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'] },
  { eco: 'C57', name: 'Fried Liver Attack', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5', 'Nxf7'] },

  // C60 - Ruy Lopez
  { eco: 'C60', name: 'Ruy Lopez', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { eco: 'C65', name: 'Ruy Lopez: Berlin Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'] },
  { eco: 'C68', name: 'Ruy Lopez: Exchange Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'] },
  { eco: 'C70', name: 'Ruy Lopez: Morphy Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4'] },
  { eco: 'C78', name: 'Ruy Lopez: Archangelsk Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'b5', 'Bb3', 'Bb7'] },
  { eco: 'C84', name: 'Ruy Lopez: Closed', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'] },
  { eco: 'C88', name: 'Ruy Lopez: Marshall Attack', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'O-O', 'c3', 'd5'] },

  // D00 - Closed Games (1.d4 d5)
  { eco: 'D00', name: 'Queen\'s Pawn Game: Mason Attack', moves: ['d4', 'd5', 'Bf4'] },
  { eco: 'D02', name: 'Queen\'s Pawn Game: London System', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'c5', 'e3'] },
  { eco: 'D06', name: 'Queen\'s Gambit', moves: ['d4', 'd5', 'c4'] },
  { eco: 'D08', name: 'Albin Counter-Gambit', moves: ['d4', 'd5', 'c4', 'e5'] },
  { eco: 'D10', name: 'Slav Defense', moves: ['d4', 'd5', 'c4', 'c6'] },
  { eco: 'D11', name: 'Slav: Quiet Variation', moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'e3'] },
  { eco: 'D15', name: 'Slav: Modern Line', moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4'] },
  { eco: 'D20', name: 'Queen\'s Gambit Accepted', moves: ['d4', 'd5', 'c4', 'dxc4'] },
  { eco: 'D30', name: 'Queen\'s Gambit Declined', moves: ['d4', 'd5', 'c4', 'e6'] },
  { eco: 'D35', name: 'QGD: Exchange Variation', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'cxd5', 'exd5'] },
  { eco: 'D37', name: 'QGD: Classical Defense', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'Be7', 'Bf4'] },
  { eco: 'D43', name: 'Semi-Slav Defense', moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6'] },
  { eco: 'D45', name: 'Semi-Slav: Stoltz Variation', moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6', 'e3', 'Nbd7'] },
  { eco: 'D80', name: 'Grünfeld Defense', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'] },
  { eco: 'D85', name: 'Grünfeld: Exchange Variation', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5', 'e4', 'Nxc3', 'bxc3'] },

  // E00 - Indian Defenses
  { eco: 'E00', name: 'Catalan Opening', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3'] },
  { eco: 'E06', name: 'Catalan: Closed', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'Be7', 'Nf3', 'O-O'] },
  { eco: 'E12', name: 'Queen\'s Indian Defense', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'] },
  { eco: 'E20', name: 'Nimzo-Indian Defense', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'] },
  { eco: 'E32', name: 'Nimzo-Indian: Classical', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Qc2'] },
  { eco: 'E40', name: 'Nimzo-Indian: Rubinstein System', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3'] },
  { eco: 'E60', name: 'King\'s Indian Defense', moves: ['d4', 'Nf6', 'c4', 'g6'] },
  { eco: 'E61', name: 'King\'s Indian: Normal Line', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'] },
  { eco: 'E70', name: 'King\'s Indian: Classical System', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'] },
  { eco: 'E97', name: 'King\'s Indian: Mar del Plata Variation', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O', 'Nc6', 'd5', 'Ne7'] },
];

/**
 * Normalizes a list of SAN moves for comparison
 */
export function normalizeSanList(sans) {
  if (!sans || !sans.length) return [];
  return sans.map(s => s.replace(/[+#?!]/g, ''));
}

/**
 * Normalizes a FEN to board placement, side to move, castling, and en-passant
 */
export function getBoardFenKey(fen) {
  if (!fen) return '';
  return fen.split(' ').slice(0, 4).join(' ');
}

// Lazy-initialized transposition index
let transpositionIndex = null;

function buildTranspositionIndex() {
  if (transpositionIndex) return transpositionIndex;
  transpositionIndex = new Map();

  for (const entry of OPENINGS_DATA) {
    const c = new Chess();
    for (let ply = 0; ply < entry.moves.length; ply++) {
      try {
        const move = c.move(entry.moves[ply]);
        if (!move) break;
        const key = getBoardFenKey(c.fen());
        const existing = transpositionIndex.get(key);
        // If not already registered or this line is deeper/more specific, store it
        if (!existing || existing.ply < ply + 1) {
          transpositionIndex.set(key, {
            opening: entry,
            ply: ply + 1,
            nextBookMove: entry.moves[ply + 1] || null
          });
        }
      } catch (e) {
        break;
      }
    }
  }

  return transpositionIndex;
}

/**
 * Matches an array of played SAN moves and/or current FEN against the opening database.
 * Supports exact move orders, theoretical transpositions, candidate next moves, and departure ply.
 */
export function identifyOpening(playedSans = [], currentFen = null) {
  if ((!playedSans || playedSans.length === 0) && !currentFen) {
    return {
      opening: null,
      isBookMove: false,
      bookMoves: ['e4', 'd4', 'c4', 'Nf3', 'g3', 'b3', 'f4'],
      eco: '',
      name: 'Initial Position',
      continuation: [],
      bookDeparturePly: 0
    };
  }

  const cleanPlayed = normalizeSanList(playedSans);

  // 1. Check FEN transposition index if FEN is available
  if (currentFen) {
    const index = buildTranspositionIndex();
    const fenKey = getBoardFenKey(currentFen);
    const transMatch = index.get(fenKey);
    if (transMatch) {
      const entry = transMatch.opening;
      return {
        opening: entry,
        eco: entry.eco,
        name: entry.name,
        isBookMove: true,
        bookMoves: transMatch.nextBookMove ? [transMatch.nextBookMove] : [],
        totalBookMovesCount: entry.moves.length,
        bookDeparturePly: transMatch.ply
      };
    }
  }

  // 2. Exact or prefix match from initial position
  const candidateNextMoves = new Set();
  let exactOrPrefixMatch = null;
  let maxReachedLen = -1;
  let deepestFutureMatch = null;
  let maxFutureLen = -1;

  for (const entry of OPENINGS_DATA) {
    const cleanEntryMoves = normalizeSanList(entry.moves);
    
    let matches = true;
    const minLen = Math.min(cleanPlayed.length, cleanEntryMoves.length);
    for (let i = 0; i < minLen; i++) {
      if (cleanPlayed[i] !== cleanEntryMoves[i]) {
        matches = false;
        break;
      }
    }

    if (!matches) continue;

    if (cleanEntryMoves.length <= cleanPlayed.length) {
      if (cleanEntryMoves.length > maxReachedLen) {
        maxReachedLen = cleanEntryMoves.length;
        exactOrPrefixMatch = entry;
      }
    } else {
      if (cleanEntryMoves.length > maxFutureLen) {
        maxFutureLen = cleanEntryMoves.length;
        deepestFutureMatch = entry;
      }
      candidateNextMoves.add(cleanEntryMoves[cleanPlayed.length]);
    }
  }

  const bestMatch = exactOrPrefixMatch || deepestFutureMatch;
  const isBookMove = candidateNextMoves.size > 0 || (bestMatch && cleanPlayed.length <= bestMatch.moves.length);
  const bookDeparturePly = isBookMove ? cleanPlayed.length : (exactOrPrefixMatch ? exactOrPrefixMatch.moves.length : 0);

  return {
    opening: bestMatch,
    eco: bestMatch ? bestMatch.eco : '',
    name: bestMatch ? bestMatch.name : 'Unorthodox / Out of Book',
    isBookMove: Boolean(isBookMove),
    bookMoves: Array.from(candidateNextMoves),
    totalBookMovesCount: bestMatch ? bestMatch.moves.length : 0,
    bookDeparturePly
  };
}

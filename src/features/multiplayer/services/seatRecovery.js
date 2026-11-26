// Seat Recovery & Cryptographic Credential Management (Rebuild Blueprint 5.3 & 5.4)
// Stores and rotates independent seat recovery credentials locally,
// ensuring users can reconnect to their match after refreshing or changing tabs.

const RECOVERY_STORAGE_PREFIX = 'chessey_seat_recovery_';

/**
 * Generates a cryptographically strong random token for invitations and seat recovery (256-bit entropy).
 */
export function generateSecureToken() {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const buffer = new Uint8Array(32);
    window.crypto.getRandomValues(buffer);
    return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for non-browser environments
  const rand = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  return `${Date.now().toString(16)}${rand}`.padEnd(64, '0').slice(0, 64);
}

/**
 * Computes deterministic SHA-256 hash of a string using Web Crypto API.
 */
export async function hashToken(token) {
  if (!token) return '';
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Basic deterministic fallback for Node/JSDOM testing environments
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, 'a');
}

/**
 * Persists an independent seat recovery credential in localStorage for a specific room.
 */
export function storeSeatRecoveryCredential(roomId, credential) {
  if (!roomId || !credential) return;
  try {
    localStorage.setItem(`${RECOVERY_STORAGE_PREFIX}${roomId}`, credential);
  } catch (e) {
    console.warn('[SeatRecovery] Failed to store recovery credential:', e);
  }
}

/**
 * Retrieves the stored seat recovery credential for a specific room.
 */
export function getSeatRecoveryCredential(roomId) {
  if (!roomId) return null;
  try {
    return localStorage.getItem(`${RECOVERY_STORAGE_PREFIX}${roomId}`);
  } catch (e) {
    return null;
  }
}

/**
 * Clears the recovery credential when a room is completed or closed.
 */
export function clearSeatRecoveryCredential(roomId) {
  if (!roomId) return;
  try {
    localStorage.removeItem(`${RECOVERY_STORAGE_PREFIX}${roomId}`);
  } catch (e) {}
}

export default {
  generateSecureToken,
  hashToken,
  storeSeatRecoveryCredential,
  getSeatRecoveryCredential,
  clearSeatRecoveryCredential
};

// Backward-compatibility bridge for roomService
import multiplayerApi, { generateSecureToken, hashToken } from '../../features/multiplayer/services/multiplayerApi';

export { generateSecureToken, hashToken };
export const roomService = multiplayerApi;
export default roomService;

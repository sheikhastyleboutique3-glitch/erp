import { io, Socket } from 'socket.io-client';

/**
 * Connect to the KDS real-time namespace and invoke `onUpdate` whenever the
 * kitchen board changes for the given branch. Returns a disconnect function.
 * Socket failures are silent — the KDS page keeps its polling fallback.
 */
export function connectKds(branchId: number | undefined, onUpdate: () => void): () => void {
  let socket: Socket | null = null;
  try {
    socket = io('/kds', { path: '/socket.io', transports: ['websocket', 'polling'], reconnection: true });
    socket.on('connect', () => {
      if (branchId != null) socket?.emit('join_branch', { branchId });
    });
    socket.on('kds_update', () => onUpdate());
  } catch {
    /* ignore — polling fallback remains active */
  }
  return () => {
    try {
      socket?.off('kds_update');
      socket?.disconnect();
    } catch {
      /* ignore */
    }
  };
}

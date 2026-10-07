import { io } from 'socket.io-client';
import Cookies from 'js-cookie';

let socket = null;

export function getSocket() {
  if (typeof window === 'undefined') return null;

  if (!socket || socket.disconnected) {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '') || 'http://localhost:5000';
    const token = Cookies.get('accessToken');

    socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('[Real-time] Connected to SwachhaNet WebSocket server:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Real-time] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('[Real-time] Connection warning:', err.message);
    });
  }

  return socket;
}

export function subscribeToWard(wardId) {
  const s = getSocket();
  if (s && wardId) {
    s.emit('join:ward', wardId);
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

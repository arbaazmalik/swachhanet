const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../utils/logger');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // JWT Authentication middleware for socket connections
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        // Allow anonymous connection if needed, but flag unauthenticated
        socket.user = null;
        return next();
      }

      const decoded = jwt.verify(token, env.JWT_SECRET || 'fallback_secret_123');
      socket.user = decoded;
      next();
    } catch (err) {
      logger.warn(`Socket auth failed: ${err.message}`);
      socket.user = null;
      next();
    }
  });

  io.on('connection', (socket) => {
    if (socket.user) {
      const { userId, role, wardId } = socket.user;
      socket.join(`user:${userId}`);
      socket.join(`role:${role}`);

      if (wardId) {
        socket.join(`ward:${wardId}`);
      }

      if (role === 'admin') {
        socket.join('role:admin');
      }

      logger.info(`Socket connected: user=${userId} role=${role} ward=${wardId || 'none'}`);
    } else {
      logger.info(`Anonymous socket connected: id=${socket.id}`);
    }

    // Client can join a ward room if authorized
    socket.on('join:ward', (wardId) => {
      if (socket.user) {
        const { role, wardId: userWardId } = socket.user;
        if (role === 'admin' || (role === 'authority' && String(userWardId) === String(wardId))) {
          socket.join(`ward:${wardId}`);
          logger.info(`Socket [${socket.id}] joined ward:${wardId}`);
        }
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: id=${socket.id} reason=${reason}`);
    });
  });

  logger.info('Socket.IO real-time server initialized.');
  return io;
}

function getIO() {
  return io;
}

// Typed Event Emitters respecting Ward Scoping & RBAC
function emitComplaintCreated(complaint) {
  if (!io) return;
  const payload = {
    event: 'complaint.created',
    complaint,
    timestamp: new Date().toISOString(),
  };

  if (complaint.wardId) {
    io.to(`ward:${complaint.wardId}`).emit('complaint.created', payload);
  }
  io.to('role:admin').emit('complaint.created', payload);
}

function emitComplaintUpdated(complaint) {
  if (!io) return;
  const payload = {
    event: 'complaint.updated',
    complaint,
    timestamp: new Date().toISOString(),
  };

  if (complaint.userId) {
    io.to(`user:${complaint.userId}`).emit('complaint.updated', payload);
  }
  if (complaint.wardId) {
    io.to(`ward:${complaint.wardId}`).emit('complaint.updated', payload);
  }
  io.to('role:admin').emit('complaint.updated', payload);
}

function emitComplaintStatusChanged(complaint) {
  if (!io) return;
  const payload = {
    event: 'complaint.status_changed',
    complaint,
    timestamp: new Date().toISOString(),
  };

  if (complaint.userId) {
    io.to(`user:${complaint.userId}`).emit('complaint.status_changed', payload);
  }
  if (complaint.wardId) {
    io.to(`ward:${complaint.wardId}`).emit('complaint.status_changed', payload);
  }
  io.to('role:admin').emit('complaint.status_changed', payload);
}

function emitComplaintAssigned(complaint, worker) {
  if (!io) return;
  const payload = {
    event: 'complaint.assigned',
    complaint,
    worker,
    timestamp: new Date().toISOString(),
  };

  if (complaint.userId) {
    io.to(`user:${complaint.userId}`).emit('complaint.assigned', payload);
  }
  if (worker && worker._id) {
    io.to(`user:${worker.userId || worker._id}`).emit('complaint.assigned', payload);
  }
  if (complaint.wardId) {
    io.to(`ward:${complaint.wardId}`).emit('complaint.assigned', payload);
  }
  io.to('role:admin').emit('complaint.assigned', payload);
}

function emitWorkerLocation(worker) {
  if (!io) return;
  const payload = {
    event: 'worker.location_updated',
    workerId: worker._id,
    currentLocation: worker.currentLocation,
    status: worker.status,
    timestamp: new Date().toISOString(),
  };

  if (worker.wardId) {
    io.to(`ward:${worker.wardId}`).emit('worker.location_updated', payload);
  }
  io.to('role:admin').emit('worker.location_updated', payload);
}

function emitWorkerStatus(worker) {
  if (!io) return;
  const payload = {
    event: 'worker.status_changed',
    workerId: worker._id,
    status: worker.status,
    timestamp: new Date().toISOString(),
  };

  if (worker.wardId) {
    io.to(`ward:${worker.wardId}`).emit('worker.status_changed', payload);
  }
  io.to('role:admin').emit('worker.status_changed', payload);
}

function emitHotspotUpdated(hotspot) {
  if (!io) return;
  const payload = {
    event: 'hotspot.updated',
    hotspot,
    timestamp: new Date().toISOString(),
  };

  if (hotspot.wardId) {
    io.to(`ward:${hotspot.wardId}`).emit('hotspot.updated', payload);
  }
  io.to('role:admin').emit('hotspot.updated', payload);
}

function emitNotification(userId, notification) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit('notification.created', {
    event: 'notification.created',
    notification,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  initSocket,
  getIO,
  emitComplaintCreated,
  emitComplaintUpdated,
  emitComplaintStatusChanged,
  emitComplaintAssigned,
  emitWorkerLocation,
  emitWorkerStatus,
  emitHotspotUpdated,
  emitNotification,
};

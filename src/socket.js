'use strict';

const { messages, rooms } = require('./db');
const { v4: uuidv4 } = require('uuid');

/**
 * Attach Socket.io event handlers.
 * @param {import('socket.io').Server} io
 */
function attachSocket(io) {
  io.on('connection', (socket) => {
    const username = socket.handshake.auth.username || 'Anonymous';

    socket.on('join_room', (roomId) => {
      if (!rooms.has(roomId)) return;
      socket.join(roomId);
      socket.to(roomId).emit('user_joined', { username, roomId });
    });

    socket.on('leave_room', (roomId) => {
      socket.leave(roomId);
      socket.to(roomId).emit('user_left', { username, roomId });
    });

    socket.on('send_message', ({ roomId, text }) => {
      if (!rooms.has(roomId) || !text || !text.trim()) return;
      const msg = {
        id: uuidv4(),
        username,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      };
      const roomMessages = messages.get(roomId) || [];
      roomMessages.push(msg);
      messages.set(roomId, roomMessages);
      io.to(roomId).emit('new_message', { ...msg, roomId });
    });

    socket.on('typing', ({ roomId }) => {
      socket.to(roomId).emit('user_typing', { username, roomId });
    });
  });
}

module.exports = { attachSocket };

'use strict';

// In-memory data store (no external DB dependency)
const users = new Map();       // username -> { username, passwordHash, field, bio, createdAt }
const rooms = new Map();       // roomId -> { id, name, description, createdBy, createdAt }
const messages = new Map();    // roomId -> [{ id, username, text, createdAt }]
const ideas = [];              // [{ id, username, title, body, tags, createdAt, likes }]

// Seed default rooms
const defaultRooms = [
  { id: 'general', name: 'General', description: 'General discussion for all researchers' },
  { id: 'biology', name: 'Biology', description: 'Biology & life sciences research' },
  { id: 'cs', name: 'Computer Science', description: 'CS, AI & data science research' },
  { id: 'physics', name: 'Physics', description: 'Physics & astronomy research' },
  { id: 'social', name: 'Social Sciences', description: 'Sociology, psychology & related fields' },
];

defaultRooms.forEach(r => {
  rooms.set(r.id, { ...r, createdBy: 'system', createdAt: new Date().toISOString() });
  messages.set(r.id, []);
});

module.exports = { users, rooms, messages, ideas };

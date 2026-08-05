'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { users, rooms, messages, ideas } = require('./db');

const router = express.Router();

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const { username, password, field, bio } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (users.has(username)) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  users.set(username, { username, passwordHash, field: field || '', bio: bio || '', createdAt: new Date().toISOString() });
  req.session.username = username;
  res.status(201).json({ username, field: field || '', bio: bio || '' });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.get(username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.username = username;
  res.json({ username, field: user.field, bio: user.bio });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: 'Not authenticated' });
  const user = users.get(req.session.username);
  res.json({ username: user.username, field: user.field, bio: user.bio });
});

// ─── Rooms ────────────────────────────────────────────────────────────────────

router.get('/rooms', (req, res) => {
  res.json([...rooms.values()]);
});

router.post('/rooms', (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: 'Not authenticated' });
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Room name is required' });
  const id = uuidv4();
  const room = { id, name, description: description || '', createdBy: req.session.username, createdAt: new Date().toISOString() };
  rooms.set(id, room);
  messages.set(id, []);
  res.status(201).json(room);
});

// ─── Messages ─────────────────────────────────────────────────────────────────

router.get('/rooms/:roomId/messages', (req, res) => {
  const { roomId } = req.params;
  if (!rooms.has(roomId)) return res.status(404).json({ error: 'Room not found' });
  res.json(messages.get(roomId) || []);
});

// ─── Ideas ────────────────────────────────────────────────────────────────────

router.get('/ideas', (req, res) => {
  res.json([...ideas].reverse());
});

router.post('/ideas', (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: 'Not authenticated' });
  const { title, body, tags } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
  const idea = {
    id: uuidv4(),
    username: req.session.username,
    title,
    body,
    tags: Array.isArray(tags) ? tags : [],
    createdAt: new Date().toISOString(),
    likes: 0,
    likedBy: [],
  };
  ideas.push(idea);
  res.status(201).json(idea);
});

router.post('/ideas/:id/like', (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: 'Not authenticated' });
  const idea = ideas.find(i => i.id === req.params.id);
  if (!idea) return res.status(404).json({ error: 'Idea not found' });
  if (idea.likedBy.includes(req.session.username)) {
    return res.status(409).json({ error: 'Already liked' });
  }
  idea.likes += 1;
  idea.likedBy.push(req.session.username);
  res.json({ likes: idea.likes });
});

module.exports = router;

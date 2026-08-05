'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');

let app, server;

// Helper: create an agent with a valid CSRF token for state-changing requests
async function makeAgent() {
  const agent = request.agent(app);
  const res = await agent.get('/api/csrf-token');
  agent._csrfToken = res.body.csrfToken;
  return agent;
}

// Wrap POST/PATCH/DELETE to inject CSRF header automatically
function post(agent, path, body) {
  return agent
    .post(path)
    .set('x-csrf-token', agent._csrfToken)
    .send(body);
}

beforeAll(() => {
  ({ app, server } = createApp());
});

afterAll((done) => {
  server.close(() => done());
});

describe('Health & static', () => {
  test('GET / returns HTML', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Budding Researchers');
  });
});

describe('Auth API', () => {
  test('GET /api/me returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  test('POST /api/register creates a user', async () => {
    const agent = await makeAgent();
    const res = await post(agent, '/api/register', { username: 'alice', password: 'pass123', field: 'Biology' });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('alice');
    expect(res.body.field).toBe('Biology');
  });

  test('POST /api/register with duplicate username returns 409', async () => {
    const agent = await makeAgent();
    await post(agent, '/api/register', { username: 'bob', password: 'pass123' });
    const res = await post(agent, '/api/register', { username: 'bob', password: 'other' });
    expect(res.status).toBe(409);
  });

  test('POST /api/register with missing fields returns 400', async () => {
    const agent = await makeAgent();
    const res = await post(agent, '/api/register', { username: 'nopass' });
    expect(res.status).toBe(400);
  });

  test('POST /api/login with wrong password returns 401', async () => {
    const agent = await makeAgent();
    const res = await post(agent, '/api/login', { username: 'alice', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('POST /api/login with correct credentials returns user', async () => {
    const agent = await makeAgent();
    await post(agent, '/api/register', { username: 'alice2', password: 'pass123' });
    const res = await post(agent, '/api/login', { username: 'alice2', password: 'pass123' });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('alice2');
  });
});

describe('Rooms API', () => {
  test('GET /api/rooms returns default rooms', async () => {
    const res = await request(app).get('/api/rooms');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('name');
  });

  test('POST /api/rooms requires auth', async () => {
    const agent = await makeAgent();
    const res = await post(agent, '/api/rooms', { name: 'Test Room' });
    expect(res.status).toBe(401);
  });

  test('POST /api/rooms creates a room when authenticated', async () => {
    const agent = await makeAgent();
    await post(agent, '/api/register', { username: 'carol', password: 'pass123' });
    const res = await post(agent, '/api/rooms', { name: 'Quantum Physics', description: 'Q stuff' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Quantum Physics');
    expect(res.body).toHaveProperty('id');
  });

  test('POST /api/rooms without name returns 400', async () => {
    const agent = await makeAgent();
    await post(agent, '/api/register', { username: 'dave', password: 'pass123' });
    const res = await post(agent, '/api/rooms', { description: 'no name' });
    expect(res.status).toBe(400);
  });
});

describe('Messages API', () => {
  test('GET /api/rooms/:roomId/messages returns messages array', async () => {
    const roomsRes = await request(app).get('/api/rooms');
    const roomId = roomsRes.body[0].id;
    const res = await request(app).get(`/api/rooms/${roomId}/messages`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/rooms/nonexistent/messages returns 404', async () => {
    const res = await request(app).get('/api/rooms/nonexistent/messages');
    expect(res.status).toBe(404);
  });
});

describe('Ideas API', () => {
  test('GET /api/ideas returns array', async () => {
    const res = await request(app).get('/api/ideas');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/ideas requires auth', async () => {
    const agent = await makeAgent();
    const res = await post(agent, '/api/ideas', { title: 'Test', body: 'Body' });
    expect(res.status).toBe(401);
  });

  test('POST /api/ideas creates an idea when authenticated', async () => {
    const agent = await makeAgent();
    await post(agent, '/api/register', { username: 'eve', password: 'pass123' });
    const res = await post(agent, '/api/ideas', { title: 'ML in Ecology', body: 'Using ML to track species', tags: ['ML', 'ecology'] });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('ML in Ecology');
    expect(res.body.tags).toEqual(['ML', 'ecology']);
    expect(res.body.likes).toBe(0);
  });

  test('POST /api/ideas/:id/like increments likes', async () => {
    const agent = await makeAgent();
    await post(agent, '/api/register', { username: 'frank', password: 'pass123' });
    const ideaRes = await post(agent, '/api/ideas', { title: 'Idea X', body: 'Body X' });
    const id = ideaRes.body.id;
    const likeRes = await post(agent, `/api/ideas/${id}/like`, {});
    expect(likeRes.status).toBe(200);
    expect(likeRes.body.likes).toBe(1);
  });

  test('POST /api/ideas/:id/like twice returns 409', async () => {
    const agent = await makeAgent();
    await post(agent, '/api/register', { username: 'grace', password: 'pass123' });
    const ideaRes = await post(agent, '/api/ideas', { title: 'Idea Y', body: 'Body Y' });
    const id = ideaRes.body.id;
    await post(agent, `/api/ideas/${id}/like`, {});
    const res = await post(agent, `/api/ideas/${id}/like`, {});
    expect(res.status).toBe(409);
  });
});

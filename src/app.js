'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const routes = require('./routes');
const { attachSocket } = require('./socket');

function createApp() {
  const app = express();
  const server = http.createServer(app);

  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'researchers-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
  });

  app.use(sessionMiddleware);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api', routes);

  const io = new Server(server);

  // Share session with Socket.io
  io.engine.use(sessionMiddleware);

  attachSocket(io);

  return { app, server };
}

module.exports = { createApp };

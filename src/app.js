'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const Csrf = require('csrf');
const path = require('path');
const routes = require('./routes');
const { attachSocket } = require('./socket');

const isProd = process.env.NODE_ENV === 'production';
const tokens = new Csrf();

function createApp() {
  const app = express();
  const server = http.createServer(app);

  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'researchers-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    },
  });

  app.use(sessionMiddleware);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Ensure each session has a CSRF secret
  app.use((req, _res, next) => {
    if (!req.session.csrfSecret) {
      tokens.secret((err, secret) => {
        if (err) return next(err);
        req.session.csrfSecret = secret;
        next();
      });
    } else {
      next();
    }
  });

  // Expose a CSRF token endpoint (GET is safe — no state change)
  app.get('/api/csrf-token', (req, res) => {
    const csrfToken = tokens.create(req.session.csrfSecret);
    res.json({ csrfToken });
  });

  // Middleware to verify CSRF token on state-changing requests
  function csrfProtection(req, res, next) {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) return next();
    const token = req.headers['x-csrf-token'] || (req.body && req.body._csrf);
    if (!token || !req.session.csrfSecret || !tokens.verify(req.session.csrfSecret, token)) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    next();
  }

  app.use('/api', csrfProtection, routes);

  const io = new Server(server);

  // Share session with Socket.io
  io.engine.use(sessionMiddleware);

  attachSocket(io);

  return { app, server };
}

module.exports = { createApp };

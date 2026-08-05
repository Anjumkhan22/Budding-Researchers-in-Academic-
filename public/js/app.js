'use strict';

/* ── State ─────────────────────────────────────────────── */
let currentUser = null;
let currentRoom = null;
let socket = null;
let typingTimer = null;
let activePanel = 'chat';
let csrfToken = null;

/* ── DOM helpers ───────────────────────────────────────── */
const $ = id => document.getElementById(id);
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');

/* ── CSRF token fetch ──────────────────────────────────── */
async function refreshCsrf() {
  const res = await fetch('/api/csrf-token', { credentials: 'include' });
  const data = await res.json();
  csrfToken = data.csrfToken;
  return csrfToken;
}

/* ── API helpers ───────────────────────────────────────── */
async function api(method, path, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = csrfToken;
  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ── Auth ──────────────────────────────────────────────── */
$('show-register').addEventListener('click', () => { hide($('login-card')); show($('register-card')); });
$('show-login').addEventListener('click', () => { hide($('register-card')); show($('login-card')); });

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('login-error');
  hide(err);
  try {
    const user = await api('POST', '/login', {
      username: $('login-username').value.trim(),
      password: $('login-password').value,
    });
    initApp(user);
  } catch (ex) {
    err.textContent = ex.message;
    show(err);
  }
});

$('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('register-error');
  hide(err);
  if ($('reg-password').value.length < 6) {
    err.textContent = 'Password must be at least 6 characters';
    show(err);
    return;
  }
  try {
    const user = await api('POST', '/register', {
      username: $('reg-username').value.trim(),
      password: $('reg-password').value,
      field: $('reg-field').value.trim(),
      bio: $('reg-bio').value.trim(),
    });
    initApp(user);
  } catch (ex) {
    err.textContent = ex.message;
    show(err);
  }
});

$('logout-btn').addEventListener('click', async () => {
  await api('POST', '/logout').catch(() => {});
  location.reload();
});

/* ── Init app after login ──────────────────────────────── */
function initApp(user) {
  currentUser = user;
  hide($('auth-screen'));
  show($('app-screen'));
  $('sidebar-username').textContent = `👤 ${user.username}${user.field ? ' · ' + user.field : ''}`;

  connectSocket(user.username);
  loadRooms();
  setupNav();
}

/* ── Socket.io ─────────────────────────────────────────── */
function connectSocket(username) {
  socket = io({ auth: { username } });

  socket.on('new_message', (msg) => {
    if (msg.roomId === currentRoom) appendMessage(msg);
  });

  socket.on('user_joined', ({ username: u }) => {
    appendSystemMsg(`${u} joined`);
  });

  socket.on('user_left', ({ username: u }) => {
    appendSystemMsg(`${u} left`);
  });

  socket.on('user_typing', ({ username: u }) => {
    $('typing-indicator').textContent = `${u} is typing…`;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { $('typing-indicator').textContent = ''; }, 2000);
  });
}

/* ── Nav tabs ──────────────────────────────────────────── */
function setupNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activePanel = tab.dataset.panel;

      if (activePanel === 'chat') {
        show($('rooms-panel'));
        hide($('ideas-panel'));
        hide($('ideas-view'));
        if (currentRoom) {
          show($('chat-view'));
          hide($('welcome-view'));
        } else {
          show($('welcome-view'));
          hide($('chat-view'));
        }
      } else {
        hide($('rooms-panel'));
        show($('ideas-panel'));
        hide($('chat-view'));
        hide($('welcome-view'));
        show($('ideas-view'));
        loadIdeas();
      }
    });
  });
}

/* ── Rooms ─────────────────────────────────────────────── */
async function loadRooms() {
  const rooms = await api('GET', '/rooms');
  const list = $('rooms-list');
  list.innerHTML = '';
  rooms.forEach(room => {
    const el = document.createElement('div');
    el.className = 'room-item';
    el.dataset.id = room.id;
    el.innerHTML = `<span class="room-icon">#</span><span>${room.name}</span>`;
    el.addEventListener('click', () => joinRoom(room));
    list.appendChild(el);
  });
}

function joinRoom(room) {
  if (currentRoom) socket.emit('leave_room', currentRoom);
  currentRoom = room.id;
  socket.emit('join_room', room.id);

  document.querySelectorAll('.room-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === room.id);
  });

  $('room-name').textContent = '# ' + room.name;
  $('room-desc').textContent = room.description;
  $('messages-area').innerHTML = '';

  hide($('welcome-view'));
  hide($('ideas-view'));
  show($('chat-view'));

  // Load history
  api('GET', `/rooms/${room.id}/messages`).then(msgs => {
    msgs.forEach(m => appendMessage(m));
    scrollToBottom();
  });
}

/* ── Messages ──────────────────────────────────────────── */
function appendMessage(msg) {
  const area = $('messages-area');
  const isOwn = msg.username === currentUser.username;
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble' + (isOwn ? ' own' : '');
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  bubble.innerHTML = `<div class="msg-meta">${isOwn ? 'You' : msg.username} · ${time}</div>${escapeHtml(msg.text)}`;
  area.appendChild(bubble);
  scrollToBottom();
}

function appendSystemMsg(text) {
  const area = $('messages-area');
  const el = document.createElement('div');
  el.style.cssText = 'text-align:center;font-size:.78rem;color:var(--muted);padding:.25rem';
  el.textContent = text;
  area.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  const area = $('messages-area');
  area.scrollTop = area.scrollHeight;
}

$('send-btn').addEventListener('click', sendMessage);
$('msg-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
$('msg-input').addEventListener('input', () => {
  if (currentRoom) socket.emit('typing', { roomId: currentRoom });
});

function sendMessage() {
  const text = $('msg-input').value.trim();
  if (!text || !currentRoom) return;
  socket.emit('send_message', { roomId: currentRoom, text });
  $('msg-input').value = '';
}

/* ── New room modal ────────────────────────────────────── */
$('new-room-btn').addEventListener('click', () => { show($('new-room-modal')); });
$('cancel-room-btn').addEventListener('click', () => { hide($('new-room-modal')); });

$('create-room-btn').addEventListener('click', async () => {
  const err = $('room-error');
  hide(err);
  try {
    const room = await api('POST', '/rooms', {
      name: $('new-room-name').value.trim(),
      description: $('new-room-desc').value.trim(),
    });
    hide($('new-room-modal'));
    $('new-room-name').value = '';
    $('new-room-desc').value = '';
    await loadRooms();
    joinRoom(room);
  } catch (ex) {
    err.textContent = ex.message;
    show(err);
  }
});

/* ── Ideas board ───────────────────────────────────────── */
async function loadIdeas() {
  const ideas = await api('GET', '/ideas');
  const board = $('ideas-board');
  board.innerHTML = '';
  if (ideas.length === 0) {
    board.innerHTML = '<p style="text-align:center;color:var(--muted);margin-top:3rem">No ideas yet — be the first to share one!</p>';
    return;
  }
  ideas.forEach(idea => board.appendChild(renderIdeaCard(idea)));
}

function renderIdeaCard(idea) {
  const card = document.createElement('div');
  card.className = 'idea-card';
  card.dataset.id = idea.id;
  const tags = idea.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ');
  const liked = idea.likedBy && idea.likedBy.includes(currentUser.username);
  card.innerHTML = `
    <h4>${escapeHtml(idea.title)}</h4>
    <p>${escapeHtml(idea.body)}</p>
    <div class="idea-meta">
      <span>by <strong>${escapeHtml(idea.username)}</strong></span>
      <span>${new Date(idea.createdAt).toLocaleDateString()}</span>
      ${tags}
      <button class="like-btn ${liked ? 'liked' : ''}" data-id="${idea.id}">
        ❤️ <span class="like-count">${idea.likes}</span>
      </button>
    </div>
  `;
  card.querySelector('.like-btn').addEventListener('click', async function () {
    try {
      const res = await api('POST', `/ideas/${idea.id}/like`);
      this.classList.add('liked');
      this.querySelector('.like-count').textContent = res.likes;
      idea.likes = res.likes;
    } catch { /* already liked or error */ }
  });
  return card;
}

$('new-idea-btn').addEventListener('click', () => { show($('new-idea-modal')); });
$('cancel-idea-btn').addEventListener('click', () => { hide($('new-idea-modal')); });

$('submit-idea-btn').addEventListener('click', async () => {
  const err = $('idea-error');
  hide(err);
  try {
    const tags = $('idea-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    await api('POST', '/ideas', {
      title: $('idea-title').value.trim(),
      body: $('idea-body').value.trim(),
      tags,
    });
    hide($('new-idea-modal'));
    $('idea-title').value = '';
    $('idea-body').value = '';
    $('idea-tags').value = '';
    loadIdeas();
  } catch (ex) {
    err.textContent = ex.message;
    show(err);
  }
});

/* ── Utils ─────────────────────────────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* ── Check existing session ────────────────────────────── */
(async () => {
  await refreshCsrf();
  try {
    const user = await api('GET', '/me');
    initApp(user);
  } catch { /* not logged in, stay on auth screen */ }
})();

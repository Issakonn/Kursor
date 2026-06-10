/* ============================================================
   KURSOR — API-клиент (заменяет localStorage-Storage).
   ============================================================ */
(function () {
  const TOKEN_KEY = 'kursor_jwt';
  const USER_KEY = 'kursor_user_cache';

  async function request(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const resp = await fetch(url, {
      method, headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (resp.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (!location.pathname.endsWith('/index.html') && location.pathname !== '/') {
        location.href = '/index.html';
      }
      throw new Error('Не авторизован');
    }
    let data = null;
    try { data = await resp.json(); } catch {}
    if (!resp.ok) {
      const msg = (data && data.error) ? data.error : `Ошибка ${resp.status}`;
      throw new Error(msg);
    }
    return data;
  }

  const API_ = {
    get: (u) => request('GET', u),
    post: (u, b) => request('POST', u, b),
    put: (u, b) => request('PUT', u, b),
    del: (u) => request('DELETE', u),
  };

  async function login(loginStr, password) {
    const { token, user } = await API_.post('/api/auth/login', { login: loginStr, password });
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY); }

  function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  }

  async function refreshCurrentUser() {
    const { user } = await API_.get('/api/auth/me');
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  let _modules = null, _tasks = null, _users = null;
  async function getModules(force = false) {
    if (!_modules || force) _modules = await API_.get('/api/modules');
    return _modules;
  }
  async function getTasks(force = false) {
    if (!_tasks || force) _tasks = await API_.get('/api/tasks');
    return _tasks;
  }
  async function getUsers(force = false) {
    if (!_users || force) _users = await API_.get('/api/users');
    return _users;
  }
  async function getStudents() { return await API_.get('/api/users/students'); }

  const createUser   = (data) => API_.post('/api/users', data);
  const updateUser   = (id, data) => API_.put('/api/users/' + encodeURIComponent(id), data);
  const deleteUser   = (id) => API_.del('/api/users/' + encodeURIComponent(id));

  const createModule = (data) => API_.post('/api/modules', data);
  const updateModule = (id, data) => API_.put('/api/modules/' + encodeURIComponent(id), data);
  const deleteModule = (id) => API_.del('/api/modules/' + encodeURIComponent(id));
  const createTask   = (data) => API_.post('/api/tasks', data);
  const updateTask   = (id, data) => API_.put('/api/tasks/' + id, data);
  const deleteTask   = (id) => API_.del('/api/tasks/' + id);

  const getMyProgress     = () => API_.get('/api/progress/me');
  const getAllProgress    = () => API_.get('/api/progress');
  const getUserProgress   = (id) => API_.get('/api/progress/' + encodeURIComponent(id));
  const recordAttempt     = (taskId) => API_.post('/api/progress/attempt', { taskId });
  const recordComplete    = (taskId, points, usedHint, submission) =>
                              API_.post('/api/progress/complete', { taskId, points, usedHint, submission });


  const getLesson      = (mid) => API_.get('/api/lessons/' + encodeURIComponent(mid));
  const listLessons    = () => API_.get('/api/lessons');
  const setIntroStep   = (mid, step, total) => API_.post('/api/lessons/' + encodeURIComponent(mid) + '/intro-step', { step, total });
  const submitMiniTask = (mid, answer) => API_.post('/api/lessons/' + encodeURIComponent(mid) + '/mini-task', { answer });

  async function uploadAvatar(userId, dataUrl) {
    const r = await API_.post('/api/users/' + encodeURIComponent(userId) + '/avatar', { dataUrl });
    if (r && r.user) localStorage.setItem(USER_KEY, JSON.stringify(r.user));
    return r;
  }
  async function deleteAvatar(userId) {
    const r = await API_.del('/api/users/' + encodeURIComponent(userId) + '/avatar');
    if (r && r.user) localStorage.setItem(USER_KEY, JSON.stringify(r.user));
    return r;
  }

  let _ws = null;
  function connectWS(onMessage) {
    if (_ws) try { _ws.close(); } catch {}
    const token = getToken();
    if (!token) return null;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    _ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    _ws.onmessage = (ev) => {
      try { onMessage(JSON.parse(ev.data)); } catch {}
    };
    _ws.onclose = () => { _ws = null; };
    return _ws;
  }

  function requireAuth(allowedRoles) {
    const u = getCurrentUser();
    if (!u) { location.href = '/index.html'; return null; }
    if (allowedRoles && !allowedRoles.includes(u.role)) {
      alert('Доступ запрещён'); location.href = '/index.html'; return null;
    }
    return u;
  }

  window.API = {
    login, logout, getToken, getCurrentUser, refreshCurrentUser, requireAuth,
    getModules, getTasks, getUsers, getStudents,
    createUser, updateUser, deleteUser,
    createModule, updateModule, deleteModule,
    createTask, updateTask, deleteTask,
    getMyProgress, getAllProgress, getUserProgress,
    recordAttempt, recordComplete,
    uploadAvatar, deleteAvatar,
    getLesson, listLessons, setIntroStep, submitMiniTask,
    connectWS, _request: request,
  };
})();

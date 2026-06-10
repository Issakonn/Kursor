/* ============================================================
 KURSOR — Главный файл сервера
 ============================================================ */
require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');

const db = require('./db');
const { seedAdmin, seedContent, seedLessons } = require('./init-db');

// Засев БД при первом старте
seedAdmin();
seedContent();
seedLessons();

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' })); // 4mb: вмещает base64-аватарку до 2 МБ

// Логирование API-запросов
app.use((req, _res, next) => {
 if (req.url.startsWith('/api/')) {
 console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
 }
 next();
});

// Health-check ДО защищённых маршрутов
app.get('/api/health', (_req, res) => {
 const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
 const taskCount = db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;
 const modCount = db.prepare('SELECT COUNT(*) AS n FROM modules').get().n;
 res.json({ status: 'ok', users: userCount, tasks: taskCount, modules: modCount });
});

// REST API
app.use('/api/auth', require('./routes-auth'));
app.use('/api/users', require('./routes-users'));
app.use('/api/progress', require('./routes-progress'));
app.use('/api/lessons', require('./routes-lessons'));
app.use('/api', require('./routes-content')); // /api/modules, /api/tasks — в конце

// 404 для неизвестных API-маршрутов
app.use('/api', (_req, res) => res.status(404).json({ error: 'Маршрут не найден' }));

// Статика
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// SPA-fallback для путей без расширения
app.get(/^\/(?!api\/).*/, (req, res, next) => {
 const ext = path.extname(req.path);
 if (ext) return next();
 res.sendFile(path.join(publicDir, 'index.html'));
});

// Обработка ошибок
app.use((err, _req, res, _next) => {
 console.error('[error]', err);
 res.status(err.status || 500).json({ error: err.message || 'Внутренняя ошибка' });
});

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

require('./ws').init(server);

server.listen(PORT, () => {
 console.log(`\n KURSOR работает: http://localhost:${PORT}`);
 console.log(` API: http://localhost:${PORT}/api/health`);
 console.log(` WS: ws://localhost:${PORT}/ws\n`);
});

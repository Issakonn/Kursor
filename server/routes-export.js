/* ============================================================
   KURSOR — Экспорт / Импорт данных: /api/export, /api/import
   Только admin. Форматы: CSV, JSON.
   ============================================================ */
const express = require('express');
const db = require('./db');
const { authRequired, requireRole } = require('./auth');
const { hashPassword } = require('./auth');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin'));

/* ============================================================
   Хелперы CSV
   ============================================================ */
function toCSV(rows, fields) {
  const header = fields.join(',');
  const lines = rows.map(row =>
    fields.map(f => {
      const v = row[f];
      if (v === null || v === undefined) return '';
      const s = String(v);
      // Экранируем кавычки, оборачиваем если есть запятая/кавычка/перенос
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQ = false; }
        else { cur += ch; }
      } else {
        if (ch === '"') { inQ = true; }
        else if (ch === ',') { values.push(cur); cur = ''; }
        else { cur += ch; }
      }
    }
    values.push(cur);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] !== undefined ? values[i] : ''; });
    return obj;
  });
}

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ============================================================
   ЭКСПОРТ
   ============================================================ */

/* GET /api/export/users?format=csv|json */
router.get('/export/users', (req, res) => {
  const rows = db.prepare('SELECT id, login, name, role, age, group_id, languages, created_at FROM users ORDER BY role, name').all();
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  if (format === 'csv') {
    const fields = ['id', 'login', 'name', 'role', 'age', 'group_id', 'languages', 'created_at'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    return res.send(toCSV(rows, fields));
  }
  res.setHeader('Content-Disposition', 'attachment; filename="users.json"');
  res.json(rows);
});

/* GET /api/export/modules?format=csv|json */
router.get('/export/modules', (req, res) => {
  const rows = db.prepare('SELECT * FROM modules ORDER BY position, id').all();
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  if (format === 'csv') {
    const fields = ['id', 'lang', 'title', 'description', 'video', 'explanation', 'position'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="modules.csv"');
    return res.send(toCSV(rows, fields));
  }
  res.setHeader('Content-Disposition', 'attachment; filename="modules.json"');
  res.json(rows);
});

/* GET /api/export/materials?format=csv|json */
router.get('/export/materials', (req, res) => {
  const rows = db.prepare('SELECT * FROM materials ORDER BY created_at').all();
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  if (format === 'csv') {
    const fields = ['id', 'course_id', 'type', 'title', 'content', 'created_by', 'created_at'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="materials.csv"');
    return res.send(toCSV(rows, fields));
  }
  res.setHeader('Content-Disposition', 'attachment; filename="materials.json"');
  res.json(rows);
});

/* ============================================================
   ИМПОРТ
   ============================================================ */

/* POST /api/import/users
   Body: { format: 'csv'|'json', data: <string|array>, dryRun: bool }
   CSV-колонки: login, name, role, age, password (обязательный при импорте), languages
*/
router.post('/import/users', (req, res) => {
  const { format, data, dryRun } = req.body || {};
  if (!data) return res.status(400).json({ error: 'Поле data обязательно' });

  let rows;
  try {
    rows = format === 'csv' ? parseCSV(data) : (Array.isArray(data) ? data : JSON.parse(data));
  } catch (e) {
    return res.status(400).json({ error: 'Ошибка парсинга: ' + e.message });
  }

  const errors = [];
  const valid = [];
  const validRoles = ['admin', 'teacher', 'student'];

  rows.forEach((row, i) => {
    const line = i + 2;
    if (!row.login) { errors.push({ line, error: 'Нет login' }); return; }
    if (!row.name)  { errors.push({ line, error: 'Нет name' }); return; }
    if (!row.password) { errors.push({ line, error: 'Нет password' }); return; }
    if (!validRoles.includes(row.role)) { errors.push({ line, error: `Некорректная роль: ${row.role}` }); return; }
    const dup = db.prepare('SELECT 1 FROM users WHERE login = ?').get(String(row.login).trim());
    if (dup) { errors.push({ line, error: `Логин "${row.login}" уже существует` }); return; }
    valid.push(row);
  });

  if (dryRun) {
    return res.json({ dryRun: true, total: rows.length, valid: valid.length, errors });
  }
  if (errors.length) {
    return res.status(422).json({ error: 'Есть ошибки — используй dryRun для предпросмотра', errors });
  }

  const insert = db.prepare(`
    INSERT INTO users (id, login, password_hash, name, role, age, group_id, languages, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertProgress = db.prepare(
    'INSERT OR IGNORE INTO progress (user_id, points, streak, badges) VALUES (?, 0, 0, \'["beginner"]\')'
  );
  const importMany = db.transaction((rows) => {
    for (const row of rows) {
      const id = row.id || randomId('u');
      const langs = row.languages || '[]';
      insert.run(
        id, String(row.login).trim(), hashPassword(row.password),
        String(row.name).trim(), row.role,
        parseInt(row.age) || 0, parseInt(row.group_id) || 0,
        typeof langs === 'string' ? langs : JSON.stringify(langs),
        Date.now()
      );
      if (row.role === 'student') insertProgress.run(id);
    }
  });
  importMany(valid);
  res.json({ ok: true, imported: valid.length });
});

/* POST /api/import/modules
   CSV-колонки: id, lang, title, description, video, explanation
*/
router.post('/import/modules', (req, res) => {
  const { format, data, dryRun } = req.body || {};
  if (!data) return res.status(400).json({ error: 'Поле data обязательно' });

  let rows;
  try {
    rows = format === 'csv' ? parseCSV(data) : (Array.isArray(data) ? data : JSON.parse(data));
  } catch (e) {
    return res.status(400).json({ error: 'Ошибка парсинга: ' + e.message });
  }

  const errors = [];
  const valid = [];

  rows.forEach((row, i) => {
    const line = i + 2;
    if (!row.id)   { errors.push({ line, error: 'Нет id' }); return; }
    if (!row.lang) { errors.push({ line, error: 'Нет lang' }); return; }
    if (!row.title){ errors.push({ line, error: 'Нет title' }); return; }
    const dup = db.prepare('SELECT 1 FROM modules WHERE id = ?').get(row.id);
    if (dup) { errors.push({ line, error: `Модуль "${row.id}" уже существует` }); return; }
    valid.push(row);
  });

  if (dryRun) {
    return res.json({ dryRun: true, total: rows.length, valid: valid.length, errors });
  }
  if (errors.length) {
    return res.status(422).json({ errors });
  }

  const pos = db.prepare('SELECT COALESCE(MAX(position),0) AS p FROM modules').get().p;
  const insert = db.prepare(`
    INSERT INTO modules (id, lang, title, description, video, explanation, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const importMany = db.transaction((rows) => {
    rows.forEach((row, i) => {
      insert.run(row.id, row.lang, row.title,
        row.description || '', row.video || '', row.explanation || '',
        parseInt(row.position) || pos + i + 1);
    });
  });
  importMany(valid);
  res.json({ ok: true, imported: valid.length });
});

/* POST /api/import/materials
   CSV-колонки: course_id, type, title, content
*/
router.post('/import/materials', (req, res) => {
  const { format, data, dryRun } = req.body || {};
  if (!data) return res.status(400).json({ error: 'Поле data обязательно' });

  let rows;
  try {
    rows = format === 'csv' ? parseCSV(data) : (Array.isArray(data) ? data : JSON.parse(data));
  } catch (e) {
    return res.status(400).json({ error: 'Ошибка парсинга: ' + e.message });
  }

  const validTypes = ['presentation', 'task', 'text', 'file'];
  const errors = [];
  const valid = [];

  rows.forEach((row, i) => {
    const line = i + 2;
    if (!row.course_id) { errors.push({ line, error: 'Нет course_id' }); return; }
    if (!row.type || !validTypes.includes(row.type)) {
      errors.push({ line, error: `Некорректный type: ${row.type}` }); return;
    }
    if (!row.title) { errors.push({ line, error: 'Нет title' }); return; }
    const mod = db.prepare('SELECT 1 FROM modules WHERE id = ?').get(row.course_id);
    if (!mod) { errors.push({ line, error: `Курс "${row.course_id}" не найден` }); return; }
    valid.push(row);
  });

  if (dryRun) {
    return res.json({ dryRun: true, total: rows.length, valid: valid.length, errors });
  }
  if (errors.length) return res.status(422).json({ errors });

  const insert = db.prepare(`
    INSERT INTO materials (id, course_id, type, title, content, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const importMany = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(randomId('mat'), row.course_id, row.type,
        row.title, row.content || null, req.user.id, Date.now());
    }
  });
  importMany(valid);
  res.json({ ok: true, imported: valid.length });
});

module.exports = router;

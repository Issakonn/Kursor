/* ============================================================
   KURSOR — Материалы курсов и доступ учителей:
   /api/materials, /api/teacher-course-access
   ============================================================ */
const express = require('express');
const db = require('./db');
const { authRequired, requireRole } = require('./auth');

const router = express.Router();
router.use(authRequired);

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function rowToMaterial(row) {
  if (!row) return null;
  return {
    id:        row.id,
    courseId:  row.course_id,
    type:      row.type,
    title:     row.title,
    content:   row.content || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function rowToAccess(row) {
  if (!row) return null;
  return {
    id:        row.id,
    teacherId: row.teacher_id,
    courseId:  row.course_id,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    grantedBy: row.granted_by,
    isActive:  row.expires_at > Date.now(),
  };
}

/* Хелпер: проверить наличие активного доступа у учителя к курсу */
function teacherHasAccess(teacherId, courseId) {
  const now = Date.now();
  const row = db.prepare(
    'SELECT 1 FROM teacher_course_access WHERE teacher_id=? AND course_id=? AND expires_at > ?'
  ).get(teacherId, courseId, now);
  return !!row;
}

/* ============================================================
   MATERIALS
   ============================================================ */

/* GET /api/materials — список материалов
   ?course_id= — фильтр по модулю
   teacher: только те курсы, к которым есть активный доступ
   admin: всё
*/
router.get('/materials', (req, res) => {
  const { course_id } = req.query;
  const role = req.user.role;
  const now = Date.now();

  if (role === 'admin') {
    let sql = 'SELECT * FROM materials WHERE 1=1';
    const params = [];
    if (course_id) { sql += ' AND course_id = ?'; params.push(course_id); }
    sql += ' ORDER BY created_at DESC';
    return res.json(db.prepare(sql).all(...params).map(rowToMaterial));
  }

  // teacher/assistant — только доступные курсы
  const accessibleCourses = db.prepare(
    'SELECT course_id FROM teacher_course_access WHERE teacher_id=? AND expires_at > ?'
  ).all(req.user.id, now).map(r => r.course_id);

  if (!accessibleCourses.length) return res.json([]);

  const placeholders = accessibleCourses.map(() => '?').join(',');
  let sql = `SELECT * FROM materials WHERE course_id IN (${placeholders})`;
  const params = [...accessibleCourses];
  if (course_id && accessibleCourses.includes(course_id)) {
    sql += ' AND course_id = ?';
    params.push(course_id);
  } else if (course_id) {
    return res.json([]); // нет доступа к этому курсу
  }
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params).map(rowToMaterial));
});

/* GET /api/materials/:id */
router.get('/materials/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  // Проверяем доступ для teacher/assistant
  if (req.user.role !== 'admin' && !teacherHasAccess(req.user.id, row.course_id)) {
    return res.status(403).json({ error: 'Нет доступа к этому курсу' });
  }
  res.json(rowToMaterial(row));
});

/* POST /api/materials — создать (admin всегда; teacher если есть доступ) */
router.post('/materials', (req, res) => {
  const role = req.user.role;
  if (!['admin', 'teacher', 'assistant'].includes(role)) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }
  const { courseId, type, title, content } = req.body || {};
  if (!courseId || !type || !title) {
    return res.status(400).json({ error: 'courseId, type, title обязательны' });
  }
  const validTypes = ['presentation', 'task', 'text', 'file'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type должен быть: ${validTypes.join(', ')}` });
  }
  const module = db.prepare('SELECT id FROM modules WHERE id = ?').get(courseId);
  if (!module) return res.status(404).json({ error: 'Курс (модуль) не найден' });

  // teacher может создавать только на курсах, к которым есть доступ
  if (role !== 'admin' && !teacherHasAccess(req.user.id, courseId)) {
    return res.status(403).json({ error: 'Нет активного доступа к этому курсу' });
  }

  const id = randomId('mat');
  db.prepare(`
    INSERT INTO materials (id, course_id, type, title, content, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, courseId, type, String(title).trim(), content || null, req.user.id, Date.now());
  res.status(201).json(rowToMaterial(db.prepare('SELECT * FROM materials WHERE id = ?').get(id)));
});

/* PUT /api/materials/:id */
router.put('/materials/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });

  const role = req.user.role;
  if (role !== 'admin' && !teacherHasAccess(req.user.id, row.course_id)) {
    return res.status(403).json({ error: 'Нет доступа к этому курсу' });
  }
  // assistant — не может редактировать материалы (по ТЗ)
  if (role === 'assistant') {
    return res.status(403).json({ error: 'Ассистент не может редактировать материалы' });
  }

  const { type, title, content } = req.body || {};
  db.prepare(`
    UPDATE materials SET type=?, title=?, content=? WHERE id=?
  `).run(
    type || row.type,
    title ? String(title).trim() : row.title,
    content !== undefined ? content : row.content,
    req.params.id
  );
  res.json(rowToMaterial(db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id)));
});

/* DELETE /api/materials/:id (admin или teacher-создатель) */
router.delete('/materials/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  if (req.user.role !== 'admin' && row.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Можно удалить только свой материал' });
  }
  db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ============================================================
   TEACHER COURSE ACCESS
   ============================================================ */

/* GET /api/teacher-course-access — список (admin всё, teacher — только своё) */
router.get('/teacher-course-access', (req, res) => {
  const role = req.user.role;
  let rows;
  if (role === 'admin') {
    const { teacher_id, course_id } = req.query;
    let sql = 'SELECT * FROM teacher_course_access WHERE 1=1';
    const params = [];
    if (teacher_id) { sql += ' AND teacher_id = ?'; params.push(teacher_id); }
    if (course_id)  { sql += ' AND course_id = ?';  params.push(course_id); }
    sql += ' ORDER BY granted_at DESC';
    rows = db.prepare(sql).all(...params);
  } else {
    rows = db.prepare(
      'SELECT * FROM teacher_course_access WHERE teacher_id = ? ORDER BY expires_at DESC'
    ).all(req.user.id);
  }
  res.json(rows.map(rowToAccess));
});

/* POST /api/teacher-course-access — выдать доступ (admin) */
router.post('/teacher-course-access', requireRole('admin'), (req, res) => {
  const { teacherId, courseId, expiresAt } = req.body || {};
  if (!teacherId || !courseId || !expiresAt) {
    return res.status(400).json({ error: 'teacherId, courseId, expiresAt обязательны' });
  }
  const teacher = db.prepare('SELECT id FROM users WHERE id = ?').get(teacherId);
  if (!teacher) return res.status(404).json({ error: 'Учитель не найден' });
  const module = db.prepare('SELECT id FROM modules WHERE id = ?').get(courseId);
  if (!module) return res.status(404).json({ error: 'Курс не найден' });

  const id = randomId('tca');
  const now = Date.now();
  db.prepare(`
    INSERT INTO teacher_course_access (id, teacher_id, course_id, granted_at, expires_at, granted_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, teacherId, courseId, now, Number(expiresAt), req.user.id);
  res.status(201).json(rowToAccess(
    db.prepare('SELECT * FROM teacher_course_access WHERE id = ?').get(id)
  ));
});

/* PUT /api/teacher-course-access/:id — продлить/закрыть досрочно (admin) */
router.put('/teacher-course-access/:id', requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM teacher_course_access WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  const { expiresAt } = req.body || {};
  if (!expiresAt) return res.status(400).json({ error: 'expiresAt обязателен' });
  db.prepare('UPDATE teacher_course_access SET expires_at=? WHERE id=?')
    .run(Number(expiresAt), req.params.id);
  res.json(rowToAccess(
    db.prepare('SELECT * FROM teacher_course_access WHERE id = ?').get(req.params.id)
  ));
});

/* DELETE /api/teacher-course-access/:id (admin) */
router.delete('/teacher-course-access/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM teacher_course_access WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найден' });
  res.json({ ok: true });
});

module.exports = router;

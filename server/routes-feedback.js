/* ============================================================
   KURSOR — Фидбек учителя об ученике: /api/feedback
   ============================================================ */
const express = require('express');
const db = require('./db');
const { authRequired, requireRole } = require('./auth');

const router = express.Router();
router.use(authRequired);

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function rowToFeedback(row) {
  if (!row) return null;
  return {
    id:              row.id,
    teacherId:       row.teacher_id,
    studentId:       row.student_id,
    type:            row.type,
    moduleId:        row.module_id || null,
    lessonSessionId: row.lesson_session_id || null,
    text:            row.text,
    isInternal:      row.is_internal === 1,
    createdAt:       row.created_at,
  };
}

/* GET /api/feedback
   Фильтры: ?student_id=&teacher_id=
   - admin/teacher: видят всё (включая internal)
   - student: только свои + is_internal=0
   - parent: проверяется в кабинете родителя (отдельный роут)
*/
router.get('/', (req, res) => {
  const { student_id, teacher_id } = req.query;
  const role = req.user.role;

  let sql = 'SELECT * FROM feedback WHERE 1=1';
  const params = [];

  if (student_id) { sql += ' AND student_id = ?'; params.push(student_id); }
  if (teacher_id) { sql += ' AND teacher_id = ?'; params.push(teacher_id); }

  // Студент видит только свой и только публичный
  if (role === 'student') {
    sql += ' AND student_id = ? AND is_internal = 0';
    params.push(req.user.id);
  }

  // Учитель видит только то, что написал сам или что про его учеников (ограничение мягкое)
  if (role === 'teacher' || role === 'assistant') {
    if (!student_id && !teacher_id) {
      sql += ' AND teacher_id = ?';
      params.push(req.user.id);
    }
  }

  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToFeedback));
});

/* POST /api/feedback — создать отзыв (teacher, admin) */
router.post('/', requireRole('teacher', 'admin', 'assistant'), (req, res) => {
  const { studentId, type, moduleId, lessonSessionId, text, isInternal } = req.body || {};
  if (!studentId || !type || !text) {
    return res.status(400).json({ error: 'studentId, type, text обязательны' });
  }
  const validTypes = ['lesson', 'course', 'general'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type должен быть: ${validTypes.join(', ')}` });
  }
  const student = db.prepare('SELECT id FROM users WHERE id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Ученик не найден' });

  const id = randomId('fb');
  db.prepare(`
    INSERT INTO feedback (id, teacher_id, student_id, type, module_id, lesson_session_id, text, is_internal, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.id, studentId, type,
    moduleId || null, lessonSessionId || null,
    String(text).trim(), isInternal ? 1 : 0,
    Date.now()
  );
  res.status(201).json(rowToFeedback(db.prepare('SELECT * FROM feedback WHERE id = ?').get(id)));
});

/* PUT /api/feedback/:id — редактировать (только свой отзыв или admin) */
router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  if (req.user.role !== 'admin' && row.teacher_id !== req.user.id) {
    return res.status(403).json({ error: 'Можно редактировать только свой фидбек' });
  }
  const { text, isInternal, type } = req.body || {};
  db.prepare(`
    UPDATE feedback SET text=?, is_internal=?, type=? WHERE id=?
  `).run(
    text !== undefined ? String(text).trim() : row.text,
    isInternal !== undefined ? (isInternal ? 1 : 0) : row.is_internal,
    type || row.type,
    req.params.id
  );
  res.json(rowToFeedback(db.prepare('SELECT * FROM feedback WHERE id = ?').get(req.params.id)));
});

/* DELETE /api/feedback/:id */
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  if (req.user.role !== 'admin' && row.teacher_id !== req.user.id) {
    return res.status(403).json({ error: 'Можно удалять только свой фидбек' });
  }
  db.prepare('DELETE FROM feedback WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;

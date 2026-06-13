/* ============================================================
   KURSOR — CRM-ядро (Фаза 2)
   /api/branches, /api/tariffs, /api/groups, /api/students-crm,
   /api/teacher-permissions
   ============================================================ */
const express = require('express');
const db = require('./db');
const { authRequired, requireRole } = require('./auth');

const router = express.Router();
router.use(authRequired);

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ── helpers ─────────────────────────────────────────────── */
function rowToBranch(r) {
  if (!r) return null;
  return { id: r.id, name: r.name, address: r.address || null };
}

function rowToTariff(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name,
    visitsCount: r.visits_count,
    durationDays: r.duration_days,
    price: r.price || 0,
    extraLessonsSeparate: !!r.extra_lessons_separate,
  };
}

function rowToGroup(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name,
    courseId: r.course_id || null,
    branchId: r.branch_id,
    teacherId: r.teacher_id,
    assistantId: r.assistant_id || null,
    lessonKind: r.lesson_kind,
    status: r.status,
  };
}

function rowToSchedule(r) {
  if (!r) return null;
  return {
    id: r.id, groupId: r.group_id,
    weekday: r.weekday,
    startTime: r.start_time,
    durationMin: r.duration_min,
  };
}

function rowToMember(r) {
  if (!r) return null;
  return {
    id: r.id, studentId: r.student_id, groupId: r.group_id,
    since: r.since, until: r.until || null,
  };
}

function rowToCrm(r) {
  if (!r) return null;
  return {
    userId: r.user_id,
    fullName: r.full_name,
    birthDate: r.birth_date || null,
    gender: r.gender || null,
    branchId: r.branch_id || null,
    tariffId: r.tariff_id || null,
    subscriptionIssuedAt: r.subscription_issued_at || null,
    visitsLeft: r.visits_left ?? 0,
    status: r.status,
    responsibleManagerId: r.responsible_manager_id || null,
    parentName: r.parent_name || null,
    parentPhone: r.parent_phone || null,
    // document_id намеренно не включаем в стандартный ответ без явного запроса
    comment: r.comment || null,
    videoConsent: !!r.video_consent,
    videoConsentDate: r.video_consent_date || null,
  };
}

function rowToPermission(r) {
  if (!r) return null;
  return { id: r.id, teacherId: r.teacher_id, key: r.permission_key, value: !!r.value };
}

/* ── BRANCHES ─────────────────────────────────────────────── */
router.get('/branches', (req, res) => {
  const rows = db.prepare('SELECT * FROM branches ORDER BY name').all();
  res.json(rows.map(rowToBranch));
});

router.post('/branches', requireRole('admin'), (req, res) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Название обязательно' });
  const id = randomId('br');
  db.prepare('INSERT INTO branches(id,name,address) VALUES(?,?,?)').run(id, name, address || null);
  res.status(201).json(rowToBranch(db.prepare('SELECT * FROM branches WHERE id=?').get(id)));
});

router.put('/branches/:id', requireRole('admin'), (req, res) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Название обязательно' });
  const info = db.prepare('UPDATE branches SET name=?,address=? WHERE id=?').run(name, address || null, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найдено' });
  res.json(rowToBranch(db.prepare('SELECT * FROM branches WHERE id=?').get(req.params.id)));
});

router.delete('/branches/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM branches WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найдено' });
  res.json({ ok: true });
});

/* ── TARIFFS ──────────────────────────────────────────────── */
router.get('/tariffs', (req, res) => {
  res.json(db.prepare('SELECT * FROM tariffs ORDER BY name').all().map(rowToTariff));
});

router.post('/tariffs', requireRole('admin'), (req, res) => {
  const { name, visitsCount, durationDays, price, extraLessonsSeparate } = req.body;
  if (!name || !visitsCount || !durationDays) return res.status(400).json({ error: 'Заполните обязательные поля' });
  const id = randomId('tar');
  db.prepare('INSERT INTO tariffs(id,name,visits_count,duration_days,price,extra_lessons_separate) VALUES(?,?,?,?,?,?)')
    .run(id, name, visitsCount, durationDays, price || 0, extraLessonsSeparate ? 1 : 0);
  res.status(201).json(rowToTariff(db.prepare('SELECT * FROM tariffs WHERE id=?').get(id)));
});

router.put('/tariffs/:id', requireRole('admin'), (req, res) => {
  const { name, visitsCount, durationDays, price, extraLessonsSeparate } = req.body;
  if (!name || !visitsCount || !durationDays) return res.status(400).json({ error: 'Заполните обязательные поля' });
  const info = db.prepare('UPDATE tariffs SET name=?,visits_count=?,duration_days=?,price=?,extra_lessons_separate=? WHERE id=?')
    .run(name, visitsCount, durationDays, price || 0, extraLessonsSeparate ? 1 : 0, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найдено' });
  res.json(rowToTariff(db.prepare('SELECT * FROM tariffs WHERE id=?').get(req.params.id)));
});

router.delete('/tariffs/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM tariffs WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найдено' });
  res.json({ ok: true });
});

/* ── GROUPS ───────────────────────────────────────────────── */
router.get('/groups', (req, res) => {
  const { role, id: userId } = req.user;
  let rows;
  if (role === 'admin') {
    rows = db.prepare('SELECT * FROM groups ORDER BY name').all();
  } else if (role === 'teacher' || role === 'assistant') {
    rows = db.prepare('SELECT * FROM groups WHERE teacher_id=? OR assistant_id=? ORDER BY name')
      .all(userId, userId);
  } else {
    // student — groups they're in
    rows = db.prepare(`
      SELECT g.* FROM groups g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.student_id = ? AND (gm.until IS NULL OR gm.until > ?)
      ORDER BY g.name
    `).all(userId, Date.now());
  }
  res.json(rows.map(rowToGroup));
});

router.post('/groups', requireRole('admin'), (req, res) => {
  const { name, courseId, branchId, teacherId, assistantId, lessonKind } = req.body;
  if (!name || !branchId || !teacherId || !lessonKind) return res.status(400).json({ error: 'Заполните обязательные поля' });
  const id = randomId('grp');
  db.prepare('INSERT INTO groups(id,name,course_id,branch_id,teacher_id,assistant_id,lesson_kind,status) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, name, courseId || null, branchId, teacherId, assistantId || null, lessonKind, 'active');
  res.status(201).json(rowToGroup(db.prepare('SELECT * FROM groups WHERE id=?').get(id)));
});

router.put('/groups/:id', requireRole('admin'), (req, res) => {
  const { name, courseId, branchId, teacherId, assistantId, lessonKind, status } = req.body;
  if (!name || !branchId || !teacherId || !lessonKind) return res.status(400).json({ error: 'Заполните обязательные поля' });
  const info = db.prepare('UPDATE groups SET name=?,course_id=?,branch_id=?,teacher_id=?,assistant_id=?,lesson_kind=?,status=? WHERE id=?')
    .run(name, courseId || null, branchId, teacherId, assistantId || null, lessonKind, status || 'active', req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найдено' });
  res.json(rowToGroup(db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id)));
});

router.delete('/groups/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM groups WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найдено' });
  res.json({ ok: true });
});

/* ── GROUP SCHEDULE ───────────────────────────────────────── */
router.get('/groups/:id/schedule', (req, res) => {
  const rows = db.prepare('SELECT * FROM group_schedule WHERE group_id=? ORDER BY weekday, start_time')
    .all(req.params.id);
  res.json(rows.map(rowToSchedule));
});

router.post('/groups/:id/schedule', requireRole('admin', 'teacher'), (req, res) => {
  const { weekday, startTime, durationMin } = req.body;
  if (weekday == null || !startTime || !durationMin) return res.status(400).json({ error: 'Заполните поля' });
  const id = randomId('gs');
  db.prepare('INSERT INTO group_schedule(id,group_id,weekday,start_time,duration_min) VALUES(?,?,?,?,?)')
    .run(id, req.params.id, weekday, startTime, durationMin);
  res.status(201).json(rowToSchedule(db.prepare('SELECT * FROM group_schedule WHERE id=?').get(id)));
});

router.delete('/groups/:groupId/schedule/:id', requireRole('admin', 'teacher'), (req, res) => {
  const info = db.prepare('DELETE FROM group_schedule WHERE id=? AND group_id=?').run(req.params.id, req.params.groupId);
  if (!info.changes) return res.status(404).json({ error: 'Не найдено' });
  res.json({ ok: true });
});

/* ── GROUP MEMBERS ────────────────────────────────────────── */
router.get('/groups/:id/members', (req, res) => {
  const { role, id: userId } = req.user;
  // teacher can only see members of their groups
  if (role === 'teacher' || role === 'assistant') {
    const group = db.prepare('SELECT * FROM groups WHERE id=? AND (teacher_id=? OR assistant_id=?)').get(req.params.id, userId, userId);
    if (!group) return res.status(403).json({ error: 'Нет доступа' });
  }
  const rows = db.prepare(`
    SELECT gm.*, u.name, u.login, u.age
    FROM group_members gm
    JOIN users u ON u.id = gm.student_id
    WHERE gm.group_id = ?
    ORDER BY u.name
  `).all(req.params.id);
  res.json(rows.map(r => ({ ...rowToMember(r), studentName: r.name, studentLogin: r.login, studentAge: r.age })));
});

router.post('/groups/:id/members', requireRole('admin', 'teacher'), (req, res) => {
  const { studentId, since, until } = req.body;
  if (!studentId) return res.status(400).json({ error: 'studentId обязателен' });
  const id = randomId('gm');
  db.prepare('INSERT INTO group_members(id,student_id,group_id,since,until) VALUES(?,?,?,?,?)')
    .run(id, studentId, req.params.id, since || Date.now(), until || null);
  res.status(201).json(rowToMember(db.prepare('SELECT * FROM group_members WHERE id=?').get(id)));
});

router.delete('/groups/:groupId/members/:id', requireRole('admin', 'teacher'), (req, res) => {
  const info = db.prepare('DELETE FROM group_members WHERE id=? AND group_id=?').run(req.params.id, req.params.groupId);
  if (!info.changes) return res.status(404).json({ error: 'Не найдено' });
  res.json({ ok: true });
});

/* ── STUDENTS CRM ─────────────────────────────────────────── */
router.get('/students-crm', requireRole('admin', 'teacher', 'assistant'), (req, res) => {
  const { role, id: userId } = req.user;
  const { branch, status, group } = req.query;

  let rows;
  if (role === 'admin') {
    let q = 'SELECT sc.* FROM students_crm sc WHERE 1=1';
    const params = [];
    if (branch) { q += ' AND sc.branch_id=?'; params.push(branch); }
    if (status) { q += ' AND sc.status=?'; params.push(status); }
    if (group) {
      q = `SELECT sc.* FROM students_crm sc
           JOIN group_members gm ON gm.student_id = sc.user_id
           WHERE gm.group_id=? ${branch ? 'AND sc.branch_id=?' : ''} ${status ? 'AND sc.status=?' : ''}`;
      params.unshift(group);
      if (branch) params.push(branch);
      if (status) params.push(status);
    }
    q += ' ORDER BY sc.full_name';
    rows = db.prepare(q).all(...params);
  } else {
    // teacher/assistant — only students in their groups
    rows = db.prepare(`
      SELECT DISTINCT sc.*
      FROM students_crm sc
      JOIN group_members gm ON gm.student_id = sc.user_id
      JOIN groups g ON g.id = gm.group_id
      WHERE (g.teacher_id=? OR g.assistant_id=?)
      ORDER BY sc.full_name
    `).all(userId, userId);
  }
  res.json(rows.map(rowToCrm));
});

router.get('/students-crm/:id', requireRole('admin', 'teacher', 'assistant'), (req, res) => {
  const { role, id: userId } = req.user;
  const row = db.prepare('SELECT * FROM students_crm WHERE user_id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  // teacher can only view students in their groups
  if (role !== 'admin') {
    const inGroup = db.prepare(`
      SELECT 1 FROM group_members gm
      JOIN groups g ON g.id = gm.group_id
      WHERE gm.student_id=? AND (g.teacher_id=? OR g.assistant_id=?)
    `).get(req.params.id, userId, userId);
    if (!inGroup) return res.status(403).json({ error: 'Нет доступа' });
  }
  res.json(rowToCrm(row));
});

router.post('/students-crm', requireRole('admin'), (req, res) => {
  const {
    userId, fullName, birthDate, gender, branchId, tariffId,
    subscriptionIssuedAt, visitsLeft, status, responsibleManagerId,
    parentName, parentPhone, documentId, comment, videoConsent, videoConsentDate
  } = req.body;
  if (!userId || !fullName) return res.status(400).json({ error: 'userId и fullName обязательны' });
  // check user exists
  const user = db.prepare('SELECT id FROM users WHERE id=?').get(userId);
  if (!user) return res.status(400).json({ error: 'Пользователь не найден' });
  db.prepare(`INSERT INTO students_crm
    (user_id,full_name,birth_date,gender,branch_id,tariff_id,subscription_issued_at,
     visits_left,status,responsible_manager_id,parent_name,parent_phone,document_id,
     comment,video_consent,video_consent_date)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, fullName, birthDate || null, gender || null, branchId || null,
      tariffId || null, subscriptionIssuedAt || null, visitsLeft || 0,
      status || 'active', responsibleManagerId || null,
      parentName || null, parentPhone || null, documentId || null,
      comment || null, videoConsent ? 1 : 0, videoConsentDate || null);
  res.status(201).json(rowToCrm(db.prepare('SELECT * FROM students_crm WHERE user_id=?').get(userId)));
});

router.put('/students-crm/:id', requireRole('admin'), (req, res) => {
  const {
    fullName, birthDate, gender, branchId, tariffId,
    subscriptionIssuedAt, visitsLeft, status, responsibleManagerId,
    parentName, parentPhone, documentId, comment, videoConsent, videoConsentDate
  } = req.body;
  if (!fullName) return res.status(400).json({ error: 'fullName обязателен' });
  const info = db.prepare(`UPDATE students_crm SET
    full_name=?,birth_date=?,gender=?,branch_id=?,tariff_id=?,
    subscription_issued_at=?,visits_left=?,status=?,responsible_manager_id=?,
    parent_name=?,parent_phone=?,document_id=?,comment=?,video_consent=?,video_consent_date=?
    WHERE user_id=?`)
    .run(fullName, birthDate || null, gender || null, branchId || null, tariffId || null,
      subscriptionIssuedAt || null, visitsLeft ?? 0, status || 'active',
      responsibleManagerId || null, parentName || null, parentPhone || null,
      documentId || null, comment || null, videoConsent ? 1 : 0, videoConsentDate || null,
      req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найдено' });
  res.json(rowToCrm(db.prepare('SELECT * FROM students_crm WHERE user_id=?').get(req.params.id)));
});

router.delete('/students-crm/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM students_crm WHERE user_id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найдено' });
  res.json({ ok: true });
});

/* ── TEACHER PERMISSIONS ─────────────────────────────────── */
router.get('/teacher-permissions/:teacherId', requireRole('admin', 'teacher', 'assistant'), (req, res) => {
  const rows = db.prepare('SELECT * FROM teacher_permissions WHERE teacher_id=?').all(req.params.teacherId);
  res.json(rows.map(rowToPermission));
});

router.put('/teacher-permissions/:teacherId', requireRole('admin'), (req, res) => {
  // body: { permissions: { key: bool, ... } }
  const { permissions } = req.body;
  if (!permissions || typeof permissions !== 'object') return res.status(400).json({ error: 'permissions объект обязателен' });
  const upsert = db.prepare(`INSERT INTO teacher_permissions(id,teacher_id,permission_key,value)
    VALUES(?,?,?,?) ON CONFLICT(teacher_id,permission_key) DO UPDATE SET value=excluded.value`);
  for (const [key, val] of Object.entries(permissions)) {
    upsert.run(randomId('tp'), req.params.teacherId, key, val ? 1 : 0);
  }
  const rows = db.prepare('SELECT * FROM teacher_permissions WHERE teacher_id=?').all(req.params.teacherId);
  res.json(rows.map(rowToPermission));
});

module.exports = router;

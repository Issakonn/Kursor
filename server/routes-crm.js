/* ============================================================
   KURSOR — ФАЗА 2: CRM-ядро
   /api/branches, /api/tariffs, /api/groups,
   /api/groups/:id/schedule, /api/groups/:id/members,
   /api/students-crm, /api/teacher-permissions
   ============================================================ */
const express = require('express');
const db = require('./db');
const { authRequired, requireRole } = require('./auth');

const router = express.Router();
router.use(authRequired);

function rid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------- mappers ---------- */
const mapBranch = r => r && ({ id: r.id, name: r.name, address: r.address || null });

const mapTariff = r => r && ({
  id: r.id, name: r.name,
  visitsCount: r.visits_count, durationDays: r.duration_days,
  price: r.price || 0,
  extraLessonsSeparate: !!r.extra_lessons_separate,
});

const mapGroup = r => r && ({
  id: r.id, name: r.name,
  courseId: r.course_id || null,
  branchId: r.branch_id,
  teacherId: r.teacher_id,
  assistantId: r.assistant_id || null,
  lessonKind: r.lesson_kind,
  status: r.status,
});

const mapSchedule = r => r && ({
  id: r.id, groupId: r.group_id,
  weekday: r.weekday, startTime: r.start_time, durationMin: r.duration_min,
});

const mapMember = r => r && ({
  id: r.id, studentId: r.student_id, groupId: r.group_id,
  since: r.since, until: r.until || null,
});

const mapCrm = r => r && ({
  userId: r.user_id,
  fullName: r.full_name,
  birthDate: r.birth_date || null,
  gender: r.gender || null,
  branchId: r.branch_id || null,
  tariffId: r.tariff_id || null,
  subscriptionIssuedAt: r.subscription_issued_at || null,
  visitsLeft: r.visits_left || 0,
  status: r.status,
  responsibleManagerId: r.responsible_manager_id || null,
  parentName: r.parent_name || null,
  parentPhone: r.parent_phone || null,
  documentId: r.document_id || null,
  comment: r.comment || null,
  videoConsent: !!r.video_consent,
  videoConsentDate: r.video_consent_date || null,
});

/* ---------- helpers ---------- */
function isAdmin(req) { return req.user.role === 'admin'; }

function teacherGroups(userId) {
  return db.prepare(
    `SELECT id FROM groups WHERE teacher_id = ? OR assistant_id = ?`
  ).all(userId, userId).map(r => r.id);
}

function canSeeGroup(req, groupId) {
  if (isAdmin(req)) return true;
  return teacherGroups(req.user.id).includes(groupId);
}

function hasPermission(userId, key) {
  const r = db.prepare(
    'SELECT value FROM teacher_permissions WHERE teacher_id = ? AND permission_key = ?'
  ).get(userId, key);
  return !!(r && r.value);
}

/* ============================================================
   BRANCHES
   ============================================================ */
router.get('/branches', (_req, res) => {
  res.json(db.prepare('SELECT * FROM branches ORDER BY name').all().map(mapBranch));
});

router.post('/branches', requireRole('admin'), (req, res) => {
  const { name, address } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name обязателен' });
  const id = rid('br');
  db.prepare('INSERT INTO branches (id, name, address) VALUES (?, ?, ?)')
    .run(id, String(name).trim(), address || null);
  res.status(201).json(mapBranch(db.prepare('SELECT * FROM branches WHERE id=?').get(id)));
});

router.put('/branches/:id', requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM branches WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  const { name, address } = req.body || {};
  db.prepare('UPDATE branches SET name=?, address=? WHERE id=?')
    .run(name ? String(name).trim() : row.name, address !== undefined ? address : row.address, req.params.id);
  res.json(mapBranch(db.prepare('SELECT * FROM branches WHERE id=?').get(req.params.id)));
});

router.delete('/branches/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM branches WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найден' });
  res.json({ ok: true });
});

/* ============================================================
   TARIFFS
   ============================================================ */
router.get('/tariffs', (_req, res) => {
  res.json(db.prepare('SELECT * FROM tariffs ORDER BY name').all().map(mapTariff));
});

router.post('/tariffs', requireRole('admin'), (req, res) => {
  const { name, visitsCount, durationDays, price, extraLessonsSeparate } = req.body || {};
  if (!name || visitsCount == null || durationDays == null) {
    return res.status(400).json({ error: 'name, visitsCount, durationDays обязательны' });
  }
  const id = rid('tar');
  db.prepare(`
    INSERT INTO tariffs (id, name, visits_count, duration_days, price, extra_lessons_separate)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, String(name).trim(), Number(visitsCount), Number(durationDays),
         Number(price) || 0, extraLessonsSeparate ? 1 : 0);
  res.status(201).json(mapTariff(db.prepare('SELECT * FROM tariffs WHERE id=?').get(id)));
});

router.put('/tariffs/:id', requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM tariffs WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  const { name, visitsCount, durationDays, price, extraLessonsSeparate } = req.body || {};
  db.prepare(`
    UPDATE tariffs SET
      name=?, visits_count=?, duration_days=?, price=?, extra_lessons_separate=?
    WHERE id=?
  `).run(
    name ? String(name).trim() : row.name,
    visitsCount != null ? Number(visitsCount) : row.visits_count,
    durationDays != null ? Number(durationDays) : row.duration_days,
    price != null ? Number(price) : row.price,
    extraLessonsSeparate != null ? (extraLessonsSeparate ? 1 : 0) : row.extra_lessons_separate,
    req.params.id
  );
  res.json(mapTariff(db.prepare('SELECT * FROM tariffs WHERE id=?').get(req.params.id)));
});

router.delete('/tariffs/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM tariffs WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найден' });
  res.json({ ok: true });
});

/* ============================================================
   GROUPS
   ============================================================ */
router.get('/groups', (req, res) => {
  const { branch_id, teacher_id, status } = req.query;
  let sql = 'SELECT * FROM groups WHERE 1=1';
  const params = [];
  if (branch_id)  { sql += ' AND branch_id = ?';  params.push(branch_id); }
  if (teacher_id) { sql += ' AND (teacher_id = ? OR assistant_id = ?)'; params.push(teacher_id, teacher_id); }
  if (status)     { sql += ' AND status = ?';     params.push(status); }
  sql += ' ORDER BY name';
  let rows = db.prepare(sql).all(...params);
  // teacher/assistant видят только свои группы
  if (!isAdmin(req)) {
    rows = rows.filter(r => r.teacher_id === req.user.id || r.assistant_id === req.user.id);
  }
  res.json(rows.map(mapGroup));
});

router.get('/groups/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  if (!isAdmin(req) && row.teacher_id !== req.user.id && row.assistant_id !== req.user.id) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  res.json(mapGroup(row));
});

router.post('/groups', requireRole('admin'), (req, res) => {
  const { name, courseId, branchId, teacherId, assistantId, lessonKind, status } = req.body || {};
  if (!name || !branchId || !teacherId || !lessonKind) {
    return res.status(400).json({ error: 'name, branchId, teacherId, lessonKind обязательны' });
  }
  if (!['main', 'extra'].includes(lessonKind)) {
    return res.status(400).json({ error: 'lessonKind должен быть main|extra' });
  }
  const id = rid('grp');
  db.prepare(`
    INSERT INTO groups (id, name, course_id, branch_id, teacher_id, assistant_id, lesson_kind, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, String(name).trim(), courseId || null, branchId, teacherId,
         assistantId || null, lessonKind, status || 'active');
  res.status(201).json(mapGroup(db.prepare('SELECT * FROM groups WHERE id=?').get(id)));
});

router.put('/groups/:id', requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  const b = req.body || {};
  db.prepare(`
    UPDATE groups SET
      name=?, course_id=?, branch_id=?, teacher_id=?, assistant_id=?, lesson_kind=?, status=?
    WHERE id=?
  `).run(
    b.name ? String(b.name).trim() : row.name,
    b.courseId !== undefined ? b.courseId : row.course_id,
    b.branchId || row.branch_id,
    b.teacherId || row.teacher_id,
    b.assistantId !== undefined ? b.assistantId : row.assistant_id,
    b.lessonKind || row.lesson_kind,
    b.status || row.status,
    req.params.id
  );
  res.json(mapGroup(db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id)));
});

router.delete('/groups/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM groups WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найден' });
  res.json({ ok: true });
});

/* ---------- schedule ---------- */
router.get('/groups/:id/schedule', (req, res) => {
  if (!canSeeGroup(req, req.params.id)) return res.status(403).json({ error: 'Нет доступа' });
  res.json(
    db.prepare('SELECT * FROM group_schedule WHERE group_id=? ORDER BY weekday, start_time')
      .all(req.params.id).map(mapSchedule)
  );
});

router.post('/groups/:id/schedule', requireRole('admin'), (req, res) => {
  const grp = db.prepare('SELECT id FROM groups WHERE id=?').get(req.params.id);
  if (!grp) return res.status(404).json({ error: 'Группа не найдена' });
  const { weekday, startTime, durationMin } = req.body || {};
  if (weekday == null || !startTime || !durationMin) {
    return res.status(400).json({ error: 'weekday, startTime, durationMin обязательны' });
  }
  const w = Number(weekday);
  if (!(w >= 0 && w <= 6)) return res.status(400).json({ error: 'weekday: 0..6' });
  const id = rid('sch');
  db.prepare(`
    INSERT INTO group_schedule (id, group_id, weekday, start_time, duration_min)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.params.id, w, String(startTime), Number(durationMin));
  res.status(201).json(mapSchedule(db.prepare('SELECT * FROM group_schedule WHERE id=?').get(id)));
});

router.put('/groups/:gid/schedule/:sid', requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM group_schedule WHERE id=? AND group_id=?')
    .get(req.params.sid, req.params.gid);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  const { weekday, startTime, durationMin } = req.body || {};
  db.prepare(`
    UPDATE group_schedule SET weekday=?, start_time=?, duration_min=? WHERE id=?
  `).run(
    weekday != null ? Number(weekday) : row.weekday,
    startTime || row.start_time,
    durationMin != null ? Number(durationMin) : row.duration_min,
    req.params.sid
  );
  res.json(mapSchedule(db.prepare('SELECT * FROM group_schedule WHERE id=?').get(req.params.sid)));
});

router.delete('/groups/:gid/schedule/:sid', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM group_schedule WHERE id=? AND group_id=?')
    .run(req.params.sid, req.params.gid);
  if (!info.changes) return res.status(404).json({ error: 'Не найден' });
  res.json({ ok: true });
});

/* ---------- members ---------- */
router.get('/groups/:id/members', (req, res) => {
  if (!canSeeGroup(req, req.params.id)) return res.status(403).json({ error: 'Нет доступа' });
  res.json(
    db.prepare('SELECT * FROM group_members WHERE group_id=? ORDER BY since DESC')
      .all(req.params.id).map(mapMember)
  );
});

router.post('/groups/:id/members', requireRole('admin'), (req, res) => {
  const grp = db.prepare('SELECT id FROM groups WHERE id=?').get(req.params.id);
  if (!grp) return res.status(404).json({ error: 'Группа не найдена' });
  const { studentId, since, until } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId обязателен' });
  const stu = db.prepare('SELECT id FROM users WHERE id=?').get(studentId);
  if (!stu) return res.status(404).json({ error: 'Ученик не найден' });
  const id = rid('mem');
  db.prepare(`
    INSERT INTO group_members (id, student_id, group_id, since, until)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, studentId, req.params.id, Number(since) || Date.now(), until ? Number(until) : null);
  res.status(201).json(mapMember(db.prepare('SELECT * FROM group_members WHERE id=?').get(id)));
});

router.put('/groups/:gid/members/:mid', requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM group_members WHERE id=? AND group_id=?')
    .get(req.params.mid, req.params.gid);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  const { since, until } = req.body || {};
  db.prepare('UPDATE group_members SET since=?, until=? WHERE id=?').run(
    since != null ? Number(since) : row.since,
    until !== undefined ? (until ? Number(until) : null) : row.until,
    req.params.mid
  );
  res.json(mapMember(db.prepare('SELECT * FROM group_members WHERE id=?').get(req.params.mid)));
});

router.delete('/groups/:gid/members/:mid', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM group_members WHERE id=? AND group_id=?')
    .run(req.params.mid, req.params.gid);
  if (!info.changes) return res.status(404).json({ error: 'Не найден' });
  res.json({ ok: true });
});

/* ============================================================
   STUDENTS CRM
   ============================================================ */
router.get('/students-crm', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Только admin' });
  const { branch, group, status, manager } = req.query;
  let sql = 'SELECT DISTINCT c.* FROM students_crm c';
  const params = [];
  if (group) sql += ' JOIN group_members gm ON gm.student_id = c.user_id AND gm.group_id = ?', params.push(group);
  sql += ' WHERE 1=1';
  if (branch)  { sql += ' AND c.branch_id = ?';              params.push(branch); }
  if (status)  { sql += ' AND c.status = ?';                 params.push(status); }
  if (manager) { sql += ' AND c.responsible_manager_id = ?'; params.push(manager); }
  sql += ' ORDER BY c.full_name';
  res.json(db.prepare(sql).all(...params).map(mapCrm));
});

router.get('/students-crm/me-as-teacher', (req, res) => {
  if (!['teacher', 'assistant', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Только teacher/assistant' });
  }
  const myGroups = teacherGroups(req.user.id);
  if (!myGroups.length) return res.json([]);
  const placeholders = myGroups.map(() => '?').join(',');
  const seeBalance = isAdmin(req) || hasPermission(req.user.id, 'see_subscription_balance');

  const rows = db.prepare(`
    SELECT DISTINCT c.* FROM students_crm c
    JOIN group_members gm ON gm.student_id = c.user_id
    WHERE gm.group_id IN (${placeholders})
    ORDER BY c.full_name
  `).all(...myGroups);

  res.json(rows.map(r => {
    const o = mapCrm(r);
    if (!seeBalance) { o.visitsLeft = null; o.subscriptionIssuedAt = null; o.tariffId = null; }
    return o;
  }));
});

router.get('/students-crm/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM students_crm WHERE user_id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });

  if (!isAdmin(req)) {
    const myGroups = teacherGroups(req.user.id);
    const inGroup = myGroups.length && db.prepare(
      `SELECT 1 FROM group_members WHERE student_id=? AND group_id IN (${myGroups.map(()=>'?').join(',')})`
    ).get(req.params.id, ...myGroups);
    if (!inGroup) return res.status(403).json({ error: 'Нет доступа' });
    const out = mapCrm(row);
    if (!hasPermission(req.user.id, 'see_subscription_balance')) {
      out.visitsLeft = null; out.subscriptionIssuedAt = null; out.tariffId = null;
    }
    return res.json(out);
  }
  res.json(mapCrm(row));
});

router.post('/students-crm', requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.userId || !b.fullName) {
    return res.status(400).json({ error: 'userId, fullName обязательны' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id=?').get(b.userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  db.prepare(`
    INSERT INTO students_crm
      (user_id, full_name, birth_date, gender, branch_id, tariff_id,
       subscription_issued_at, visits_left, status, responsible_manager_id,
       parent_name, parent_phone, document_id, comment, video_consent, video_consent_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.userId, String(b.fullName).trim(),
    b.birthDate || null, b.gender || null,
    b.branchId || null, b.tariffId || null,
    b.subscriptionIssuedAt ? Number(b.subscriptionIssuedAt) : null,
    b.visitsLeft != null ? Number(b.visitsLeft) : 0,
    b.status || 'active',
    b.responsibleManagerId || null,
    b.parentName || null, b.parentPhone || null,
    b.documentId || null, b.comment || null,
    b.videoConsent ? 1 : 0,
    b.videoConsentDate ? Number(b.videoConsentDate) : null
  );
  res.status(201).json(mapCrm(db.prepare('SELECT * FROM students_crm WHERE user_id=?').get(b.userId)));
});

router.put('/students-crm/:id', requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM students_crm WHERE user_id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Не найден' });
  const b = req.body || {};
  const pick = (k, dbKey, num) => {
    if (b[k] === undefined) return row[dbKey];
    if (num) return b[k] == null ? null : Number(b[k]);
    return b[k];
  };
  db.prepare(`
    UPDATE students_crm SET
      full_name=?, birth_date=?, gender=?, branch_id=?, tariff_id=?,
      subscription_issued_at=?, visits_left=?, status=?, responsible_manager_id=?,
      parent_name=?, parent_phone=?, document_id=?, comment=?,
      video_consent=?, video_consent_date=?
    WHERE user_id=?
  `).run(
    b.fullName ? String(b.fullName).trim() : row.full_name,
    pick('birthDate','birth_date'),
    pick('gender','gender'),
    pick('branchId','branch_id'),
    pick('tariffId','tariff_id'),
    pick('subscriptionIssuedAt','subscription_issued_at', true),
    pick('visitsLeft','visits_left', true),
    b.status || row.status,
    pick('responsibleManagerId','responsible_manager_id'),
    pick('parentName','parent_name'),
    pick('parentPhone','parent_phone'),
    pick('documentId','document_id'),
    pick('comment','comment'),
    b.videoConsent !== undefined ? (b.videoConsent ? 1 : 0) : row.video_consent,
    pick('videoConsentDate','video_consent_date', true),
    req.params.id
  );
  res.json(mapCrm(db.prepare('SELECT * FROM students_crm WHERE user_id=?').get(req.params.id)));
});

router.delete('/students-crm/:id', requireRole('admin'), (req, res) => {
  const info = db.prepare('DELETE FROM students_crm WHERE user_id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Не найден' });
  res.json({ ok: true });
});

/* ============================================================
   TEACHER PERMISSIONS
   ============================================================ */
router.get('/teacher-permissions/:teacherId', (req, res) => {
  // admin или сам учитель
  if (!isAdmin(req) && req.user.id !== req.params.teacherId) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  const rows = db.prepare(
    'SELECT permission_key, value FROM teacher_permissions WHERE teacher_id=?'
  ).all(req.params.teacherId);
  const out = {};
  rows.forEach(r => { out[r.permission_key] = !!r.value; });
  res.json(out);
});

router.put('/teacher-permissions/:teacherId', requireRole('admin'), (req, res) => {
  const t = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.teacherId);
  if (!t) return res.status(404).json({ error: 'Учитель не найден' });
  const perms = req.body || {};
  const upsert = db.prepare(`
    INSERT INTO teacher_permissions (teacher_id, permission_key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(teacher_id, permission_key) DO UPDATE SET value=excluded.value
  `);
  const txn = db.transaction(() => {
    Object.entries(perms).forEach(([k, v]) => {
      upsert.run(req.params.teacherId, String(k), v ? 1 : 0);
    });
  });
  txn();
  const rows = db.prepare(
    'SELECT permission_key, value FROM teacher_permissions WHERE teacher_id=?'
  ).all(req.params.teacherId);
  const out = {};
  rows.forEach(r => { out[r.permission_key] = !!r.value; });
  res.json(out);
});

module.exports = router;

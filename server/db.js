/* ============================================================
   KURSOR — Доступ к SQLite (better-sqlite3, синхронный API)
   ============================================================ */
/*Иу*/
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'kursor.sqlite');
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  login         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),
  age           INTEGER DEFAULT 0,
  group_id      INTEGER DEFAULT 0,
  languages     TEXT DEFAULT '[]',
  teacher_id    TEXT,
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_teacher  ON users(teacher_id);

CREATE TABLE IF NOT EXISTS progress (
  user_id     TEXT PRIMARY KEY,
  points      INTEGER NOT NULL DEFAULT 0,
  streak      INTEGER NOT NULL DEFAULT 0,
  last_active INTEGER,
  badges      TEXT NOT NULL DEFAULT '["beginner"]',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_progress (
  user_id      TEXT NOT NULL,
  task_id      INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK(status IN ('progress','done')),
  points       INTEGER NOT NULL DEFAULT 0,
  attempts     INTEGER NOT NULL DEFAULT 0,
  used_hint    INTEGER NOT NULL DEFAULT 0,
  submission   TEXT,
  completed_at INTEGER,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, task_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_progress_user ON task_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_task ON task_progress(task_id);

CREATE TABLE IF NOT EXISTS modules (
  id          TEXT PRIMARY KEY,
  lang        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  video       TEXT,
  explanation TEXT,
  position    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id              INTEGER PRIMARY KEY,
  module_id       TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('quiz','fill','order','code','project','scratch','blockly','htmlcss','java','cpp')),
  title           TEXT NOT NULL,
  description     TEXT,
  difficulty      INTEGER DEFAULT 1,
  explain         TEXT,
  options         TEXT,
  answer          TEXT,
  items           TEXT,
  expected_output TEXT,
  starter         TEXT,
  stdin           TEXT,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_module ON tasks(module_id);

CREATE TABLE IF NOT EXISTS lessons (
  module_id    TEXT PRIMARY KEY,
  intro        TEXT NOT NULL DEFAULT '[]',
  mini_task    TEXT,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id      TEXT NOT NULL,
  module_id    TEXT NOT NULL,
  intro_step   INTEGER NOT NULL DEFAULT 0,
  intro_done   INTEGER NOT NULL DEFAULT 0,
  mini_done    INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, module_id),
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id);
`);

/* ============================================================
   ФАЗА 1 — Фидбек, материалы, доступ учителей к курсам
   ============================================================ */
db.exec(`
CREATE TABLE IF NOT EXISTS feedback (
  id                TEXT PRIMARY KEY,
  teacher_id        TEXT NOT NULL,
  student_id        TEXT NOT NULL,
  type              TEXT NOT NULL CHECK(type IN ('lesson','course','general')),
  module_id         TEXT,
  lesson_session_id TEXT,
  text              TEXT NOT NULL,
  is_internal       INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_feedback_student  ON feedback(student_id);
CREATE INDEX IF NOT EXISTS idx_feedback_teacher  ON feedback(teacher_id);

CREATE TABLE IF NOT EXISTS materials (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL,
  type        TEXT NOT NULL CHECK(type IN ('presentation','task','text','file')),
  title       TEXT NOT NULL,
  content     TEXT,
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (course_id) REFERENCES modules(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course_id);

CREATE TABLE IF NOT EXISTS teacher_course_access (
  id          TEXT PRIMARY KEY,
  teacher_id  TEXT NOT NULL,
  course_id   TEXT NOT NULL,
  granted_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  granted_by  TEXT NOT NULL,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES modules(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tca_teacher ON teacher_course_access(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tca_course  ON teacher_course_access(course_id);
`);

/* ============================================================
   ФАЗА 2 — CRM-ядро: филиалы, тарифы, группы, карточки клиентов
   ============================================================ */
db.exec(`
CREATE TABLE IF NOT EXISTS branches (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  address TEXT
);

CREATE TABLE IF NOT EXISTS tariffs (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  visits_count           INTEGER NOT NULL,
  duration_days          INTEGER NOT NULL,
  price                  INTEGER DEFAULT 0,
  extra_lessons_separate INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS groups (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  course_id    TEXT,
  branch_id    TEXT NOT NULL,
  teacher_id   TEXT NOT NULL,
  assistant_id TEXT,
  lesson_kind  TEXT NOT NULL CHECK(lesson_kind IN ('main','extra')),
  status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  FOREIGN KEY (branch_id)    REFERENCES branches(id),
  FOREIGN KEY (teacher_id)   REFERENCES users(id),
  FOREIGN KEY (assistant_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_groups_branch  ON groups(branch_id);
CREATE INDEX IF NOT EXISTS idx_groups_teacher ON groups(teacher_id);
CREATE INDEX IF NOT EXISTS idx_groups_assist  ON groups(assistant_id);

CREATE TABLE IF NOT EXISTS group_schedule (
  id           TEXT PRIMARY KEY,
  group_id     TEXT NOT NULL,
  weekday      INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  start_time   TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sched_group ON group_schedule(group_id);

CREATE TABLE IF NOT EXISTS group_members (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  group_id   TEXT NOT NULL,
  since      INTEGER NOT NULL,
  until      INTEGER,
  FOREIGN KEY (student_id) REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (group_id)   REFERENCES groups(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gm_student ON group_members(student_id);
CREATE INDEX IF NOT EXISTS idx_gm_group   ON group_members(group_id);

CREATE TABLE IF NOT EXISTS students_crm (
  user_id                TEXT PRIMARY KEY,
  full_name              TEXT NOT NULL,
  birth_date             TEXT,
  gender                 TEXT CHECK(gender IN ('m','f') OR gender IS NULL),
  branch_id              TEXT,
  tariff_id              TEXT,
  subscription_issued_at INTEGER,
  visits_left            INTEGER DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','frozen','inactive')),
  responsible_manager_id TEXT,
  parent_name            TEXT,
  parent_phone           TEXT,
  document_id            TEXT,
  comment                TEXT,
  video_consent          INTEGER NOT NULL DEFAULT 0,
  video_consent_date     INTEGER,
  FOREIGN KEY (user_id)               REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (branch_id)             REFERENCES branches(id),
  FOREIGN KEY (tariff_id)             REFERENCES tariffs(id),
  FOREIGN KEY (responsible_manager_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_crm_branch  ON students_crm(branch_id);
CREATE INDEX IF NOT EXISTS idx_crm_status  ON students_crm(status);
CREATE INDEX IF NOT EXISTS idx_crm_manager ON students_crm(responsible_manager_id);

CREATE TABLE IF NOT EXISTS teacher_permissions (
  teacher_id     TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  value          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (teacher_id, permission_key),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// Миграция: добавляем avatar_url в старые базы (в SQLite нет IF NOT EXISTS для колонок)
try {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  if (!cols.some(c => c.name === 'avatar_url')) {
    db.prepare("ALTER TABLE users ADD COLUMN avatar_url TEXT").run();
  }
} catch {}

// Миграция: расширяем CHECK constraint tasks.type для новых типов (scratch, blockly, htmlcss, java, cpp)
// SQLite не поддерживает ALTER TABLE для изменения CHECK — пересоздаём таблицу
try {
  const tasksSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
  const needsMigration = tasksSql && !tasksSql.sql.includes("'java'");
  if (needsMigration) {
    // собираем список колонок в старой таблице — копируем только их
    const oldCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
    const newCols = ['id','module_id','type','title','description','difficulty','explain',
                     'options','answer','items','expected_output','starter'];
    if (oldCols.includes('scratch_project_id')) newCols.push('scratch_project_id');
    if (oldCols.includes('stdin')) newCols.push('stdin');
    const copyCols = newCols.filter(c => oldCols.includes(c)).join(',');
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE tasks RENAME TO tasks_old;
      CREATE TABLE tasks (
        id              INTEGER PRIMARY KEY,
        module_id       TEXT NOT NULL,
        type            TEXT NOT NULL CHECK(type IN ('quiz','fill','order','code','project','scratch','blockly','htmlcss','java','cpp')),
        title           TEXT NOT NULL,
        description     TEXT,
        difficulty      INTEGER DEFAULT 1,
        explain         TEXT,
        options         TEXT,
        answer          TEXT,
        items           TEXT,
        expected_output TEXT,
        starter         TEXT,
        stdin           TEXT,
        scratch_project_id TEXT,
        FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
      );
      INSERT INTO tasks (${copyCols}) SELECT ${copyCols} FROM tasks_old;
      DROP TABLE tasks_old;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
    console.log('[db] Миграция tasks: CHECK расширен (java, cpp), добавлены stdin, scratch_project_id.');
  }
} catch (e) {
  console.error('[db] Ошибка миграции tasks:', e.message);
}

// Миграция: добавляем отдельные колонки, если их нет
try {
  const cols = db.prepare("PRAGMA table_info(tasks)").all();
  if (!cols.some(c => c.name === 'scratch_project_id')) {
    db.prepare("ALTER TABLE tasks ADD COLUMN scratch_project_id TEXT").run();
    console.log('[db] Миграция tasks: добавлена колонка scratch_project_id');
  }
  if (!cols.some(c => c.name === 'stdin')) {
    db.prepare("ALTER TABLE tasks ADD COLUMN stdin TEXT").run();
    console.log('[db] Миграция tasks: добавлена колонка stdin');
  }
} catch {}

module.exports = db;

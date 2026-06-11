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
  type            TEXT NOT NULL CHECK(type IN ('quiz','fill','order','code','project','scratch','blockly','htmlcss')),
  title           TEXT NOT NULL,
  description     TEXT,
  difficulty      INTEGER DEFAULT 1,
  explain         TEXT,
  options         TEXT,
  answer          TEXT,
  items           TEXT,
  expected_output TEXT,
  starter         TEXT,
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

// Миграция: добавляем avatar_url в старые базы (в SQLite нет IF NOT EXISTS для колонок)
try {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  if (!cols.some(c => c.name === 'avatar_url')) {
    db.prepare("ALTER TABLE users ADD COLUMN avatar_url TEXT").run();
  }
} catch {}

// Миграция: расширяем CHECK constraint tasks.type для новых типов (scratch, blockly, htmlcss)
// SQLite не поддерживает ALTER TABLE для изменения CHECK — пересоздаём таблицу
try {
  const tasksSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
  const needsMigration = tasksSql && !tasksSql.sql.includes("'scratch'");
  if (needsMigration) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE tasks RENAME TO tasks_old;
      CREATE TABLE tasks (
        id              INTEGER PRIMARY KEY,
        module_id       TEXT NOT NULL,
        type            TEXT NOT NULL CHECK(type IN ('quiz','fill','order','code','project','scratch','blockly','htmlcss')),
        title           TEXT NOT NULL,
        description     TEXT,
        difficulty      INTEGER DEFAULT 1,
        explain         TEXT,
        options         TEXT,
        answer          TEXT,
        items           TEXT,
        expected_output TEXT,
        starter         TEXT,
        FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
      );
      INSERT INTO tasks SELECT * FROM tasks_old;
      DROP TABLE tasks_old;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
    console.log('[db] Миграция tasks: CHECK constraint обновлён для новых типов.');
  }
} catch (e) {
  console.error('[db] Ошибка миграции tasks:', e.message);
}

// Миграция: добавляем scratch_project_id в старые базы
try {
  const cols = db.prepare("PRAGMA table_info(tasks)").all();
  if (!cols.some(c => c.name === 'scratch_project_id')) {
    db.prepare("ALTER TABLE tasks ADD COLUMN scratch_project_id TEXT").run();
    console.log('[db] Миграция tasks: добавлена колонка scratch_project_id');
  }
} catch {}

module.exports = db;

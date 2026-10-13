const path = require("node:path");

const useMySQL = process.env.DB_CLIENT === "mysql";

if (useMySQL) {
  const mysql = require("mysql2/promise");
  module.exports = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "noticehub",
    waitForConnections: true,
    connectionLimit: 10
  });
} else {
  const { DatabaseSync } = require("node:sqlite");
  const filename = process.env.SQLITE_FILE || path.join(__dirname, "noticehub.sqlite");
  const database = new DatabaseSync(filename);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Normal', 'Important', 'Urgent')),
      audience TEXT NOT NULL DEFAULT 'All Students',
      target_department TEXT,
      target_year INTEGER,
      target_semester INTEGER,
      expiry_date TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notice_reads (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notice_id INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, notice_id)
    );
  `);

  const userTable = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();

  if (userTable?.sql && !userTable.sql.includes("'teacher'")) {
    database.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users_new (id, name, email, password, role, created_at)
        SELECT id, name, email, password, role, created_at FROM users;
      CREATE TABLE notices_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Normal', 'Important', 'Urgent')),
        audience TEXT NOT NULL DEFAULT 'All Students',
        expiry_date TEXT,
        created_by INTEGER NOT NULL REFERENCES users_new(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO notices_new (id, title, content, category, priority, audience, expiry_date, created_by, created_at)
        SELECT id, title, content, category, priority, audience, expiry_date, created_by, created_at FROM notices;
      CREATE TABLE notice_reads_new (
        user_id INTEGER NOT NULL REFERENCES users_new(id) ON DELETE CASCADE,
        notice_id INTEGER NOT NULL REFERENCES notices_new(id) ON DELETE CASCADE,
        read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, notice_id)
      );
      INSERT INTO notice_reads_new (user_id, notice_id, read_at)
        SELECT user_id, notice_id, read_at FROM notice_reads;
      DROP TABLE notice_reads;
      DROP TABLE notices;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      ALTER TABLE notices_new RENAME TO notices;
      ALTER TABLE notice_reads_new RENAME TO notice_reads;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  const ensureColumns = (table, columns) => {
    const existing = new Set(
      database.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name)
    );
    for (const [name, definition] of Object.entries(columns)) {
      if (!existing.has(name)) {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
    }
  };

  ensureColumns("users", {
    department: "TEXT",
    year: "INTEGER",
    semester: "INTEGER"
  });
  ensureColumns("notices", {
    target_department: "TEXT",
    target_year: "INTEGER",
    target_semester: "INTEGER"
  });

  module.exports = {
    async query(statement, parameters = []) {
      const sql = statement
        .replaceAll("CURDATE()", "date('now', 'localtime')")
        .replace(
          "FIELD(n.priority, 'Urgent', 'Important', 'Normal')",
          "CASE n.priority WHEN 'Urgent' THEN 1 WHEN 'Important' THEN 2 ELSE 3 END"
        )
        .replace(
          "ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP",
          "ON CONFLICT(user_id, notice_id) DO UPDATE SET read_at = CURRENT_TIMESTAMP"
        );

      if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)) {
        return [database.prepare(sql).all(...parameters)];
      }

      const result = database.prepare(sql).run(...parameters);
      return [{
        insertId: Number(result.lastInsertRowid),
        affectedRows: Number(result.changes)
      }];
    }
  };
}

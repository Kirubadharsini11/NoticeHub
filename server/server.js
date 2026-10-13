
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

dotenv.config();
const pool = require("./database");

const jwtSecret = process.env.JWT_SECRET || (
  process.env.NODE_ENV === "production"
    ? null
    : "NoticeHub-local-development-secret-change-before-deployment"
);

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "Please log in first." });
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    return res.status(401).json({
      message: "Your session is invalid or expired. Please log in again."
    });
  }
}

function staffOnly(req, res, next) {
  if (!["teacher", "admin"].includes(req.user.role)) {
    return res.status(403).json({
      message: "Only teachers and admins can manage notices."
    });
  }

  next();
}

function validateNotice(body) {
  const {
    title, content, category, priority, audience, expiry_date,
    target_department, target_year, target_semester
  } = body;

  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 200
  ) {
    return "Enter a title of up to 200 characters.";
  }

  if (
    typeof content !== "string" ||
    !content.trim() ||
    content.trim().length > 10000
  ) {
    return "Enter notice content of up to 10,000 characters.";
  }

  if (
    typeof category !== "string" ||
    !category.trim() ||
    category.trim().length > 80
  ) {
    return "Enter a valid category.";
  }

  if (
    priority !== undefined &&
    !["Normal", "Important", "Urgent"].includes(priority)
  ) {
    return "Invalid notice priority.";
  }

  if (
    audience !== undefined &&
    audience !== "All Students"
  ) {
    return "Only the All Students audience is supported currently.";
  }

  if (
    target_department !== undefined && target_department !== null &&
    target_department !== "" &&
    (typeof target_department !== "string" || target_department.trim().length > 80)
  ) {
    return "Department filters must be 80 characters or fewer.";
  }

  if (target_year !== undefined && target_year !== null && target_year !== "" &&
      (!Number.isInteger(Number(target_year)) || Number(target_year) < 1 || Number(target_year) > 4)) {
    return "Choose a valid target year.";
  }

  if (target_semester !== undefined && target_semester !== null && target_semester !== "" &&
      (!Number.isInteger(Number(target_semester)) || Number(target_semester) < 1 || Number(target_semester) > 8)) {
    return "Choose a valid target semester.";
  }

  if (
    expiry_date &&
    (typeof expiry_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(expiry_date) ||
      !Number.isFinite(Date.parse(`${expiry_date}T00:00:00Z`)) ||
      new Date(`${expiry_date}T00:00:00Z`).toISOString().slice(0, 10) !== expiry_date)
  ) {
    return "Expiry date must be a valid date in YYYY-MM-DD format.";
  }

  return null;
}

app.get("/", (req, res) => {
  res.send("NoticeHub API is running.");
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error(error.message);
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      name, email, password, role = "student",
      department = "", year, semester
    } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.trim().length > 100 ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 72 ||
      !["student", "teacher"].includes(role) ||
      (role === "student" && (
        typeof department !== "string" || !department.trim() ||
        department.trim().length > 80 ||
        !Number.isInteger(Number(year)) || Number(year) < 1 || Number(year) > 4 ||
        !Number.isInteger(Number(semester)) || Number(semester) < 1 || Number(semester) > 8
      ))
    ) {
      return res.status(400).json({
        message: "Enter a valid name and email. Password must be 8–72 characters."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password, role, department, year, semester)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(), email.trim().toLowerCase(), hashedPassword, role,
        role === "student" ? department.trim() : null,
        role === "student" ? Number(year) : null,
        role === "student" ? Number(semester) : null
      ]
    );

    res.status(201).json({
      message: "Registration successful. You can now log in.",
      id: result.insertId
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "This email is already registered."
      });
    }

    console.error(error);
    res.status(500).json({ message: "Registration failed." });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    const [rows] = await pool.query(
      `SELECT id, name, email, password, role, department, year, semester
       FROM users WHERE email = ?`,
      [email]
    );

    if (
      !rows.length ||
      !(await bcrypt.compare(password, rows[0].password))
    ) {
      return res.status(401).json({
        message: "Incorrect email or password."
      });
    }

    const user = rows[0];

    if (!jwtSecret || jwtSecret.length < 32) {
      return res.status(500).json({
        message: "Configure a JWT_SECRET of at least 32 characters."
      });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      jwtSecret,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        year: user.year,
        semester: user.semester
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Login failed." });
  }
});

app.get("/api/profile", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT name, email, role, department, year, semester FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Account not found." });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load your profile." });
  }
});

app.put("/api/profile", authenticate, async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({ message: "Only student profiles use department and term filters." });
  }

  const { department, year, semester } = req.body;
  if (
    typeof department !== "string" || !department.trim() || department.trim().length > 80 ||
    !Number.isInteger(Number(year)) || Number(year) < 1 || Number(year) > 4 ||
    !Number.isInteger(Number(semester)) || Number(semester) < 1 || Number(semester) > 8
  ) {
    return res.status(400).json({ message: "Enter a department, year 1–4, and semester 1–8." });
  }

  try {
    await pool.query(
      "UPDATE users SET department = ?, year = ?, semester = ? WHERE id = ?",
      [department.trim(), Number(year), Number(semester), req.user.id]
    );
    res.json({ department: department.trim(), year: Number(year), semester: Number(semester) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not update your profile." });
  }
});

// List current notices and read status
app.get("/api/notices", authenticate, async (req, res) => {
  try {
    const analytics = req.user.role === "admin"
      ? `,
        (SELECT COUNT(*)
         FROM notice_reads reach_reads
         JOIN users reach_users ON reach_users.id = reach_reads.user_id
         WHERE reach_reads.notice_id = n.id
           AND reach_users.role = 'student'
           AND (n.target_department IS NULL OR LOWER(TRIM(reach_users.department)) = LOWER(TRIM(n.target_department)))
           AND (n.target_year IS NULL OR reach_users.year = n.target_year)
           AND (n.target_semester IS NULL OR reach_users.semester = n.target_semester)
        ) AS read_count,
        (SELECT COUNT(*)
         FROM users audience_users
         WHERE audience_users.role = 'student'
           AND (n.target_department IS NULL OR LOWER(TRIM(audience_users.department)) = LOWER(TRIM(n.target_department)))
           AND (n.target_year IS NULL OR audience_users.year = n.target_year)
           AND (n.target_semester IS NULL OR audience_users.semester = n.target_semester)
           AND NOT EXISTS (
             SELECT 1 FROM notice_reads audience_reads
             WHERE audience_reads.notice_id = n.id AND audience_reads.user_id = audience_users.id
           )
        ) AS unread_count`
      : ", NULL AS read_count, NULL AS unread_count";

    const [rows] = await pool.query(
      `SELECT n.id, n.title, n.content, n.category, n.priority,
              n.audience, n.expiry_date, n.created_at,
              u.name AS author,
              CASE WHEN nr.user_id IS NULL THEN 0 ELSE 1 END AS is_read
              ${analytics}
       FROM notices n
       JOIN users u ON n.created_by = u.id
       LEFT JOIN notice_reads nr
         ON nr.notice_id = n.id AND nr.user_id = ?
       WHERE (n.expiry_date IS NULL OR n.expiry_date >= CURDATE())
         AND (? IN ('teacher', 'admin') OR n.audience = 'All Students')
         AND (? IN ('teacher', 'admin') OR EXISTS (
           SELECT 1 FROM users profile_user
           WHERE profile_user.id = ?
             AND (n.target_department IS NULL OR LOWER(TRIM(n.target_department)) = LOWER(TRIM(profile_user.department)))
             AND (n.target_year IS NULL OR n.target_year = profile_user.year)
             AND (n.target_semester IS NULL OR n.target_semester = profile_user.semester)
         ))
       ORDER BY FIELD(n.priority, 'Urgent', 'Important', 'Normal'),
                n.created_at DESC`,
      [req.user.id, req.user.role, req.user.role, req.user.id]
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load notices." });
  }
});

// Publish a notice
app.post("/api/notices", authenticate, staffOnly, async (req, res) => {
  const validationError = validateNotice(req.body);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  try {
    const {
      title, content, category, priority = "Normal",
      audience = "All Students", expiry_date = null,
      target_department = null, target_year = null, target_semester = null
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO notices
       (title, content, category, priority, audience, expiry_date,
        target_department, target_year, target_semester, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(), content.trim(), category.trim(),
        priority, audience, expiry_date || null,
        target_department?.trim() || null,
        target_year ? Number(target_year) : null,
        target_semester ? Number(target_semester) : null,
        req.user.id
      ]
    );

    res.status(201).json({
      message: "Notice published successfully.",
      id: result.insertId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not publish notice." });
  }
});

// Edit a notice
app.put("/api/notices/:id", authenticate, staffOnly, async (req, res) => {
  const validationError = validateNotice(req.body);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid notice ID." });
  }

  try {
    const {
      title, content, category, priority = "Normal",
      audience = "All Students", expiry_date = null,
      target_department = null, target_year = null, target_semester = null
    } = req.body;

    const [result] = await pool.query(
      `UPDATE notices
       SET title = ?, content = ?, category = ?, priority = ?,
           audience = ?, expiry_date = ?, target_department = ?,
           target_year = ?, target_semester = ?
       WHERE id = ?`,
      [
        title.trim(), content.trim(), category.trim(),
        priority, audience, expiry_date || null,
        target_department?.trim() || null,
        target_year ? Number(target_year) : null,
        target_semester ? Number(target_semester) : null,
        id
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Notice not found." });
    }

    res.json({ message: "Notice updated successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not update notice." });
  }
});

// Delete a notice
app.delete("/api/notices/:id", authenticate, staffOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid notice ID." });
  }

  try {
    const [result] = await pool.query(
      "DELETE FROM notices WHERE id = ?",
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Notice not found." });
    }

    res.json({ message: "Notice deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not delete notice." });
  }
});

// Mark a notice as read
app.post("/api/notices/:id/read", authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid notice ID." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id FROM notices
       WHERE id = ?
         AND (expiry_date IS NULL OR expiry_date >= CURDATE())`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Notice not found." });
    }

    await pool.query(
      `INSERT INTO notice_reads (user_id, notice_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
      [req.user.id, id]
    );

    res.json({ message: "Notice marked as read." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not mark notice as read." });
  }
});

async function startServer() {
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("Set JWT_SECRET to a random string of at least 32 characters in .env for production.");
  }

  await pool.query("SELECT 1");
  if (process.env.DB_CLIENT === "mysql") {
    const [userColumns] = await pool.query("SHOW COLUMNS FROM users");
    const userColumnNames = new Set(userColumns.map((column) => column.Field));
    if (!userColumnNames.has("department")) {
      await pool.query("ALTER TABLE users ADD COLUMN department VARCHAR(80) NULL");
    }
    if (!userColumnNames.has("year")) {
      await pool.query("ALTER TABLE users ADD COLUMN year TINYINT UNSIGNED NULL");
    }
    if (!userColumnNames.has("semester")) {
      await pool.query("ALTER TABLE users ADD COLUMN semester TINYINT UNSIGNED NULL");
    }

    const [noticeColumns] = await pool.query("SHOW COLUMNS FROM notices");
    const noticeColumnNames = new Set(noticeColumns.map((column) => column.Field));
    if (!noticeColumnNames.has("target_department")) {
      await pool.query("ALTER TABLE notices ADD COLUMN target_department VARCHAR(80) NULL");
    }
    if (!noticeColumnNames.has("target_year")) {
      await pool.query("ALTER TABLE notices ADD COLUMN target_year TINYINT UNSIGNED NULL");
    }
    if (!noticeColumnNames.has("target_semester")) {
      await pool.query("ALTER TABLE notices ADD COLUMN target_semester TINYINT UNSIGNED NULL");
    }

    await pool.query(
      "ALTER TABLE users MODIFY role ENUM('student', 'teacher', 'admin') NOT NULL DEFAULT 'student'"
    );
  }
  console.log("Database connection successful.");

  const port = Number(process.env.PORT) || 5000;

  app.listen(port, () => {
    console.log(`NoticeHub API running at http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Could not start NoticeHub:", error.message);
  process.exit(1);
});

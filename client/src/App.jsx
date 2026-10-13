
import React, { useCallback, useEffect, useMemo, useState } from "react";

const API = "http://localhost:5000/api";

const EMPTY_NOTICE = {
  title: "",
  content: "",
  category: "General",
  priority: "Normal",
  audience: "All Students",
  expiry_date: "",
  target_department: "",
  target_year: "",
  target_semester: ""
};

function deadlineAlert(expiryDate) {
  if (!expiryDate) return null;
  const date = String(expiryDate).slice(0, 10);
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const deadlineUtc = Date.UTC(year, month - 1, day);
  const daysLeft = Math.round((deadlineUtc - todayUtc) / 86400000);
  if (daysLeft < 0 || daysLeft > 7) return null;
  return daysLeft === 0 ? "Due today" : `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("noticehub_token") || ""
  );

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("noticehub_user")) || null;
    } catch {
      return null;
    }
  });

  const [mode, setMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "student",
    department: "",
    year: "1",
    semester: "1"
  });
  const [profileForm, setProfileForm] = useState(() => ({
    department: user?.department || "",
    year: user?.year ? String(user.year) : "1",
    semester: user?.semester ? String(user.semester) : "1"
  }));
  const [notices, setNotices] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_NOTICE });
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("noticehub_theme");
    return ["light", "dark", "system"].includes(saved) ? saved : "system";
  });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("noticehub_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const request = useCallback(async (path, options = {}) => {
    const headers = {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    };

    let response;

    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        headers
      });
    } catch {
      throw new Error(
        "Cannot reach the server. Check that the backend is running."
      );
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && token) {
        localStorage.removeItem("noticehub_token");
        localStorage.removeItem("noticehub_user");
        setToken("");
        setUser(null);
      }

      throw new Error(data.message || "Request failed.");
    }

    return data;
  }, [token]);

  const loadNotices = useCallback(async () => {
    try {
      const data = await request("/notices");
      setNotices(data);
    } catch (error) {
      setMessage(error.message);
    }
  }, [request]);

  useEffect(() => {
    if (token && user) {
      loadNotices();
    }
  }, [token, user, loadNotices]);

  async function handleAuth(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (mode === "register") {
        await request("/auth/register", {
          method: "POST",
          body: JSON.stringify(authForm)
        });

        setMessage("Account created! Please log in.");
        setMode("login");
        setAuthForm({
          name: "",
          email: authForm.email,
          password: "",
          role: authForm.role,
          department: "",
          year: "1",
          semester: "1"
        });
        return;
      }

      const data = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password
        })
      });

      localStorage.setItem("noticehub_token", data.token);
      localStorage.setItem("noticehub_user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setProfileForm({
        department: data.user.department || "",
        year: data.user.year ? String(data.user.year) : "1",
        semester: data.user.semester ? String(data.user.semester) : "1"
      });
      setMessage(`Welcome, ${data.user.name}!`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const profile = await request("/profile", {
        method: "PUT",
        body: JSON.stringify(profileForm)
      });
      const updatedUser = { ...user, ...profile };
      localStorage.setItem("noticehub_user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      setMessage("Your personalized feed has been updated.");
      await loadNotices();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("noticehub_token");
    localStorage.removeItem("noticehub_user");
    setToken("");
    setUser(null);
    setNotices([]);
    setForm({ ...EMPTY_NOTICE });
    setEditingId(null);
    setMessage("");
  }

  async function saveNotice(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const path = editingId
        ? `/notices/${editingId}`
        : "/notices";

      await request(path, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({
          ...form,
          expiry_date: form.expiry_date || null
        })
      });

      setMessage(editingId ? "Notice updated successfully." : "Notice published successfully.");
      setForm({ ...EMPTY_NOTICE });
      setEditingId(null);
      await loadNotices();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function editNotice(notice) {
    setEditingId(notice.id);
    setForm({
      title: notice.title,
      content: notice.content,
      category: notice.category,
      priority: notice.priority,
      audience: notice.audience,
      target_department: notice.target_department || "",
      target_year: notice.target_year ? String(notice.target_year) : "",
      target_semester: notice.target_semester ? String(notice.target_semester) : "",
      expiry_date: notice.expiry_date
        ? String(notice.expiry_date).slice(0, 10)
        : ""
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteNotice(id) {
    if (!window.confirm("Delete this notice permanently?")) return;

    try {
      await request(`/notices/${id}`, { method: "DELETE" });
      setMessage("Notice deleted.");
      await loadNotices();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function markRead(id) {
    try {
      await request(`/notices/${id}/read`, { method: "POST" });
      setMessage("Notice marked as read.");
      await loadNotices();
    } catch (error) {
      setMessage(error.message);
    }
  }

  const categories = useMemo(
    () => ["All", ...new Set(notices.map((notice) => notice.category))],
    [notices]
  );

  const filteredNotices = useMemo(() => {
    return notices.filter((notice) => {
      const searchableText =
        `${notice.title} ${notice.content} ${notice.category}`.toLowerCase();

      return (
        searchableText.includes(search.toLowerCase()) &&
        (categoryFilter === "All" ||
          notice.category === categoryFilter)
      );
    });
  }, [notices, search, categoryFilter]);

  const canManageNotices = ["teacher", "admin"].includes(user?.role);

  if (!token || !user) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-icon">N</div>
          <p className="eyebrow">CAMPUS COMMUNICATION</p>
          <h1>NoticeHub</h1>
          <p className="muted">
            College announcements, all in one place.
          </p>

          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "login" ? "tab active" : "tab"}
              onClick={() => {
                setMode("login");
                setMessage("");
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === "register" ? "tab active" : "tab"}
              onClick={() => {
                setMode("register");
                setMessage("");
              }}
            >
              Register
            </button>
          </div>

          <label className="auth-theme-control">
            Appearance
            <select aria-label="Color theme" value={theme} onChange={(event) => setTheme(event.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>

          <form className="form-stack" onSubmit={handleAuth}>
            {mode === "register" && (
              <>
                <label>
                  Full name
                  <input
                    required
                    maxLength={100}
                    value={authForm.name}
                    onChange={(event) =>
                      setAuthForm({
                        ...authForm,
                        name: event.target.value
                      })
                    }
                    placeholder="Enter your full name"
                  />
                </label>
                <label>
                  I am registering as
                  <select
                    value={authForm.role}
                    onChange={(event) =>
                      setAuthForm({ ...authForm, role: event.target.value })
                    }
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                  </select>
                </label>
                {authForm.role === "student" && (
                  <>
                    <label>
                      Department
                      <input
                        required
                        maxLength={80}
                        value={authForm.department}
                        onChange={(event) => setAuthForm({ ...authForm, department: event.target.value })}
                        placeholder="e.g. Computer Science"
                      />
                    </label>
                    <label>
                      Year
                      <select value={authForm.year} onChange={(event) => setAuthForm({ ...authForm, year: event.target.value })}>
                        {[1, 2, 3, 4].map((year) => <option key={year} value={year}>Year {year}</option>)}
                      </select>
                    </label>
                    <label>
                      Semester
                      <select value={authForm.semester} onChange={(event) => setAuthForm({ ...authForm, semester: event.target.value })}>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}
                      </select>
                    </label>
                  </>
                )}
              </>
            )}

            <label>
              Email address
              <input
                required
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm({
                    ...authForm,
                    email: event.target.value
                  })
                }
                placeholder="you@example.com"
              />
            </label>

            <label>
              Password
              <input
                required
                type="password"
                minLength={8}
                maxLength={72}
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm({
                    ...authForm,
                    password: event.target.value
                  })
                }
                placeholder="At least 8 characters"
              />
            </label>

            <button className="primary-btn" disabled={busy}>
              {busy
                ? "Please wait..."
                : mode === "login"
                  ? "Login to NoticeHub"
                  : "Create account"}
            </button>
          </form>

          {message && <p className="message">{message}</p>}
          <p className="footnote">Built with React, Express and SQLite</p>
        </section>
      </main>
    );
  }

  const unreadCount = notices.filter(
    (notice) => !Number(notice.is_read)
  ).length;

  return (
    <div className="app-layout">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className={`sidebar${menuOpen ? " is-open" : ""}`} id="app-navigation" aria-label="Main navigation">
        <a className="sidebar-brand" href="#feed" onClick={() => setMenuOpen(false)}>
          <span className="brand-icon small" aria-hidden="true">N</span>
          <span>
            <strong>NoticeHub</strong>
            <span className="sidebar-subtitle">Smart Digital Notice Board</span>
          </span>
        </a>
        <nav className="sidebar-nav" aria-label="Sections">
          <a href="#feed" onClick={() => setMenuOpen(false)}><span aria-hidden="true">▦</span> Notice feed</a>
          {user.role === "student" && <a href="#profile" onClick={() => setMenuOpen(false)}><span aria-hidden="true">◎</span> My feed profile</a>}
          {canManageNotices && <a href="#notice-management" onClick={() => setMenuOpen(false)}><span aria-hidden="true">＋</span> Manage notices</a>}
        </nav>
        <div className="sidebar-bottom">
          <span className="role-chip">{user.role}</span>
          <label className="theme-control" htmlFor="dashboard-theme">
            Appearance
            <select id="dashboard-theme" value={theme} onChange={(event) => setTheme(event.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
          <p className="sidebar-footnote">Campus notices, in one place.</p>
        </div>
      </aside>
      {menuOpen && <button className="menu-scrim" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <div className="workspace">
      <main className="app-shell" id="main-content">
      <header className="topbar">
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-controls="app-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
        </button>
        <div className="topbar-context">
          <span className="eyebrow">NOTICEHUB / {user.role.toUpperCase()}</span>
          <span className="topbar-title">{user.role === "student" ? "Campus updates" : "Notice workspace"}</span>
        </div>

        <div className="account">
          <div className="avatar">
            {user.name?.charAt(0).toUpperCase()}
          </div>
          <div className="account-info">
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>
          <button className="outline-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <section className="welcome" id="feed" aria-labelledby="feed-title">
        <div>
          <p className="eyebrow">YOUR CAMPUS, CONNECTED</p>
          <h1 id="feed-title">
            {user.role === "admin"
              ? "Admin dashboard"
              : user.role === "teacher"
                ? "Teacher dashboard"
                : "Campus notices"}
          </h1>
          <p className="muted">
            Stay updated with announcements, events and important information.
          </p>
        </div>

        <div className="stats">
          <div className="stat-card">
            <strong>{notices.length}</strong>
            <span>Active notices</span>
          </div>
          {user.role === "student" && (
            <div className="stat-card">
              <strong>{unreadCount}</strong>
              <span>Unread notices</span>
            </div>
          )}
        </div>
      </section>

      {user.role === "student" && (
        <section className="panel profile-panel" id="profile" aria-labelledby="profile-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PERSONALIZED FEED</p>
              <h2 id="profile-title">My department and term</h2>
            </div>
          </div>
          <form className="notice-form" onSubmit={saveProfile}>
            <label>
              Department
              <input
                required
                maxLength={80}
                value={profileForm.department}
                onChange={(event) => setProfileForm({ ...profileForm, department: event.target.value })}
                placeholder="e.g. Computer Science"
              />
            </label>
            <label>
              Year
              <select value={profileForm.year} onChange={(event) => setProfileForm({ ...profileForm, year: event.target.value })}>
                {[1, 2, 3, 4].map((year) => <option key={year} value={year}>{year}{["st", "nd", "rd", "th"][year - 1]} year</option>)}
              </select>
            </label>
            <label>
              Semester
              <select value={profileForm.semester} onChange={(event) => setProfileForm({ ...profileForm, semester: event.target.value })}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}
              </select>
            </label>
            <button className="primary-btn form-submit" disabled={busy}>Update my feed</button>
          </form>
        </section>
      )}

      {message && (
        <div className="message banner" role="status">
          <span>{message}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}

      {canManageNotices && (
        <section className="panel" id="notice-management" aria-labelledby="management-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">NOTICE MANAGEMENT</p>
              <h2 id="management-title">{editingId ? "Edit notice" : "Publish a notice"}</h2>
            </div>
            {editingId && (
              <button
                className="outline-btn"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm({ ...EMPTY_NOTICE });
                }}
              >
                Cancel edit
              </button>
            )}
          </div>

          <form className="notice-form" onSubmit={saveNotice}>
            <label>
              Notice title
              <input
                required
                maxLength={200}
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="e.g. Internal assessment timetable"
              />
            </label>

            <label>
              Category
              <select
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              >
                <option>General</option>
                <option>Examination</option>
                <option>Events</option>
                <option>Placement</option>
                <option>Holiday</option>
                <option>Department</option>
              </select>
            </label>

            <label>
              Priority
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value })
                }
              >
                <option>Normal</option>
                <option>Important</option>
                <option>Urgent</option>
              </select>
            </label>

            <label>
              Audience
              <select
                value={form.audience}
                onChange={(event) =>
                  setForm({ ...form, audience: event.target.value })
                }
              >
                <option>All Students</option>
              </select>
            </label>

            <label>
              Target department (optional)
              <input
                maxLength={80}
                value={form.target_department}
                onChange={(event) => setForm({ ...form, target_department: event.target.value })}
                placeholder="All departments if blank"
              />
            </label>

            <label>
              Target year (optional)
              <select value={form.target_year} onChange={(event) => setForm({ ...form, target_year: event.target.value })}>
                <option value="">All years</option>
                {[1, 2, 3, 4].map((year) => <option key={year} value={year}>Year {year}</option>)}
              </select>
            </label>

            <label>
              Target semester (optional)
              <select value={form.target_semester} onChange={(event) => setForm({ ...form, target_semester: event.target.value })}>
                <option value="">All semesters</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}
              </select>
            </label>

            <label>
              Deadline / expiry date (optional)
              <input
                type="date"
                value={form.expiry_date}
                onChange={(event) =>
                  setForm({ ...form, expiry_date: event.target.value })
                }
              />
            </label>

            <label className="full-width">
              Notice description
              <textarea
                required
                maxLength={10000}
                rows={4}
                value={form.content}
                onChange={(event) =>
                  setForm({ ...form, content: event.target.value })
                }
                placeholder="Enter the complete announcement..."
              />
            </label>

            <button className="primary-btn form-submit" disabled={busy}>
              {busy
                ? "Saving..."
                : editingId
                  ? "Update notice"
                  : "Publish notice"}
            </button>
          </form>
        </section>
      )}

      <section className="notice-section" aria-labelledby="notices-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LATEST UPDATES</p>
            <h2 id="notices-title">All notices</h2>
          </div>
          <button className="outline-btn" onClick={loadNotices}>
            Refresh
          </button>
        </div>

        <div className="filters">
          <input
            aria-label="Search notices"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title or content..."
          />
          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === "All" ? "All categories" : category}
              </option>
            ))}
          </select>
        </div>

        <div className="notice-grid">
          {filteredNotices.map((notice) => (
              <article className="notice-card" key={notice.id} aria-labelledby={`notice-title-${notice.id}`}>
              <div className="card-top">
                <span className="category-tag">{notice.category}</span>
                <span className={`priority ${notice.priority.toLowerCase()}`}>
                  {notice.priority}
                </span>
                  {deadlineAlert(notice.expiry_date) && (
                    <span className="deadline-alert">{deadlineAlert(notice.expiry_date)}</span>
                  )}
              </div>

              <h3 id={`notice-title-${notice.id}`}>{notice.title}</h3>
              <p className="notice-content">{notice.content}</p>

              <div className="notice-meta">
                <span>By {notice.author}</span>
                <span>
                  {notice.created_at
                    ? new Date(notice.created_at).toLocaleDateString()
                    : ""}
                </span>
              </div>

              {notice.expiry_date && (
                <p className="expiry">
                  Deadline: {String(notice.expiry_date).slice(0, 10)}
                </p>
              )}

              {user.role === "admin" && (
                <div className="reach-analytics" aria-label="Notice reach analytics">
                  <span><strong>{Number(notice.read_count) || 0}</strong> read</span>
                  <span><strong>{Number(notice.unread_count) || 0}</strong> unread</span>
                </div>
              )}

              <div className="card-actions">
                {user.role === "student" && (
                  <button
                    className={Number(notice.is_read) ? "read-btn done" : "read-btn"}
                    disabled={Boolean(Number(notice.is_read))}
                    onClick={() => markRead(notice.id)}
                  >
                    {Number(notice.is_read) ? "✓ Read" : "Mark as read"}
                  </button>
                )}

                {canManageNotices && (
                  <>
                    <button
                      className="read-btn"
                      onClick={() => editNotice(notice)}
                    >
                      Edit
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => deleteNotice(notice.id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>

        {filteredNotices.length === 0 && (
          <div className="empty-state">
            <span>📭</span>
            <h3>No notices found</h3>
            <p>Try another search or check back later.</p>
          </div>
        )}
      </section>

      <footer>NoticeHub · Making campus communication simpler</footer>
      </main>
      </div>
    </div>
  );
}

export default App;

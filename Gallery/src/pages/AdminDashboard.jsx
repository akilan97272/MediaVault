import { useState, useEffect, useCallback } from "react";
import BaseLayout from "../components/BaseLayout";
import { useTheme } from "../context/ThemeContext";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtSize(b) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
  return (b / 1073741824).toFixed(2) + " GB";
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

/* ── Animated count-up ─────────────────────────────────── */
function CountUp({ value }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!value) return;
    const start = performance.now();
    const from = 0, to = value;
    function frame(now) {
      const t = Math.min((now - start) / 700, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * ease));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, [value]);
  return <>{display}</>;
}

/* ── Stat Card ─────────────────────────────────────────── */
function StatCard({ emoji, bgClass, value, label, isString }) {
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statIcon, background: bgClass.bg, border: `1px solid ${bgClass.border}` }}>
        <span style={{ fontSize: "1.4rem" }}>{emoji}</span>
      </div>
      <div>
        <div style={s.statVal}>{isString ? value : <CountUp value={value} />}</div>
        <div style={s.statLbl}>{label}</div>
      </div>
    </div>
  );
}

/* ── Storage Bar ───────────────────────────────────────── */
function StorageBar({ name, files, size, pct }) {
  return (
    <div style={s.stoRow}>
      <div style={s.stoTop}>
        <span style={s.stoName}>{name}</span>
        <span style={s.stoMeta}>{files} file{files !== 1 ? "s" : ""} · {fmtSize(size)}</span>
      </div>
      <div style={s.stoBarBg}>
        <div style={{ ...s.stoBarFill, width: pct + "%" }} />
      </div>
    </div>
  );
}

/* ── Activity Item ─────────────────────────────────────── */
function ActivityItem({ event }) {
  const dotColors = {
    login:   { bg: "#4dd9ac", shadow: "rgba(77,217,172,0.5)" },
    gallery: { bg: "var(--accent)", shadow: "var(--accent-glow)" },
    upload:  { bg: "#b06cff", shadow: "rgba(160,80,255,0.5)" },
  };
  const dot = dotColors[event.action] || dotColors.gallery;
  return (
    <div style={s.actItem}>
      <div style={{ ...s.actDot, background: dot.bg, boxShadow: `0 0 6px ${dot.shadow}` }} />
      <div style={s.actInfo}>
        <div style={s.actWho}>{event.user} <span style={s.actAction}>{event.action}</span></div>
        <div style={s.actSub}>{event.device} · {event.ip}</div>
      </div>
      <div style={s.actTime}>{timeAgo(event.ts)}</div>
    </div>
  );
}

/* ── Modal: User Manager ────────────────────────────────── */
function UserManagerModal({ onClose }) {
  const [users, setUsers]               = useState([]);
  const [restrictions, setRestrictions] = useState({});
  const [newUser, setNewUser]           = useState("");
  const [newPass, setNewPass]           = useState("");
  const [msg, setMsg]                   = useState({ type: "", text: "" });
  const [savingUser, setSavingUser]     = useState(null);

  useEffect(() => { loadUsers(); loadRestrictions(); }, []);

  async function loadUsers() {
    const res = await fetch("/api/users");
    if (res.ok) {
      const d = await res.json();
      setUsers(Array.isArray(d) ? d : (d.users || []));
    }
  }

  async function loadRestrictions() {
    const res = await fetch("/api/restrictions");
    if (res.ok) {
      const d = await res.json();
      setRestrictions(d.restrictions || d || {});
    }
  }

  async function createUser() {
    const fd = new FormData();
    fd.append("username", newUser);
    fd.append("password", newPass);
    const res = await fetch("/api/users", { method: "POST", body: fd });
    const d = await res.json();
    if (res.ok) {
      setMsg({ type: "success", text: `User "${newUser}" created` });
      setNewUser(""); setNewPass("");
      loadUsers();
    } else {
      setMsg({ type: "error", text: d.error || "Failed" });
    }
  }

  async function deleteUser(username) {
    if (!confirm(`Delete user "${username}"?`)) return;
    await fetch(`/api/users/${username}`, { method: "DELETE" });
    loadUsers();
  }

  function getRestriction(username) {
    return restrictions[username] || { enabled: false, allowed_days: [] };
  }

  async function saveRestriction(username, next) {
    setSavingUser(username);
    setRestrictions((prev) => ({ ...prev, [username]: next }));
    try {
      const res = await fetch(`/api/restrictions/${username}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg({ type: "error", text: d.error || "Failed to update restriction" });
        loadRestrictions();
      }
    } catch {
      setMsg({ type: "error", text: "Network error updating restriction" });
      loadRestrictions();
    } finally {
      setSavingUser(null);
    }
  }

  function toggleEnabled(username) {
    const cur = getRestriction(username);
    saveRestriction(username, { ...cur, enabled: !cur.enabled });
  }

  function toggleDay(username, dayIdx) {
    const cur = getRestriction(username);
    const has = cur.allowed_days.includes(dayIdx);
    const allowed_days = has
      ? cur.allowed_days.filter((d) => d !== dayIdx)
      : [...cur.allowed_days, dayIdx].sort();
    saveRestriction(username, { ...cur, allowed_days });
  }

  async function clearRestriction(username) {
    setSavingUser(username);
    try {
      const res = await fetch(`/api/restrictions/${username}`, { method: "DELETE" });
      if (res.ok) {
        setRestrictions((prev) => {
          const next = { ...prev };
          delete next[username];
          return next;
        });
      }
    } finally {
      setSavingUser(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage Users</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h3 style={um.sectionTitle}>Add New User</h3>
            {msg.text && <div className={msg.type === "error" ? "error-pill" : "success-pill"}>{msg.text}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <input className="glass-input" placeholder="Username" value={newUser} onChange={(e) => setNewUser(e.target.value)} style={{ flex: 1 }} />
              <input className="glass-input" type="password" placeholder="Password" value={newPass} onChange={(e) => setNewPass(e.target.value)} style={{ flex: 1 }} />
              <button className="glass-btn-accent" onClick={createUser}>Add</button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h3 style={um.sectionTitle}>Existing Users</h3>
            {users.filter(u => u !== "admin").length === 0 && (
              <p style={{ fontSize: "0.82rem", color: "var(--text-3)", textAlign: "center", padding: "12px 0" }}>
                No users yet
              </p>
            )}
            {users.filter(u => u !== "admin").map((u) => {
              const r = getRestriction(u);
              const saving = savingUser === u;
              return (
                <div key={u} style={um.userCard}>
                  <div style={um.userTopRow}>
                    <div style={um.userNameWrap}>
                      <div style={um.avatar}>{u[0]?.toUpperCase()}</div>
                      <span style={um.userName}>{u}</span>
                    </div>
                    <button onClick={() => deleteUser(u)} style={um.deleteBtn}>
                      <svg viewBox="0 0 20 20" fill="none" width="13" height="13">
                        <path d="M5 6h10M8 6V4h4v2M7 9v6M10 9v6M13 9v6M6 6l.75 10h6.5L14 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Delete
                    </button>
                  </div>

                  <div style={um.restrictionRow}>
                    <button
                      style={{
                        ...um.toggle,
                        background: r.enabled ? "var(--accent)" : "rgba(128,128,128,0.18)",
                      }}
                      onClick={() => toggleEnabled(u)}
                      disabled={saving}
                      title={r.enabled ? "Disable access restriction" : "Enable access restriction"}
                    >
                      <span style={{
                        ...um.toggleKnob,
                        transform: r.enabled ? "translateX(16px)" : "translateX(0px)",
                      }} />
                    </button>
                    <span style={um.restrictionLabel}>
                      {r.enabled ? "Restricted access — allowed on:" : "No access restriction"}
                    </span>
                    {r.enabled && r.allowed_days.length > 0 && (
                      <button style={um.clearBtn} onClick={() => clearRestriction(u)} disabled={saving}>
                        Clear
                      </button>
                    )}
                  </div>

                  {r.enabled && (
                    <div style={um.dayRow}>
                      {WEEKDAYS.map((label, idx) => {
                        const active = r.allowed_days.includes(idx);
                        return (
                          <button
                            key={idx}
                            style={{
                              ...um.dayChip,
                              background: active ? "var(--accent-bg)" : "transparent",
                              border: active ? "1px solid var(--accent-border)" : "1px solid var(--glass-border)",
                              color: active ? "var(--accent)" : "var(--text-3)",
                              fontWeight: active ? 700 : 500,
                              opacity: saving ? 0.6 : 1,
                            }}
                            onClick={() => toggleDay(u, idx)}
                            disabled={saving}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const um = {
  sectionTitle: { fontSize: "0.86rem", fontWeight: 600, color: "var(--text-1)" },
  userCard: {
    display: "flex", flexDirection: "column", gap: 10,
    padding: "12px 14px", borderRadius: 14,
    background: "var(--glass-bg)",
    border: "1px solid var(--glass-border)",
  },
  userTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  userNameWrap: { display: "flex", alignItems: "center", gap: 9 },
  avatar: {
    width: 26, height: 26, borderRadius: "50%",
    background: "var(--accent-bg)", border: "1px solid var(--accent-border)",
    color: "var(--accent)", fontSize: "0.7rem", fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  userName: { fontSize: "0.9rem", fontWeight: 600, color: "var(--text-1)" },
  deleteBtn: {
    display: "flex", alignItems: "center", gap: 5,
    background: "rgba(255,107,107,0.1)",
    border: "1px solid rgba(255,107,107,0.3)",
    borderRadius: 8, padding: "5px 10px",
    color: "var(--error)", cursor: "pointer",
    fontSize: "0.76rem", fontWeight: 600, fontFamily: "inherit",
  },
  restrictionRow: {
    display: "flex", alignItems: "center", gap: 10,
    paddingTop: 8, borderTop: "1px solid var(--glass-border)",
    flexWrap: "wrap",
  },
  toggle: {
    width: 34, height: 18, borderRadius: 999,
    border: "none", cursor: "pointer", position: "relative",
    padding: 0, transition: "background 0.2s", flexShrink: 0,
  },
  toggleKnob: {
    position: "absolute", top: 2, left: 2,
    width: 14, height: 14, borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    transition: "transform 0.2s",
  },
  restrictionLabel: { fontSize: "0.78rem", color: "var(--text-2)", fontWeight: 500, flex: 1 },
  clearBtn: {
    background: "transparent",
    border: "1px solid var(--glass-border)",
    borderRadius: 8, padding: "3px 10px",
    color: "var(--text-3)", cursor: "pointer",
    fontSize: "0.72rem", fontWeight: 600, fontFamily: "inherit",
  },
  dayRow: { display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4 },
  dayChip: {
    padding: "5px 12px", borderRadius: 999,
    cursor: "pointer", fontSize: "0.76rem", fontFamily: "inherit",
    transition: "all 0.15s",
  },
};

/* ── Modal: Activity Log ────────────────────────────────── */
function ActivityLogModal({ onClose }) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/activity-log")
      .then((r) => r.json())
      .then((d) => {
        const raw = d.activities || d.activity || [];
        setActivity(raw.map((e) => ({
          ts:     (e.timestamp || e.ts || "").replace("T", " ").slice(0, 19),
          user:   e.username   || e.user   || "—",
          ip:     e.ip_address || e.ip     || "—",
          device: e.device_info
            ? `${e.device_info.browser || ""} · ${e.device_info.os || ""} · ${e.device_info.device_type || ""}`
            : (e.device || "—"),
          action: e.success === false ? "failed" : (e.action || "login"),
        })));
      })
      .catch((err) => console.error("[ActivityLogModal]", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Login Activity Log</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: "0.82rem", color: "var(--text-3)" }}>Device Connection History</p>
          {loading && <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><div className="loading-spinner" /></div>}
          {!loading && activity.length === 0 && <p style={{ color: "var(--text-3)", fontSize: "0.86rem", textAlign: "center", padding: 24 }}>No activity recorded yet</p>}
          {activity.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid var(--glass-border)" }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: a.action === "failed" ? "var(--error)" : "#4dd9ac",
                marginTop: 5, flexShrink: 0,
                boxShadow: `0 0 6px ${a.action === "failed" ? "rgba(255,107,107,0.5)" : "rgba(77,217,172,0.5)"}`,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--text-1)" }}>
                  {a.user} <span style={{ fontWeight: 400, color: "var(--text-3)" }}>
                    {a.action === "failed" ? "failed to log in" : `logged in (${a.action})`}
                  </span>
                </div>
                <div style={{ fontSize: "0.74rem", color: "var(--text-3)", marginTop: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {a.device} · {a.ip}
                </div>
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-3)", whiteSpace: "nowrap", flexShrink: 0, marginTop: 2 }}>
                {timeAgo(a.ts)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Mobile Capsule TopBar ─────────────────────────────── */
const ADMIN_HINT_KEY = "mv-admin-hint-seen";

function AdminTopBar() {
  const { toggleTheme } = useTheme();
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(ADMIN_HINT_KEY)) {
      const t = setTimeout(() => setShowHint(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  function dismissHint() {
    localStorage.setItem(ADMIN_HINT_KEY, "1");
    setShowHint(false);
  }

  function handleClick() {
    toggleTheme();
    dismissHint();
  }

  return (
    <>
      <style>{`
        .adm-topbar-mobile { display: none; }
        @media (max-width: 767px) {
          .adm-topbar-mobile {
            display: flex;
            justify-content: center;
            align-items: center;
            position: fixed;
            top: 12px; left: 0; right: 0;
            z-index: 220;
            background: transparent;
            pointer-events: none;
          }
        }
        .adm-capsule {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 20px;
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur)) saturate(180%);
          -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
          border: 1px solid var(--glass-border);
          border-radius: 999px;
          box-shadow: 0 1px 0 var(--glass-shine) inset, 0 8px 24px var(--glass-shadow);
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          pointer-events: auto;
          transition: transform 0.15s, opacity 0.15s;
        }
        .adm-capsule:active { transform: scale(0.95); opacity: 0.85; }
        .adm-capsule-name {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          font-size: 0.95rem;
          font-weight: 400;
          color: var(--text-1);
          line-height: 1;
          letter-spacing: -0.2px;
        }
        .adm-hint-bubble {
          position: absolute;
          top: calc(100% + 8px); left: 50%;
          transform: translateX(-50%);
          background: var(--glass-bg);
          backdrop-filter: blur(14px);
          border: 1px solid var(--glass-border);
          border-radius: 12px;
          padding: 10px 16px;
          font-size: 0.74rem;
          color: var(--text-2);
          white-space: nowrap;
          box-shadow: 0 8px 24px var(--glass-shadow);
          pointer-events: none;
          z-index: 10;
          line-height: 1.7;
          animation: admHintIn 0.3s ease;
        }
        @keyframes admHintIn {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      <div className="adm-topbar-mobile">
        <button
          className="adm-capsule"
          onClick={handleClick}
          aria-label="Toggle theme"
        >
          <span className="adm-capsule-name">MediaVault · Admin</span>
        </button>
        {showHint && (
          <div className="adm-hint-bubble">
            ✦ Tap to switch theme
          </div>
        )}
      </div>
    </>
  );
}

/* ── Main AdminDashboard ───────────────────────────────── */
export default function AdminDashboard() {
  const { toggleTheme } = useTheme();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [showUserManager, setShowUserManager] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);

  const loadDashboard = useCallback(async () => {
    setSpinning(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.status === 403) { window.location.href = "/gallery"; return; }
      setData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); setSpinning(false); }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const storageEntries = data?.user_stats
    ? Object.entries(data.user_stats).sort((a, b) => b[1].size - a[1].size)
    : [];
  const maxSize = storageEntries.length
    ? Math.max(...storageEntries.map((e) => e[1].size), 1) : 1;

  // User-wise upload distribution — most recently active user first.
  // Users with zero files are skipped (nothing to report).
  const uploadsByUser = data?.user_stats
    ? Object.entries(data.user_stats)
        .filter(([, stat]) => stat.files > 0)
        .sort((a, b) => new Date(b[1].last_upload || 0) - new Date(a[1].last_upload || 0))
    : [];

  return (
    <BaseLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinning { animation: spin 0.6s linear infinite; }
        .file-thumb:hover { transform: scale(1.03); }

        /* ── Responsive overrides ── */
        .adm-mobile-actions { display: none; }
        @media (max-width: 767px) {
          .adm-wrap      { padding: 60px 12px 40px !important; }
          .adm-header    { display: none !important; }
          .adm-mobile-actions { display: flex !important; }
          .adm-stat-row  { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          .adm-mid-grid  { grid-template-columns: 1fr !important; }
          .adm-stat-val  { font-size: 1.35rem !important; }
          .adm-stat-icon { width: 36px !important; height: 36px !important; }
          .adm-files-grid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)) !important; }
          .adm-uploads-list { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 768px) {
          .adm-header { display: flex !important; }
        }
      `}</style>

      {/* Mobile capsule topbar */}
      <AdminTopBar />

      <div style={s.wrap} className="adm-wrap">

        {/* ── Desktop header ── */}
        <div className="glass-card adm-header" style={s.header}>
          <h1 style={{ ...s.title, textAlign: "left", flex: "unset" }}>Admin Dashboard</h1>
          <div style={{ ...s.headerRight, flex: 1, justifyContent: "flex-end" }}>
            <button style={s.navPillBtn} onClick={() => setShowUserManager(true)}>
              <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" />
                <path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Manage Users
            </button>
            <button style={s.navPillBtn} onClick={() => setShowActivityLog(true)}>
              <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.4" />
                <path d="M7 8h6M7 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Activity Log
            </button>
            <button style={s.iconBtn} onClick={toggleTheme} title="Toggle theme">
              <svg className="icon-sun" viewBox="0 0 24 24" fill="none" width="16" height="16">
                <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <svg className="icon-moon" viewBox="0 0 24 24" fill="none" width="16" height="16">
                <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <svg className="icon-refresh" viewBox="0 0 24 24" fill="none" width="16" height="16">
                <path d="M4 4v6h6M20 20v-6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 14a8 8 0 0014.5 3M19 10A8 8 0 004.5 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <a href="/logout" style={s.signOutBtn}>
              <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                <path d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M13 14l3-4-3-4M16 10H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sign out
            </a>
          </div>
        </div>

        {/* ── Mobile actions (adm-header is hidden below 768px) ── */}
        <div className="glass-card adm-mobile-actions" style={s.mobileActions}>
          <button style={s.mobileActionBtn} onClick={() => setShowUserManager(true)}>
            <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
              <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Users
          </button>
          <button style={s.mobileActionBtn} onClick={() => setShowActivityLog(true)}>
            <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.4" />
              <path d="M7 8h6M7 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Activity
          </button>
          <a href="/logout" style={s.mobileActionBtn}>
            <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
              <path d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M13 14l3-4-3-4M16 10H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sign out
          </a>
        </div>

        {showUserManager && <UserManagerModal onClose={() => setShowUserManager(false)} />}
        {showActivityLog && <ActivityLogModal onClose={() => setShowActivityLog(false)} />}

        {/* ── Stat Cards ── */}
        <div style={s.statRow} className="adm-stat-row">
          <StatCard emoji="👥" bgClass={{ bg: "rgba(99,185,255,0.15)",  border: "rgba(99,185,255,0.25)"  }} value={data?.total_users  || 0} label="Total Users" />
          <StatCard emoji="🟢" bgClass={{ bg: "rgba(77,217,172,0.15)",  border: "rgba(77,217,172,0.25)"  }} value={data?.active_today || 0} label="Active Today" />
          <StatCard emoji="🖼"  bgClass={{ bg: "rgba(160,80,255,0.15)", border: "rgba(160,80,255,0.25)"  }} value={data?.total_files  || 0} label="Total Files" />
          <StatCard emoji="💾" bgClass={{ bg: "rgba(255,165,0,0.15)",   border: "rgba(255,165,0,0.25)"   }} value={data ? fmtSize(data.total_size) : "—"} label="Storage Used" isString />
        </div>

        {/* ── Mobile refresh button ──
        <div style={{ display: "flex", justifyContent: "flex-end" }} className="adm-mobile-refresh">
          <button
            className={spinning ? "spinning" : ""}
            style={{ ...s.iconBtn, fontSize: "1.1rem" }}
            onClick={loadDashboard}
            title="Refresh"
          >↻</button>
        </div> */}

        {/* ── Mid grid: Activity + Storage ── */}
        <div style={s.midGrid} className="adm-mid-grid">
          <div className="glass-card" style={s.panel}>
            <div style={s.panelHead}>
              <span style={s.panelTitle}>Recent Activity</span>
              <span style={s.panelBadge}>{data?.recent_activity?.length ?? "—"} events</span>
            </div>
            <div style={s.actFeed}>
              {loading && <div style={s.panelEmpty}><div className="loading-spinner" /></div>}
              {!loading && !data?.recent_activity?.length && <div style={s.panelEmpty}>No activity yet</div>}
              {data?.recent_activity?.map((e, i) => <ActivityItem key={i} event={e} />)}
            </div>
          </div>

          <div className="glass-card" style={s.panel}>
            <div style={s.panelHead}>
              <span style={s.panelTitle}>Storage by User</span>
              <span style={s.panelBadge}>{storageEntries.length} users</span>
            </div>
            <div style={s.storageList}>
              {loading && <div style={s.panelEmpty}><div className="loading-spinner" /></div>}
              {!loading && !storageEntries.length && <div style={s.panelEmpty}>No data</div>}
              {storageEntries.map(([name, stat]) => (
                <StorageBar key={name} name={name} files={stat.files} size={stat.size}
                  pct={Math.round((stat.size / maxSize) * 100)} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Recent Uploads — user-wise distribution, no photo previews ── */}
        <div className="glass-card" style={s.filesPanel}>
          <div style={s.panelHead}>
            <span style={s.panelTitle}>Recent Uploads</span>
            <span style={s.panelBadge}>{uploadsByUser.length} user{uploadsByUser.length !== 1 ? "s" : ""}</span>
          </div>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 16px", color: "var(--text-3)", fontSize: "0.86rem" }}>
              <div className="loading-spinner" />Loading…
            </div>
          )}
          {!loading && uploadsByUser.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-3)", fontSize: "0.86rem" }}>
              No files uploaded yet
            </div>
          )}
          {!loading && uploadsByUser.length > 0 && (
            <div style={s.uploadsList} className="adm-uploads-list">
              {uploadsByUser.map(([name, stat]) => (
                <div key={name} style={s.uploadRow}>
                  <div style={s.uploadAvatar}>{name[0]?.toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.uploadUser}>{name}</div>
                    <div style={s.uploadMeta}>
                      {stat.last_upload
                        ? <>uploaded photos on {fmtDateTime(stat.last_upload)}</>
                        : <>no uploads yet</>}
                    </div>
                  </div>
                  <div style={s.uploadStats}>
                    <span style={s.uploadSize}>{fmtSize(stat.size)}</span>
                    <span style={s.uploadCount}>{stat.files} file{stat.files !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BaseLayout>
  );
}

/* ── Styles ─────────────────────────────────────────────── */
const s = {
  wrap: {
    position: "relative", zIndex: 1,
    maxWidth: 1200, margin: "0 auto",
    padding: "20px 20px 60px",
    display: "flex", flexDirection: "column", gap: 20,
  },
  header: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "14px 18px", borderRadius: 18,
  },
  backBtn: {
    display: "flex", alignItems: "center", gap: 6,
    textDecoration: "none", color: "var(--text-2)",
    fontSize: "0.86rem", fontWeight: 500,
    padding: "7px 12px", borderRadius: 9,
    border: "1px solid var(--glass-border)",
    background: "var(--glass-bg)", transition: "background 0.15s",
  },
  title: {
    flex: 1, textAlign: "center",
    fontFamily: "'Instrument Serif', Georgia, serif",
    fontStyle: "italic", fontSize: "1.35rem", color: "var(--text-1)",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  navPillBtn: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 14px", borderRadius: 9,
    background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
    color: "var(--text-2)", cursor: "pointer",
    fontSize: "0.82rem", fontWeight: 600, fontFamily: "inherit",
    transition: "background 0.15s, color 0.15s",
  },
  signOutBtn: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 14px", borderRadius: 9, textDecoration: "none",
    background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)",
    color: "var(--error)", cursor: "pointer",
    fontSize: "0.82rem", fontWeight: 600,
  },
  mobileActions: {
    padding: "10px 12px", borderRadius: 16,
    display: "flex", gap: 8,
  },
  mobileActionBtn: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    padding: "10px 6px", borderRadius: 12,
    background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
    color: "var(--text-2)", cursor: "pointer", textDecoration: "none",
    fontSize: "0.68rem", fontWeight: 600, fontFamily: "inherit",
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 9,
    background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
    color: "var(--text-2)", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.15s",
  },
  statRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 14,
  },
  statCard: {
    padding: "20px 18px", borderRadius: 18,
    display: "flex", alignItems: "center", gap: 14,
    background: "var(--glass-bg)",
    backdropFilter: "blur(var(--glass-blur)) saturate(180%)",
    WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(180%)",
    border: "1px solid var(--glass-border)",
    boxShadow: "0 1px 0 var(--glass-shine) inset, 0 8px 24px var(--glass-shadow)",
    transition: "transform 0.2s, box-shadow 0.2s",
  },
  statIcon: {
    width: 46, height: 46, borderRadius: 13, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  statVal: { fontSize: "1.75rem", fontWeight: 700, color: "var(--text-1)", lineHeight: 1, letterSpacing: "-0.5px" },
  statLbl: { fontSize: "0.7rem", color: "var(--text-3)", marginTop: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" },
  midGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  panel: { borderRadius: 18, overflow: "hidden" },
  filesPanel: { borderRadius: 18, overflow: "hidden" },
  panelHead: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 16px", borderBottom: "1px solid var(--glass-border)",
  },
  panelTitle: { fontSize: "0.84rem", fontWeight: 600, color: "var(--text-1)", letterSpacing: "0.02em" },
  panelBadge: {
    fontSize: "0.68rem", padding: "2px 8px",
    background: "var(--accent-bg)", border: "1px solid var(--accent-border)",
    borderRadius: 999, color: "var(--accent)",
  },
  panelEmpty: { padding: "40px 16px", textAlign: "center", color: "var(--text-3)", fontSize: "0.86rem", display: "flex", justifyContent: "center" },
  actFeed: { padding: "6px 0", maxHeight: 300, overflowY: "auto" },
  actItem: { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px" },
  actDot: { width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0 },
  actInfo: { flex: 1, minWidth: 0 },
  actWho: { fontSize: "0.84rem", fontWeight: 600, color: "var(--text-1)" },
  actAction: { fontWeight: 400, color: "var(--text-3)", marginLeft: 4 },
  actSub: { fontSize: "0.74rem", color: "var(--text-3)", marginTop: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" },
  actTime: { fontSize: "0.72rem", color: "var(--text-3)", whiteSpace: "nowrap", flexShrink: 0, marginTop: 2 },
  storageList: { padding: "8px 16px 14px", display: "flex", flexDirection: "column", gap: 12 },
  stoRow: { display: "flex", flexDirection: "column", gap: 5 },
  stoTop: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  stoName: { fontSize: "0.84rem", fontWeight: 500, color: "var(--text-1)" },
  stoMeta: { fontSize: "0.72rem", color: "var(--text-3)" },
  stoBarBg: { height: 6, borderRadius: 3, background: "rgba(128,128,128,0.12)", overflow: "hidden" },
  stoBarFill: {
    height: "100%",
    background: "var(--accent)",
    transition: "width 0.5s ease",
  },
  uploadsList: { display: "flex", flexDirection: "column", padding: "6px 0" },
  uploadRow: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid var(--glass-border)",
  },
  uploadAvatar: {
    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
    background: "var(--accent-bg)", border: "1px solid var(--accent-border)",
    color: "var(--accent)", fontSize: "0.82rem", fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  uploadUser: { fontSize: "0.88rem", fontWeight: 600, color: "var(--text-1)" },
  uploadMeta: { fontSize: "0.76rem", color: "var(--text-3)", marginTop: 2 },
  uploadStats: {
    display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2,
    flexShrink: 0,
  },
  uploadSize: { fontSize: "0.84rem", fontWeight: 700, color: "var(--text-1)" },
  uploadCount: { fontSize: "0.7rem", color: "var(--text-3)" },
  filesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8, padding: 14 },
  fileThumb: {
    aspectRatio: "1", borderRadius: 10, overflow: "hidden",
    background: "rgba(128,128,128,0.08)", border: "1px solid var(--glass-border)",
    position: "relative", cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
  },
  vidOverlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" },
  fileImg: { width: "100%", height: "100%", objectFit: "cover" },
  fileOwner: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    background: "linear-gradient(transparent, rgba(0,0,0,0.65))",
    color: "rgba(255,255,255,0.85)", fontSize: "0.62rem",
    fontWeight: 600, padding: "12px 6px 5px", textAlign: "center",
    overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
  },
};
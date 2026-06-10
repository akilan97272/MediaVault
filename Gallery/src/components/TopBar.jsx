// components/TopBar.jsx
import { useTheme } from "../context/ThemeContext";

const SunIcon = () => (
  <svg className="icon-sun" viewBox="0 0 24 24" fill="none" width="17" height="17">
    <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    />
  </svg>
);

const MoonIcon = () => (
  <svg className="icon-moon" viewBox="0 0 24 24" fill="none" width="17" height="17">
    <path
      d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    />
  </svg>
);

const UserIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="17" height="17">
    <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export default function TopBar({
  breadcrumb = "All Media",
  onMenuClick,
  isAdmin = false,
  onManageUsers,
  rightSlot,
}) {
  const { toggleTheme } = useTheme();

  return (
    <header style={styles.topbar} className="glass-card">
      {/* Hamburger — mobile only */}
      <button style={styles.menuBtn} onClick={onMenuClick} aria-label="Open sidebar">
        <span style={styles.bar} />
        <span style={styles.bar} />
        <span style={styles.bar} />
      </button>

      {/* Breadcrumb path */}
      <div style={styles.path}>{breadcrumb}</div>

      {/* Right actions */}
      <div style={styles.actions}>
        {rightSlot}

        {isAdmin && onManageUsers && (
          <button style={styles.iconBtn} onClick={onManageUsers} title="Manage Users">
            <UserIcon />
          </button>
        )}

        <button style={styles.iconBtn} onClick={toggleTheme} title="Toggle theme">
          <SunIcon />
          <MoonIcon />
        </button>
      </div>
    </header>
  );
}

const styles = {
  topbar: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    borderRadius: 18,
    margin: "12px 12px 0",
  },
  menuBtn: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 4,
    width: 34,
    height: 34,
    background: "var(--glass-bg)",
    border: "1px solid var(--glass-border)",
    borderRadius: 10,
    cursor: "pointer",
    padding: "0 9px",
    flexShrink: 0,
    // Hidden on desktop via media handled in CSS module; here it's always visible
    // (Sidebar handles its own desktop visibility)
  },
  bar: {
    display: "block",
    height: 1.5,
    background: "var(--text-2)",
    borderRadius: 2,
    width: "100%",
    transition: "background 0.2s",
  },
  path: {
    flex: 1,
    fontSize: "0.88rem",
    fontWeight: 500,
    color: "var(--text-2)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  iconBtn: {
    width: 34,
    height: 34,
    background: "var(--glass-bg)",
    border: "1px solid var(--glass-border)",
    borderRadius: 10,
    color: "var(--text-2)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.18s, color 0.18s",
  },
};

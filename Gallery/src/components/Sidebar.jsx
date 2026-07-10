// components/Sidebar.jsx
// Desktop: floating glass sidebar with rounded edges (Apple-style)
// Mobile: collapsible bottom sheet triggered by a floating nav bar

import { useState, useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";

/* ── Icons ─────────────────────────────────────────────── */
const BrandIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
    <path d="M7 16l5-8 5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.8" />
  </svg>
);

const HomeIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
    <path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.4" />
    <path d="M7 18v-6h6v6" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const FolderIcon = ({ shared }) => (
  <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
    <path
      d="M2 6a2 2 0 012-2h3.586a1 1 0 01.707.293L9.414 5.5A1 1 0 0010.121 5.5H16a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
      fill={shared ? "var(--folder-shared-fill)" : "var(--folder-fill)"}
      stroke={shared ? "var(--folder-shared-stroke)" : "var(--folder-stroke)"}
      strokeWidth="1.3"
    />
  </svg>
);

const DashIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
    <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const UsersIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
    <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const ActivityIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.4" />
    <path d="M7 8h6M7 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const SunIcon = () => (
  <svg className="icon-sun" viewBox="0 0 24 24" fill="none" width="15" height="15">
    <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const MoonIcon = () => (
  <svg className="icon-moon" viewBox="0 0 24 24" fill="none" width="15" height="15">
    <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="icon-refresh" viewBox="0 0 24 24" fill="none" width="15" height="15">
    <path d="M4 4v6h6M20 20v-6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 14a8 8 0 0014.5 3M19 10A8 8 0 004.5 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const UploadIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
    <path d="M10 13V4M6 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const NewFolderIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
    <path d="M2 6a2 2 0 012-2h3.586a1 1 0 01.707.293L9.414 5.5A1 1 0 0010.121 5.5H16a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" stroke="currentColor" strokeWidth="1.3" />
    <path d="M10 9v4M8 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const LogoutIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
    <path d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M13 14l3-4-3-4M16 10H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const KeyIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
    <circle cx="8" cy="10" r="4" stroke="currentColor" strokeWidth="1.4" />
    <path d="M12 10h5M15 8v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/* ── Change Password Modal ─────────────────────────────── */
function ChangePasswordModal({ onClose }) {
  const [currentPass, setCurrentPass] = useState("");
  const [newPass,     setNewPass]     = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState(false);

  async function submit() {
    setError("");
    if (newPass.length < 4)          return setError("New password must be at least 4 characters");
    if (newPass !== confirmPass)      return setError("Passwords don't match");
    setLoading(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPass, new_password: newPass }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Failed to change password");
      setSuccess(true);
      setTimeout(onClose, 1400);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 360,
          background: "var(--glass-bg)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          border: "1px solid var(--glass-border)",
          borderRadius: 22,
          boxShadow: "0 1px 0 var(--glass-shine) inset, 0 24px 80px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 18px 14px",
          borderBottom: "1px solid var(--glass-border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KeyIcon />
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-1)" }}>
              Change Password
            </span>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8,
            background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
            color: "var(--text-3)", cursor: "pointer", fontSize: "0.75rem",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {success ? (
            <div style={{
              textAlign: "center", padding: "20px 0",
              color: "var(--accent)", fontSize: "0.9rem", fontWeight: 600,
            }}>
              ✓ Password updated!
            </div>
          ) : (
            <>
              {error && (
                <div style={{
                  padding: "8px 12px", borderRadius: 10,
                  background: "rgba(255,107,107,0.1)",
                  border: "1px solid rgba(255,107,107,0.3)",
                  color: "var(--error)", fontSize: "0.82rem",
                }}>{error}</div>
              )}
              {[
                { label: "Current Password", val: currentPass, set: setCurrentPass },
                { label: "New Password",     val: newPass,     set: setNewPass },
                { label: "Confirm New",      val: confirmPass, set: setConfirmPass },
              ].map(({ label, val, set }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.04em" }}>
                    {label.toUpperCase()}
                  </label>
                  <input
                    type="password"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    className="glass-input"
                    style={{ fontSize: "0.88rem" }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 12,
                    background: "transparent",
                    border: "1px solid var(--glass-border)",
                    color: "var(--text-2)", cursor: "pointer",
                    fontFamily: "inherit", fontSize: "0.84rem", fontWeight: 600,
                  }}
                >Cancel</button>
                <button
                  onClick={submit}
                  disabled={loading}
                  style={{
                    flex: 2, padding: "9px 0", borderRadius: 12,
                    background: "var(--accent-bg)",
                    border: "1px solid var(--accent-border)",
                    color: "var(--accent)", cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: "inherit", fontSize: "0.84rem", fontWeight: 700,
                    boxShadow: "0 2px 12px rgba(99,185,255,0.15)",
                    opacity: loading ? 0.7 : 1,
                  }}
                >{loading ? "Saving…" : "Update Password"}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Tree node (recursive) ─────────────────────────────── */
function TreeNode({ node, currentPath, onNavigate, depth = 0 }) {
  const [open, setOpen] = useState(
    currentPath.startsWith(node.path)
  );
  const hasChildren = node.children && node.children.length > 0;
  const isActive = currentPath === node.path;

  return (
    <div>
      <button
        style={{
          ...nodeStyles.btn,
          paddingLeft: 12 + depth * 14,
          background: isActive ? "var(--accent-bg)" : "transparent",
          color: isActive ? "var(--accent)" : "var(--text-2)",
          borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
        }}
        onClick={() => {
          onNavigate(node.path);
          if (hasChildren) setOpen((o) => !o);
        }}
      >
        {hasChildren && (
          <span style={{ ...nodeStyles.chevron, transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
        )}
        <FolderIcon shared={node.is_shared} />
        <span style={nodeStyles.label}>{node.name}</span>
      </button>
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              currentPath={currentPath}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const nodeStyles = {
  btn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "7px 12px",
    background: "transparent",
    border: "none",
    borderRadius: "0 10px 10px 0",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "0.84rem",
    fontWeight: 500,
    transition: "background 0.15s, color 0.15s",
    textAlign: "left",
  },
  chevron: {
    fontSize: "0.9rem",
    color: "var(--text-3)",
    transition: "transform 0.2s",
    display: "inline-block",
    width: 12,
    flexShrink: 0,
  },
  label: {
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
};

/* ── Sidebar Inner Content ─────────────────────────────── */
function SidebarContent({
  user,
  isAdmin,
  folderTree,
  currentPath,
  onNavigate,
  onClose,
  onUpload,
  onCreateFolder,
  onManageUsers,
  onActivityLog,
  onChangePassword,
}) {
  const { toggleTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userRowRef = useRef(null);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const close = (e) => {
      if (userRowRef.current && !userRowRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [userMenuOpen]);

  return (
    <div style={sidebarStyles.inner}>
      {/* Header */}
      <div style={sidebarStyles.header}>
        <div style={sidebarStyles.brand}>
          <BrandIcon />
          <span style={sidebarStyles.brandName}>MediaVault</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={sidebarStyles.nav}>
        <div style={sidebarStyles.sectionLabel}>Library</div>

        {/* All Media root */}
        <button
          style={{
            ...nodeStyles.btn,
            paddingLeft: 12,
            background: currentPath === "" ? "var(--accent-bg)" : "transparent",
            color: currentPath === "" ? "var(--accent)" : "var(--text-2)",
            borderLeft: currentPath === "" ? "2px solid var(--accent)" : "2px solid transparent",
          }}
          onClick={() => { onNavigate(""); onClose(); }}
        >
          <HomeIcon />
          <span>All Media</span>
        </button>

        {/* Folder tree */}
        {folderTree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            currentPath={currentPath}
            onNavigate={(p) => { onNavigate(p); onClose(); }}
          />
        ))}
      </nav>

      {/* Admin section */}
      {isAdmin && (
        <div style={sidebarStyles.adminSection}>
          <div style={sidebarStyles.sectionLabel}>Admin</div>
          <a href="/admin" style={{ textDecoration: "none" }}>
            <button style={sidebarStyles.navBtn}>
              <DashIcon /><span>Dashboard</span>
            </button>
          </a>
          <button style={sidebarStyles.navBtn} onClick={onManageUsers}>
            <UsersIcon /><span>Manage Users</span>
          </button>
          <button style={sidebarStyles.navBtn} onClick={onActivityLog}>
            <ActivityIcon /><span>Activity Log</span>
          </button>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div style={sidebarStyles.footer}>
        {/* User row — clickable, pops menu upward */}
        <div ref={userRowRef} style={{ position: "relative", marginBottom: 10 }}>
          <button
            style={{
              ...sidebarStyles.userRow,
              width: "100%",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              marginBottom: 0,
              borderRadius: 10,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(128,128,128,0.08)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            onClick={() => setUserMenuOpen((o) => !o)}
            title="Click for options"
          >
            <div style={sidebarStyles.avatar}>{user?.[0]?.toUpperCase()}</div>
            <div style={sidebarStyles.userInfo}>
              <span style={sidebarStyles.username}>{user}</span>
              {isAdmin && <span style={sidebarStyles.roleBadge}>admin</span>}
            </div>
            <span style={{
              marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-3)",
              transform: userMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s", lineHeight: 1, paddingRight: 4,
            }}>▾</span>
          </button>

          {/* Popup menu — appears above the user row */}
          {userMenuOpen && (
            <div style={{
              position: "absolute",
              bottom: "calc(100% + 6px)", left: 0, right: 0,
              background: "var(--glass-bg)",
              backdropFilter: "blur(24px) saturate(200%)",
              WebkitBackdropFilter: "blur(24px) saturate(200%)",
              border: "1px solid var(--glass-border)",
              borderRadius: 14,
              boxShadow: "0 1px 0 var(--glass-shine) inset, 0 -12px 40px rgba(0,0,0,0.3)",
              overflow: "hidden",
              zIndex: 500,
              animation: "slideUp 0.18s ease",
            }}>
              <button
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 14px", background: "transparent", border: "none",
                  color: "var(--text-1)", cursor: "pointer",
                  fontFamily: "inherit", fontSize: "0.84rem", fontWeight: 500,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(128,128,128,0.1)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                onClick={() => { setUserMenuOpen(false); onChangePassword?.(); }}
              >
                <KeyIcon /> Change Password
              </button>
            </div>
          )}
        </div>

        <div style={sidebarStyles.footerActions}>
          <button style={sidebarStyles.themeBtn} onClick={toggleTheme} title="Toggle theme">
            <SunIcon /><MoonIcon /><RefreshIcon />
          </button>
          <a href="/logout" style={sidebarStyles.logoutBtn}>Sign out</a>
        </div>
      </div>
    </div>
  );
}

/* ── Main Sidebar export ───────────────────────────────── */
export default function Sidebar({
  user, isAdmin, folderTree, currentPath,
  onNavigate, isOpen, onClose,
  onUpload, onCreateFolder, onManageUsers, onActivityLog,
  onBgContextMenu,   
}){
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Long-press for mobile capsule
  const longPressTimer = useRef(null);
  function startLongPress() {
    longPressTimer.current = setTimeout(() => {
      navigator.vibrate?.(40);
      setShowChangePassword(true);
    }, 600);
  }
  function cancelLongPress() { clearTimeout(longPressTimer.current); }

  // Close on ESC
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { onClose(); setMobileSheetOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Sync external open prop for desktop overlay behaviour
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <>
     <style>{`
        @media (max-width: 767px)  { .mv-bottom-nav { display: flex !important; } }
        @media (min-width: 768px)  { .mv-bottom-nav { display: none !important; } }
        @media (min-width: 768px)  { .mv-desktop-sidebar { display: flex !important; } }
        @media (max-width: 767px)  { .mv-desktop-sidebar { display: none !important; } }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes floatUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
        }
        @keyframes expandFromMid {
          from {
            opacity: 0;
            transform: translateX(-50%) scaleY(0.3) translateY(50%);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) scaleY(1) translateY(0%);
          }
        }
      `}</style>
      {/* ── Desktop floating sidebar (always visible ≥768px) ── */}
      <aside
        style={sidebarStyles.desktopSidebar}
        className="glass-card mv-desktop-sidebar"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onBgContextMenu?.(e.clientX, e.clientY);
        }}
      >
        <SidebarContent
          user={user} isAdmin={isAdmin} folderTree={folderTree}
          currentPath={currentPath} onNavigate={onNavigate}
          onClose={() => {}} onUpload={onUpload}
          onCreateFolder={onCreateFolder} onManageUsers={onManageUsers}
          onActivityLog={onActivityLog}
          onChangePassword={() => setShowChangePassword(true)}
        />
      </aside>

      {/* ── Mobile overlay sidebar (controlled by isOpen) ── */}
      {isOpen && (
        <>
          <div
            style={{ ...sidebarStyles.overlay, zIndex: 305 }}
            onClick={() => { onClose(); }}
          />
          <aside
            style={{
              ...sidebarStyles.mobileSidebar,
              display: "flex",        // always render when isOpen=true
            }}
            className="glass-card"
          >
            <SidebarContent
              user={user} isAdmin={isAdmin} folderTree={folderTree}
              currentPath={currentPath}
              onNavigate={(p) => { onNavigate(p); onClose(); }}
              onClose={onClose}
              onUpload={onUpload}
              onCreateFolder={onCreateFolder}
              onManageUsers={onManageUsers}
              onActivityLog={onActivityLog}
              onChangePassword={() => setShowChangePassword(true)}
            />
          </aside>
        </>
      )}
      {/* ── Mobile floating bottom nav ── */}
      <div
        style={{
          position: "fixed",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          display: "none",       // overridden to flex by .mv-bottom-nav
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          zIndex: 250,
        }}
        className="mv-bottom-nav"
      >
      {/* User name capsule — long press for password change, click for admin menu */}
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 14px",
            background: "var(--glass-bg)",
            backdropFilter: "blur(var(--glass-blur)) saturate(180%)",
            WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(180%)",
            border: "1px solid var(--glass-border)",
            borderRadius: 999,
            boxShadow: "0 1px 0 var(--glass-shine) inset, 0 4px 16px var(--glass-shadow)",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            position: "relative",
            zIndex: 2,
            userSelect: "none",
          }}
          onClick={() => isAdmin && setAdminMenuOpen((o) => !o)}
          onTouchStart={startLongPress}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
          onContextMenu={(e) => { e.preventDefault(); setShowChangePassword(true); }}
          title="Long press to change password"
        >
          <div style={{
            width: 18, height: 18, borderRadius: "50%",
            background: "var(--accent-bg)",
            border: "1px solid var(--accent-border)",
            color: "var(--accent)",
            fontSize: "0.65rem", fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {user?.[0]?.toUpperCase()}
          </div>
          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-1)", letterSpacing: "0.01em" }}>
            {user}
          </span>
          {isAdmin && (
            <>
              <span style={{
                fontSize: "0.58rem", padding: "1px 6px",
                background: "var(--accent-bg)",
                border: "1px solid var(--accent-border)",
                borderRadius: 999, color: "var(--accent)",
                fontWeight: 700, letterSpacing: "0.05em",
              }}>admin</span>
              <span style={{
                fontSize: "0.7rem", color: "var(--text-3)",
                transform: adminMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
                lineHeight: 1,
              }}>▾</span>
            </>
          )}
        </div>

        {/* Admin options — overlay, expands from the midpoint between the two capsules */}
        {isAdmin && adminMenuOpen && (
          <div style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",   // sits just above the user capsule
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            width: 180,
            zIndex: 1,
            transformOrigin: "bottom center",
            animation: "expandFromMid 0.22s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            <a href="/admin" style={{ textDecoration: "none" }}>
              <button style={sidebarStyles.adminMenuBtn}>
                <DashIcon />
                Admin Dashboard
              </button>
            </a>
            <button style={sidebarStyles.adminMenuBtn} onClick={() => { onManageUsers?.(); setAdminMenuOpen(false); }}>
              <UsersIcon />
              Manage Users
            </button>
            <button style={sidebarStyles.adminMenuBtn} onClick={() => { onActivityLog?.(); setAdminMenuOpen(false); }}>
              <ActivityIcon />
              Activity Log
            </button>
          </div>
        )}
      </div>

        {/* Action capsule */}
        <nav style={{
          ...sidebarStyles.bottomNav,
          position: "static",
          transform: "none",
          display: "flex",
        }} className="glass-card">
          <button style={sidebarStyles.bottomNavBtn} onClick={() => setMobileSheetOpen((o) => !o)}>
            <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
              <path d="M2 6a2 2 0 012-2h3.586a1 1 0 01.707.293L9.414 5.5A1 1 0 0010.121 5.5H16a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" stroke="currentColor" strokeWidth="1.4" fill="var(--folder-fill)" />
            </svg>
            <span style={sidebarStyles.bottomNavLabel}>Folders</span>
          </button>

          <button style={sidebarStyles.bottomNavBtn} onClick={onUpload}>
            <UploadIcon />
            <span style={sidebarStyles.bottomNavLabel}>Upload</span>
          </button>

          <button style={sidebarStyles.bottomNavBtn} onClick={onCreateFolder}>
            <NewFolderIcon />
            <span style={sidebarStyles.bottomNavLabel}>New Folder</span>
          </button>

          <a href="/logout" style={{ textDecoration: "none" }}>
            <button style={{ ...sidebarStyles.bottomNavBtn, color: "var(--error)" }}>
              <LogoutIcon />
              <span style={sidebarStyles.bottomNavLabel}>Sign out</span>
            </button>
          </a>
        </nav>
      </div>

      {/* ── Mobile folder sheet — floats above bottom nav ── */}
      {mobileSheetOpen && (
        <>
          <div
            style={{ ...sidebarStyles.overlay, zIndex: 299 }}
            onClick={() => setMobileSheetOpen(false)}
          />
          <div style={{
            position: "fixed",
            bottom: 130,          // sits above the nav stack (user capsule + action capsule)
            left: "50%",
            transform: "translateX(-50%)",
            width: "calc(100vw - 40px)",
            maxWidth: 320,
            maxHeight: "45vh",
            zIndex: 350,
            borderRadius: 20,
            display: "flex",
            flexDirection: "column",
            background: "var(--glass-bg)",
            backdropFilter: "blur(var(--glass-blur)) saturate(180%)",
            WebkitBackdropFilter: "blur(var(--glass-blur)) saturate(180%)",
            border: "1px solid var(--glass-border)",
            boxShadow: "0 1px 0 var(--glass-shine) inset, 0 -8px 40px var(--glass-shadow)",
            animation: "floatUp 0.25s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            {/* Handle */}
            <div style={{
              width: 32, height: 4, borderRadius: 2,
              background: "var(--glass-border)",
              margin: "10px auto 0", flexShrink: 0,
            }} />

            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 14px 6px",
              borderBottom: "1px solid var(--glass-border)",
              flexShrink: 0,
            }}>
              <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--text-1)" }}>
                Folders
              </span>
              <button
                onClick={() => setMobileSheetOpen(false)}
                style={{
                  width: 24, height: 24, borderRadius: 7,
                  background: "var(--glass-bg)",
                  border: "1px solid var(--glass-border)",
                  color: "var(--text-3)", cursor: "pointer",
                  fontSize: "0.7rem",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >✕</button>
            </div>

            {/* Scrollable folder list */}
            <div style={{ overflowY: "auto", padding: "6px 0 12px", flex: 1 }}>
              <button
                style={{
                  ...nodeStyles.btn,
                  color: currentPath === "" ? "var(--accent)" : "var(--text-2)",
                  background: currentPath === "" ? "var(--accent-bg)" : "transparent",
                  borderLeft: currentPath === "" ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                onClick={() => { onNavigate(""); setMobileSheetOpen(false); }}
              >
                <HomeIcon />
                <span>All Media</span>
              </button>
              {folderTree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  currentPath={currentPath}
                  onNavigate={(p) => { onNavigate(p); setMobileSheetOpen(false); }}
                />
              ))}
            </div>
          </div>
        </>
      )}
      {/* ── Change Password Modal ── */}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}

/* ── Styles ─────────────────────────────────────────────── */
const sidebarStyles = {
  desktopSidebar: {
    position: "fixed",
    top: 16,
    left: 16,
    bottom: 16,
    width: 240,
    borderRadius: 20,
    display: "flex",
    flexDirection: "column",
    zIndex: 200,
    // Hidden on mobile via CSS media query (injected below)
  },
  mobileSidebar: {
    position: "fixed",
    top: 16,
    left: 16,
    bottom: 16,
    width: 260,
    borderRadius: 20,
    display: "flex",
    flexDirection: "column",
    zIndex: 310,
    animation: "slideInLeft 0.25s cubic-bezier(0.34,1.56,0.64,1)",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    backdropFilter: "blur(4px)",
    zIndex: 300,
  },
  inner: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 14px 12px",
    borderBottom: "1px solid var(--glass-border)",
    flexShrink: 0,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--text-1)",
  },
  brandName: {
    fontFamily: "'Instrument Serif', Georgia, serif",
    fontStyle: "italic",
    fontSize: "1.1rem",
    color: "var(--text-1)",
  },
  closeBtn: {
    width: 26,
    height: 26,
    background: "var(--glass-bg)",
    border: "1px solid var(--glass-border)",
    borderRadius: 7,
    color: "var(--text-3)",
    cursor: "pointer",
    fontSize: "0.75rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  nav: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 0",
  },
  sectionLabel: {
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--text-3)",
    padding: "8px 14px 4px",
  },
  adminSection: {
    borderTop: "1px solid var(--glass-border)",
    padding: "8px 0",
    flexShrink: 0,
  },
  navBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    background: "transparent",
    border: "none",
    borderRadius: 10,
    color: "var(--text-2)",
    fontFamily: "inherit",
    fontSize: "0.84rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  },
  footer: {
    borderTop: "1px solid var(--glass-border)",
    padding: "12px 14px",
    flexShrink: 0,
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "var(--accent-bg)",
    border: "1px solid var(--accent-border)",
    color: "var(--accent)",
    fontSize: "0.85rem",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  userInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  username: {
    fontSize: "0.84rem",
    fontWeight: 600,
    color: "var(--text-1)",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  roleBadge: {
    fontSize: "0.65rem",
    padding: "1px 7px",
    background: "var(--accent-bg)",
    border: "1px solid var(--accent-border)",
    borderRadius: 999,
    color: "var(--accent)",
    fontWeight: 600,
    letterSpacing: "0.05em",
    width: "fit-content",
  },
  footerActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  themeBtn: {
    width: 30,
    height: 30,
    background: "var(--glass-bg)",
    border: "1px solid var(--glass-border)",
    borderRadius: 8,
    color: "var(--text-2)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtn: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--text-3)",
    padding: "6px 10px",
    borderRadius: 8,
    background: "transparent",
    border: "1px solid var(--glass-border)",
    cursor: "pointer",
    textDecoration: "none",
    transition: "color 0.15s, background 0.15s",
  },

  /* ── Bottom nav (mobile only) ── */
  bottomNav: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    padding: "8px 12px",
    borderRadius: 999,
    width: "auto",
  },
  bottomNavBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    background: "transparent",
    border: "none",
    color: "var(--text-2)",
    cursor: "pointer",
    padding: "6px 14px",
    borderRadius: 14,
    fontFamily: "inherit",
    transition: "color 0.15s, background 0.15s",
  },
  bottomNavLabel: {
    fontSize: "0.62rem",
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
  bottomSheet: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: "24px 24px 0 0",
    zIndex: 350,
    maxHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    animation: "slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: "var(--glass-border)",
    margin: "12px auto 0",
    flexShrink: 0,
  },
  sheetHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px 8px",
    borderBottom: "1px solid var(--glass-border)",
    flexShrink: 0,
  },
  sheetScroll: {
    overflowY: "auto",
    padding: "8px 0 24px",
    flex: 1,
  },
  adminMenuBtn: {
  width: "100%",
  display: "flex", alignItems: "center", gap: 8,
  padding: "9px 14px",
  background: "var(--glass-bg)",
  backdropFilter: "blur(var(--glass-blur))",
  WebkitBackdropFilter: "blur(var(--glass-blur))",
  border: "1px solid var(--glass-border)",
  borderRadius: 12,
  color: "var(--text-1)", cursor: "pointer",
  fontFamily: "inherit", fontSize: "0.82rem", fontWeight: 500,
  boxShadow: "0 1px 0 var(--glass-shine) inset, 0 4px 16px var(--glass-shadow)",
},
};
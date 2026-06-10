// pages/GalleryDashboard.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import BaseLayout from "../components/BaseLayout";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";

const PAGE_SIZE = 40;

/* ── helpers ─────────────────────────────────────────────── */
function buildBreadcrumb(path) {
  if (!path) return "All Media";
  return path.split("/").join(" / ");
}

/* ── Folder Card ─────────────────────────────────────────── */
function FolderCard({ name, onClick, onDelete, isAdmin, currentUser, path }) {
  const isOwner = isAdmin || path?.startsWith(currentUser + "/") || !path?.includes("/");
  return (
    <div style={gs.folderCard} onClick={onClick}>
      <div style={gs.folderCardInner}>
        <svg viewBox="0 0 48 40" fill="none" width="48" height="40">
          <path
            d="M2 8a4 4 0 014-4h12l4 4h20a4 4 0 014 4v22a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"
            fill="var(--folder-fill)" stroke="var(--folder-stroke)" strokeWidth="1.4"
          />
        </svg>
        <span style={gs.folderName}>{name}</span>
      </div>
      {isOwner && (
        <button
          style={gs.deleteBtn}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete folder"
        >
          <svg viewBox="0 0 20 20" fill="none" width="13" height="13">
            <path d="M5 6h10M8 6V4h4v2M7 9v6M10 9v6M13 9v6M6 6l.75 10h6.5L14 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ── Media Card ──────────────────────────────────────────── */
function MediaCard({ src, isVideo, selected, onSelect, onLightbox, onDelete }) {
  return (
    <div
      style={{ ...gs.mediaCard, ...(selected ? gs.mediaCardSelected : {}) }}
      onClick={onLightbox}
    >
      {isVideo ? (
        <div style={gs.videoThumb}>
          <svg viewBox="0 0 24 24" fill="none" width="28" height="28" style={{ color: "rgba(255,255,255,0.85)" }}>
            <polygon points="6,4 20,12 6,20" fill="currentColor" />
          </svg>
        </div>
      ) : (
        <img src={src} loading="lazy" decoding="async" style={gs.mediaImg} alt="" />
      )}
      <button
        style={gs.selBtn}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        title="Select"
      >
        {selected
          ? <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><circle cx="8" cy="8" r="7" fill="var(--accent)" /><path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>
          : <svg viewBox="0 0 16 16" fill="none" width="14" height="14"><circle cx="8" cy="8" r="7" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" /></svg>
        }
      </button>
    </div>
  );
}

/* ── Lightbox ────────────────────────────────────────────── */
function Lightbox({ files, index, onClose, onPrev, onNext }) {
  const file = files[index];
  if (!file) return null;
  const isVideo = /\.(mp4|webm|mkv)$/i.test(file);

  return (
    <div style={lb.overlay} onClick={onClose}>
      <button style={lb.closeBtn} onClick={onClose}>✕</button>
      <button style={{ ...lb.navBtn, left: 12 }} onClick={(e) => { e.stopPropagation(); onPrev(); }}>‹</button>
      <button style={{ ...lb.navBtn, right: 12 }} onClick={(e) => { e.stopPropagation(); onNext(); }}>›</button>
      <div style={lb.content} onClick={(e) => e.stopPropagation()}>
        {isVideo
          ? <video src={file} controls autoPlay style={lb.media} />
          : <img src={file} alt="" style={lb.media} />
        }
      </div>
    </div>
  );
}

const lb = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 500,
    background: "rgba(0,0,0,0.92)", display: "flex",
    alignItems: "center", justifyContent: "center",
  },
  closeBtn: {
    position: "absolute", top: 16, right: 16,
    width: 36, height: 36, borderRadius: "50%",
    background: "rgba(255,255,255,0.1)", border: "none",
    color: "#fff", cursor: "pointer", fontSize: "1rem",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 10,
  },
  navBtn: {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    width: 44, height: 44, borderRadius: "50%",
    background: "rgba(255,255,255,0.1)", border: "none",
    color: "#fff", fontSize: "1.5rem", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 10,
  },
  content: { maxWidth: "90vw", maxHeight: "90vh" },
  media: { maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 12 },
};

/* ── Modal: Create Folder ────────────────────────────────── */
function CreateFolderModal({ currentPath, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim()) return setError("Enter a folder name");
    setLoading(true); setError("");
    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("path", currentPath);
    const res = await fetch("/api/folder", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);
    if (res.ok) { onCreated(data.name); onClose(); }
    else setError(data.error || "Failed");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Folder</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-pill">{error}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: "0.82rem", color: "var(--text-2)", fontWeight: 500 }}>Folder Name</label>
            <input
              className="glass-input" placeholder="e.g. Vacation 2024"
              value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              autoFocus
            />
          </div>
          <button className="glass-btn-primary" onClick={create} disabled={loading}>
            {loading ? "Creating…" : "Create Folder"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Modal: User Manager ─────────────────────────────────── */
function UserManagerModal({ onClose }) {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage Users</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h3 style={{ fontSize: "0.86rem", fontWeight: 600, color: "var(--text-1)" }}>Add New User</h3>
            {msg.text && <div className={msg.type === "error" ? "error-pill" : "success-pill"}>{msg.text}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <input className="glass-input" placeholder="Username" value={newUser} onChange={(e) => setNewUser(e.target.value)} style={{ flex: 1 }} />
              <input className="glass-input" type="password" placeholder="Password" value={newPass} onChange={(e) => setNewPass(e.target.value)} style={{ flex: 1 }} />
              <button className="glass-btn-accent" onClick={createUser}>Add</button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={{ fontSize: "0.86rem", fontWeight: 600, color: "var(--text-1)" }}>Existing Users</h3>
            {users.filter(u => u !== "admin").map((u) => (
              <div key={u} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
                <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text-1)" }}>{u}</span>
                <button onClick={() => deleteUser(u)} style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 8, padding: "5px 10px", color: "var(--error)", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Modal: Activity Log ─────────────────────────────────── */
function ActivityLogModal({ onClose }) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => setActivity(d.activity || []))
      .finally(() => setLoading(false));
  }, []);

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

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
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.success ? "#4dd9ac" : "var(--error)", marginTop: 5, flexShrink: 0, boxShadow: `0 0 6px ${a.success ? "rgba(77,217,172,0.5)" : "rgba(255,107,107,0.5)"}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--text-1)" }}>{a.username} <span style={{ fontWeight: 400, color: "var(--text-3)" }}>logged {a.success ? "in" : "failed"}</span></div>
                <div style={{ fontSize: "0.74rem", color: "var(--text-3)", marginTop: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{a.device_info?.os} · {a.device_info?.browser} · {a.ip_address}</div>
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-3)", whiteSpace: "nowrap", flexShrink: 0, marginTop: 2 }}>{timeAgo(a.timestamp)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main GalleryDashboard ───────────────────────────────── */
export default function GalleryDashboard() {
  const [currentPath, setCurrentPath] = useState("");
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folderTree, setFolderTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showUserManager, setShowUserManager] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const fileInputRef = useRef(null);

  const user = window.CURRENT_USER || "user";
  const isAdmin = window.IS_ADMIN || false;

  // Load folder tree once
  useEffect(() => {
    fetch("/api/tree")
      .then((r) => r.json())
      .then((d) => setFolderTree(d.tree || []));
  }, []);

  // Load media on path change
  const loadMedia = useCallback(async (path = currentPath) => {
    setLoading(true); setFiles([]); setFolders([]); setSelected(new Set()); setPage(0);
    try {
      const res = await fetch(`/api/media?path=${encodeURIComponent(path)}`);
      if (res.status === 401) { window.location.href = "/"; return; }
      const data = await res.json();
      setFiles(data.files || []);
      setFolders(data.folders || []);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => { loadMedia(currentPath); }, [currentPath]);

  function navigate(path) {
    setCurrentPath(path);
  }

  function goUp() {
    const parts = currentPath.split("/");
    parts.pop();
    navigate(parts.join("/"));
  }

  // Pagination
  const pageFiles = files.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(files.length / PAGE_SIZE);

  // Selection
  function toggleSelect(filename) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      return next;
    });
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selected.size} item(s)?`)) return;
    for (const name of selected) {
      await fetch(`/api/media?path=${encodeURIComponent(currentPath)}&filename=${encodeURIComponent(name)}`, { method: "DELETE" });
    }
    setSelected(new Set());
    loadMedia(currentPath);
  }

  async function deleteFolder(name) {
    if (!confirm(`Delete folder "${name}" and all its contents?`)) return;
    const fullPath = currentPath ? `${currentPath}/${name}` : name;
    await fetch(`/api/media?path=${encodeURIComponent(fullPath)}&filename=`, { method: "DELETE" });
    loadMedia(currentPath);
    // Refresh tree
    fetch("/api/tree").then((r) => r.json()).then((d) => setFolderTree(d.tree || []));
  }

  // Upload
  async function handleUpload(e) {
    const uploadFiles = Array.from(e.target.files || []);
    if (!uploadFiles.length) return;
    for (const file of uploadFiles) {
      const fd = new FormData();
      fd.append("path", currentPath);
      fd.append("file", file);
      await fetch("/api/upload", { method: "POST", body: fd });
    }
    loadMedia(currentPath);
  }

  // Lightbox file URLs
  const lightboxUrls = pageFiles
    .filter((f) => /\.(jpg|jpeg|png|gif|mp4|webm|mkv)$/i.test(f))
    .map((f) => `/media/${currentPath ? currentPath + "/" : ""}${f}`);

  const breadcrumb = buildBreadcrumb(currentPath);

  return (
    <BaseLayout>
      {/* Responsive sidebar visibility CSS */}
      <style>{`
        @media (min-width: 768px) {
          .sidebar-desktop { display: flex !important; }
          .bottom-nav-mobile { display: none !important; }
          .main-content { margin-left: 268px !important; }
          .topbar-menu-btn { display: none !important; }
        }
        @media (max-width: 767px) {
          .sidebar-desktop { display: none !important; }
          .bottom-nav-mobile { display: flex !important; }
          .main-content { margin-left: 0 !important; padding-bottom: 80px !important; }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        .gallery-item:hover { transform: scale(1.02); }
        .sidebar-nav-btn:hover { background: rgba(128,128,128,0.1); color: var(--text-1) !important; }
        [data-theme="light"] .glass-input { background: rgba(255,255,255,0.55); }
      `}</style>

      {/* Sidebar — desktop class applied via CSS */}
      <div className="sidebar-desktop" style={{ display: "flex" }}>
        <Sidebar
          user={user} isAdmin={isAdmin}
          folderTree={folderTree} currentPath={currentPath}
          onNavigate={navigate} isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onUpload={() => fileInputRef.current?.click()}
          onCreateFolder={() => setShowCreateFolder(true)}
          onManageUsers={() => setShowUserManager(true)}
          onActivityLog={() => setShowActivityLog(true)}
        />
      </div>

      {/* Mobile sidebar (overlay) */}
      <div className="sidebar-mobile" style={{ display: "none" }}>
        {sidebarOpen && (
          <Sidebar
            user={user} isAdmin={isAdmin}
            folderTree={folderTree} currentPath={currentPath}
            onNavigate={navigate} isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onUpload={() => { fileInputRef.current?.click(); setSidebarOpen(false); }}
            onCreateFolder={() => { setShowCreateFolder(true); setSidebarOpen(false); }}
            onManageUsers={() => { setShowUserManager(true); setSidebarOpen(false); }}
            onActivityLog={() => { setShowActivityLog(true); setSidebarOpen(false); }}
          />
        )}
      </div>

      {/* Main content area */}
      <div className="main-content" style={gs.mainContent}>
        {/* TopBar */}
        <TopBar
          breadcrumb={breadcrumb}
          onMenuClick={() => setSidebarOpen(true)}
          isAdmin={isAdmin}
          onManageUsers={() => setShowUserManager(true)}
          rightSlot={
            <button
              style={gs.uploadBtn}
              onClick={() => fileInputRef.current?.click()}
              title="Upload files"
            >
              <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
                <path d="M10 13V4M6 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>Upload</span>
            </button>
          }
        />

        {/* Hidden file input */}
        <input
          ref={fileInputRef} type="file" multiple
          accept=".jpg,.jpeg,.png,.gif,.mp4,.webm,.mkv"
          style={{ display: "none" }}
          onChange={handleUpload}
        />

        {/* Selection bar */}
        {selected.size > 0 && (
          <div style={gs.selectionBar}>
            <button style={gs.selCancel} onClick={() => setSelected(new Set())}>
              <svg viewBox="0 0 20 20" fill="none" width="14" height="14"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              Cancel
            </button>
            <span style={{ fontSize: "0.84rem", color: "var(--text-2)", fontWeight: 500 }}>{selected.size} selected</span>
            <button style={gs.selDelete} onClick={deleteSelected}>
              <svg viewBox="0 0 20 20" fill="none" width="14" height="14"><path d="M5 6h10M8 6V4h4v2M7 9v6M10 9v6M13 9v6M6 6l.75 10h6.5L14 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Delete
            </button>
          </div>
        )}

        {/* Path nav */}
        {currentPath && (
          <div style={gs.pathNav}>
            <button style={gs.backBtn} onClick={goUp}>
              <svg viewBox="0 0 20 20" fill="none" width="15" height="15"><path d="M13 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Back
            </button>
            <span style={gs.pathLabel}>/{currentPath}</span>
            <button
              style={{ ...gs.newFolderBtn }}
              onClick={() => setShowCreateFolder(true)}
            >
              + New Folder
            </button>
          </div>
        )}

        {/* Content area */}
        <main style={gs.grid}>
          {loading && (
            <div style={gs.loadingState}>
              <div className="loading-spinner" />
              <span style={{ color: "var(--text-3)", fontSize: "0.9rem" }}>Loading…</span>
            </div>
          )}

          {!loading && folders.length === 0 && files.length === 0 && (
            <div style={gs.emptyState}>
              <div style={{ fontSize: "2.5rem" }}>🖼</div>
              <p style={{ color: "var(--text-3)", fontSize: "0.9rem" }}>No media here yet</p>
              <button style={gs.emptyUploadBtn} onClick={() => fileInputRef.current?.click()}>Upload Files</button>
            </div>
          )}

          {!loading && folders.map((folder) => (
            <FolderCard
              key={folder} name={folder}
              onClick={() => navigate(currentPath ? `${currentPath}/${folder}` : folder)}
              onDelete={() => deleteFolder(folder)}
              isAdmin={isAdmin} currentUser={user}
              path={currentPath ? `${currentPath}/${folder}` : folder}
            />
          ))}

          {!loading && pageFiles.map((file, idx) => {
            const isVideo = /\.(mp4|webm|mkv)$/i.test(file);
            const src = `/media/${currentPath ? currentPath + "/" : ""}${file}`;
            return (
              <MediaCard
                key={file} src={src} isVideo={isVideo}
                selected={selected.has(file)}
                onSelect={() => toggleSelect(file)}
                onLightbox={() => setLightboxIndex(idx)}
                onDelete={async () => {
                  if (!confirm(`Delete "${file}"?`)) return;
                  await fetch(`/api/media?path=${encodeURIComponent(currentPath)}&filename=${encodeURIComponent(file)}`, { method: "DELETE" });
                  loadMedia(currentPath);
                }}
              />
            );
          })}
        </main>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={gs.pagination}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                style={{ ...gs.pageBtn, ...(i === page ? gs.pageBtnActive : {}) }}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav (mobile) */}
      <div className="bottom-nav-mobile" style={{ display: "none" }}>
        <Sidebar
          user={user} isAdmin={isAdmin}
          folderTree={folderTree} currentPath={currentPath}
          onNavigate={navigate} isOpen={false}
          onClose={() => {}}
          onUpload={() => fileInputRef.current?.click()}
          onCreateFolder={() => setShowCreateFolder(true)}
          onManageUsers={() => setShowUserManager(true)}
          onActivityLog={() => setShowActivityLog(true)}
        />
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          files={lightboxUrls} index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => (i - 1 + lightboxUrls.length) % lightboxUrls.length)}
          onNext={() => setLightboxIndex((i) => (i + 1) % lightboxUrls.length)}
        />
      )}

      {/* Modals */}
      {showCreateFolder && (
        <CreateFolderModal
          currentPath={currentPath}
          onClose={() => setShowCreateFolder(false)}
          onCreated={() => {
            loadMedia(currentPath);
            fetch("/api/tree").then((r) => r.json()).then((d) => setFolderTree(d.tree || []));
          }}
        />
      )}
      {showUserManager && <UserManagerModal onClose={() => setShowUserManager(false)} />}
      {showActivityLog && <ActivityLogModal onClose={() => setShowActivityLog(false)} />}
    </BaseLayout>
  );
}

/* ── Gallery Styles ─────────────────────────────────────── */
const gs = {
  mainContent: {
    marginLeft: 268,
    padding: "0 12px 32px",
    minHeight: "100dvh",
    transition: "margin-left 0.3s",
  },
  selectionBar: {
    display: "flex", alignItems: "center", gap: 12,
    margin: "10px 0 0",
    padding: "10px 16px",
    background: "var(--glass-bg)",
    backdropFilter: "blur(var(--glass-blur))",
    border: "1px solid var(--glass-border)",
    borderRadius: 14,
  },
  selCancel: {
    display: "flex", alignItems: "center", gap: 6,
    background: "transparent", border: "none",
    color: "var(--text-2)", cursor: "pointer",
    fontSize: "0.84rem", fontFamily: "inherit",
  },
  selDelete: {
    display: "flex", alignItems: "center", gap: 6,
    marginLeft: "auto",
    background: "rgba(255,107,107,0.1)",
    border: "1px solid rgba(255,107,107,0.3)",
    borderRadius: 9, padding: "6px 12px",
    color: "var(--error)", cursor: "pointer",
    fontSize: "0.84rem", fontFamily: "inherit", fontWeight: 600,
  },
  pathNav: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 0 0",
  },
  backBtn: {
    display: "flex", alignItems: "center", gap: 6,
    background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
    borderRadius: 10, padding: "7px 12px",
    color: "var(--text-2)", cursor: "pointer",
    fontSize: "0.84rem", fontFamily: "inherit", fontWeight: 500,
  },
  pathLabel: {
    fontSize: "0.82rem", color: "var(--text-3)",
    overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", flex: 1,
  },
  newFolderBtn: {
    background: "var(--accent-bg)", border: "1px solid var(--accent-border)",
    borderRadius: 10, padding: "7px 12px",
    color: "var(--accent)", cursor: "pointer",
    fontSize: "0.82rem", fontFamily: "inherit", fontWeight: 600,
    whiteSpace: "nowrap",
  },
  uploadBtn: {
    display: "flex", alignItems: "center", gap: 6,
    background: "var(--accent-bg)", border: "1px solid var(--accent-border)",
    borderRadius: 10, padding: "7px 12px",
    color: "var(--accent)", cursor: "pointer", fontFamily: "inherit",
    transition: "background 0.18s",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: 10,
    padding: "14px 0",
  },
  loadingState: {
    gridColumn: "1 / -1",
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 12, padding: 64, color: "var(--text-3)",
  },
  emptyState: {
    gridColumn: "1 / -1",
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: 12, padding: 64,
  },
  emptyUploadBtn: {
    background: "var(--accent-bg)", border: "1px solid var(--accent-border)",
    borderRadius: 999, padding: "10px 20px",
    color: "var(--accent)", cursor: "pointer",
    fontSize: "0.86rem", fontFamily: "inherit", fontWeight: 600,
  },
  folderCard: {
    position: "relative",
    background: "var(--glass-bg)",
    border: "1px solid var(--glass-border)",
    borderRadius: 14, padding: "14px 12px",
    cursor: "pointer",
    transition: "transform 0.18s, box-shadow 0.18s",
    display: "flex", flexDirection: "column",
  },
  folderCardInner: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
  },
  folderName: {
    fontSize: "0.78rem", fontWeight: 500, color: "var(--text-2)",
    textAlign: "center", overflow: "hidden", whiteSpace: "nowrap",
    textOverflow: "ellipsis", width: "100%",
  },
  deleteBtn: {
    position: "absolute", top: 6, right: 6,
    width: 24, height: 24, borderRadius: 7,
    background: "rgba(255,107,107,0.1)",
    border: "1px solid rgba(255,107,107,0.25)",
    color: "var(--error)", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    opacity: 0, transition: "opacity 0.15s",
  },
  mediaCard: {
    aspectRatio: "1",
    background: "rgba(128,128,128,0.08)",
    border: "1px solid var(--glass-border)",
    borderRadius: 12, overflow: "hidden",
    position: "relative", cursor: "pointer",
    transition: "transform 0.18s, box-shadow 0.18s",
  },
  mediaCardSelected: {
    border: "2px solid var(--accent)",
    boxShadow: "0 0 0 2px var(--accent-glow)",
  },
  mediaImg: {
    width: "100%", height: "100%", objectFit: "cover",
    display: "block",
  },
  videoThumb: {
    width: "100%", height: "100%",
    background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  selBtn: {
    position: "absolute", top: 6, left: 6,
    background: "transparent", border: "none",
    cursor: "pointer", padding: 0, lineHeight: 0,
  },
  pagination: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 6, padding: "16px 0",
  },
  pageBtn: {
    width: 34, height: 34, borderRadius: 9,
    background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
    color: "var(--text-2)", cursor: "pointer",
    fontSize: "0.84rem", fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.15s",
  },
  pageBtnActive: {
    background: "var(--accent-bg)", border: "1px solid var(--accent-border)",
    color: "var(--accent)", fontWeight: 700,
  },
};

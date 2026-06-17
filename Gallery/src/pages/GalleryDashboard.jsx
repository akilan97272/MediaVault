// pages/GalleryDashboard.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import BaseLayout from "../components/BaseLayout";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { useAuth } from "../context/AuthContext";

const PAGE_SIZE = 40;

/* ── helpers ─────────────────────────────────────────────── */
function buildBreadcrumb(path) {
  if (!path) return "All Media";
  return path.split("/").join(" / ");
}

/* ────────────────────────────────────────────────────────────
   Context Menu (right-click / long-press)
   Works for both files and folders.
   ──────────────────────────────────────────────────────────── */
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  // Adjust position so the menu stays on-screen
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      x: x + rect.width  > vw ? vw - rect.width  - 8 : x,
      y: y + rect.height > vh ? vh - rect.height - 8 : y,
    });
  }, [x, y]);

  // Close on click-outside or scroll
  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("touchstart", close);
    window.addEventListener("scroll",    onClose, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("touchstart", close);
      window.removeEventListener("scroll",    onClose, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: pos.x,
        top:  pos.y,
        zIndex: 600,
        minWidth: 180,
        background: "var(--glass-bg)",
        backdropFilter: "blur(24px) saturate(200%)",
        WebkitBackdropFilter: "blur(24px) saturate(200%)",
        border: "1px solid var(--glass-border)",
        borderRadius: 14,
        boxShadow: "0 1px 0 var(--glass-shine) inset, 0 16px 48px var(--glass-shadow)",
        padding: "5px 0",
        animation: "ctxFadeIn 0.12s ease",
      }}
    >
      {items.map((item, i) =>
        item === "divider" ? (
          <div key={i} style={{ height: 1, background: "var(--glass-border)", margin: "4px 0" }} />
        ) : (
          <button
            key={i}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 14px",
              background: "transparent",
              border: "none",
              borderRadius: 0,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.87rem",
              fontWeight: 500,
              color: item.danger ? "var(--error)" : "var(--text-1)",
              textAlign: "left",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = item.danger ? "rgba(255,107,107,0.08)" : "rgba(128,128,128,0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onClick={() => { item.action(); onClose(); }}
          >
            <span style={{ opacity: 0.75, lineHeight: 0 }}>{item.icon}</span>
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

/* ── Move File Modal ─────────────────────────────────────── */
function MoveModal({ filenames, currentPath, folderTree, onClose, onMoved }) {
  const [dest, setDest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function flattenTree(nodes) {
    const paths = [""];
    function walk(list, pre) {
      for (const n of list) {
        const p = pre ? `${pre}/${n.name}` : n.name;
        paths.push(p);
        if (n.children?.length) walk(n.children, p);
      }
    }
    walk(nodes, "");
    return paths;
  }

  const allPaths = flattenTree(folderTree);

  async function move() {
    if (dest === currentPath) return setError("Already in that folder");
    setLoading(true); setError("");
    try {
      for (const fn of filenames) {
        const res = await fetch("/api/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ src_path: currentPath, filename: fn, dest_path: dest }),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.error || `Failed to move "${fn}"`);
          setLoading(false);
          return;
        }
      }
      onMoved(); onClose();
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Move {filenames.length} item{filenames.length !== 1 ? "s" : ""}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-pill">{error}</div>}
          <label style={{ fontSize: "0.82rem", color: "var(--text-2)", fontWeight: 500 }}>
            Destination Folder
          </label>
          <select className="glass-input" value={dest} onChange={(e) => setDest(e.target.value)}>
            {allPaths.map((p) => (
              <option key={p} value={p}>{p === "" ? "/ (root)" : `/${p}`}</option>
            ))}
          </select>
          <button className="glass-btn-primary" onClick={move} disabled={loading || dest === currentPath}>
            {loading ? "Moving…" : "Move Here"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Folder Card ─────────────────────────────────────────── */
function FolderCard({ name, onClick, onContextMenu, selected }) {
  const longPressTimer = useRef(null);

  function startLongPress(e) {
    // Mobile long-press → context menu
    const touch = e.touches?.[0];
    longPressTimer.current = setTimeout(() => {
      onContextMenu(touch?.clientX ?? 80, touch?.clientY ?? 80);
    }, 500);
  }
  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
  }

  return (
    <div
      style={{
        ...gs.folderCard,
        ...(selected ? gs.folderCardSelected : {}),
      }}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e.clientX, e.clientY); }}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
    >
      <div style={gs.folderCardInner}>
        <svg viewBox="0 0 48 40" fill="none" width="48" height="40">
          <path
            d="M2 8a4 4 0 014-4h12l4 4h20a4 4 0 014 4v22a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"
            fill={selected ? "var(--accent-bg)" : "var(--folder-fill)"}
            stroke={selected ? "var(--accent)" : "var(--folder-stroke)"}
            strokeWidth="1.4"
          />
        </svg>
        <span style={gs.folderName}>{name}</span>
      </div>
      {selected && (
        <div style={gs.folderCheckmark}>
          <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
            <circle cx="8" cy="8" r="7" fill="var(--accent)" />
            <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

/* ── Media Card ──────────────────────────────────────────── */
function MediaCard({ src, filename, isVideo, selected, onLightbox, onContextMenu }) {
  const longPressTimer = useRef(null);
  const didLongPress   = useRef(false);

  function startLongPress(e) {
    didLongPress.current = false;
    const touch = e.touches?.[0];
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      // Vibrate on mobile for tactile feedback
      navigator.vibrate?.(40);
      onContextMenu(touch?.clientX ?? 80, touch?.clientY ?? 80);
    }, 500);
  }
  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
  }

  return (
    <div
      style={{ ...gs.mediaCard, ...(selected ? gs.mediaCardSelected : {}) }}
      onClick={(e) => {
        if (didLongPress.current) { didLongPress.current = false; return; }
        onLightbox();
      }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e.clientX, e.clientY); }}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
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

      {/* Selection indicator — only shows when selected */}
      {selected && (
        <div style={gs.selIndicator}>
          <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
            <circle cx="8" cy="8" r="7" fill="var(--accent)" />
            <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

/* ── Lightbox ────────────────────────────────────────────── */
const SLIDESHOW_SPEEDS = [10, 15, 20, 25, 30];

function Lightbox({ files, index, onClose, onPrev, onNext, slideshowInterval, setSlideshowInterval }) {
  const file = files[index];
  const [playing, setPlaying] = useState(false);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);
  const timerRef = useRef(null);
  // ── Zoom & pan state ─────────────────────────────────
  const [zoom, setZoom]           = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const dragState  = useRef({ dragging: false, startX: 0, startY: 0, startOffset: { x: 0, y: 0 } });
  const pinchState = useRef({ active: false, startDist: 0, startZoom: 1 });

  if (!file) return null;
  const isVideo = /\.(mp4|webm|mkv)$/i.test(file);

  // Keyboard nav
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowLeft")  { onPrev(); }
      if (e.key === "ArrowRight") { onNext(); }
      if (e.key === "Escape")     { setPlaying(false); onClose(); }
      if (e.key === " ")          { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  // Slideshow auto-advance
  useEffect(() => {
    clearInterval(timerRef.current);
    if (playing) {
      timerRef.current = setInterval(() => {
        onNext();
      }, slideshowInterval * 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [playing, slideshowInterval, onNext]);

  // Stop slideshow when closed
  useEffect(() => () => { clearInterval(timerRef.current); }, []);

  // Image-only files for slideshow (skip videos)
  const imageFiles = files.filter((f) => !/\.(mp4|webm|mkv)$/i.test(f));
  // Reset zoom on file change
  useEffect(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    dragState.current.dragging  = false;
    pinchState.current.active   = false;
  }, [index]);

  // Zoom helpers
  function handleWheel(e) {
    if (isVideo) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom((z) => {
      const next = Math.min(Math.max(z + delta, 1), 5);
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }
  function handleDoubleClick() {
    if (isVideo) return;
    if (zoom > 1) { setZoom(1); setPanOffset({ x: 0, y: 0 }); }
    else setZoom(2.5);
  }
  function handleMouseDown(e) {
    if (zoom <= 1) return;
    dragState.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOffset: { ...panOffset } };
  }
  function handleMouseMove(e) {
    if (!dragState.current.dragging) return;
    setPanOffset({
      x: dragState.current.startOffset.x + (e.clientX - dragState.current.startX),
      y: dragState.current.startOffset.y + (e.clientY - dragState.current.startY),
    });
  }
  function handleMouseUp() { dragState.current.dragging = false; }

  function getTouchDist(touches) {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );
  }
  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      pinchState.current = { active: true, startDist: getTouchDist(e.touches), startZoom: zoom };
    } else if (e.touches.length === 1 && zoom > 1) {
      dragState.current = { dragging: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, startOffset: { ...panOffset } };
    }
  }
  function handleTouchMove(e) {
    if (pinchState.current.active && e.touches.length === 2) {
      const next = Math.min(Math.max(pinchState.current.startZoom * (getTouchDist(e.touches) / pinchState.current.startDist), 1), 5);
      setZoom(next);
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
    } else if (dragState.current.dragging && e.touches.length === 1) {
      setPanOffset({
        x: dragState.current.startOffset.x + (e.touches[0].clientX - dragState.current.startX),
        y: dragState.current.startOffset.y + (e.touches[0].clientY - dragState.current.startY),
      });
    }
  }
  function handleTouchEnd() {
    pinchState.current.active   = false;
    dragState.current.dragging  = false;
  }

  return (
    <div style={lb.overlay} onClick={() => { setPlaying(false); onClose(); }}>

      {/* ── Top-right buttons ── */}
      <div style={lb.topRight} onClick={(e) => e.stopPropagation()}>
        {/* Download */}
        <a href={file} download style={lb.iconBtn} title="Download">
          <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
            <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 15v1a1 1 0 001 1h12a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </a>

        {/* Slideshow toggle — images only */}
        {!isVideo && (
          <button
            style={{ ...lb.iconBtn, background: playing ? "rgba(99,185,255,0.3)" : "rgba(255,255,255,0.1)", border: playing ? "1px solid var(--accent)" : "none" }}
            onClick={() => setPlaying((p) => !p)}
            title={playing ? "Pause slideshow (Space)" : "Start slideshow (Space)"}
          >
            {playing ? (
              <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
                <rect x="5" y="4" width="3" height="12" rx="1" fill="currentColor" />
                <rect x="12" y="4" width="3" height="12" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
                <polygon points="5,3 17,10 5,17" fill="currentColor" />
              </svg>
            )}
          </button>
        )}

        {/* Speed picker */}
        {!isVideo && (
          <div style={{ position: "relative" }}>
            <button
              style={lb.iconBtn}
              onClick={() => setShowSpeedPicker((s) => !s)}
              title="Slideshow speed"
            >
              <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>
                {slideshowInterval}s
              </span>
            </button>
            {showSpeedPicker && (
              <div style={lb.speedPicker}>
                <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", padding: "6px 10px 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Interval
                </div>
                {SLIDESHOW_SPEEDS.map((s) => (
                  <button
                    key={s}
                    style={{
                      ...lb.speedOption,
                      background: s === slideshowInterval ? "rgba(99,185,255,0.2)" : "transparent",
                      color: s === slideshowInterval ? "var(--accent)" : "#fff",
                    }}
                    onClick={() => { setSlideshowInterval(s); setShowSpeedPicker(false); setPlaying(true); }}
                  >
                    {s} sec
                    {s === slideshowInterval && (
                      <svg viewBox="0 0 16 16" fill="none" width="12" height="12" style={{ marginLeft: "auto" }}>
                        <path d="M3 8l3 3 7-7" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Close */}
        <button style={lb.iconBtn} onClick={() => { setPlaying(false); onClose(); }}>✕</button>
      </div>

      {/* Progress bar when slideshow playing */}
      {playing && (
        <div style={lb.progressTrack}>
          <div
            key={`${index}-${slideshowInterval}`}
            style={{
              ...lb.progressBar,
              animation: `lbProgress ${slideshowInterval}s linear forwards`,
            }}
          />
        </div>
      )}

      {/* Nav arrows */}
      <button style={{ ...lb.navBtn, left: 12 }} onClick={(e) => { e.stopPropagation(); onPrev(); }}>‹</button>
      <button style={{ ...lb.navBtn, right: 12 }} onClick={(e) => { e.stopPropagation(); onNext(); }}>›</button>

      {/* Media */}
      <div
        style={{
          ...lb.content,
          overflow: "hidden",
          cursor: !isVideo && zoom > 1 ? (dragState.current.dragging ? "grabbing" : "grab") : "default",
        }}
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
      {isVideo
          ? <video src={file} controls autoPlay style={lb.media} />
          : (
            <img
              src={file}
              alt=""
              style={{
                ...lb.media,
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                transition: dragState.current.dragging ? "none" : "transform 0.15s ease-out",
                touchAction: "none",
              }}
              draggable={false}
            />
          )
        }
      </div>

      {/* Counter */}
      <div style={lb.counter}>
        {index + 1} / {files.length}
      </div>

     {!isVideo && zoom > 1 && (
        <div style={{ ...lb.counter, bottom: "auto", top: 16, left: 16, transform: "none" }}>
          {Math.round(zoom * 100)}% · double-click to reset
        </div>
      )}
    </div>

  );
}

const lb = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 500,
    background: "rgba(0,0,0,0.94)", display: "flex",
    alignItems: "center", justifyContent: "center",
  },
  topRight: {
    position: "absolute", top: 12, right: 12,
    display: "flex", alignItems: "center", gap: 6,
    zIndex: 10,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: "50%",
    background: "rgba(255,255,255,0.1)", border: "none",
    color: "#fff", cursor: "pointer", fontSize: "1rem",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.15s",
    textDecoration: "none",
  },
  navBtn: {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    width: 44, height: 44, borderRadius: "50%",
    background: "rgba(255,255,255,0.1)", border: "none",
    color: "#fff", fontSize: "1.5rem", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 10,
  },
  content: { maxWidth: "90vw", maxHeight: "85vh" },
  media: { maxWidth: "90vw", maxHeight: "85vh", objectFit: "contain", borderRadius: 12 },
  counter: {
    position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
    fontSize: "0.78rem", color: "rgba(255,255,255,0.5)", fontWeight: 500,
    background: "rgba(0,0,0,0.4)", padding: "4px 12px", borderRadius: 999,
  },
  progressTrack: {
    position: "absolute", top: 0, left: 0, right: 0, height: 2,
    background: "rgba(255,255,255,0.1)", zIndex: 10,
  },
  progressBar: {
    height: "100%",
    background: "linear-gradient(90deg, var(--accent), rgba(160,80,255,0.9))",
    borderRadius: 1,
    width: "0%",
  },
  speedPicker: {
    position: "absolute", top: "calc(100% + 8px)", right: 0,
    background: "rgba(20,24,36,0.95)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12, minWidth: 120,
    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
    overflow: "hidden",
    zIndex: 20,
  },
  speedOption: {
    width: "100%", display: "flex", alignItems: "center",
    padding: "8px 10px", gap: 6,
    border: "none", cursor: "pointer",
    fontSize: "0.84rem", fontWeight: 500, fontFamily: "inherit",
    transition: "background 0.12s",
  },
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

//  ─ Modal: User Manager ───────────────────────────────────── */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function UserManagerModal({ onClose }) {
  const [users, setUsers]               = useState([]);
  const [restrictions, setRestrictions] = useState({}); // { username: {enabled, allowed_days} }
  const [newUser, setNewUser]           = useState("");
  const [newPass, setNewPass]           = useState("");
  const [msg, setMsg]                   = useState({ type: "", text: "" });
  const [savingUser, setSavingUser]     = useState(null); // username currently saving

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
      // Expecting { username: { enabled, allowed_days } }
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
        loadRestrictions(); // revert on failure
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
          {/* Add user */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h3 style={um.sectionTitle}>Add New User</h3>
            {msg.text && <div className={msg.type === "error" ? "error-pill" : "success-pill"}>{msg.text}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <input className="glass-input" placeholder="Username" value={newUser} onChange={(e) => setNewUser(e.target.value)} style={{ flex: 1 }} />
              <input className="glass-input" type="password" placeholder="Password" value={newPass} onChange={(e) => setNewPass(e.target.value)} style={{ flex: 1 }} />
              <button className="glass-btn-accent" onClick={createUser}>Add</button>
            </div>
          </div>

          {/* Existing users */}
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
                  {/* Top row: name + delete */}
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

                  {/* Restriction toggle */}
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

                  {/* Day picker — only when enabled */}
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

/* ── User Manager Styles ─────────────────────────────────── */
const um = {
  sectionTitle: { fontSize: "0.86rem", fontWeight: 600, color: "var(--text-1)" },
  userCard: {
    display: "flex", flexDirection: "column", gap: 10,
    padding: "12px 14px", borderRadius: 14,
    background: "var(--glass-bg)",
    border: "1px solid var(--glass-border)",
  },
  userTopRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  userNameWrap: {
    display: "flex", alignItems: "center", gap: 9,
  },
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
  restrictionLabel: {
    fontSize: "0.78rem", color: "var(--text-2)", fontWeight: 500, flex: 1,
  },
  clearBtn: {
    background: "transparent",
    border: "1px solid var(--glass-border)",
    borderRadius: 8, padding: "3px 10px",
    color: "var(--text-3)", cursor: "pointer",
    fontSize: "0.72rem", fontWeight: 600, fontFamily: "inherit",
  },
  dayRow: {
    display: "flex", gap: 6, flexWrap: "wrap",
    paddingTop: 4,
  },
  dayChip: {
    padding: "5px 12px", borderRadius: 999,
    cursor: "pointer", fontSize: "0.76rem", fontFamily: "inherit",
    transition: "all 0.15s",
  },
};

/* ── Modal: Activity Log ─────────────────────────────────── */
function ActivityLogModal({ onClose }) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
      fetch("/api/activity-log")
        .then((r) => r.json())
        .then((d) => {
          // API returns { activities: [...] } — map to the shape ActivityLogModal renders
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

/* ── Random Photos Widget ────────────────────────────────── */
const RANDOM_COUNTS = [10, 20, 30, 40, 50];

function flattenFolderTreeForPicker(nodes, prefix = "") {
  const out = [];
  for (const n of nodes) {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    out.push({ path: p, name: n.name, depth: prefix.split("/").filter(Boolean).length });
    if (n.children?.length) out.push(...flattenFolderTreeForPicker(n.children, p));
  }
  return out;
}

function FolderPickerDropdown({ folderTree, selectedFolders, onChange, onClose, anchorRef }) {
  const ref        = useRef(null);
  const [rect, setRect] = useState(() =>
    anchorRef?.current ? anchorRef.current.getBoundingClientRect() : null
  );
  const allFolders = flattenFolderTreeForPicker(folderTree);
  const isAll      = selectedFolders.includes("__all__");

  // useLayoutEffect so position is set before first paint — no flash at -9999
  useEffect(() => {
    if (anchorRef?.current) setRect(anchorRef.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
          anchorRef?.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("touchstart", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("touchstart", close);
    };
  }, [onClose, anchorRef]);

  function toggleAll() { onChange(["__all__"]); }
  function toggleFolder(path) {
    if (isAll) { onChange([path]); return; }
    const has  = selectedFolders.includes(path);
    const next = has ? selectedFolders.filter((p) => p !== path) : [...selectedFolders, path];
    onChange(next.length ? next : ["__all__"]);
  }

  const W  = 220;
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const top  = rect ? rect.bottom + 6 : -9999;
  const left = rect ? Math.min(Math.max(rect.right - W, 8), vw - W - 8) : -9999;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top, left,
        width: W,
        zIndex: 9999,
        background: "var(--glass-bg)",
        backdropFilter: "blur(24px) saturate(200%)",
        WebkitBackdropFilter: "blur(24px) saturate(200%)",
        border: "1px solid var(--glass-border)",
        borderRadius: 16,
        maxHeight: 300,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 1px 0 var(--glass-shine) inset, 0 20px 60px rgba(0,0,0,0.45)",
      }}
    >
      <div style={fp.header}>Photo source</div>
      <div style={{ ...fp.list, overflowY: "auto" }}>
        <button style={{ ...fp.item, ...(isAll ? fp.itemActive : {}) }} onClick={toggleAll}>
          <span style={fp.checkbox}>{isAll && <CheckMark />}</span>
          All folders
        </button>
        {allFolders.map((f) => {
          const active = !isAll && selectedFolders.includes(f.path);
          return (
            <button
              key={f.path}
              style={{ ...fp.item, ...(active ? fp.itemActive : {}), paddingLeft: 12 + f.depth * 14 }}
              onClick={() => toggleFolder(f.path)}
            >
              <span style={fp.checkbox}>{active && <CheckMark />}</span>
              {f.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CheckMark = () => (
  <svg viewBox="0 0 16 16" fill="none" width="11" height="11">
    <path d="M3 8l3 3 7-7" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const fp = {
  dropdown: {
    position: "absolute", top: "calc(100% + 6px)", right: 0,
    background: "var(--glass-bg)",
    backdropFilter: "blur(24px) saturate(200%)",
    WebkitBackdropFilter: "blur(24px) saturate(200%)",
    border: "1px solid var(--glass-border)",
    borderRadius: 14, minWidth: 200, maxHeight: 280,
    /* On narrow screens, don't bleed off the left edge of the viewport */
    maxWidth: "calc(100vw - 16px)",
    boxShadow: "0 1px 0 var(--glass-shine) inset, 0 16px 48px var(--glass-shadow)",
    zIndex: 50, overflow: "hidden",
    display: "flex", flexDirection: "column",
  },
  header: {
    fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.08em", color: "var(--text-3)",
    padding: "10px 14px 6px",
  },
  list: { overflowY: "auto", paddingBottom: 6 },
  item: {
    width: "100%", display: "flex", alignItems: "center", gap: 8,
    padding: "7px 14px", background: "transparent", border: "none",
    color: "var(--text-2)", cursor: "pointer", textAlign: "left",
    fontFamily: "inherit", fontSize: "0.82rem", fontWeight: 500,
    transition: "background 0.12s, color 0.12s",
  },
  itemActive: { color: "var(--accent)", background: "var(--accent-bg)" },
  checkbox: {
    width: 14, height: 14, borderRadius: 4,
    border: "1.5px solid var(--glass-border)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
};

function RandomPhotosWidget({
  photos, count, onCountChange, onRefresh, loading, onPhotoClick,
  folderTree, selectedFolders, onFoldersChange,
  showFolderPicker, setShowFolderPicker,
}) {
  const folderBtnRef = useRef(null);
  return (
    <div style={{ ...rw.wrap, position: "relative" }} className="glass-card rw-wrap-override">
      {/* Header */}
      <div style={rw.header}>
        <div style={rw.titleRow}>
          <svg viewBox="0 0 20 20" fill="none" width="15" height="15" style={{ color: "var(--accent)", flexShrink: 0 }}>
            <path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" stroke="currentColor" strokeWidth="1.3" />
            <path d="M3 13l4-4 3 3 2-2 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
          </svg>
          <span style={rw.title}>Random Picks</span>
        </div>

        <div style={rw.controls}>
          {/* Count selector pills */}
          <div style={rw.pills}>
            {RANDOM_COUNTS.map((n) => (
              <button
                key={n}
                style={{
                  ...rw.pill,
                  background: n === count ? "var(--accent-bg)" : "transparent",
                  border: n === count ? "1px solid var(--accent-border)" : "1px solid var(--glass-border)",
                  color: n === count ? "var(--accent)" : "var(--text-3)",
                  fontWeight: n === count ? 700 : 500,
                }}
                onClick={() => onCountChange(n)}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button style={rw.refreshBtn} onClick={onRefresh} title="Shuffle" disabled={loading}>
            <svg
              viewBox="0 0 20 20" fill="none" width="13" height="13"
              style={{ animation: loading ? "rwSpin 0.7s linear infinite" : "none" }}
            >
              <path d="M4 4v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 16v-5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4.93 9A7 7 0 0115.07 11M15.07 11A7 7 0 014.93 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Shuffle
          </button>

          {/* Folder picker */}
          <div style={{ position: "relative" }}>
            <button
              ref={folderBtnRef}
              style={rw.refreshBtn}
              title="Choose folders"
              onMouseDown={(e) => {
                e.stopPropagation();
                setShowFolderPicker((s) => !s);
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" width="13" height="13">
                <path d="M2 6a2 2 0 012-2h3.586a1 1 0 01.707.293L9.414 5.5H16a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              Folders
              {!selectedFolders.includes("__all__") && (
                <span style={rw.folderBadge}>{selectedFolders.length}</span>
              )}
            </button>

            {showFolderPicker && (
              <FolderPickerDropdown
                folderTree={folderTree}
                selectedFolders={selectedFolders}
                onChange={onFoldersChange}
                onClose={() => setShowFolderPicker(false)}
                anchorRef={folderBtnRef}
              />
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading && (
        <div style={rw.loadingRow}>
          <div className="loading-spinner" />
          <span style={{ fontSize: "0.82rem", color: "var(--text-3)" }}>Loading…</span>
        </div>
      )}

      {!loading && photos.length === 0 && (
        <div style={rw.empty}>No photos found</div>
      )}

      {!loading && photos.length > 0 && (
        <div style={rw.grid} className="rw-grid">
          {photos.map((url, i) => (
            <div
              key={i}
              style={rw.thumb}
              className="rw-thumb"
              onClick={() => onPhotoClick(i)}
              title="Click to view"
            >
              <img
                src={url}
                loading="lazy"
                decoding="async"
                alt=""
                style={rw.img}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const rw = {
  wrap: {
    borderRadius: 18,
    overflow: "visible",
    marginBottom: 4,
    /* keep visual card shape via box-shadow / border on inner elements */
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderBottom: "1px solid var(--glass-border)",
    gap: 10,
    flexWrap: "wrap",
    /* ensure the folder-picker dropdown can escape this container */
    overflow: "visible",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexShrink: 0,
  },
  title: {
    fontSize: "0.84rem",
    fontWeight: 600,
    color: "var(--text-1)",
    letterSpacing: "0.02em",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  pills: {
    display: "flex",
    gap: 4,
  },
  pill: {
    padding: "3px 9px",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: "0.72rem",
    fontFamily: "inherit",
    transition: "all 0.15s",
  },
  refreshBtn: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    background: "var(--glass-bg)",
    border: "1px solid var(--glass-border)",
    borderRadius: 8,
    color: "var(--text-2)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontFamily: "inherit",
    fontWeight: 500,
    transition: "background 0.15s",
  },
  loadingRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "20px 14px",
    color: "var(--text-3)",
  },
  empty: {
    padding: "24px 14px",
    textAlign: "center",
    color: "var(--text-3)",
    fontSize: "0.84rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
    gap: 6,
    padding: 10,
  },
  thumb: {
    aspectRatio: "1",
    borderRadius: 10,
    overflow: "hidden",
    cursor: "pointer",
    border: "1px solid var(--glass-border)",
    transition: "transform 0.15s, box-shadow 0.15s",
    background: "rgba(128,128,128,0.07)",
  },
  img: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    transition: "transform 0.2s",
  },
};

/* ── Main GalleryDashboard ───────────────────────────────── */
export default function GalleryDashboard() {
  const [currentPath, setCurrentPath] = useState("");
  const [files, setFiles]             = useState([]);
  const [folders, setFolders]         = useState([]);
  const [folderTree, setFolderTree]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage]               = useState(0);
  const [selected, setSelected]       = useState(new Set());   // filenames
  const [selectedFolders, setSelectedFolders] = useState(new Set());
  const [lightboxIndex, setLightboxIndex]     = useState(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showUserManager,  setShowUserManager]  = useState(false);
  const [showActivityLog,  setShowActivityLog]  = useState(false);
  // Context menu state
  const [ctxMenu, setCtxMenu] = useState(null);
  const [bgCtxMenu, setBgCtxMenu] = useState(null); // { x, y }
  // { x, y, items: [] }
  // Move modal
  const [moveTarget, setMoveTarget] = useState(null);
  const [slideshow, setSlideshow]         = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(10); // seconds
  const [randomPhotos, setRandomPhotos]       = useState([]);
  const [randomCount, setRandomCount]         = useState(20);
  const [randomLoading, setRandomLoading]     = useState(false);
  const [randomLightbox, setRandomLightbox]   = useState(null); // index into randomPhotos
  const [randomFolders, setRandomFolders]     = useState(["__all__"]); // selected folder paths; "__all__" = everything
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, startOffset: { x: 0, y: 0 } });

  const fileInputRef = useRef(null);

const { user, isAdmin } = useAuth();

  /* ── Load folder tree once ─────────────────────────────── */
  useEffect(() => {
    fetch("/api/tree")
      .then((r) => r.json())
      .then((d) => setFolderTree(d.tree || []));
  }, []);

  useEffect(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, [lightboxIndex]);

  /* ── Load media on path change ─────────────────────────── */
  const loadMedia = useCallback(async (path = currentPath) => {
    setLoading(true);
    setFiles([]); setFolders([]);
    setSelected(new Set()); setSelectedFolders(new Set());
    setPage(0);
    try {
      const res = await fetch(`/api/media?path=${encodeURIComponent(path)}`);
      if (res.status === 401) { window.location.href = "/"; return; }
      const data = await res.json();
      setFiles(data.files   || []);
      setFolders(data.folders || []);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  const loadRandomPhotos = useCallback(async (count = randomCount, folders = randomFolders) => {
    if (isAdmin) return;
    setRandomLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("count", count);
      if (!folders.includes("__all__")) {
        folders.forEach((f) => params.append("folders", f));
      }
      const res = await fetch(`/api/random-photos?${params.toString()}`);
      if (res.ok) setRandomPhotos(await res.json());
    } catch (e) { console.error(e); }
    finally { setRandomLoading(false); }
  }, [isAdmin, randomFolders]);

  function flattenFolderTree(nodes, prefix = "") {
    const out = [];
    for (const n of nodes) {
      const p = prefix ? `${prefix}/${n.name}` : n.name;
      out.push(p);
      if (n.children?.length) out.push(...flattenFolderTree(n.children, p));
    }
    return out;
  }

  useEffect(() => {
    if (currentPath === "" && !isAdmin) loadRandomPhotos(randomCount);
  }, [currentPath, isAdmin]);

  useEffect(() => { loadMedia(currentPath); }, [currentPath]);

  function navigate(path) { setCurrentPath(path); }

  function goUp() {
    const parts = currentPath.split("/");
    parts.pop();
    navigate(parts.join("/"));
  }

  /* ── Pagination ────────────────────────────────────────── */
  const pageFiles  = files.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(files.length / PAGE_SIZE);

  /* ── Selection helpers ─────────────────────────────────── */
  const totalSelected = selected.size + selectedFolders.size;

  function toggleSelectFile(filename) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      return next;
    });
  }

  function toggleSelectFolder(name) {
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectedFolders(new Set());
  }

  /* ── Delete helpers ────────────────────────────────────── */
  async function deleteFile(filename) {
    await fetch(
      `/api/media?path=${encodeURIComponent(currentPath)}&filename=${encodeURIComponent(filename)}`,
      { method: "DELETE" }
    );
  }

  async function deleteFolderByName(name) {
    const fullPath = currentPath ? `${currentPath}/${name}` : name;
    await fetch(
      `/api/media?path=${encodeURIComponent(fullPath)}&filename=`,
      { method: "DELETE" }
    );
    fetch("/api/tree").then((r) => r.json()).then((d) => setFolderTree(d.tree || []));
  }

  async function deleteSelected() {
    const total = totalSelected;
    if (!confirm(`Delete ${total} item(s)?`)) return;
    for (const name of selected)        await deleteFile(name);
    for (const name of selectedFolders) await deleteFolderByName(name);
    clearSelection();
    loadMedia(currentPath);
  }

  /* ── Download helper ───────────────────────────────────── */
  function downloadFile(filename) {
    const url  = `/media/${currentPath ? currentPath + "/" : ""}${filename}`;
    const link = document.createElement("a");
    link.href     = url;
    link.download = filename;
    link.click();
  }

  /* ── Download all selected ─────────────────────────────── */
  function downloadSelected() {
    for (const name of selected) downloadFile(name);
  }

  /* ── Upload ────────────────────────────────────────────── */
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

  /* ── Lightbox URLs ─────────────────────────────────────── */
  const lightboxUrls = files
    .filter((f) => /\.(jpg|jpeg|png|gif|mp4|webm|mkv)$/i.test(f))
    .map((f) => `/media/${currentPath ? currentPath + "/" : ""}${f}`);

  /* ── Context menu builders ─────────────────────────────── */
  function openFileContextMenu(x, y, filename, fileIdx) {
    const isSelected = selected.has(filename);
    const fileUrl = `/media/${currentPath ? currentPath + "/" : ""}${filename}`;

    setCtxMenu({
      x, y,
      items: [
        // If multiple already selected show "bulk" options at top
        ...(totalSelected > 1 ? [
          {
            label: `Open (${totalSelected > 1 ? "1" : ""})`,
            icon:  <EyeIcon />,
            action: () => setLightboxIndex(fileIdx),
          },
        ] : [
          {
            label: "Open",
            icon:  <EyeIcon />,
            action: () => setLightboxIndex(fileIdx),
          },
        ]),
        {
          label: isSelected ? "Deselect" : "Select",
          icon:  <CheckIcon />,
          action: () => toggleSelectFile(filename),
        },
        ...(totalSelected > 1 ? [
          {
            label: `Select All (${files.length})`,
            icon:  <CheckAllIcon />,
            action: () => setSelected(new Set(pageFiles)),
          },
        ] : []),
        "divider",
        {
          label: "Download",
          icon:  <DownloadIcon />,
          action: () => downloadFile(filename),
        },
        ...(selected.size > 1 ? [
          {
            label: `Download ${selected.size} selected`,
            icon:  <DownloadIcon />,
            action: downloadSelected,
          },
        ] : []),
        {
          label: "Move to…",
          icon:  <MoveIcon />,
          action: () => setMoveTarget({ filename, isFolder: false }),
        },
        "divider",
        {
          label: "Delete",
          icon:  <TrashIcon />,
          danger: true,
          action: async () => {
            if (!confirm(`Delete "${filename}"?`)) return;
            await deleteFile(filename);
            loadMedia(currentPath);
          },
        },
        ...(totalSelected > 1 ? [
          {
            label: `Delete ${totalSelected} selected`,
            icon:  <TrashIcon />,
            danger: true,
            action: deleteSelected,
          },
        ] : []),
      ],
    });
  }

  function openFolderContextMenu(x, y, folderName) {
    const isSelected = selectedFolders.has(folderName);
    setCtxMenu({
      x, y,
      items: [
        {
          label: "Open Folder",
          icon:  <FolderOpenIcon />,
          action: () => navigate(currentPath ? `${currentPath}/${folderName}` : folderName),
        },
        {
          label: isSelected ? "Deselect" : "Select",
          icon:  <CheckIcon />,
          action: () => toggleSelectFolder(folderName),
        },
        "divider",
        {
          label: "Move to…",
          icon:  <MoveIcon />,
          action: () => setMoveTarget({ filename: folderName, isFolder: true }),
        },
        "divider",
        {
          label: "Delete Folder",
          icon:  <TrashIcon />,
          danger: true,
          action: async () => {
            if (!confirm(`Delete folder "${folderName}" and all its contents?`)) return;
            await deleteFolderByName(folderName);
            loadMedia(currentPath);
          },
        },
      ],
    });
  }

  function handleWheel(e) {
  if (isVideo) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.15 : 0.15;
  setZoom((z) => Math.min(Math.max(z + delta, 1), 5));
  if (zoom + delta <= 1) setPanOffset({ x: 0, y: 0 });
}

function handleDoubleClick() {
  if (isVideo) return;
  if (zoom > 1) {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  } else {
    setZoom(2.5);
  }
}

function handleMouseDown(e) {
  if (zoom <= 1) return;
  dragState.current = {
    dragging: true,
    startX: e.clientX, startY: e.clientY,
    startOffset: { ...panOffset },
  };
}
function handleMouseMove(e) {
  if (!dragState.current.dragging) return;
  const dx = e.clientX - dragState.current.startX;
  const dy = e.clientY - dragState.current.startY;
  setPanOffset({
    x: dragState.current.startOffset.x + dx,
    y: dragState.current.startOffset.y + dy,
  });
}
function handleMouseUp() {
  dragState.current.dragging = false;
}

// Touch pinch-to-zoom
const pinchState = useRef({ active: false, startDist: 0, startZoom: 1 });

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function handleTouchStart(e) {
  if (e.touches.length === 2) {
    pinchState.current = {
      active: true,
      startDist: getTouchDist(e.touches),
      startZoom: zoom,
    };
  } else if (e.touches.length === 1 && zoom > 1) {
    dragState.current = {
      dragging: true,
      startX: e.touches[0].clientX, startY: e.touches[0].clientY,
      startOffset: { ...panOffset },
    };
  }
}
function handleTouchMove(e) {
  if (pinchState.current.active && e.touches.length === 2) {
    const dist = getTouchDist(e.touches);
    const ratio = dist / pinchState.current.startDist;
    const next = Math.min(Math.max(pinchState.current.startZoom * ratio, 1), 5);
    setZoom(next);
    if (next <= 1) setPanOffset({ x: 0, y: 0 });
  } else if (dragState.current.dragging && e.touches.length === 1) {
    const dx = e.touches[0].clientX - dragState.current.startX;
    const dy = e.touches[0].clientY - dragState.current.startY;
    setPanOffset({
      x: dragState.current.startOffset.x + dx,
      y: dragState.current.startOffset.y + dy,
    });
  }
}
function handleTouchEnd() {
  pinchState.current.active = false;
  dragState.current.dragging = false;
}

  const breadcrumb = buildBreadcrumb(currentPath);

  return (
    <BaseLayout>
      <style>{`
        .rw-wrap-override,
        .rw-wrap-override * { overflow: visible !important; }
        /* restore overflow on elements that actually need it */
        .rw-wrap-override .rw-grid,
        .rw-wrap-override .fp-list { overflow: hidden !important; }
        .rw-wrap-override .fp-list { overflow-y: auto !important; }
        @media (max-width: 767px) {
          /* Keep folder picker from bleeding off left edge on mobile */
          .fp-dropdown { right: 0 !important; left: auto !important; }
        }
        .back-btn:hover {
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.08) 100%) !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.18) inset !important;
        }
        @keyframes ctxFadeIn {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @media (min-width: 768px) {
          .sidebar-desktop   { display: flex !important; }
          .bottom-nav-mobile { display: none !important; }
          .main-content      { margin-left: 268px !important; }
          .mv-topbar-mobile  { display: none !important; }
        }
        @media (max-width: 767px) {
          .main-content { margin-left: 0 !important; padding-bottom: 88px !important; padding-top: 52px !important; }
          .desktop-toolbar { display: none !important; }
        }
        @media (min-width: 768px) {
          .desktop-toolbar { display: flex !important; }
        }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .folder-card:hover  { transform: translateY(-2px); box-shadow: 0 8px 24px var(--glass-shadow); }
        .media-card:hover   { transform: scale(1.02); }
        .sidebar-nav-btn:hover { background: rgba(128,128,128,0.1); color: var(--text-1) !important; }
        [data-theme="light"] .glass-input { background: rgba(255,255,255,0.55); }
        /* Right-click hint — desktop only */
        .rc-hint {
          position: absolute;
          bottom: 5px; right: 6px;
          font-size: 0.58rem;
          color: var(--text-3);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
          font-weight: 500;
        }
        .folder-card:hover .rc-hint,
        .media-card:hover  .rc-hint { opacity: 1; }
        @media (max-width: 767px) { .rc-hint { display: none; } }
        /* select <option> dark mode fix */
        select option { background: #1a2235; color: #eee; }
        [data-theme="light"] select option { background: #fff; color: #111; }
        @keyframes lbProgress {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes rwSpin { to { transform: rotate(360deg); } }
        .rw-thumb:hover { transform: scale(1.04); box-shadow: 0 4px 16px var(--glass-shadow); }
        .rw-thumb:hover img { transform: scale(1.06); }
        @media (max-width: 767px) {
          .rw-grid { grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)) !important; gap: 5px !important; padding: 8px !important; }
        }
        @media (max-width: 767px) {
          .paginationBar-bottom { margin-bottom: 100px !important; }
        }
      `}</style>

      {/* ── Sidebar (desktop) ───────────────────────────── */}
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

      {/* ── Mobile sidebar overlay ──────────────────────── */}
      {sidebarOpen && (
        <div className="sidebar-mobile">
        <Sidebar
          user={user} isAdmin={isAdmin}
          folderTree={folderTree} currentPath={currentPath}
          onNavigate={navigate} isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onUpload={() => fileInputRef.current?.click()}
          onCreateFolder={() => setShowCreateFolder(true)}
          onManageUsers={() => setShowUserManager(true)}
          onActivityLog={() => setShowActivityLog(true)}
          onBgContextMenu={(x, y) => setBgCtxMenu({ x, y })}  
        />
        </div>
      )}

      {/* ── Main content ────────────────────────────────── */}
      <div
        className="main-content"
        style={gs.mainContent}
        onContextMenu={(e) => {
          // Only fire if the click landed directly on the background, not on a card
          if (e.target === e.currentTarget || e.currentTarget.contains(e.target)) {
            e.preventDefault();
            setBgCtxMenu({ x: e.clientX, y: e.clientY });
          }
        }}
      >

        {/* Mobile capsule topbar (component handles its own show/hide) */}
        <TopBar
          breadcrumb={breadcrumb}
          onMenuClick={() => setSidebarOpen(true)}
          isAdmin={isAdmin}
          onManageUsers={() => setShowUserManager(true)}
        />

        {/* Hidden file input */}
        <input
          ref={fileInputRef} type="file" multiple
          accept=".jpg,.jpeg,.png,.gif,.mp4,.webm,.mkv"
          style={{ display: "none" }}
          onChange={handleUpload}
        />

        {/* ── Selection action bar ──────────────────────── */}
        {totalSelected > 0 && (
          <div style={gs.selectionBar}>
            <button style={gs.selCancel} onClick={clearSelection}>
              <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Cancel
            </button>

            <span style={{ fontSize: "0.84rem", color: "var(--text-2)", fontWeight: 500 }}>
              {totalSelected} selected
            </span>

            {/* Download selected (files only) */}
            {selected.size > 0 && (
              <button style={gs.selAction} onClick={downloadSelected} title="Download selected">
                <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                  <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 15v1a1 1 0 001 1h12a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Download
              </button>
            )}

            {/* Move selected — only if single item */}
            {totalSelected > 0 && (
                <button
                  style={gs.selAction}
                  onClick={() => setMoveTarget({ filenames: [...selected, ...selectedFolders] })}
                >
                <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                  <path d="M4 10h12M12 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Move
              </button>
            )}

            <button style={gs.selDelete} onClick={deleteSelected}>
              <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                <path d="M5 6h10M8 6V4h4v2M7 9v6M10 9v6M13 9v6M6 6l.75 10h6.5L14 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Delete
            </button>
          </div>
        )}
        {currentPath && (
          <div className="back-bar" style={{
            position: "sticky", top: "52px", zIndex: 40,
            display: "flex", alignItems: "center", gap: 10,
            padding: "6px 0",
          }}>
            <button style={gs.backBtn} className="back-btn" onClick={goUp}>
              <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                <path d="M13 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
            {/* <span style={gs.pathLabel}>/{currentPath}</span> */}
          </div>
        )}

        {/* ── Random Photos Widget — home screen only, non-admin ── */}
        {currentPath === "" && !isAdmin && (
          <RandomPhotosWidget
            photos={randomPhotos}
            count={randomCount}
            onCountChange={(n) => { setRandomCount(n); loadRandomPhotos(n, randomFolders); }}
            onRefresh={() => loadRandomPhotos(randomCount, randomFolders)}
            loading={randomLoading}
            onPhotoClick={(i) => setRandomLightbox(i)}
            folderTree={folderTree}
            selectedFolders={randomFolders}
            onFoldersChange={(f) => { setRandomFolders(f); loadRandomPhotos(randomCount, f); }}
            showFolderPicker={showFolderPicker}
            setShowFolderPicker={setShowFolderPicker}
          />
        )}

        {/* ── Pagination (top) ─────────────────────────────── */}
        {totalPages > 1 && (
          <div style={gs.paginationBar}>
            <span style={gs.fileCount}>{files.length} file{files.length !== 1 ? "s" : ""}</span>
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
          </div>
        )}

        {/* ── Media grid ───────────────────────────────── */}
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
              <button style={gs.emptyUploadBtn} onClick={() => fileInputRef.current?.click()}>
                Upload Files
              </button>
            </div>
          )}

          {/* Folders */}
          {!loading && folders.map((folder) => (
            <div key={folder} style={{ position: "relative" }} className="folder-card-wrap">
              <FolderCard
                name={folder}
                selected={selectedFolders.has(folder)}
                onClick={() => {
                  // If in selection mode, toggle instead of navigate
                  if (totalSelected > 0) { toggleSelectFolder(folder); return; }
                  navigate(currentPath ? `${currentPath}/${folder}` : folder);
                }}
                onContextMenu={(x, y) => openFolderContextMenu(x, y, folder)}
              />
              <span className="rc-hint">right-click</span>
            </div>
          ))}

          {/* Files */}
          {!loading && pageFiles.map((file) => {
            const globalIdx = lightboxUrls.indexOf(
              `/media/${currentPath ? currentPath + "/" : ""}${file}`
            );
            const isVideo = /\.(mp4|webm|mkv)$/i.test(file);
            const src     = `/media/${currentPath ? currentPath + "/" : ""}${file}`;
            return (
              <div key={file} style={{ position: "relative" }} className="media-card-wrap">
                <MediaCard
                  src={src} filename={file} isVideo={isVideo}
                  selected={selected.has(file)}
                  onLightbox={() => {
                    if (totalSelected > 0) { toggleSelectFile(file); return; }
                    setLightboxIndex(globalIdx);   // ← correct full-list index
                  }}
                  onContextMenu={(x, y) => openFileContextMenu(x, y, file, globalIdx)}
                />
                <span className="rc-hint">right-click</span>
              </div>
            );
          })}
        </main>

        {/* Pagination (bottom) */}
        {totalPages > 1 && (
          <div style={gs.paginationBar} className="paginationBar-bottom">
            <span style={gs.fileCount}>{files.length} file{files.length !== 1 ? "s" : ""}</span>
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
          </div>
        )}

      {/* ── Mobile bottom Sidebar nav ───────────────────── */}
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

      {/* ── Lightbox ─────────────────────────────────────── */}
      {lightboxIndex !== null && (
        <Lightbox
          files={lightboxUrls}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => (i - 1 + lightboxUrls.length) % lightboxUrls.length)}
          onNext={() => setLightboxIndex((i) => (i + 1) % lightboxUrls.length)}
          slideshowInterval={slideshowInterval}
          setSlideshowInterval={setSlideshowInterval}
        />
      )}

      {/* ── Random photos lightbox ───────────────────── */}
      {randomLightbox !== null && (
        <Lightbox
          files={randomPhotos}
          index={randomLightbox}
          onClose={() => setRandomLightbox(null)}
          onPrev={() => setRandomLightbox((i) => (i - 1 + randomPhotos.length) % randomPhotos.length)}
          onNext={() => setRandomLightbox((i) => (i + 1) % randomPhotos.length)}
          slideshowInterval={slideshowInterval}
          setSlideshowInterval={setSlideshowInterval}
        />
      )}

      {/* ── Context menu ─────────────────────────────────── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ── Move modal ───────────────────────────────────── */}
      {moveTarget && (
        <MoveModal
          filenames={moveTarget.filenames}
          currentPath={currentPath}
          folderTree={folderTree}
          onClose={() => setMoveTarget(null)}
          onMoved={() => {
            loadMedia(currentPath);
            fetch("/api/tree").then((r) => r.json()).then((d) => setFolderTree(d.tree || []));
          }}
        />
      )}

      {/* ── Other modals ─────────────────────────────────── */}
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
      {showActivityLog  && <ActivityLogModal onClose={() => setShowActivityLog(false)} />}
      {bgCtxMenu && (
        <ContextMenu
          x={bgCtxMenu.x}
          y={bgCtxMenu.y}
          onClose={() => setBgCtxMenu(null)}
          items={[
            {
              label: "Upload Photo",
              icon: (
                <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                  <path d="M10 13V3M6 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 15v1a1 1 0 001 1h12a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ),
              action: () => fileInputRef.current?.click(),
            },
            {
              label: "New Folder",
              icon: (
                <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
                  <path d="M2 6a2 2 0 012-2h3.586a1 1 0 01.707.293L9.414 5.5H16a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M10 9v4M8 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              ),
              action: () => setShowCreateFolder(true),
            },
          ]}
        />
      )}
      </div>
    </BaseLayout>
  );
}

/* ── Inline icon components ─────────────────────────────── */
const EyeIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
    <path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const CheckAllIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
    <path d="M2 10l4 4 8-8M6 14l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const DownloadIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
    <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 15v1a1 1 0 001 1h12a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const MoveIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
    <path d="M4 10h12M12 6l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
    <path d="M5 6h10M8 6V4h4v2M7 9v6M10 9v6M13 9v6M6 6l.75 10h6.5L14 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const FolderOpenIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="14" height="14">
    <path d="M2 6a2 2 0 012-2h3.586a1 1 0 01.707.293L9.414 5.5H16a2 2 0 012 2v1H2V6z" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M2 8.5h16l-1.5 7H3.5L2 8.5z" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);

/* ── Gallery Styles ─────────────────────────────────────── */
const gs = {
  mainContent: {
    marginLeft: 268,
    padding: "16px 16px 32px",   // was "0 12px 32px"
    minHeight: "100dvh",
    transition: "margin-left 0.3s",
  },
  desktopToolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 0 4px",
  },
  selectionBar: {
    display: "flex", alignItems: "center", gap: 8,
    margin: "10px 0 0",
    padding: "8px 14px",
    background: "var(--glass-bg)",
    backdropFilter: "blur(var(--glass-blur))",
    border: "1px solid var(--glass-border)",
    borderRadius: 14,
    flexWrap: "wrap",
  },
  selCancel: {
    display: "flex", alignItems: "center", gap: 6,
    background: "transparent", border: "none",
    color: "var(--text-2)", cursor: "pointer",
    fontSize: "0.84rem", fontFamily: "inherit",
  },
  selAction: {
    display: "flex", alignItems: "center", gap: 6,
    background: "var(--accent-bg)", border: "1px solid var(--accent-border)",
    borderRadius: 9, padding: "6px 12px",
    color: "var(--accent)", cursor: "pointer",
    fontSize: "0.82rem", fontFamily: "inherit", fontWeight: 600,
  },
  selDelete: {
    display: "flex", alignItems: "center", gap: 6,
    marginLeft: "auto",
    background: "rgba(255,107,107,0.1)",
    border: "1px solid rgba(255,107,107,0.3)",
    borderRadius: 9, padding: "6px 12px",
    color: "var(--error)", cursor: "pointer",
    fontSize: "0.82rem", fontFamily: "inherit", fontWeight: 600,
  },
  pathNav: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 0 0",
  },
  topBar: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 0",
    position: "sticky", top: 0,
    zIndex: 40,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  },
  backBtn: {
    display: "flex", alignItems: "center", gap: 6,
    background: "linear-gradient(135deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.05) 100%)",
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 999,
    padding: "7px 16px",
    color: "var(--text-1)", cursor: "pointer",
    fontSize: "0.84rem", fontFamily: "inherit", fontWeight: 600,
    boxShadow: "0 2px 12px rgba(0,0,0,0.18), 0 1px 0 rgba(255,255,255,0.12) inset",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    transition: "box-shadow 0.18s, background 0.18s",
    whiteSpace: "nowrap",
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
    borderRadius: 10, padding: "7px 14px",
    color: "var(--accent)", cursor: "pointer", fontFamily: "inherit",
    fontSize: "0.84rem", fontWeight: 600,
    transition: "background 0.18s",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: 10,
    padding: "10px 0",
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
    borderRadius: 12, justifyContent: "center", aspectRatio: "1",
    cursor: "pointer",
    transition: "transform 0.18s, box-shadow 0.18s",
    display: "flex", flexDirection: "column",
    WebkitUserSelect: "none", userSelect: "none",
  },
  folderCardSelected: {
    border: "1.5px solid var(--accent)",
    background: "var(--accent-bg)",
    boxShadow: "0 0 0 2px var(--accent-glow)",
  },
  folderCardInner: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
  },
  folderName: {
    fontSize: "0.78rem", fontWeight: 500, color: "var(--text-2)",
    textAlign: "center", overflow: "hidden", whiteSpace: "nowrap",
    textOverflow: "ellipsis", width: "100%",
  },
  folderCheckmark: {
    position: "absolute", top: 6, left: 6,
  },
  mediaCard: {
    aspectRatio: "1",
    background: "rgba(128,128,128,0.08)",
    border: "1px solid var(--glass-border)",
    borderRadius: 12, overflow: "hidden",
    position: "relative", cursor: "pointer",
    transition: "transform 0.18s, box-shadow 0.18s",
    WebkitUserSelect: "none", userSelect: "none",
  },
  mediaCardSelected: {
    border: "2px solid var(--accent)",
    boxShadow: "0 0 0 2px var(--accent-glow)",
  },
  mediaImg: {
    width: "100%", height: "100%", objectFit: "cover", display: "block",
  },
  videoThumb: {
    width: "100%", height: "100%",
    background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  selIndicator: {
    position: "absolute", top: 6, left: 6,
    filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))",
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
  paginationBar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 12, padding: "10px 4px",
    flexWrap: "wrap",
  },
  fileCount: {
    fontSize: "0.78rem", color: "var(--text-3)", fontWeight: 500,
    whiteSpace: "nowrap",
  },
  
};
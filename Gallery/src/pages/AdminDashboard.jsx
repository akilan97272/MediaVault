// pages/AdminDashboard.jsx
import { useState, useEffect, useCallback } from "react";
import BaseLayout from "../components/BaseLayout";
import { useTheme } from "../context/ThemeContext";

const HINT_KEY = "mv-theme-hint-seen";

function fmtSize(b) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
  return (b / 1073741824).toFixed(2) + " GB";
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

/* ── Mobile Capsule TopBar ─────────────────────────────── */
function AdminTopBar() {
  const { toggleTheme } = useTheme();
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(HINT_KEY)) {
      const t = setTimeout(() => setShowHint(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  function handleClick() {
    toggleTheme();
    localStorage.setItem(HINT_KEY, "1");
    setShowHint(false);
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
          top: calc(100% + 6px); left: 50%;
          transform: translateX(-50%);
          background: var(--glass-bg);
          backdrop-filter: blur(14px);
          border: 1px solid var(--glass-border);
          border-radius: 10px;
          padding: 7px 14px;
          font-size: 0.74rem;
          color: var(--text-2);
          white-space: nowrap;
          box-shadow: 0 8px 24px var(--glass-shadow);
          pointer-events: none;
          z-index: 10;
          animation: admHintIn 0.3s ease;
        }
        @keyframes admHintIn {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      <div className="adm-topbar-mobile">
        <button className="adm-capsule" onClick={handleClick} aria-label="Toggle theme">
          <span className="adm-capsule-name">MediaVault · Admin</span>
        </button>
        {showHint && <div className="adm-hint-bubble">✦ Tap to switch light / dark</div>}
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

  return (
    <BaseLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinning { animation: spin 0.6s linear infinite; }
        .file-thumb:hover { transform: scale(1.03); }

        /* ── Responsive overrides ── */
        @media (max-width: 767px) {
          .adm-wrap      { padding: 60px 12px 40px !important; }
          .adm-header    { display: none !important; }
          .adm-stat-row  { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          .adm-mid-grid  { grid-template-columns: 1fr !important; }
          .adm-stat-val  { font-size: 1.35rem !important; }
          .adm-stat-icon { width: 36px !important; height: 36px !important; }
          .adm-files-grid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)) !important; }
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
          <a href="/gallery" style={s.backBtn}>
            <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
              <path d="M13 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Gallery
          </a>
          <h1 style={s.title}>Admin Dashboard</h1>
          <div style={s.headerRight}>
            <button style={s.iconBtn} onClick={toggleTheme} title="Toggle theme">
              <svg className="icon-sun" viewBox="0 0 24 24" fill="none" width="16" height="16">
                <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <svg className="icon-moon" viewBox="0 0 24 24" fill="none" width="16" height="16">
                <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            {/* <button className={spinning ? "spinning" : ""} style={s.iconBtn} onClick={loadDashboard} title="Refresh">
              ↻
            </button> */}
          </div>
        </div>

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

        {/* ── Recent Uploads ── */}
        <div className="glass-card" style={s.filesPanel}>
          <div style={s.panelHead}>
            <span style={s.panelTitle}>Recent Uploads</span>
            <span style={s.panelBadge}>{data?.recent_files?.length ?? "—"} recent</span>
          </div>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 16px", color: "var(--text-3)", fontSize: "0.86rem" }}>
              <div className="loading-spinner" />Loading…
            </div>
          )}
          {!loading && !data?.recent_files?.length && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-3)", fontSize: "0.86rem" }}>
              No files uploaded yet
            </div>
          )}
          {!loading && data?.recent_files?.length > 0 && (
            <div style={s.filesGrid} className="adm-files-grid">
              {data.recent_files.map((p, i) => {
                const isVideo = /\.(mp4|webm|mkv)$/i.test(p);
                const url = `/media/${p}`;
                const owner = p.split("/")[0];
                return (
                  <div key={i} className="file-thumb" style={s.fileThumb} onClick={() => window.open(url)}>
                    {isVideo ? (
                      <div style={s.vidOverlay}>
                        <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                          <polygon points="6,4 20,12 6,20" fill="white" />
                        </svg>
                      </div>
                    ) : (
                      <img src={url} loading="lazy" decoding="async" alt="" style={s.fileImg} />
                    )}
                    <div style={s.fileOwner}>{owner}</div>
                  </div>
                );
              })}
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
    height: "100%", borderRadius: 3,
    background: "linear-gradient(90deg, var(--accent), rgba(160,80,255,0.8))",
    transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
  },
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
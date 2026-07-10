// pages/NotFound.jsx
import BaseLayout from "../components/BaseLayout";

export default function NotFound() {
  return (
    <BaseLayout>
      <div style={s.wrap}>
        <div className="glass-card" style={s.card}>
          <div style={s.lock}>
            <svg viewBox="0 0 24 24" fill="none" width="26" height="26">
              <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 11V7a4 4 0 118 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="12" cy="16" r="1.2" fill="currentColor" />
            </svg>
          </div>

          <div style={s.code}>404</div>
          <p style={s.title}>Page not found</p>
          <div style={s.divider} />
          <p style={s.desc}>
            This page doesn't exist or your session has expired. Please sign in to access your gallery.
          </p>

          <a href="/" style={s.btn}>
            <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
              <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Go to Sign In
          </a>
        </div>
      </div>
    </BaseLayout>
  );
}

const s = {
  wrap: {
    display: "flex", alignItems: "center", justifyContent: "center",
    minHeight: "100dvh", padding: 24, textAlign: "center",
  },
  card: {
    maxWidth: 420, width: "100%",
    borderRadius: 28, padding: "48px 40px 40px",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
  },
  lock: {
    width: 56, height: 56,
    background: "var(--glass-bg)",
    border: "1px solid var(--glass-border)",
    borderRadius: 16,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 1px 0 var(--glass-shine) inset",
    color: "var(--text-3)",
    marginBottom: 8,
  },
  code: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: "clamp(5rem, 20vw, 7rem)",
    fontWeight: 800,
    lineHeight: 1,
    color: "var(--accent)",
    WebkitTextStroke: "2px var(--glass-border)",
    letterSpacing: -2,
    marginBottom: 4,
  },
  title: { fontSize: "1.25rem", fontWeight: 600, color: "var(--text-1)", marginBottom: 4 },
  divider: { width: 40, height: 1, background: "var(--glass-border)", margin: "8px 0" },
  desc: { fontSize: "0.92rem", color: "var(--text-2)", lineHeight: 1.6, maxWidth: 300 },
  btn: {
    display: "inline-flex", alignItems: "center", gap: 8,
    marginTop: 12, padding: "12px 24px",
    background: "var(--accent-bg)",
    border: "1px solid var(--accent-border)",
    borderRadius: 999,
    color: "var(--accent)",
    fontSize: "0.9rem", fontWeight: 600,
    textDecoration: "none",
    transition: "background 0.2s, transform 0.15s",
  },
};

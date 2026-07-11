import { useState } from "react";
import BaseLayout from "../components/BaseLayout";
import { useTheme } from "../context/ThemeContext";

const SunIcon = () => (
  <svg className="icon-sun" viewBox="0 0 24 24" fill="none" width="18" height="18">
    <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const MoonIcon = () => (
  <svg className="icon-moon" viewBox="0 0 24 24" fill="none" width="18" height="18">
    <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const RefreshIcon = () => (
  <svg className="icon-refresh" viewBox="0 0 24 24" fill="none" width="18" height="18">
    <path d="M4 4v6h6M20 20v-6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 14a8 8 0 0014.5 3M19 10A8 8 0 004.5 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

function getLoginError() {
  const p = new URLSearchParams(window.location.search);
  return { code: p.get("error"), day: p.get("day") };
}

export default function Login() {
  const { toggleTheme } = useTheme();
  const [tab, setTab] = useState(
    new URLSearchParams(window.location.search).get("register") ? "register" : "signin"
  );

  // Register state
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const { code: errCode, day: errDay } = getLoginError();

  async function handleRegister() {
    setRegError(""); setRegSuccess("");
    if (!regUsername || !regPassword) return setRegError("All fields required");
    if (regPassword !== regConfirm) return setRegError("Passwords do not match");

    setRegLoading(true);
    const fd = new FormData();
    fd.append("username", regUsername);
    fd.append("password", regPassword);

    try {
      const res = await fetch("/api/register", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setRegSuccess(`Account "${regUsername}" created! Redirecting to sign in…`);
        setRegUsername(""); setRegPassword(""); setRegConfirm("");
        setTimeout(() => { setTab("signin"); setRegSuccess(""); }, 2200);
      } else {
        setRegError(data.error || "Registration failed");
      }
    } catch {
      setRegError("Network error");
    } finally {
      setRegLoading(false);
    }
  }

  return (
    <BaseLayout>
      {/* Theme toggle */}
      <button style={s.themeToggle} onClick={toggleTheme} title="Toggle theme">
        <SunIcon /><MoonIcon /><RefreshIcon />
      </button>

      <div style={s.wrap}>
        <div className="glass-card" style={s.card}>
          {/* Brand */}
          <div style={s.brand}>
            <div style={s.brandIcon}>
              <svg viewBox="0 0 40 40" fill="none" width="40" height="40">
                <circle cx="20" cy="20" r="18" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
                <path d="M12 26L20 14L28 26" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="20" cy="20" r="3" fill="rgba(255,255,255,0.8)" />
              </svg>
            </div>
            <h1 style={s.brandName}>MediaVault</h1>
            <p style={s.brandSub}>Your private gallery</p>
          </div>

          {/* Tabs */}
          <div style={s.tabs}>
            <button
              style={{ ...s.tab, ...(tab === "signin" ? s.tabActive : {}) }}
              onClick={() => setTab("signin")}
            >Sign In</button>
            <button
              style={{ ...s.tab, ...(tab === "register" ? s.tabActive : {}) }}
              onClick={() => setTab("register")}
            >Create Account</button>
          </div>

          {/* Sign In Panel */}
          {tab === "signin" && (
            <div style={s.panel}>
              {errCode === "cred" && (
                <div className="error-pill">⚠ Invalid username or password</div>
              )}
              {errCode === "day" && (
                <div className="error-pill" style={{ background: "rgba(255,165,0,0.1)", borderColor: "rgba(255,165,0,0.35)", color: "#ffa500" }}>
                  <svg viewBox="0 0 20 20" fill="none" width="15" height="15" style={{ flexShrink: 0 }}>
                    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Access restricted — not available on <strong style={{ marginLeft: 4 }}>{errDay || "today"}s</strong>
                </div>
              )}
              <form action="/login" method="post" style={s.form}>
                <div style={s.inputGroup}>
                  <label style={s.label}>Username</label>
                  <input type="text" name="username" className="glass-input" placeholder="Enter username" autoComplete="username" required />
                </div>
                <div style={s.inputGroup}>
                  <label style={s.label}>Password</label>
                  <input type="password" name="password" className="glass-input" placeholder="Enter password" autoComplete="current-password" required />
                </div>
                <button type="submit" className="glass-btn-primary">
                  <span>Unlock Gallery</span>
                  <svg viewBox="0 0 20 20" fill="none" width="17" height="17">
                    <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>
            </div>
          )}

          {/* Register Panel */}
          {tab === "register" && (
            <div style={s.panel}>
              {regError && <div className="error-pill">⚠ {regError}</div>}
              {regSuccess && <div className="success-pill">✓ {regSuccess}</div>}
              <div style={s.form}>
                <div style={s.inputGroup}>
                  <label style={s.label}>
                    Username <span style={s.labelHint}>3–30 chars, letters/numbers/_-</span>
                  </label>
                  <input
                    type="text" className="glass-input" placeholder="Choose a username"
                    autoComplete="off" value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                  />
                </div>
                <div style={s.inputGroup}>
                  <label style={s.label}>
                    Password <span style={s.labelHint}>Minimum 4 characters</span>
                  </label>
                  <input
                    type="password" className="glass-input" placeholder="Choose a password"
                    value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
                  />
                </div>
                <div style={s.inputGroup}>
                  <label style={s.label}>Confirm Password</label>
                  <input
                    type="password" className="glass-input" placeholder="Repeat password"
                    value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)}
                  />
                </div>
                <button
                  className="glass-btn-primary"
                  onClick={handleRegister}
                  disabled={regLoading}
                  style={{ opacity: regLoading ? 0.7 : 1 }}
                >
                  <span>{regLoading ? "Creating…" : "Create Account"}</span>
                  <svg viewBox="0 0 20 20" fill="none" width="17" height="17">
                    <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </BaseLayout>
  );
}

const s = {
  themeToggle: {
    position: "fixed", top: 16, right: 16, zIndex: 300,
    width: 40, height: 40,
    background: "var(--glass-bg)",
    backdropFilter: "blur(12px)",
    border: "1px solid var(--glass-border)",
    borderRadius: "50%",
    color: "var(--text-1)", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.2s, transform 0.2s",
  },
  wrap: {
    display: "flex", alignItems: "center", justifyContent: "center",
    minHeight: "100dvh", padding: 24,
  },
  card: {
    width: "100%", maxWidth: 420,
    borderRadius: 28, padding: "40px 36px 36px",
    display: "flex", flexDirection: "column", gap: 20,
  },
  brand: {
    display: "flex", flexDirection: "column",
    alignItems: "center", gap: 8, textAlign: "center",
  },
  brandIcon: {
    width: 64, height: 64,
    background: "var(--accent)",
    border: "2px solid var(--glass-border)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  brandName: {
    fontFamily: "'Instrument Serif', Georgia, serif",
    fontStyle: "italic", fontSize: "1.75rem", fontWeight: 400,
    color: "var(--text-1)", letterSpacing: "-0.5px",
  },
  brandSub: { fontSize: "0.84rem", color: "var(--text-3)" },
  tabs: {
    display: "flex", gap: 4,
    background: "rgba(128,128,128,0.1)",
    borderRadius: 12, padding: 3,
  },
  tab: {
    flex: 1, padding: "8px 0",
    background: "transparent", border: "none",
    borderRadius: 9, cursor: "pointer",
    fontSize: "0.875rem", fontWeight: 500,
    fontFamily: "inherit", color: "var(--text-3)",
    transition: "background 0.2s, color 0.2s",
  },
  tabActive: {
    background: "var(--glass-bg)",
    color: "var(--text-1)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
  },
  panel: { display: "flex", flexDirection: "column", gap: 14 },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  inputGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: "0.82rem", fontWeight: 500, color: "var(--text-2)" },
  labelHint: { fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 400, marginLeft: 4 },
};

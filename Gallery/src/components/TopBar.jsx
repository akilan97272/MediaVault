import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";

const HINT_KEY = "mv-theme-hint-seen";

export default function TopBar() {
  const { toggleTheme } = useTheme();
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(HINT_KEY)) {
      const t = setTimeout(() => setShowHint(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  function handleCapsuleClick() {
    toggleTheme();
    localStorage.setItem(HINT_KEY, "1");
    setShowHint(false);
  }

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .mv-topbar-mobile {
            display: flex;
            justify-content: center;
            align-items: center;
            position: fixed;
            top: 12px;
            left: 0;
            right: 0;
            padding: 0 16px;
            z-index: 220;
            background: transparent;
            border: none;
            box-shadow: none;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            pointer-events: none;
          }
        }
        .mv-capsule {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 22px;
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur)) saturate(180%);
          -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
          border: 1px solid var(--glass-border);
          border-radius: 999px;
          box-shadow: 0 1px 0 var(--glass-shine) inset, 0 8px 24px var(--glass-shadow);
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          transition: transform 0.15s, opacity 0.15s;
          pointer-events: auto;
        }
                  .mv-capsule:active {
            transform: scale(0.95);
            opacity: 0.85;
          }
        .mv-capsule:active { opacity: 0.7; }
        .mv-capsule-name {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          font-size: 1.05rem;
          font-weight: 400;
          color: var(--text-1);
          line-height: 1;
          letter-spacing: -0.2px;
        }
        .mv-hint-bubble {
          position: absolute;
          top: calc(100% + 6px);
          left: 50%;
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
          animation: hintFadeIn 0.3s ease;
        }
        @keyframes hintFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div className="mv-topbar-mobile" >
        <button className="mv-capsule" onClick={handleCapsuleClick} aria-label="Toggle theme">
          <span className="mv-capsule-name">MediaVault</span>
        </button>
        {showHint && (
          <div className="mv-hint-bubble">✦ Tap to switch light / dark</div>
        )}
      </div>
    </>
  );
}
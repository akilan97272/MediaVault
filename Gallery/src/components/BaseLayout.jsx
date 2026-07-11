export default function BaseLayout({ children }) {
  return (
    <div style={{ position: "relative", minHeight: "100dvh" }}>
      {/* Ambient background orbs */}
      <div className="bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Page content sits above orbs */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

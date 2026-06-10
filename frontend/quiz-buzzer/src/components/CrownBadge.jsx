export default function CrownBadge({ label = "Winner", tone = "gold", compact = false, className = "" }) {
  const classes = ["crown-badge", tone, compact ? "compact" : "", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div className="crown-icon" aria-hidden="true">
        <span className="crown-point left" />
        <span className="crown-point center" />
        <span className="crown-point right" />
        <span className="crown-base" />
      </div>
      <span>{label}</span>
    </div>
  );
}

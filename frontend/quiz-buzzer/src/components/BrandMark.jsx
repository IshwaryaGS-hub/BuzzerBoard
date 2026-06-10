export default function BrandMark({ variant = "full", compact = false, className = "" }) {
  const classes = ["brand-mark", compact ? "compact" : "", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div className="brand-mark-icon" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="brand-mark-copy">
        <div className="brand-mark-overline">APAR Cable Solutions</div>
        {variant === "udaan" ? (
          <>
            <div className="brand-mark-wordmark">
              <span className="brand-mark-apar">APAR</span>
              <span className="brand-mark-udaan">UDAAN</span>
            </div>
            <div className="brand-mark-tagline">Where Vision Meets Velocity</div>
          </>
        ) : (
          <>
            <div className="brand-mark-wordmark">
              <span className="brand-mark-apar">APAR</span>
            </div>
            <div className="brand-mark-tagline">Live Quiz Championship</div>
          </>
        )}
      </div>
    </div>
  );
}

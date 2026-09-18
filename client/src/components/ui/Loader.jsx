export function Loader({ label = 'Loading', size = 'md', variant = 'inline' }) {
  const variantClass = {
    inline: 'orbit-loader-inline',
    button: 'orbit-loader-button',
    page: 'orbit-loader-page',
    screen: 'orbit-loader-screen',
  }[variant] || 'orbit-loader-inline';

  return (
    <span className={`orbit-loader ${variantClass} orbit-loader-${size}`} role="status" aria-label={label}>
      <span className="orbit-loader-spinner" aria-hidden="true" />
      {variant === 'button' && <span className="orbit-loader-label">{label}</span>}
    </span>
  );
}

export function LoadingSkeleton({ className = "", lines = 3 }) {
  const safeClassName =
    typeof className === "string" ? className.trim() : "";

  return (
    <div
      className={["orbit-skeleton", safeClassName]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="orbit-skeleton-line" />
      ))}
    </div>
  );
}

export default Loader;
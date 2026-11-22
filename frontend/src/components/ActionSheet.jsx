// Options sheet opened from the "..." button: a white card with plain rows (no icons, no cancel row).
// Tapping outside the card closes it.
export default function ActionSheet({ title, actions, onClose }) {
  return (
    <div className="as-backdrop" role="presentation" onClick={onClose}>
      <section className="as-sheet" role="dialog" aria-label={title || 'Options'} onClick={(e) => e.stopPropagation()}>
        {title && <p className="as-title">{title}</p>}
        {actions.map((action) => (
          <button key={action.label} type="button" className={`as-row ${action.danger ? 'danger' : ''}`} onClick={() => { onClose(); action.onClick(); }}>
            <span>{action.label}</span>
          </button>
        ))}
      </section>
    </div>
  );
}

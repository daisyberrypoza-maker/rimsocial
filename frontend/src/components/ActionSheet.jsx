import Icon from './Icon.jsx';

// Bottom sheet with a list of actions, opened from the "..." button.
export default function ActionSheet({ title, actions, onClose }) {
  return (
    <div className="as-backdrop" role="presentation" onClick={onClose}>
      <section className="as-sheet" role="dialog" aria-label={title || 'Options'} onClick={(e) => e.stopPropagation()}>
        <div className="as-handle" aria-hidden="true" />
        {title && <p className="as-title">{title}</p>}
        {actions.map((action) => (
          <button key={action.label} type="button" className={`as-row ${action.danger ? 'danger' : ''}`} onClick={() => { onClose(); action.onClick(); }}>
            {action.icon && <Icon name={action.icon} size={22} />}
            <span>{action.label}</span>
          </button>
        ))}
        <button type="button" className="as-row as-cancel" onClick={onClose}><span>Cancel</span></button>
      </section>
    </div>
  );
}

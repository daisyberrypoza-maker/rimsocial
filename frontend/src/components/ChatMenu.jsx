import { useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import './ChatMenu.css';

// Small popover menu shared by direct chats, group chats and messages.
// `anchor` is the trigger's bounding rect; the menu opens just below it (or above if there is no room).
// `items`: [{ key, label, icon?, danger?, onSelect }]
export default function ChatMenu({ label, anchor, items, onClose }) {
  const panel = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top;
    let left;
    if (anchor) {
      left = Math.min(Math.max(12, anchor.right - width), vw - width - 12);
      top = anchor.bottom + 6;
      if (top + height > vh - 12) top = Math.max(12, anchor.top - height - 6);
    } else {
      left = vw - width - 12;
      top = 64;
    }
    setPos({ top, left });
  }, [anchor, items.length]);

  return (
    <div className="chat-menu-layer" onClick={onClose}>
      <section
        ref={panel}
        className="chat-menu"
        role="menu"
        aria-label={label}
        style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className={item.danger ? 'danger' : undefined}
            onClick={() => { onClose(); item.onSelect(); }}
          >
            {item.icon && <Icon name={item.icon} size={16} />}
            <span>{item.label}</span>
          </button>
        ))}
      </section>
    </div>
  );
}

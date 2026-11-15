import { useEffect, useState } from 'react';

// App-wide confirmation modal. Mounted once in App and opened through confirmDialog().
export default function ConfirmDialog() {
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const onConfirm = (e) => setDialog(e.detail);
    window.addEventListener('cv-confirm', onConfirm);
    return () => window.removeEventListener('cv-confirm', onConfirm);
  }, []);

  if (!dialog) return null;

  function answer(result) {
    dialog.resolve(result);
    setDialog(null);
  }

  return (
    <div className="cv-confirm-backdrop" role="presentation" onClick={() => answer(false)}>
      <div className="cv-confirm" role="alertdialog" aria-modal="true" aria-labelledby="cv-confirm-title" aria-describedby="cv-confirm-msg" onClick={(e) => e.stopPropagation()}>
        <h2 id="cv-confirm-title">{dialog.title}</h2>
        <p id="cv-confirm-msg">{dialog.message}</p>
        <div className="cv-confirm-actions">
          <button type="button" className="cv-confirm-cancel" onClick={() => answer(false)}>{dialog.cancelLabel}</button>
          <button type="button" className={`cv-confirm-ok${dialog.danger ? ' is-danger' : ''}`} onClick={() => answer(true)} autoFocus>{dialog.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

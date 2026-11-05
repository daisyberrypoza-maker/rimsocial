import { useEffect, useState } from 'react';

export default function Toast() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    let timer;
    const onToast = (e) => {
      setMessage(e.detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(''), 2500);
    };
    window.addEventListener('cv-toast', onToast);
    return () => {
      window.removeEventListener('cv-toast', onToast);
      clearTimeout(timer);
    };
  }, []);

  if (!message) return null;
  return <div className="toast">{message}</div>;
}

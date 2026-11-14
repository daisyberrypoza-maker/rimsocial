import { useEffect } from 'react';
import { useAppStore } from '../store.js';
import { startChatStream } from '../lib/chatStream.js';

// Keeps the live chat stream open while signed in; renders nothing
export default function LiveChat() {
  const token = useAppStore((s) => s.token);
  useEffect(() => {
    if (!token) return undefined;
    return startChatStream(() => useAppStore.getState().token);
  }, [token]);
  return null;
}

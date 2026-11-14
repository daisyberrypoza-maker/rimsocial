import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import ChatMenu from '../components/ChatMenu.jsx';
import { useAppStore } from '../store.js';
import { goBack } from '../lib/goBack.js';
import { toast, logError } from '../toast.js';
import { mediaUrl } from '../lib/config.js';
import { MessageRow, MediaViewer, attachmentLabel } from './Conversation.jsx';
import '../snap-screens.css';
import './Conversation.css';

function formatClock(total) {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Photo, video, audio or file in a group message; photos open in the viewer
function GroupMedia({ message, mine, onOpenPhoto, onView }) {
  const src = mediaUrl(message.mediaUrl);
  // A view-limited photo from someone else opens with Tap to view
  if (!mine && message.mediaKind === 'photo' && message.viewLimit > 0) {
    if ((message.viewedByMe || 0) >= message.viewLimit) return <span className="cv-once opened">Opened</span>;
    return <button type="button" className="cv-once" onClick={() => onView(message)}>Tap to view</button>;
  }
  if (message.mediaKind === 'photo') return <button type="button" className="cv-media-link" onClick={() => onOpenPhoto(src)} aria-label="Open photo"><img className="cv-media" src={src} alt="Photo" loading="lazy" /></button>;
  if (message.mediaKind === 'video') return <video className="cv-media" src={src} controls playsInline preload="metadata" />;
  if (message.mediaKind === 'audio') return <audio className="cv-audio" src={src} controls preload="metadata" />;
  return <a className="cv-file" href={src} target="_blank" rel="noopener noreferrer" download={message.mediaName || 'File'}><span className="cv-file-name">{message.mediaName || 'File'}</span></a>;
}

function clock(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function GroupConversationPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const me = useAppStore((state) => state.user);
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [messageMenu, setMessageMenu] = useState(null);
  const [optionsAnchor, setOptionsAnchor] = useState(null);
  const [messageAnchor, setMessageAnchor] = useState(null);
  const endRef = useRef(null);
  const [replyTo, setReplyTo] = useState(null);
  const replyRef = useRef(null);
  // Photo or video picked from the phone, shown with editing tools before it is sent
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [edit, setEdit] = useState({ tool: null, texts: [], emojis: [], viewLimit: 0 });
  const editorRef = useRef(null);
  const [viewer, setViewer] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const holdRef = useRef({ active: false });
  const cancelRecordRef = useRef(false);
  const recordTimerRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api('/v1/messages/groups').then((data) => { const item = (data.items || []).find((row) => String(row.id) === String(groupId)); if (alive) setMuted(Boolean(item?.muted)); }).catch(() => {});
    const load = () => api('/v1/messages/groups/' + groupId)
      .then((data) => {
        if (!alive) return;
        setGroup(data.group);
        setMessages(data.items || []);
        setError('');
      })
      .catch((e) => { if (alive) setError(e.message || 'Could not load group'); });
    load();
    const timer = setInterval(load, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [groupId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  async function toggleMute() {
    const next = !muted;
    setOptionsOpen(false);
    try {
      const data = await api('/v1/messages/groups/' + groupId + '/mute', { method: 'PUT', body: { enabled: next } });
      setMuted(Boolean(data.muted));
      toast(data.muted ? 'Group notifications muted' : 'Group notifications unmuted');
    } catch (e) { toast(e.message || 'Could not update mute setting'); }
  }

  async function deleteGroupForEveryone() {
    setOptionsOpen(false);
    if (!window.confirm('Delete this group and its messages for every member? This cannot be undone.')) return;
    try {
      await api('/v1/messages/groups/' + groupId + '?scope=everyone', { method: 'DELETE' });
      navigate('/chat', { replace: true });
    } catch (e) { toast(e.message || 'Could not delete group'); }
  }

  async function leaveGroup() {
    setOptionsOpen(false);
    if (!window.confirm('Leave this group? You will stop receiving its messages.')) return;
    try {
      await api('/v1/messages/groups/' + groupId, { method: 'DELETE' });
      navigate('/chat', { replace: true });
    } catch (e) { toast(e.message || 'Could not leave group'); }
  }

  // Photo, video or file from the phone, or a voice note, sent to every member
  async function sendMediaFile(file, caption = '', viewLimit = 0) {
    setSending(true);
    setError('');
    try {
      const quoted = replyRef.current;
      const form = new FormData();
      form.append('media', file);
      if (caption) form.append('body', caption);
      if (quoted) form.append('replyToId', quoted.id);
      if (viewLimit) form.append('viewLimit', String(viewLimit));
      const data = await api('/v1/messages/groups/' + groupId + '/media', { method: 'POST', body: form });
      setMessages((current) => [...(current || []), { ...data.message, replyTo: quoteOf(quoted) }]);
      setReply(null);
    } catch (e) {
      logError(e);
      setError(e.message || 'Could not send');
      toast(e.message || 'Could not send');
    } finally {
      setSending(false);
    }
  }

  function pickFile(event) {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    if (/^image\//.test(picked.type) || /^video\//.test(picked.type)) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setEdit({ tool: null, texts: [], emojis: [], viewLimit: 0 });
      setPreviewUrl(URL.createObjectURL(picked));
      setFile(picked);
      return;
    }
    const caption = text.trim();
    setText('');
    sendMediaFile(picked, caption);
  }

  // Opening a view-limited photo counts this member's view, then shows it
  async function viewGroupPhoto(message) {
    try {
      const data = await api('/v1/messages/groups/' + groupId + '/messages/' + message.id + '/view', { method: 'POST', body: {} });
      setMessages((current) => (current || []).map((row) => (row.id === message.id ? { ...row, viewedByMe: data.viewedByMe } : row)));
      setViewer({ src: mediaUrl(message.mediaUrl), kind: 'photo' });
    } catch (e) {
      logError(e);
      toast(e.message || 'Could not open photo');
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setFile(null);
    setEdit({ tool: null, texts: [], emojis: [], viewLimit: 0 });
  }

  // Send the previewed photo with its edits flattened in, or the video as picked
  async function sendPending() {
    if (!file || sending) return;
    let toSend = file;
    if (/^image\//.test(file.type) && editorRef.current) {
      try {
        const blob = await editorRef.current.compose();
        toSend = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      } catch (e) {
        logError(e);
        toast('Photo not ready');
        return;
      }
    }
    const caption = text.trim();
    const viewLimit = /^image\//.test(file.type) ? edit.viewLimit : 0;
    setText('');
    closePreview();
    sendMediaFile(toSend, caption, viewLimit);
  }

  // Hold the mic to record, release to send, slide left to cancel
  async function startVoice() {
    if (recorderRef.current || sending) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('Voice notes are not supported in this browser'); return; }
    const onMove = (ev) => { if (ev.clientX - holdRef.current.startX < -80) cancelRecordRef.current = true; };
    const onRelease = (ev) => {
      holdRef.current.active = false;
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
      window.removeEventListener('pointermove', onMove);
      if (ev.type === 'pointercancel') cancelRecordRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    };
    window.addEventListener('pointerup', onRelease);
    window.addEventListener('pointercancel', onRelease);
    window.addEventListener('pointermove', onMove);
    const cleanup = () => {
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
      window.removeEventListener('pointermove', onMove);
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunksRef.current = [];
      cancelRecordRef.current = false;
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        cleanup();
        stream.getTracks().forEach((track) => track.stop());
        clearInterval(recordTimerRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const cancelled = cancelRecordRef.current;
        chunksRef.current = [];
        recorderRef.current = null;
        setRecording(false);
        if (!cancelled && blob.size > 0) {
          const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
          sendMediaFile(new File([blob], `voice-note-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' }));
        }
      };
      recorderRef.current = recorder;
      holdRef.current = { active: holdRef.current.active, startX: holdRef.current.startX };
      setRecordSeconds(0);
      setRecording(true);
      recorder.start();
      recordTimerRef.current = setInterval(() => setRecordSeconds((n) => n + 1), 1000);
      if (!holdRef.current.active) recorder.stop();
    } catch (e) {
      cleanup();
      logError(e);
      toast('Allow microphone access to record a voice note');
    }
  }

  // Swipe right, or Reply in the menu, quotes a message in the next send
  function setReply(message) {
    replyRef.current = message;
    setReplyTo(message);
  }

  function openMessageMenu(message, rect) {
    setMessageAnchor(rect);
    setMessageMenu(message);
  }

  function quoteOf(message) {
    return message ? { id: message.id, senderId: message.senderId, body: message.body || '', mediaKind: message.mediaKind || null, mediaUrl: message.mediaUrl || null, deletedForEveryone: false } : null;
  }

  async function send(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    const quoted = replyRef.current;
    setSending(true);
    setError('');
    try {
      const data = await api('/v1/messages/groups/' + groupId + '/messages', { method: 'POST', body: { body, replyToId: quoted?.id || undefined } });
      setMessages((current) => [...(current || []), { ...data.message, replyTo: quoteOf(quoted) }]);
      setText('');
      setReply(null);
    } catch (e) {
      setError(e.message || 'Could not send message');
      toast(e.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  async function deleteGroupMessage(message) {
    setMessageMenu(null);
    if (!window.confirm('Delete this message for everyone in the group?')) return;
    try {
      await api('/v1/messages/groups/' + groupId + '/messages/' + message.id, { method: 'DELETE' });
      setMessages((current) => (current || []).filter((row) => row.id !== message.id));
    } catch (e) { toast(e.message || 'Could not delete message'); }
  }

  const members = group?.members || [];
  const senderName = (id) => {
    const user = members.find((person) => String(person.id) === String(id));
    return String(id) === String(me?.id) ? 'You' : (user?.displayName || user?.username || 'Member');
  };

  return (
    <main className="dm-convo cv-convo">
      <header className="dm-chead">
        <button type="button" className="dm-icon" onClick={() => goBack(navigate, '/chat')} aria-label="Back">
          <Icon name="arrow-left" size={24} />
        </button>
        <span className="sn-group-avatar cv-group-head"><Icon name="users" size={22} /></span>
        <span className="cv-head-text">
          <span className="dm-cname">{group?.name || 'Group chat'}</span>
          <small className="cv-subtitle">{members.length ? members.length + ' members' : 'Group conversation'}</small>
        </span>
        <button type="button" className="dm-icon cv-head-menu" onClick={(e) => { setOptionsAnchor(e.currentTarget.getBoundingClientRect()); setOptionsOpen(true); }} aria-label="Group options"><Icon name="more-vertical" size={22} /></button>
      </header>

      <div className="dm-thread">
        {messages === null ? <p className="dm-empty">Loading group…</p>
          : messages.length === 0 ? <p className="dm-empty">This group is ready. Send the first message.</p>
          : messages.map((message) => {
            const mine = String(message.senderId) === String(me?.id);
            return (
              <MessageRow key={message.id} message={message} mine={mine} onReply={setReply} onOpenMenu={openMessageMenu}>
              <div className="cv-line">
                {!mine && <span className="cv-group-sender">{senderName(message.senderId)}</span>}
                <div className={mine ? 'dm-bubble mine cv-bubble' : 'dm-bubble theirs cv-bubble'}>
                  {message.replyTo && (() => {
                    const reply = message.replyTo;
                    const thumb = reply.mediaKind === 'photo' && reply.mediaUrl;
                    return (
                      <div className={thumb ? 'cv-quote with-thumb' : 'cv-quote'}>
                        <div className="cv-quote-text">
                          <strong>{String(reply.senderId) === String(me?.id) ? 'You' : senderName(reply.senderId)}</strong>
                          <span>{reply.body || attachmentLabel(reply.mediaKind)}</span>
                        </div>
                        {thumb && <img className="cv-quote-thumb" src={mediaUrl(reply.mediaUrl)} alt="" />}
                      </div>
                    );
                  })()}
                  {message.replyToId && !message.replyTo && <div className="cv-quote"><span>Original message is no longer available</span></div>}
                  {message.mediaUrl && <GroupMedia message={message} mine={mine} onOpenPhoto={(src) => setViewer({ src, kind: 'photo' })} onView={viewGroupPhoto} />}
                  {!!message.body && <span className="cv-text">{message.body}</span>}
                  <span className="cv-meta"><span>{clock(message.createdAt)}</span></span>
                  {mine && <button type="button" className="cv-group-message-options" onClick={(event) => { setMessageAnchor(event.currentTarget.getBoundingClientRect()); setMessageMenu(message); }} aria-label="Message options"><Icon name="more-vertical" size={15} /></button>}
                </div>
              </div>
              </MessageRow>
            );
          })}
        <div ref={endRef} />
      </div>

      {error && <p className="dm-error" role="alert">{error}</p>}
      {replyTo && (
        <div className="cv-composer-bar">
          <div className="cv-composer-text">
            <strong>{String(replyTo.senderId) === String(me?.id) ? 'Reply to yourself' : `Reply to ${senderName(replyTo.senderId)}`}</strong>
            <span>{replyTo.body || attachmentLabel(replyTo.mediaKind)}</span>
          </div>
          <button type="button" onClick={() => setReply(null)} aria-label="Cancel reply">×</button>
        </div>
      )}
      {recording && (
        <div className="cv-recording" role="status" aria-live="polite">
          <span className="cv-rec-dot" aria-hidden="true" />
          <span className="cv-rec-time">{formatClock(recordSeconds)}</span>
          <span className="cv-rec-hint">Slide left to cancel</span>
        </div>
      )}
      {!recording && (
      <form className="dm-input cv-form cv-ig-form" onSubmit={send}>
        <button type="button" className="cv-camera" onClick={() => fileRef.current?.click()} aria-label="Attach photo, video or file" disabled={sending}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
        </button>
        <input ref={fileRef} type="file" hidden onChange={pickFile} />
        <input enterKeyHint="send" autoComplete="off" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="Message the group" aria-label="Message the group" />
        {text.trim() ? (
          <button type="submit" className="cv-send-text" onPointerDown={(e) => e.preventDefault()} disabled={sending} aria-label="Send message">Send</button>
        ) : (
          <span className="cv-tools">
            <button type="button" className="cv-tool" aria-label="Hold to record a voice note" disabled={sending} onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); holdRef.current = { active: true, startX: e.clientX }; startVoice(); }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" /></svg>
            </button>
            <button type="button" className="cv-tool" aria-label="Photos and videos" disabled={sending} onClick={() => fileRef.current?.click()}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>
            </button>
          </span>
        )}
      </form>
      )}
      {viewer && (
        <div className="cv-viewer" role="dialog" aria-label="Photo preview" onClick={() => setViewer(null)}>
          <button type="button" className="cv-viewer-close" onClick={() => setViewer(null)} aria-label="Close preview">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <img src={viewer.src} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
      {file && previewUrl && (
        <MediaViewer
          media={{ src: previewUrl, kind: /^image\//.test(file.type) ? 'photo' : 'video' }}
          partner={null}
          name={group?.name || 'Group'}
          pending
          text={text}
          onText={setText}
          onSend={sendPending}
          onQuick={() => {}}
          sending={sending}
          edit={edit}
          setEdit={setEdit}
          editorRef={editorRef}
          onClose={closePreview}
        />
      )}
      {messageMenu && (
        <ChatMenu
          label="Group message options"
          anchor={messageAnchor}
          onClose={() => setMessageMenu(null)}
          items={[
            { key: 'reply', label: 'Reply', icon: 'reply', onSelect: () => { setMessageMenu(null); setReply(messageMenu); } },
            ...(String(messageMenu.senderId) === String(me?.id) ? [{ key: 'delete', label: 'Delete for everyone', icon: 'trash-2', danger: true, onSelect: () => deleteGroupMessage(messageMenu) }] : []),
          ]}
        />
      )}
      {optionsOpen && (
        <ChatMenu
          label="Group options"
          title={group?.name}
          anchor={optionsAnchor}
          onClose={() => setOptionsOpen(false)}
          items={[
            { key: 'mute', label: muted ? 'Unmute messages' : 'Mute messages', icon: muted ? 'bell' : 'bell-off', onSelect: toggleMute },
            ...(String(group?.createdById) === String(me?.id) ? [{ key: 'delete-group', label: 'Delete group for everyone', icon: 'trash-2', danger: true, onSelect: deleteGroupForEveryone }] : []),
            { key: 'leave', label: 'Leave group', icon: 'log-out', danger: true, onSelect: leaveGroup },
          ]}
        />
      )}
    </main>
  );
}

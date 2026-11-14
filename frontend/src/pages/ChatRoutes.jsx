import { Navigate, useParams } from 'react-router-dom';
import Conversation from './Conversation.jsx';
import GroupConversationPage from './GroupConversation.jsx';
import { chatTargetId } from '../lib/chatLink.js';

// Resolve the address token to a conversation; unknown tokens go back to the chat list
export function DirectChatRoute() {
  const { token } = useParams();
  const userId = chatTargetId('direct', token);
  if (!userId) return <Navigate to="/chat" replace />;
  return <Conversation userId={userId} />;
}

export function GroupChatRoute() {
  const { token } = useParams();
  const groupId = chatTargetId('group', token);
  if (!groupId) return <Navigate to="/chat" replace />;
  return <GroupConversationPage groupId={groupId} />;
}

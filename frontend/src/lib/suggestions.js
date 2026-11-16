import { api } from '../api.js';

// Tells the server a person was dismissed from Suggested, so Quick_Add_Score lowers them. The local hide is kept either way.
export function dismissSuggestion(personId) {
  api(`/v1/users/suggestions/${personId}/dismiss`, { method: 'POST' }).catch(() => {});
}

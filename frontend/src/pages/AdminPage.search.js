import { Film, Tag } from 'lucide-react';

// Search entries for the global command palette (Cmd/Ctrl+K, GlobalSearch.jsx) — kept next to
// AdminPage.jsx but in their own module, so GlobalSearch can import them without pulling the whole
// (lazy-loaded) page into the main bundle. Add an entry whenever the page gains a tab/section.
export const ADMIN_SEARCH_ITEMS = [
  { label: 'Biblioteka filmów', section: 'Panel Redaktora', to: '/admin?tab=videos', icon: Film, adminOnly: true },
  { label: 'Zarządzanie tagami', section: 'Panel Redaktora', to: '/admin?tab=tags', icon: Tag, adminOnly: true },
];

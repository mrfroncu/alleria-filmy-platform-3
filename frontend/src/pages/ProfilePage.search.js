import { Lock, Mail } from 'lucide-react';

// Search entries for the global command palette (Cmd/Ctrl+K, GlobalSearch.jsx) — kept next to
// ProfilePage.jsx but in their own module, so GlobalSearch can import them without pulling the whole
// (lazy-loaded) page into the main bundle. Add an entry whenever the page gains a tab/section.
export const PROFILE_SEARCH_ITEMS = [
  { label: 'Adres e-mail i powiadomienia', section: 'Mój profil', to: '/profile', icon: Mail },
  { label: 'Twoje dane (RODO)', section: 'Mój profil', to: '/profile', icon: Lock },
];

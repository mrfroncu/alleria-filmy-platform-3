import { Eye, LogIn, Shield, Users } from 'lucide-react';

// Search entries for the global command palette (Cmd/Ctrl+K, GlobalSearch.jsx) — kept next to
// LogsPage.jsx but in their own module, so GlobalSearch can import them without pulling the whole
// (lazy-loaded) page into the main bundle. Add an entry whenever the page gains a tab/section.
export const LOGS_SEARCH_ITEMS = [
  { label: 'Audit Log', section: 'Logi systemowe', to: '/logs?tab=audit', icon: Shield, devOnly: true },
  { label: 'Logi Watch Party', section: 'Logi systemowe', to: '/logs?tab=watchparty', icon: Users, devOnly: true },
  { label: 'Logi wyświetleń', section: 'Logi systemowe', to: '/logs?tab=watch', icon: Eye, devOnly: true },
  { label: 'Logi logowania', section: 'Logi systemowe', to: '/logs?tab=login', icon: LogIn, devOnly: true },
];

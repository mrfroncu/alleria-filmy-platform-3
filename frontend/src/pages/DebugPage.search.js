import { AlertTriangle, Download, HardDrive, ShieldCheck, Terminal, Trash2, Upload, UserPlus, Users } from 'lucide-react';

// Search entries for the global command palette (Cmd/Ctrl+K, GlobalSearch.jsx) — kept next to
// DebugPage.jsx but in their own module, so GlobalSearch can import them without pulling the whole
// (lazy-loaded) page into the main bundle. Add an entry whenever the page gains a tab/section.
export const DEBUG_SEARCH_ITEMS = [
  { label: 'Pliki streamera', section: 'Narzędzia Developerskie', to: '/debug?tab=streaming', icon: HardDrive, devOnly: true },
  { label: 'Czyszczenie streamingu', section: 'Narzędzia Developerskie', to: '/debug?tab=streaming', icon: Trash2, devOnly: true },
  { label: 'Aktywne Watch Parties', section: 'Narzędzia Developerskie', to: '/debug?tab=admin', icon: Users, devOnly: true },
  { label: 'Dodaj użytkownika', section: 'Narzędzia Developerskie', to: '/debug?tab=admin', icon: UserPlus, devOnly: true },
  { label: 'Sprawdź uprawnienia', section: 'Narzędzia Developerskie', to: '/debug?tab=categories', icon: ShieldCheck, devOnly: true },
  { label: 'Eksportuj bazę danych', section: 'Narzędzia Developerskie', to: '/debug?tab=debug', icon: Download, devOnly: true },
  { label: 'Importuj bazę danych', section: 'Narzędzia Developerskie', to: '/debug?tab=debug', icon: Upload, devOnly: true },
  { label: 'Czyszczenie logów', section: 'Narzędzia Developerskie', to: '/debug?tab=debug', icon: Trash2, devOnly: true },
  { label: 'Wyczyść bazę danych', section: 'Narzędzia Developerskie', to: '/debug?tab=debug', icon: AlertTriangle, devOnly: true },
  { label: 'Konsola SQL', section: 'Narzędzia Developerskie', to: '/debug?tab=debug', icon: Terminal, devOnly: true },
];

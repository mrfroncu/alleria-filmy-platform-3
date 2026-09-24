import { Database, FileText, Flag, FolderOpen, Lock, Mail, Settings, Shield, ShieldCheck, Users } from 'lucide-react';

// Search entries for the global command palette (Cmd/Ctrl+K, GlobalSearch.jsx) — kept next to
// ManagePage.jsx but in their own module, so GlobalSearch can import them without pulling the whole
// (lazy-loaded) page into the main bundle. Add an entry whenever the page gains a tab/section.
export const MANAGE_SEARCH_ITEMS = [
  { label: 'Kategorie', section: 'Zarządzanie', to: '/manage?tab=categories', icon: FolderOpen, devOnly: true },
  { label: 'Rangi', section: 'Zarządzanie', to: '/manage?tab=ranks', icon: Shield, devOnly: true },
  { label: 'Użytkownicy', section: 'Zarządzanie', to: '/manage?tab=users', icon: Users, devOnly: true },
  { label: 'Zgłoszenia', section: 'Zarządzanie', to: '/manage?tab=reports', icon: Flag, devOnly: true },
  { label: 'Zgłoszenia RODO (GDPR / LGPD)', section: 'Zarządzanie', to: '/manage?tab=gdpr', icon: Lock, devOnly: true },
  { label: 'Regulamin (edycja)', section: 'Zarządzanie', to: '/manage?tab=tos', icon: FileText, devOnly: true },
  { label: 'Limity treści', section: 'Zarządzanie', to: '/manage?tab=settings&subtab=display', icon: Settings, devOnly: true },
  { label: 'Ograniczenie domen webhooków', section: 'Zarządzanie', to: '/manage?tab=settings&subtab=security', icon: ShieldCheck, devOnly: true },
  { label: 'Region RODO / LGPD', section: 'Zarządzanie', to: '/manage?tab=settings&subtab=security', icon: ShieldCheck, devOnly: true },
  { label: 'Wysyłka kodu logowania (TS3)', section: 'Zarządzanie', to: '/manage?tab=settings&subtab=login', icon: ShieldCheck, devOnly: true },
  { label: 'Ustawienia SMTP', section: 'Zarządzanie', to: '/manage?tab=settings&subtab=email', icon: Mail, devOnly: true },
  { label: 'Baza danych (migracje, kopie zapasowe)', section: 'Zarządzanie', to: '/manage?tab=settings&subtab=database', icon: Database, devOnly: true },
];

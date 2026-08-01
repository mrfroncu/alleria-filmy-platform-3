import React from 'react';
import SidebarContent from './SidebarContent';

export default function Sidebar() {
  return (
    <aside className="hidden lg:block w-[272px] shrink-0 h-screen sticky top-0 border-r border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60">
      <SidebarContent />
    </aside>
  );
}

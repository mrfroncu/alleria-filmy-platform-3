import React from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Potwierdź', cancelLabel = 'Anuluj', danger, busy, onConfirm, onCancel }) {
  if (!open) return null;
  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    // confirm() is a universal interrupt that can fire from inside any other modal (VideoModal's
    // unsaved-changes guard, the analytics reset modal, etc.) — it needs to win the stack no
    // matter what invoked it, so it gets its own z-index above every other modal in the app
    // (the highest anywhere else is 9999) instead of sharing the generic .modal-overlay (z-50),
    // which just meant "whichever modal mounted last" decided the winner.
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onCancel} />
      <div className="modal-content max-w-md p-10 text-center" style={{ animation: 'slideUp 0.3s ease-out' }}>
        <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 border ${
          danger
            ? 'bg-red-50 dark:bg-red-500/10 text-red-600 border-red-100 dark:border-red-500/20'
            : 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 border-violet-100 dark:border-violet-500/20'
        }`}>
          <Icon className="w-10 h-10" />
        </div>
        {title && <h3 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-4 font-display">{title}</h3>}
        <p className="text-zinc-500 dark:text-zinc-400 mb-10 leading-relaxed text-sm whitespace-pre-line">{message}</p>
        <div className="flex gap-4">
          <button onClick={onCancel} disabled={busy} className="flex-1 btn-secondary disabled:opacity-50">{cancelLabel}</button>
          <button onClick={onConfirm} disabled={busy} className={`flex-1 ${danger ? 'btn-danger' : 'btn-primary'} disabled:opacity-50`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

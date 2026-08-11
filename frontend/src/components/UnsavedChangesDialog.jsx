import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function UnsavedChangesDialog({ open, labels, saving, error, onStay, onDiscard, onSaveAll }) {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-backdrop" onClick={onStay} />
      <div className="modal-content max-w-md p-10 text-center" style={{ animation: 'slideUp 0.3s ease-out' }}>
        <div className="w-20 h-20 bg-amber-50 dark:bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 text-amber-600 border border-amber-100 dark:border-amber-500/20">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h3 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-4 font-display">Niezapisane zmiany</h3>
        <p className="text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed text-sm">
          Masz niezapisane zmiany, które zostaną utracone, jeśli wyjdziesz bez zapisania:
        </p>
        {labels.length > 0 && (
          <ul className="mb-6 space-y-1.5">
            {labels.map(l => (
              <li key={l} className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-1.5 inline-block mx-1">
                {l}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <div className="mb-4 p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-3">
          <button onClick={onSaveAll} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Zapisywanie...' : 'Zapisz i przejdź'}
          </button>
          <div className="flex gap-3">
            <button onClick={onStay} disabled={saving} className="flex-1 btn-secondary disabled:opacity-50">Zostań</button>
            <button onClick={onDiscard} disabled={saving} className="flex-1 btn-danger disabled:opacity-50">Odrzuć zmiany</button>
          </div>
        </div>
      </div>
    </div>
  );
}

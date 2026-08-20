import React from 'react';
import { Check, X } from 'lucide-react';

// Small UI bits shared only by the setup wizard's own step files (frontend/src/components/setup/,
// frontend/src/pages/SetupWizardPage.jsx) — deliberately NOT imported from ManagePage.jsx and not
// exported for reuse there, so the wizard stays fully isolated from the working Ustawienia tab.
// ToggleSwitch below is an intentional copy of ManagePage.jsx's local component, same markup.

export function ToggleSwitch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className="inline-flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${checked ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
    </button>
  );
}

export function Segmented({ value, options, onChange, disabled }) {
  return (
    <div className="flex rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 w-full max-w-xs">
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          disabled={disabled}
          className={`flex-1 px-3 py-2.5 text-xs font-bold transition-colors disabled:opacity-50 ${
            value === val ? 'bg-violet-500 text-white' : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Small ✅/❌ row for diagnostics-style checklists (env/health/streaming status).
export function StatusRow({ ok, label, hint }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${ok ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400'}`}>
        {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
        {hint && <span className="block text-[11px] text-zinc-400">{hint}</span>}
      </div>
    </div>
  );
}

export const sourceBadgeClass = 'text-[10px] font-bold px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500';

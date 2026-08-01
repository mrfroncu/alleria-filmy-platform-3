import React from 'react';

export default function ToggleSwitch({ checked, onChange, disabled, label }) {
  return (
    <label className={`flex items-center gap-2.5 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${checked ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-700'}`}
      >
        <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : ''}`} />
      </button>
      {label && <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>}
    </label>
  );
}

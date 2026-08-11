import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog';

const UnsavedChangesContext = createContext(null);

// Manual registry instead of React Router's useBlocker — this app uses a plain <BrowserRouter>,
// not a data router, and useBlocker only works with the latter. Forms register their current
// dirty state + save function here; navigation call sites ask guardNavigation() before acting.
export function UnsavedChangesProvider({ children }) {
  const registry = useRef(new Map()); // id -> { dirty, save, label }
  const [pendingRun, setPendingRun] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const register = useCallback((id, entry) => { registry.current.set(id, entry); }, []);
  const unregister = useCallback((id) => { registry.current.delete(id); }, []);

  const dirtyEntries = () => [...registry.current.values()].filter(e => e.dirty);

  const guardNavigation = useCallback((run) => {
    if (dirtyEntries().length > 0) {
      setError(null);
      setPendingRun(() => run);
    } else {
      run();
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (dirtyEntries().length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const handleStay = () => { setPendingRun(null); setError(null); };
  const handleDiscard = () => { const run = pendingRun; setPendingRun(null); setError(null); run?.(); };
  const handleSaveAll = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const entry of dirtyEntries()) await entry.save();
      setSaving(false);
      const run = pendingRun;
      setPendingRun(null);
      run?.();
    } catch (err) {
      setSaving(false);
      setError('Nie udało się zapisać wszystkich zmian: ' + (err.message || 'nieznany błąd'));
    }
  };

  return (
    <UnsavedChangesContext.Provider value={{ register, unregister, guardNavigation }}>
      {children}
      <UnsavedChangesDialog
        open={!!pendingRun}
        labels={dirtyEntries().map(e => e.label)}
        saving={saving}
        error={error}
        onStay={handleStay}
        onDiscard={handleDiscard}
        onSaveAll={handleSaveAll}
      />
    </UnsavedChangesContext.Provider>
  );
}

function useUnsavedChangesContext() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error('must be used within UnsavedChangesProvider');
  return ctx;
}

export function useUnsavedGuard() {
  return useUnsavedChangesContext().guardNavigation;
}

// Call every render with the form's current dirty state, save function and a human label.
export function useUnsavedForm(id, { dirty, save, label }) {
  const { register, unregister } = useUnsavedChangesContext();
  useEffect(() => {
    register(id, { dirty, save, label });
    return () => unregister(id);
  });
}

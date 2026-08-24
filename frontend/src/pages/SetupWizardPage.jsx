import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Rocket } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../contexts/ToastContext';
import WelcomeStep from '../components/setup/WelcomeStep';
import EnvDiagnosticsStep from '../components/setup/EnvDiagnosticsStep';
import LoginStep from '../components/setup/LoginStep';
import StreamingStep from '../components/setup/StreamingStep';
import DisplayStep from '../components/setup/DisplayStep';
import SecurityStep from '../components/setup/SecurityStep';
import EmailStep from '../components/setup/EmailStep';
import FinishStep from '../components/setup/FinishStep';

const STEPS = [
  { id: 'welcome', label: 'Powitanie', Component: WelcomeStep },
  { id: 'env', label: 'Diagnostyka .env', Component: EnvDiagnosticsStep },
  { id: 'login', label: 'Logowanie', Component: LoginStep },
  { id: 'streaming', label: 'Streaming', Component: StreamingStep },
  { id: 'display', label: 'Wyświetlanie', Component: DisplayStep },
  { id: 'security', label: 'Bezpieczeństwo', Component: SecurityStep },
  { id: 'email', label: 'E-mail', Component: EmailStep },
  { id: 'finish', label: 'Podsumowanie', Component: FinishStep },
];

// Reachable directly any time (this route itself isn't gated), but SetupGate.jsx also forces
// every dev session here automatically while app_settings.setup_status is 'pending'. Every step
// loads real current values from the same
// endpoints ManagePage.jsx's Ustawienia tab uses — on an install that already has data, that
// means the wizard opens fully pre-filled and clicking through to the end changes nothing.
export default function SetupWizardPage() {
  const toast = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [settings, setSettingsState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);

  const reloadSettings = () => api.getSettings().then(setSettingsState).catch(() => {});

  useEffect(() => { reloadSettings().finally(() => setLoading(false)); }, []);

  // Hard navigation (not client-side routing) after either action below — AuthContext fetches
  // /api/auth/me exactly once on mount and never again, so a route change would carry the stale
  // setupStatus:'pending' it loaded with, and SetupGate would immediately bounce back here. A
  // full reload remounts AuthProvider and re-fetches the now-updated status (same reason
  // TosGate's accept handler reloads instead of just closing its modal).
  const runSetupAction = async (apiCall) => {
    setFinishing(true);
    try {
      await apiCall();
      window.location.href = '/';
    } catch (e) {
      toast.error('Błąd: ' + e.message);
      setFinishing(false);
    }
  };

  // setup_status -> 'completed': done for real, no reminder banner afterward.
  const finishSetup = () => runSetupAction(api.completeSetup);
  // setup_status -> 'skipped': stops the forced /setup redirect, but Layout.jsx keeps showing a
  // reminder banner (with a link back) until this is properly finished or reset from Dev Tools.
  const skipSetup = () => runSetupAction(api.skipSetup);

  const goBack = () => setStepIndex(i => Math.max(0, i - 1));
  const goNext = () => setStepIndex(i => Math.min(STEPS.length - 1, i + 1));

  const step = STEPS[stepIndex];
  const StepComponent = step.Component;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="flex-1 flex flex-col items-center px-6 py-10 sm:py-14">
        <div className="w-full max-w-2xl">

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0">
                <Rocket className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-zinc-900 dark:text-white font-display">Konfiguracja Alleria Filmy</h1>
                <p className="text-xs text-zinc-400">Krok {stepIndex + 1} z {STEPS.length} · {step.label}</p>
              </div>
            </div>
            <button onClick={skipSetup} disabled={finishing} className="text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors shrink-0 disabled:opacity-50">
              Pomiń, zrobię to później
            </button>
          </div>

          <div className="flex gap-1.5 mb-8">
            {STEPS.map((s, i) => (
              <div key={s.id} className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIndex ? 'bg-violet-500' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
            ))}
          </div>

          <div className="card p-8 min-h-[420px]">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <StepComponent settings={settings} reloadSettings={reloadSettings} onFinish={finishSetup} onGoTo={setStepIndex} steps={STEPS} />
            )}
          </div>

          <div className="flex items-center justify-between mt-6">
            <button
              onClick={goBack}
              disabled={isFirst}
              className="btn-secondary text-sm disabled:opacity-40 flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Wstecz
            </button>
            {isLast ? (
              <button onClick={finishSetup} disabled={finishing} className="btn-primary text-sm disabled:opacity-50">
                {finishing ? 'Zapisywanie...' : 'Zakończ konfigurację'}
              </button>
            ) : (
              <button onClick={goNext} className="btn-primary text-sm flex items-center gap-1.5">
                Dalej <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

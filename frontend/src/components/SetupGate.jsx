import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Mounted once at the app root, mirroring TosGate — gates on a boolean off `user` rather than
// wrapping individual routes, so it intercepts navigation to *any* page, not just ones a dev
// happens to hit through ProtectedRoute. Unlike TosGate this redirects to a full page instead of
// overlaying a modal — there's too much content (env diagnostics, streaming, every settings
// section) to cram into a dismiss-or-accept dialog.
//
// Driven purely by app_settings.setup_completed (via user.setupCompleted) — no client-side
// "skip for this session" state. Both "Zakończ konfigurację" and "Pomiń, zrobię to później" in
// SetupWizardPage.jsx set that same DB flag; the only way back in once it's set is the manual
// "Uruchom ponownie kreator konfiguracji" button in Dev Tools → Debug, which clears it again.
export default function SetupGate() {
  const { user, isDev } = useAuth();
  const location = useLocation();
  const needsSetup = !!user && isDev && !user.setupCompleted;

  if (needsSetup && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }
  return null;
}

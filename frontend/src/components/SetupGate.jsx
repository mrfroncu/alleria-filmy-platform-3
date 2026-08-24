import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Mounted once at the app root, mirroring TosGate — gates on a boolean off `user` rather than
// wrapping individual routes, so it intercepts navigation to *any* page, not just ones a dev
// happens to hit through ProtectedRoute. Unlike TosGate this redirects to a full page instead of
// overlaying a modal — there's too much content (env diagnostics, streaming, every settings
// section) to cram into a dismiss-or-accept dialog.
//
// Driven purely by app_settings.setup_status (via user.setupStatus) — no client-side state.
// Force-redirects only while 'pending' (never engaged at all). "Pomiń, zrobię to później" sets
// it to 'skipped', which stops the forced redirect but leaves Layout.jsx's reminder banner up;
// "Zakończ konfigurację" sets 'completed', which clears the banner too. Either way, the only
// way back in is the manual "Uruchom ponownie kreator konfiguracji" button in Dev Tools → Debug,
// which resets the flag to 'pending' again.
export default function SetupGate() {
  const { user, isDev } = useAuth();
  const location = useLocation();
  const needsSetup = !!user && isDev && user.setupStatus === 'pending';

  if (needsSetup && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }
  return null;
}

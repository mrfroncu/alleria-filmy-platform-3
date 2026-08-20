import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// sessionStorage (not state) so "Pomiń, zrobię to później" survives this tab's remaining
// lifetime without needing a context/provider of its own — SetupWizardPage sets this key right
// before navigating away, and it's cleared automatically when the tab/browser session ends
// (or on next login elsewhere), so a dev is greeted again in a genuinely new session.
export const SETUP_SKIPPED_KEY = 'alleria_setup_skipped';

// Mounted once at the app root, mirroring TosGate — gates on a boolean off `user` rather than
// wrapping individual routes, so it intercepts navigation to *any* page, not just ones a dev
// happens to hit through ProtectedRoute. Unlike TosGate this redirects to a full page instead of
// overlaying a modal — there's too much content (env diagnostics, streaming, every settings
// section) to cram into a dismiss-or-accept dialog.
export default function SetupGate() {
  const { user, isDev } = useAuth();
  const location = useLocation();
  const skippedThisSession = sessionStorage.getItem(SETUP_SKIPPED_KEY) === '1';
  const needsSetup = !!user && isDev && !user.setupCompleted && !skippedThisSession;

  if (needsSetup && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }
  return null;
}

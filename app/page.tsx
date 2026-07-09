'use client';

import { useEffect } from 'react';

/**
 * Root route ("/").
 *
 * At runtime this component is normally NOT rendered: the "beforeFiles"
 * rewrite in next.config.ts serves the static marketing landing page
 * (public/Foundry_Landing_Page.html) at "/" directly. This file exists so
 * Next.js's bundler always has a real "/" endpoint to build against —
 * without it, having no page.tsx at the root confuses the bundler.
 *
 * This only actually runs as a fallback (e.g. a client-side navigation
 * back to "/" from inside the app), in which case it hands off to the
 * static landing page manually.
 */
export default function RootPage() {
  useEffect(() => {
    window.location.replace('/Foundry_Landing_Page.html');
  }, []);
  return null;
}
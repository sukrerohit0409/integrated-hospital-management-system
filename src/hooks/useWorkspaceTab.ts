import { useCallback, useEffect, useState } from 'react';
import { navigateTo } from '../utils/workspaceRoutes';

/**
 * Keeps a dashboard tab/filter in sync with its URL. It intentionally does not
 * authorize access: App.tsx and Supabase RLS remain responsible for that.
 */
export function useWorkspaceTab<const Routes extends Readonly<Record<string, string>>>(
  routes: Routes,
  defaultTab: keyof Routes,
): readonly [keyof Routes & string, (tab: keyof Routes & string) => void] {
  type Tab = keyof Routes & string;

  const tabForCurrentPath = useCallback((): Tab => {
    const match = (Object.entries(routes) as [Tab, string][]).find(([, path]) => path === window.location.pathname);
    return match?.[0] ?? (defaultTab as Tab);
  }, [routes, defaultTab]);

  const [tab, setTab] = useState<Tab>(() => tabForCurrentPath());

  useEffect(() => {
    const syncFromLocation = () => setTab(tabForCurrentPath());
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, [tabForCurrentPath]);

  const selectTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
    const path = routes[nextTab];
    if (path) navigateTo(path);
  }, [routes]);

  return [tab, selectTab] as const;
}

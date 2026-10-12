import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchAppearance } from './api';
import { isThemeId } from './themes';
import type { ThemeId } from '../types';

interface AppearanceContext {
  active: ThemeId;
  theme: ThemeId;
  preview: ThemeId | null;
  setPreview: (theme: ThemeId | null) => void;
  publish: (theme: ThemeId, keepPreview?: boolean) => void;
}
const Context = createContext<AppearanceContext | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ThemeId>('nordic');
  const [preview, setPreview] = useState<ThemeId | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const version = revision.current;
    void fetchAppearance().then(({ appearance }) => {
      if (!cancelled && revision.current === version && isThemeId(appearance.theme)) setActive(appearance.theme);
    }).catch(() => { /* Standardtemat fungerar även om API:et är tillfälligt nere. */ });
    return () => { cancelled = true; };
  }, []);

  const theme = preview ?? active;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function publish(next: ThemeId, keepPreview = false) {
    revision.current += 1;
    setActive(next);
    if (!keepPreview) setPreview(null);
  }

  return <Context.Provider value={{ active, theme, preview, setPreview, publish }}>{children}</Context.Provider>;
}

export function useAppearance() {
  const context = useContext(Context);
  if (!context) throw new Error('Temat måste användas inom AppearanceProvider.');
  return context;
}

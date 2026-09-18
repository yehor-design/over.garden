"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export interface SiteShellContextRailItem {
  href: string;
  label: string;
  meta?: string;
}

export interface SiteShellContextRailModule {
  key: string;
  title: string;
  items: SiteShellContextRailItem[];
  emptyLabel?: string;
}

type ContextRailSetter = Dispatch<
  SetStateAction<SiteShellContextRailModule[] | null>
>;

const SiteShellContextRailContext = createContext<ContextRailSetter | null>(
  null,
);

export function SiteShellContextRailProvider({
  children,
  setModules,
}: {
  children: ReactNode;
  setModules: ContextRailSetter;
}) {
  return (
    <SiteShellContextRailContext.Provider value={setModules}>
      {children}
    </SiteShellContextRailContext.Provider>
  );
}

export function SiteShellContextRailRegistration({
  modules,
}: {
  modules: SiteShellContextRailModule[];
}) {
  const setModules = useContext(SiteShellContextRailContext);

  useEffect(() => {
    if (!setModules) return;

    setModules(modules);
    return () => setModules(null);
  }, [modules, setModules]);

  return null;
}

export function SiteShellContextRailModules({
  modules,
}: {
  modules: SiteShellContextRailModule[];
}) {
  return (
    <div className="flex flex-col gap-6" data-site-shell-context="route-owned">
      {modules.map((module) => (
        <section key={module.key} className="flex flex-col gap-2.5">
          <h2 className="text-overline text-text-muted uppercase">
            {module.title}
          </h2>
          {module.items.length > 0 ? (
            <ul className="flex flex-col border-t border-border">
              {module.items.map((item) => (
                <li key={`${module.key}:${item.href}:${item.label}`}>
                  <Link
                    href={item.href}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-sm border-b border-border py-2 text-body-sm font-medium text-text outline-none transition-colors duration-instant ease-out hover:text-link focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    <span className="min-w-0 break-words">{item.label}</span>
                    {item.meta ? (
                      <span className="shrink-0 text-caption text-text-muted tabular-nums">
                        {item.meta}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-text-muted">
              {module.emptyLabel}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

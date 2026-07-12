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
          <h2 className="text-xs font-semibold text-muted-foreground uppercase">
            {module.title}
          </h2>
          {module.items.length > 0 ? (
            <ul className="flex flex-col border-t border-border">
              {module.items.map((item) => (
                <li key={`${module.key}:${item.href}:${item.label}`}>
                  <Link
                    href={item.href}
                    className="flex min-h-10 items-center justify-between gap-3 border-b border-border py-2 text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    <span className="min-w-0 break-words">{item.label}</span>
                    {item.meta ? (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {item.meta}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-5 text-muted-foreground">
              {module.emptyLabel}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

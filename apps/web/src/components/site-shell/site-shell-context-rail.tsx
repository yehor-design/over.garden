"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import {
  createValueStore,
  useValueStore,
  type ValueStore,
} from "@/lib/value-store";

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

type ContextRailStore = ValueStore<SiteShellContextRailModule[] | null>;

const SiteShellContextRailContext = createContext<ContextRailStore | null>(
  null,
);

/**
 * What a page puts in the context rail, held in a store rather than in the
 * shell's state (ADR-0032 D10).
 *
 * A page registers its modules from an effect, which runs while the rest of
 * that page may still be hydrating — or still arriving. As state in the shell
 * that rendered the shell again, above the page, in the middle of exactly that.
 * Here the provider's value is the store and never changes; the rail's outlet
 * is the only thing that renders when a page speaks.
 */
export function SiteShellContextRailProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [store] = useState<ContextRailStore>(() => createValueStore(null));

  return (
    <SiteShellContextRailContext.Provider value={store}>
      {children}
    </SiteShellContextRailContext.Provider>
  );
}

export function SiteShellContextRailRegistration({
  modules,
}: {
  modules: SiteShellContextRailModule[];
}) {
  const store = useContext(SiteShellContextRailContext);

  useEffect(() => {
    if (!store) return;
    store.set(modules);
    return () => store.set(null);
  }, [modules, store]);

  return null;
}

const NO_RAIL: ContextRailStore = createValueStore(null);

/** The rail's content: what the page registered, or `fallback` until it does. */
export function SiteShellContextRailOutlet({
  fallback,
}: {
  fallback: ReactNode;
}) {
  const modules = useValueStore(
    useContext(SiteShellContextRailContext) ?? NO_RAIL,
  );

  return modules ? <SiteShellContextRailModules modules={modules} /> : fallback;
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

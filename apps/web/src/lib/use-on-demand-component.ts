"use client";

import { useCallback, useState, type ComponentType } from "react";

/**
 * A control whose code arrives when it is pressed, not with the page
 * (`OVE-468`). A guest reads the page and never opens the account menu, the
 * narrow bar's sheet, the sign-out question or the palette's dialog, and each
 * of them used to be in every page's script.
 *
 * `request` is what the press calls. The component is state, set when its
 * module arrives, so a press that lands before the code does is kept rather
 * than lost: the caller draws a stand-in until then and the real control —
 * open — after. The stand-in stays the same element while the code is on its
 * way, so a keyboard reader's focus is not dropped in between; a `Suspense`
 * fallback would have swapped it for a copy.
 *
 * A download that fails — a dropped connection, a deployment that replaced the
 * chunk — resolves `request` to `false` and leaves the stand-in as it was, so
 * the next press asks again. It is never an error thrown into the page around
 * the control, which is what a rejected `React.lazy` is.
 *
 * `preload` is for the moment a press becomes likely: a pointer over the
 * control, or focus on it.
 */
export function useOnDemandComponent<Props>(
  load: () => Promise<ComponentType<Props>>,
) {
  const [Component, setComponent] = useState<ComponentType<Props> | null>(null);

  const request = useCallback(
    () =>
      load().then(
        (loaded) => {
          setComponent(() => loaded);
          return true;
        },
        () => false,
      ),
    [load],
  );

  const preload = useCallback(() => {
    void load().catch(() => undefined);
  }, [load]);

  return { Component, request, preload };
}

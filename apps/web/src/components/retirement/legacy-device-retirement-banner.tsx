"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  createLegacyDeviceRetirementController,
  LEGACY_RETIREMENT_DEADLINE_MS,
  type LegacyDeviceRetirementController,
  type LegacyRetirementSnapshot,
} from "@/lib/retirement/legacy-device-retirement";
import { getLegacyDeviceRetirementCopy } from "@/lib/retirement/legacy-device-retirement-copy";
import { retireKnownClientStorage } from "@/lib/retirement/known-client-storage";

type ControllerFactory = () => LegacyDeviceRetirementController;

interface LegacyDeviceRetirementBannerProps {
  locale: InterfaceLocale;
  onSignOut?: () => void;
  /** Synthetic fixture/test seam. Production always uses native browser APIs. */
  controllerFactory?: ControllerFactory;
}

export function LegacyDeviceRetirementBanner({
  locale,
  onSignOut,
  controllerFactory,
}: LegacyDeviceRetirementBannerProps) {
  const copy = getLegacyDeviceRetirementCopy(locale);
  const controllerRef = useRef<LegacyDeviceRetirementController | null>(null);
  const [snapshot, setSnapshot] = useState<LegacyRetirementSnapshot | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);
  const factory = useMemo<ControllerFactory>(
    () =>
      controllerFactory ??
      (() =>
        createLegacyDeviceRetirementController({
          port: {
            retire: (signal) =>
              retireKnownClientStorage(undefined, {
                deadlineMs: LEGACY_RETIREMENT_DEADLINE_MS,
                signal,
              }),
          },
        })),
    [controllerFactory],
  );

  useEffect(() => {
    let disposed = false;
    const controller = factory();
    controllerRef.current = controller;
    const update = () => {
      if (!disposed) setSnapshot({ ...controller.getSnapshot() });
    };
    const unsubscribe = controller.subscribe(update);
    update();
    void controller.inspect().then(update);
    return () => {
      disposed = true;
      unsubscribe();
      controller.cancel();
      controllerRef.current = null;
    };
  }, [factory]);

  if (!snapshot?.visible || dismissed) return null;

  const controller = controllerRef.current;
  const busy = snapshot.state === "deleting";
  const status =
    snapshot.unresolvedClass === "ownership_unresolved"
      ? copy.states.unresolved
      : snapshot.lastAction === "cancelled"
        ? copy.states.cancelled
        : busy
          ? copy.states.deleting
          : copy.states.deletionBlocked;

  return (
    <section
      role="region"
      aria-label={copy.ariaLabel}
      data-legacy-device-retirement={snapshot.state}
      className="border-b border-amber-300/60 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-50"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm leading-6">{copy.reason}</p>
          <p role="status" aria-live="polite" className="text-sm font-medium">
            {status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {busy ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              data-retirement-cancel="true"
              onClick={() => controller?.cancel()}
            >
              {copy.actions.cancel}
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11"
              data-retirement-retry="true"
              onClick={() => void controller?.retry()}
            >
              {copy.actions.retry}
            </Button>
          )}
          {onSignOut ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              data-retirement-sign-out="true"
              onClick={onSignOut}
            >
              {copy.actions.signOut}
            </Button>
          ) : null}
          {!busy ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setDismissed(true)}
            >
              {copy.actions.dismiss}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

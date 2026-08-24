"use client";

import { Languages } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  getInterfaceCopy,
  type InterfaceLocale,
} from "@/lib/interface-localization";
import {
  interfaceLocaleChangeCoordinator,
  INTERFACE_LOCALE_CHANGE_PHASE_TIMEOUT_MS,
  type InterfaceLocaleChangeCommitGateResult,
  type InterfaceLocaleChangePreparationResult,
  type InterfaceLocaleChangeRecoveryHandle,
  type PreparedInterfaceLocaleChange,
} from "@/lib/interface-locale-change-coordinator";
import type { InterfaceMarket } from "@/lib/interface-market";
import {
  buildLocalizedInterfaceTarget,
  getInterfaceRoutePolicy,
  INTERFACE_LOCALE_PREFERENCE_ENDPOINT,
  sanitizeInterfaceRouteFragment,
  sanitizeInterfaceRouteSearch,
} from "@/lib/interface-route-policy";
import {
  BULGARIA_PUBLIC_LOCALES,
  PUBLIC_LOCALE_CONFIG,
  type PublicLocale,
} from "@/lib/public-localization";
import { cn } from "@/lib/utils";

export interface InterfaceLanguageControlProps {
  locale: InterfaceLocale;
  market: InterfaceMarket;
  pathname?: string;
  compact?: boolean;
  /** Keep the single control visible but inert while an outer safety gate runs. */
  externallyDisabled?: boolean;
}

/** The single application-owned Bulgaria interface-language control. */
export function InterfaceLanguageControl({
  locale,
  market,
  pathname,
  compact = false,
  externallyDisabled = false,
}: InterfaceLanguageControlProps) {
  const currentPathname = usePathname() || "/";
  const activePathname = pathname ?? currentPathname;
  const browserSearch = useSyncExternalStore(
    subscribeToBrowserLocation,
    readBrowserSearch,
    emptyBrowserSearch,
  );
  const [coordinatorState, setCoordinatorState] = useState(() =>
    interfaceLocaleChangeCoordinator.readState(),
  );
  const [switching, setSwitching] = useState(false);
  const [confirmationTarget, setConfirmationTarget] =
    useState<PublicLocale | null>(null);
  const [confirmationCommitted, setConfirmationCommitted] = useState(false);
  const [feedback, setFeedback] = useState<
    "flush-failed" | "mutation-blocked" | null
  >(null);
  const [recovery, setRecovery] =
    useState<InterfaceLocaleChangeRecoveryHandle | null>(null);
  const [retryingRecovery, setRetryingRecovery] = useState(false);
  const [cancellingTransition, setCancellingTransition] = useState(false);
  const statusId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const transitionEpochRef = useRef(0);
  const transitionAbortRef = useRef<AbortController | null>(null);
  const transitionPreparationRef =
    useRef<PreparedInterfaceLocaleChange | null>(null);
  const preferenceMayHaveChangedRef = useRef(false);

  useEffect(
    () => interfaceLocaleChangeCoordinator.subscribe(setCoordinatorState),
    [],
  );

  useEffect(() => {
    if (!confirmationTarget || confirmationCommitted) return;

    // The locale menu and the alert dialog close/open in the same interaction.
    // Base UI restores menu-trigger focus after the dialog's initial-focus pass,
    // so reassert the safe cancel target after that restoration has settled.
    const requestFocusFrame = (callback: () => void) =>
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(callback)
        : window.setTimeout(callback, 0);
    const cancelFocusFrame = (frame: number) => {
      if (typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frame);
      } else {
        window.clearTimeout(frame);
      }
    };
    cancelRef.current?.focus();
    let settledFrame = 0;
    const menuCloseFrame = requestFocusFrame(() => {
      cancelRef.current?.focus();
      settledFrame = requestFocusFrame(() => {
        cancelRef.current?.focus();
      });
    });

    return () => {
      cancelFocusFrame(menuCloseFrame);
      if (settledFrame) cancelFocusFrame(settledFrame);
    };
  }, [confirmationCommitted, confirmationTarget]);

  const copy = getInterfaceCopy(locale).shell;
  const routePolicy = getInterfaceRoutePolicy(activePathname);
  const disabled =
    externallyDisabled ||
    switching ||
    coordinatorState.phase === "preparing" ||
    coordinatorState.hasInFlightMutation;

  const finishStoppedPreparation = useCallback(
    async (
      result: Exclude<
        InterfaceLocaleChangePreparationResult,
        { status: "prepared" }
      >,
    ) => {
      if (result.recovery?.isActive()) setRecovery(result.recovery);
      if (result.status === "blocked") {
        setFeedback(
          result.reason === "mutation-in-flight" ? "mutation-blocked" : null,
        );
      } else if (result.status === "failed") {
        setFeedback("flush-failed");
      }
    },
    [],
  );

  const prepare = useCallback(
    async (discardConfirmed: boolean) => {
      const result = await interfaceLocaleChangeCoordinator.prepare({
        discardConfirmed,
      });
      if (result.status !== "prepared") {
        await finishStoppedPreparation(result);
      }
      return result;
    },
    [finishStoppedPreparation],
  );

  const navigate = useCallback(
    async (targetLocale: PublicLocale, discardConfirmed = false) => {
      if (targetLocale === locale || disabled) return;
      const transitionEpoch = transitionEpochRef.current + 1;
      transitionEpochRef.current = transitionEpoch;
      const isCurrentTransition = () =>
        transitionEpochRef.current === transitionEpoch;
      const abortController = new AbortController();
      transitionAbortRef.current = abortController;
      const sourceLocation = readInterfaceLocationSnapshot();
      if (sourceLocation.pathname !== activePathname) {
        if (discardConfirmed) {
          setConfirmationCommitted(false);
          setConfirmationTarget(null);
        }
        return;
      }
      setFeedback(null);
      setRecovery(null);
      setCancellingTransition(false);
      setSwitching(true);
      let preparation: PreparedInterfaceLocaleChange | null = null;
      let replacementHandedOff = false;
      let preferenceMayHaveChanged = false;
      try {
        const result = await prepare(discardConfirmed);
        if (!isCurrentTransition()) return;
        if (result.status === "confirmation-required") {
          if (!isCurrentInterfaceLocation(sourceLocation)) {
            setConfirmationCommitted(false);
            setConfirmationTarget(null);
            return;
          }
          setConfirmationCommitted(false);
          setConfirmationTarget(targetLocale);
          return;
        }
        if (result.status !== "prepared") {
          setConfirmationCommitted(false);
          setConfirmationTarget(null);
          return;
        }
        preparation = result.preparation;
        transitionPreparationRef.current = preparation;

        const stopStaleCommit = async (
          gate: Exclude<
            InterfaceLocaleChangeCommitGateResult,
            { status: "ready" }
          > | null,
          rollbackPreference: boolean,
        ) => {
          let recoveryHandle: InterfaceLocaleChangeRecoveryHandle | null =
            preparation;
          if (rollbackPreference) {
            recoveryHandle = preparation
              ? createLocalePreferenceRollbackRecovery(preparation, locale)
              : null;
          }
          const recoveryResult = await recoveryHandle?.resume();
          if (recoveryResult === "retry-required" && recoveryHandle) {
            setRecovery(recoveryHandle);
            setConfirmationCommitted(false);
            setConfirmationTarget(null);
            setFeedback("flush-failed");
            preparation = null;
            return;
          }
          if (rollbackPreference) {
            preferenceMayHaveChanged = false;
          }
          if (gate === null) {
            setConfirmationCommitted(false);
            setConfirmationTarget(null);
            setFeedback(null);
          } else if (gate.status === "confirmation-required") {
            setConfirmationCommitted(false);
            setConfirmationTarget(targetLocale);
          } else {
            setFeedback(
              gate.reason === "mutation-in-flight"
                ? "mutation-blocked"
                : "flush-failed",
            );
          }
          preparation = null;
        };

        const stopChangedLocation = (rollbackPreference: boolean) =>
          stopStaleCommit(null, rollbackPreference);

        if (!isCurrentInterfaceLocation(sourceLocation)) {
          await stopChangedLocation(false);
          return;
        }

        const recoverLocalizedHandoff = async (
          documentPreparation: PreparedInterfaceLocaleChange,
        ) => {
          const recoveryResult = await documentPreparation.resume();
          setRecovery(
            recoveryResult === "retry-required" ? documentPreparation : null,
          );
          setConfirmationCommitted(false);
          setConfirmationTarget(null);
          setSwitching(false);
          setFeedback("flush-failed");
        };

        const recoverPreferenceHandoff = async (
          rollbackRecovery: InterfaceLocaleChangeRecoveryHandle,
        ) => {
          const recoveryResult = await rollbackRecovery.resume();
          setRecovery(
            recoveryResult === "retry-required" ? rollbackRecovery : null,
          );
          if (recoveryResult === "resumed") {
            preferenceMayHaveChanged = false;
          }
          setConfirmationCommitted(false);
          setConfirmationTarget(null);
          setSwitching(false);
          setFeedback("flush-failed");
        };

        if (routePolicy.mode === "localized-link") {
          const target = buildLocalizedInterfaceTarget({
            locale: targetLocale,
            pathname: activePathname,
            search: sourceLocation.search,
            fragment: existingSafeClientFragment(
              activePathname,
              sourceLocation.hash,
            ),
          });
          if (!target) throw new Error("Localized route target unavailable.");
          const targetUrl = new URL(target, window.location.href);
          if (targetUrl.origin !== window.location.origin) {
            throw new Error("Cross-origin locale target rejected.");
          }
          await settleLocaleTransitionPhase(
            preparation.sealForDocumentReplacement(),
          );
          if (!isCurrentTransition()) return;
          if (!isCurrentInterfaceLocation(sourceLocation)) {
            await stopChangedLocation(false);
            return;
          }
          const gate = preparation.revalidateCommitGate();
          if (gate.status !== "ready") {
            await stopStaleCommit(gate, false);
            return;
          }
          const documentPreparation = preparation;
          replacementHandedOff = beginNoReferrerDocumentReplacement({
            mode: "navigate",
            target: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
            preparation: documentPreparation,
            onCanceled: () => recoverLocalizedHandoff(documentPreparation),
          });
          return;
        }

        if (routePolicy.mode !== "same-path-preference") {
          throw new Error("Interface locale changes are disabled here.");
        }
        await settleLocaleTransitionPhase(
          preparation.sealForDocumentReplacement(),
        );
        if (!isCurrentTransition()) return;
        if (!isCurrentInterfaceLocation(sourceLocation)) {
          await stopChangedLocation(false);
          return;
        }
        const preRequestGate = preparation.revalidateCommitGate();
        if (preRequestGate.status !== "ready") {
          await stopStaleCommit(preRequestGate, false);
          return;
        }
        preferenceMayHaveChanged = true;
        preferenceMayHaveChangedRef.current = true;
        const response = await postInterfaceLocalePreference(
          targetLocale,
          abortController.signal,
        );
        if (!isCurrentTransition()) return;
        if (response.status !== 204 || response.redirected) {
          throw new Error("Locale preference request was not committed.");
        }
        if (!isCurrentInterfaceLocation(sourceLocation)) {
          await stopChangedLocation(true);
          return;
        }
        const preHandoffGate = preparation.revalidateCommitGate();
        if (preHandoffGate.status !== "ready") {
          await stopStaleCommit(preHandoffGate, true);
          return;
        }
        const documentPreparation = preparation;
        const rollbackRecovery = createLocalePreferenceRollbackRecovery(
          documentPreparation,
          locale,
        );
        replacementHandedOff = beginNoReferrerDocumentReplacement({
          mode: "reload",
          preparation: documentPreparation,
          onCanceled: () => recoverPreferenceHandoff(rollbackRecovery),
        });
      } catch {
        if (!isCurrentTransition()) return;
        if (preparation?.isActive()) {
          if (preferenceMayHaveChanged) {
            const rollbackRecovery = createLocalePreferenceRollbackRecovery(
              preparation,
              locale,
            );
            const recoveryResult = await rollbackRecovery.resume();
            if (recoveryResult === "retry-required") {
              setRecovery(rollbackRecovery);
            } else {
              preferenceMayHaveChanged = false;
            }
          } else {
            // A failed or timed-out handoff must never wait for another
            // durable flush before returning control to the gardener. The
            // coordinator cancels through the synchronous recovery fence and
            // retains a retry handle only if that bounded release fails.
            const recovery = await interfaceLocaleChangeCoordinator.cancel();
            if (recovery?.isActive()) setRecovery(recovery);
          }
        }
        setConfirmationCommitted(false);
        setConfirmationTarget(null);
        setFeedback("flush-failed");
      } finally {
        if (!replacementHandedOff && isCurrentTransition()) {
          transitionAbortRef.current = null;
          transitionPreparationRef.current = null;
          preferenceMayHaveChangedRef.current = false;
          setSwitching(false);
        }
      }
    },
    [activePathname, disabled, locale, prepare, routePolicy.mode],
  );

  const cancelConfirmation = useCallback(() => {
    if (confirmationCommitted) return;
    setConfirmationTarget(null);
  }, [confirmationCommitted]);

  const confirmDiscard = useCallback(() => {
    const targetLocale = confirmationTarget;
    if (!targetLocale || confirmationCommitted || disabled) return;
    setConfirmationCommitted(true);
    void navigate(targetLocale, true);
  }, [confirmationCommitted, confirmationTarget, disabled, navigate]);

  const retryRecovery = useCallback(async () => {
    if (!recovery?.isActive() || retryingRecovery) return;
    setRetryingRecovery(true);
    const result = await recovery.resume();
    if (result === "resumed") setRecovery(null);
    setRetryingRecovery(false);
  }, [recovery, retryingRecovery]);

  const cancelTransition = useCallback(async () => {
    if (!switching || cancellingTransition) return;
    setCancellingTransition(true);
    transitionEpochRef.current += 1;
    transitionAbortRef.current?.abort();
    transitionAbortRef.current = null;
    const preparation = transitionPreparationRef.current;
    let nextRecovery: InterfaceLocaleChangeRecoveryHandle | null = null;
    if (preferenceMayHaveChangedRef.current && preparation?.isActive()) {
      // A request aborted after leaving the browser can have reached the
      // server. Keep the handle for explicit guarded rollback rather than
      // treating cancellation as proof that the preference stayed unchanged.
      nextRecovery = createLocalePreferenceRollbackRecovery(preparation, locale);
    } else {
      nextRecovery = await interfaceLocaleChangeCoordinator.cancel();
    }
    transitionPreparationRef.current = null;
    preferenceMayHaveChangedRef.current = false;
    setRecovery(nextRecovery);
    setFeedback(nextRecovery ? "flush-failed" : null);
    setConfirmationCommitted(false);
    setConfirmationTarget(null);
    setSwitching(false);
    setCancellingTransition(false);
    triggerRef.current?.focus();
  }, [cancellingTransition, locale, switching]);

  if (
    market !== "bulgaria" ||
    !BULGARIA_PUBLIC_LOCALES.includes(
      locale as (typeof BULGARIA_PUBLIC_LOCALES)[number],
    )
  ) {
    return null;
  }

  const visibleStatus = coordinatorState.hasInFlightMutation
    ? copy.languageMutationPending
    : recovery || feedback === "flush-failed"
      ? copy.languageFlushFailure
      : feedback === "mutation-blocked"
        ? copy.languageMutationPending
        : switching || coordinatorState.phase === "preparing"
          ? copy.languageSwitchingPending
          : null;

  return (
    <nav
      data-interface-language-control="site-shell-interface-language-control"
      aria-label={copy.languageControlLabel}
      className={cn(
        "relative flex min-w-0 items-center gap-2 text-foreground",
        compact && "justify-end",
      )}
    >
      <Menu disabled={disabled}>
        <MenuTrigger
          render={
            <Button
              ref={triggerRef}
              type="button"
              disabled={disabled}
              variant="ghost"
              size={compact ? "sm" : "icon-lg"}
              aria-label={copy.languageControlTrigger}
              aria-describedby={visibleStatus ? statusId : undefined}
              data-interface-language-trigger="true"
            />
          }
        >
          <Languages aria-hidden="true" />
          <span className={compact ? "" : "sr-only"}>
            {PUBLIC_LOCALE_CONFIG[locale].shortLabel}
          </span>
        </MenuTrigger>
        <MenuContent align="end" className="min-w-44">
          <MenuRadioGroup value={locale}>
            {BULGARIA_PUBLIC_LOCALES.map((availableLocale) => {
              const href = languageHref({
                locale: availableLocale,
                pathname: activePathname,
                search: browserSearch,
              });
              return (
                <MenuRadioItem
                  key={availableLocale}
                  value={availableLocale}
                  label={PUBLIC_LOCALE_CONFIG[availableLocale].label}
                  closeOnClick
                  disabled={disabled}
                  render={
                    <a
                      href={href}
                      rel="noreferrer"
                      referrerPolicy="no-referrer"
                      hrefLang={PUBLIC_LOCALE_CONFIG[availableLocale].htmlLang}
                      lang={PUBLIC_LOCALE_CONFIG[availableLocale].htmlLang}
                      aria-current={
                        availableLocale === locale ? "true" : undefined
                      }
                      onClick={(event) => {
                        event.preventDefault();
                        void navigate(availableLocale);
                      }}
                    />
                  }
                >
                  {PUBLIC_LOCALE_CONFIG[availableLocale].label}
                </MenuRadioItem>
              );
            })}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      {visibleStatus ? (
        <div className="absolute top-full right-0 z-50 mt-2 flex w-max max-w-72 flex-col items-end gap-2 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
          <span id={statusId} role="status" aria-live="polite">
            {visibleStatus}
          </span>
          {recovery ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={retryingRecovery}
              onClick={() => void retryRecovery()}
            >
              {copy.retry}
            </Button>
          ) : null}
          {switching ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={cancellingTransition}
              data-interface-language-cancel="true"
              onClick={() => void cancelTransition()}
            >
              {copy.languageDiscardCancel}
            </Button>
          ) : null}
        </div>
      ) : null}
      <AlertDialog
        open={confirmationTarget !== null}
        onOpenChange={(open) => {
          if (!open && !confirmationCommitted) {
            cancelConfirmation();
          }
        }}
      >
        <AlertDialogContent
          initialFocus={confirmationTarget ? cancelRef : true}
          finalFocus={triggerRef}
          aria-busy={confirmationCommitted || undefined}
        >
          {confirmationTarget ? (
            <>
              <AlertDialogTitle>{copy.languageDiscardTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {copy.languageDiscardConfirmation}
              </AlertDialogDescription>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialogClose
                  ref={cancelRef}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:min-h-9"
                  onClick={cancelConfirmation}
                  disabled={confirmationCommitted}
                >
                  {copy.languageDiscardCancel}
                </AlertDialogClose>
                <Button
                  variant="destructive"
                  onClick={confirmDiscard}
                  disabled={confirmationCommitted || disabled}
                >
                  {copy.languageDiscardAction}
                </Button>
              </div>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}

/** Compatibility alias for existing imports while the canonical owner is named. */
export const LanguageSwitcher = InterfaceLanguageControl;

function languageHref({
  locale,
  pathname,
  search,
}: {
  locale: PublicLocale;
  pathname: string;
  search: string;
}) {
  const localizedTarget = buildLocalizedInterfaceTarget({
    locale,
    pathname,
    search,
  });
  if (localizedTarget) return localizedTarget;

  return `${pathname}${sanitizeInterfaceRouteSearch(pathname, search)}`;
}

function existingSafeClientFragment(pathname: string, rawFragment: string) {
  const fragment = sanitizeInterfaceRouteFragment(pathname, rawFragment);
  if (!fragment) return "";

  const fragmentId = fragment.slice(1);
  const target = document.getElementById(fragmentId);
  return target?.id === fragmentId &&
    target.dataset.interfaceLocaleFragmentSafe === "true"
    ? fragment
    : "";
}

interface InterfaceLocationSnapshot {
  pathname: string;
  search: string;
  hash: string;
}

function readInterfaceLocationSnapshot(): InterfaceLocationSnapshot {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };
}

function isCurrentInterfaceLocation(snapshot: InterfaceLocationSnapshot) {
  return (
    window.location.pathname === snapshot.pathname &&
    window.location.search === snapshot.search &&
    window.location.hash === snapshot.hash
  );
}

function subscribeToBrowserLocation(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

function readBrowserSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function emptyBrowserSearch() {
  return "";
}

const INTERFACE_LOCALE_PREFERENCE_TIMEOUT_MS =
  INTERFACE_LOCALE_CHANGE_PHASE_TIMEOUT_MS;

class LocaleTransitionPhaseTimeoutError extends Error {
  constructor() {
    super("Locale transition phase timed out.");
  }
}

async function settleLocaleTransitionPhase(operation: Promise<void>) {
  let timeoutId: number | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new LocaleTransitionPhaseTimeoutError()),
          INTERFACE_LOCALE_CHANGE_PHASE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

async function postInterfaceLocalePreference(
  locale: PublicLocale,
  parentSignal?: AbortSignal,
) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    INTERFACE_LOCALE_PREFERENCE_TIMEOUT_MS,
  );
  try {
    return await fetch(INTERFACE_LOCALE_PREFERENCE_ENDPOINT, {
      method: "POST",
      mode: "same-origin",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

function createLocalePreferenceRollbackRecovery(
  preparation: PreparedInterfaceLocaleChange,
  originalLocale: PublicLocale,
): InterfaceLocaleChangeRecoveryHandle {
  let active = true;
  let recoveryInFlight: Promise<"resumed" | "retry-required"> | null = null;

  const resume = () => {
    if (!active) return Promise.resolve("resumed" as const);
    if (recoveryInFlight) return recoveryInFlight;

    recoveryInFlight = (async () => {
      try {
        const response = await postInterfaceLocalePreference(originalLocale);
        if (response.status !== 204 || response.redirected) {
          return "retry-required" as const;
        }
      } catch {
        return "retry-required" as const;
      }

      const result = await preparation.resume();
      if (result === "resumed") active = false;
      return result;
    })().finally(() => {
      recoveryInFlight = null;
    });
    return recoveryInFlight;
  };

  return {
    isActive: () => active && preparation.isActive(),
    participantIds: () => preparation.participantIds(),
    resume,
  };
}

const DOCUMENT_REPLACEMENT_FALLBACK_MS =
  INTERFACE_LOCALE_CHANGE_PHASE_TIMEOUT_MS;

type NoReferrerDocumentReplacementInput = {
  preparation: PreparedInterfaceLocaleChange;
  onCanceled(): void | Promise<void>;
} & ({ mode: "navigate"; target: string } | { mode: "reload" });

function beginNoReferrerDocumentReplacement(
  input: NoReferrerDocumentReplacementInput,
) {
  const { preparation, onCanceled } = input;
  let settled = false;
  const restoreReferrerPolicy =
    input.mode === "reload"
      ? installTemporaryNoReferrerPolicy()
      : () => undefined;
  const cleanup = () => {
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    window.clearTimeout(timeoutId);
  };
  const recover = (stopOutstandingNavigation: boolean) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (stopOutstandingNavigation) window.stop();
    restoreReferrerPolicy();
    void onCanceled();
  };
  const onPageHide = (event: PageTransitionEvent) => {
    if (event.persisted) return;
    settled = true;
    cleanup();
    preparation.keepFrozenForDocumentReplacement();
  };
  const onPageShow = () => recover(false);

  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  const timeoutId = window.setTimeout(
    () => recover(true),
    DOCUMENT_REPLACEMENT_FALLBACK_MS,
  );

  try {
    if (input.mode === "reload") {
      window.location.reload();
    } else {
      const anchor = document.createElement("a");
      anchor.href = input.target;
      anchor.rel = "noreferrer";
      anchor.referrerPolicy = "no-referrer";
      anchor.target = "_self";
      anchor.hidden = true;
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
    }
  } catch {
    recover(true);
    return true;
  }
  return true;
}

function installTemporaryNoReferrerPolicy() {
  const existing = document.querySelector<HTMLMetaElement>(
    'meta[name="referrer"]',
  );
  if (existing) {
    const previousContent = existing.content;
    existing.content = "no-referrer";
    return () => {
      existing.content = previousContent;
    };
  }

  const meta = document.createElement("meta");
  meta.name = "referrer";
  meta.content = "no-referrer";
  document.head.append(meta);
  return () => meta.remove();
}

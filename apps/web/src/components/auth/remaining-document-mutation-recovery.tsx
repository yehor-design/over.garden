"use client";

import { useEffect } from "react";

import {
  DOCUMENT_MUTATION_GENERATION_FORM_FIELD,
  type DocumentMutationAdmissionTransportResultV1,
} from "@/lib/auth/document-mutation-generation-transport";

const REMAINING_ROUTE_FORM_PATHS = new Set([
  "/api/engagement/bookmarks",
  "/api/engagement/comments",
  "/api/engagement/comments/block",
  "/api/engagement/comments/delete",
  "/api/engagement/comments/report",
  "/api/engagement/follows",
  "/api/notifications/preferences",
  "/api/notifications/receipts",
]);

const MANAGED_FORM_ATTRIBUTE = "data-document-mutation-managed";
const PREFLIGHTED_TRANSPORT = new WeakMap<HTMLFormElement, string>();
const PENDING_FORMS = new WeakSet<HTMLFormElement>();

export interface RemainingDocumentMutationTransportBoundaryProps {
  transport: string | null;
  handleTransportResult: (
    result: DocumentMutationAdmissionTransportResultV1,
  ) => void;
  confirmOwnerContinuity: (
    sourceTransport: string,
    signal: AbortSignal,
  ) => Promise<DocumentMutationAdmissionTransportResultV1>;
}

/**
 * Bridges progressively enhanced native/Server Action forms to the one
 * document-bound transport. The server still performs the authoritative
 * admission immediately before each effect; this preflight only keeps a stale
 * form on screen so the shared recovery UI can preserve the user's intent.
 */
export function RemainingDocumentMutationTransportBoundary({
  transport,
  handleTransportResult,
  confirmOwnerContinuity,
}: RemainingDocumentMutationTransportBoundaryProps) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const controller = new AbortController();
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (
        !(form instanceof HTMLFormElement) ||
        !isRemainingDocumentMutationForm(form)
      ) {
        return;
      }

      if (transport && PREFLIGHTED_TRANSPORT.get(form) === transport) {
        PREFLIGHTED_TRANSPORT.delete(form);
        setDocumentMutationGenerationField(form, transport);
        return;
      }

      event.preventDefault();
      if (PENDING_FORMS.has(form)) return;
      if (!transport) {
        handleTransportResult("DOCUMENT_PROTOCOL_REFRESH_REQUIRED");
        return;
      }

      PENDING_FORMS.add(form);
      const submitter = event.submitter;
      void confirmOwnerContinuity(transport, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result !== "MATCH") {
            handleTransportResult(result);
            return;
          }

          setDocumentMutationGenerationField(form, transport);
          PREFLIGHTED_TRANSPORT.set(form, transport);
          if (
            submitter instanceof HTMLButtonElement ||
            submitter instanceof HTMLInputElement
          ) {
            form.requestSubmit(submitter);
          } else {
            form.requestSubmit();
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            handleTransportResult("MUTATION_ADMISSION_UNAVAILABLE");
          }
        })
        .finally(() => PENDING_FORMS.delete(form));
    };

    document.addEventListener("submit", onSubmit, true);
    return () => {
      controller.abort();
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [confirmOwnerContinuity, handleTransportResult, transport]);

  return null;
}

export function isRemainingDocumentMutationForm(
  form: HTMLFormElement,
): boolean {
  if (
    form.method.toUpperCase() === "GET" ||
    form.getAttribute(MANAGED_FORM_ATTRIBUTE) === "true"
  ) {
    return false;
  }

  const action = new URL(form.action, window.location.href);
  if (action.origin !== window.location.origin) return false;
  if (REMAINING_ROUTE_FORM_PATHS.has(action.pathname)) return true;

  return [...form.elements].some(
    (element) =>
      element instanceof HTMLInputElement &&
      element.name.startsWith("$ACTION_"),
  );
}

export function setDocumentMutationGenerationField(
  form: HTMLFormElement,
  transport: string,
): void {
  const current = form.elements.namedItem(
    DOCUMENT_MUTATION_GENERATION_FORM_FIELD,
  );
  const field =
    current instanceof HTMLInputElement
      ? current
      : Object.assign(document.createElement("input"), {
          type: "hidden",
          name: DOCUMENT_MUTATION_GENERATION_FORM_FIELD,
        });
  field.value = transport;
  if (!field.isConnected) form.append(field);
}

"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { DocumentMutationActionForm } from "@/components/auth/document-mutation-recovery";
import { useFormStatus } from "react-dom";

import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOperatorCurationCopy } from "@/lib/operator-curation-copy";

interface FuzzyDuplicateRefreshFormProps {
  locale: InterfaceLocale;
  refreshAction: (formData: FormData) => Promise<unknown>;
}

export function FuzzyDuplicateRefreshForm({
  locale,
  refreshAction,
}: FuzzyDuplicateRefreshFormProps) {
  const [queued, setQueued] = useState(false);

  async function queueRefresh(formData: FormData) {
    const result = await refreshAction(formData);
    if (
      !result ||
      typeof result !== "object" ||
      !("documentMutationAdmission" in result)
    ) {
      setQueued(true);
    }
    return result;
  }

  return (
    <DocumentMutationActionForm action={queueRefresh}>
      <FuzzyDuplicateRefreshButton locale={locale} queued={queued} />
    </DocumentMutationActionForm>
  );
}

function FuzzyDuplicateRefreshButton({
  locale,
  queued,
}: {
  locale: InterfaceLocale;
  queued: boolean;
}) {
  const { pending } = useFormStatus();
  const copy = getOperatorCurationCopy(locale);

  return (
    <button
      type="submit"
      disabled={pending || queued}
      className={buttonVariants({ variant: "outline" })}
    >
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending
        ? copy.common.queueing
        : queued
          ? copy.common.refreshQueued
          : copy.entity.refresh}
    </button>
  );
}

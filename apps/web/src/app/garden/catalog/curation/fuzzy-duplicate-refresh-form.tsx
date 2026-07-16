"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOperatorCurationCopy } from "@/lib/operator-curation-copy";

interface FuzzyDuplicateRefreshFormProps {
  locale: InterfaceLocale;
  refreshAction: () => Promise<void>;
}

export function FuzzyDuplicateRefreshForm({
  locale,
  refreshAction,
}: FuzzyDuplicateRefreshFormProps) {
  const [queued, setQueued] = useState(false);

  async function queueRefresh() {
    await refreshAction();
    setQueued(true);
  }

  return (
    <form action={queueRefresh}>
      <FuzzyDuplicateRefreshButton locale={locale} queued={queued} />
    </form>
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

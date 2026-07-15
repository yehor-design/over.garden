"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";

import { buttonVariants } from "@/components/ui/button";

interface FuzzyDuplicateRefreshFormProps {
  refreshAction: () => Promise<void>;
}

export function FuzzyDuplicateRefreshForm({
  refreshAction,
}: FuzzyDuplicateRefreshFormProps) {
  const [queued, setQueued] = useState(false);

  async function queueRefresh() {
    await refreshAction();
    setQueued(true);
  }

  return (
    <form action={queueRefresh}>
      <FuzzyDuplicateRefreshButton queued={queued} />
    </form>
  );
}

function FuzzyDuplicateRefreshButton({ queued }: { queued: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || queued}
      className={buttonVariants({ variant: "outline" })}
    >
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Queueing..." : queued ? "Refresh queued" : "Refresh fuzzy QA"}
    </button>
  );
}

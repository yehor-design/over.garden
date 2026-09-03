"use client";

import { WorkspaceErrorPanel } from "@/components/garden/workspace-error-boundary";

export default function WorkspaceSurfaceError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <WorkspaceErrorPanel
      error={error}
      retry={unstable_retry}
      surface="erasure-requests"
    />
  );
}

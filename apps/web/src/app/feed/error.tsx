"use client";

import { SocialSurfaceError } from "@/components/social/social-surface-state";

export default function ErrorBoundary(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SocialSurfaceError surface="feed" {...props} />;
}

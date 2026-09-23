"use client";

import { useState, useSyncExternalStore } from "react";

import { ShareNetworkIcon as Share } from "@/components/icons/ShareNetwork";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ShareStatus = "idle" | "copied" | "failed";

const noSubscription = () => () => undefined;

/**
 * Share an entry by its one address (`OVE-493`, criterion 2).
 *
 * The device's own share sheet when the browser has one; otherwise the link
 * is copied, and the reader is told so in a polite status. A copy that fails
 * says so too and shows the address, selected, for the reader to copy by
 * hand. `url` is the canonical permalink the route builds — never the address
 * in the bar, which can carry a return path, a cursor or a sign-in intent.
 *
 * Sharing needs a script, so the button exists only once the page is
 * interactive: a reader without one has the address bar, and a button that
 * did nothing would be worse than none.
 */
export function ShareControl({
  url,
  title,
  labels,
}: {
  url: string;
  title: string;
  labels: { share: string; copied: string; failed: string; address: string };
}) {
  const interactive = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [status, setStatus] = useState<ShareStatus>("idle");

  if (!interactive) return null;

  async function share() {
    setStatus("idle");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // The reader closed the sheet: nothing happened, and nothing is said.
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        // Any other refusal falls through to copying the link.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div data-share-control="true" className="flex flex-col gap-1">
      <button
        type="button"
        onClick={share}
        className={buttonVariants({
          variant: "secondary",
          className: "self-start",
        })}
      >
        <Share className="size-4" aria-hidden="true" />
        {labels.share}
      </button>
      <p
        role="status"
        aria-live="polite"
        data-share-status={status}
        className="text-caption text-text-muted"
      >
        {status === "copied"
          ? labels.copied
          : status === "failed"
            ? labels.failed
            : null}
      </p>
      {status === "failed" ? (
        <Input
          readOnly
          value={url}
          aria-label={labels.address}
          onFocus={(event) => event.currentTarget.select()}
          className="max-w-sm"
        />
      ) : null}
    </div>
  );
}

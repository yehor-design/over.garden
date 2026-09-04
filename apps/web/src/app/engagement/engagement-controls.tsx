"use client";

import {
  Bookmark,
  Heart,
  MessageCircle,
  Reply,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useOptimistic, useState, type ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { formatPublicCount } from "@/lib/public-surface-localization";
import type {
  EngagementActionFailure,
  EngagementActionResult,
  EngagementCommentActionResult,
  EngagementLikeActionResult,
} from "./engagement-actions";

/**
 * The interactive half of the public engagement panel.
 *
 * These are `<form action={serverAction}>`, so with JavaScript switched off the
 * browser posts the form and the page re-renders — the same progressive
 * enhancement the old route handlers gave. With JavaScript the control answers
 * on the click: `useOptimistic` flips the button and moves the count before the
 * round trip, and no navigation happens at all.
 *
 * What this replaces: a POST to `/api/engagement/*` that answered a 303 back to
 * the page with `?engagement=liked` in the address. Every like cost a full
 * document navigation, and the status had to travel as a query parameter that
 * the route policy then had to sanitize through a closed allow-list.
 */

interface LikeState {
  liked: boolean;
  count: number;
}
export function EngagementLikeControl({
  targetKind,
  targetRef,
  initialLiked,
  initialCount,
  locale,
  labels,
  toggle,
}: {
  targetKind: string;
  targetRef: string;
  initialLiked: boolean;
  initialCount: number;
  locale: InterfaceLocale;
  labels: {
    like: string;
    liked: string;
    unavailable: string;
    rateLimited: string;
  };
  toggle: (input: {
    targetKind: string;
    targetRef: string;
  }) => Promise<EngagementLikeActionResult>;
}) {
  const [confirmed, setConfirmed] = useState<LikeState>({
    liked: initialLiked,
    count: initialCount,
  });
  const [failure, setFailure] = useState<EngagementActionFailure | null>(null);
  const [state, applyOptimistic] = useOptimistic(
    confirmed,
    (current: LikeState): LikeState => ({
      liked: !current.liked,
      count: Math.max(0, current.count + (current.liked ? -1 : 1)),
    }),
  );

  async function submit() {
    applyOptimistic(undefined);
    setFailure(null);
    const result = await toggle({ targetKind, targetRef });
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    setConfirmed({ liked: result.liked, count: result.activeLikeCount });
  }

  return (
    <div className="flex flex-col gap-1">
      <form action={submit}>
        <button
          type="submit"
          aria-pressed={state.liked}
          className={buttonVariants({
            variant: state.liked ? "default" : "outline",
            className: "self-start",
          })}
        >
          <Heart
            className="size-4"
            aria-hidden="true"
            fill={state.liked ? "currentColor" : "none"}
          />
          {state.liked ? labels.liked : labels.like}
        </button>
      </form>
      <p className="text-sm text-muted-foreground" role="status">
        {formatPublicCount(locale, "like", state.count)}
      </p>
      <ActionFailure
        failure={failure}
        labels={{
          unavailable: labels.unavailable,
          rateLimited: labels.rateLimited,
        }}
      />
    </div>
  );
}

interface ToggleLabels {
  inactive: string;
  active: string;
  unavailable: string;
  rateLimited: string;
  signInRequired: string;
}

export function EngagementBookmarkControl({
  targetKind,
  targetRef,
  initialActive,
  labels,
  submit,
}: {
  targetKind: string;
  targetRef: string;
  initialActive: boolean;
  labels: ToggleLabels;
  submit: (input: {
    targetKind: string;
    targetRef: string;
    bookmarked: boolean;
  }) => Promise<EngagementActionResult>;
}) {
  return (
    <ToggleControl
      initialActive={initialActive}
      labels={labels}
      icon={() => <Bookmark className="size-4" aria-hidden="true" />}
      run={(active) => submit({ targetKind, targetRef, bookmarked: active })}
    />
  );
}

export function EngagementFollowToggleControl({
  targetKind,
  targetRef,
  initialActive,
  autoFocus = false,
  labels,
  submit,
}: {
  targetKind: string;
  targetRef: string;
  initialActive: boolean;
  /** Focused when the reader has just returned from signing in to follow. */
  autoFocus?: boolean;
  labels: ToggleLabels;
  submit: (input: {
    targetKind: string;
    targetRef: string;
    following: boolean;
  }) => Promise<EngagementActionResult>;
}) {
  return (
    <ToggleControl
      initialActive={initialActive}
      autoFocus={autoFocus}
      controlId={autoFocus ? "lineage-follow" : undefined}
      labels={labels}
      icon={(active) =>
        active ? (
          <UserMinus className="size-4" aria-hidden="true" />
        ) : (
          <UserPlus className="size-4" aria-hidden="true" />
        )
      }
      run={(active) => submit({ targetKind, targetRef, following: active })}
    />
  );
}

/**
 * The shared body of the two toggles. `run` receives the *confirmed* state, not
 * the optimistic one: the server is told what the reader is undoing, so a
 * double click cannot turn into two inserts.
 */
function ToggleControl({
  initialActive,
  autoFocus = false,
  controlId,
  labels,
  icon,
  run,
}: {
  initialActive: boolean;
  autoFocus?: boolean;
  controlId?: string;
  labels: ToggleLabels;
  icon: (active: boolean) => ReactNode;
  run: (confirmedActive: boolean) => Promise<EngagementActionResult>;
}) {
  const [confirmed, setConfirmed] = useState(initialActive);
  const [failure, setFailure] = useState<EngagementActionFailure | null>(null);
  const [active, applyOptimistic] = useOptimistic(
    confirmed,
    (current: boolean) => !current,
  );

  async function submit() {
    applyOptimistic(undefined);
    setFailure(null);
    const result = await run(confirmed);
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    setConfirmed(result.active);
  }

  return (
    <div className="flex flex-col gap-1">
      <form action={submit}>
        <button
          id={controlId}
          type="submit"
          autoFocus={autoFocus}
          aria-pressed={active}
          className={buttonVariants({
            variant: "outline",
            className: "self-start",
          })}
        >
          {icon(active)}
          {active ? labels.active : labels.inactive}
        </button>
      </form>
      <ActionFailure failure={failure} labels={labels} />
    </div>
  );
}

/**
 * A failure is text beside the control, never a thrown exception and never a
 * navigation. The reader keeps their place and can try again (ADR-0023).
 */
function ActionFailure({
  failure,
  labels,
}: {
  failure: EngagementActionFailure | null;
  labels: {
    unavailable: string;
    rateLimited: string;
    signInRequired?: string;
  };
}) {
  if (!failure) return null;
  const text =
    failure === "rate_limited"
      ? labels.rateLimited
      : failure === "sign_in_required"
        ? (labels.signInRequired ?? labels.unavailable)
        : labels.unavailable;

  return (
    <p className="text-sm text-destructive" role="status" aria-live="polite">
      {text}
    </p>
  );
}

/**
 * The comment composer. Posts through a Server Action, clears itself on
 * success, and keeps the text on screen when the action refuses — the reader
 * never loses what they wrote to a failure they did not cause.
 */
export function EngagementCommentForm({
  targetKind,
  targetRef,
  parentCommentId,
  clientMutationId,
  autoFocus = false,
  fieldId,
  controlRef,
  compact = false,
  labels,
  submit,
}: {
  targetKind: string;
  targetRef: string;
  parentCommentId?: string | null;
  clientMutationId: string;
  autoFocus?: boolean;
  fieldId?: string;
  controlRef?: string;
  compact?: boolean;
  labels: {
    field: string;
    action: string;
    unavailable: string;
    rateLimited: string;
    signInRequired: string;
  };
  submit: (input: {
    targetKind: string;
    targetRef: string;
    body: string;
    clientMutationId: string;
    parentCommentId?: string | null;
  }) => Promise<EngagementCommentActionResult>;
}) {
  const [body, setBody] = useState("");
  const [failure, setFailure] = useState<EngagementActionFailure | null>(null);

  async function run() {
    setFailure(null);
    const result = await submit({
      targetKind,
      targetRef,
      body,
      clientMutationId,
      parentCommentId: parentCommentId ?? null,
    });
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    setBody("");
  }

  return (
    <form action={run} className={compact ? "grid gap-2" : "grid gap-3"}>
      <label className="grid gap-2 text-sm font-medium text-foreground">
        {labels.field}
        <textarea
          id={fieldId}
          data-auth-intent-control="comment"
          data-auth-intent-control-ref={controlRef}
          autoFocus={autoFocus}
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={600}
          rows={compact ? 2 : 3}
          className={`${compact ? "min-h-16" : "min-h-24"} rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground shadow-sm transition-colors outline-none placeholder:text-muted-foreground focus:border-primary`}
        />
      </label>
      <button
        type="submit"
        className={buttonVariants({
          variant: compact ? "outline" : "default",
          size: compact ? "sm" : "default",
          className: "self-start",
        })}
      >
        {compact ? (
          <Reply className="size-4" aria-hidden="true" />
        ) : (
          <MessageCircle className="size-4" aria-hidden="true" />
        )}
        {labels.action}
      </button>
      <ActionFailure failure={failure} labels={labels} />
    </form>
  );
}

/**
 * One moderation control on a comment — delete, report, block. Each is its own
 * form so a failure lands next to the control the reader pressed.
 */
export function EngagementCommentActionButton({
  label,
  icon,
  variant = "ghost",
  children,
  labels,
  run,
}: {
  label: string;
  icon: ReactNode;
  variant?: "ghost" | "outline";
  children?: ReactNode;
  labels: {
    unavailable: string;
    rateLimited: string;
    signInRequired: string;
  };
  run: (formData: FormData) => Promise<EngagementCommentActionResult>;
}) {
  const [failure, setFailure] = useState<EngagementActionFailure | null>(null);
  const [done, setDone] = useState(false);

  async function submit(formData: FormData) {
    setFailure(null);
    const result = await run(formData);
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    setDone(true);
  }

  return (
    <form action={submit} className="grid gap-2">
      {children}
      <button
        type="submit"
        disabled={done}
        className={buttonVariants({ variant, size: "sm" })}
      >
        {icon}
        {label}
      </button>
      <ActionFailure failure={failure} labels={labels} />
    </form>
  );
}

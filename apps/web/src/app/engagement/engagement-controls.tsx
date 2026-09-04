"use client";

import {
  Bookmark,
  Heart,
  MessageCircle,
  Reply,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { formatPublicCount } from "@/lib/public-surface-localization";
import type {
  EngagementActionFailure,
  EngagementCommentState,
  EngagementLikeState,
  EngagementToggleState,
} from "./engagement-actions";

/**
 * The interactive half of the public engagement panel.
 *
 * Every control here is `<form action={formAction}>` where `formAction` comes
 * from `useActionState` over a **Server Action**. That is the one shape React
 * gives a real endpoint to, so the browser can post the form with no JavaScript
 * running at all.
 *
 * This is not a detail. The first version wrapped the action in an ordinary
 * client function, and React rendered
 * `action="javascript:throw new Error('React form unexpectedly submitted.')"` —
 * a placeholder it only replaces on hydration. That form has no endpoint until
 * the client bundle runs, so the claim that it still posted without JavaScript
 * was simply false, and any browser that had not finished hydrating pressed a
 * button that did nothing.
 *
 * The rule the episode leaves behind: a control on a public page may not depend
 * on hydration to do its job. Hydration may only make it faster.
 *
 * Instant feedback therefore comes from `useFormStatus`, which a child of the
 * form can read while the action is in flight, rather than from an optimistic
 * update injected into a client closure.
 */

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
  toggle: (
    previous: EngagementLikeState,
    formData: FormData,
  ) => Promise<EngagementLikeState>;
}) {
  const [state, formAction] = useActionState(toggle, {
    liked: initialLiked,
    activeLikeCount: initialCount,
    failure: null,
  });

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <TargetFields targetKind={targetKind} targetRef={targetRef} />
      <LikeButton state={state} locale={locale} labels={labels} />
      <ActionFailure
        failure={state.failure}
        labels={{
          unavailable: labels.unavailable,
          rateLimited: labels.rateLimited,
        }}
      />
    </form>
  );
}

/**
 * Inside the form, so `useFormStatus` can see it. While the action is in flight
 * the button already shows the state it is about to have — the reader gets an
 * answer on the press, and the server still decides the truth.
 */
function LikeButton({
  state,
  locale,
  labels,
}: {
  state: EngagementLikeState;
  locale: InterfaceLocale;
  labels: { like: string; liked: string };
}) {
  const { pending } = useFormStatus();
  const liked = pending ? !state.liked : state.liked;
  const count = pending
    ? Math.max(0, state.activeLikeCount + (state.liked ? -1 : 1))
    : state.activeLikeCount;

  return (
    <>
      <button
        type="submit"
        aria-pressed={liked}
        className={buttonVariants({
          variant: liked ? "default" : "outline",
          className: "self-start",
        })}
      >
        <Heart
          className="size-4"
          aria-hidden="true"
          fill={liked ? "currentColor" : "none"}
        />
        {liked ? labels.liked : labels.like}
      </button>
      <p className="text-sm text-muted-foreground" role="status">
        {formatPublicCount(locale, "like", count)}
      </p>
    </>
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
  submit: (
    previous: EngagementToggleState,
    formData: FormData,
  ) => Promise<EngagementToggleState>;
}) {
  return (
    <ToggleControl
      targetKind={targetKind}
      targetRef={targetRef}
      initialActive={initialActive}
      labels={labels}
      icon={() => <Bookmark className="size-4" aria-hidden="true" />}
      submit={submit}
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
  submit: (
    previous: EngagementToggleState,
    formData: FormData,
  ) => Promise<EngagementToggleState>;
}) {
  return (
    <ToggleControl
      targetKind={targetKind}
      targetRef={targetRef}
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
      submit={submit}
    />
  );
}

function ToggleControl({
  targetKind,
  targetRef,
  initialActive,
  autoFocus = false,
  controlId,
  labels,
  icon,
  submit,
}: {
  targetKind: string;
  targetRef: string;
  initialActive: boolean;
  autoFocus?: boolean;
  controlId?: string;
  labels: ToggleLabels;
  icon: (active: boolean) => ReactNode;
  submit: (
    previous: EngagementToggleState,
    formData: FormData,
  ) => Promise<EngagementToggleState>;
}) {
  const [state, formAction] = useActionState(submit, {
    active: initialActive,
    failure: null,
  });

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <TargetFields targetKind={targetKind} targetRef={targetRef} />
      <ToggleButton
        active={state.active}
        autoFocus={autoFocus}
        controlId={controlId}
        labels={labels}
        icon={icon}
      />
      <ActionFailure failure={state.failure} labels={labels} />
    </form>
  );
}

function ToggleButton({
  active,
  autoFocus,
  controlId,
  labels,
  icon,
}: {
  active: boolean;
  autoFocus: boolean;
  controlId?: string;
  labels: ToggleLabels;
  icon: (active: boolean) => ReactNode;
}) {
  const { pending } = useFormStatus();
  const shown = pending ? !active : active;

  return (
    <button
      id={controlId}
      type="submit"
      autoFocus={autoFocus}
      aria-pressed={shown}
      className={buttonVariants({
        variant: "outline",
        className: "self-start",
      })}
    >
      {icon(shown)}
      {shown ? labels.active : labels.inactive}
    </button>
  );
}

/**
 * The comment composer. Posts through a Server Action, so it works without
 * JavaScript; with JavaScript it clears itself once the action reports the
 * comment landed, and keeps the text on screen when the action refuses.
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
  submit: (
    previous: EngagementCommentState,
    formData: FormData,
  ) => Promise<EngagementCommentState>;
}) {
  const [state, formAction] = useActionState(submit, {
    submitted: false,
    failure: null,
  });

  return (
    <form
      action={formAction}
      className={compact ? "grid gap-2" : "grid gap-3"}
      key={state.submitted ? "sent" : "draft"}
    >
      <TargetFields targetKind={targetKind} targetRef={targetRef} />
      <input type="hidden" name="clientMutationId" value={clientMutationId} />
      {parentCommentId ? (
        <input type="hidden" name="parentCommentId" value={parentCommentId} />
      ) : null}
      <label className="grid gap-2 text-sm font-medium text-foreground">
        {labels.field}
        <textarea
          id={fieldId}
          data-auth-intent-control="comment"
          data-auth-intent-control-ref={controlRef}
          autoFocus={autoFocus}
          name="body"
          defaultValue=""
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
      <ActionFailure failure={state.failure} labels={labels} />
    </form>
  );
}

/**
 * One moderation control on a comment — delete, report, block. Each is its own
 * form so a failure lands next to the control the reader pressed.
 */
export function EngagementCommentActionButton({
  targetKind,
  targetRef,
  commentId,
  label,
  icon,
  variant = "ghost",
  children,
  labels,
  submit,
}: {
  targetKind: string;
  targetRef: string;
  commentId: string;
  label: string;
  icon: ReactNode;
  variant?: "ghost" | "outline";
  children?: ReactNode;
  labels: {
    unavailable: string;
    rateLimited: string;
    signInRequired: string;
  };
  submit: (
    previous: EngagementCommentState,
    formData: FormData,
  ) => Promise<EngagementCommentState>;
}) {
  const [state, formAction] = useActionState(submit, {
    submitted: false,
    failure: null,
  });

  return (
    <form action={formAction} className="grid gap-2">
      <TargetFields targetKind={targetKind} targetRef={targetRef} />
      <input type="hidden" name="commentId" value={commentId} />
      {children}
      <button
        type="submit"
        disabled={state.submitted}
        className={buttonVariants({ variant, size: "sm" })}
      >
        {icon}
        {label}
      </button>
      <ActionFailure failure={state.failure} labels={labels} />
    </form>
  );
}

/**
 * The target, carried in the form rather than in a closure. A browser with no
 * JavaScript has no other channel, and the action normalizes both fields before
 * either reaches a query.
 */
function TargetFields({
  targetKind,
  targetRef,
}: {
  targetKind: string;
  targetRef: string;
}) {
  return (
    <>
      <input type="hidden" name="targetKind" value={targetKind} />
      <input type="hidden" name="targetRef" value={targetRef} />
    </>
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

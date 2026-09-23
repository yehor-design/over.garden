"use client";

import { BookmarkSimpleIcon as Bookmark } from "@/components/icons/BookmarkSimple";
import { HeartIcon as Heart } from "@/components/icons/Heart";
import { ChatCircleIcon as MessageCircle } from "@/components/icons/ChatCircle";
import { ArrowBendUpLeftIcon as Reply } from "@/components/icons/ArrowBendUpLeft";
import { UserMinusIcon as UserMinus } from "@/components/icons/UserMinus";
import { UserPlusIcon as UserPlus } from "@/components/icons/UserPlus";
import {
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useFormStatus } from "react-dom";

import { TransportBoundary } from "@/components/transport-boundary";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { formatPublicCount } from "@/lib/public-surface-localization";
import type {
  EngagementActionFailure,
  EngagementCommentState,
  EngagementLikeState,
  EngagementToggleState,
} from "./engagement-actions";
import { HiddenField } from "@/components/ui/hidden-field";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

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

type LikeControlProps = {
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
};

export function EngagementLikeControl(props: LikeControlProps) {
  // What the server last said, kept above the boundary, so a control that
  // lost its request comes back showing the truth rather than the optimistic
  // guess (`OVE-493`, criterion 4).
  const [known, setKnown] = useState({
    liked: props.initialLiked,
    activeLikeCount: props.initialCount,
  });
  return (
    <TransportBoundary
      render={(failures) => (
        <LikeForm
          {...props}
          initialLiked={known.liked}
          initialCount={known.activeLikeCount}
          transportFailed={failures > 0}
          onSettled={setKnown}
        />
      )}
    />
  );
}

function LikeForm({
  targetKind,
  targetRef,
  initialLiked,
  initialCount,
  locale,
  labels,
  toggle,
  transportFailed,
  onSettled,
}: LikeControlProps & {
  transportFailed: boolean;
  onSettled: (known: { liked: boolean; activeLikeCount: number }) => void;
}) {
  const [state, formAction] = useActionState(toggle, {
    liked: initialLiked,
    activeLikeCount: initialCount,
    failure: null,
  });
  const [initialState] = useState(state);
  useEffect(() => {
    if (state !== initialState && !state.failure) {
      onSettled({ liked: state.liked, activeLikeCount: state.activeLikeCount });
    }
  }, [initialState, onSettled, state]);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <TargetFields targetKind={targetKind} targetRef={targetRef} />
      <LikeButton state={state} locale={locale} labels={labels} />
      <ActionFailure
        failure={
          state.failure ??
          (transportFailed && state === initialState ? "unavailable" : null)
        }
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

  const counted = formatPublicCount(locale, "like", count);

  return (
    <>
      {/* The accessible name states the action **and** the count — "Подобається,
          12 вподобань" becoming "Уже подобається, 13 вподобань" (DESIGN.md
          §5.6). That is what a screen-reader user hears *before* pressing;
          what they hear after is the polite region in `EngagementBar`, which
          is why the count is not `aria-live` here as well. The visible label
          stays the verb alone, because the number is beside it on screen. */}
      <button
        type="submit"
        aria-pressed={liked}
        aria-busy={pending || undefined}
        onClick={refuseWhilePending(pending)}
        aria-label={`${liked ? labels.liked : labels.like}, ${counted}`}
        className={buttonVariants({
          variant: liked ? "primary" : "secondary",
          className: "self-start",
        })}
      >
        <Heart className="size-4" aria-hidden="true" selected={liked} />
        {liked ? labels.liked : labels.like}
      </button>
      {/* The count, visible and polite — and the only live region in the bar
          (DESIGN.md §5.6). It is the optimistic number: `useFormStatus` moves
          it on the press, so a reader hears the number they are about to have
          rather than the one the server last rendered. */}
      <p
        data-engagement-status="true"
        aria-live="polite"
        className="text-body-sm text-text-muted tabular-nums"
      >
        {counted}
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
  autoFocus = false,
  labels,
  submit,
}: {
  targetKind: string;
  targetRef: string;
  initialActive: boolean;
  /** Focused when the reader has just returned from signing in to save. */
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
      controlId={autoFocus ? "engagement-bookmark" : undefined}
      labels={labels}
      icon={(active) => (
        <Bookmark selected={active} className="size-4" aria-hidden="true" />
      )}
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

type ToggleControlProps = {
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
};

function ToggleControl(props: ToggleControlProps) {
  // As the like control: the server's last word survives a lost request.
  const [known, setKnown] = useState(props.initialActive);
  return (
    <TransportBoundary
      render={(failures) => (
        <ToggleForm
          {...props}
          initialActive={known}
          transportFailed={failures > 0}
          onSettled={setKnown}
        />
      )}
    />
  );
}

function ToggleForm({
  targetKind,
  targetRef,
  initialActive,
  autoFocus = false,
  controlId,
  labels,
  icon,
  submit,
  transportFailed,
  onSettled,
}: ToggleControlProps & {
  transportFailed: boolean;
  onSettled: (active: boolean) => void;
}) {
  const [state, formAction] = useActionState(submit, {
    active: initialActive,
    failure: null,
  });
  const [initialState] = useState(state);
  useEffect(() => {
    if (state !== initialState && !state.failure) onSettled(state.active);
  }, [initialState, onSettled, state]);

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
      <ActionFailure
        failure={
          state.failure ??
          (transportFailed && state === initialState ? "unavailable" : null)
        }
        labels={labels}
      />
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
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useFocusOnMount(buttonRef, autoFocus);

  return (
    <button
      ref={buttonRef}
      id={controlId}
      type="submit"
      autoFocus={autoFocus}
      aria-pressed={shown}
      aria-busy={pending || undefined}
      onClick={refuseWhilePending(pending)}
      className={buttonVariants({
        variant: "secondary",
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
 * JavaScript. With JavaScript it clears itself only when the server answered
 * that the comment landed; a refusal keeps every word on screen, beside the
 * reason (`OVE-493`, criterion 4).
 *
 * The words are the component's state rather than the field's own value
 * because React resets a form once its action answers — success or refusal
 * alike — and an uncontrolled field lost a refused comment to that reset. A
 * draft belongs to the answer it was typed after: a new "sent" empties it, a
 * new refusal leaves it.
 *
 * The button refuses a second press while the first is on its way, and says
 * so; the server's `clientMutationId` makes a second post a no-op besides.
 */
type CommentFormProps = {
  targetKind: string;
  targetRef: string;
  parentCommentId?: string | null;
  clientMutationId: string;
  autoFocus?: boolean;
  fieldId?: string;
  controlRef?: string;
  compact?: boolean;
  /** "Відповідь для Олени" — whom a reply answers, said before it is written. */
  replyTarget?: string;
  labels: {
    field: string;
    action: string;
    /** Said on the button while the comment is on its way. */
    sending?: string;
    unavailable: string;
    rateLimited: string;
    signInRequired: string;
  };
  submit: (
    previous: EngagementCommentState,
    formData: FormData,
  ) => Promise<EngagementCommentState>;
};

export function EngagementCommentForm(props: CommentFormProps) {
  // The words live above the boundary: a request that never reached the
  // server re-draws the form, and the words are still in it.
  const [text, setText] = useState("");
  return (
    <TransportBoundary
      render={(failures) => (
        <CommentForm
          {...props}
          text={text}
          onTextChange={setText}
          transportFailed={failures > 0}
        />
      )}
    />
  );
}

function CommentForm({
  targetKind,
  targetRef,
  parentCommentId,
  clientMutationId,
  autoFocus = false,
  fieldId,
  controlRef,
  compact = false,
  replyTarget,
  labels,
  submit,
  text,
  onTextChange,
  transportFailed,
}: CommentFormProps & {
  text: string;
  onTextChange: (text: string) => void;
  transportFailed: boolean;
}) {
  const [state, formAction] = useActionState(submit, {
    submitted: false,
    failure: null,
  });
  const [initialState] = useState(state);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  useFocusOnMount(fieldRef, autoFocus);

  // The server said the comment landed: the words are its now.
  useEffect(() => {
    if (state !== initialState && state.submitted && !state.failure) {
      onTextChange("");
    }
  }, [initialState, onTextChange, state]);

  // React resets the form in the same commit as the answer. When an answer
  // arrives — and only then, so typing after a success is never undone — put
  // the words back after a refusal, or leave the field empty after a success.
  const answered = useRef(state);
  useLayoutEffect(() => {
    if (answered.current === state) return;
    answered.current = state;
    const field = fieldRef.current;
    const shown = state.submitted && !state.failure ? "" : text;
    if (field && field.value !== shown) field.value = shown;
  }, [state, text]);

  return (
    <form
      action={formAction}
      data-comment-form={parentCommentId ? "reply" : "comment"}
      className={compact ? "grid gap-2" : "grid gap-3"}
    >
      <TargetFields targetKind={targetKind} targetRef={targetRef} />
      <HiddenField name="clientMutationId" value={clientMutationId} />
      {parentCommentId ? (
        <HiddenField name="parentCommentId" value={parentCommentId} />
      ) : null}
      <Field label={labels.field} description={replyTarget} id={fieldId}>
        <Textarea
          ref={fieldRef}
          data-auth-intent-control="comment"
          data-auth-intent-control-ref={controlRef}
          autoFocus={autoFocus}
          name="body"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          maxLength={600}
          rows={compact ? 2 : 3}
          className={compact ? "min-h-16" : "min-h-24"}
        />
      </Field>
      <CommentSubmitButton compact={compact} labels={labels} />
      <ActionFailure
        failure={
          state.failure ??
          (transportFailed && state === initialState ? "unavailable" : null)
        }
        labels={labels}
      />
    </form>
  );
}

function CommentSubmitButton({
  compact,
  labels,
}: {
  compact: boolean;
  labels: { action: string; sending?: string };
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-busy={pending || undefined}
      onClick={refuseWhilePending(pending)}
      data-comment-submit={pending ? "pending" : "ready"}
      className={buttonVariants({
        variant: compact ? "secondary" : "primary",
        size: compact ? "sm" : "md",
        className: "self-start",
      })}
    >
      {compact ? (
        <Reply className="size-4" aria-hidden="true" />
      ) : (
        <MessageCircle className="size-4" aria-hidden="true" />
      )}
      {pending && labels.sending ? labels.sending : labels.action}
    </button>
  );
}

/**
 * A press on a control whose last press is still on its way is not a second
 * request (`OVE-493`, criterion 4). The control stays focusable and says it is
 * busy; it is not `disabled`, which would take the keyboard's focus with it.
 */
function refuseWhilePending(pending: boolean) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) event.preventDefault();
  };
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
  variant?: "ghost" | "secondary";
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
      <HiddenField name="commentId" value={commentId} />
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
 * `autoFocus` on a server-rendered control is the browser's to honour, and a
 * browser does not honour it when the address has a fragment — which every
 * resumed action's address has (`#engagement-bookmark`, `#lineage-follow`,
 * `#comments`) — while React does not focus a node it only hydrates. So a
 * reader who signed in to save, follow or comment landed on the page with
 * nothing focused, and had to find the control again (`OVE-504`).
 */
function useFocusOnMount(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (enabled) ref.current?.focus();
  }, [enabled, ref]);
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
      <HiddenField name="targetKind" value={targetKind} />
      <HiddenField name="targetRef" value={targetRef} />
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

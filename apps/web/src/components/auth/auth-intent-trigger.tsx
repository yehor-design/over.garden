"use client";

import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import type {
  AuthIntentAction,
  AuthIntentTarget,
} from "@/lib/auth/auth-intent-contract";
import { cn } from "@/lib/utils";

interface AuthIntentTriggerProps {
  action: AuthIntentAction;
  returnTo: string;
  target?: AuthIntentTarget;
  control?: string;
  label: string;
  labelClassName?: string;
  icon?: ReactNode;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  formClassName?: string;
  autoFocus?: boolean;
  id?: string;
}

export function AuthIntentTrigger({
  action,
  returnTo,
  target,
  control,
  label,
  labelClassName,
  icon,
  variant = "default",
  size = "default",
  className,
  formClassName,
  autoFocus = false,
  id,
}: AuthIntentTriggerProps) {
  return (
    <form method="post" action="/auth/intent/start" className={formClassName}>
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {target ? (
        <>
          <input type="hidden" name="targetKind" value={target.kind} />
          <input type="hidden" name="targetRef" value={target.ref} />
        </>
      ) : null}
      {control ? <input type="hidden" name="control" value={control} /> : null}
      <button
        id={id}
        type="submit"
        autoFocus={autoFocus}
        data-auth-intent-control={action}
        data-auth-intent-control-ref={control}
        className={cn(buttonVariants({ variant, size }), className)}
      >
        {icon}
        <span className={labelClassName}>{label}</span>
      </button>
    </form>
  );
}

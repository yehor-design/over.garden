"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSignOut } from "./sign-out-provider";

export type SignOutControlPresentation = "profile" | "menu" | "utility";

export function SignOutControl({
  presentation = "menu",
  className,
  onBeforeRequest,
}: {
  presentation?: SignOutControlPresentation;
  className?: string;
  onBeforeRequest?: () => void;
}) {
  const { copy, phase, requestSignOut } = useSignOut();

  return (
    <Button
      type="button"
      variant={presentation === "menu" ? "ghost" : "outline"}
      data-sign-out-control={presentation}
      data-sign-out-phase={phase}
      className={cn(
        "justify-start",
        presentation === "profile" && "w-full",
        presentation === "menu" && "w-full",
        className,
      )}
      onClick={() => {
        onBeforeRequest?.();
        requestSignOut();
      }}
    >
      <LogOut data-icon="inline-start" aria-hidden="true" />
      <span>{copy.action}</span>
    </Button>
  );
}

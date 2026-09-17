"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field with a show/hide control (DESIGN.md §5.3).
 *
 * The control's **accessible name changes with its state** — "show password"
 * becomes "hide password" — rather than staying one label with `aria-pressed`
 * doing the talking: a name that never changes leaves a screen-reader user
 * pressing a button whose effect they cannot hear.
 *
 * It degrades to a plain password field before hydration, which is the right
 * way round: the field is what the reader needs and the toggle is what they
 * would like. `type` cannot be changed from CSS, so there is no scripts-off
 * version of the toggle and pretending otherwise would mean a control that
 * looks operable and is not.
 */
function PasswordInput({
  className,
  showLabel,
  hideLabel,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** Localised; a `ui/` component carries no locale of its own. */
  showLabel: string;
  hideLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = props.id ?? (props.name ? `field-${props.name}` : generatedId);

  return (
    <div data-slot="password-input" className="relative flex items-center">
      <Input
        {...props}
        id={id}
        type={visible ? "text" : "password"}
        className={cn("pr-12", className)}
      />
      <IconButton
        variant="ghost"
        size="sm"
        label={visible ? hideLabel : showLabel}
        aria-controls={id}
        onClick={() => setVisible((current) => !current)}
        className="absolute right-1"
      >
        {visible ? <EyeOff /> : <Eye />}
      </IconButton>
    </div>
  );
}

export { PasswordInput };

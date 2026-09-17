import { type VariantProps } from "class-variance-authority";

import { controlVariants } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A multi-line text control, on the same boundary and sizing as `Input`. */
type TextareaProps = React.ComponentProps<"textarea"> &
  VariantProps<typeof controlVariants>;

function Textarea({
  className,
  size = "md",
  rows = 4,
  ...props
}: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(controlVariants({ size }), "resize-y", className)}
      {...props}
    />
  );
}

export { Textarea };
export type { TextareaProps };

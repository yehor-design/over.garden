import NextLink from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Every in-product link. It renders a real `<a>` (DESIGN.md §4.2.4) through
 * `next/link`, so client navigation and prefetching keep working; an absolute
 * or `mailto:` href passes straight through as well.
 *
 * `inline` is a link inside prose: it is underlined at rest, because colour is
 * never the only signal (DESIGN.md §8). `quiet` is a link in a list, a card or
 * a rail, where the surrounding structure already says it is a link and an
 * underline on every row would be noise; it underlines on hover and focus.
 */
const linkVariants = cva(
  "rounded-sm underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
  {
    variants: {
      variant: {
        inline: "text-link underline hover:text-link-hover",
        quiet: "text-text hover:underline",
        muted: "text-text-muted hover:text-text hover:underline",
      },
    },
    defaultVariants: { variant: "inline" },
  },
);

type LinkProps = React.ComponentProps<typeof NextLink> &
  VariantProps<typeof linkVariants>;

function Link({ className, variant = "inline", ...props }: LinkProps) {
  return (
    <NextLink
      data-slot="link"
      className={cn(linkVariants({ variant }), className)}
      {...props}
    />
  );
}

type DocumentLinkProps = React.ComponentProps<"a"> &
  VariantProps<typeof linkVariants>;

/**
 * `Link`'s look on a plain `<a>`, which the browser follows as a document
 * navigation. It exists for the one destination the client router cannot be
 * trusted to reach: a listing's query view, which it may predict onto the
 * listing's static document (`public-query-twin.ts`). Anywhere else, `Link`.
 */
function DocumentLink({
  className,
  variant = "inline",
  ...props
}: DocumentLinkProps) {
  return (
    <a
      data-slot="link"
      className={cn(linkVariants({ variant }), className)}
      {...props}
    />
  );
}

export { DocumentLink, Link, linkVariants };
export type { DocumentLinkProps, LinkProps };

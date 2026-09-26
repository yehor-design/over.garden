import { FlagIcon as Flag } from "@/components/icons/Flag";
import { DocumentLink } from "@/components/ui/link";
import { reportHref } from "@/lib/moderation/report-contract";
import { cn } from "@/lib/utils";

/**
 * «Поскаржитися» (ADR-0038 D5, `OVE-526`): the way from any reportable public
 * page — an entry, a profile, an object passport, a tag page — to the report
 * form, for everyone, signed in or not. A plain link to a request-time page,
 * so it is in the static document's bytes and works without JavaScript; it
 * carries the page's own address, which the form looks up again.
 */
export function ReportContentLink({
  address,
  label,
  className,
}: {
  address: string;
  label: string;
  className?: string;
}) {
  return (
    <DocumentLink
      href={reportHref(address)}
      variant="muted"
      rel="nofollow"
      data-report-link="true"
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 text-caption",
        className,
      )}
    >
      <Flag aria-hidden="true" className="size-4" />
      {label}
    </DocumentLink>
  );
}

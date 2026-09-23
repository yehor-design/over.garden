import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@/components/icons/ArrowLeft";

import { WorkspaceShell } from "@/components/garden/workspace-state";
import { buttonVariants } from "@/components/ui/button";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { getOwnerLineageCopy } from "@/lib/owner-lineage-copy";
import { cn } from "@/lib/utils";

export const LINEAGE_QUESTIONS_PATH = "/garden/lineage/questions";
export const LINEAGE_CLAIMS_PATH = "/garden/lineage/claims";

/**
 * The lineage tasks, each its own page (`OVE-495`, criterion 7): questions
 * put to the reader, and claims that their object is another's source. The
 * two used to point at each other with two buttons named after the other
 * page; a row of tabs says which one this is.
 *
 * An invitation is not a tab. It is reached only from the link a gardener
 * sent, so its page stands alone rather than as an empty third tab.
 */
const LINEAGE_SECTIONS = [
  { key: "questions", href: LINEAGE_QUESTIONS_PATH },
  { key: "claims", href: LINEAGE_CLAIMS_PATH },
] as const;

type LineageSectionKey = (typeof LINEAGE_SECTIONS)[number]["key"];
export type LineageSurface = LineageSectionKey | "invitation";

const SURFACE = {
  questions: "lineage-questions",
  claims: "lineage-claims",
  invitation: "lineage-invitation-claim",
} as const;

export function LineageShell({
  locale,
  section,
  state,
  children,
}: {
  locale: InterfaceLocale;
  section: LineageSurface;
  state?: "loading";
  children: ReactNode;
}) {
  const copy = getOwnerLineageCopy(locale);
  const heading =
    section === "questions"
      ? copy.questions
      : section === "claims"
        ? copy.claims
        : copy.invitation;

  return (
    <WorkspaceShell
      surface={SURFACE[section]}
      locale={locale}
      state={state}
      width={section === "invitation" ? "narrow" : "wide"}
      title={heading.title}
      description={heading.description}
      navigation={
        <Link
          href="/garden"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <ArrowLeft aria-hidden="true" />
          {copy.nav.back}
        </Link>
      }
    >
      {section === "invitation" ? null : (
        <LineageSections locale={locale} current={section} />
      )}
      {children}
    </WorkspaceShell>
  );
}

function LineageSections({
  locale,
  current,
}: {
  locale: InterfaceLocale;
  current: LineageSectionKey;
}) {
  const copy = getOwnerLineageCopy(locale).nav;
  return (
    <nav aria-label={copy.label} data-lineage-sections="true">
      <ul className="flex list-none flex-wrap gap-1 border-b border-border">
        {LINEAGE_SECTIONS.map((section) => (
          <li key={section.key}>
            <Link
              href={section.href}
              aria-current={section.key === current ? "page" : undefined}
              className={cn(
                "-mb-px flex min-h-11 items-center border-b-2 px-3 text-body-sm font-medium",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
                section.key === current
                  ? "border-action text-text"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {copy[section.key]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

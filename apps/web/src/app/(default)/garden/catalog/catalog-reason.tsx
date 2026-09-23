import { catalogIdentifierSchemeName } from "@/lib/catalog/source-names";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  describeCurationReason,
  type OperatorCatalogCopy,
} from "@/lib/operator-catalog-copy";

/**
 * A reason code as the owner reads it (`OVE-506`, OG-UX-039): the rule in
 * words, and the code beneath it — the key the worker's log and the thresholds
 * table use, kept so the owner can still find the rule, never the headline.
 */
export function ReasonLine({
  locale,
  copy,
  code,
  showCode = true,
}: {
  locale: InterfaceLocale;
  copy: OperatorCatalogCopy;
  code: string;
  /**
   * Off in a table's narrow cell, where a forty-letter code broke into a
   * column of fragments; the detail pane and the precision table keep it.
   */
  showCode?: boolean;
}) {
  const reason = describeCurationReason(copy, code, (scheme) =>
    catalogIdentifierSchemeName(scheme, locale),
  );
  return (
    <span className="grid" data-catalog-reason={reason.code}>
      <span className="text-text">{reason.label}</span>
      {showCode ? (
        <code className="font-mono text-caption wrap-anywhere text-text-muted">
          {reason.code}
        </code>
      ) : null}
    </span>
  );
}

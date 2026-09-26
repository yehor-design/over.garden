import Link from "next/link";

import { NotePencilIcon } from "@/components/icons/NotePencil";
import { PawPrintIcon } from "@/components/icons/PawPrint";
import { PlantIcon } from "@/components/icons/Plant";
import { SquaresFourIcon } from "@/components/icons/SquaresFour";
import { buttonVariants } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import {
  formatLastEntry,
  gardenCollectionItemAnchor,
  gardenCollectionItemHref,
  type GardenCollectionItem,
} from "@/lib/garden/garden-collection";
import {
  formatGardenCollectionTemplate as template,
  getGardenCollectionCopy,
} from "@/lib/garden-collection-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";

/**
 * One owned thing: what it is, where it lives, when it was last written about,
 * and Write. Two tomatoes differ by their space in the line under the name, so
 * the row that is pressed is the tomato that is meant (FAST_ENTRY.md). A space's
 * own page leaves the space out of its rows (`showSpace`): every row there is in
 * it.
 */
export function GardenItemRow({
  item,
  locale,
  today,
  writeHref,
  showSpace = true,
}: {
  item: GardenCollectionItem;
  locale: InterfaceLocale;
  today: string;
  writeHref: string;
  showSpace?: boolean;
}) {
  const copy = getGardenCollectionCopy(locale);
  const Icon =
    item.kind === "space"
      ? SquaresFourIcon
      : item.objectKind === "animal"
        ? PawPrintIcon
        : PlantIcon;
  const detail =
    item.kind === "space"
      ? [
          copy.row.space,
          template(copy.row.objectsInSpace, { count: item.objectCount }),
        ]
      : // The order the destination picker uses: what, where, then the
        // organism as the secondary disambiguation (FAST_ENTRY.md).
        [
          item.objectKind === "animal" ? copy.row.animal : copy.row.plant,
          showSpace ? item.space.displayName : null,
          item.species,
        ].filter((part): part is string => Boolean(part));
  const [before, after] = copy.row.lastEntry.split("{when}");

  return (
    <ListRow
      id={gardenCollectionItemAnchor(item)}
      data-garden-collection-item={item.kind}
      className="scroll-mt-24 items-center"
      media={
        item.kind === "space" && item.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- the stored WebP's smallest variant (ADR-0022 D2)
          <img
            src={item.photo.src}
            srcSet={item.photo.srcSet ?? undefined}
            sizes="40px"
            alt=""
            data-garden-space-photo="true"
            className="size-10 rounded-lg bg-surface-sunken object-cover"
          />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-lg bg-surface-sunken text-text-muted">
            <Icon aria-hidden="true" className="size-5" />
          </span>
        )
      }
      title={<span className="break-words">{item.displayName}</span>}
      href={gardenCollectionItemHref(item)}
      description={detail.join(" · ")}
      meta={
        <span data-garden-last-entry={item.lastEntryDate ?? "never"}>
          {item.lastEntryDate ? (
            <>
              {before}
              <time dateTime={item.lastEntryDate}>
                {formatLastEntry(item.lastEntryDate, today, locale)}
              </time>
              {after}
            </>
          ) : (
            copy.row.never
          )}
        </span>
      }
      actions={
        <Link
          href={writeHref}
          aria-label={template(copy.row.writeLabel, {
            name: item.displayName,
          })}
          data-garden-write={item.id}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <NotePencilIcon aria-hidden="true" />
          {copy.row.write}
        </Link>
      }
    />
  );
}

/**
 * A portion of owned things as rows — the page's own portion and every
 * «Показати ще» portion after it (DESIGN.md §5.26). `writeHref` says where
 * each row's Write returns to.
 */
export function GardenItemRows({
  items,
  locale,
  today,
  writeHrefFor,
  showSpace = true,
}: {
  items: readonly GardenCollectionItem[];
  locale: InterfaceLocale;
  today: string;
  writeHrefFor: (item: GardenCollectionItem) => string;
  showSpace?: boolean;
}) {
  return items.map((item) => (
    <GardenItemRow
      key={item.id}
      item={item}
      locale={locale}
      today={today}
      showSpace={showSpace}
      writeHref={writeHrefFor(item)}
    />
  ));
}

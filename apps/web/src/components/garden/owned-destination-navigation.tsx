"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { OwnedDestinationPicker } from "./owned-destination-picker";
import {
  destinationJournalPath,
  type OwnedDestination,
} from "@/lib/garden/owned-destinations";
import type { InterfaceLocale } from "@/lib/interface-localization";
/** Transitional caller over existing journals; the global composer consumes the same picker. */
export function OwnedDestinationNavigation({
  locale,
}: {
  locale: InterfaceLocale;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<OwnedDestination | null>(null);
  return (
    <OwnedDestinationPicker
      locale={locale}
      selection={selection}
      onSelect={(value) => {
        setSelection(value);
        router.push(destinationJournalPath(value));
      }}
    />
  );
}

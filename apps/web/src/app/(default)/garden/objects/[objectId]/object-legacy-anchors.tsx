"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { legacyObjectAnchorLocation } from "@/lib/garden/object-pages";

/**
 * An old link to a block that now lives on the settings or provenance page
 * (`/garden/objects/{id}#passport-catalog`, `#passport-provenance`, …) lands
 * on that page and that block. Renders nothing.
 */
export function ObjectLegacyAnchors({ objectId }: { objectId: string }) {
  const router = useRouter();
  useEffect(() => {
    const location = legacyObjectAnchorLocation(objectId, window.location.hash);
    if (location) router.replace(location);
  }, [objectId, router]);
  return null;
}

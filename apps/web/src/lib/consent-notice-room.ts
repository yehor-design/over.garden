import { useEffect, type RefObject } from "react";

/**
 * The room the page keeps for a consent question at the bottom of the screen
 * (`OVE-505`; `globals.css`, "The bottom of the screen").
 *
 * A question is as tall as its text — three languages, a phone's text size,
 * 200% zoom — so each one measures itself and writes its height on `<html>`,
 * where the stylesheet reads it: focus is scrolled clear of it, a row that
 * sticks to the bottom sits above it, and the page ends with that much room.
 * Two questions, two properties: the marketing question takes the analytics
 * notice's place once that is answered, and neither may read the other's
 * zero while it is hidden.
 */
export const ANALYTICS_CONSENT_NOTICE_HEIGHT_PROPERTY =
  "--analytics-consent-notice-height";
export const META_MARKETING_CONSENT_NOTICE_HEIGHT_PROPERTY =
  "--meta-marketing-consent-notice-height";

/**
 * Keeps `property` on `<html>` equal to the element's height, rounded up —
 * a fraction of a pixel under a notice is still under it — and takes it back
 * when the element goes. While the element is hidden it measures zero, which
 * nothing reads: the stylesheet keeps the room only while its question is
 * shown.
 */
export function useNoticeHeightOnRoot(
  ref: RefObject<HTMLElement | null>,
  property: string,
) {
  useEffect(() => {
    const notice = ref.current;
    if (!notice || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty(
        property,
        `${Math.ceil(notice.getBoundingClientRect().height)}px`,
      );
    });
    observer.observe(notice);
    return () => {
      observer.disconnect();
      root.style.removeProperty(property);
    };
  }, [ref, property]);
}

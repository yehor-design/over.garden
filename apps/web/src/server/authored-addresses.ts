import "server-only";

import type { AuthoredSection } from "@/lib/root-route-segments";
import {
  getAnswerPage,
  getBlogPost,
  getGuide,
  getMarketLanding,
} from "@/server/public-seo-content";

/**
 * Whether an authored page exists under this name (`OVE-478`).
 *
 * Answers, guides, notes and market pages are written in the code, so the
 * question needs no database and costs nothing. It has to be asked before the
 * page renders: a name no page has used to render on demand, where a static
 * document cannot be one, and answer 500 with the framework's own English
 * error page — on production too — instead of a 404 in the reader's language.
 */
export function isKnownAuthoredAddress(address: {
  section: AuthoredSection;
  name: string;
}): boolean {
  switch (address.section) {
    case "answers":
      return getAnswerPage(address.name) !== null;
    case "blog":
      return getBlogPost(address.name) !== null;
    case "guides":
      return getGuide(address.name) !== null;
    case "markets":
      return getMarketLanding(address.name) !== null;
  }
}

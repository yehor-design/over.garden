import { permanentRedirect } from "next/navigation";

import {
  DEFAULT_PUBLIC_LOCALE,
  localizedPath,
} from "@/lib/public-localization";

export default function LegacyBlogIndexRedirect() {
  permanentRedirect(localizedPath(DEFAULT_PUBLIC_LOCALE, "/blog"));
}

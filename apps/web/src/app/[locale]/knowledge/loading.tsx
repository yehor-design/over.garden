"use client";

import { useParams } from "next/navigation";

import { PublicKnowledgeHub } from "@/components/public/public-knowledge-hub";
import { getPublicKnowledgeCopy } from "@/lib/public-knowledge-copy";
import { isPublicLocale } from "@/lib/public-localization";

export default function LocalizedKnowledgeLoading() {
  const params = useParams<{ locale?: string }>();
  const locale =
    params.locale && isPublicLocale(params.locale) ? params.locale : "uk";

  return (
    <PublicKnowledgeHub
      locale={locale}
      copy={getPublicKnowledgeCopy(locale)}
      request={{ query: "", type: "all", kind: "all" }}
      items={[]}
      contextItems={[]}
      state="loading"
    />
  );
}

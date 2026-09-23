/**
 * Citations in authored knowledge (`OVE-498`, criteria 2 and 6).
 *
 * An answer's sentences carry `[n]` markers that name the n-th of its
 * sources, one marker per source, written where the claim ends: `…in wet
 * weather[1][2].` The page renders each as a numbered link to the source in
 * its "About this text" section; everything a machine reads — the meta
 * description, `FAQPage`, the hub's search — reads the sentence without them.
 */

const CITATION = /\[(\d{1,2})\]/gu;

export type KnowledgeTextSegment =
  | { kind: "text"; text: string }
  | { kind: "citation"; number: number };

/** A sentence as text and citations, in order. */
export function splitKnowledgeCitations(text: string): KnowledgeTextSegment[] {
  const segments: KnowledgeTextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(CITATION)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ kind: "text", text: text.slice(last, index) });
    }
    segments.push({ kind: "citation", number: Number(match[1]) });
    last = index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ kind: "text", text: text.slice(last) });
  }
  return segments;
}

/** The sentence a machine reads: no markers, and no space left where one was. */
export function stripKnowledgeCitations(text: string): string {
  return text.replace(CITATION, "").replace(/\s+([.,;:!?])/gu, "$1");
}

/** Every source number a text cites, in the order first cited. */
export function knowledgeCitationNumbers(text: string): number[] {
  return [
    ...new Set([...text.matchAll(CITATION)].map((match) => Number(match[1]))),
  ];
}

/** The anchor a citation links to, unique on the page. */
export function knowledgeSourceAnchor(number: number): string {
  return `knowledge-source-${number}`;
}

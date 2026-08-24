import type {
  AtomicJournalCreateContext,
  AtomicJournalCreateRequest,
} from "../src/lib/garden/entry-contracts";

export function buildAtomicTextJournalCreateRequest(input: {
  publishId: string;
  clientMutationId?: string;
  context: AtomicJournalCreateContext;
  title: string;
  text: string;
  returnTo?: string;
}): AtomicJournalCreateRequest {
  const blockId = `b_${input.publishId.replaceAll("-", "").slice(0, 32)}`;
  return {
    publishId: input.publishId,
    clientMutationId: input.clientMutationId ?? input.publishId,
    context: input.context,
    title: input.title,
    document: {
      schemaVersion: 1,
      blocks: [
        {
          id: blockId,
          type: "paragraph",
          spans: [{ text: input.text }],
        },
      ],
    },
    coverMediaAssetId: null,
    mediaClaimReceipts: [],
    returnTo: input.returnTo ?? "/garden",
    disclosureAccepted: true,
  };
}

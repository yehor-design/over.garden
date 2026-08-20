import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  abort: vi.fn(),
  deleteDraft: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/components/auth/document-mutation-recovery", () => ({
  useOptionalDocumentMutationGeneration: () => ({ transport: "generation" }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/lib/garden/online-journal-draft", () => ({
  createOnlineJournalDraftOwner: () => ({
    abort: mocks.abort,
    delete: mocks.deleteDraft,
  }),
}));

import { GardenDraftResumePanel } from "@/app/garden/draft-resume-panel";
import { interfaceLocaleChangeCoordinator } from "@/lib/interface-locale-change-coordinator";
import type { JournalEntryDraftReceiptV1 } from "@/lib/garden/entry-contracts";

describe("server draft locale mutation fence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  it("keeps locale replacement fenced until discard settles", async () => {
    const deletion = deferred<void>();
    mocks.deleteDraft.mockReturnValue(deletion.promise);
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <GardenDraftResumePanel drafts={[DRAFT]} locale="bg" />,
      );
    });

    const discard = renderer!.root
      .findAllByType("button")
      .find((button) => textContent(button.props.children) === "Отхвърляне");
    expect(discard).toBeDefined();
    await act(async () => {
      discard?.props.onClick();
      await Promise.resolve();
    });
    expect(
      interfaceLocaleChangeCoordinator.readState().inFlightParticipantIds,
    ).toContain("garden-server-draft-discard");

    await act(async () => {
      deletion.resolve();
      await deletion.promise;
    });
    expect(
      interfaceLocaleChangeCoordinator.readState().hasInFlightMutation,
    ).toBe(false);
    expect(mocks.abort).toHaveBeenCalledOnce();
    await act(async () => renderer!.unmount());
  });
});

const DRAFT = {
  draftKey: "first-entry",
  draftKind: "first_entry",
  context: {},
  payload: {
    schemaVersion: 1,
    draftKind: "first_entry",
    request: {
      target: "first_plant_entry",
      title: "Rose note",
      clientMutationId: "mutation-test",
    },
  },
  generation: 1,
  payloadSha256: "a".repeat(64),
  serverRevision: 1,
  updatedAt: "2026-07-22T10:00:00.000Z",
} satisfies JournalEntryDraftReceiptV1;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function textContent(value: React.ReactNode): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (value && typeof value === "object" && "props" in value) {
    return textContent(
      (value as React.ReactElement<{ children?: React.ReactNode }>).props
        .children,
    );
  }
  return "";
}

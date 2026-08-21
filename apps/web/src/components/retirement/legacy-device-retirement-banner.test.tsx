import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createLegacyDeviceRetirementController,
  type LegacyDeviceRetirementPort,
} from "@/lib/retirement/legacy-device-retirement";

const signOut = vi.hoisted(() => ({ requestSignOut: vi.fn() }));

vi.mock("@/components/auth/sign-out-provider", () => ({
  useSignOut: () => ({
    phase: "idle",
    requestSignOut: signOut.requestSignOut,
    copy: {},
  }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: (props: Record<string, unknown>) => {
    const buttonProps = { ...props };
    delete buttonProps.variant;
    delete buttonProps.size;
    return <button {...buttonProps} />;
  },
}));
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div data-dialog="true">{children}</div> : null),
  AlertDialogContent: (props: React.ComponentProps<"div">) => (
    <div {...props} />
  ),
  AlertDialogDescription: (props: React.ComponentProps<"div">) => (
    <div {...props} />
  ),
  AlertDialogTitle: (props: React.ComponentProps<"h2">) => <h2 {...props} />,
}));

import { LegacyDeviceRetirementBanner } from "./legacy-device-retirement-banner";

const identity = {
  ownerUserId: "00000000-0000-4000-8000-000000000322",
  ownerVaultBinding: "B".repeat(43),
  sessionGeneration: "S".repeat(43),
  documentMutationGeneration: "signed-document-generation",
};

describe("LegacyDeviceRetirementBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  it("renders nothing for an empty inventory", async () => {
    const port = mockPort([]);
    const renderer = await renderBanner(port);

    expect(port.finalize).toHaveBeenCalledOnce();
    expect(renderer.toJSON()).toBeNull();
  });

  it("keeps transfer, cancel, sign-out, and page content independently usable", async () => {
    const transfer = deferred<{ status: "verified" }>();
    const port = mockPort([
      {
        token: "r-draft",
        kind: "draft",
        mediaIntentCount: 1,
        updatedAt: 1_786_381_200_000,
      },
    ]);
    vi.mocked(port.transferAndVerify).mockReturnValue(transfer.promise);
    const renderer = await renderBanner(port, true);

    expect(button(renderer, /перенести/i)).toBeDefined();
    expect(
      renderer.root.findByProps({ "data-independent-action": true }),
    ).toBeDefined();
    await click(renderer, /перенести/i);
    expect(button(renderer, /скасувати/i).props.disabled).not.toBe(true);
    expect(
      renderer.root.findByProps({ "data-independent-action": true }).props
        .disabled,
    ).not.toBe(true);
    await click(renderer, /вийти/i);
    expect(signOut.requestSignOut).toHaveBeenCalledOnce();
    await click(renderer, /скасувати/i);

    transfer.resolve({ status: "verified" });
    await act(async () => void (await transfer.promise));
    expect(port.deleteVerifiedBatch).not.toHaveBeenCalled();
  });

  it("requires two explicit confirmations and marks Cancel for initial focus", async () => {
    const port = mockPort([
      {
        token: "r-draft",
        kind: "draft",
        mediaIntentCount: 0,
        updatedAt: 1_786_381_200_000,
      },
    ]);
    const renderer = await renderBanner(port);

    await click(renderer, /^видалити$/i);
    expect(button(renderer, /не видаляти/i).props.autoFocus).toBe(true);
    await click(renderer, /підтвердити видалення/i);
    expect(port.discardCurrentOwner).not.toHaveBeenCalled();
    expect(text(renderer)).toMatch(/ще раз/i);
    await click(renderer, /видалити безповоротно/i);
    expect(port.discardCurrentOwner).toHaveBeenCalledOnce();
  });
});

async function renderBanner(
  port: ReturnType<typeof mockPort>,
  withIndependentAction = false,
) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <>
        <LegacyDeviceRetirementBanner
          locale="uk"
          controllerFactory={async () =>
            createLegacyDeviceRetirementController({ identity, port })
          }
        />
        {withIndependentAction ? (
          <button type="button" data-independent-action={true}>
            Independent composer action
          </button>
        ) : null}
      </>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

async function click(renderer: ReactTestRenderer, label: RegExp) {
  await act(async () => {
    button(renderer, label).props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function button(renderer: ReactTestRenderer, label: RegExp) {
  const match = renderer.root
    .findAllByType("button")
    .find((node) => label.test(textNode(node)));
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

function text(renderer: ReactTestRenderer) {
  return textNode(renderer.root);
}

function textNode(node: { children: Array<unknown> }): string {
  return node.children
    .map((child) =>
      typeof child === "string"
        ? child
        : child && typeof child === "object" && "children" in child
          ? textNode(child as { children: Array<unknown> })
          : "",
    )
    .join(" ");
}

function mockPort(
  items: Array<{
    token: string;
    kind: "draft" | "mutation" | "synced_receipt" | "photo_upload";
    mediaIntentCount: number;
    updatedAt: number;
  }>,
): LegacyDeviceRetirementPort {
  return {
    inspect: vi.fn().mockResolvedValue({
      items,
      bounded: false,
      foreignBindingCount: 0,
      foreignOwnerResidueCount: 0,
      capability: "enumeration_available",
    }),
    assertSession: vi.fn().mockResolvedValue(true),
    transferAndVerify: vi.fn().mockResolvedValue({ status: "verified" }),
    deleteVerifiedBatch: vi.fn().mockResolvedValue(undefined),
    discardCurrentOwner: vi.fn().mockResolvedValue(undefined),
    finalize: vi.fn().mockResolvedValue({
      status: "completed",
      absenceReads: 2,
      foreignOwnerResidue: false,
      foreignOrOrphanRetained: false,
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

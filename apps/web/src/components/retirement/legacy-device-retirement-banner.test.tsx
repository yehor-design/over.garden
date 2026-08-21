import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createLegacyDeviceRetirementController,
  type LegacyDeviceRetirementPort,
} from "@/lib/retirement/legacy-device-retirement";

vi.mock("@/components/ui/button", () => ({
  Button: (props: Record<string, unknown>) => {
    const buttonProps = { ...props };
    delete buttonProps.variant;
    delete buttonProps.size;
    return <button {...buttonProps} />;
  },
}));

import { LegacyDeviceRetirementBanner } from "./legacy-device-retirement-banner";

describe("LegacyDeviceRetirementBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  it("renders nothing after exact known storage is absent", async () => {
    const port = mockPort();
    const renderer = await renderBanner(port);

    expect(port.retire).toHaveBeenCalledOnce();
    expect(renderer.toJSON()).toBeNull();
  });

  it("shows a content-free retry boundary for an unresolved binding", async () => {
    const onSignOut = vi.fn();
    const port = mockPort({
      status: "unresolved_retained",
      unresolvedBindingCount: 1,
    });
    const renderer = await renderBanner(port, { onSignOut });

    expect(text(renderer)).toMatch(/не вдалося безпечно видалити/i);
    expect(
      renderer.root.findByProps({
        "data-legacy-device-retirement": "served_unresolved",
      }),
    ).toBeDefined();
    expect(text(renderer)).not.toMatch(/чернет|запис|фото|перенес/i);
    await click(renderer, /вийти/i);
    expect(onSignOut).toHaveBeenCalledOnce();
    await click(renderer, /сховати/i);
    expect(renderer.toJSON()).toBeNull();
  });

  it("keeps cancel and independent page actions usable during a retry", async () => {
    const retry = deferred<ReturnType<typeof receipt>>();
    const port = mockPort({
      status: "unresolved_retained",
      unresolvedBindingCount: 1,
    });
    port.retire.mockResolvedValueOnce(
      receipt({
        status: "unresolved_retained",
        unresolvedBindingCount: 1,
      }),
    );
    port.retire.mockReturnValueOnce(retry.promise);
    const renderer = await renderBanner(port, { independentAction: true });

    await act(async () => {
      button(renderer, /спробувати ще раз/i).props.onClick();
      await Promise.resolve();
    });
    expect(button(renderer, /скасувати/i).props.disabled).not.toBe(true);
    expect(
      renderer.root.findByProps({ "data-independent-action": true }).props
        .disabled,
    ).not.toBe(true);
    await click(renderer, /скасувати/i);
    expect(text(renderer)).toMatch(/скасовано/i);

    retry.resolve(receipt());
    await act(async () => void (await retry.promise));
    expect(text(renderer)).toMatch(/скасовано/i);
  });
});

async function renderBanner(
  port: ReturnType<typeof mockPort>,
  options: { onSignOut?: () => void; independentAction?: boolean } = {},
) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <>
        <LegacyDeviceRetirementBanner
          locale="uk"
          onSignOut={options.onSignOut}
          controllerFactory={() =>
            createLegacyDeviceRetirementController({ port })
          }
        />
        {options.independentAction ? (
          <button type="button" data-independent-action={true}>
            Independent page action
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

function receipt(
  overrides: Partial<{
    status: "absent" | "unresolved_retained";
    deletedDatabaseCount: number;
    unregisteredWorkerCount: number;
    unresolvedBindingCount: number;
  }> = {},
) {
  return {
    status: "absent" as const,
    absenceReads: 2 as const,
    deletedDatabaseCount: 3,
    unregisteredWorkerCount: 1,
    unresolvedBindingCount: 0,
    ...overrides,
  };
}

function mockPort(overrides: Parameters<typeof receipt>[0] = {}) {
  return {
    retire: vi.fn(async () => receipt(overrides)),
  } satisfies LegacyDeviceRetirementPort;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pending: false }));

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => ({
    action: null,
    data: null,
    method: null,
    pending: mocks.pending,
  }),
}));

import { InterfaceServerActionPendingFixture } from "./interface-server-action-pending-fixture";

describe("Server Action pending visual fixture component", () => {
  beforeEach(() => {
    mocks.pending = false;
  });

  it("renders a payload-free form that only the network observer can fence", () => {
    const action = vi.fn(async () => undefined);
    const html = renderToStaticMarkup(
      <InterfaceServerActionPendingFixture action={action} />,
    );

    expect(html).toContain(
      'data-interface-server-action-pending-fixture="true"',
    );
    expect(html).toContain('data-interface-server-action-delay-ms="2000"');
    expect(html).toContain('data-interface-locale-form="ignore"');
    expect(html).toContain('data-interface-server-action-submit="true"');
    expect(html).toContain('data-pending="false"');
    expect(html).toContain('data-interface-server-action-status="ready"');
    expect(html).not.toContain("<input");
    expect(action).not.toHaveBeenCalled();
  });

  it("disables the fixture submit control while its action is pending", () => {
    mocks.pending = true;
    const html = renderToStaticMarkup(
      <InterfaceServerActionPendingFixture action={async () => undefined} />,
    );

    expect(html).toContain('data-pending="true"');
    expect(html).toContain('data-interface-server-action-status="pending"');
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
});

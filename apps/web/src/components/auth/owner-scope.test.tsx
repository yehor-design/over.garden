import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";

import {
  OwnerScopeProvider,
  OwnerUserIdField,
  readMutationScopeCode,
  useOwnerScope,
} from "./owner-scope";

describe("owner scope (ADR-0022, D6)", () => {
  it("renders the owner id as a hidden field only for a signed-in owner", () => {
    expect(
      renderToStaticMarkup(
        <OwnerScopeProvider locale="uk" ownerUserId="owner-a">
          <OwnerUserIdField />
        </OwnerScopeProvider>,
      ),
    ).toContain('<input type="hidden" name="ownerUserId" value="owner-a"/>');
    expect(
      renderToStaticMarkup(
        <OwnerScopeProvider locale="uk" ownerUserId={null}>
          <OwnerUserIdField />
        </OwnerScopeProvider>,
      ),
    ).not.toContain("ownerUserId");
  });

  it("turns a session refusal into one localized notice and keeps the page", async () => {
    let seen: Record<string, string> | null = null;
    function Probe() {
      const scope = useOwnerScope();
      useEffect(() => {
        seen = scope.headers();
        void scope.handleResponse(
          new Response(JSON.stringify({ code: "session_account_changed" }), {
            status: 409,
          }),
        );
      }, [scope]);
      return <main>Composer text stays</main>;
    }
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <OwnerScopeProvider locale="bg" ownerUserId="owner-a">
          <Probe />
        </OwnerScopeProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(seen).toEqual({ "x-overgarden-owner-user-id": "owner-a" });
    const notice = renderer!.root.findByProps({
      "data-mutation-scope-notice": "session_account_changed",
    });
    expect(notice.props.children).toBe(
      "Влязохте като друг профил. Обновете страницата.",
    );
    expect(renderer!.root.findByType("main").props.children).toBe(
      "Composer text stays",
    );
    await act(async () => renderer!.unmount());
  });

  it("recognises only the two session codes in an action result", () => {
    expect(readMutationScopeCode({ mutationScope: "session_required" })).toBe(
      "session_required",
    );
    expect(readMutationScopeCode({ mutationScope: "MATCH" })).toBeNull();
    expect(readMutationScopeCode(null)).toBeNull();
  });
});

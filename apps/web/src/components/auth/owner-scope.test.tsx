import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";

import {
  OwnerScopeProvider,
  OwnerUserIdField,
  readMutationScopeCode,
  useOwnerScope,
  useOwnerScopeControl,
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
      "Влязохте с друг акаунт. Обновете страницата.",
    );
    expect(renderer!.root.findByType("main").props.children).toBe(
      "Composer text stays",
    );
    await act(async () => renderer!.unmount());
  });

  it("names the owner after the document was served, without rendering the scope again", async () => {
    // A static document is rendered before anybody knows who is reading it
    // (ADR-0032 D2, D10). The shell names the owner once the session settles;
    // what reads the scope renders again, and what merely sits under it — the
    // page — does not.
    let pageRenders = 0;
    let nameOwner: (ownerUserId: string | null) => void = () => undefined;
    let headers: () => Record<string, string> = () => ({});
    function Page() {
      pageRenders += 1;
      return <main>Page</main>;
    }
    function Control() {
      nameOwner = useOwnerScopeControl();
      headers = useOwnerScope().headers;
      return null;
    }
    const page = <Page />;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <OwnerScopeProvider locale="uk" ownerUserId={null}>
          {page}
          <Control />
          <form>
            <OwnerUserIdField />
          </form>
        </OwnerScopeProvider>,
      );
    });
    expect(renderer!.root.findAllByProps({ name: "ownerUserId" })).toHaveLength(
      0,
    );

    await act(async () => nameOwner("owner-late"));

    expect(
      renderer!.root.findByProps({ name: "ownerUserId" }).props.value,
    ).toBe("owner-late");
    // Read when the request is made, not when the component rendered.
    expect(headers()).toEqual({ "x-overgarden-owner-user-id": "owner-late" });
    expect(pageRenders).toBe(1);
    await act(async () => renderer!.unmount());
  });

  it("follows the prop when a request-time document is rendered for another reader", async () => {
    let renderer: ReactTestRenderer | undefined;
    const tree = (ownerUserId: string | null) => (
      <OwnerScopeProvider locale="uk" ownerUserId={ownerUserId}>
        <form>
          <OwnerUserIdField />
        </form>
      </OwnerScopeProvider>
    );
    await act(async () => {
      renderer = create(tree("owner-a"));
    });
    await act(async () => renderer!.update(tree("owner-b")));

    expect(
      renderer!.root.findByProps({ name: "ownerUserId" }).props.value,
    ).toBe("owner-b");
    await act(async () => renderer!.update(tree(null)));
    expect(renderer!.root.findAllByProps({ name: "ownerUserId" })).toHaveLength(
      0,
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

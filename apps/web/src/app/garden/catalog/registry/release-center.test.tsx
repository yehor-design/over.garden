import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/owner-scope", () => ({
  OwnerScopedActionForm: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <form className={className}>{children}</form>,
}));

import { StableRegistryReleaseCenter } from "./release-center";

const releaseId = "00000000-0000-4000-8000-000000000255";
const action = vi.fn(async () => ({ outcome: "accepted" as const }));

describe("StableRegistryReleaseCenter", () => {
  it("provides semantic keyboard-operable grouped decisions without source-row leakage", () => {
    const html = renderToStaticMarkup(
      <StableRegistryReleaseCenter
        locale="uk"
        model={{
          completedCaptureCount: 1,
          writesEnabled: true,
          latestRelease: {
            id: releaseId,
            state: "review_ready",
            captureId: "00000000-0000-4000-8000-000000000254",
            policyVersion: "ove255.foundation.v1",
            buildDigest: "a".repeat(64),
            previewDigest: null,
            version: 1,
            createdAt: new Date(),
            reviewReadyAt: new Date(),
            approvedAt: null,
            activatedAt: null,
            memberCount: 2,
            eligibleMemberCount: 2,
            openGroupCount: 1,
            blockingGroupCount: 0,
          },
          exceptionGroups: [
            {
              id: "00000000-0000-4000-8000-000000000252",
              reasonClass: "authority_corroboration_required",
              state: "open",
              memberCount: 10,
              expectedVersion: 1,
            },
          ],
        }}
        buildAction={action}
        decideAction={action}
        approveAction={action}
        activateAction={action}
        abandonAction={action}
      />,
    );

    expect(html).toContain(
      '<section aria-labelledby="registry-exceptions-heading"',
    );
    expect(html).toContain('<select name="action"');
    expect(html).toContain(
      `id="registry-exception-00000000-0000-4000-8000-000000000252"`,
    );
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Це той самий концепт");
    expect(html).toContain("Скасувати побудову");
    expect(html).toContain("Повернутися до поточного каталогу");
    expect(html).not.toMatch(
      /raw_payload|source_only_fields|latitude|longitude/i,
    );
  });

  it.each([
    ["bg", "Групи изключения"],
    ["ru", "Группы исключений"],
  ] as const)(
    "renders explicit shared-locale release copy for %s",
    (locale, label) => {
      const html = renderToStaticMarkup(
        <StableRegistryReleaseCenter
          locale={locale}
          model={{
            completedCaptureCount: 0,
            writesEnabled: true,
            latestRelease: null,
            exceptionGroups: [],
          }}
          buildAction={action}
          decideAction={action}
          approveAction={action}
          activateAction={action}
          abandonAction={action}
        />,
      );

      expect(html).toContain(label);
    },
  );
});

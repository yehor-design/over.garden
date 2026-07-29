import { describe, expect, it } from "vitest";

import {
  BetterAuthSecurityGuardError,
  MIN_PATCHED_BETTER_AUTH_VERSION,
  verifyBetterAuthSecurity,
} from "./verify-better-auth-security";

const supportedAuthSource = `
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: shouldRequireAuthEmailVerification(),
    sendResetPassword: () => undefined,
  },
  emailVerification: {
    sendVerificationEmail: () => undefined,
  },
  socialProviders: providers,
  account: socialAccountPolicy(),
  hooks: {
    before: hardenCurrentSessionSignOut,
  },
  databaseHooks: createRetiredSharedIdentityDatabaseHooks(),
  plugins: [nextCookies()],
`;

function makeInput(options?: {
  packageVersion?: string;
  lockVersion?: string;
  authSource?: string;
}) {
  const packageVersion = options?.packageVersion ?? "1.6.25";
  const lockVersion = options?.lockVersion ?? packageVersion;

  return {
    packageJson: {
      dependencies: {
        "better-auth": packageVersion,
      },
    },
    lockfile: `
importers:
  .:
    dependencies:
      better-auth:
        specifier: ${packageVersion}
        version: ${lockVersion}(next@16.2.11)

packages:
  better-auth@${lockVersion}:
`,
    authSource: options?.authSource ?? supportedAuthSource,
  };
}

function expectFailure(
  input: ReturnType<typeof makeInput>,
  code: BetterAuthSecurityGuardError["code"],
) {
  try {
    verifyBetterAuthSecurity(input);
    throw new Error("expected the guard to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(BetterAuthSecurityGuardError);
    expect((error as BetterAuthSecurityGuardError).code).toBe(code);
    expect((error as Error).message).not.toContain("fixture-secret");
  }
}

describe("Better Auth security guard", () => {
  it("admits the stable patched package, lockfile, and supported auth boundary", () => {
    expect(verifyBetterAuthSecurity(makeInput())).toEqual({
      patchedVersion: "1.6.25",
      passwordlessPlugins: "absent",
      authBoundary: "present",
    });
  });

  it("rejects the advisory-affected version range", () => {
    expectFailure(
      makeInput({ packageVersion: "1.6.20" }),
      "vulnerable_version",
    );
  });

  it("rejects non-stable package ranges and prereleases", () => {
    expectFailure(
      makeInput({ packageVersion: "^1.6.25" }),
      "non_stable_version",
    );
    expectFailure(
      makeInput({ packageVersion: "1.6.25-rc.1" }),
      "non_stable_version",
    );
  });

  it("rejects a lockfile that resolves a different version than package.json", () => {
    expectFailure(makeInput({ lockVersion: "1.6.20" }), "lockfile_mismatch");
  });

  it("rejects magic-link and email-OTP registration without echoing source content", () => {
    expectFailure(
      makeInput({
        authSource: `${supportedAuthSource}\nplugins: [magicLink({ secret: "fixture-secret" })]`,
      }),
      "forbidden_passwordless_plugin",
    );
    expectFailure(
      makeInput({
        authSource: `${supportedAuthSource}\nplugins: [emailOTP()]`,
      }),
      "forbidden_passwordless_plugin",
    );
  });

  it("rejects a missing supported callback boundary", () => {
    expectFailure(
      makeInput({
        authSource: supportedAuthSource.replace("sendVerificationEmail:", ""),
      }),
      "missing_auth_boundary",
    );
  });

  it("pins the documented patched floor", () => {
    expect(MIN_PATCHED_BETTER_AUTH_VERSION).toBe("1.6.22");
  });
});

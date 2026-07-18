import "server-only";

import type { PublicIdentitySurface } from "@/server/identity-policy";
import { IDENTITY_POLICY_DATA_PROVENANCE } from "@/server/identity-policy-data";

export interface IdentityPolicyFixture {
  readonly id: string;
  readonly surface: PublicIdentitySurface;
  readonly value: string;
}

export const IDENTITY_POLICY_FIXTURE_SET_PROVENANCE = {
  schema: "ove203.identity-policy-fixture-set.v1",
  fixtureSetVersion: "ove203-identity-fixtures-v1",
  policyVersion: IDENTITY_POLICY_DATA_PROVENANCE.policyVersion,
  effectiveDate: "2026-07-18",
  origin: "original_overgarden_regression_curation",
  thirdPartyFixtureSetsCopied: false,
  redistribution:
    "original fixtures have no standalone open-source license; repository ownership terms apply",
  diagnosticContract: "opaque_fixture_identifiers_only",
} as const;

/**
 * Fixture identifiers are intentionally opaque. Tests and CI diagnostics must
 * refer to the identifier only, never echo the candidate or matched policy
 * data. Keep rejected values in this server-only source file.
 */
export const REJECTED_IDENTITY_POLICY_FIXTURES = [
  { id: "R001", surface: "handle", value: "nazi" },
  { id: "R002", surface: "handle", value: "na_zi" },
  { id: "R003", surface: "handle", value: "n4zi" },
  { id: "R004", surface: "handle", value: "hiiitler" },
  { id: "R005", surface: "handle", value: "terrorist_garden" },
  { id: "R006", surface: "handle", value: "over_garden" },
  { id: "R007", surface: "handle", value: "gardener_green" },
  { id: "R008", surface: "handle", value: "demo_gardener" },
  { id: "R009", surface: "handle", value: "official_gardener" },
  { id: "R010", surface: "display_name", value: "нацист" },
  { id: "R011", surface: "display_name", value: "нацисты" },
  { id: "R012", surface: "display_name", value: "хитлер" },
  { id: "R013", surface: "display_name", value: "терорист" },
  { id: "R014", surface: "display_name", value: "террорист" },
  { id: "R015", surface: "display_name", value: "хуйло" },
  { id: "R016", surface: "display_name", value: "пизда" },
  { id: "R017", surface: "display_name", value: "путка" },
  { id: "R018", surface: "display_name", value: "блядь" },
  { id: "R019", surface: "display_name", value: "шлюха" },
  { id: "R020", surface: "display_name", value: "повія" },
  { id: "R021", surface: "display_name", value: "смърт на украинците" },
  { id: "R022", surface: "display_name", value: "смерть українцям" },
  { id: "R023", surface: "display_name", value: "смерть украинцам" },
  { id: "R024", surface: "display_name", value: "вбий себе" },
  { id: "R025", surface: "display_name", value: "убий се" },
  { id: "R026", surface: "display_name", value: "убью тебя" },
  { id: "R027", surface: "display_name", value: "natsyst" },
  { id: "R028", surface: "display_name", value: "terorist" },
  { id: "R029", surface: "display_name", value: "khuy" },
  { id: "R030", surface: "display_name", value: "shte te ubiya" },
  { id: "R031", surface: "display_name", value: "n.a.z.i" },
  { id: "R032", surface: "display_name", value: "n@zi" },
  { id: "R033", surface: "display_name", value: "naaazi" },
  { id: "R034", surface: "display_name", value: "nаzi" },
  { id: "R035", surface: "display_name", value: "na\u200bzi" },
  { id: "R036", surface: "display_name", value: "ｎａｚｉ" },
  { id: "R037", surface: "display_name", value: "admin" },
  { id: "R038", surface: "display_name", value: "служба підтримки" },
  { id: "R039", surface: "display_name", value: "поддръжка" },
  { id: "R040", surface: "display_name", value: "официальный" },
  { id: "R041", surface: "display_name", value: "overgarden support" },
  { id: "R042", surface: "display_name", value: "Green\u202egarden" },
  { id: "R043", surface: "display_name", value: "n4аааzi" },
  { id: "R044", surface: "display_name", value: "vbyi sebe" },
  { id: "R045", surface: "display_name", value: "smart na ukraintsite" },
  { id: "R046", surface: "display_name", value: "ubyu tebya" },
  { id: "R047", surface: "display_name", value: "blyad" },
  { id: "R048", surface: "display_name", value: "putka" },
  { id: "R049", surface: "display_name", value: "х.у.й" },
  { id: "R050", surface: "display_name", value: "оfficial" },
  { id: "R051", surface: "display_name", value: "supp0rt" },
  { id: "R052", surface: "display_name", value: "moderat0r" },
  { id: "R053", surface: "display_name", value: "4dmin" },
  { id: "R054", surface: "handle", value: "terror_garden" },
  { id: "R055", surface: "display_name", value: "терор" },
] as const satisfies readonly IdentityPolicyFixture[];

export const ALLOWED_IDENTITY_POLICY_FIXTURES = [
  { id: "A001", surface: "handle", value: "green_thumb" },
  { id: "A002", surface: "handle", value: "garden_supporter" },
  { id: "A003", surface: "handle", value: "therapist" },
  { id: "A004", surface: "handle", value: "grapeseed" },
  { id: "A005", surface: "handle", value: "natalia_rose" },
  { id: "A006", surface: "display_name", value: "Сімейний сад" },
  { id: "A007", surface: "display_name", value: "Градина на Мария" },
  { id: "A008", surface: "display_name", value: "Сад Ирины" },
  { id: "A009", surface: "display_name", value: "Garden supporter" },
  { id: "A010", surface: "display_name", value: "Therapist garden" },
  { id: "A011", surface: "display_name", value: "Scunthorpe rose" },
  { id: "A012", surface: "display_name", value: "Anti nazi" },
  { id: "A013", surface: "display_name", value: "Проти нацизму" },
  { id: "A014", surface: "display_name", value: "Срещу нацизма" },
  { id: "A015", surface: "display_name", value: "Сімейний сад 👩‍🌾" },
  { id: "A016", surface: "display_name", value: "Родина 👨‍👩‍👧‍👦" },
  { id: "A017", surface: "display_name", value: "Rose ❤️" },
  { id: "A018", surface: "display_name", value: "Balcony 1️⃣" },
  { id: "A019", surface: "display_name", value: "Niger garden" },
  { id: "A020", surface: "display_name", value: "Willow garden" },
  { id: "A021", surface: "display_name", value: "Administrative garden" },
  { id: "A022", surface: "display_name", value: "Supporting gardens" },
  { id: "A023", surface: "display_name", value: "Садівниця 👩🏽‍🌾" },
  { id: "A024", surface: "display_name", value: "Україна 🇺🇦" },
] as const satisfies readonly IdentityPolicyFixture[];

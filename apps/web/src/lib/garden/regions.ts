export const COARSE_REGIONS = [
  { code: "UA-05", countryCode: "UA", label: "Ukraine - Vinnytsia Oblast" },
  { code: "UA-07", countryCode: "UA", label: "Ukraine - Volyn Oblast" },
  { code: "UA-09", countryCode: "UA", label: "Ukraine - Luhansk Oblast" },
  {
    code: "UA-12",
    countryCode: "UA",
    label: "Ukraine - Dnipropetrovsk Oblast",
  },
  { code: "UA-14", countryCode: "UA", label: "Ukraine - Donetsk Oblast" },
  { code: "UA-18", countryCode: "UA", label: "Ukraine - Zhytomyr Oblast" },
  {
    code: "UA-21",
    countryCode: "UA",
    label: "Ukraine - Zakarpattia Oblast",
  },
  { code: "UA-23", countryCode: "UA", label: "Ukraine - Zaporizhzhia Oblast" },
  {
    code: "UA-26",
    countryCode: "UA",
    label: "Ukraine - Ivano-Frankivsk Oblast",
  },
  { code: "UA-30", countryCode: "UA", label: "Ukraine - Kyiv City" },
  { code: "UA-32", countryCode: "UA", label: "Ukraine - Kyiv Oblast" },
  { code: "UA-35", countryCode: "UA", label: "Ukraine - Kirovohrad Oblast" },
  { code: "UA-40", countryCode: "UA", label: "Ukraine - Sevastopol" },
  { code: "UA-43", countryCode: "UA", label: "Ukraine - Crimea" },
  { code: "UA-46", countryCode: "UA", label: "Ukraine - Lviv Oblast" },
  { code: "UA-48", countryCode: "UA", label: "Ukraine - Mykolaiv Oblast" },
  { code: "UA-51", countryCode: "UA", label: "Ukraine - Odesa Oblast" },
  { code: "UA-53", countryCode: "UA", label: "Ukraine - Poltava Oblast" },
  { code: "UA-56", countryCode: "UA", label: "Ukraine - Rivne Oblast" },
  { code: "UA-59", countryCode: "UA", label: "Ukraine - Sumy Oblast" },
  { code: "UA-61", countryCode: "UA", label: "Ukraine - Ternopil Oblast" },
  { code: "UA-63", countryCode: "UA", label: "Ukraine - Kharkiv Oblast" },
  { code: "UA-65", countryCode: "UA", label: "Ukraine - Kherson Oblast" },
  {
    code: "UA-68",
    countryCode: "UA",
    label: "Ukraine - Khmelnytskyi Oblast",
  },
  { code: "UA-71", countryCode: "UA", label: "Ukraine - Cherkasy Oblast" },
  { code: "UA-74", countryCode: "UA", label: "Ukraine - Chernihiv Oblast" },
  { code: "UA-77", countryCode: "UA", label: "Ukraine - Chernivtsi Oblast" },
  {
    code: "BG-01",
    countryCode: "BG",
    label: "Bulgaria - Blagoevgrad Province",
  },
  { code: "BG-02", countryCode: "BG", label: "Bulgaria - Burgas Province" },
  { code: "BG-03", countryCode: "BG", label: "Bulgaria - Varna Province" },
  {
    code: "BG-04",
    countryCode: "BG",
    label: "Bulgaria - Veliko Tarnovo Province",
  },
  { code: "BG-05", countryCode: "BG", label: "Bulgaria - Vidin Province" },
  { code: "BG-06", countryCode: "BG", label: "Bulgaria - Vratsa Province" },
  { code: "BG-07", countryCode: "BG", label: "Bulgaria - Gabrovo Province" },
  { code: "BG-08", countryCode: "BG", label: "Bulgaria - Dobrich Province" },
  { code: "BG-09", countryCode: "BG", label: "Bulgaria - Kardzhali Province" },
  {
    code: "BG-10",
    countryCode: "BG",
    label: "Bulgaria - Kyustendil Province",
  },
  { code: "BG-11", countryCode: "BG", label: "Bulgaria - Lovech Province" },
  { code: "BG-12", countryCode: "BG", label: "Bulgaria - Montana Province" },
  {
    code: "BG-13",
    countryCode: "BG",
    label: "Bulgaria - Pazardzhik Province",
  },
  { code: "BG-14", countryCode: "BG", label: "Bulgaria - Pernik Province" },
  { code: "BG-15", countryCode: "BG", label: "Bulgaria - Pleven Province" },
  { code: "BG-16", countryCode: "BG", label: "Bulgaria - Plovdiv Province" },
  { code: "BG-17", countryCode: "BG", label: "Bulgaria - Razgrad Province" },
  { code: "BG-18", countryCode: "BG", label: "Bulgaria - Ruse Province" },
  { code: "BG-19", countryCode: "BG", label: "Bulgaria - Silistra Province" },
  { code: "BG-20", countryCode: "BG", label: "Bulgaria - Sliven Province" },
  { code: "BG-21", countryCode: "BG", label: "Bulgaria - Smolyan Province" },
  {
    code: "BG-22",
    countryCode: "BG",
    label: "Bulgaria - Sofia City Province",
  },
  { code: "BG-23", countryCode: "BG", label: "Bulgaria - Sofia Province" },
  {
    code: "BG-24",
    countryCode: "BG",
    label: "Bulgaria - Stara Zagora Province",
  },
  {
    code: "BG-25",
    countryCode: "BG",
    label: "Bulgaria - Targovishte Province",
  },
  { code: "BG-26", countryCode: "BG", label: "Bulgaria - Haskovo Province" },
  { code: "BG-27", countryCode: "BG", label: "Bulgaria - Shumen Province" },
  { code: "BG-28", countryCode: "BG", label: "Bulgaria - Yambol Province" },
] as const;

export type CoarseRegionCode = (typeof COARSE_REGIONS)[number]["code"];

export const COARSE_REGION_OPTIONS = COARSE_REGIONS.map(
  ({ code, label }) => ({
    value: code,
    label,
  }),
);

const COARSE_REGION_LABELS = new Map<string, string>(
  COARSE_REGIONS.map((region) => [region.code, region.label]),
);

export function normalizeCoarseRegionCode(
  value: string | null | undefined,
): CoarseRegionCode | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return COARSE_REGION_LABELS.has(normalized)
    ? (normalized as CoarseRegionCode)
    : null;
}

export function isCoarseRegionCode(
  value: string | null | undefined,
): value is CoarseRegionCode {
  return normalizeCoarseRegionCode(value) !== null;
}

export function getCoarseRegionLabel(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeCoarseRegionCode(value);
  return normalized ? (COARSE_REGION_LABELS.get(normalized) ?? null) : null;
}

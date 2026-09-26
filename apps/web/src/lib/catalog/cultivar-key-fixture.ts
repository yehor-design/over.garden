/**
 * The fixture `scripts/prove-object-species-database.ts` also runs through
 * `catalog_cultivar_key` in Postgres: the two must agree on every line.
 */
export const CULTIVAR_KEY_FIXTURE: ReadonlyArray<readonly [string, string]> = [
  ["Бичаче серце", "бичаче серце"],
  ["  бичаче-серце ", "бичаче серце"],
  ["Черокі", "чероки"],
  ["ЧЕРОКИ", "чероки"],
  ["Черокы", "чероки"],
  ["Їжачок", "ижачок"],
  ["Євпаторійський", "евпаторийский"],
  ["Эвпаторийский", "евпаторийский"],
  ["Бычье сердце", "биче сердце"],
  ["М'ята перцева", "мята перцева"],
  ["М’ята перцева", "мята перцева"],
  ["Подъём", "подем"],
  ["Брама", "брама"],
  ["Cherokee Purple", "cherokee purple"],
  ["De Barao", "de barao"],
  ["Ґрунтовий", "грунтовий"],
];

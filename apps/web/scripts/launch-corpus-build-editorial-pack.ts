import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  LAUNCH_CORPUS_CONTENT_PACK_VERSION,
  digestLaunchCorpusContentPack,
  launchCorpusContentPackSchema,
} from "../src/lib/launch-corpus/content-pack";

const argv = process.argv.slice(2);
const packRoot = requiredFlag("--pack-root");
const planDigest = requiredDigest("--plan-digest");
const receiptFile = "provenance/unsplash-license-receipt.md";

async function main() {
const receiptSha = await sha(path.join(packRoot, receiptFile));
const reviewedBy = "OverGarden editorial";

type MediaDraft = {
  file: string;
  role?: "inline" | "cover_only";
  aspect: "portrait" | "landscape" | "square";
  alt: string;
  photographer: string;
};

const media = async (draft: MediaDraft) => ({
  file: `media/${draft.file}.jpg`,
  sha256: await sha(path.join(packRoot, `media/${draft.file}.jpg`)),
  role: draft.role ?? "inline",
  aspect: draft.aspect,
  alt: draft.alt,
  caption: draft.file.startsWith("bg")
    ? `Илюстративна редакционна снимка — ${draft.photographer}, Unsplash`
    : `Ілюстративне редакційне фото — ${draft.photographer}, Unsplash`,
  rightsBasis: "licensed" as const,
  rightsHolder: draft.photographer,
  provenanceReceiptFile: receiptFile,
  provenanceReceiptSha256: receiptSha,
});

const drafts = [
  {
    id: "UA-J01", market: "UA", sourceLanguage: "uk", objectKind: "plant", visibility: "public", coverBranch: "no_media",
    spaceLabel: "Редакційний город", objectLabel: "Томат", catalogIdentity: "Solanum lycopersicum",
    title: "Як читати стан томата без фото",
    body: "Редакційна нотатка OverGarden. Стан рослини варто описувати через зміни, які можна порівняти пізніше: висоту нового приросту, кількість квіткових китиць, пружність листя та вологість верхнього шару ґрунту. Такий запис корисніший за загальне «все добре», бо допомагає побачити тенденцію й обрати наступну дію без вигаданих висновків.",
    entryDate: "2026-05-18", media: [] as MediaDraft[], explicit: null,
  },
  {
    id: "UA-J02", market: "UA", sourceLanguage: "uk", objectKind: "plant", visibility: "public", coverBranch: "one_inline_auto_cover",
    spaceLabel: "Редакційний город", objectLabel: "Томат", catalogIdentity: "Solanum lycopersicum",
    title: "Полив без календарної пастки",
    body: "Редакційна нотатка OverGarden. Фіксований календар поливу не враховує спеку, вітер і розмір контейнера. Практичніший сигнал — перевірити вологість ґрунту нижче сухої поверхні та стан листя вранці. Записуйте не лише факт поливу, а й причину: так журнал поступово показує, який ритм справді підходить рослині.",
    entryDate: "2026-05-25", media: [{file:"ua02",aspect:"landscape",alt:"Грона зелених і стиглих томатів на рослині",photographer:"Laura España"}], explicit: null,
  },
  {
    id: "UA-J03", market: "UA", sourceLanguage: "uk", objectKind: "plant", visibility: "public", coverBranch: "multi_explicit_non_first_cover",
    spaceLabel: "Редакційний город", objectLabel: "Томат", catalogIdentity: "Solanum lycopersicum",
    title: "Три сигнали перед зав’язуванням плодів",
    body: "Редакційна нотатка OverGarden. Перед появою зав’язі корисно окремо відстежити нові квітки, стан опори та рівномірність поливу. Один запис із трьома послідовними ілюстраціями допомагає відділити спостереження від дії: спочатку зафіксувати зміни, потім підв’язати стебло або скоригувати воду, а результат оцінити в наступному записі.",
    entryDate: "2026-06-03", media: [
      {file:"ua03a",aspect:"portrait",alt:"Лійка поруч із зеленими кімнатними рослинами",photographer:"feey"},
      {file:"ua03b",aspect:"landscape",alt:"Полив зелених рослин металевою лійкою",photographer:"Benjamin White"},
      {file:"ua03c",aspect:"landscape",alt:"Руки висаджують молоді саджанці у ґрунт",photographer:"Sandie Clarke"},
    ], explicit: "ua03b",
  },
  {
    id: "UA-J04", market: "UA", sourceLanguage: "uk", objectKind: "animal", visibility: "public", coverBranch: "cover_only_dedicated",
    spaceLabel: "Редакційна пасіка", objectLabel: "Бджолина сім’я", catalogIdentity: "Apis mellifera",
    title: "Що записувати після огляду вулика",
    body: "Редакційна нотатка OverGarden. Після планового огляду достатньо занотувати спостережувану активність біля льотка, наявність кормових запасів і одну наступну перевірку. Не варто перетворювати короткий журнал на діагноз: якщо поведінка сім’ї незвична або є ознаки хвороби, рішення має спиратися на досвідченого пасічника чи фахівця.",
    entryDate: "2026-06-08", media: [{file:"ua04",role:"cover_only",aspect:"portrait",alt:"Бджоли літають біля дерев’яного вулика",photographer:"Fabian Kleiser"}], explicit: "ua04",
  },
  {
    id: "UA-J05", market: "UA", sourceLanguage: "uk", objectKind: "plant", visibility: "public", coverBranch: "explicit_cover_stable_after_reorder",
    spaceLabel: "Редакційний город", objectLabel: "Томат", catalogIdentity: "Solanum lycopersicum",
    title: "Обкладинка як сталий орієнтир сезону",
    body: "Редакційна нотатка OverGarden. Для довгого запису краще обрати обкладинкою кадр, що найточніше показує предмет спостереження, а не просто перше фото. Порядок ілюстрацій можна змінити, зберігши обрану обкладинку. Це робить стрічку зрозумілою, а всередині запису залишає природну послідовність розвитку рослини.",
    entryDate: "2026-06-16", media: [
      {file:"ua05a",aspect:"portrait",alt:"Зелені та червоні томати серед листя",photographer:"Shalev Cohen"},
      {file:"ua05b",aspect:"landscape",alt:"Стиглі томати висять на рослині",photographer:"Dan Gold"},
    ], explicit: "ua05b",
  },
  {
    id: "UA-J06", market: "UA", sourceLanguage: "uk", objectKind: "plant", visibility: "private", coverBranch: "private_one_inline",
    spaceLabel: "Редакційний город", objectLabel: "Томат", catalogIdentity: "Solanum lycopersicum",
    title: "Приватний план наступного догляду",
    body: "Редакційний приклад приватної нотатки. Тут можна зберегти робочий план: перевірити опору, порівняти вологість ґрунту та повернутися до стану листя через кілька днів. Приватний запис не повинен з’являтися у стрічці, каталозі, профілі чи пошуку, доки власник свідомо не змінить видимість.",
    entryDate: "2026-06-20", media: [{file:"ua06",aspect:"portrait",alt:"Зелені та червоні томати на високій рослині",photographer:"Justus Menke"}], explicit: null,
  },
  {
    id: "UA-J07", market: "UA", sourceLanguage: "uk", objectKind: "plant", visibility: "archived_410", coverBranch: "archived_one_inline",
    spaceLabel: "Редакційний город", objectLabel: "Томат", catalogIdentity: "Solanum lycopersicum",
    title: "Завершений редакційний приклад сезону",
    body: "Редакційний приклад архівованого запису. Після завершення демонстраційного сезону матеріал прибирається з активної стрічки та пошуку, але його колишня публічна адреса повинна повертати стан Gone. Це захищає від появи застарілого контенту без пояснення й перевіряє повний життєвий цикл журналу.",
    entryDate: "2026-06-24", media: [{file:"ua07",aspect:"portrait",alt:"Зелені рослини в горщиках на балконі",photographer:"Taras Chuiko"}], explicit: null,
  },
  {
    id: "BG-J01", market: "BG", sourceLanguage: "bg", objectKind: "plant", visibility: "public", coverBranch: "no_media",
    spaceLabel: "Редакционна градина", objectLabel: "Домат", catalogIdentity: "Solanum lycopersicum",
    title: "Полезна бележка за домат без снимка",
    body: "Редакционна бележка на OverGarden. Един запис остава полезен и без снимка, когато описва проверими промени: нов растеж, брой цветни китки, състояние на листата и влага под сухия повърхностен слой. Така следващото наблюдение може да се сравни с предишното, вместо дневникът да събира общи оценки без контекст.",
    entryDate: "2026-05-19", media: [] as MediaDraft[], explicit: null,
  },
  {
    id: "BG-J02", market: "BG", sourceLanguage: "bg", objectKind: "plant", visibility: "public", coverBranch: "one_inline_auto_cover",
    spaceLabel: "Редакционна градина", objectLabel: "Домат", catalogIdentity: "Solanum lycopersicum",
    title: "Поливане според почвата, не според календара",
    body: "Редакционна бележка на OverGarden. Един и същ график не отчита жегата, вятъра и размера на съда. По-надеждно е първо да се провери влагата под повърхността и видът на листата сутрин. Записът трябва да пази и причината за поливането, за да покаже с времето кой ритъм работи за растението.",
    entryDate: "2026-05-27", media: [{file:"bg02",aspect:"landscape",alt:"Гроздове домати узряват върху зелено растение",photographer:"Katerina Shkribey"}], explicit: null,
  },
  {
    id: "BG-J03", market: "BG", sourceLanguage: "bg", objectKind: "plant", visibility: "public", coverBranch: "multi_explicit_non_first_cover",
    spaceLabel: "Редакционна градина", objectLabel: "Домат", catalogIdentity: "Solanum lycopersicum",
    title: "Наблюдение, действие и следваща проверка",
    body: "Редакционна бележка на OverGarden. Добрата поредица разделя трите момента: какво се вижда сега, каква малка грижа е направена и кога ще се оцени резултатът. Няколко илюстрации могат да покажат поливане и засаждане, но текстът не твърди, че снимките документират реален потребител или конкретна градина.",
    entryDate: "2026-06-04", media: [
      {file:"bg03a",aspect:"portrait",alt:"Жена полива растения до прозорец",photographer:"Annie Spratt"},
      {file:"bg03b",aspect:"landscape",alt:"Поливане на зелени растения в градина",photographer:"Unsplash contributor"},
      {file:"bg03c",aspect:"landscape",alt:"Човек полива растения с лейка",photographer:"Pille R. Priske"},
    ], explicit: "bg03b",
  },
  {
    id: "BG-J04", market: "BG", sourceLanguage: "bg", objectKind: "animal", visibility: "public", coverBranch: "cover_only_dedicated",
    spaceLabel: "Редакционен пчелин", objectLabel: "Пчелно семейство", catalogIdentity: "Apis mellifera",
    title: "Кратък и отговорен запис след преглед на кошер",
    body: "Редакционна бележка на OverGarden. След обичаен преглед може да се запише наблюдаваната активност, видимото състояние на запасите и една следваща проверка. Краткият дневник не е диагноза. При необичайно поведение или съмнение за заболяване решението трябва да се потвърди от опитен пчелар или специалист.",
    entryDate: "2026-06-09", media: [{file:"bg04",role:"cover_only",aspect:"landscape",alt:"Дървен кошер сред зелена трева",photographer:"Alvéole Buzz"}], explicit: "bg04",
  },
  {
    id: "BG-J05", market: "BG", sourceLanguage: "bg", objectKind: "plant", visibility: "public", coverBranch: "explicit_cover_stable_after_reorder",
    spaceLabel: "Редакционна градина", objectLabel: "Домат", catalogIdentity: "Solanum lycopersicum",
    title: "Избрана корица, която не зависи от реда",
    body: "Редакционна бележка на OverGarden. Корица трябва да показва ясно предмета на записа, а не задължително да бъде първата добавена снимка. След пренареждане на илюстрациите избраният кадър остава корица. Това пази разпознаваемостта в списъците и позволява вътре да се подреди по-смислен визуален разказ.",
    entryDate: "2026-06-17", media: [
      {file:"bg05a",aspect:"landscape",alt:"Кошер в зелено поле под открито небе",photographer:"Being Organic in EU"},
      {file:"bg05b",aspect:"portrait",alt:"Кошер сред цъфтяща растителност",photographer:"Eric Dekker"},
    ], explicit: "bg05b",
  },
  {
    id: "BG-J06", market: "BG", sourceLanguage: "bg", objectKind: "plant", visibility: "private", coverBranch: "private_one_inline",
    spaceLabel: "Редакционна градина", objectLabel: "Домат", catalogIdentity: "Solanum lycopersicum",
    title: "Личен план за следващата проверка",
    body: "Редакционен пример за лична бележка. Тук може да остане работен план: проверка на опората, сравнение на влагата и ново наблюдение на листата след няколко дни. Частният запис не трябва да се появява в публични списъци, профили или търсене, докато собственикът не промени видимостта съзнателно.",
    entryDate: "2026-06-21", media: [{file:"bg06",aspect:"landscape",alt:"Ред дървени кошери върху зелена поляна",photographer:"iridial"}], explicit: null,
  },
  {
    id: "BG-J07", market: "BG", sourceLanguage: "bg", objectKind: "plant", visibility: "archived_410", coverBranch: "archived_one_inline",
    spaceLabel: "Редакционна градина", objectLabel: "Домат", catalogIdentity: "Solanum lycopersicum",
    title: "Архивиран редакционен пример за сезон",
    body: "Редакционен пример за архивиран запис. След края на демонстрационния сезон материалът излиза от активните списъци и търсенето, а предишният публичен адрес връща Gone. Така остарялото съдържание не остава видимо без обяснение и може да се провери целият жизнен цикъл на една публикация.",
    entryDate: "2026-06-25", media: [{file:"bg07",aspect:"landscape",alt:"Градински растения се поливат с маркуч",photographer:"shawnie yang"}], explicit: null,
  },
] as const;

const slots = [];
for (const draft of drafts) {
  const resolvedMedia = await Promise.all(draft.media.map(media));
  const explicitCoverMediaSha256 = draft.explicit
    ? resolvedMedia.find((item) => item.file === `media/${draft.explicit}.jpg`)?.sha256 ?? null
    : null;
  slots.push({
    id: draft.id,
    market: draft.market,
    sourceLanguage: draft.sourceLanguage,
    contentClass: "editorial" as const,
    byline: reviewedBy,
    objectKind: draft.objectKind,
    visibility: draft.visibility,
    coverBranch: draft.coverBranch,
    spaceLabel: draft.spaceLabel,
    objectLabel: draft.objectLabel,
    catalogIdentity: draft.catalogIdentity,
    title: draft.title,
    body: draft.body,
    entryDate: draft.entryDate,
    reviewedBy,
    media: resolvedMedia,
    explicitCoverMediaSha256,
  });
}

const pack = launchCorpusContentPackSchema.parse({
  version: LAUNCH_CORPUS_CONTENT_PACK_VERSION,
  issue: "OVE-199",
  planDigest,
  slots,
  dispositions: [
    "54aa4a7e756d7ff36e91d8bfe011b06ba673bcf6d8540f36fa8c83e45ae279c9",
    "677fe428cdf4e67bba636e1034a39d3030de6e769f9b0016bb65fa552b3db180",
    "9942a170eb84ce8c8c3b2bfc1acd466929988301011cb02797cc24986690a8d0",
    "ff2908f5b7dc4a6eaf16a87592a4928aae05bda214a7cdfcddcc5c576be7d538",
  ].map((targetHash) => ({
    targetHash,
    action: "reclassify_production_smoke_archive" as const,
    reviewedBy,
  })),
});

await writeFile(path.join(packRoot, "content-pack.json"), `${JSON.stringify(pack, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  ok: true,
  issue: "OVE-199",
  redacted: true,
  slotCount: pack.slots.length,
  mediaCount: pack.slots.reduce((count, slot) => count + slot.media.length, 0),
  contentPackDigest: digestLaunchCorpusContentPack(pack),
}));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Pack build failed.");
  process.exitCode = 1;
});

async function sha(file: string) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function requiredFlag(name: string) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredDigest(name: string) {
  const value = requiredFlag(name);
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

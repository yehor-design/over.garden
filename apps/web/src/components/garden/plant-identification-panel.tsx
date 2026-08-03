"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { InterfaceLocale } from "@/lib/interface-localization";

type Organ = "auto" | "leaf" | "flower" | "fruit" | "bark";

interface MediaOption {
  id: string;
  publicUrl: string;
}

interface Receipt {
  id?: string;
  state: string;
  canConfirm?: boolean;
  candidates?: Array<{
    rank: number;
    score: number;
    scientificName: string;
    genus: string | null;
    family: string | null;
    catalogItemId: string | null;
  }>;
}

export function PlantIdentificationPanel({
  locale,
  objectId,
  media,
}: {
  locale: InterfaceLocale;
  objectId: string;
  media: readonly MediaOption[];
}) {
  const copy = COPY[locale];
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    media.slice(0, 1).map((item) => item.id),
  );
  const [organsById, setOrgansById] = useState<Record<string, Organ>>({});
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const selectedMedia = useMemo(
    () => media.filter((item) => selectedIds.includes(item.id)),
    [media, selectedIds],
  );

  useEffect(() => {
    if (receipt) receiptRef.current?.focus();
  }, [receipt]);

  if (media.length === 0) {
    return (
      <section className="grid gap-2 rounded-lg border border-border p-4">
        <h3 className="text-base font-semibold text-foreground">
          {copy.title}
        </h3>
        <p className="text-sm text-muted-foreground">{copy.noPhotos}</p>
        <IdentificationFallbacks copy={copy} />
      </section>
    );
  }

  async function identify() {
    if (selectedMedia.length === 0 || pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/garden/plant-identification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plantObjectId: objectId,
          mediaAssetIds: selectedMedia.map((item) => item.id),
          organs: selectedMedia.map((item) => organsById[item.id] ?? "auto"),
        }),
      });
      setReceipt((await response.json()) as Receipt);
      setShowAllCandidates(false);
    } catch {
      setReceipt({ state: "provider_unavailable", candidates: [] });
      setShowAllCandidates(false);
    } finally {
      setPending(false);
    }
  }

  async function decide(
    decision: "confirmed" | "manual" | "unknown" | "dismissed",
    candidate?: NonNullable<Receipt["candidates"]>[number],
    fallbackHash?: string,
  ) {
    if (!receipt?.id || pending) return;
    setPending(true);
    try {
      const response = await fetch(
        "/api/garden/plant-identification/decision",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId: receipt.id,
            decision,
            rank: candidate?.rank ?? null,
            catalogItemId: candidate?.catalogItemId ?? null,
          }),
        },
      );
      if (!response.ok) throw new Error("decision unavailable");
      if (fallbackHash) {
        window.location.assign(fallbackHash);
        return;
      }
      window.location.reload();
    } catch {
      setReceipt(
        (current) =>
          current ?? { state: "provider_unavailable", candidates: [] },
      );
      setPending(false);
    }
  }

  function toggleMedia(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      return current.length >= 5 ? current : [...current, id];
    });
  }

  return (
    <section
      className="grid gap-4 rounded-lg border border-border p-4"
      aria-labelledby="plant-identification-title"
    >
      <div className="grid gap-1">
        <h3
          id="plant-identification-title"
          className="text-base font-semibold text-foreground"
        >
          {copy.title}
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium text-foreground">
          {copy.choosePhotos}
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {media.slice(0, 5).map((item) => (
            <label
              key={item.id}
              className="grid gap-2 rounded-md border border-border p-2 text-sm text-foreground"
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => toggleMedia(item.id)}
                />
                {copy.photo}
              </span>
              {/* This opaque R2 derivative URL is intentionally not routed through Next image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.publicUrl}
                alt=""
                className="aspect-video w-full rounded object-cover"
              />
              <select
                value={organsById[item.id] ?? "auto"}
                onChange={(event) =>
                  setOrgansById((current) => ({
                    ...current,
                    [item.id]: event.target.value as Organ,
                  }))
                }
                className="h-10 rounded-md border border-input bg-background px-2"
                aria-label={copy.organ}
              >
                <option value="auto">{copy.organs.auto}</option>
                <option value="leaf">{copy.organs.leaf}</option>
                <option value="flower">{copy.organs.flower}</option>
                <option value="fruit">{copy.organs.fruit}</option>
                <option value="bark">{copy.organs.bark}</option>
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void identify()}
          disabled={pending || selectedMedia.length === 0}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? copy.identifying : copy.identify}
        </button>
        <IdentificationFallbacks copy={copy} receipt={receipt} decide={decide} />
      </div>

      {receipt ? (
        <div
          ref={receiptRef}
          tabIndex={-1}
          aria-live="polite"
          className="grid gap-3 rounded-md border border-border p-3"
        >
          <p className="text-sm text-muted-foreground">
            {receiptMessage(copy, receipt.state)}
          </p>
          {receipt.canConfirm && receipt.candidates?.length ? (
            <div className="grid gap-2" role="list" aria-label={copy.candidates}>
              {receipt.candidates
                .slice(0, showAllCandidates ? 5 : 3)
                .map((candidate) => (
                <div
                  key={candidate.rank}
                  role="listitem"
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-2"
                >
                  <span className="text-sm text-foreground">
                    {candidate.scientificName}
                  </span>
                  <button
                    type="button"
                    onClick={() => void decide("confirmed", candidate)}
                    disabled={pending}
                    className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
                  >
                    {copy.confirm}
                  </button>
                </div>
              ))}
              {receipt.candidates.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setShowAllCandidates((current) => !current)}
                  aria-expanded={showAllCandidates}
                  className="w-fit rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  {showAllCandidates ? copy.showFewer : copy.showMore}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function IdentificationFallbacks({
  copy,
  receipt,
  decide,
}: {
  copy: (typeof COPY)[InterfaceLocale];
  receipt?: Receipt | null;
  decide?: (
    decision: "manual" | "unknown",
    candidate?: never,
    fallbackHash?: string,
  ) => Promise<void>;
}) {
  return (
    <>
      <a
        id="catalog-fallback-navigation"
        href="#passport-catalog"
        onClick={(event) => {
          if (!receipt?.id || !decide) return;
          event.preventDefault();
          void decide("manual", undefined, "#passport-catalog");
        }}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {copy.manual}
      </a>
      <a
        id="unknown-fallback-action"
        href="#passport-catalog"
        onClick={(event) => {
          if (!receipt?.id || !decide) return;
          event.preventDefault();
          void decide("unknown", undefined, "#passport-catalog");
        }}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {copy.unknown}
      </a>
    </>
  );
}

function receiptMessage(copy: (typeof COPY)[InterfaceLocale], state: string) {
  if (state === "shortlist_ready") return copy.ready;
  if (state === "submitting") return copy.identifying;
  if (state === "catalog_mapping_incomplete") return copy.mappingIncomplete;
  return copy.unavailable;
}

const COPY = {
  uk: {
    title: "Визначити рослину за фото",
    description:
      "Надсилаємо лише безпечну похідну копію фото. Результат — підказка: оберіть вид самостійно.",
    noPhotos: "Додайте й обробіть фото в записі, щоб визначити рослину.",
    choosePhotos: "Виберіть від 1 до 5 фото однієї рослини",
    photo: "Фото",
    organ: "Частина рослини на фото",
    organs: {
      auto: "Автовизначення",
      leaf: "Листок",
      flower: "Квітка",
      fruit: "Плід",
      bark: "Кора",
    },
    identify: "Визначити",
    identifying: "Визначаємо…",
    manual: "Шукати в каталозі",
    unknown: "Залишити невідомою",
    ready: "Оберіть вид із безпечно зіставлених результатів.",
    mappingIncomplete:
      "Жоден результат не вдалося безпечно зіставити з каталогом. Скористайтеся пошуком.",
    unavailable:
      "Визначення зараз недоступне. Ви все одно можете продовжити з каталогом або невідомим видом.",
    candidates: "Підказки щодо виду",
    confirm: "Підтвердити вид",
    showMore: "Показати ще варіанти",
    showFewer: "Показати менше",
  },
  bg: {
    title: "Разпознаване на растение по снимка",
    description:
      "Изпращаме само безопасно производно копие на снимката. Резултатът е подсказка — изберете вида сами.",
    noPhotos:
      "Добавете и обработете снимка в запис, за да разпознаете растението.",
    choosePhotos: "Изберете от 1 до 5 снимки на едно растение",
    photo: "Снимка",
    organ: "Част от растението на снимката",
    organs: {
      auto: "Автоматично",
      leaf: "Лист",
      flower: "Цвят",
      fruit: "Плод",
      bark: "Кора",
    },
    identify: "Разпознай",
    identifying: "Разпознаваме…",
    manual: "Търсене в каталога",
    unknown: "Остави като неизвестно",
    ready: "Изберете вид от безопасно съпоставените резултати.",
    mappingIncomplete:
      "Никой резултат не може да бъде безопасно съпоставен с каталога. Използвайте търсене.",
    unavailable:
      "Разпознаването не е налично. Можете да продължите с каталог или неизвестен вид.",
    candidates: "Подсказки за вида",
    confirm: "Потвърди вида",
    showMore: "Покажи още варианти",
    showFewer: "Покажи по-малко",
  },
  ru: {
    title: "Определить растение по фото",
    description:
      "Отправляется только безопасная производная копия фото. Результат — подсказка: выберите вид самостоятельно.",
    noPhotos:
      "Добавьте и обработайте фото в записи, чтобы определить растение.",
    choosePhotos: "Выберите от 1 до 5 фото одного растения",
    photo: "Фото",
    organ: "Часть растения на фото",
    organs: {
      auto: "Автоопределение",
      leaf: "Лист",
      flower: "Цветок",
      fruit: "Плод",
      bark: "Кора",
    },
    identify: "Определить",
    identifying: "Определяем…",
    manual: "Искать в каталоге",
    unknown: "Оставить неизвестным",
    ready: "Выберите вид из безопасно сопоставленных результатов.",
    mappingIncomplete:
      "Ни один результат не удалось безопасно сопоставить с каталогом. Используйте поиск.",
    unavailable:
      "Определение сейчас недоступно. Можно продолжить с каталогом или неизвестным видом.",
    candidates: "Подсказки вида",
    confirm: "Подтвердить вид",
    showMore: "Показать ещё варианты",
    showFewer: "Показать меньше",
  },
} as const;

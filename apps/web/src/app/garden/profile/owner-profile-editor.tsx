"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Eye, ImageOff, Save } from "lucide-react";

import { PublicProfileView } from "@/components/public/public-profile";
import { buttonVariants } from "@/components/ui/button";
import {
  COARSE_REGION_OPTIONS,
  type CoarseRegionCode,
} from "@/lib/garden/regions";
import type { InterfaceLocale } from "@/lib/interface-localization";
import { PUBLIC_PROFILE_LANGUAGE_LABELS } from "@/lib/public-profile-copy";
import { cn } from "@/lib/utils";
import type {
  OwnerProfileWorkspace,
  OwnerPublicProfileEditor,
} from "@/server/owner-profile-repository";
import type { PublicProfileLanguage } from "@/server/public-profile-repository";
import { updatePublicProfileAction } from "./actions";

const COPY = {
  uk: {
    editorTitle: "Публічний профіль",
    previewTitle: "Попередній перегляд",
    avatar: "Аватар",
    noAvatar: "Без аватара",
    handle: "Публічний нік",
    displayName: "Ім’я для показу",
    bio: "Про себе",
    languages: "Мови спілкування",
    location: "Регіон",
    hidden: "Не показувати",
    region: "Показувати лише регіон",
    visibility: "Видимість профілю",
    public: "Публічний",
    private: "Приватний",
    relationships: "Лічильники підписок",
    counts: "Показувати",
    save: "Зберегти профіль",
    saved: "Профіль збережено.",
    unchanged: "Змін немає.",
    taken: "Цей нік уже зайнятий.",
    invalid: "Перевірте виділені значення.",
    avatarInvalid: "Оберіть доступне оброблене фото.",
  },
  bg: {
    editorTitle: "Публичен профил",
    previewTitle: "Преглед",
    avatar: "Аватар",
    noAvatar: "Без аватар",
    handle: "Публично име",
    displayName: "Име за показване",
    bio: "За мен",
    languages: "Езици за общуване",
    location: "Регион",
    hidden: "Не показвай",
    region: "Показвай само регион",
    visibility: "Видимост на профила",
    public: "Публичен",
    private: "Частен",
    relationships: "Броячи за следване",
    counts: "Показвай",
    save: "Запази профила",
    saved: "Профилът е запазен.",
    unchanged: "Няма промени.",
    taken: "Това име вече е заето.",
    invalid: "Проверете въведените стойности.",
    avatarInvalid: "Изберете достъпна обработена снимка.",
  },
  ru: {
    editorTitle: "Публичный профиль",
    previewTitle: "Предпросмотр",
    avatar: "Аватар",
    noAvatar: "Без аватара",
    handle: "Публичный ник",
    displayName: "Отображаемое имя",
    bio: "О себе",
    languages: "Языки общения",
    location: "Регион",
    hidden: "Не показывать",
    region: "Показывать только регион",
    visibility: "Видимость профиля",
    public: "Публичный",
    private: "Приватный",
    relationships: "Счётчики подписок",
    counts: "Показывать",
    save: "Сохранить профиль",
    saved: "Профиль сохранён.",
    unchanged: "Изменений нет.",
    taken: "Этот ник уже занят.",
    invalid: "Проверьте введённые значения.",
    avatarInvalid: "Выберите доступное обработанное фото.",
  },
} as const;

const PROFILE_LANGUAGES = ["uk", "bg", "ru", "en"] as const;

export function OwnerProfileEditor({
  workspace,
  locale,
  status,
}: {
  workspace: OwnerProfileWorkspace;
  locale: InterfaceLocale;
  status: string | null;
}) {
  const copy = COPY[locale];
  const [editor, setEditor] = useState<OwnerPublicProfileEditor>(
    workspace.editor,
  );
  const selectedAvatar = workspace.avatarOptions.find(
    (option) => option.mediaAssetId === editor.avatarMediaAssetId,
  );
  const normalizedHandle =
    editor.handle.trim().replace(/^@/u, "").toLowerCase() ||
    workspace.preview.handle;
  const preview = useMemo(
    () => ({
      ...workspace.preview,
      handle: normalizedHandle,
      mention: `@${normalizedHandle}` as `@${string}`,
      displayName: editor.displayName?.trim() || `@${normalizedHandle}`,
      avatarUrl: selectedAvatar?.publicUrl ?? null,
      avatarAlt:
        selectedAvatar?.alt ??
        editor.displayName?.trim() ??
        `@${normalizedHandle}`,
      bio: editor.bio?.trim() || null,
      languages: editor.languages,
      coarseRegionCode:
        editor.locationVisibility === "region" ? editor.coarseRegionCode : null,
      summary: {
        ...workspace.preview.summary,
        relationships:
          editor.relationshipVisibility === "counts"
            ? workspace.relationshipCounts
            : null,
      },
    }),
    [
      editor,
      normalizedHandle,
      selectedAvatar,
      workspace.preview,
      workspace.relationshipCounts,
    ],
  );
  const statusMessage = profileEditorStatus(status, copy);

  return (
    <div data-owner-profile-editor="v2" className="grid gap-10">
      <section
        id="public-profile-editor"
        className="grid gap-5 border-b border-border pb-8"
      >
        <h2 className="text-xl font-semibold text-foreground">
          {copy.editorTitle}
        </h2>
        <form action={updatePublicProfileAction} className="grid gap-6">
          <fieldset className="grid gap-3">
            <legend className="text-sm font-semibold text-foreground">
              {copy.avatar}
            </legend>
            <div className="flex flex-wrap gap-3">
              <label
                className={avatarOptionClass(
                  editor.avatarMediaAssetId === null,
                )}
              >
                <input
                  type="radio"
                  name="avatarMediaAssetId"
                  value=""
                  checked={editor.avatarMediaAssetId === null}
                  onChange={() =>
                    setEditor((current) => ({
                      ...current,
                      avatarMediaAssetId: null,
                    }))
                  }
                  className="sr-only"
                />
                <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <ImageOff className="size-5" aria-hidden="true" />
                </span>
                <span className="text-xs font-medium">{copy.noAvatar}</span>
              </label>
              {workspace.avatarOptions.map((option) => (
                <label
                  key={option.mediaAssetId}
                  className={avatarOptionClass(
                    editor.avatarMediaAssetId === option.mediaAssetId,
                  )}
                >
                  <input
                    type="radio"
                    name="avatarMediaAssetId"
                    value={option.mediaAssetId}
                    checked={editor.avatarMediaAssetId === option.mediaAssetId}
                    onChange={() =>
                      setEditor((current) => ({
                        ...current,
                        avatarMediaAssetId: option.mediaAssetId,
                      }))
                    }
                    className="sr-only"
                  />
                  <Image
                    src={option.publicUrl}
                    alt={option.alt}
                    width={56}
                    height={56}
                    unoptimized
                    className="size-14 rounded-full object-cover"
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              {copy.handle}
              <span className="flex overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="border-r border-border px-3 py-2 text-muted-foreground">
                  @
                </span>
                <input
                  name="handle"
                  value={editor.handle}
                  onChange={(event) =>
                    setEditor((current) => ({
                      ...current,
                      handle: event.target.value,
                    }))
                  }
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9_]+"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="min-w-0 flex-1 bg-background px-3 py-2 font-normal outline-none"
                />
              </span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              {copy.displayName}
              <input
                name="displayName"
                value={editor.displayName ?? ""}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
                maxLength={80}
                className="h-10 rounded-md border border-input bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>

          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            {copy.bio}
            <textarea
              name="bio"
              value={editor.bio ?? ""}
              onChange={(event) =>
                setEditor((current) => ({
                  ...current,
                  bio: event.target.value,
                }))
              }
              maxLength={600}
              rows={5}
              className="min-h-28 resize-y rounded-md border border-input bg-background px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-right text-xs font-normal text-muted-foreground tabular-nums">
              {editor.bio?.length ?? 0}/600
            </span>
          </label>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold text-foreground">
              {copy.languages}
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {PROFILE_LANGUAGES.map((language) => (
                <label
                  key={language}
                  className="inline-flex min-h-9 items-center gap-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    name="languages"
                    value={language}
                    checked={editor.languages.includes(language)}
                    onChange={() =>
                      setEditor((current) => ({
                        ...current,
                        languages: toggleLanguage(current.languages, language),
                      }))
                    }
                    className="size-4 rounded border-input accent-primary"
                  />
                  {PUBLIC_PROFILE_LANGUAGE_LABELS[locale][language]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="text-sm font-semibold text-foreground">
              {copy.location}
            </legend>
            <SegmentedChoice
              name="locationVisibility"
              value={editor.locationVisibility}
              options={[
                { value: "hidden", label: copy.hidden },
                { value: "region", label: copy.region },
              ]}
              onChange={(value) =>
                setEditor((current) => ({
                  ...current,
                  locationVisibility: value as "hidden" | "region",
                }))
              }
            />
            <select
              name="coarseRegionCode"
              value={editor.coarseRegionCode ?? ""}
              onChange={(event) =>
                setEditor((current) => ({
                  ...current,
                  coarseRegionCode: (event.target.value ||
                    null) as CoarseRegionCode | null,
                }))
              }
              disabled={editor.locationVisibility === "hidden"}
              required={editor.locationVisibility === "region"}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-50 sm:max-w-md"
            >
              <option value="">{copy.region}</option>
              {COARSE_REGION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-foreground">
                {copy.visibility}
              </legend>
              <SegmentedChoice
                name="profileVisibility"
                value={editor.profileVisibility}
                options={[
                  { value: "public", label: copy.public },
                  { value: "private", label: copy.private },
                ]}
                onChange={(value) =>
                  setEditor((current) => ({
                    ...current,
                    profileVisibility: value as "public" | "private",
                  }))
                }
              />
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold text-foreground">
                {copy.relationships}
              </legend>
              <SegmentedChoice
                name="relationshipVisibility"
                value={editor.relationshipVisibility}
                options={[
                  { value: "counts", label: copy.counts },
                  { value: "hidden", label: copy.hidden },
                ]}
                onChange={(value) =>
                  setEditor((current) => ({
                    ...current,
                    relationshipVisibility: value as "counts" | "hidden",
                  }))
                }
              />
            </fieldset>
          </div>

          {statusMessage ? (
            <p
              role="status"
              className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
            >
              {statusMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className={buttonVariants({ className: "w-fit" })}
          >
            <Save aria-hidden="true" />
            {copy.save}
          </button>
        </form>
      </section>

      <section
        id="public-profile-preview"
        data-public-preview-audience="visitor"
        className="grid gap-5"
        onSubmitCapture={(event) => event.preventDefault()}
      >
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Eye className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-xl font-semibold text-foreground">
            {copy.previewTitle}
          </h2>
        </div>
        <PublicProfileView
          profile={preview}
          locale={locale}
          viewer={{ kind: "guest" }}
          previewVisibility={editor.profileVisibility}
        />
      </section>
    </div>
  );
}

function SegmentedChoice({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex w-fit max-w-full overflow-hidden rounded-md border border-input bg-muted p-0.5">
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "cursor-pointer rounded-sm px-3 py-1.5 text-sm font-medium break-words transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

function avatarOptionClass(active: boolean) {
  return cn(
    "flex min-w-20 cursor-pointer flex-col items-center gap-2 rounded-md border p-2 text-foreground transition-colors",
    active
      ? "border-primary bg-primary/5"
      : "border-border hover:border-primary/60",
  );
}

function toggleLanguage(
  current: PublicProfileLanguage[],
  language: PublicProfileLanguage,
) {
  return current.includes(language)
    ? current.filter((value) => value !== language)
    : [...current, language].slice(0, 4);
}

function profileEditorStatus(
  status: string | null,
  copy: (typeof COPY)[InterfaceLocale],
) {
  if (status === "updated") return copy.saved;
  if (status === "unchanged") return copy.unchanged;
  if (status === "taken") return copy.taken;
  if (status === "avatar") return copy.avatarInvalid;
  if (
    status &&
    [
      "empty",
      "format",
      "reserved",
      "blocked",
      "display_name",
      "bio",
      "languages",
      "region",
      "profile_visibility",
      "relationship_visibility",
    ].includes(status)
  )
    return copy.invalid;
  return null;
}

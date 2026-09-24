"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { AtIcon as AtSign } from "@/components/icons/At";
import { EyeIcon as Eye } from "@/components/icons/Eye";
import { GlobeIcon as Globe } from "@/components/icons/Globe";
import { ImageBrokenIcon as ImageOff } from "@/components/icons/ImageBroken";
import { MapPinIcon as MapPin } from "@/components/icons/MapPin";
import { FloppyDiskIcon as Save } from "@/components/icons/FloppyDisk";
import { TranslateIcon as Translate } from "@/components/icons/Translate";

import {
  OwnerUserIdField,
  useOptionalOwnerScope,
} from "@/components/auth/owner-scope";
import { buttonVariants } from "@/components/ui/button";
import { ProfileHeader } from "@/components/ui/profile-header";
import {
  getLocalizedCoarseRegionLabel,
  getLocalizedCoarseRegionOptions,
  type CoarseRegionCode,
} from "@/lib/garden/regions";
import type { InterfaceLocale } from "@/lib/interface-localization";
import {
  formatPublicProfileCount,
  PUBLIC_PROFILE_LANGUAGE_LABELS,
} from "@/lib/public-profile-copy";
import { cn } from "@/lib/utils";
import type {
  OwnerProfileWorkspace,
  OwnerPublicProfileEditor,
} from "@/server/owner-profile-repository";
import type { PublicProfileLanguage } from "@/server/public-profile-repository";
import {
  updatePublicHandleAction,
  updatePublicProfileAction,
  type PublicHandleActionState,
  type PublicProfileActionState,
} from "./actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const COPY = {
  uk: {
    editorTitle: "Як вас бачать інші",
    editorDescription:
      "Усе в цій формі — на вашій публічній сторінці {address}. Її бачить кожен, навіть без входу.",
    previewTitle: "Як це виглядає",
    previewNote:
      "Лише перегляд. Зміни з’являться на сторінці після збереження.",
    avatar: "Аватар",
    avatarDescription: "Видно всім: у профілі й поруч із вашими записами.",
    noAvatar: "Без аватара",
    handle: "Нова адреса",
    handleTitle: "Публічна адреса",
    currentHandle: "Зараз ваша сторінка:",
    handleHelp:
      "3–30 малих латинських літер, цифр або _, першим — літера чи цифра.",
    handleConsequencesTitle: "Що зміниться",
    handleConsequences: [
      "Ваш профіль відкриватиметься за новою адресою; стара адреса профілю перестане працювати.",
      "Посилання на ваші записи й об’єкти за старою адресою переспрямують на нову.",
      "Старий нік ніхто не зможе зайняти.",
      "Наступну зміну можна буде зробити не раніше ніж через 30 днів.",
    ],
    handleFormat:
      "Нік має містити від 3 до 30 малих латинських літер, цифр або символів _. Він має починатися з літери чи цифри.",
    handleUnavailable: "Цей нік недоступний. Спробуйте інший.",
    handleCooldown: "Нік можна буде змінити після {date}.",
    handleUpdated: "Адресу змінено.",
    handleUnchanged: "Це вже ваш поточний нік.",
    renameHandle: "Змінити адресу",
    renamingHandle: "Змінюємо…",
    displayName: "Ім’я для показу",
    displayNameDescription: "Видно всім: у профілі й над кожним вашим записом.",
    bio: "Про себе",
    bioDescription: "Видно всім у профілі, з вашими переносами рядків.",
    languages: "Мови спілкування",
    languagesDescription: "Видно всім у профілі.",
    location: "Регіон",
    locationDescription:
      "Лише область, для міст — лише країна. Точне місце ми ніколи не показуємо.",
    hidden: "Не показувати",
    region: "Показувати регіон",
    regionPlaceholder: "Оберіть регіон",
    relationships: "Підписники й підписки",
    relationshipsDescription:
      "Скільки людей стежать за вами і за скількома стежите ви.",
    counts: "Показувати",
    save: "Зберегти профіль",
    saving: "Зберігаємо…",
    saved: "Профіль збережено.",
    unchanged: "Змін немає.",
    displayUnavailable: "Ім’я для показу недоступне. Спробуйте інше.",
    invalid: "Перевірте виділені значення.",
    avatarInvalid: "Оберіть доступне оброблене фото.",
  },
  bg: {
    editorTitle: "Как ви виждат другите",
    editorDescription:
      "Всичко в този формуляр е на публичната ви страница {address}. Вижда я всеки, дори без вход.",
    previewTitle: "Как изглежда",
    previewNote:
      "Само преглед. Промените се появяват на страницата след запазване.",
    avatar: "Аватар",
    avatarDescription: "Вижда се от всички: в профила и до вашите записи.",
    noAvatar: "Без аватар",
    handle: "Нов адрес",
    handleTitle: "Публичен адрес",
    currentHandle: "Сега страницата ви е:",
    handleHelp:
      "3–30 малки латински букви, цифри или _, като първият знак е буква или цифра.",
    handleConsequencesTitle: "Какво ще се промени",
    handleConsequences: [
      "Профилът ви ще се отваря на новия адрес; старият адрес на профила спира да работи.",
      "Връзките към вашите записи и обекти на стария адрес ще пренасочват към новия.",
      "Никой няма да може да вземе старото име.",
      "Следващата промяна ще е възможна след най-малко 30 дни.",
    ],
    handleFormat:
      "Потребителското име трябва да съдържа от 3 до 30 малки латински букви, цифри или символи _. То трябва да започва с буква или цифра.",
    handleUnavailable: "Това потребителско име не е достъпно. Опитайте друго.",
    handleCooldown: "Ще можете да промените потребителското име след {date}.",
    handleUpdated: "Адресът е променен.",
    handleUnchanged: "Това вече е текущото ви потребителско име.",
    renameHandle: "Промени адреса",
    renamingHandle: "Променя се…",
    displayName: "Име за показване",
    displayNameDescription:
      "Вижда се от всички: в профила и над всеки ваш запис.",
    bio: "За мен",
    bioDescription: "Вижда се от всички в профила, с вашите нови редове.",
    languages: "Езици за общуване",
    languagesDescription: "Вижда се от всички в профила.",
    location: "Регион",
    locationDescription:
      "Само областта, а за градовете — само държавата. Точното място никога не показваме.",
    hidden: "Не показвай",
    region: "Показвай региона",
    regionPlaceholder: "Изберете регион",
    relationships: "Последователи и последвани",
    relationshipsDescription: "Колко души ви следват и колко следвате вие.",
    counts: "Показвай",
    save: "Запази профила",
    saving: "Запазва се…",
    saved: "Профилът е запазен.",
    unchanged: "Няма промени.",
    displayUnavailable: "Името за показване не е достъпно. Опитайте друго.",
    invalid: "Проверете въведените стойности.",
    avatarInvalid: "Изберете достъпна обработена снимка.",
  },
  ru: {
    editorTitle: "Как вас видят другие",
    editorDescription:
      "Всё в этой форме — на вашей публичной странице {address}. Её видит каждый, даже без входа.",
    previewTitle: "Как это выглядит",
    previewNote:
      "Только просмотр. Изменения появятся на странице после сохранения.",
    avatar: "Аватар",
    avatarDescription: "Видно всем: в профиле и рядом с вашими записями.",
    noAvatar: "Без аватара",
    handle: "Новый адрес",
    handleTitle: "Публичный адрес",
    currentHandle: "Сейчас ваша страница:",
    handleHelp:
      "3–30 строчных латинских букв, цифр или _, первым — буква или цифра.",
    handleConsequencesTitle: "Что изменится",
    handleConsequences: [
      "Ваш профиль будет открываться по новому адресу; старый адрес профиля перестанет работать.",
      "Ссылки на ваши записи и объекты по старому адресу перенаправят на новый.",
      "Старый ник никто не сможет занять.",
      "Следующую смену можно будет сделать не раньше чем через 30 дней.",
    ],
    handleFormat:
      "Ник должен содержать от 3 до 30 строчных латинских букв, цифр или символов _. Он должен начинаться с буквы или цифры.",
    handleUnavailable: "Этот ник недоступен. Попробуйте другой.",
    handleCooldown: "Ник можно будет изменить после {date}.",
    handleUpdated: "Адрес изменён.",
    handleUnchanged: "Это уже ваш текущий ник.",
    renameHandle: "Изменить адрес",
    renamingHandle: "Изменяем…",
    displayName: "Отображаемое имя",
    displayNameDescription: "Видно всем: в профиле и над каждой вашей записью.",
    bio: "О себе",
    bioDescription: "Видно всем в профиле, с вашими переносами строк.",
    languages: "Языки общения",
    languagesDescription: "Видно всем в профиле.",
    location: "Регион",
    locationDescription:
      "Только область, для городов — только страна. Точное место мы никогда не показываем.",
    hidden: "Не показывать",
    region: "Показывать регион",
    regionPlaceholder: "Выберите регион",
    relationships: "Подписчики и подписки",
    relationshipsDescription:
      "Сколько людей следят за вами и за сколькими следите вы.",
    counts: "Показывать",
    save: "Сохранить профиль",
    saving: "Сохраняем…",
    saved: "Профиль сохранён.",
    unchanged: "Изменений нет.",
    displayUnavailable: "Отображаемое имя недоступно. Попробуйте другое.",
    invalid: "Проверьте введённые значения.",
    avatarInvalid: "Выберите доступное обработанное фото.",
  },
} as const;

const PROFILE_LANGUAGES = ["uk", "bg", "ru", "en"] as const;
const MAX_BROWSER_TIMER_DELAY_MS = 2_147_000_000;
/** A city is more precise than a profile says where its gardener lives. */
const COUNTRY_ONLY_PROFILE_REGION_CODES = new Set(["UA-30", "UA-40", "BG-22"]);

/**
 * The owner's public identity (`OVE-503`).
 *
 * Two forms, in the order a gardener reaches for them: **how others see you**
 * — picture, name, bio, languages, region and relationship counts, each saying
 * who sees it — and, below it, **the public address**, a consequential change
 * with its own form that says what moves before it moves. They save
 * separately: a failed handle does not unsave a bio, and a bio is never
 * validated together with a handle.
 *
 * The preview is optional and read-only: the profile's own header, drawn from
 * what is in the form, behind a disclosure.
 */
export function OwnerProfileEditor({
  workspace,
  locale,
  status: initialStatus,
}: {
  workspace: OwnerProfileWorkspace;
  locale: InterfaceLocale;
  /** A status carried in the address, from before the form answered in place. */
  status: string | null;
}) {
  const documentMutation = useOptionalOwnerScope();
  const copy = COPY[locale];
  const [editor, setEditor] = useState<OwnerPublicProfileEditor>(
    workspace.editor,
  );
  const initialHandleState: PublicHandleActionState = {
    status: workspace.handleRename.canRename ? null : "cooldown",
    currentHandle: workspace.handleRename.currentHandle,
    nextEligibleAt: workspace.handleRename.nextEligibleAt
      ? new Date(workspace.handleRename.nextEligibleAt).toISOString()
      : null,
  };
  const [handleState, handleFormAction, handlePending] = useActionState(
    updatePublicHandleAction,
    initialHandleState,
  );
  const handledHandleAdmissionStateRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (
      handleState.mutationScope &&
      handledHandleAdmissionStateRef.current !== handleState
    ) {
      handledHandleAdmissionStateRef.current = handleState;
      documentMutation?.handleActionResult({
        mutationScope: handleState.mutationScope,
      });
    }
  }, [documentMutation, handleState]);
  // The profile form answers in place (`OVE-503`): a redirect would mount
  // the editor afresh and lose a refused name the gardener typed.
  const [profileState, profileFormAction, profilePending] = useActionState(
    updatePublicProfileAction,
    { status: initialStatus } satisfies PublicProfileActionState,
  );
  const handledProfileStateRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (
      profileState.mutationScope &&
      handledProfileStateRef.current !== profileState
    ) {
      handledProfileStateRef.current = profileState;
      documentMutation?.handleActionResult({
        mutationScope: profileState.mutationScope,
      });
    }
  }, [documentMutation, profileState]);
  const status = profileState.status;
  const [handleCandidate, setHandleCandidate] = useState(
    workspace.handleRename.currentHandle,
  );
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const [expiredEligibility, setExpiredEligibility] = useState<string | null>(
    null,
  );
  const handleInputRef = useRef<HTMLInputElement>(null);
  const committedHandle = handleState.currentHandle;
  const handleError =
    handleState.status === "format" || handleState.status === "unavailable";
  const canRename =
    handleState.nextEligibleAt === null ||
    (handleState.status === null && workspace.handleRename.canRename) ||
    expiredEligibility === handleState.nextEligibleAt;
  const visibleHandleState: PublicHandleActionState =
    handleState.status === "cooldown" && canRename
      ? { ...handleState, status: null }
      : handleState;

  useEffect(() => {
    const eligibility = handleState.nextEligibleAt;
    if (!eligibility) return;

    const eligibleAt = new Date(eligibility).getTime();
    if (!Number.isFinite(eligibleAt)) return;

    let timeoutId: number | undefined;
    const scheduleEligibilityRefresh = () => {
      const remaining = eligibleAt - Date.now();
      if (remaining <= 0) {
        setExpiredEligibility(eligibility);
        return;
      }

      timeoutId = window.setTimeout(
        scheduleEligibilityRefresh,
        Math.min(remaining, MAX_BROWSER_TIMER_DELAY_MS),
      );
    };

    scheduleEligibilityRefresh();
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [handleState.nextEligibleAt]);

  useEffect(() => {
    if (handleError) {
      handleInputRef.current?.focus();
    }
  }, [handleError, handleState]);

  const displayNameError =
    status === "display_name" || status === "display_name_unavailable";
  useEffect(() => {
    if (displayNameError) displayNameInputRef.current?.focus();
  }, [displayNameError, profileState]);

  const selectedAvatar = workspace.avatarOptions.find(
    (option) => option.mediaAssetId === editor.avatarMediaAssetId,
  );
  const statusMessage = profileEditorStatus(status, copy);
  const address = `over.garden/@${committedHandle}`;
  const regionLabel =
    editor.locationVisibility === "region"
      ? publicRegionLabel(locale, editor.coarseRegionCode)
      : null;
  const previewCounts =
    editor.relationshipVisibility === "counts"
      ? [
          workspace.relationshipCounts.followers > 0
            ? formatPublicProfileCount(
                locale,
                "followers",
                workspace.relationshipCounts.followers,
              )
            : null,
          workspace.relationshipCounts.following > 0
            ? formatPublicProfileCount(
                locale,
                "following",
                workspace.relationshipCounts.following,
              )
            : null,
        ].filter((count): count is string => count !== null)
      : [];

  return (
    <div data-owner-profile-editor="v4" className="grid gap-10">
      <section
        id="public-profile-editor"
        aria-labelledby="public-profile-editor-title"
        className="grid gap-5"
      >
        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <Globe className="size-5 text-text-muted" aria-hidden="true" />
            <h2
              id="public-profile-editor-title"
              className="text-h2 text-text-heading"
            >
              {copy.editorTitle}
            </h2>
          </div>
          <p className="max-w-prose text-body-sm text-text-muted">
            {copy.editorDescription.replace("{address}", address)}
          </p>
        </div>
        <form
          action={profileFormAction}
          className="grid gap-6"
          data-owner-scoped-form="true"
        >
          <OwnerUserIdField />
          <fieldset
            className="grid gap-3"
            aria-describedby="profile-avatar-description"
          >
            <legend className="text-h4 text-text-heading">{copy.avatar}</legend>
            <p
              id="profile-avatar-description"
              className="text-caption text-text-muted"
            >
              {copy.avatarDescription}
            </p>
            <div className="flex flex-wrap gap-3">
              <Radio
                presentation="custom"
                label={copy.noAvatar}
                name="avatarMediaAssetId"
                value=""
                checked={editor.avatarMediaAssetId === null}
                onChange={() =>
                  setEditor((current) => ({
                    ...current,
                    avatarMediaAssetId: null,
                  }))
                }
                className={avatarOptionClass(
                  editor.avatarMediaAssetId === null,
                )}
              >
                <span className="flex size-14 items-center justify-center rounded-full bg-surface-sunken text-text-muted">
                  <ImageOff className="size-5" aria-hidden="true" />
                </span>
                <span className="text-caption font-medium">
                  {copy.noAvatar}
                </span>
              </Radio>
              {workspace.avatarOptions.map((option) => (
                <Radio
                  key={option.mediaAssetId}
                  presentation="custom"
                  label={option.alt}
                  name="avatarMediaAssetId"
                  value={option.mediaAssetId}
                  checked={editor.avatarMediaAssetId === option.mediaAssetId}
                  onChange={() =>
                    setEditor((current) => ({
                      ...current,
                      avatarMediaAssetId: option.mediaAssetId,
                    }))
                  }
                  className={avatarOptionClass(
                    editor.avatarMediaAssetId === option.mediaAssetId,
                  )}
                >
                  <Image
                    src={option.publicUrl}
                    alt=""
                    width={56}
                    height={56}
                    unoptimized
                    className="size-14 rounded-full object-cover"
                  />
                </Radio>
              ))}
            </div>
          </fieldset>

          <Field
            label={copy.displayName}
            description={copy.displayNameDescription}
            error={displayNameError ? statusMessage : undefined}
            className="max-w-xl"
          >
            <Input
              ref={displayNameInputRef}
              name="displayName"
              value={editor.displayName ?? ""}
              onChange={(event) =>
                setEditor((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              maxLength={80}
              autoComplete="nickname"
            />
          </Field>

          <Field
            label={copy.bio}
            description={copy.bioDescription}
            mark={`${editor.bio?.length ?? 0}/600`}
          >
            <Textarea
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
              className="min-h-28"
            />
          </Field>

          <fieldset
            className="grid gap-2"
            aria-describedby="profile-languages-description"
          >
            <legend className="text-h4 text-text-heading">
              {copy.languages}
            </legend>
            <p
              id="profile-languages-description"
              className="text-caption text-text-muted"
            >
              {copy.languagesDescription}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {PROFILE_LANGUAGES.map((language) => (
                <Checkbox
                  key={language}
                  name="languages"
                  value={language}
                  checked={editor.languages.includes(language)}
                  onChange={() =>
                    setEditor((current) => ({
                      ...current,
                      languages: toggleLanguage(current.languages, language),
                    }))
                  }
                  label={PUBLIC_PROFILE_LANGUAGE_LABELS[locale][language]}
                  className="inline-flex items-center"
                />
              ))}
            </div>
          </fieldset>

          <fieldset
            className="grid gap-3"
            aria-describedby="profile-location-description"
          >
            <legend className="text-h4 text-text-heading">
              {copy.location}
            </legend>
            <p
              id="profile-location-description"
              className="text-caption text-text-muted"
            >
              {copy.locationDescription}
            </p>
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
            {/* The cap on a box around the control: `Select` keeps its chevron
                in a full-width wrapper, so a width on the `<select>` itself
                left the chevron far out at the row's end. */}
            <div className="sm:max-w-md">
              <Select
                name="coarseRegionCode"
                aria-label={copy.location}
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
              >
                <option value="">{copy.regionPlaceholder}</option>
                {getLocalizedCoarseRegionOptions(locale).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </fieldset>

          <fieldset
            className="grid gap-2"
            aria-describedby="profile-relationships-description"
          >
            <legend className="text-h4 text-text-heading">
              {copy.relationships}
            </legend>
            <p
              id="profile-relationships-description"
              className="text-caption text-text-muted"
            >
              {copy.relationshipsDescription}
            </p>
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

          {statusMessage && !displayNameError ? (
            <p
              id="public-profile-status"
              role={
                status === "updated" || status === "unchanged"
                  ? "status"
                  : "alert"
              }
              aria-live={
                status === "updated" || status === "unchanged"
                  ? "polite"
                  : "assertive"
              }
              className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-body-sm text-text"
            >
              {statusMessage}
            </p>
          ) : null}

          <button
            type="submit"
            // `aria-busy`, not `disabled`: focus stays where it was, and a
            // second press while the first is on its way is simply refused.
            aria-busy={profilePending || undefined}
            onClick={(event) => {
              if (profilePending) event.preventDefault();
            }}
            className={buttonVariants({ className: "w-fit" })}
          >
            <Save aria-hidden="true" />
            {profilePending ? copy.saving : copy.save}
          </button>
        </form>

        <details
          id="public-profile-preview"
          data-public-preview-audience="visitor"
          className="group grid rounded-lg border border-border"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-body-sm font-medium text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring">
            <Eye className="size-4 text-text-muted" aria-hidden="true" />
            {copy.previewTitle}
          </summary>
          <div className="grid gap-3 border-t border-border p-4">
            <p className="text-caption text-text-muted">{copy.previewNote}</p>
            <ProfileHeader
              avatarUrl={selectedAvatar?.publicUrl ?? null}
              displayName={editor.displayName?.trim() || `@${committedHandle}`}
              handle={`@${committedHandle}`}
              bio={editor.bio?.trim() || null}
              headingLevel="h3"
              meta={
                regionLabel || editor.languages.length > 0 ? (
                  <>
                    {regionLabel ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin
                          className="size-4 shrink-0"
                          aria-hidden="true"
                        />
                        {regionLabel}
                      </span>
                    ) : null}
                    {editor.languages.length > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Translate
                          className="size-4 shrink-0"
                          aria-hidden="true"
                        />
                        {editor.languages
                          .map(
                            (language) =>
                              PUBLIC_PROFILE_LANGUAGE_LABELS[locale][language],
                          )
                          .join(" · ")}
                      </span>
                    ) : null}
                  </>
                ) : null
              }
              counts={previewCounts}
            />
          </div>
        </details>
      </section>

      <section
        id="public-handle-editor"
        aria-labelledby="public-handle-editor-title"
        className="grid gap-5 border-t border-border pt-8"
      >
        <div className="flex items-center gap-2">
          <AtSign className="size-5 text-text-muted" aria-hidden="true" />
          <h2
            id="public-handle-editor-title"
            className="text-h2 text-text-heading"
          >
            {copy.handleTitle}
          </h2>
        </div>
        <p className="min-w-0 text-body-sm text-text-muted">
          {`${copy.currentHandle} `}
          <strong className="wrap-anywhere text-text">{address}</strong>
        </p>
        <div className="grid max-w-xl gap-2 rounded-lg border border-border bg-surface-sunken p-4">
          <h3 className="text-h4 text-text-heading">
            {copy.handleConsequencesTitle}
          </h3>
          <ul className="grid list-disc gap-1 pl-5 text-body-sm text-text">
            {copy.handleConsequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <form
          action={handleFormAction}
          className="grid max-w-xl gap-3"
          data-owner-scoped-form="true"
          noValidate
        >
          <OwnerUserIdField />
          <label
            htmlFor="public-handle-candidate"
            className="text-body-sm font-medium text-text"
          >
            {copy.handle}
          </label>
          <span className="flex overflow-hidden rounded-md border border-border-control bg-surface focus-within:ring-2 focus-within:ring-ring">
            <span className="border-r border-border px-3 py-2 text-text-muted">
              @
            </span>
            <Input
              ref={handleInputRef}
              id="public-handle-candidate"
              name="handle"
              value={handleCandidate}
              onChange={(event) => setHandleCandidate(event.target.value)}
              readOnly={handlePending}
              required
              minLength={3}
              maxLength={30}
              pattern="[a-z0-9][a-z0-9_]{2,29}"
              autoCapitalize="none"
              // Not `username`: a handle is a public address, not how anyone
              // signs in (that is the email), so a password manager has no
              // business offering or saving it here.
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-busy={handlePending || undefined}
              aria-invalid={handleError}
              aria-describedby="public-handle-help public-handle-status"
              /* The `@` prefix and the group's own border own the boundary, so
                 the control inside it drops its border rather than doubling it. */
              className="min-w-0 flex-1 rounded-none border-0 bg-transparent read-only:bg-transparent"
            />
          </span>
          <p id="public-handle-help" className="text-caption text-text-muted">
            {copy.handleHelp}
          </p>
          <HandleStatus
            state={visibleHandleState}
            locale={locale}
            copy={copy}
            showEligibility={!canRename}
          />
          <button
            type="submit"
            disabled={handlePending || !canRename}
            className={buttonVariants({
              variant: "secondary",
              className: "w-fit",
            })}
          >
            <AtSign aria-hidden="true" />
            {handlePending ? copy.renamingHandle : copy.renameHandle}
          </button>
        </form>
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
    <div className="inline-flex w-fit max-w-full overflow-hidden rounded-md border border-border-control bg-surface-sunken p-0.5">
      {options.map((option) => (
        <Radio
          key={option.value}
          presentation="custom"
          label={option.label}
          name={name}
          value={option.value}
          checked={value === option.value}
          onChange={() => onChange(option.value)}
          className={cn(
            "rounded-sm px-3 py-1.5 text-body-sm font-medium break-words transition-colors",
            value === option.value
              ? "bg-surface text-text"
              : "text-text-muted hover:text-text",
          )}
        >
          {option.label}
        </Radio>
      ))}
    </div>
  );
}

function avatarOptionClass(active: boolean) {
  return cn(
    "flex min-w-20 cursor-pointer flex-col items-center gap-2 rounded-md border p-2 text-text transition-colors",
    active
      ? "border-action bg-action-subtle"
      : "border-border hover:border-border-control",
  );
}

/** The region as the public profile shows it: a city narrowed to its country. */
function publicRegionLabel(
  locale: InterfaceLocale,
  code: CoarseRegionCode | null,
) {
  const label = getLocalizedCoarseRegionLabel(locale, code);
  if (!label || !code || !COUNTRY_ONLY_PROFILE_REGION_CODES.has(code)) {
    return label;
  }
  return label.split(" — ")[0] ?? null;
}

function toggleLanguage(
  current: PublicProfileLanguage[],
  language: PublicProfileLanguage,
) {
  return current.includes(language)
    ? current.filter((value) => value !== language)
    : [...current, language].slice(0, 4);
}

function HandleStatus({
  state,
  locale,
  copy,
  showEligibility,
}: {
  state: PublicHandleActionState;
  locale: InterfaceLocale;
  copy: (typeof COPY)[InterfaceLocale];
  showEligibility: boolean;
}) {
  const isError = state.status === "format" || state.status === "unavailable";
  let message: string | null = null;

  if (state.status === "updated") message = copy.handleUpdated;
  if (state.status === "unchanged") message = copy.handleUnchanged;
  if (state.status === "format") message = copy.handleFormat;
  if (state.status === "unavailable") message = copy.handleUnavailable;
  if (state.status === "cooldown") {
    const date = state.nextEligibleAt
      ? new Intl.DateTimeFormat(localeTag(locale), {
          dateStyle: "long",
          timeStyle: "short",
        }).format(new Date(state.nextEligibleAt))
      : "";
    message = copy.handleCooldown.replace("{date}", date);
  }
  if (showEligibility && state.status !== "cooldown" && state.nextEligibleAt) {
    const date = new Intl.DateTimeFormat(localeTag(locale), {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(state.nextEligibleAt));
    const eligibilityMessage = copy.handleCooldown.replace("{date}", date);
    message = message ? `${message} ${eligibilityMessage}` : eligibilityMessage;
  }

  return (
    <p
      id="public-handle-status"
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        message
          ? "rounded-md border border-border bg-surface-sunken px-3 py-2 text-body-sm text-text"
          : "sr-only",
      )}
    >
      {message ?? ""}
    </p>
  );
}

function localeTag(locale: InterfaceLocale) {
  if (locale === "bg") return "bg-BG";
  if (locale === "ru") return "ru-RU";
  return "uk-UA";
}

function profileEditorStatus(
  status: string | null,
  copy: (typeof COPY)[InterfaceLocale],
) {
  if (status === "updated") return copy.saved;
  if (status === "unchanged") return copy.unchanged;
  if (status === "display_name_unavailable") return copy.displayUnavailable;
  if (status === "avatar") return copy.avatarInvalid;
  if (
    status &&
    [
      "display_name",
      "bio",
      "languages",
      "region",
      "relationship_visibility",
    ].includes(status)
  )
    return copy.invalid;
  return null;
}

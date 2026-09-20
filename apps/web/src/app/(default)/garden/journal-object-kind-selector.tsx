"use client";

import { PawPrint, Sprout } from "lucide-react";

import type { PlantObjectKind } from "@/db/schema";
import { getGardenWorkspaceCopy } from "@/lib/garden-workspace-copy";
import type { InterfaceLocale } from "@/lib/interface-localization";

const OBJECT_KIND_OPTIONS = [
  {
    value: "plant",
    copyKey: "plant",
    icon: Sprout,
  },
  {
    value: "animal",
    copyKey: "animal",
    icon: PawPrint,
  },
] as const satisfies readonly {
  value: PlantObjectKind;
  copyKey: "plant" | "animal";
  icon: typeof Sprout;
}[];

export function JournalObjectKindSelector({
  locale,
  value,
  onChange,
}: {
  locale: InterfaceLocale;
  value: PlantObjectKind;
  onChange: (value: PlantObjectKind) => void;
}) {
  const copy = getGardenWorkspaceCopy(locale).composer.objectKind;
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="text-body-sm font-medium text-text">
        {copy.legend}
      </legend>
      <div className="grid min-w-0 grid-cols-2 gap-2" role="group">
        {OBJECT_KIND_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = option.value === value;
          const optionCopy = copy[option.copyKey];

          return (
            <button
              key={option.value}
              type="button"
              data-object-kind={option.value}
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`flex min-h-20 min-w-0 flex-col items-start justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                selected
                  ? "border-action bg-action text-text-on-fill"
                  : "border-border bg-surface text-text hover:bg-surface-sunken"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="block w-full min-w-0">
                <span className="block text-caption leading-4 font-semibold break-words sm:text-body-sm">
                  {optionCopy.label}
                </span>
                <span
                  className={`mt-1 hidden text-caption leading-4 sm:block ${
                    selected ? "text-text-on-fill" : "text-text-muted"
                  }`}
                >
                  {optionCopy.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

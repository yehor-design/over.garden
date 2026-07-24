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
      <legend className="text-sm font-medium text-foreground">
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
              className={`flex min-h-20 min-w-0 flex-col items-start justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="block w-full min-w-0">
                <span className="block text-xs leading-4 font-semibold break-words sm:text-sm">
                  {optionCopy.label}
                </span>
                <span
                  className={`mt-1 hidden text-xs leading-4 sm:block ${
                    selected ? "text-background/70" : "text-muted-foreground"
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

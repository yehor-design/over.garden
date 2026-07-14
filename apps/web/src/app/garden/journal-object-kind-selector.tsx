"use client";

import { Bug, PawPrint, Sprout } from "lucide-react";

import type { PlantObjectKind } from "@/db/schema";

const OBJECT_KIND_OPTIONS = [
  {
    value: "plant",
    label: "Plant",
    description: "Trees, flowers, crops",
    icon: Sprout,
  },
  {
    value: "animal",
    label: "Animal",
    description: "Pets and livestock",
    icon: PawPrint,
  },
  {
    value: "bee_colony",
    label: "Bee colony",
    description: "One living colony",
    icon: Bug,
  },
] as const satisfies readonly {
  value: PlantObjectKind;
  label: string;
  description: string;
  icon: typeof Sprout;
}[];

export function JournalObjectKindSelector({
  value,
  onChange,
}: {
  value: PlantObjectKind;
  onChange: (value: PlantObjectKind) => void;
}) {
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="text-sm font-medium text-foreground">
        Living object type
      </legend>
      <div className="grid min-w-0 grid-cols-3 gap-2" role="group">
        {OBJECT_KIND_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = option.value === value;

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
              <span className="min-w-0">
                <span className="block text-sm leading-4 font-semibold">
                  {option.label}
                </span>
                <span
                  className={`mt-1 hidden text-xs leading-4 sm:block ${
                    selected ? "text-background/70" : "text-muted-foreground"
                  }`}
                >
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

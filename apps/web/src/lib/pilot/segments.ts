export type PilotSegment =
  | "casual_micro_grower"
  | "casual_gen_z"
  | "casual_practical_beginner"
  | "casual_urban_balcony"
  | "casual_food_self_reliance"
  | "power_burned_out_it"
  | "power_collector"
  | "power_experienced"
  | "power_homestead"
  | "supply_expert_creator"
  | "supply_local_seller"
  | "channel_ally"
  | "unknown_segment";

export type PilotSegmentCoreBucket =
  | "casual_core"
  | "power_core"
  | "supply_side"
  | "channel_ally"
  | "unknown";

export type PilotSegmentDiagnosticBucket =
  | "land_practical"
  | "micro_balcony"
  | "other_casual"
  | "power_core"
  | "supply_channel"
  | "unknown";

export interface PilotSegmentOption {
  value: PilotSegment;
  label: string;
  bucket: PilotSegmentCoreBucket;
  diagnosticBucket: PilotSegmentDiagnosticBucket;
}

export const DEFAULT_PILOT_SEGMENT: PilotSegment = "unknown_segment";

export const PILOT_SEGMENT_OPTIONS = [
  {
    value: "casual_micro_grower" as const,
    label: "Casual - micro-grower / one-pot",
    bucket: "casual_core",
    diagnosticBucket: "micro_balcony",
  },
  {
    value: "casual_gen_z" as const,
    label: "Casual - Gen Z beginner",
    bucket: "casual_core",
    diagnosticBucket: "other_casual",
  },
  {
    value: "casual_practical_beginner" as const,
    label: "Casual - practical beginner with land",
    bucket: "casual_core",
    diagnosticBucket: "land_practical",
  },
  {
    value: "casual_urban_balcony" as const,
    label: "Casual - urban balcony / small space",
    bucket: "casual_core",
    diagnosticBucket: "micro_balcony",
  },
  {
    value: "casual_food_self_reliance" as const,
    label: "Casual - food self-reliance beginner",
    bucket: "casual_core",
    diagnosticBucket: "land_practical",
  },
  {
    value: "power_burned_out_it" as const,
    label: "Power - burned-out IT / knowledge worker",
    bucket: "power_core",
    diagnosticBucket: "power_core",
  },
  {
    value: "power_collector" as const,
    label: "Power - plant collector",
    bucket: "power_core",
    diagnosticBucket: "power_core",
  },
  {
    value: "power_experienced" as const,
    label: "Power - experienced practitioner",
    bucket: "power_core",
    diagnosticBucket: "power_core",
  },
  {
    value: "power_homestead" as const,
    label: "Power - homestead aspirant (doing)",
    bucket: "power_core",
    diagnosticBucket: "power_core",
  },
  {
    value: "supply_expert_creator" as const,
    label: "Supply - expert / creator",
    bucket: "supply_side",
    diagnosticBucket: "supply_channel",
  },
  {
    value: "supply_local_seller" as const,
    label: "Supply - local seller",
    bucket: "supply_side",
    diagnosticBucket: "supply_channel",
  },
  {
    value: "channel_ally" as const,
    label: "Channel ally - moderator / club leader",
    bucket: "channel_ally",
    diagnosticBucket: "supply_channel",
  },
  {
    value: "unknown_segment" as const,
    label: "Unknown / not classified yet",
    bucket: "unknown",
    diagnosticBucket: "unknown",
  },
] satisfies readonly PilotSegmentOption[];

export const PILOT_SEGMENTS = PILOT_SEGMENT_OPTIONS.map(
  (option) => option.value,
) as readonly PilotSegment[];

export function isPilotSegment(value: unknown): value is PilotSegment {
  return (
    typeof value === "string" &&
    (PILOT_SEGMENTS as readonly string[]).includes(value)
  );
}

export function normalizePilotSegment(value: unknown): PilotSegment | null {
  return isPilotSegment(value) ? value : null;
}

export function getPilotSegmentLabel(segment: PilotSegment | string): string {
  return (
    PILOT_SEGMENT_OPTIONS.find((option) => option.value === segment)?.label ??
    segment
  );
}

export function getPilotSegmentCoreBucket(
  segment: PilotSegment,
): PilotSegmentCoreBucket {
  return getPilotSegmentOption(segment).bucket;
}

export function getPilotSegmentDiagnosticBucket(
  segment: PilotSegment,
): PilotSegmentDiagnosticBucket {
  return getPilotSegmentOption(segment).diagnosticBucket;
}

export function getPilotSegmentCoreBucketLabel(
  bucket: PilotSegmentCoreBucket,
): string {
  switch (bucket) {
    case "casual_core":
      return "Casual core";
    case "power_core":
      return "Power core";
    case "supply_side":
      return "Supply side";
    case "channel_ally":
      return "Channel ally";
    case "unknown":
      return "Unknown";
  }
}

export function getPilotSegmentDiagnosticBucketLabel(
  bucket: PilotSegmentDiagnosticBucket,
): string {
  switch (bucket) {
    case "land_practical":
      return "Land / practical";
    case "micro_balcony":
      return "Micro / balcony";
    case "other_casual":
      return "Other casual";
    case "power_core":
      return "Power core";
    case "supply_channel":
      return "Supply / channel";
    case "unknown":
      return "Unknown";
  }
}

function getPilotSegmentOption(segment: PilotSegment): PilotSegmentOption {
  return (
    PILOT_SEGMENT_OPTIONS.find((option) => option.value === segment) ??
    PILOT_SEGMENT_OPTIONS[PILOT_SEGMENT_OPTIONS.length - 1]!
  );
}

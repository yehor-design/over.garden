"use client";

import { useEffect, useState } from "react";

import {
  InlineMediaSelectionController,
} from "./inline-media-selection-controller";

export function useInlineMediaSelection(ownerKey: string) {
  const [controller] = useState(() => new InlineMediaSelectionController());
  useEffect(() => {
    return () => controller.destroy();
  }, [controller, ownerKey]);
  return controller;
}

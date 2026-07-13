"use client";

import { useEffect } from "react";

interface HashScrollEnvironment {
  hash: string;
  findAnchor: (anchorId: string) => HTMLElement | null;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
}

export function scheduleHashAnchorScroll(
  anchorId: string,
  environment: HashScrollEnvironment,
) {
  if (environment.hash !== `#${anchorId}`) return () => undefined;

  const frame = environment.requestFrame(() => {
    environment.findAnchor(anchorId)?.scrollIntoView({ block: "start" });
  });

  return () => environment.cancelFrame(frame);
}

export function useScrollToHashOnMount(anchorId: string) {
  useEffect(
    () =>
      scheduleHashAnchorScroll(anchorId, {
        hash: window.location.hash,
        findAnchor: (id) => document.getElementById(id),
        requestFrame: window.requestAnimationFrame.bind(window),
        cancelFrame: window.cancelAnimationFrame.bind(window),
      }),
    [anchorId],
  );
}

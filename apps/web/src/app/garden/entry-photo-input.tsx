"use client";

import Image from "next/image";
import { useId, useState, type ChangeEvent } from "react";

type UploadState = "idle" | "uploading" | "processing" | "processed" | "failed";

interface UploadResponse {
  mediaAssetId: string;
  uploadUrl: string;
}

interface ProcessResponse {
  mediaAsset: {
    id: string;
    status: string;
    derivative_key: string | null;
  };
  publicUrl: string;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function EntryPhotoInput() {
  const inputId = useId();
  const [state, setState] = useState<UploadState>("idle");
  const [mediaAssetId, setMediaAssetId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "Optional. The server strips metadata before readback.",
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setMediaAssetId(null);
    setPreviewUrl(null);

    if (!file) {
      setState("idle");
      setMessage("Optional. The server strips metadata before readback.");
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setState("failed");
      setMessage("Use a JPEG, PNG, or WebP photo.");
      return;
    }

    try {
      setState("uploading");
      setMessage("Uploading the original to private quarantine...");

      const uploadResponse = await fetch("/api/media/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload URL request failed.");
      }

      const upload = (await uploadResponse.json()) as UploadResponse;
      const r2Response = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!r2Response.ok) {
        throw new Error("Photo upload failed.");
      }

      setState("processing");
      setMessage("Creating a stripped public derivative...");

      const processResponse = await fetch("/api/media/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaAssetId: upload.mediaAssetId }),
      });

      if (!processResponse.ok) {
        throw new Error("Photo processing failed.");
      }

      const processed = (await processResponse.json()) as ProcessResponse;
      if (
        processed.mediaAsset.status !== "processed" ||
        !processed.mediaAsset.derivative_key
      ) {
        throw new Error("Photo was not processed.");
      }

      setState("processed");
      setMediaAssetId(processed.mediaAsset.id);
      setPreviewUrl(processed.publicUrl);
      setMessage(
        "Photo is ready. Readback will use only the stripped derivative.",
      );
    } catch (error) {
      setState("failed");
      setMediaAssetId(null);
      setPreviewUrl(null);
      setMessage(
        error instanceof Error
          ? `${error.message} You can choose another photo or save without one.`
          : "Photo failed. You can choose another photo or save without one.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <label
        htmlFor={inputId}
        className="flex flex-col gap-1 text-sm font-medium text-foreground"
      >
        Photo
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="block w-full text-sm font-normal text-muted-foreground file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground"
        />
      </label>

      {mediaAssetId ? (
        <input type="hidden" name="mediaAssetId" value={mediaAssetId} />
      ) : null}

      <p
        className={
          state === "failed"
            ? "text-xs leading-5 text-destructive"
            : "text-xs leading-5 text-muted-foreground"
        }
      >
        {message}
      </p>

      {previewUrl ? (
        <Image
          src={previewUrl}
          alt="Processed entry photo preview"
          width={960}
          height={540}
          sizes="(min-width: 640px) 36rem, 100vw"
          unoptimized
          className="aspect-video w-full rounded-md border border-border object-cover"
        />
      ) : null}
    </div>
  );
}

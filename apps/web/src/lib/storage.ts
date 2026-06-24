import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Storage seam (scaffold stub).
 *
 * Photo upload uses a SIGNED UPLOAD URL — one of the two controlled exceptions
 * to the single-door invariant (Variant D): the browser uploads a single,
 * server-authorized object directly to Storage, but never gets broad Storage
 * access.
 *
 * EXIF-GPS HARD INVARIANT (not implemented here — placeholder only):
 *   Before any photo is served publicly, the worker (sharp) MUST strip EXIF-GPS
 *   and re-encode the image. The public path serves ONLY the stripped derivative
 *   and NEVER falls back to the GPS-bearing original. The stripping logic is a
 *   separate task (it runs in the Python/worker tier); this is the insertion
 *   point and a reminder of the contract.
 */
export async function createSignedUploadUrl(bucket: string, objectPath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath);

  if (error) throw error;
  return data; // { signedUrl, token, path }
}

/**
 * Resolve the PUBLIC URL for a photo.
 *
 * TODO(exif): return the URL of the STRIPPED derivative only. Until the worker's
 * EXIF-strip pipeline exists, there is no public-photo path — do not serve
 * originals. This stub intentionally throws to make that invariant impossible to
 * violate by accident.
 */
export function getPublicStrippedPhotoUrl(objectPath: string): never {
  throw new Error(
    `EXIF-strip derivative pipeline is not implemented — refusing to serve a ` +
      `potentially GPS-bearing original for "${objectPath}" (hard privacy invariant).`,
  );
}

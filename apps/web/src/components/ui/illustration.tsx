import {
  ILLUSTRATION_SIZES,
  type Illustration as IllustrationAsset,
  type IllustrationSize,
} from "@/lib/illustrations";

/** Decorative product art. Adjacent text must carry the complete meaning. */
export function Illustration({
  asset,
  size = "page",
}: {
  asset: IllustrationAsset;
  size?: IllustrationSize;
}) {
  const pixels = ILLUSTRATION_SIZES[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-slot="illustration"
      src={asset.src}
      alt=""
      width={pixels}
      height={pixels}
      loading="lazy"
      decoding="async"
      className={
        size === "card"
          ? "size-24 shrink-0 object-contain"
          : "size-36 shrink-0 object-contain"
      }
    />
  );
}

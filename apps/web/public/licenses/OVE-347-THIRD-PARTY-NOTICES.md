# OverGarden browser image-codec notices

The atomic journal composer loads the following unmodified third-party codec
packages lazily inside a dedicated browser Web Worker. OverGarden does not
remove or alter their copyright and license notices.

## jSquash packages

* `@jsquash/jpeg 1.6.0`
* `@jsquash/png 3.1.1`
* `@jsquash/resize 2.1.1`
* `@jsquash/webp 1.5.0`

These packages are distributed under Apache-2.0. Their bundled codec
components retain the additional notices reproduced in this directory. The
JPEG decoder is based in part on the work of the Independent JPEG Group.

Source: <https://github.com/jamsinclair/jSquash>

License and codec notices:

* `apache-2.0.txt`
* `jsquash-jpeg-codec.txt`
* `jsquash-png-codec.txt`
* `jsquash-resize-magic-kernel.txt`
* `jsquash-resize-hqx.txt`
* `jsquash-resize-codec.txt`
* `jsquash-webp-codec.txt`

## libheif-js

`libheif-js 1.19.8` is distributed under LGPL-3.0 and is loaded as a
separate, replaceable browser module by the image Worker. OverGarden uses the
published package unmodified. The complete license text supplied with the
package, including the incorporated GPL-3.0 terms, is reproduced as
`libheif-wasm.txt`.

Corresponding source and build/relink information:

* <https://github.com/catdad-experiments/libheif-js/tree/v1.19.8>
* <https://github.com/strukturag/libheif/tree/v1.19.8>
* Replace the pinned `libheif-js` package with an interface-compatible build,
  run `pnpm install`, and rebuild `apps/web`; the Worker imports the library
  through `libheif-js/libheif-wasm/libheif-bundle.mjs`.

Nothing in OverGarden's terms restricts reverse engineering for the purpose of
debugging modifications to this LGPL-covered library.

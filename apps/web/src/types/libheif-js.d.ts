declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      output: ImageData,
      callback: (displayed: ImageData | null) => void,
    ): void;
    free?(): void;
  }

  interface LibheifModule {
    HeifDecoder: new () => {
      decode(bytes: Uint8Array): HeifImage[];
    };
  }

  export default function createLibheif(): Promise<LibheifModule>;
}

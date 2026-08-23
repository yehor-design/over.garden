import { createHash } from "node:crypto";

import {
  chromium,
  firefox,
  webkit,
  type BrowserType,
  type Page,
} from "playwright";

const JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAABKADAAQAAAABAAAAAwAAAAD/wAARCAADAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwACAgICAgIDAgIDBQMDAwUGBQUFBQYIBgYGBgYICggICAgICAoKCgoKCgoKDAwMDAwMDg4ODg4PDw8PDw8PDw8P/9sAQwECAgIEBAQHBAQHEAsJCxAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ/90ABAAB/9oADAMBAAIRAxEAPwDxrUNQvIruREk4GOoB7D1qn/ad9/z0/Qf4Uan/AMf0n/Af5CqFf23wHwHkdbI8BVq4ClKUqVNtunBttwTbbcbtt7s/kijRhWhGrVSlKSu29W29W23q23uz/9k=";
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAABKADAAQAAAABAAAAAwAAAAB3TCISAAAAIklEQVQIHWN87+LynwEI1OPZQBQDC4wB5oEEYAz+AwvBTACqIQUIpI8z2gAAAABJRU5ErkJggg==";
const HEIC_BASE64 =
  "AAAAGGZ0eXBoZWljAAAAAGhlaWNtaWYxAAAB7G1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABodmMxAAAAABVpbmZlAgAAAQACAABFeGlmAAAAABppcmVmAAAAAAAAAA5jZHNjAAIAAQABAAABD2lwcnAAAADtaXBjbwAAABNjb2xybmNseAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAAAEAAAABAAAAChjbGFwAAAABAAAAAEAAAADAAAAAQAAAAAAAAAB/8AAAACAAAAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcWh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAI0IBAQNwAAADALAAAAMAAAMAHqAUIEHAnw/iHuRZVNwICBgCogABAAlEAcBhcshEU2QAAAAaaXBtYQAAAAAAAAABAAEHgQIDBoeEhQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAAJiAAAAbwACAAAAAQAAAhQAAABOAAAAAW1kYXQAAAAAAAAAzQAAAAZFeGlmAABNTQAqAAAACAABh2kABAAAAAEAAAAaAAAAAAADoAEAAwAAAAEAAQAAoAIABAAAAAEAAAAEoAMABAAAAAEAAAADAAAAAAAAAGsoAa+jzoAO8CXwTFo23kLvcWmivfbV//+qWPCgRn5UgUI6//lDlACLb2qNjZI/8mZyfWq6eK8XOk4tH95rEHgK/juKSTZdG67hv/vJic9kOl1GSj7AHTXLcfvTi/+LdWd+MP8BHsaivMAyoA==";

const baseUrl = argument("--base-url") ?? "http://127.0.0.1:3000";
if (argument("--confirm-environment") !== "local") {
  throw new Error("OVE-347 codec smoke requires explicit local confirmation.");
}

interface CodecResult {
  bytesBase64: string;
  width: number;
  height: number;
  sha256: string;
  sourceKind: string;
  lossless: boolean;
  quality: number;
}

const browserTypes: Array<[string, BrowserType]> = [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
];

async function main() {
  const receipts: Array<Record<string, unknown>> = [];
  for (const [browserName, browserType] of browserTypes) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/__visual-fixtures/atomic-journal-codec`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() =>
        Boolean(window.__ove347AtomicJournalCodecFixture),
      );

      const jpeg = await encode(
        page,
        {
          bytesBase64: orientationSixJpegBase64(),
          mediaType: "image/jpeg",
        },
        `${browserName}:jpeg`,
      );
      assertResult(jpeg, {
        sourceKind: "jpeg",
        width: 3,
        height: 4,
        lossless: false,
        quality: 82,
      });
      const png = await encode(
        page,
        {
          bytesBase64: PNG_BASE64,
          mediaType: "image/png",
        },
        `${browserName}:png`,
      );
      assertResult(png, {
        sourceKind: "png",
        width: 4,
        height: 3,
        lossless: true,
        quality: 100,
      });
      const webp = await encode(
        page,
        {
          bytesBase64: png.bytesBase64,
          mediaType: "image/webp",
        },
        `${browserName}:webp`,
      );
      assertResult(webp, {
        sourceKind: "webp",
        width: 4,
        height: 3,
        lossless: true,
        quality: 100,
      });
      const heic = await encode(
        page,
        {
          bytesBase64: HEIC_BASE64,
          mediaType: "image/heic",
        },
        `${browserName}:heic`,
      );
      assertResult(heic, {
        sourceKind: "heic",
        width: 4,
        height: 3,
        lossless: false,
        quality: 82,
      });
      const rotatedHeic = await encode(
        page,
        {
          bytesBase64: quarterTurnHeicBase64(),
          mediaType: "image/heic",
        },
        `${browserName}:heic-quarter-turn`,
      );
      assertResult(rotatedHeic, {
        sourceKind: "heic",
        width: 3,
        height: 4,
        lossless: false,
        quality: 82,
      });

      receipts.push({
        browser: browserName,
        formats: [
          "jpeg-orientation-6",
          "png-alpha",
          "webp",
          "heic",
          "heic-quarter-turn",
        ],
        outputs: [jpeg, png, webp, heic, rotatedHeic].map((result) => ({
          sourceKind: result.sourceKind,
          width: result.width,
          height: result.height,
          lossless: result.lossless,
          quality: result.quality,
          sizeBytes: Buffer.from(result.bytesBase64, "base64").byteLength,
          digestVerified: true,
        })),
      });
    } finally {
      await browser.close();
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      version: "ove347.atomicJournalCodecBrowser.v1",
      ok: true,
      browserCount: receipts.length,
      receipts,
      evidenceHygiene: {
        sourceBytesAbsent: true,
        filenamesAbsent: true,
        blobUrlsAbsent: true,
      },
    })}\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "OVE-347 codec smoke failed."}\n`,
  );
  process.exitCode = 1;
});

async function encode(
  page: Page,
  input: { bytesBase64: string; mediaType: string },
  label: string,
) {
  try {
    return (await page.evaluate(
      async (fixture) =>
        window.__ove347AtomicJournalCodecFixture!.encode(fixture),
      input,
    )) as CodecResult;
  } catch (error) {
    throw new Error(
      `${label} failed: ${error instanceof Error ? error.message : "unknown codec error"}`,
    );
  }
}

function assertResult(
  result: CodecResult,
  expected: Omit<CodecResult, "bytesBase64" | "sha256">,
) {
  for (const [key, value] of Object.entries(expected)) {
    if (result[key as keyof CodecResult] !== value) {
      throw new Error(
        `Codec result mismatch for ${key}: expected ${String(value)}, received ${String(result[key as keyof CodecResult])}.`,
      );
    }
  }
  const bytes = Buffer.from(result.bytesBase64, "base64");
  if (
    bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
    bytes.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    throw new Error("Codec output is not a WebP RIFF artifact.");
  }
  const sha256 = createHash("sha256").update(bytes).digest("base64");
  if (sha256 !== result.sha256) {
    throw new Error("Codec output digest does not match the returned bytes.");
  }
}

function orientationSixJpegBase64() {
  const bytes = Buffer.from(JPEG_BASE64, "base64");
  const marker = bytes.indexOf(Buffer.from([0xff, 0xc0]));
  if (marker < 0) throw new Error("JPEG fixture has no baseline SOF marker.");
  const exifOrientationSix = Buffer.from([
    0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49,
    0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00,
    0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  return Buffer.concat([
    bytes.subarray(0, marker),
    exifOrientationSix,
    bytes.subarray(marker),
  ]).toString("base64");
}

function quarterTurnHeicBase64() {
  const bytes = Buffer.from(HEIC_BASE64, "base64");
  const rotation = bytes.indexOf(Buffer.from("irot"));
  if (rotation < 4 || rotation + 4 >= bytes.length) {
    throw new Error("HEIC fixture has no bounded irot property.");
  }
  const boxSize = bytes.readUInt32BE(rotation - 4);
  if (boxSize < 9 || rotation - 4 + boxSize > bytes.length) {
    throw new Error("HEIC fixture irot property is malformed.");
  }
  bytes[rotation + 4] = 1;
  return bytes.toString("base64");
}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

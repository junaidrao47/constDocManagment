/**
 * A cheap content-sniff: does the file's leading bytes match the family its declared
 * MIME type claims? This is the magic-byte check the audit flagged as missing (R87).
 * It is not a full AV scan — just enough to stop an `evil.html` renamed to `.pdf`
 * (or a mislabelled Content-Type) from being stored and later served from our origin.
 *
 * Reading ~16 bytes is enough for every signature except WEBP, which needs byte 11.
 */

function startsWith(buffer: Buffer, signature: number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  return signature.every((byte, index) => buffer[offset + index] === byte);
}

function isPdf(b: Buffer): boolean {
  return startsWith(b, [0x25, 0x50, 0x44, 0x46]); // %PDF
}
function isPng(b: Buffer): boolean {
  return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}
function isJpeg(b: Buffer): boolean {
  return startsWith(b, [0xff, 0xd8, 0xff]);
}
function isWebp(b: Buffer): boolean {
  return startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8); // RIFF....WEBP
}
function isTiff(b: Buffer): boolean {
  return startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]);
}
function isZip(b: Buffer): boolean {
  // Office Open XML (docx/xlsx) are zip archives.
  return startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]) || startsWith(b, [0x50, 0x4b, 0x07, 0x08]);
}
function isOle(b: Buffer): boolean {
  // Legacy Office (doc/xls) compound binary format.
  return startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

const MIME_SNIFFERS: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": isPdf,
  "image/png": isPng,
  "image/jpeg": isJpeg,
  "image/webp": isWebp,
  "image/tiff": isTiff,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": isZip,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": isZip,
  "application/msword": isOle,
  "application/vnd.ms-excel": isOle,
};

/** True when `buffer`'s signature is consistent with `declaredMime`. Unknown mimes fail closed. */
export function magicBytesMatch(buffer: Buffer, declaredMime: string): boolean {
  const sniffer = MIME_SNIFFERS[declaredMime];
  if (!sniffer) return false;
  return sniffer(buffer);
}

/** How many leading bytes to fetch for a reliable sniff. */
export const MAGIC_BYTE_PREFIX_LENGTH = 16;

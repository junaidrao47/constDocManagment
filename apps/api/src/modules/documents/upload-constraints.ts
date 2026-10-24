import path from "path";

/** 25 MB ceiling for any single uploaded document (PROJECT-BRIEF §7.8; spec §4a). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Accepted upload types: compliance documents are PDFs, office files, and photos of
 * certificates. Both the declared MIME and the extension must be on the list — a
 * client controls both, so this is the cheap gate; the magic-byte sniff on confirm
 * is the content check (see utils/magic-bytes.ts).
 */
export const ALLOWED_UPLOAD_TYPES: Record<string, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/tiff": [".tif", ".tiff"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

export const ALLOWED_EXTENSIONS = Object.values(ALLOWED_UPLOAD_TYPES).flat();

/** The declared MIME must be known and its extension must match the file name. */
export function isAllowedUpload(mimeType: string, fileName: string): boolean {
  const permitted = ALLOWED_UPLOAD_TYPES[mimeType];
  if (!permitted) return false;
  return permitted.includes(path.extname(fileName).toLowerCase());
}

/** Types a requirement may further restrict to; falls back to the global list. */
export function isAllowedForRequirement(mimeType: string, allowed: string[] | null | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(mimeType);
}

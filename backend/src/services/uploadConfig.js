export function positiveInteger(value, fallback) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}
export function uploadConfig() {
  return {
    maxBulkFiles: positiveInteger(process.env.MAX_BULK_FILES, 100),
    maxFileSizeMB: positiveInteger(process.env.MAX_FILE_SIZE_MB, 10),
    concurrency: positiveInteger(process.env.BULK_UPLOAD_CONCURRENCY, 2)
  };
}

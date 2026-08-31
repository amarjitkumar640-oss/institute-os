import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

// Downloads a remote file to the app's cache dir, then hands it to the OS
// share sheet (WhatsApp, email, save-to-Files, etc.) — covers both
// "download" and "share with someone" in one action, no custom viewer needed.
// `dialogTitle` is the human-readable name shown in the share sheet — the
// downloaded file's own on-disk name (derived from the source URL, e.g. a
// presigned S3 URL) doesn't need to match it.
export async function downloadAndShare(url: string, dialogTitle: string, mimeType = "application/pdf"): Promise<void> {
  const cacheDir = new Directory(Paths.cache);
  cacheDir.create({ intermediates: true, idempotent: true });
  const downloaded = await File.downloadFileAsync(url, cacheDir);
  await Sharing.shareAsync(downloaded.uri, { mimeType, dialogTitle });
}

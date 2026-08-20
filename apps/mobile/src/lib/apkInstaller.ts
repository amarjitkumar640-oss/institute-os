import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

// Grants the receiving app (the system installer) read access to our
// content:// URI — required, since it doesn't share our app's UID.
const FLAG_GRANT_READ_URI_PERMISSION = 1;

// Downloads the APK to cache (covered by the FileProvider <cache-path>
// config in plugins/withApkInstaller.js) and hands it to Android's package
// installer via a content:// URI — a plain file:// URI is blocked on
// modern Android for cross-app intents.
export async function downloadAndInstallApk(
  downloadUrl: string,
  versionCode: number,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const localUri = `${FileSystem.cacheDirectory}update-${versionCode}.apk`;

  const downloadResumable = FileSystem.createDownloadResumable(
    downloadUrl,
    localUri,
    {},
    onProgress
      ? (data) => onProgress(data.totalBytesWritten / data.totalBytesExpectedToWrite)
      : undefined,
  );
  const result = await downloadResumable.downloadAsync();
  if (!result) throw new Error("Download did not complete");

  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data:  contentUri,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type:  "application/vnd.android.package-archive",
  });
}

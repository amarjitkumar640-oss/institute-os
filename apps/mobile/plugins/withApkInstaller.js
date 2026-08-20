const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Enables installing a downloaded APK from within the app (non-Play-Store
// update flow) — Android requires REQUEST_INSTALL_PACKAGES plus a
// FileProvider to hand a downloaded file to the system installer via a
// content:// URI (a plain file:// URI is blocked on modern Android).
// Native dirs are gitignored/regenerated on every build (Continuous Native
// Generation), so this config plugin is the only durable way to add either.
function withApkInstaller(config) {
  config = AndroidConfig.Permissions.withPermissions(config, ["android.permission.REQUEST_INSTALL_PACKAGES"]);

  config = withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    if (!mainApplication.provider) mainApplication.provider = [];

    const already = mainApplication.provider.some(
      (p) => p.$["android:name"] === "androidx.core.content.FileProvider"
    );
    if (!already) {
      mainApplication.provider.push({
        $: {
          "android:name": "androidx.core.content.FileProvider",
          "android:authorities": "${applicationId}.fileprovider",
          "android:exported": "false",
          "android:grantUriPermissions": "true",
        },
        "meta-data": [
          {
            $: {
              "android:name": "android.support.FILE_PROVIDER_PATHS",
              "android:resource": "@xml/file_paths",
            },
          },
        ],
      });
    }
    return config;
  });

  // FileProvider's <paths> config — covers expo-file-system's cacheDirectory
  // (maps to context.getCacheDir()), which is where the downloaded APK lands.
  config = withDangerousMod(config, [
    "android",
    (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, "file_paths.xml"),
        `<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n  <cache-path name="apk" path="." />\n</paths>\n`
      );
      return config;
    },
  ]);

  return config;
}

module.exports = withApkInstaller;

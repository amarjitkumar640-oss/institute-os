// Dynamic Expo config — lets each organization get its own app identity
// (name, icon, bundle ID/package) from one shared codebase, selected via
// env vars at build time. Set these alongside EXPO_PUBLIC_TENANT_ID before
// running `eas build` (or use an eas.json build profile that sets them):
//
//   TENANT_SLUG        — selects assets/tenants/<slug>/* if present, else
//                         falls back to the shared assets/*.png below
//   TENANT_NAME         — app display name (defaults to "Institute OS")
//   TENANT_IOS_BUNDLE_ID  — e.g. "com.instituteos.<slug>"
//   TENANT_ANDROID_PACKAGE — e.g. "com.instituteos.<slug>"
//
// NOTE: registering each bundle ID/package with Apple Developer / Google
// Play and publishing a separate store listing per organization is a
// manual, account-level step — this file only produces the distinctly
// branded build you'd upload.

const fs = require("fs");
const path = require("path");

const TENANT_SLUG   = process.env.TENANT_SLUG || null;
const TENANT_NAME   = process.env.TENANT_NAME || "Institute OS";
const IOS_BUNDLE_ID = process.env.TENANT_IOS_BUNDLE_ID || "com.anonymous.mobile";
const ANDROID_PKG   = process.env.TENANT_ANDROID_PACKAGE || "com.anonymous.mobile";

function tenantAsset(fileName, fallback) {
  if (TENANT_SLUG) {
    const tenantPath = path.join(__dirname, "assets", "tenants", TENANT_SLUG, fileName);
    if (fs.existsSync(tenantPath)) return `./assets/tenants/${TENANT_SLUG}/${fileName}`;
  }
  return fallback;
}

module.exports = {
  expo: {
    name: TENANT_NAME,
    slug: "mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: tenantAsset("icon.png", "./assets/icon.png"),
    userInterfaceStyle: "light",
    ios: {
      supportsTablet: true,
      bundleIdentifier: IOS_BUNDLE_ID,
      infoPlist: {
        NSFaceIDUsageDescription: `${TENANT_NAME} uses Face ID to unlock the app quickly and securely.`,
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
    },
    android: {
      usesCleartextTraffic: true,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: tenantAsset("android-icon-foreground.png", "./assets/android-icon-foreground.png"),
        backgroundImage: tenantAsset("android-icon-background.png", "./assets/android-icon-background.png"),
        monochromeImage: tenantAsset("android-icon-monochrome.png", "./assets/android-icon-monochrome.png"),
      },
      statusBar: {
        translucent: true,
        backgroundColor: "transparent",
        barStyle: "light-content",
      },
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "pan",
      package: ANDROID_PKG,
    },
    web: {
      favicon: tenantAsset("favicon.png", "./assets/favicon.png"),
    },
    plugins: [
      "expo-secure-store",
      "expo-local-authentication",
    ],
  },
};

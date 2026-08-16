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
// Native (OS-level) splash background — can't read live API branding since it
// renders before any JS runs, so it's baked in at build time like the icon.
// Matches DEFAULT_COLORS.primary in ThemeContext.tsx; override per tenant by
// setting this alongside the other TENANT_* build vars.
const SPLASH_COLOR  = process.env.TENANT_SPLASH_COLOR || "#8B1E3F";

// Per-tenant Firebase config file — place the downloaded google-services.json
// in assets/tenants/<slug>/ for per-org builds, or at the root for the default build.
function googleServicesFile() {
  if (TENANT_SLUG) {
    const tenantPath = path.join(__dirname, "assets", "tenants", TENANT_SLUG, "google-services.json");
    if (fs.existsSync(tenantPath)) return `./assets/tenants/${TENANT_SLUG}/google-services.json`;
  }
  const rootPath = path.join(__dirname, "google-services.json");
  if (fs.existsSync(rootPath)) return "./google-services.json";
  return null;
}

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
    // Drives Android's generated colorPrimary (colors.xml) — otherwise it's
    // left at Expo's own template default (#023c69, a dark blue) with no
    // config field pointed at it, which is exactly what was flashing
    // on screen before the real (maroon) splash took over.
    primaryColor: SPLASH_COLOR,
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
      adaptiveIcon: {
        // Matches SPLASH_COLOR — the fallback android-icon-background.png
        // below is now a plain fill of this same color, so the two stay in
        // sync (this value only takes effect if backgroundImage is absent).
        backgroundColor: SPLASH_COLOR,
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
      ...(googleServicesFile() && { googleServicesFile: googleServicesFile() }),
    },
    web: {
      favicon: tenantAsset("favicon.png", "./assets/favicon.png"),
    },
    plugins: [
      "expo-secure-store",
      "expo-local-authentication",
      "@react-native-community/datetimepicker",
      [
        "expo-splash-screen",
        {
          backgroundColor: SPLASH_COLOR,
          // Falls back to the real institute logo (not a generic placeholder)
          // so a tenant without a custom splash-icon.png still gets a
          // correctly-branded native splash out of the box.
          image: tenantAsset("splash-icon.png", "./assets/institute-logo.png"),
          imageWidth: 160,
          resizeMode: "contain",
        },
      ],
      // Fills a gap expo-splash-screen's own plugin leaves open — see the
      // plugin file for why this matters (eliminates a white flash between
      // the native splash handing off and RN's first JS frame painting).
      "./plugins/withSplashWindowBackground",
      [
        "expo-notifications",
        {
          // Fallback icon tint for any push that doesn't set its own
          // android.notification.color (the API sets one explicitly per
          // notification type — see notification.service.ts's TYPE_META).
          // Was "#ffffff" — white-on-white made the icon invisible.
          icon: tenantAsset("android-icon-monochrome.png", "./assets/android-icon-monochrome.png"),
          color: SPLASH_COLOR,
        },
      ],
      [
        "expo-build-properties",
        {
          // The plain "android: { usesCleartextTraffic }" config key does
          // NOT exist in Expo's config-plugin system — it's silently
          // ignored, which is why the generated AndroidManifest.xml never
          // had it despite being set. expo-build-properties is the actual
          // supported way to allow plain-HTTP API URLs (like the QA server)
          // in a real native build.
          android: { usesCleartextTraffic: true },
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "b99fad5a-cb3e-410d-b188-6023edc980eb",
      },
    },
  },
};

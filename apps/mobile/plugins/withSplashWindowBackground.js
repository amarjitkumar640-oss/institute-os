const { withAndroidStyles } = require("expo/config-plugins");

// Fills the one gap expo-splash-screen's own config plugin leaves open: the
// post-splash AppTheme has no android:windowBackground of its own, so it
// falls back to AppCompat's plain white default. That white shows through
// for however long it takes RN's JS engine to paint its first real frame
// after the native splash screen hands off — visible as a white flash
// between the splash and the app's own JS-rendered splash/login screen,
// worse on a dev client waiting on Metro than on a production build.
// Pointing it at the same splashscreen_background color (already generated
// by expo-splash-screen's plugin from SPLASH_COLOR in app.config.js) means
// there's nothing left for that gap to expose but the correct brand color.
function withSplashWindowBackground(config) {
  return withAndroidStyles(config, (config) => {
    const styles = config.modResults;
    const appTheme = styles.resources?.style?.find((s) => s.$.name === "AppTheme");
    if (appTheme) {
      if (!appTheme.item) appTheme.item = [];
      const already = appTheme.item.some((i) => i.$.name === "android:windowBackground");
      if (!already) {
        appTheme.item.push({
          $: { name: "android:windowBackground" },
          _: "@color/splashscreen_background",
        });
      }
    }
    return config;
  });
}

module.exports = withSplashWindowBackground;

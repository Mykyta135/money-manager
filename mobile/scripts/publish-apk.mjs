// Публікація збірки для самооновлення: копіює release-APK у dist/ і пише dist/latest.json.
// Апка на телефоні читає latest.json (npm run apk:serve) і пропонує «оновити».
//   npm run apk:publish -- "що нового"
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const { expo } = JSON.parse(readFileSync(path.join(root, "app.json"), "utf8"));
const src = path.join(root, "android/app/build/outputs/apk/release/app-release.apk");
if (!existsSync(src)) {
  console.error("нема release-APK — спершу npx expo prebuild -p android && cd android && ./gradlew assembleRelease");
  process.exit(1);
}

// версія в зібраному APK береться з android/ (prebuild), не з app.json — перевіряємо, що вони збігаються
const gradle = readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
const built = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
if (built !== expo.android.versionCode) {
  console.error(`android/ зібрано з versionCode ${built}, а в app.json ${expo.android.versionCode} — спершу npx expo prebuild -p android і перезбери`);
  process.exit(1);
}

const apk = `groshi-v${expo.version}.apk`;
copyFileSync(src, path.join(root, "dist", apk));
const release = { versionCode: expo.android.versionCode, version: expo.version, apk, notes: process.argv[2] || undefined };
writeFileSync(path.join(root, "dist", "latest.json"), JSON.stringify(release, null, 2) + "\n");
console.log(`опубліковано ${apk} (versionCode ${release.versionCode})`);

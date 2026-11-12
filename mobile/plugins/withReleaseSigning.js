// Підпис release-збірки власним ключем (credentials/signing.json) замість публічного
// debug-ключа React Native — його Play Protect вважає підозрілим. Без файлу ключа нічого не міняє.
const { withAppBuildGradle } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const CREDENTIALS = path.join(__dirname, "..", "credentials", "signing.json");

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!fs.existsSync(CREDENTIALS)) return cfg;
    const s = JSON.parse(fs.readFileSync(CREDENTIALS, "utf8"));
    let gradle = cfg.modResults.contents;
    if (gradle.includes("signingConfigs.release")) return cfg;

    // 1) release buildType: debug-підпис → release (шукаємо тільки всередині buildTypes)
    const bt = gradle.indexOf("buildTypes {");
    const before = gradle.slice(0, bt);
    const after = gradle.slice(bt).replace(/(release \{[\s\S]*?)signingConfig signingConfigs\.debug/, "$1signingConfig signingConfigs.release");
    gradle = before + after;

    // 2) сам ключ
    gradle = gradle.replace(
      "signingConfigs {",
      `signingConfigs {
        release {
            storeFile file('${s.storeFile}')
            storePassword '${s.storePassword}'
            keyAlias '${s.keyAlias}'
            keyPassword '${s.keyPassword}'
        }`,
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });
};

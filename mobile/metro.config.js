const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Спільний код лежить у ../src (веб-версія)
config.watchFolders = [path.resolve(__dirname, "../src")];

// ../src імпортує drizzle-orm — резолвимо його з mobile/node_modules,
// щоб схема й запити використовували одну й ту саму копію бібліотеки
const fromMobile = path.join(__dirname, "index.ts");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "drizzle-orm" || moduleName.startsWith("drizzle-orm/")) {
    return context.resolveRequest({ ...context, originModulePath: fromMobile }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

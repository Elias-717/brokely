// Expo's default Metro config (monorepo aware) plus .sql files for Drizzle migrations.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push("sql");

module.exports = config;

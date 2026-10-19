// Inlines the .sql migration files as strings so the phone can run them (Drizzle + Expo).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [["inline-import", { extensions: [".sql"] }]],
  };
};

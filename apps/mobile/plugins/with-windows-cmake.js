// Expo config plugin: on Windows, point Gradle at a CMake whose ninja supports long paths.
//
// Why: the React Native C++ build creates paths longer than Windows' 260-character limit.
// Even with LongPathsEnabled=1, the ninja shipped with Android's default CMake 3.22.1 cannot use
// long paths; the ninja in CMake 3.31.x can (AGENTS.md section 12). `expo prebuild` rewrites
// android/ and loses android/local.properties, so this writes the line on every prebuild.
// Elsewhere (EAS cloud builds on Linux, macOS) it does nothing.
const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const CMAKE_VERSION = "3.31.6";

module.exports = function withWindowsCmake(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      if (process.platform !== "win32") return cfg;
      const sdk =
        process.env.ANDROID_HOME ||
        process.env.ANDROID_SDK_ROOT ||
        path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
      const cmakeDir = path.join(sdk, "cmake", CMAKE_VERSION);
      if (!fs.existsSync(cmakeDir)) {
        console.warn(
          `[with-windows-cmake] CMake ${CMAKE_VERSION} not found in ${sdk}; ` +
            `install it: sdkmanager --install "cmake;${CMAKE_VERSION}"`,
        );
        return cfg;
      }
      const file = path.join(cfg.modRequest.platformProjectRoot, "local.properties");
      const kept = fs.existsSync(file)
        ? fs
            .readFileSync(file, "utf8")
            .split(/\r?\n/)
            .filter((line) => line && !line.startsWith("cmake.dir="))
        : [];
      // .properties files escape ':' and '\'.
      const escaped = cmakeDir.split("\\").join("\\\\").split(":").join("\\:");
      fs.writeFileSync(file, [...kept, `cmake.dir=${escaped}`, ""].join("\n"));
      return cfg;
    },
  ]);
};

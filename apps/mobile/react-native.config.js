// Native libraries that pnpm installs as optional add-ons of expo-router but the app never imports.
// Skipping them avoids compiling their C++ code (slow, and deep paths on Windows; see AGENTS.md
// section 12). Remove an entry when the app starts using that library.
const notUsed = { platforms: { android: null, ios: null } };

module.exports = {
  dependencies: {
    "react-native-reanimated": notUsed,
    "react-native-worklets": notUsed,
    "react-native-gesture-handler": notUsed,
  },
};

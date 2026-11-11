// Keeps CMake object-file paths short so native builds don't hit the Windows
// 260-character path limit ("Filename longer than 260 characters" / ninja
// mkdir "No such file or directory").
//
// The Android toolchain leaves CMAKE_OBJECT_PATH_MAX unset, so CMake never
// shortens object names; setting it makes CMake hash long paths instead.
// Use 250 (CMake's Windows default): a much lower value (e.g. 200) is smaller
// than object dir + 32-char hash + filename, so CMake gives up and keeps the
// full-length path.
//
// Applied to the app module (android/app/build.gradle) and to every Android
// library module (via android/build.gradle) — libraries such as
// react-native-reanimated run their own CMake builds under node_modules.
// Lives in a config plugin so `npx expo prebuild --clean` re-applies it.
//
// The app module needs a higher value: its codegen object dirs are deep
// (e.g. .cxx/RelWithDebInfo/<hash>/armeabi-v7a/rngesturehandler_codegen_
// autolinked_build/...), so at 250 there's no room left for hash + filename.
// 257 is the ceiling: ninja 1.10 (SDK CMake 3.22) stats paths up to 259
// chars and also needs room for the "<obj>.d" depfile.
const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = 'CMAKE_OBJECT_PATH_MAX';
const APP_VALUE = 257;
const LIBRARY_VALUE = 250;

const APP_SNIPPET = `        externalNativeBuild {
            cmake {
                arguments "-D${MARKER}=${APP_VALUE}"
            }
        }`;

const ROOT_SNIPPET = `// Windows path-length workaround for native library builds (plugins/withCmakeObjectPathMax.js)
subprojects { sub ->
  sub.plugins.withId('com.android.library') {
    sub.android.defaultConfig.externalNativeBuild.cmake.arguments('-D${MARKER}=${LIBRARY_VALUE}')
  }
}
`;

function withAppModule(config) {
  return withAppBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults;
    if (gradle.language !== 'groovy' || gradle.contents.includes(MARKER)) {
      return cfg;
    }
    const anchor = /(\n\s*defaultConfig\s*\{[^\n]*\n)/;
    if (!anchor.test(gradle.contents)) {
      throw new Error('withCmakeObjectPathMax: defaultConfig block not found in android/app/build.gradle');
    }
    gradle.contents = gradle.contents.replace(anchor, `$1${APP_SNIPPET}\n`);
    return cfg;
  });
}

function withLibraryModules(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults;
    if (gradle.language !== 'groovy' || gradle.contents.includes(MARKER)) {
      return cfg;
    }
    // Register before the root-project plugins, which may evaluate modules early.
    const anchor = /\napply plugin: "expo-root-project"/;
    gradle.contents = anchor.test(gradle.contents)
      ? gradle.contents.replace(anchor, `\n${ROOT_SNIPPET}$&`)
      : `${gradle.contents}\n${ROOT_SNIPPET}`;
    return cfg;
  });
}

module.exports = function withCmakeObjectPathMax(config) {
  return withLibraryModules(withAppModule(config));
};

// withMedia3Fix
// ---------------------------------------------------------------------------
// Expo config plugin that aligns ALL androidx.media3 artifacts to a single
// version across the whole Android build.
//
// Why: react-native-video 6.19.2 is compiled against androidx.media3 1.8.0
// (see node_modules/react-native-video/android/gradle.properties:
// RNVideo_media3Version=1.8.0). Other dependencies in an Expo SDK 57 build can
// pull older media3 transitively, and Gradle's default resolution then picks
// the older one — so at runtime DefaultLoadControl is missing the constructor
// react-native-video calls, crashing the feed page with:
//   java.lang.NoSuchMethodError: No direct method <init>(
//     Landroidx/media3/exoplayer/upstream/DefaultAllocator;IIIIIZIZ)V
//     in class Landroidx/media3/exoplayer/DefaultLoadControl;
//
// This plugin appends a global resolutionStrategy to the PROJECT-level
// android/build.gradle (via expo/config-plugins — no manual edits to any
// native folder required) forcing every androidx.media3 dependency to the
// version react-native-video was built against.
// ---------------------------------------------------------------------------

const { withProjectBuildGradle } = require("expo/config-plugins");

// Must match RNVideo_media3Version of the installed react-native-video.
const MEDIA3_VERSION = "1.8.0";

const GROOVY_RESOLUTION_BLOCK = `
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency { details ->
            if (details.requested.group == 'androidx.media3') {
                details.useVersion '${MEDIA3_VERSION}'
                details.because 'Align Media3 versions to fix DefaultLoadControl mismatch (react-native-video)'
            }
        }
    }
}
`;

const KOTLIN_RESOLUTION_BLOCK = `
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency {
            if (requested.group == "androidx.media3") {
                useVersion("${MEDIA3_VERSION}")
                because("Align Media3 versions to fix DefaultLoadControl mismatch (react-native-video)")
            }
        }
    }
}
`;

function withMedia3Fix(config) {
  return withProjectBuildGradle(config, (config) => {
    const { language, contents } = config.modResults;

    // Idempotent: skip if the strategy was already injected by a previous run.
    if (contents.includes("Align Media3 versions")) {
      return config;
    }

    if (language === "groovy") {
      config.modResults.contents = `${contents}\n${GROOVY_RESOLUTION_BLOCK}`;
    } else if (language === "kt") {
      config.modResults.contents = `${contents}\n${KOTLIN_RESOLUTION_BLOCK}`;
    } else {
      throw new Error(
        `withMedia3Fix: unsupported project build.gradle language "${language}"`,
      );
    }

    return config;
  });
}

module.exports = withMedia3Fix;
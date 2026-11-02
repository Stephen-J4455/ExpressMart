const {
  withAppBuildGradle,
  withGradleProperties,
} = require("expo/config-plugins");

const CMAKE_ARGUMENT = "-DCMAKE_OBJECT_PATH_MAX=128";
const MARKER = "CMAKE_OBJECT_PATH_MAX=128";

function withCmakeObjectPathMax(config) {
  config = withGradleProperties(config, (config) => {
    const properties = config.modResults;
    const parallelProperty = properties.find(
      (property) => property.type === "property" && property.key === "org.gradle.parallel",
    );

    if (parallelProperty) {
      parallelProperty.value = "false";
    } else {
      properties.push({
        type: "property",
        key: "org.gradle.parallel",
        value: "false",
      });
    }

    return config;
  });

  return withAppBuildGradle(config, (config) => {
    const { language, contents } = config.modResults;

    if (contents.includes(MARKER)) {
      return config;
    }

    if (language !== "groovy") {
      throw new Error(
        `withCmakeObjectPathMax: unsupported app build.gradle language "${language}"`,
      );
    }

    const defaultConfigBlock = /defaultConfig\s*\{/;
    if (!defaultConfigBlock.test(contents)) {
      throw new Error(
        "withCmakeObjectPathMax: app build.gradle is missing its defaultConfig block",
      );
    }

    config.modResults.contents = contents.replace(
      defaultConfigBlock,
      `defaultConfig {\n        externalNativeBuild {\n            cmake {\n                arguments.add("${CMAKE_ARGUMENT}")\n            }\n        }`,
    );

    return config;
  });
}

module.exports = withCmakeObjectPathMax;

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withFmtFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      if (fs.existsSync(file)) {
        let contents = fs.readFileSync(file, 'utf8');

        const fixCode = `
  # FIX: Force fmt to c++17 AFTER react_native_post_install
  installer.pods_project.targets.each do |target|
    if target.name == 'fmt'
      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
  end
`;

        const targetRegex = /react_native_post_install\([^)]*\)/;
        if (targetRegex.test(contents) && !contents.includes("FIX: Force fmt to c++17 AFTER react_native_post_install")) {
          // Inject AFTER react_native_post_install
          contents = contents.replace(targetRegex, (match) => match + "\n" + fixCode);
          fs.writeFileSync(file, contents);
        }
      }
      return config;
    },
  ]);
};

module.exports = withFmtFix;

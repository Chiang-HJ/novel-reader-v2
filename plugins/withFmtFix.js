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
  # Fix for fmt consteval error
  installer.pods_project.targets.each do |target|
    if target.name == 'fmt'
      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
  end
`;

        if (!contents.includes("target.name == 'fmt'")) {
          // Find the post_install block and append the fixCode
          contents = contents.replace(
            /post_install do \|installer\|/g,
            `post_install do |installer|\n${fixCode}`
          );
          fs.writeFileSync(file, contents);
        }
      }
      return config;
    },
  ]);
};

module.exports = withFmtFix;

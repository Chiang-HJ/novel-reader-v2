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
        
        // Remove old broken regex patches if any
        contents = contents.replace(/# FIX: Force fmt to c\+\+17[\s\S]*?end\n    end\n  end\n/g, '');
        contents = contents.replace(/# Fix for fmt consteval error[\s\S]*?end\n    end\n  end\n/g, '');

        const fixCode = `

# FIX: Force fmt to c++17 using a dedicated hook at the end of the Podfile
Pod::HooksManager.register('fmt_fix', :post_install) do |installer|
  installer.pods_project.targets.each do |target|
    if target.name == 'fmt'
      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
  end
end
`;

        if (!contents.includes("Pod::HooksManager.register('fmt_fix'")) {
          // Simply append the hook to the very end of the file!
          contents += fixCode;
          fs.writeFileSync(file, contents);
        }
      }
      return config;
    },
  ]);
};

module.exports = withFmtFix;

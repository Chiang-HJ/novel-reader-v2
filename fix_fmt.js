const fs = require('fs');

// Patch the fmt podspec DIRECTLY in node_modules BEFORE prebuild runs.
// This is the correct fix - the podspec calls rct_cxx_language_standard() which
// returns 'c++20' on Xcode 26+, causing consteval errors.
// We replace it with a hardcoded 'c++17' for fmt only.

const podspecPath = 'node_modules/react-native/third-party-podspecs/fmt.podspec';

if (!fs.existsSync(podspecPath)) {
  console.error(`ERROR: ${podspecPath} not found!`);
  process.exit(1);
}

let content = fs.readFileSync(podspecPath, 'utf8');

if (content.includes('rct_cxx_language_standard()')) {
  content = content.replace(
    '"CLANG_CXX_LANGUAGE_STANDARD" => rct_cxx_language_standard()',
    '"CLANG_CXX_LANGUAGE_STANDARD" => "c++17"'
  );
  fs.writeFileSync(podspecPath, content);
  console.log('SUCCESS: Patched fmt.podspec to use c++17 instead of rct_cxx_language_standard()');
} else if (content.includes('"CLANG_CXX_LANGUAGE_STANDARD" => "c++17"')) {
  console.log('fmt.podspec already patched.');
} else {
  console.error('ERROR: Could not find rct_cxx_language_standard() in fmt.podspec! Manual check required.');
  console.log('Current content:', content);
  process.exit(1);
}

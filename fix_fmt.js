const fs = require('fs');

const fmtPodspecPath = 'node_modules/react-native/third-party-podspecs/fmt.podspec';
if (!fs.existsSync(fmtPodspecPath)) {
  console.error(`ERROR: ${fmtPodspecPath} not found!`);
  process.exit(1);
}
let fmtContent = fs.readFileSync(fmtPodspecPath, 'utf8');
if (fmtContent.includes('rct_cxx_language_standard()')) {
  fmtContent = fmtContent.replace(
    '"CLANG_CXX_LANGUAGE_STANDARD" => rct_cxx_language_standard()',
    '"CLANG_CXX_LANGUAGE_STANDARD" => "c++17"'
  );
  fs.writeFileSync(fmtPodspecPath, fmtContent);
  console.log('SUCCESS: Patched fmt.podspec to use c++17');
} else {
  console.log('fmt.podspec already patched.');
}

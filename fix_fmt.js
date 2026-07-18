const fs = require('fs');

// ── Fix 1: Patch fmt.podspec ─────────────────────────────────────────────────
// rct_cxx_language_standard() returns 'c++20' on Xcode 26+, causing consteval errors.
// We hardcode 'c++17' for fmt only.
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

// ── Fix 2: Patch @react-native-community/slider podspec ──────────────────────
// The slider podspec unconditionally includes RNCSliderComponentView.mm (a Fabric file)
// even when New Architecture is disabled, causing a missing header error.
// We exclude the Fabric .mm file when running in Old Architecture mode.
const sliderPodspecPath = 'node_modules/@react-native-community/slider/react-native-slider.podspec';
if (!fs.existsSync(sliderPodspecPath)) {
  console.warn(`WARNING: ${sliderPodspecPath} not found, skipping.`);
} else {
  let sliderContent = fs.readFileSync(sliderPodspecPath, 'utf8');
  if (sliderContent.includes('s.source_files = "ios/**/*.{h,m,mm}"')) {
    sliderContent = sliderContent.replace(
      's.source_files = "ios/**/*.{h,m,mm}"',
      // Only include .mm files when New Architecture is enabled
      `new_arch_enabled ? s.source_files = "ios/**/*.{h,m,mm}" : (s.source_files = "ios/**/*.{h,m}"; s.exclude_files = "ios/**/RNCSliderComponentView.{h,mm}")`
    );
    fs.writeFileSync(sliderPodspecPath, sliderContent);
    console.log('SUCCESS: Patched slider podspec to exclude Fabric files in Old Architecture');
  } else {
    console.log('slider podspec already patched or has unexpected format.');
  }
}

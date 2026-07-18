const fs = require('fs');
const file = 'ios/Podfile';
if (fs.existsSync(file)) {
  let p = fs.readFileSync(file, 'utf8');
  if (!p.includes("target.name == 'fmt'")) {
    p = p.replace(/post_install do \|installer\|/g, 
`post_install do |installer|
  installer.pods_project.targets.each do |t|
    if t.name == 'fmt'
      t.build_configurations.each do |c|
        c.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
  end`);
    fs.writeFileSync(file, p);
    console.log("Successfully patched ios/Podfile for fmt consteval error");
  } else {
    console.log("Podfile already patched.");
  }
} else {
  console.log("ios/Podfile not found!");
}

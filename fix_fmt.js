const fs = require('fs');
const file = 'ios/Podfile';
if (fs.existsSync(file)) {
  let p = fs.readFileSync(file, 'utf8');
  
  // Foolproof regex to find react_native_post_install(...)
  // [^)]* matches everything (including newlines) until the first closing parenthesis
  const targetRegex = /react_native_post_install\([^)]*\)/;
  
  if (targetRegex.test(p)) {
    p = p.replace(targetRegex, (match) => {
      return match + `
  
  # FIX: Force fmt to c++17 AFTER react_native_post_install
  installer.pods_project.targets.each do |t|
    if t.name == 'fmt'
      t.build_configurations.each do |c|
        c.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
  end
`;
    });
    
    // Clean up any old duplicate patches at the top
    p = p.replace(/# Fix for fmt consteval error[\s\S]*?end\n    end\n  end\n/g, '');
    
    fs.writeFileSync(file, p);
    console.log("Successfully patched ios/Podfile to inject fix AFTER react_native_post_install");
  } else {
    console.log("Could not find react_native_post_install in Podfile!");
  }
} else {
  console.log("ios/Podfile not found!");
}

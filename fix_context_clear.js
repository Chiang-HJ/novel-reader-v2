const fs = require('fs');
let code = fs.readFileSync('src/context/DownloadContext.js', 'utf8');

const delayClearTaskStr = `
        setTimeout(() => {
            setActiveTask(null);
            activeTaskRef.current = null;
            setProgressText('');
            setActiveTaskProgress(null);
            setQueue(prev => prev.filter(q => q.url !== task?.url));
        }, 3000);`;

// Replace in success block (around line 796)
code = code.replace(
    /setProgressText\(`🎉 下載完成！共下載 \$\{completedCount\} 個章節`\);\s*setActiveTask\(null\);\s*activeTaskRef\.current = null;\s*setQueue\(prev => prev\.filter\(q => q\.url !== task\?\.url\)\);/,
    'setProgressText(`🎉 下載完成！共下載 ${completedCount} 個章節`);' + delayClearTaskStr
);

// Replace in error block (around line 807)
code = code.replace(
    /setProgressText\(`下載失敗: \$\{e\.message\}`\);\s*setActiveTask\(null\);\s*activeTaskRef\.current = null;\s*setQueue\(prev => prev\.filter\(q => q\.url !== task\?\.url\)\);/,
    'setProgressText(`下載失敗: ${e.message}`);' + delayClearTaskStr
);

// Replace in no chapters block (around line 565)
code = code.replace(
    /setProgressText\('無需要下載的章節'\);\s*setActiveTask\(null\);\s*activeTaskRef\.current = null;\s*setQueue\(prev => prev\.filter\(q => q\.url !== task\?\.url\)\);/,
    'setProgressText(\'無需要下載的章節\');' + delayClearTaskStr
);

fs.writeFileSync('src/context/DownloadContext.js', code, 'utf8');

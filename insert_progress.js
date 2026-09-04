const fs = require('fs');
let code = fs.readFileSync('src/screens/HomeScreen.js', 'utf8');

// Add import if not exists
if (!code.includes('import DownloadProgress')) {
    code = code.replace('import FolderListItem from \'../components/home/FolderListItem\';', "import FolderListItem from '../components/home/FolderListItem';\nimport DownloadProgress from '../components/home/DownloadProgress';");
}

// Add the component after FlatList
if (!code.includes('<DownloadProgress')) {
    const injectionStr = `            />
            
            <DownloadProgress
                queue={queue}
                activeTask={activeTask}
                progressText={progressText}
                cancelDownload={cancelDownload}
                colors={colors}
                activeTaskProgress={activeTaskProgress}
                retryChapterDownload={retryChapterDownload}
                novelId={downloadingNovelId}
            />`;
    code = code.replace(/            \/>\s*{\/\* Batch Action Bottom Bar \*\//, injectionStr + '\n\n            {/* Batch Action Bottom Bar */');
}

fs.writeFileSync('src/screens/HomeScreen.js', code, 'utf8');

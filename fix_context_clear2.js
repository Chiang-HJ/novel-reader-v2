const fs = require('fs');
let lines = fs.readFileSync('src/context/DownloadContext.js', 'utf8').split('\n');

for(let i=0; i<lines.length; i++) {
    const l = lines[i];
    if (l.includes('setProgressText(`🎉 下載完成！') || l.includes('setProgressText(`下載失敗:') || l.includes('setProgressText(\'無需要下載的章節\')')) {
        if (lines[i+1].includes('setActiveTask(null)')) {
            lines[i+1] = '        setTimeout(() => { setActiveTask(null); activeTaskRef.current = null; setProgressText(\'\'); setActiveTaskProgress(null); setQueue(prev => prev.filter(q => q.url !== task?.url)); }, 3000);';
            lines[i+2] = '';
            lines[i+3] = '';
        }
    }
}
fs.writeFileSync('src/context/DownloadContext.js', lines.join('\n'), 'utf8');

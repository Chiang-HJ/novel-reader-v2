const fs = require('fs');
let code = fs.readFileSync('src/screens/HomeScreen.js', 'utf8');

const targetStr = `<DownloadProgress
                queue={queue}
                activeTask={activeTask}
                progressText={progressText}
                cancelDownload={cancelDownload}
                colors={colors}
                activeTaskProgress={activeTaskProgress}
                retryChapterDownload={retryChapterDownload}
                novelId={downloadingNovelId}
            />`;

const wrappedStr = `            <View style={{ position: 'absolute', bottom: isSelectionMode ? 120 : 30, left: 0, right: 0, zIndex: 50 }}>
                <DownloadProgress
                    queue={queue}
                    activeTask={activeTask}
                    progressText={progressText}
                    cancelDownload={cancelDownload}
                    colors={colors}
                    activeTaskProgress={activeTaskProgress}
                    retryChapterDownload={retryChapterDownload}
                    novelId={downloadingNovelId}
                />
            </View>`;

code = code.replace(targetStr, wrappedStr);

fs.writeFileSync('src/screens/HomeScreen.js', code, 'utf8');

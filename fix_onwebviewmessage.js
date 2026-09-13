const fs = require('fs');
let code = fs.readFileSync('src/screens/ReaderScreen.js', 'utf8');

const target = `            if (!text) {
                setIsScraping(false);
                setErrorLog(\`無法解析該章節內容，請稍候重試\`);
                setScrapeUrl(null);
                return;
                }
            }
        } finally {
            isTogglingRef.current = false;
        }
    };`;

const replacement = `            if (!text) {
                setIsScraping(false);
                setErrorLog(\`無法解析該章節內容，請稍候重試\`);
                setScrapeUrl(null);
                return;
            }

            const title = n.chapters[currentIdx].title;
            
            // Save local
            await saveChapterText(n.id, currentIdx, title, text);
            
            setIsScraping(false);
            setScrapeUrl(null);
            applyChapterData({ title, text }, n.id, currentIdx, 0);
        } catch(e) {
            setIsScraping(false);
            setErrorLog(\`處理章節資料錯誤: \${e.message}\`);
            setScrapeUrl(null);
        }
    };`;

code = code.replace(target, replacement);
fs.writeFileSync('src/screens/ReaderScreen.js', code, 'utf8');

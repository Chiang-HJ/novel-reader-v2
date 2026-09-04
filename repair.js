const fs = require('fs');
let c = fs.readFileSync('src/context/TwitterDownloadContext.js', 'utf8');
let lines = c.split('\n');

lines[42] = "        setTwitterProgressText('準備下載...');";
lines[47] = "                Alert.alert('下載超時', '下載任務已超時 (45秒)，請確認網路狀態後重試');";
lines[69] = "            const errorMsg = message === 'ERROR_NO_VIDEO' ? '找不到影片，可能為私人推文或請先登入' : '解析網址發生錯誤';";
lines[70] = "            Alert.alert('下載失敗', errorMsg);";
lines[81] = "                    Alert.alert('下載失敗', data.error);";
lines[116] = "                            setTwitterProgressText(\下載進度 \/\: \%\);";
lines[139] = "                            title: urls.length > 1 ? \Twitter 檔案 (\/\)\ : 'Twitter 檔案',";
lines[158] = "                    Alert.alert('下載完成', \已將 \ 個媒體檔案加入私密金庫。\);";
lines[160] = "                    Alert.alert('下載失敗', '沒有下載任何檔案。');";
lines[163] = "                Alert.alert('下載錯誤', e.message);";

fs.writeFileSync('src/context/TwitterDownloadContext.js', lines.join('\n'), 'utf8');

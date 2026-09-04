const fs = require('fs');
let lines = fs.readFileSync('src/screens/HomeScreen.js', 'utf8').split('\n');

lines[165] = "                        Alert.alert('Face ID 驗證失敗', '系統偵測不到可用的 Face ID，請至 iPhone 的「設定」>「Expo Go」中確認是否已允許使用 Face ID。\\n\\n(若失敗，將改以密碼登入)');";
lines[167] = "                        Alert.alert('驗證失敗', '生物辨識失敗。');";
lines[171] = "                Alert.alert('驗證失敗', '請至系統設定中啟用生物辨識（Face ID / Touch ID）或設定密碼。');";
lines[194] = "            Alert.alert('錯誤', '建立資料夾失敗。');";
lines[267] = "                Alert.alert('提示', '這個網址已經在下載佇列中。');";
lines[272] = "            Alert.alert('輸入錯誤', '無效的網址，目前支援狂人小說與微風小說網址。(例如 czbooks, wyblogs 等)');";
lines[336] = "            Alert.alert('匯入失敗', error.message || '讀取檔案時發生錯誤。');";
lines[345] = "            Alert.alert('提示', '請輸入小說書名。');";
lines[699] = "                                <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>移動：{selectedNovel?.title || (selectedIds.size > 0 ? selectedIds.size + ' 本選中書籍' : '')}</Text>";
lines[766] = "                                    <Text style={{ color: colors.text, fontSize: 16 }}>{isBackingUp ? '備份中...' : '備份書架與設定'}</Text>";
lines[789] = "                                      ? '⚠️ 簽名已到期，請接上電腦重新驗證/簽名。'";
lines[878] = "                                        {isImporting ? '解析並匯入中...' : '解析網址並匯入'}";

fs.writeFileSync('src/screens/HomeScreen.js', lines.join('\n'), 'utf8');

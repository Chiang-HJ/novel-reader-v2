const fs = require('fs');

function repair(file) {
    let content = fs.readFileSync(file, 'utf8');

    // Restore missing Chinese texts by doing global regex replaces for specific broken UI texts
    // If we missed something, the UI might still show '?', but at least we can fix everything we find
    
    // HomeScreen texts
    content = content.replace(/已\?\?/g, "已重置");
    content = content.replace(/\?\? 7 天簽\?倒數已\?置為今天\?/g, "側載 7 天簽名倒數已重置為今天。");
    content = content.replace(/\?置失\?/g, "重置失敗");
    content = content.replace(/\?誤/g, "錯誤");
    content = content.replace(/起\?章\?必\?小於結\?章\?/g, "起始章節必須小於結束章節");
    content = content.replace(/\?\?\?\?, '系統\?測不到\?用\?\?Face ID\?\?\?\?iPhone \?「設定\?\?\?Expo Go\?\?確\?\?否已\?\?許\?用\?Face ID\?。\\n\\n\(\?失\?\?將改\?\?碼登\?\?/g, "Face ID 驗證失敗', '系統偵測不到可用的 Face ID，請至 iPhone 的「設定」>「Expo Go」中確認是否已允許使用 Face ID。\\n\\n(若失敗，將改以密碼登入)");
    content = content.replace(/\?\?失\?/g, "驗證失敗");
    content = content.replace(/\?物辨\?失\?\?\?/g, "生物辨識失敗。'");
    content = content.replace(/請\?\?系統設定中\?用\?物辨\?（Face ID \/ Touch ID）\?設\?密碼\?\?/g, "請至系統設定中啟用生物辨識（Face ID / Touch ID）或設定密碼。'");
    content = content.replace(/\?\?\?\?\?誤/g, "掃描發生錯誤");
    content = content.replace(/建\?資\?夾失\?\?/g, "建立資料夾失敗。'");
    content = content.replace(/移\?失\?/g, "移動失敗");
    content = content.replace(/\?除失\?/g, "刪除失敗");
    content = content.replace(/\?示/g, "提示");
    content = content.replace(/\?個網\?已\?\?\?載\?\?中\?/g, "這個網址已經在下載佇列中。'");
    content = content.replace(/輸入\?誤/g, "輸入錯誤");
    content = content.replace(/\?\?\?網\?，目\?支\?\?\?人網\?微風小說網\?\?\(例\? czbooks, wyblogs \?\?\?/g, "無效的網址，目前支援狂人小說與微風小說網址。(例如 czbooks, wyblogs 等)'");
    content = content.replace(/\?\?不能\?空/g, "網址不能為空");
    content = content.replace(/\?新失\?/g, "更新失敗");
    content = content.replace(/\?入\?\?/g, "匯入成功");
    content = content.replace(/\?\?\{result\.title\}\?已\?\?\?入\?\?，共 \$\{result\.chapterCount\} 章\?/g, "小說 {result.title} 已成功匯入書架，共  章節");
    content = content.replace(/\?入失\?/g, "匯入失敗");
    content = content.replace(/\?\?檔\?\?發\?錯\?/g, "讀取檔案時發生錯誤。'");
    content = content.replace(/請輸\?\?說\?\?/g, "請輸入小說書名。'");
    content = content.replace(/請輸\?\?貼\?小說\?容/g, "請輸入或貼上小說內容");
    content = content.replace(/\?\?/g, "成功");
    content = content.replace(/EPUB\?\?\{parsed\.title\}\?匯\?\?\?\?/g, "EPUB 小說 {parsed.title} 匯入成功");
    content = content.replace(/\?\?\?\? EPUB 檔\?/g, "讀取或解析 EPUB 檔案失敗");
    content = content.replace(/不支\?\?\?\?/g, "不支援的檔案格式");
    content = content.replace(/\?\?\?支\?\?\.txt \?\?\.epub 檔\?/g, "目前僅支援 .txt 或是 .epub 檔案");
    content = content.replace(/\?\?檔\?\?發\?\?\?/g, "讀取檔案時發生例外:");
    content = content.replace(/\?\?失\?/g, "處理失敗");
    content = content.replace(/移\?\?\{selectedNovel\?\.title \|\| \(selectedIds\.size > 0 \? selectedIds\.size \+ ' \?選\?書\? : ''\)\}\?\?\/Text>/g, "移動到：{selectedNovel?.title || (selectedIds.size > 0 ? selectedIds.size + ' 本選中書籍' : '')}</Text>");
    content = content.replace(/\?份\?\.\./g, "備份中...");
    content = content.replace(/\?份\?架\?設\?/g, "備份書架與設定");
    content = content.replace(/\? '\?\? 簽\?已到\?\?請接\?腦\?新驗\?\/簽\?\?/g, "? '⚠️ 簽名已到期，請接上電腦重新驗證/簽名。'");
    content = content.replace(/\?\?並匯\?中\.\.\./g, "解析並匯入中...");
    content = content.replace(/\?\?\?\?並匯\?\?/g, "解析網址並匯入");

    // Also some generic replacements that might be leftover
    content = content.replace(//g, ""); // strip unknown characters if any
    
    fs.writeFileSync(file, content, 'utf8');
}

repair('src/screens/HomeScreen.js');

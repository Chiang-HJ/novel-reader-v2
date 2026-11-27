/**
 * NovelSync - Google Apps Script Cloud Queue & Drive Bridge
 * 
 * 部署方式：
 * 1. 前往 https://script.google.com 或在 Google 雲端硬碟點「+ 新增」->「更多」->「Google Apps Script」
 * 2. 將此檔案完整覆蓋貼入編輯器中並儲存
 * 3. 點選右上角「部署」->「新增部署作業」
 *    - 類型選「網頁應用程式 (Web App)」
 *    - 執行身分選「我 (Me)」
 *    - 誰可以存取選「所有人 (Anyone)」
 * 4. 授權權限後，複製「網頁應用程式網址 (Web app URL)」貼回手機 APP 與電腦端 worker_config.json
 */

const DEFAULT_API_KEY = 'ns_k9m4x7p2v8q5r3w6';
const ROOT_FOLDER_NAME = 'NovelSync_CloudQueue';
const OUTPUT_FOLDER_NAME = 'outputs';
const SHEET_FILE_NAME = 'NovelSync_Tasks';
const HEADERS = ['id', 'url', 'kind', 'title', 'meta_json', 'status', 'progress', 'files_json', 'error', 'created_at', 'updated_at'];

function getApiKey() {
  const propKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  return propKey || DEFAULT_API_KEY;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 首次測試或初始化用：可在 Apps Script 編輯器直接選取 setup 後點「執行」提早完成權限授權與資料夾建立
 */
function setup() {
  const storage = getEnvStorage();
  return {
    ok: true,
    rootFolderId: storage.rootFolder.getId(),
    outputFolderId: storage.outputFolder.getId(),
    sheetId: storage.sheet.getParent().getId()
  };
}

function getEnvStorage() {
  const props = PropertiesService.getScriptProperties();
  let rootId = props.getProperty('ROOT_FOLDER_ID');
  let outputId = props.getProperty('OUTPUT_FOLDER_ID');
  let sheetFileId = props.getProperty('SHEET_FILE_ID');

  let rootFolder = null;
  if (rootId) {
    try {
      rootFolder = DriveApp.getFolderById(rootId);
      if (rootFolder.isTrashed()) rootFolder = null;
    } catch (e) { rootFolder = null; }
  }
  if (!rootFolder) {
    const it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
    while (it.hasNext()) {
      const f = it.next();
      if (!f.isTrashed()) { rootFolder = f; break; }
    }
    if (!rootFolder) {
      rootFolder = DriveApp.createFolder(ROOT_FOLDER_NAME);
    }
    props.setProperty('ROOT_FOLDER_ID', rootFolder.getId());
  }

  let outputFolder = null;
  if (outputId) {
    try {
      outputFolder = DriveApp.getFolderById(outputId);
      if (outputFolder.isTrashed()) outputFolder = null;
    } catch (e) { outputFolder = null; }
  }
  if (!outputFolder) {
    const it = rootFolder.getFoldersByName(OUTPUT_FOLDER_NAME);
    while (it.hasNext()) {
      const f = it.next();
      if (!f.isTrashed()) { outputFolder = f; break; }
    }
    if (!outputFolder) {
      outputFolder = rootFolder.createFolder(OUTPUT_FOLDER_NAME);
    }
    props.setProperty('OUTPUT_FOLDER_ID', outputFolder.getId());
  }

  let ss = null;
  if (sheetFileId) {
    try {
      const f = DriveApp.getFileById(sheetFileId);
      if (!f.isTrashed()) ss = SpreadsheetApp.openById(sheetFileId);
    } catch (e) { ss = null; }
  }
  if (!ss) {
    const it = rootFolder.getFilesByName(SHEET_FILE_NAME);
    while (it.hasNext()) {
      const f = it.next();
      if (!f.isTrashed()) {
        ss = SpreadsheetApp.openById(f.getId());
        break;
      }
    }
    if (!ss) {
      ss = SpreadsheetApp.create(SHEET_FILE_NAME);
      const createdFile = DriveApp.getFileById(ss.getId());
      createdFile.moveTo(rootFolder);
    }
    props.setProperty('SHEET_FILE_ID', ss.getId());
  }

  let sheet = ss.getSheetByName('Tasks') || ss.getSheets()[0];
  if (sheet.getName() !== 'Tasks') sheet.setName('Tasks');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }

  return { rootFolder, outputFolder, sheet };
}

function rowToTask(row) {
  let meta = {};
  let files = [];
  try { meta = row[4] ? JSON.parse(row[4]) : {}; } catch (e) {}
  try { files = row[7] ? JSON.parse(row[7]) : []; } catch (e) {}
  return {
    id: String(row[0] || ''),
    url: String(row[1] || ''),
    kind: String(row[2] || 'auto'),
    title: String(row[3] || ''),
    meta,
    status: String(row[5] || 'pending'),
    progress: String(row[6] || ''),
    files,
    error: String(row[8] || ''),
    createdAt: Number(row[9] || 0),
    updatedAt: Number(row[10] || 0)
  };
}

function findRowIndexById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      return i + 2;
    }
  }
  return -1;
}

function cleanupExpiredFiles(daysToKeep) {
  try {
    const { outputFolder } = getEnvStorage();
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const files = outputFolder.getFiles();
    let count = 0;
    while (files.hasNext() && count < 20) {
      const f = files.next();
      if (f.getLastUpdated().getTime() < cutoff) {
        f.setTrashed(true);
        count++;
      }
    }
  } catch (e) {}
}

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    if (params.key !== getApiKey()) {
      return jsonOut({ ok: false, error: 'Unauthorized: API Key 錯誤' });
    }

    const action = params.action || 'ping';

    if (action === 'ping') {
      const { rootFolder, sheet } = getEnvStorage();
      return jsonOut({
        ok: true,
        message: '連線成功！Google 雲端硬碟同步就緒。',
        rootFolderId: rootFolder.getId(),
        sheetId: sheet.getParent().getId()
      });
    }

    if (action === 'list') {
      const { sheet } = getEnvStorage();
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return jsonOut({ ok: true, tasks: [] });
      const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
      const tasks = rows.map(rowToTask).reverse().slice(0, 60);
      return jsonOut({ ok: true, tasks });
    }

    if (action === 'poll') {
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const { sheet } = getEnvStorage();
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return jsonOut({ ok: true, task: null });
        const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
        for (let i = 0; i < rows.length; i++) {
          if (String(rows[i][5]) === 'pending') {
            const rowIdx = i + 2;
            const now = Date.now();
            sheet.getRange(rowIdx, 6).setValue('processing');
            sheet.getRange(rowIdx, 7).setValue('電腦端已接單，準備解析...');
            sheet.getRange(rowIdx, 11).setValue(now);
            rows[i][5] = 'processing';
            rows[i][6] = '電腦端已接單，準備解析...';
            rows[i][10] = now;
            return jsonOut({ ok: true, task: rowToTask(rows[i]) });
          }
        }
        return jsonOut({ ok: true, task: null });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'download_b64') {
      const fileId = params.fileId;
      if (!fileId) return jsonOut({ ok: false, error: 'Missing fileId' });
      const file = DriveApp.getFileById(fileId);
      const blob = file.getBlob();
      return jsonOut({
        ok: true,
        fileName: file.getName(),
        mimeType: blob.getContentType(),
        size: file.getSize(),
        base64: Utilities.base64Encode(blob.getBytes())
      });
    }

    return jsonOut({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    if (body.key !== getApiKey()) {
      return jsonOut({ ok: false, error: 'Unauthorized: API Key 錯誤' });
    }

    const action = body.action;

    if (action === 'upload_chunk') {
      const { outputFolder } = getEnvStorage();
      const fileName = body.fileName || ('chunk_' + Date.now() + '.zip');
      const mimeType = body.mimeType || 'application/zip';
      const bytes = Utilities.base64Decode(body.base64 || '');
      const blob = Utilities.newBlob(bytes, mimeType, fileName);
      const file = outputFolder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const fileId = file.getId();
      return jsonOut({
        ok: true,
        fileId,
        name: fileName,
        size: bytes.length,
        part: Number(body.part || 1),
        totalParts: Number(body.totalParts || 1),
        url: 'https://drive.usercontent.google.com/download?id=' + fileId + '&export=download&confirm=t'
      });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const { sheet } = getEnvStorage();

      if (action === 'create') {
        const url = String(body.url || '').trim();
        if (!url) return jsonOut({ ok: false, error: '缺少網址' });

        const lastRow = sheet.getLastRow();
        if (lastRow >= 2) {
          const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
          for (let i = 0; i < rows.length; i++) {
            const st = String(rows[i][5]);
            if (String(rows[i][1]) === url && (st === 'pending' || st === 'processing')) {
              return jsonOut({ ok: true, duplicate: true, task: rowToTask(rows[i]) });
            }
          }
        }

        const now = Date.now();
        const id = 'task_' + now + '_' + Math.floor(Math.random() * 10000);
        const kind = String(body.kind || 'auto');
        const title = String(body.title || url);
        const metaJson = JSON.stringify(body.meta || {});
        const newRow = [
          id,
          url,
          kind,
          title,
          metaJson,
          'pending',
          '排隊中（等待電腦端開機接單）',
          '[]',
          '',
          now,
          now
        ];
        sheet.appendRow(newRow);
        cleanupExpiredFiles(7);
        return jsonOut({ ok: true, duplicate: false, task: rowToTask(newRow) });
      }

      const rowIdx = findRowIndexById(sheet, body.id);
      if (rowIdx === -1) {
        return jsonOut({ ok: false, error: 'Task not found' });
      }
      const now = Date.now();

      if (action === 'progress') {
        const currentStatus = String(sheet.getRange(rowIdx, 6).getValue());
        if (currentStatus === 'cancelled') {
          return jsonOut({ ok: true, cancelled: true });
        }
        if (body.title) sheet.getRange(rowIdx, 4).setValue(String(body.title));
        if (body.progress !== undefined) sheet.getRange(rowIdx, 7).setValue(String(body.progress));
        sheet.getRange(rowIdx, 11).setValue(now);
        return jsonOut({ ok: true, cancelled: false });
      }

      if (action === 'complete') {
        if (body.title) sheet.getRange(rowIdx, 4).setValue(String(body.title));
        sheet.getRange(rowIdx, 6).setValue('completed');
        sheet.getRange(rowIdx, 7).setValue(String(body.progress || '已完成，可下載匯入'));
        sheet.getRange(rowIdx, 8).setValue(JSON.stringify(body.files || []));
        sheet.getRange(rowIdx, 9).setValue('');
        sheet.getRange(rowIdx, 11).setValue(now);
        return jsonOut({ ok: true });
      }

      if (action === 'fail') {
        sheet.getRange(rowIdx, 6).setValue('failed');
        sheet.getRange(rowIdx, 7).setValue('任務失敗');
        sheet.getRange(rowIdx, 9).setValue(String(body.error || '未知錯誤'));
        sheet.getRange(rowIdx, 11).setValue(now);
        return jsonOut({ ok: true });
      }

      if (action === 'cancel') {
        sheet.getRange(rowIdx, 6).setValue('cancelled');
        sheet.getRange(rowIdx, 7).setValue('已取消');
        sheet.getRange(rowIdx, 11).setValue(now);
        return jsonOut({ ok: true });
      }

      if (action === 'delete') {
        const filesStr = String(sheet.getRange(rowIdx, 8).getValue() || '[]');
        try {
          const files = JSON.parse(filesStr);
          if (Array.isArray(files)) {
            files.forEach(f => {
              if (f && f.fileId) {
                try { DriveApp.getFileById(f.fileId).setTrashed(true); } catch (ex) {}
              }
            });
          }
        } catch (ex) {}
        sheet.deleteRow(rowIdx);
        return jsonOut({ ok: true });
      }

      return jsonOut({ ok: false, error: 'Unknown action: ' + action });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

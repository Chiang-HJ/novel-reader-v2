import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import JSZip from 'jszip';
import { Alert } from 'react-native';

export const createBackup = async (onProgress) => {
    let zipPath = null;
    try {
        if (onProgress) onProgress('正在準備設定資料...', 0.05);
        const zip = new JSZip();

        // 1. Export AsyncStorage
        const allKeys = await AsyncStorage.getAllKeys();
        // Don't backup vault media binary references
        const keysToBackup = allKeys.filter(k => k !== '@vault_media');
        
        const kvPairs = await AsyncStorage.multiGet(keysToBackup);
        const storageData = {};
        kvPairs.forEach(([key, value]) => {
            storageData[key] = value;
        });
        
        zip.file('storage_backup.json', JSON.stringify(storageData));

        // 2. Export Novel Texts recursively from 'novels/'
        const novelsDir = FileSystem.documentDirectory + 'novels/';
        const dirInfo = await FileSystem.getInfoAsync(novelsDir);
        
        if (dirInfo.exists) {
            const novelFolders = await FileSystem.readDirectoryAsync(novelsDir);
            let totalFolders = novelFolders.length;
            let processedFolders = 0;

            for (const novelId of novelFolders) {
                const folderPath = `${novelsDir}${novelId}/`;
                const folderInfo = await FileSystem.getInfoAsync(folderPath);
                
                if (folderInfo.exists && folderInfo.isDirectory) {
                    const chapterFiles = await FileSystem.readDirectoryAsync(folderPath);
                    const novelZipFolder = zip.folder(`novels/${novelId}`);
                    
                    for (const chapterFile of chapterFiles) {
                        if (chapterFile.endsWith('.json') || chapterFile.endsWith('.jpg') || chapterFile.endsWith('.png')) {
                            const filePath = `${folderPath}${chapterFile}`;
                            const fileContent = await FileSystem.readAsStringAsync(filePath, {
                                encoding: FileSystem.EncodingType.Base64
                            });
                            novelZipFolder.file(chapterFile, fileContent, { base64: true });
                        }
                    }
                }

                processedFolders++;
                if (onProgress) {
                    const pct = 0.1 + (processedFolders / (totalFolders || 1)) * 0.6;
                    onProgress(`正在封裝書籍: ${processedFolders}/${totalFolders}...`, pct);
                }
                // Micro-yield to prevent UI lockup
                await new Promise(r => setTimeout(r, 0));
            }
        }

        // 3. Zip it all
        if (onProgress) onProgress('正在壓縮備份封裝...', 0.75);
        const zipContent = await zip.generateAsync({
            type: 'base64',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
        
        zipPath = FileSystem.cacheDirectory + `NovelReader_Backup_${Date.now()}.zip`;
        await FileSystem.writeAsStringAsync(zipPath, zipContent, { encoding: FileSystem.EncodingType.Base64 });

        if (onProgress) onProgress('完成！正在開啟分享...', 1.0);

        // 4. Share it
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(zipPath, {
                mimeType: 'application/zip',
                dialogTitle: '儲存備份檔案'
            });
        } else {
            Alert.alert('錯誤', '您的裝置不支援分享功能，無法匯出備份。');
        }

        return true;
    } catch (error) {
        Alert.alert('備份失敗', error.message || '未知錯誤');
        return false;
    } finally {
        // Clean up temporary cache file
        if (zipPath) {
            try {
                await FileSystem.deleteAsync(zipPath, { idempotent: true });
            } catch (e) {}
        }
    }
};

export const restoreBackup = async (onProgress) => {
    try {
        const result = await DocumentPicker.getDocumentAsync({
            type: 'application/zip',
            copyToCacheDirectory: true
        });

        if (result.canceled || !result.assets || result.assets.length === 0) return false;

        const zipFileUri = result.assets[0].uri;
        if (onProgress) onProgress('正在解壓縮備份封裝...', 0.1);

        // 1. Unzip
        const zipContent = await FileSystem.readAsStringAsync(zipFileUri, { encoding: FileSystem.EncodingType.Base64 });
        const zip = await JSZip.loadAsync(zipContent, { base64: true });

        // 2. Restore AsyncStorage
        if (onProgress) onProgress('正在還原書架與設定...', 0.3);
        const storageFile = zip.file('storage_backup.json');
        
        if (storageFile) {
            const storageRaw = await storageFile.async('string');
            const storageData = JSON.parse(storageRaw);
            const pairs = Object.keys(storageData).map(k => [k, storageData[k]]);
            
            // Chunk multiSet to prevent SQLite bridge overflow
            const CHUNK_SIZE = 100;
            for (let i = 0; i < pairs.length; i += CHUNK_SIZE) {
                await AsyncStorage.multiSet(pairs.slice(i, i + CHUNK_SIZE));
            }
        } else {
            throw new Error('無效的備份檔：找不到設定資料。');
        }

        // 3. Restore Novels to 'novels/{novelId}/...'
        const allFilePaths = Object.keys(zip.files).filter(k => k.startsWith('novels/') && !zip.files[k].dir);
        const totalFiles = allFilePaths.length;
        let restoredCount = 0;

        const novelsBaseDir = FileSystem.documentDirectory + 'novels/';
        const baseDirInfo = await FileSystem.getInfoAsync(novelsBaseDir);
        if (!baseDirInfo.exists) {
            await FileSystem.makeDirectoryAsync(novelsBaseDir, { intermediates: true });
        }

        for (const relativePath of allFilePaths) {
            const fileContent = await zip.files[relativePath].async('base64');
            const targetPath = FileSystem.documentDirectory + relativePath;
            
            // Ensure parent subfolder exists
            const lastSlash = targetPath.lastIndexOf('/');
            if (lastSlash !== -1) {
                const parentDir = targetPath.substring(0, lastSlash + 1);
                const pInfo = await FileSystem.getInfoAsync(parentDir);
                if (!pInfo.exists) {
                    await FileSystem.makeDirectoryAsync(parentDir, { intermediates: true });
                }
            }

            await FileSystem.writeAsStringAsync(targetPath, fileContent, {
                encoding: FileSystem.EncodingType.Base64
            });

            restoredCount++;
            if (restoredCount % 20 === 0 && onProgress) {
                const pct = 0.4 + (restoredCount / (totalFiles || 1)) * 0.55;
                onProgress(`正在還原章節 (${restoredCount}/${totalFiles})...`, pct);
                await new Promise(r => setTimeout(r, 0));
            }
        }

        if (onProgress) onProgress('還原完成！', 1.0);
        Alert.alert('還原成功', '您的書架、章節與設定已成功還原！\n請重新啟動或刷新書櫃以套用變更。');
        return true;

    } catch (error) {
        Alert.alert('還原失敗', error.message || '未知錯誤');
        return false;
    }
};

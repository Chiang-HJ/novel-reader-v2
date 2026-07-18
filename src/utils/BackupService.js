import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import JSZip from 'jszip';
import { Alert } from 'react-native';

export const createBackup = async () => {
    try {
        const zip = new JSZip();

        // 1. Export AsyncStorage
        const allKeys = await AsyncStorage.getAllKeys();
        // Don't backup vault media since they are heavy binary references that won't exist on the new phone
        const keysToBackup = allKeys.filter(k => k !== '@vault_media');
        
        const kvPairs = await AsyncStorage.multiGet(keysToBackup);
        const storageData = {};
        kvPairs.forEach(([key, value]) => {
            storageData[key] = value;
        });
        
        zip.file('storage_backup.json', JSON.stringify(storageData));

        // 2. Export Novel Texts
        const booksDir = FileSystem.documentDirectory + 'books/';
        const dirInfo = await FileSystem.getInfoAsync(booksDir);
        let novelFiles = [];
        if (dirInfo.exists) {
            const files = await FileSystem.readDirectoryAsync(booksDir);
            novelFiles = files.filter(f => f.startsWith('novel_') && f.endsWith('.json'));
        }
        
        const novelsFolder = zip.folder('novels');
        
        for (const file of novelFiles) {
            const fileContent = await FileSystem.readAsStringAsync(
                booksDir + file,
                { encoding: FileSystem.EncodingType.Base64 }
            );
            novelsFolder.file(file, fileContent, { base64: true });
        }

        // 3. Zip it all
        const zipContent = await zip.generateAsync({ type: 'base64' });
        const zipPath = FileSystem.cacheDirectory + `NovelReader_Backup_${Date.now()}.zip`;
        await FileSystem.writeAsStringAsync(zipPath, zipContent, { encoding: FileSystem.EncodingType.Base64 });

        // 4. Share it
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(zipPath, {
                mimeType: 'application/zip',
                dialogTitle: '儲存備份檔案'
            });
        } else {
            Alert.alert('錯誤', '您的裝置不支援分享功能，無法匯出備份。');
        }

    } catch (error) {
        Alert.alert('備份失敗', error.message);
    }
};

export const restoreBackup = async () => {
    try {
        const result = await DocumentPicker.getDocumentAsync({
            type: 'application/zip',
            copyToCacheDirectory: true
        });

        if (result.canceled || !result.assets || result.assets.length === 0) return false;

        const zipFileUri = result.assets[0].uri;
        
        // 1. Unzip
        const zipContent = await FileSystem.readAsStringAsync(zipFileUri, { encoding: FileSystem.EncodingType.Base64 });
        const zip = await JSZip.loadAsync(zipContent, { base64: true });

        // 2. Restore AsyncStorage
        const storageFile = zip.file('storage_backup.json');
        
        if (storageFile) {
            const storageRaw = await storageFile.async('string');
            const storageData = JSON.parse(storageRaw);
            const pairs = Object.keys(storageData).map(k => [k, storageData[k]]);
            await AsyncStorage.multiSet(pairs);
        } else {
            throw new Error('無效的備份檔：找不到設定資料。');
        }

        // 3. Restore Novels
        const booksDir = FileSystem.documentDirectory + 'books/';
        const booksDirInfo = await FileSystem.getInfoAsync(booksDir);
        if (!booksDirInfo.exists) {
            await FileSystem.makeDirectoryAsync(booksDir, { intermediates: true });
        }
        for (const relativePath of Object.keys(zip.files)) {
            if (relativePath.startsWith('novels/') && !zip.files[relativePath].dir) {
                const fileContent = await zip.files[relativePath].async('base64');
                const fileName = relativePath.replace('novels/', '');
                await FileSystem.writeAsStringAsync(
                    booksDir + fileName,
                    fileContent,
                    { encoding: FileSystem.EncodingType.Base64 }
                );
            }
        }

        Alert.alert('還原成功', '您的書架與設定已成功還原！\n請重新啟動 App 以套用所有變更。');
        return true;

    } catch (error) {
        Alert.alert('還原失敗', error.message);
        return false;
    }
};

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { zip, unzip } from 'react-native-zip-archive';
import { Alert } from 'react-native';

export const createBackup = async () => {
    try {
        const backupDir = FileSystem.cacheDirectory + 'backup_temp/';
        const backupInfoDir = await FileSystem.getInfoAsync(backupDir);
        if (backupInfoDir.exists) {
            await FileSystem.deleteAsync(backupDir);
        }
        await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });

        // 1. Export AsyncStorage
        const allKeys = await AsyncStorage.getAllKeys();
        // Don't backup vault media since they are heavy binary references that won't exist on the new phone
        const keysToBackup = allKeys.filter(k => k !== '@vault_media');
        
        const kvPairs = await AsyncStorage.multiGet(keysToBackup);
        const storageData = {};
        kvPairs.forEach(([key, value]) => {
            storageData[key] = value;
        });
        
        await FileSystem.writeAsStringAsync(
            backupDir + 'storage_backup.json',
            JSON.stringify(storageData)
        );

        // 2. Export Novel Texts
        const files = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
        const novelFiles = files.filter(f => f.startsWith('novel_') && f.endsWith('.json'));
        
        const novelsDir = backupDir + 'novels/';
        await FileSystem.makeDirectoryAsync(novelsDir, { intermediates: true });
        
        for (const file of novelFiles) {
            await FileSystem.copyAsync({
                from: FileSystem.documentDirectory + file,
                to: novelsDir + file
            });
        }

        // 3. Zip it all
        const zipPath = FileSystem.cacheDirectory + `NovelReader_Backup_${Date.now()}.zip`;
        await zip(backupDir, zipPath);

        // 4. Share it
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(zipPath, {
                mimeType: 'application/zip',
                dialogTitle: '儲存備份檔案'
            });
        } else {
            Alert.alert('錯誤', '您的裝置不支援分享功能，無法匯出備份。');
        }

        // Cleanup
        await FileSystem.deleteAsync(backupDir, { idempotent: true });

    } catch (error) {
        console.error('Backup Error:', error);
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
        const extractDir = FileSystem.cacheDirectory + 'restore_temp/';
        
        const extractInfo = await FileSystem.getInfoAsync(extractDir);
        if (extractInfo.exists) {
            await FileSystem.deleteAsync(extractDir);
        }
        await FileSystem.makeDirectoryAsync(extractDir, { intermediates: true });

        // 1. Unzip
        await unzip(zipFileUri, extractDir);

        // 2. Restore AsyncStorage
        const storageFile = extractDir + 'storage_backup.json';
        const storageInfo = await FileSystem.getInfoAsync(storageFile);
        
        if (storageInfo.exists) {
            const storageRaw = await FileSystem.readAsStringAsync(storageFile);
            const storageData = JSON.parse(storageRaw);
            const pairs = Object.keys(storageData).map(k => [k, storageData[k]]);
            await AsyncStorage.multiSet(pairs);
        } else {
            throw new Error('無效的備份檔：找不到設定資料。');
        }

        // 3. Restore Novels
        const novelsDir = extractDir + 'novels/';
        const novelsDirInfo = await FileSystem.getInfoAsync(novelsDir);
        if (novelsDirInfo.exists) {
            const novelFiles = await FileSystem.readDirectoryAsync(novelsDir);
            for (const file of novelFiles) {
                await FileSystem.copyAsync({
                    from: novelsDir + file,
                    to: FileSystem.documentDirectory + file
                });
            }
        }

        // Cleanup
        await FileSystem.deleteAsync(extractDir, { idempotent: true });
        
        Alert.alert('還原成功', '您的書架與設定已成功還原！\n請重新啟動 App 以套用所有變更。');
        return true;

    } catch (error) {
        console.error('Restore Error:', error);
        Alert.alert('還原失敗', error.message);
        return false;
    }
};

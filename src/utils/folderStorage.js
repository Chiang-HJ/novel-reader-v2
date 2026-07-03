import AsyncStorage from '@react-native-async-storage/async-storage';

const FOLDERS_KEY = '@folders_list';

export const getFolders = async () => {
    try {
        const listStr = await AsyncStorage.getItem(FOLDERS_KEY);
        return listStr ? JSON.parse(listStr) : [];
    } catch (e) {
        return [];
    }
};

export const createFolder = async (name) => {
    const list = await getFolders();
    const newFolder = {
        id: 'folder_' + Date.now().toString(),
        name,
        createdAt: Date.now()
    };
    list.push(newFolder);
    await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(list));
    return newFolder;
};

export const deleteFolder = async (id) => {
    const list = await getFolders();
    const newList = list.filter(f => f.id !== id);
    await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(newList));
};

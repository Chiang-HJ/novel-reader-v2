import AsyncStorage from '@react-native-async-storage/async-storage';

const TEXT_FILTER_DICT_KEY = '@text_filter_dict';
const PRONUNCIATION_DICT_KEY = '@pronunciation_dict';

// Default filters
const DEFAULT_TEXT_FILTERS = [
    { id: 'tf_1', target: '請記住我們的網址', replacement: '' },
    { id: 'tf_2', target: '未完待續', replacement: '' },
    { id: 'tf_3', target: '求推薦票', replacement: '' },
    { id: 'tf_4', target: '求月票', replacement: '' }
];

const DEFAULT_PRONUNCIATION_DICT = [
    { id: 'pd_1', target: '主角', replacement: '主決' },
    { id: 'pd_2', target: '角色', replacement: '決色' },
    { id: 'pd_3', target: '轉圜', replacement: '轉環' },
    { id: 'pd_4', target: '說客', replacement: '稅客' },
    { id: 'pd_5', target: '銀行', replacement: '銀航' },
    { id: 'pd_6', target: '屬下', replacement: '署下' }
];

export const getDictionaries = async () => {
    try {
        const tfStr = await AsyncStorage.getItem(TEXT_FILTER_DICT_KEY);
        const pdStr = await AsyncStorage.getItem(PRONUNCIATION_DICT_KEY);
        
        return {
            textFilters: tfStr ? JSON.parse(tfStr) : DEFAULT_TEXT_FILTERS,
            pronunciationDict: pdStr ? JSON.parse(pdStr) : DEFAULT_PRONUNCIATION_DICT
        };
    } catch (e) {

        return { textFilters: DEFAULT_TEXT_FILTERS, pronunciationDict: DEFAULT_PRONUNCIATION_DICT };
    }
};

export const saveTextFilters = async (filters) => {
    try {
        await AsyncStorage.setItem(TEXT_FILTER_DICT_KEY, JSON.stringify(filters));
    } catch (e) {

    }
};

export const savePronunciationDict = async (dict) => {
    try {
        await AsyncStorage.setItem(PRONUNCIATION_DICT_KEY, JSON.stringify(dict));
    } catch (e) {

    }
};

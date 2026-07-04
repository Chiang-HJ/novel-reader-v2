import { tify } from 'chinese-conv';

export const convertS2T = (text) => {
    if (!text) return text;
    try {
        return tify(text);
    } catch (e) {
        console.error('Chinese Conv Error:', e);
        return text; // 發生錯誤時返回原文
    }
};

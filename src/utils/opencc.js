import { s2t } from 'chinese-s2t';

export const convertS2T = (text) => {
    if (!text) return text;
    try {
        return s2t(text);
    } catch (e) {
        console.error('Chinese Conv Error:', e);
        return text;
    }
};

import md5 from 'md5';

export const getScramblePieces = (photo_id, filename) => {
    // 18comic defaults scramble_id to 220980.
    const scramble_id = 220980;
    
    if (photo_id < scramble_id) {
        return 0; // Not scrambled
    }
    if (photo_id < 268850) {
        return 10;
    }
    
    const x = (photo_id < 421926) ? 10 : 8;
    const filenameNoExt = filename.split('.')[0];
    const s = `${photo_id}${filenameNoExt}`;
    const hash = md5(s);
    const lastChar = hash.charAt(hash.length - 1);
    let num = lastChar.charCodeAt(0);
    num %= x;
    num = num * 2 + 2;
    return num;
};

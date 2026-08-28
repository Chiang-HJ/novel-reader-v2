import { convertS2T } from '../opencc';

export const domain = 'boylove.cc';
export const name = '香香腐宅';

export const search = async (keyword, page = 1) => {
    try {
        const response = await fetch(`https://boylove.cc/home/api/searchk.html`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)'
            },
            body: `keyword=${encodeURIComponent(keyword)}&type=1&pageNo=${page}`
        });
        
        const data = await response.json();
        if (data.succ && data.result && data.result.list) {
            return {
                list: data.result.list.map(item => ({
                    id: item.id.toString(),
                    title: convertS2T(item.title),
                    author: convertS2T(item.auther),
                    cover: 'https://img.boylove.cc' + item.image, // from the json it's relative
                    url: `https://boylove.cc/home/book/index/id/${item.id}`,
                    lastChapter: convertS2T(item.last_chapter_title),
                    status: item.mhstatus === 1 ? '完結' : '連載'
                })),
                lastPage: data.result.lastPage
            };
        }
        return { list: [], lastPage: true };
    } catch (e) {
        console.error('boylove search error:', e);
        throw new Error('搜尋香香腐宅失敗');
    }
};

export const getCategories = async ({
    cate = 0,
    tag = '0',
    done = 2,
    order = 1,
    page = 1,
    type = 0,
    vip = 2
} = {}) => {
    try {
        const tagParam = tag === '0' ? '0' : encodeURIComponent(tag);
        const tp = `${cate}-${tagParam}-${done}-${order}-${page}-${type}-1-${vip}?mt=0`;
        const url = `https://boylove.cc/home/api/cate/tp/${tp}`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)'
            }
        });
        
        const data = await response.json();
        if (data.succ && data.result && data.result.list) {
            return {
                list: data.result.list.map(item => ({
                    id: item.id.toString(),
                    title: convertS2T(item.title),
                    author: convertS2T(item.auther),
                    cover: 'https://img.boylove.cc' + item.image,
                    url: `https://boylove.cc/home/book/index/id/${item.id}`,
                    lastChapter: convertS2T(item.last_chapter_title),
                    status: item.mhstatus === 1 ? '完結' : '連載'
                })),
                lastPage: data.result.lastPage
            };
        }
        return { list: [], lastPage: true };
    } catch (e) {
        console.error('boylove getCategories error:', e);
        throw new Error('獲取分類資料失敗');
    }
};

export const parseInfo = (html, url) => {
    try {
        // Extract title
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        let title = titleMatch ? titleMatch[1].replace('- 香香腐宅BoyLove', '').trim() : '';

        // Extract author
        const authorMatch = html.match(/<i>作者：<\/i>\s*<a[^>]*>([^<]+)<\/a>/) || html.match(/<p class="data">作者：(.*?)<\/p>/s) || html.match(/class="pic-text text-left">([^<]+)<\/span>/);
        let author = authorMatch ? authorMatch[1].trim() : '';
        if (author) {
            author = author.replace(/<[^>]+>/g, '').trim();
        }

        // Extract cover
        const coverMatch = html.match(/<a class="stui-vodlist__thumb picture v-thumb" href="[^"]+" title="[^"]+" data-original="([^"]+)"/);
        let cover = coverMatch ? coverMatch[1] : '';
        if (cover && !cover.startsWith('http')) {
            cover = 'https://img.boylove.cc' + cover;
        }

        // Extract description
        const descMatch = html.match(/<span class="detail-content" style="display: none;">(.*?)<\/span>/s);
        let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        // Extract chapters
        let chapters = [];
        const chapterListMatch = html.match(/JSON\.parse\("(\{\\"list\\":\[.*?\]\})"/);
        if (chapterListMatch) {
            try {
                const parsedStr = chapterListMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                const chapterData = JSON.parse(parsedStr);
                if (chapterData && chapterData.list) {
                    chapters = chapterData.list.map(ch => ({
                        id: ch.id.toString(),
                        title: convertS2T(ch.title),
                        url: `https://boylove.cc/home/book/capter/id/${ch.id}`
                    }));
                }
            } catch (e) {
                console.error("boylove parse JSON error:", e);
            }
        }

        return {
            title: convertS2T(title),
            author: convertS2T(author),
            cover,
            description: convertS2T(description),
            chapters
        };
    } catch (e) {
        console.error('boylove parseInfo error:', e);
        throw new Error('解析香香腐宅失敗');
    }
};

export const fetchChapterImages = async (url) => {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)'
            }
        });
        const html = await response.text();
        
        if (html.includes('只限"VIP会员"观看')) {
            throw new Error('此為 VIP 專屬章節，無法下載。請使用瀏覽器登入觀看。');
        }

        // boylove uses lazyload images, usually in img tags with class 'lazy' and data-original
        const images = [];
        const regex = /<img.*?data-original="([^"]+)".*?>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            let imgUrl = match[1].trim();
            if (imgUrl.startsWith('//')) {
                imgUrl = 'https:' + imgUrl;
            } else if (imgUrl.startsWith('/')) {
                imgUrl = 'https://boylove.cc' + imgUrl;
            } else if (!imgUrl.startsWith('http')) {
                imgUrl = 'https://img.boylove.cc' + imgUrl;
            }
            images.push(imgUrl);
        }
        
        // Detect if the chapter is scrambled:
        // do_mergeImg() function is defined on ALL chapters (boilerplate),
        // but only CALLED on scrambled chapters.
        const callMatch = html.match(/do_mergeImg\s*\([^)]/g);
        const definitionCount = (html.match(/function\s+do_mergeImg/g) || []).length;
        const callCount = callMatch ? callMatch.length : 0;
        const isScrambled = callCount > definitionCount;
        
        // Sometimes it's encoded or in a JS variable.
        if (images.length === 0) {
            // Attempt to find any image URLs in the page that look like comic pages
            const imgRegex = /https:\/\/img\.boylove\.cc\/[a-zA-Z0-9_/\.\-]+\.(jpg|jpeg|png|webp)/g;
            let imgMatch;
            while ((imgMatch = imgRegex.exec(html)) !== null) {
                if (imgMatch[0].includes('/bookimages/')) {
                    images.push(imgMatch[0]);
                }
            }
        }
        
        // Always return an object so ComicDownloadContext can read isScrambled correctly.
        return { images: [...new Set(images)], isScrambled };
    } catch (error) {
        console.error('boylove fetchChapterImages error:', error);
        if (error.message.includes('VIP 專屬')) {
            throw error;
        }
        throw new Error('無法取得圖片列表，可能需要登入或該章節受保護');
    }
};

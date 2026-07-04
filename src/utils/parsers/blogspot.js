export const domain = 'blogspot.';

export const parseInfo = (html, url) => {
    let title = 'Blogspot Novel';
    const titleMatch = html.match(/<h3[^>]*class=["']?[^"']*post-title[^"']*["']?[^>]*>([\s\S]*?)<\/h3>/i);
    if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }
    
    return {
        title: title,
        author: 'Blogspot 作者',
        coverUrl: '',
        description: '這是一篇來自 Blogspot 的單頁文章/小說。',
        chapters: [{ title: '完整內容', url: url }]
    };
};

export const parseChapter = (html, url) => {
    const bodyMatch = html.match(/<div[^>]*class=["']?[^"']*post-body[^"']*["']?[^>]*>([\s\S]*?)<div[^>]*class=["']post-footer/i);
    let rawText = '';
    
    if (bodyMatch && bodyMatch[1]) {
        rawText = bodyMatch[1];
    } else {
        const fallbackMatch = html.match(/<div[^>]*class=["']?[^"']*post-body[^"']*["']?[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
        if (fallbackMatch && fallbackMatch[1]) {
            rawText = fallbackMatch[1];
        } else {
            // Ultimate fallback
            const lastMatch = html.match(/<div[^>]*class=["']?[^"']*post-body[^"']*["']?[^>]*>([\s\S]*?)<\/div>/i);
            if (lastMatch && lastMatch[1]) rawText = lastMatch[1];
        }
    }
    
    if (!rawText) return '無內容或抓取失敗';
    
    // Strip hidden anti-theft text (color: white or transparent)
    let text = rawText.replace(/<span[^>]*style=["'][^"']*(?:^|[^-])color:\s*(?:white|transparent|#fff|#ffffff)[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, '');
    text = text.replace(/<font[^>]*color=["']?(?:white|transparent|#fff|#ffffff)["']?[^>]*>([\s\S]*?)<\/font>/gi, '');
    
    // Replace <br> and <p> with newlines
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/(p|div)>/gi, '\n\n');
    text = text.replace(/<(p|div)[^>]*>/gi, '');
    
    // Strip other HTML tags
    text = text.replace(/<[^>]+>/g, '');
    
    // Clean up excessive newlines
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    
    // Decode HTML entities
    text = text.replace(/&nbsp;/gi, ' ')
               .replace(/&lt;/gi, '<')
               .replace(/&gt;/gi, '>')
               .replace(/&amp;/gi, '&')
               .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
               .replace(/&#x([a-fA-F0-9]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
               
    return text || '無內容或抓取失敗';
};

export const search = async (keyword) => {
    return [];
};

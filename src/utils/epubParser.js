import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export async function parseEpub(uri, onProgress) {
    if (!uri) {
        throw new Error("無效的 EPUB 檔案路徑");
    }

    if (onProgress) onProgress(0, 1, '正在讀取 EPUB 檔案...');

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    
    if (onProgress) onProgress(0, 1, '正在解壓縮 EPUB 結構...');
    // Load zip
    const zip = await JSZip.loadAsync(base64, { base64: true });
    
    // Find container.xml to locate OPF
    if (!zip.file("META-INF/container.xml")) {
        throw new Error("無效的 EPUB 檔案：找不到 META-INF/container.xml");
    }
    
    const containerXml = await zip.file("META-INF/container.xml").async("string");
    const containerObj = xmlParser.parse(containerXml);
    
    const rootfiles = containerObj?.container?.rootfiles?.rootfile;
    const opfPath = Array.isArray(rootfiles) 
        ? rootfiles.find(r => r && r["@_media-type"] === "application/oebps-package+xml")?.["@_full-path"]
        : rootfiles?.["@_full-path"];
        
    if (!opfPath) {
        throw new Error("無效的 EPUB 檔案：無法在 container.xml 找到 OPF 路徑");
    }
    
    const basePath = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
    
    // Parse OPF
    const opfFile = zip.file(opfPath);
    if (!opfFile) {
        throw new Error(`無效的 EPUB 檔案：找不到 ${opfPath}`);
    }
    const opfXml = await opfFile.async("string");
    const opfObj = xmlParser.parse(opfXml);
    
    const metadata = opfObj?.package?.metadata;
    const title = metadata?.["dc:title"] || "未命名書籍";
    const author = metadata?.["dc:creator"] || "未知作者";
    
    const authorStr = Array.isArray(author) 
        ? author.map(a => (typeof a === 'object' && a !== null ? (a['#text'] || '') : String(a || ''))).filter(Boolean).join(', ') || "未知作者"
        : (typeof author === 'object' && author !== null ? (author?.['#text'] || "未知作者") : String(author || "未知作者"));
        
    const titleStr = typeof title === 'object' && title !== null ? (title['#text'] || "未命名書籍") : String(title || "未命名書籍");
    
    const manifestRaw = opfObj?.package?.manifest?.item;
    const manifestItems = Array.isArray(manifestRaw) ? manifestRaw : (manifestRaw ? [manifestRaw] : []);
    
    // Build O(1) Manifest Map for fast lookup
    const manifestMap = new Map();
    for (const m of manifestItems) {
        if (m && m["@_id"]) {
            manifestMap.set(m["@_id"], m);
        }
    }
        
    const spineRaw = opfObj?.package?.spine?.itemref;
    const spineItemrefs = Array.isArray(spineRaw) ? spineRaw : (spineRaw ? [spineRaw] : []);
    const totalSpine = spineItemrefs.length;
        
    // Build chapters from spine
    const chapters = [];
    
    for (let i = 0; i < totalSpine; i++) {
        const itemref = spineItemrefs[i];
        if (!itemref) continue;
        const idref = itemref["@_idref"];
        const item = manifestMap.get(idref);
        if (!item) continue;
        
        const href = item["@_href"];
        if (!href) continue;
        const filePath = basePath + href;
        
        const file = zip.file(filePath);
        if (!file) continue;
        
        const htmlContent = await file.async("string");
        
        // Extract title from HTML if possible, otherwise generic
        let chapTitle = `第 ${i + 1} 章`;
        const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1] && titleMatch[1].trim()) {
            chapTitle = titleMatch[1].trim();
        } else {
            const h1Match = htmlContent.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i);
            if (h1Match && h1Match[1] && h1Match[1].trim()) {
                chapTitle = h1Match[1].trim();
            }
        }
        
        // Strip HTML tags and normalize whitespace
        let text = htmlContent
            .replace(/<(br|p|\/p|div|\/div|li|\/li|h[1-6]|\/h[1-6])[^>]*>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x([0-9a-fA-F]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/&#(\d+);/g, (m, code) => String.fromCharCode(code))
            .replace(/\n\s*\n/g, '\n\n')
            .trim();
            
        if (text.length > 0) {
            chapters.push({
                title: chapTitle,
                text: text
            });
        }

        if (onProgress && (i % 25 === 0 || i === totalSpine - 1)) {
            onProgress(i + 1, totalSpine, `正在解析章節 (${i + 1}/${totalSpine})...`);
            // Yield to event loop
            await new Promise(r => setTimeout(r, 0));
        }
    }
    
    return {
        title: titleStr,
        author: authorStr,
        chapters
    };
}


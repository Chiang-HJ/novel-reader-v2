import * as FileSystem from 'expo-file-system/legacy';
export async function parseEpub(uri) {
    try {
        const JSZip = require('jszip');
        const { XMLParser } = require('fast-xml-parser');
        
        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        
        // Load zip
        const zip = await JSZip.loadAsync(base64, { base64: true });
        
        // Find container.xml to locate OPF
        if (!zip.file("META-INF/container.xml")) {
            throw new Error("Invalid EPUB: missing container.xml");
        }
        
        const containerXml = await zip.file("META-INF/container.xml").async("string");
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
        const containerObj = parser.parse(containerXml);
        
        const rootfiles = containerObj?.container?.rootfiles?.rootfile;
        const opfPath = Array.isArray(rootfiles) 
            ? rootfiles.find(r => r["@_media-type"] === "application/oebps-package+xml")?.["@_full-path"]
            : rootfiles?.["@_full-path"];
            
        if (!opfPath) {
            throw new Error("Invalid EPUB: cannot find OPF path in container.xml");
        }
        
        const basePath = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
        
        // Parse OPF
        const opfXml = await zip.file(opfPath).async("string");
        const opfObj = parser.parse(opfXml);
        
        const metadata = opfObj?.package?.metadata;
        const title = metadata?.["dc:title"] || "Unknown Title";
        const author = metadata?.["dc:creator"] || "Unknown Author";
        
        // If author is an array, take the first or join
        const authorStr = Array.isArray(author) ? author.map(a => a['#text'] || a).join(', ') : (author?.['#text'] || author || "Unknown Author");
        const titleStr = typeof title === 'object' ? (title['#text'] || "Unknown Title") : title;
        
        const manifestItems = Array.isArray(opfObj?.package?.manifest?.item) 
            ? opfObj.package.manifest.item 
            : [opfObj?.package?.manifest?.item];
            
        const spineItemrefs = Array.isArray(opfObj?.package?.spine?.itemref)
            ? opfObj.package.spine.itemref
            : [opfObj?.package?.spine?.itemref];
            
        // Build chapters from spine
        const chapters = [];
        
        for (let i = 0; i < spineItemrefs.length; i++) {
            const itemref = spineItemrefs[i];
            if (!itemref) continue;
            const idref = itemref["@_idref"];
            const item = manifestItems.find(m => m["@_id"] === idref);
            if (!item) continue;
            
            const href = item["@_href"];
            const filePath = basePath + href;
            
            const file = zip.file(filePath);
            if (!file) continue;
            
            const htmlContent = await file.async("string");
            
            // Extract title from HTML if possible, otherwise generic
            let chapTitle = `章節 ${i + 1}`;
            const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch && titleMatch[1].trim()) {
                chapTitle = titleMatch[1].trim();
            } else {
                const h1Match = htmlContent.match(/<h[1-2][^>]*>([^<]+)<\/h[1-2]>/i);
                if (h1Match && h1Match[1].trim()) {
                    chapTitle = h1Match[1].trim();
                }
            }
            
            // Strip HTML tags
            // Replace <br> and </p> with newlines, then strip tags
            let text = htmlContent
                .replace(/<(br|p|\/p|div|\/div|li|\/li|h[1-6]|\/h[1-6])[^>]*>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/\n\s*\n/g, '\n\n')
                .trim();
                
            if (text.length > 0) {
                chapters.push({
                    title: chapTitle,
                    text: text
                });
            }
        }
        
        return {
            title: titleStr,
            author: authorStr,
            chapters
        };
        
    } catch (error) {
        console.error("EPUB Parse Error:", error);
        throw error;
    }
}

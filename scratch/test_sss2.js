const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto('https://ssstwitter.com/', { waitUntil: 'networkidle2' });
    
    await page.type('#main_page_text', 'https://x.com/Pokemon/status/1762477218320146746');
    await page.click('#submit');
    
    await new Promise(r => setTimeout(r, 4000));
    
    const links = await page.evaluate(() => {
        const anchors = document.querySelectorAll('a.download_link');
        return Array.from(anchors).map(a => a.href);
    });
    
    console.log(links);
    
    await browser.close();
})();

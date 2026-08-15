const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto('https://twitsave.com/', { waitUntil: 'networkidle2' });
    
    await page.type('input[name="url"]', 'https://x.com/Pokemon/status/1762477218320146746');
    await page.click('button[type="submit"]');
    
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    const links = await page.evaluate(() => {
        const anchors = document.querySelectorAll('a[href*="/download?file="], a[href*=".mp4"]');
        return Array.from(anchors).map(a => a.href);
    });
    
    console.log(links);
    
    await browser.close();
})();

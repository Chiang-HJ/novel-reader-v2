const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto('https://ssstwitter.com/', { waitUntil: 'networkidle2' });
    
    // get input
    const inputId = await page.evaluate(() => {
        const input = document.querySelector('input[type="url"]');
        return input ? input.id : 'not found';
    });
    
    const btnId = await page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"]') || document.querySelector('button.btn-primary');
        return btn ? (btn.id || btn.className) : 'not found';
    });
    
    console.log(`Input: ${inputId}, Button: ${btnId}`);
    
    await page.type('input[type="url"]', 'https://x.com/Pokemon/status/1762477218320146746');
    await page.click('button[type="submit"]');
    
    await page.waitForTimeout(3000);
    
    const links = await page.evaluate(() => {
        const anchors = document.querySelectorAll('a[href*=".mp4"]');
        return Array.from(anchors).map(a => a.href);
    });
    
    console.log(links);
    
    await browser.close();
})();

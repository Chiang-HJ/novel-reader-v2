async function test() {
    const html = await fetch('https://wyblogs.eu.org/series/%E5%B0%8F%E8%AA%AA/').then(r => r.text());
    const regex = /<h[2-5][^>]*>\s*<a[^>]*href="([^"]*\/posts\/[^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let match;
    const urls = [];
    while ((match = regex.exec(html)) !== null) {
        urls.push({ url: match[1], title: match[2].trim() });
    }
    console.log('Sample URL from feed:', urls[0]);
    const target = urls.find(u => u.title.includes('軍人体育生'));
    console.log('Target URL from feed:', target);
}
test();

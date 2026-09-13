async function run() {
    const res = await fetch('https://www.xbanxia.cc/books/41698.html');
    const html = await res.text();
    const titleMatch = html.match(/<h1>(.*?)<\/h1>/);
    console.log('Title:', titleMatch[1]);
}
run();

const url = 'https://www.xbanxia.cc/';
fetch(url).then(r=>r.text()).then(t => {
    const links = t.match(/href="[^"]+"/g).filter(l => l.includes('book') || l.includes('read'));
    console.log(links.slice(0, 10));
});

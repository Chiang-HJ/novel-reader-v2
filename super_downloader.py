import asyncio
import os
import sys
import re
import time
import sqlite3
from curl_cffi.requests import AsyncSession
from curl_cffi import requests

NOVEL_URL = 'https://czbooks.net/n/s6lf47'
BASE_DIR = 'C:/Users/user/.gemini/antigravity/scratch/novel-reader-v2'
OUTPUT_TXT = os.path.join(BASE_DIR, '修真聊天群.txt')
DB_PATH = os.path.join(BASE_DIR, 's6lf47_cache.db')
STATUS_FILE = os.path.join(BASE_DIR, 'download_status.txt')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY,
            url TEXT UNIQUE,
            title TEXT,
            content TEXT,
            status INTEGER DEFAULT 0
        )
    ''')
    conn.commit()
    conn.close()

def get_or_init_chapters():
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM chapters')
    count = cur.fetchone()[0]
    
    if count == 0:
        print("首次執行，正在自小說狂人取得全部章節目錄...")
        r = requests.get(NOVEL_URL, impersonate='chrome124')
        s6_links = re.findall(r'<a[^>]+href=[\'"]([^"\'>]*\/n\/s6lf47\/[^"\'>]*)[\'"][^>]*>([^<]+)</a>', r.text)
        
        seen = set()
        ch_list = []
        for url, title in s6_links:
            clean_url = url.split('?')[0]
            if clean_url not in seen:
                seen.add(clean_url)
                full_url = clean_url if clean_url.startswith('http') else ('https:' + clean_url if clean_url.startswith('//') else 'https://czbooks.net' + clean_url)
                ch_list.append((full_url, title.strip()))
                
        print(f"解析到 {len(ch_list)} 個章節，存入本機資料庫...")
        for idx, (u, t) in enumerate(ch_list):
            cur.execute('INSERT OR IGNORE INTO chapters (id, url, title, status) VALUES (?, ?, ?, 0)', (idx, u, t))
        conn.commit()
    
    cur.execute('SELECT id, url, title, status FROM chapters ORDER BY id ASC')
    rows = cur.fetchall()
    conn.close()
    return rows

async def db_writer_task(db_queue):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    batch = []
    last_flush = time.time()
    
    while True:
        try:
            item = await asyncio.wait_for(db_queue.get(), timeout=1.0)
            if item is None:
                break
            batch.append(item)
            db_queue.task_done()
        except asyncio.TimeoutError:
            pass
            
        if batch and (len(batch) >= 20 or time.time() - last_flush > 1.5):
            cur.executemany('UPDATE chapters SET content = ?, status = ? WHERE id = ?', batch)
            conn.commit()
            batch.clear()
            last_flush = time.time()
            
    if batch:
        cur.executemany('UPDATE chapters SET content = ?, status = ? WHERE id = ?', batch)
        conn.commit()
    conn.close()

async def fetch_worker(queue, session, sem, progress, total, db_queue):
    while True:
        item = await queue.get()
        if item is None:
            break
        ch_id, url, title = item
        
        success = False
        content = ""
        
        for attempt in range(4):
            async with sem:
                try:
                    res = await session.get(url, timeout=10)
                    if res.status_code == 200:
                        m = re.search(r'<div[^>]+class=[\'"]content[\'"][^>]*>(.*?)</div>', res.text, re.DOTALL)
                        if m:
                            raw_c = m.group(1)
                            clean_c = re.sub(r'<br\s*/?>', '\n', raw_c)
                            clean_c = re.sub(r'<p[^>]*>', '\n', clean_c)
                            clean_c = re.sub(r'</p>', '', clean_c)
                            clean_c = re.sub(r'<[^>]+>', '', clean_c).strip()
                            
                            if len(clean_c) > 10 and 'Just a moment' not in clean_c:
                                content = clean_c
                                success = True
                                break
                    await asyncio.sleep(0.1 + attempt * 0.3)
                except Exception:
                    await asyncio.sleep(0.1 + attempt * 0.3)
                    
        if success:
            await db_queue.put((content, 1, ch_id))
        else:
            await db_queue.put(('【本章下載逾時】', 2, ch_id))
            
        progress['completed'] += 1
        queue.task_done()

def export_novel():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('SELECT title, content FROM chapters WHERE status = 1 ORDER BY id ASC')
    rows = cur.fetchall()
    conn.close()
    
    with open(OUTPUT_TXT, 'w', encoding='utf-8') as f:
        f.write("《修真聊天群》\n作者：聖騎士的傳說\n\n")
        for title, content in rows:
            f.write(f"\n\n=== {title} ===\n\n")
            f.write(content or '')
            f.write("\n")
            
    file_size_mb = os.path.getsize(OUTPUT_TXT) / (1024 * 1024)
    print(f"\n🎉 檔案已合併導出！大小: {file_size_mb:.2f} MB")
    print(f"路徑: {OUTPUT_TXT}")

async def main():
    rows = get_or_init_chapters()
    total = len(rows)
    pending = [r for r in rows if r[3] != 1]
    already_done = total - len(pending)
    
    print(f"總章節: {total} | 已完成: {already_done} | 剩餘待下載: {len(pending)}")
    
    if not pending:
        print("所有章節皆已下載完成！正在導出 TXT...")
        export_novel()
        return

    queue = asyncio.Queue()
    for p in pending:
        queue.put_nowait((p[0], p[1], p[2]))
        
    db_queue = asyncio.Queue()
    db_writer = asyncio.create_task(db_writer_task(db_queue))
    
    sem = asyncio.Semaphore(12)
    progress = {'completed': already_done}
    t0 = time.time()
    
    async with AsyncSession(impersonate='chrome124') as session:
        await session.get('https://czbooks.net/')
        
        workers = [
            asyncio.create_task(fetch_worker(queue, session, sem, progress, total, db_queue))
            for _ in range(12)
        ]
        
        while progress['completed'] < total:
            await asyncio.sleep(2)
            c = progress['completed']
            elapsed = time.time() - t0
            speed = (c - already_done) / (elapsed + 0.001)
            pct = (c / total) * 100
            rem_sec = (total - c) / (speed + 0.001) if speed > 0 else 0
            
            status_line = f"進度: {c}/{total} ({pct:.1f}%) | 速度: {speed:.1f} 章/秒 | 剩餘約 {rem_sec/60:.1f} 分鐘"
            print(status_line)
            with open(STATUS_FILE, 'w', encoding='utf-8') as sf:
                sf.write(status_line + '\n')
                
        await queue.join()
        for w in workers:
            w.cancel()
            
    await db_queue.put(None)
    await db_writer
    
    print("\n下載完成！正在生成小說檔案...")
    export_novel()

if __name__ == '__main__':
    asyncio.run(main())

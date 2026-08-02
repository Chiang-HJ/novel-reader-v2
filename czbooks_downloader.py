# -*- coding: utf-8 -*-
"""
小說狂人 (czbooks.net) 專屬極速多執行緒下載器 v2.5
特點：
- 支援任意 czbooks 小說網址 (例如 https://czbooks.net/n/s6lf47)
- 精準鎖定 #chapter-list 目錄：自動排除網頁推薦與最新章節雜訊，保證章節順序 100% 正確
- 自動章節去重（Deduplication）：自動分辨重複章節，只下載單一有效章節
- 修正 HTML 格式解析（支援空白屬性 class = "content" 與全形空白字元處理）
- 支援斷點續傳（SQLite 快取）：隨時關閉/重開自動接續
- 支援即時流暢進度條、即時下載速度 (章/秒)、預估剩餘時間 (ETA)、當前下載章節
- 下載完畢自動合併輸出為排版精美的 TXT 檔案
"""

import os
import sys
import io
import re
import time
import sqlite3
import asyncio
from datetime import timedelta

# Windows 終端機 UTF-8 輸出防亂碼與例外保護
if sys.platform == 'win32':
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except Exception:
        pass

try:
    from curl_cffi.requests import AsyncSession
    from curl_cffi import requests
except ImportError:
    print("\n【提示】檢測到尚未安裝 curl_cffi，正在自動安裝必要依賴模組...")
    os.system(f"{sys.executable} -m pip install curl_cffi")
    from curl_cffi.requests import AsyncSession
    from curl_cffi import requests


def sanitize_filename(name):
    """移除非法檔名字元"""
    return re.sub(r'[\\/*?:"<>|]', '', name).strip()


def init_db(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS info (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
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


def fetch_novel_info(novel_url, db_path):
    init_db(db_path)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    print(f"\n[*] 正在連接小說狂人伺服器解析目錄與去重: {novel_url} ...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    
    html = ""
    for attempt in range(4):
        try:
            r = requests.get(novel_url, headers=headers, impersonate='chrome124', timeout=15)
            if r.status_code == 200:
                html = r.text
                break
            elif r.status_code == 429:
                print(f"[*] 網站連線頻率限制 (429)，等待 {2 * (attempt + 1)} 秒後重試...")
                time.sleep(2 * (attempt + 1))
            else:
                time.sleep(1)
        except Exception as ex:
            time.sleep(2)
            
    if not html:
        raise Exception(f"無法載入小說目錄網頁，請稍候再試！")
    
    # 1. 解析書名與作者
    title_m = re.search(r'<span[^>]+class\s*=\s*[\'"]title[\'"][^>]*>([^<]+)</span>', html) or \
              re.search(r'<div[^>]+class\s*=\s*[\'"]novel-title[\'"][^>]*>([^<]+)</div>', html) or \
              re.search(r'<title>【免費小說】《([^》]+)》', html) or \
              re.search(r'<title>([^<|]+)', html)
              
    author_m = re.search(r'<span[^>]+class\s*=\s*[\'"]author[\'"][^>]*>([^<]+)</span>', html) or \
               re.search(r'作者[：:]\s*<a[^>]*>([^<]+)</a>', html) or \
               re.search(r'作者[：:]\s*([^\s<]+)', html)
               
    title = sanitize_filename(title_m.group(1).strip() if title_m else '未知書名')
    author = sanitize_filename(author_m.group(1).strip() if author_m else '未知作者')
    
    # 2. 精準提取 #chapter-list 目錄清單
    list_m = re.search(r'<ul[^>]*id\s*=\s*[\'"]chapter-list[\'"][^>]*>(.*?)</ul>', html, re.DOTALL)
    if not list_m:
        list_m = re.search(r'<ul[^>]*class\s*=\s*[\'"][^\'"]*chapter-list[^\'"]*[\'"][^>]*>(.*?)</ul>', html, re.DOTALL)
        
    raw_links = []
    if list_m:
        raw_links = re.findall(r'<a[^>]+href\s*=\s*[\'"]([^\'"]+)[\'"][^>]*>([^<]+)</a>', list_m.group(1))
    else:
        raw_links = re.findall(r'<a[^>]+href\s*=\s*[\'"]([^"\'>]*\/n\/[^\/]+\/[^"\'>]*)[\'"][^>]*>([^<]+)</a>', html)
        
    # 3. 智慧型自動去重與目錄迴圈截斷（Smart Deduplication & Loop Detection）
    seen_urls = set()
    seen_titles = set()
    ch_list = []
    first_chapter_title = None
    
    for url, ch_title in raw_links:
        clean_url = url.split('?')[0].strip()
        if clean_url.startswith('//'):
            clean_url = 'https:' + clean_url
        elif not clean_url.startswith('http'):
            clean_url = 'https://czbooks.net' + clean_url
            
        clean_title = ch_title.strip()
        if not clean_title or '/n/' not in clean_url:
            continue
            
        # 檢測網站是否整本小說重複上傳（第一章在數十章後再次出現）
        if not first_chapter_title:
            first_chapter_title = clean_title
        elif len(ch_list) > 30 and clean_title == first_chapter_title:
            print(f"[*] 💡 檢測到全書目錄從第一章重複（於第 {len(ch_list)} 章處），已自動精準截斷後半段重複部分！")
            break
            
        # 排除相同 URL 或相同標題的重複章節
        if clean_url in seen_urls or clean_title in seen_titles:
            continue
            
        seen_urls.add(clean_url)
        seen_titles.add(clean_title)
        ch_list.append((clean_url, clean_title))
            
    if not ch_list:
        raise Exception("未能在該網址找到任何章節列表，請確認網址是否為小說目錄主頁！")
        
    cur.execute('INSERT OR REPLACE INTO info (key, value) VALUES ("title", ?)', (title,))
    cur.execute('INSERT OR REPLACE INTO info (key, value) VALUES ("author", ?)', (author,))
    
    # 刪除超出實際章節範圍的舊重複資料庫項目
    cur.execute('DELETE FROM chapters WHERE id >= ?', (len(ch_list),))
    
    # 寫入或更新章節
    for idx, (u, t) in enumerate(ch_list):
        cur.execute('''
            INSERT INTO chapters (id, url, title, status)
            VALUES (?, ?, ?, 0)
            ON CONFLICT(id) DO UPDATE SET url = excluded.url, title = excluded.title
            WHERE chapters.status != 1
        ''', (idx, u, t))
        
    conn.commit()
    conn.close()
    return title, author


async def db_writer(db_path, db_queue):
    conn = sqlite3.connect(db_path)
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
            
        if batch and (len(batch) >= 15 or time.time() - last_flush > 1.2):
            cur.executemany('UPDATE chapters SET content = ?, status = ? WHERE id = ?', batch)
            conn.commit()
            batch.clear()
            last_flush = time.time()
            
    if batch:
        cur.executemany('UPDATE chapters SET content = ?, status = ? WHERE id = ?', batch)
        conn.commit()
    conn.close()


async def chapter_fetcher(queue, session, sem, progress, current_downloading, db_queue):
    while True:
        item = await queue.get()
        if item is None:
            break
        ch_id, url, title = item
        
        current_downloading['title'] = title
        success = False
        content = ""
        
        for attempt in range(5):
            async with sem:
                try:
                    res = await session.get(url, timeout=12)
                    if res.status_code == 200:
                        # 支援 class = "content"（含空格）的 regex
                        m = re.search(r'<div[^>]+class\s*=\s*[\'"]content[\'"][^>]*>(.*?)</div>', res.text, re.DOTALL)
                        if m:
                            raw_c = m.group(1)
                            clean_c = re.sub(r'<br\s*/?>', '\n', raw_c)
                            clean_c = re.sub(r'<p[^>]*>', '\n', clean_c)
                            clean_c = re.sub(r'</p>', '', clean_c)
                            clean_c = re.sub(r'<[^>]+>', '', clean_c)
                            # 取代全形空白 \u2003 為雙空格
                            clean_c = clean_c.replace('\u2003', '  ').strip()
                            
                            if len(clean_c) > 10 and 'Just a moment' not in clean_c:
                                content = clean_c
                                success = True
                                break
                    await asyncio.sleep(0.3 + attempt * 0.4)
                except Exception:
                    await asyncio.sleep(0.3 + attempt * 0.4)
                    
        if success:
            await db_queue.put((content, 1, ch_id))
            progress['success'] += 1
        else:
            await db_queue.put(('【本章下載逾時】', 2, ch_id))
            progress['fail'] += 1
            
        progress['completed'] += 1
        queue.task_done()


def render_progress_bar(completed, total, speed, elapsed, eta, current_title):
    pct = (completed / total) * 100 if total > 0 else 0
    bar_length = 20
    filled_length = int(bar_length * completed // total) if total > 0 else 0
    bar = '█' * filled_length + '░' * (bar_length - filled_length)
    
    elapsed_str = str(timedelta(seconds=int(elapsed)))
    eta_str = str(timedelta(seconds=int(eta))) if eta >= 0 else '--:--:--'
    
    # 控制總長度在 75 字元內，避免 Windows 終端機自動折行產生跳行
    display_title = (current_title[:12] + '..') if len(current_title) > 12 else current_title
    
    msg = f"\r[{bar}] {pct:4.1f}% ({completed}/{total}) | {speed:3.1f}章/s | 剩餘 {eta_str} | {display_title:<14}"
    sys.stdout.write(msg)
    sys.stdout.flush()


def export_txt(db_path, output_txt, title, author):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('SELECT title, content FROM chapters ORDER BY id ASC')
    rows = cur.fetchall()
    conn.close()
    
    print(f"\n\n[*] 正在合併匯出小說文字檔: {output_txt} ...")
    with open(output_txt, 'w', encoding='utf-8') as f:
        f.write(f"《{title}》\n作者：{author}\n\n")
        f.write(f"下載來源：小說狂人 czbooks.net\n")
        f.write(f"下載時間：{time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"總章節數：{len(rows)}\n\n")
        f.write("=" * 45 + "\n\n")
        
        for ch_title, ch_content in rows:
            f.write(f"\n\n=== {ch_title} ===\n\n")
            f.write(ch_content or '【無內文】')
            f.write("\n")
            
    file_size_mb = os.path.getsize(output_txt) / (1024 * 1024)
    print("=" * 65)
    print(f"🎉 下載並匯出成功！")
    print(f"📁 檔案名稱: {os.path.basename(output_txt)}")
    print(f"📂 儲存路徑: {output_txt}")
    print(f"📊 檔案大小: {file_size_mb:.2f} MB")
    print("=" * 65)


async def run_downloader(novel_url, max_concurrency=6):
    url_id = novel_url.strip('/').split('/')[-1]
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, "downloads")
    os.makedirs(output_dir, exist_ok=True)
    
    db_path = os.path.join(output_dir, f"cache_{url_id}.db")
    
    # 取得最新小說目錄與書名資訊
    title, author = fetch_novel_info(novel_url, db_path)
    output_txt = os.path.join(output_dir, f"{title}_{author}.txt")
    
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    # 檢查是否有之前標記為逾時的章節，重設為 0 以便重新嘗試
    cur.execute('UPDATE chapters SET status = 0 WHERE status = 2')
    conn.commit()
    
    cur.execute('SELECT id, url, title, status FROM chapters ORDER BY id ASC')
    all_chapters = cur.fetchall()
    conn.close()
    
    total = len(all_chapters)
    pending = [r for r in all_chapters if r[3] != 1]
    already_done = total - len(pending)
    
    print("\n" + "=" * 65)
    print(f" 📖 書名: 《{title}》")
    print(f" ✍️ 作者: {author}")
    print(f" 📑 總章節數: {total} 章 (已自動精準排除重複與無效章節)")
    print(f" 💾 已完成進度: {already_done} 章 (斷點續傳支援)")
    print(f" 🚀 待下載: {len(pending)} 章")
    print("=" * 65)
    
    if not pending:
        export_txt(db_path, output_txt, title, author)
        return
        
    queue = asyncio.Queue()
    for p in pending:
        queue.put_nowait((p[0], p[1], p[2]))
        
    db_queue = asyncio.Queue()
    db_writer_task = asyncio.create_task(db_writer(db_path, db_queue))
    
    sem = asyncio.Semaphore(max_concurrency)
    progress = {'completed': already_done, 'success': already_done, 'fail': 0}
    current_downloading = {'title': ''}
    t0 = time.time()
    
    print("[*] 正在啟動多執行緒連線中...\n")
    
    async with AsyncSession(impersonate='chrome124') as session:
        try:
            await session.get('https://czbooks.net/', timeout=10)
        except Exception:
            pass
            
        workers = [
            asyncio.create_task(chapter_fetcher(queue, session, sem, progress, current_downloading, db_queue))
            for _ in range(max_concurrency)
        ]
        
        while progress['completed'] < total:
            await asyncio.sleep(0.2)
            c = progress['completed']
            elapsed = time.time() - t0
            speed = (c - already_done) / (elapsed + 0.001)
            eta = (total - c) / (speed + 0.001) if speed > 0 else 0
            render_progress_bar(c, total, speed, elapsed, eta, current_downloading['title'])
            
        await queue.join()
        for w in workers:
            w.cancel()
            
    await db_queue.put(None)
    await db_writer_task
    
    render_progress_bar(total, total, speed, time.time() - t0, 0, "下載全部完成")
    export_txt(db_path, output_txt, title, author)


def main():
    print("=" * 65)
    print("       小說狂人 (czbooks.net) 專屬極速下載器 v2.5")
    print("   [特色] 自動章節去重 | 精準目錄順序 | 實時進度條 | 斷點續傳")
    print("=" * 65)
    
    if len(sys.argv) > 1:
        novel_url = sys.argv[1].strip()
    else:
        novel_url = input("\n請貼上小說狂人網址 (例如 https://czbooks.net/n/s6lf47): ").strip()
        
    if not novel_url:
        novel_url = 'https://czbooks.net/n/s6lf47'
        print(f"未輸入網址，預設使用: {novel_url}")
        
    if 'czbooks.net/n/' not in novel_url:
        print("\n[錯誤] 請輸入有效的小說狂人小說主頁網址 (需包含 /n/XXXX)！")
        input("\n按 Enter 鍵結束...")
        return
        
    try:
        asyncio.run(run_downloader(novel_url))
    except KeyboardInterrupt:
        print("\n\n[!] 使用者手動中斷下載。進度已自動儲存，下次再次執行即可接續下載！")
    except Exception as e:
        print(f"\n\n[錯誤] 下載過程中發生異常: {e}")
        
    print("\n提示：您可以直接將產生的 .txt 檔案透過 LINE 或 AirDrop 傳到手機，")
    print("      在『聽小說』App 首頁點擊【📁 匯入檔案】即可立即聽書！")
    print("=" * 65)
    input("\n下載任務已結束，按 Enter 鍵關閉視窗...")


if __name__ == '__main__':
    main()

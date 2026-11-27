#!/usr/bin/env python3
"""NovelSync PC Scrapling Worker.

Polls a deployed Google Apps Script Web App (`Code.gs`) for scraping jobs
submitted by the mobile app, scrapes novels or comics using Scrapling
(`Fetcher` + automatic `StealthyFetcher` fallback), descrambles comic images
offline with Pillow into clean JPEGs, packs APP-ready `.zip` chunks, uploads
them back to Google Drive through Apps Script, and marks the task complete.
"""

from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import html as html_lib
import io
import json
import os
from pathlib import Path
import re
import sys
import time
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse
import zipfile

from bs4 import BeautifulSoup
from PIL import Image
import requests
from scrapling.fetchers import Fetcher, StealthyFetcher

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "worker_config.json"
DEFAULT_API_KEY = "ns_k9m4x7p2v8q5r3w6"
DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


class TaskCancelledError(Exception):
    """Raised when the user cancels an active task from the mobile app."""


def log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def load_config(config_path: Path) -> Dict[str, Any]:
    defaults: Dict[str, Any] = {
        "gas_url": "",
        "api_key": DEFAULT_API_KEY,
        "poll_interval_seconds": 10,
        "max_zip_chunk_mb": 16,
        "jmcomic_domains": [
            "https://18comic.ink",
            "https://18comic.vip",
            "https://jmcomic-zzz.org",
            "https://comic18j-guta.site",
        ],
        "boylove_domain": "https://boylove.cc",
    }
    for candidate in (config_path, config_path.with_name("worker_config.local.json")):
        if candidate.exists():
            try:
                loaded = json.loads(candidate.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    defaults.update(loaded)
            except Exception as exc:
                log(f"⚠️ 讀取設定檔 {candidate.name} 失敗，改用預設值: {exc}")
    return defaults


def save_config(config_path: Path, cfg: Dict[str, Any]) -> None:
    config_path.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def sanitize_id(raw: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", raw or "").strip("_")
    return cleaned[:96] or f"book_{int(time.time())}"


class GasClient:
    """HTTP bridge client talking to `Code.gs`."""

    def __init__(self, gas_url: str, api_key: str) -> None:
        self.gas_url = gas_url.strip()
        self.api_key = (api_key or DEFAULT_API_KEY).strip()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": DEFAULT_UA})
        self._last_progress_ts = 0.0

    def _get(self, params: Dict[str, Any], timeout: int = 30) -> Dict[str, Any]:
        merged = {**params, "key": self.api_key}
        res = self.session.get(self.gas_url, params=merged, timeout=timeout)
        res.raise_for_status()
        try:
            data = res.json()
        except Exception as exc:
            snippet = (res.text or "")[:200]
            raise RuntimeError(f"GAS 回應非 JSON ({res.status_code}): {snippet}") from exc
        if not data.get("ok"):
            raise RuntimeError(data.get("error") or "GAS API 呼叫失敗")
        return data

    def _post(self, payload: Dict[str, Any], timeout: int = 120) -> Dict[str, Any]:
        body = json.dumps({**payload, "key": self.api_key}, ensure_ascii=False)
        res = self.session.post(
            self.gas_url,
            data=body.encode("utf-8"),
            headers={"Content-Type": "text/plain;charset=utf-8"},
            timeout=timeout,
        )
        res.raise_for_status()
        try:
            data = res.json()
        except Exception as exc:
            snippet = (res.text or "")[:200]
            raise RuntimeError(f"GAS POST 回應非 JSON ({res.status_code}): {snippet}") from exc
        if not data.get("ok"):
            raise RuntimeError(data.get("error") or "GAS POST 呼叫失敗")
        return data

    def ping(self) -> Dict[str, Any]:
        return self._get({"action": "ping"}, timeout=20)

    def poll(self) -> Optional[Dict[str, Any]]:
        data = self._get({"action": "poll"}, timeout=25)
        return data.get("task")

    def report_progress(
        self,
        task_id: str,
        progress_text: str,
        title: Optional[str] = None,
        force: bool = False,
    ) -> None:
        now = time.monotonic()
        if not force and (now - self._last_progress_ts) < 3.0:
            return
        self._last_progress_ts = now
        payload: Dict[str, Any] = {
            "action": "progress",
            "id": task_id,
            "progress": progress_text,
        }
        if title:
            payload["title"] = title
        try:
            res = self._post(payload, timeout=25)
        except Exception as exc:
            log(f"⚠️ 更新進度失敗（略過不中斷）: {exc}")
            return
        if res.get("cancelled"):
            raise TaskCancelledError("使用者已於手機端取消此任務")

    def upload_chunk(
        self,
        zip_bytes: bytes,
        file_name: str,
        part: int,
        total_parts: int,
    ) -> Dict[str, Any]:
        b64 = base64.b64encode(zip_bytes).decode("ascii")
        last_err: Optional[Exception] = None
        for attempt in range(1, 4):
            try:
                res = self._post(
                    {
                        "action": "upload_chunk",
                        "fileName": file_name,
                        "mimeType": "application/zip",
                        "base64": b64,
                        "part": part,
                        "totalParts": total_parts,
                    },
                    timeout=180,
                )
                return {
                    "fileId": res["fileId"],
                    "name": res.get("name", file_name),
                    "size": res.get("size", len(zip_bytes)),
                    "part": part,
                    "totalParts": total_parts,
                    "url": res["url"],
                }
            except Exception as exc:
                last_err = exc
                wait_s = attempt * 3
                log(f"⚠️ 上傳分包 {file_name} 第 {attempt} 次失敗 ({exc})，{wait_s} 秒後重試...")
                time.sleep(wait_s)
        raise RuntimeError(f"上傳分包 {file_name} 失敗: {last_err}")

    def complete(
        self,
        task_id: str,
        files: List[Dict[str, Any]],
        title: Optional[str] = None,
        progress: str = "已完成，可下載匯入",
    ) -> None:
        payload: Dict[str, Any] = {
            "action": "complete",
            "id": task_id,
            "files": files,
            "progress": progress,
        }
        if title:
            payload["title"] = title
        self._post(payload, timeout=30)

    def fail(self, task_id: str, error_msg: str) -> None:
        try:
            self._post(
                {
                    "action": "fail",
                    "id": task_id,
                    "error": error_msg[:1000],
                },
                timeout=25,
            )
        except Exception as exc:
            log(f"⚠️ 回報失敗狀態時發生錯誤: {exc}")


def _extract_cookies_dict(raw_cookies: Any) -> Dict[str, str]:
    result: Dict[str, str] = {}
    if isinstance(raw_cookies, dict):
        for k, v in raw_cookies.items():
            if k is not None and v is not None:
                result[str(k)] = str(v)
    elif isinstance(raw_cookies, (list, tuple)):
        for item in raw_cookies:
            if isinstance(item, dict) and "name" in item and "value" in item:
                result[str(item["name"])] = str(item["value"])
    return result


def _decode_response_html(resp: Any) -> str:
    raw = getattr(resp, "body", None)
    if isinstance(raw, bytes) and raw:
        head = raw[:4096].decode("ascii", errors="ignore").lower()
        charset_match = re.search(r'charset=["\']?([a-z0-9_-]+)', head)
        candidates: List[str] = []
        if charset_match:
            cs = charset_match.group(1)
            candidates.append("gb18030" if cs in ("gbk", "gb2312") else cs)
        resp_enc = getattr(resp, "encoding", None)
        if isinstance(resp_enc, str) and resp_enc:
            candidates.append("gb18030" if resp_enc.lower() in ("gbk", "gb2312") else resp_enc)
        candidates.extend(["utf-8", "gb18030", "big5"])
        seen = set()
        for enc in candidates:
            key = enc.lower()
            if key in seen:
                continue
            seen.add(key)
            try:
                return raw.decode(enc)
            except Exception:
                continue
        return raw.decode("utf-8", errors="replace")

    html_content = getattr(resp, "html_content", None)
    if isinstance(html_content, str) and html_content:
        return html_content
    text = getattr(resp, "text", None)
    return str(text or "")


def _is_blocked_html(html_str: str, status: int) -> bool:
    if status in (403, 429, 503):
        return True
    if not html_str or len(html_str.strip()) < 150:
        return True
    sample = html_str[:12000].lower()
    markers = (
        "just a moment...",
        "attention required! | cloudflare",
        "cf-browser-verification",
        "enable javascript and cookies to continue",
        "challenge-running",
        "verify you are human",
        "turnstile",
    )
    return any(m in sample for m in markers)


class ScraplingSession:
    """Unified Scrapling fetcher with automatic StealthyFetcher Cloudflare escalation."""

    def __init__(self) -> None:
        self.stealth_hosts: set[str] = set()
        self.host_cookies: Dict[str, Dict[str, str]] = {}

    def is_stealth_host(self, url: str) -> bool:
        return urlparse(url).netloc.lower() in self.stealth_hosts

    def fetch_html(
        self,
        url: str,
        referer: Optional[str] = None,
        timeout: int = 25,
        force_stealth: bool = False,
    ) -> Tuple[str, str, Dict[str, str]]:
        host = urlparse(url).netloc.lower()
        cookies = self.host_cookies.get(host)
        headers: Dict[str, str] = {"User-Agent": DEFAULT_UA}
        if referer:
            headers["Referer"] = referer

        if not force_stealth and host not in self.stealth_hosts:
            try:
                resp = Fetcher.get(
                    url,
                    impersonate="chrome",
                    stealthy_headers=True,
                    headers=headers,
                    cookies=cookies or None,
                    timeout=timeout,
                    retries=2,
                )
                status = int(getattr(resp, "status", 200) or 200)
                html_str = _decode_response_html(resp)
                if not _is_blocked_html(html_str, status):
                    new_cookies = _extract_cookies_dict(getattr(resp, "cookies", None))
                    if new_cookies:
                        self.host_cookies[host] = {**self.host_cookies.get(host, {}), **new_cookies}
                    final_url = str(getattr(resp, "url", url) or url)
                    return html_str, final_url, self.host_cookies.get(host, {})
                log(f"🛡️ 偵測到阻擋/驗證 ({status})，切換 StealthyFetcher 繞過: {host}")
            except Exception as exc:
                log(f"⚠️ Fetcher 請求異常 ({exc})，改用 StealthyFetcher: {host}")

        self.stealth_hosts.add(host)
        resp = StealthyFetcher.fetch(
            url,
            headless=True,
            network_idle=True,
            solve_cloudflare=True,
            timeout=max(timeout * 1000, 45000),
            extra_headers=headers,
        )
        status = int(getattr(resp, "status", 200) or 200)
        html_str = _decode_response_html(resp)
        if _is_blocked_html(html_str, status):
            raise RuntimeError(f"目標網站驗證過深無法通過 (HTTP {status}): {url}")
        new_cookies = _extract_cookies_dict(getattr(resp, "cookies", None))
        if new_cookies:
            self.host_cookies[host] = {**self.host_cookies.get(host, {}), **new_cookies}
        final_url = str(getattr(resp, "url", url) or url)
        return html_str, final_url, self.host_cookies.get(host, {})

    def fetch_bytes(
        self,
        url: str,
        referer: str = "",
        cookies: Optional[Dict[str, str]] = None,
        timeout: int = 30,
    ) -> bytes:
        host = urlparse(url).netloc.lower()
        merged_cookies = {**self.host_cookies.get(host, {}), **(cookies or {})}
        headers = {"User-Agent": DEFAULT_UA}
        if referer:
            headers["Referer"] = referer

        try:
            resp = Fetcher.get(
                url,
                impersonate="chrome",
                stealthy_headers=True,
                headers=headers,
                cookies=merged_cookies or None,
                timeout=timeout,
                retries=2,
            )
            status = int(getattr(resp, "status", 200) or 200)
            body = getattr(resp, "body", b"")
            if status < 400 and isinstance(body, bytes) and len(body) > 100:
                return body
        except Exception:
            pass

        r = requests.get(url, headers=headers, cookies=merged_cookies or None, timeout=timeout)
        r.raise_for_status()
        return r.content


# ---------------------------------------------------------------------------
# Novel Parsers
# ---------------------------------------------------------------------------

def clean_novel_html_fragment(fragment_html: str) -> str:
    if not fragment_html:
        return ""
    text = fragment_html
    text = re.sub(r"<script[\s\S]*?</script>", "", text, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.I)
    text = re.sub(r"<ins[\s\S]*?</ins>", "", text, flags=re.I)
    text = re.sub(r"<noscript[\s\S]*?</noscript>", "", text, flags=re.I)
    text = re.sub(
        r'<div[^>]*class=["\'][^"\']*(?:ad|advertisement|banner|outbt|txtinfo)[^"\']*["\'][\s\S]*?</div>',
        "",
        text,
        flags=re.I,
    )
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p>", "\n", text, flags=re.I)
    text = re.sub(r"</div>", "\n", text, flags=re.I)
    text = re.sub(r"</li>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = html_lib.unescape(text)
    text = re.sub(
        r"</?(?:p|br|div|span|a|img|script|style|font|b|i|strong|em)(?:\s+[^>]*)?>",
        "",
        text,
        flags=re.I,
    )
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\xa0", " ").replace("\u200b", "").replace("\ufeff", "")
    lines = [line.strip() for line in text.split("\n")]
    cleaned_lines: List[str] = []
    blank_run = 0
    for line in lines:
        if not line:
            blank_run += 1
            if blank_run <= 2 and cleaned_lines:
                cleaned_lines.append("")
        else:
            blank_run = 0
            cleaned_lines.append(line)
    return "\n".join(cleaned_lines).strip()


def _extract_balanced_div_or_tag(raw_html: str, start_pattern: str, tag: str = "div") -> Optional[str]:
    match = re.search(start_pattern, raw_html, flags=re.I)
    if not match:
        return None
    start_idx = match.end()
    depth = 1
    tag_re = re.compile(rf"</?{tag}\b[^>]*>", flags=re.I)
    for tag_match in tag_re.finditer(raw_html, start_idx):
        if tag_match.group(0).startswith("</"):
            depth -= 1
            if depth == 0:
                return raw_html[start_idx : tag_match.start()]
        else:
            depth += 1
    return raw_html[start_idx:]


def _parse_czbooks(url: str, page_html: str) -> Dict[str, Any]:
    soup = BeautifulSoup(page_html, "lxml")
    title_el = soup.select_one("span.title") or soup.select_one("h1") or soup.title
    title = title_el.get_text(strip=True) if title_el else "未知書名"

    author_el = soup.select_one("span.author a") or soup.select_one("span.author")
    author = author_el.get_text(strip=True) if author_el else "未知作者"
    author = re.sub(r"^作者[：:]\s*", "", author).strip() or "未知作者"

    img_el = soup.select_one("div.thumbnail img")
    cover = ""
    if img_el:
        cover = (img_el.get("src") or img_el.get("data-original") or "").strip()
        if cover.startswith("//"):
            cover = "https:" + cover

    chapters: List[Dict[str, str]] = []
    seen = set()
    area = soup.select_one("#chapter-list") or soup.select_one("ul.chapter-list") or soup
    for a in area.select("a[href]"):
        href = (a.get("href") or "").strip()
        if not href or href.startswith("#") or href.lower().startswith("javascript:"):
            continue
        if href.startswith("//"):
            href = "https:" + href
        else:
            href = urljoin(url, href)
        if "czbooks.net/n/" not in href or href.rstrip("/") == url.rstrip("/"):
            continue
        if href in seen:
            continue
        seen.add(href)
        chapters.append({"url": href, "title": a.get_text(strip=True) or "未知章節"})

    parts = [p for p in urlparse(url).path.split("/") if p]
    book_id = parts[-1] if parts else sanitize_id(url)
    return {
        "id": sanitize_id(f"czbooks_{book_id}"),
        "url": url,
        "title": title,
        "author": author,
        "cover": cover,
        "chapters": chapters,
    }


def _parse_czbooks_chapter(page_html: str) -> str:
    frag = (
        _extract_balanced_div_or_tag(page_html, r'<div[^>]*class=["\'][^"\']*\bcontent\b[^"\']*["\'][^>]*>', "div")
        or _extract_balanced_div_or_tag(page_html, r'<div[^>]*id=["\']content["\'][^>]*>', "div")
    )
    if not frag:
        soup = BeautifulSoup(page_html, "lxml")
        node = soup.select_one("div.content") or soup.select_one("#content")
        frag = str(node) if node else ""
    return clean_novel_html_fragment(frag)


def _parse_xbanxia(url: str, page_html: str) -> Dict[str, Any]:
    soup = BeautifulSoup(page_html, "lxml")
    h1 = soup.select_one("h1")
    title = h1.get_text(strip=True) if h1 else "未知書名"

    author_match = re.search(r"作者︰.*?<a[^>]*>(.*?)</a>", page_html, flags=re.S) or re.search(
        r"作者︰([\s\S]*?)</p>", page_html, flags=re.S
    )
    author = (
        re.sub(r"<[^>]+>", "", author_match.group(1)).strip()
        if author_match
        else "未知作者"
    )

    cover = ""
    img_el = soup.select_one(".book-img img")
    if img_el:
        cover = (img_el.get("data-original") or img_el.get("src") or "").strip()
        if cover.startswith("/"):
            cover = urljoin(url, cover)

    chapters: List[Dict[str, str]] = []
    seen = set()
    area = (
        soup.select_one(".book-list ul")
        or soup.select_one(".dirlist")
        or soup.select_one("ul.chapter")
        or soup
    )
    for a in area.select("a[href]"):
        href = urljoin(url, (a.get("href") or "").strip())
        if href in seen or not href.endswith(".html"):
            continue
        seen.add(href)
        chapters.append({"url": href, "title": a.get_text(strip=True) or "未知章節"})

    clean_path = [p for p in url.split("?")[0].split("#")[0].split("/") if p]
    raw_id = clean_path[-1].replace(".html", "") if clean_path else str(int(time.time()))
    return {
        "id": sanitize_id(f"xbanxia_{raw_id}"),
        "url": url,
        "title": title,
        "author": author,
        "cover": cover,
        "chapters": chapters,
    }


def _parse_xbanxia_chapter(page_html: str) -> str:
    outbt = re.search(r'<div[^>]*id=["\']nr1["\'][^>]*>([\s\S]*?)<div[^>]*class=["\']outbt["\']', page_html, flags=re.I)
    if outbt:
        frag = outbt.group(1)
    else:
        frag = (
            _extract_balanced_div_or_tag(page_html, r'<div[^>]*id=["\']nr1["\'][^>]*>', "div")
            or _extract_balanced_div_or_tag(page_html, r'<div[^>]*id=["\']content["\'][^>]*>', "div")
            or ""
        )
    text = clean_novel_html_fragment(frag)
    text = re.sub(r"（?本章未完[，,]?點擊下一頁繼續閱讀）?", "", text)
    text = re.sub(r"半夏小說[^\n]*", "", text).strip()
    return text


def _parse_twkan(url: str, page_html: str, session: ScraplingSession) -> Dict[str, Any]:
    soup = BeautifulSoup(page_html, "lxml")
    title_el = soup.select_one(".booknav2 h1") or soup.select_one("h1") or soup.title
    title = title_el.get_text(strip=True) if title_el else "未知書名"

    author = "未知作者"
    author_el = soup.select_one('.booknav2 a[href*="author"]')
    if author_el:
        author = author_el.get_text(strip=True)
    else:
        am = re.search(r"作者[：:]\s*([^\n<]+)", page_html)
        if am:
            author = am.group(1).strip()

    cover = ""
    img_el = soup.select_one(".bookimg2 img") or soup.select_one("img[cover]")
    if img_el:
        cover = urljoin(url, (img_el.get("src") or img_el.get("data-src") or "").strip())

    book_id_match = re.search(r"/book/(\d+)", url)
    book_id = book_id_match.group(1) if book_id_match else sanitize_id(url)

    def collect_links(doc_html: str) -> List[Dict[str, str]]:
        s = BeautifulSoup(doc_html, "lxml")
        scope = s.select_one("#list") or s.select_one(".list") or s.select_one("#allchapter") or s
        out: List[Dict[str, str]] = []
        seen = set()
        for a in scope.select("a[href]"):
            href = (a.get("href") or "").strip()
            abs_url = urljoin(url, href)
            if not re.search(r"\.html(?:#.*)?$", abs_url):
                continue
            if abs_url.rstrip("/") == url.rstrip("/") or "/book/" in abs_url and abs_url.endswith(f"/book/{book_id}.html"):
                continue
            if abs_url in seen or len(href) <= 5:
                continue
            seen.add(abs_url)
            out.append({"url": abs_url, "title": a.get_text(strip=True) or "未知章節"})
        return out

    chapters = collect_links(page_html)
    if len(chapters) <= 2 and book_id.isdigit():
        origin = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        ajax_url = f"{origin}/ajax_novels/chapterlist/{book_id}.html"
        try:
            ajax_html, _, _ = session.fetch_html(ajax_url, referer=url)
            ajax_chapters = collect_links(ajax_html)
            if len(ajax_chapters) > len(chapters):
                chapters = ajax_chapters
        except Exception:
            pass

    return {
        "id": sanitize_id(f"twkan_{book_id}"),
        "url": url,
        "title": title,
        "author": author,
        "cover": cover,
        "chapters": chapters,
    }


def _parse_twkan_chapter(page_html: str) -> str:
    frag = (
        _extract_balanced_div_or_tag(page_html, r'<div[^>]*id=["\']txtnav["\'][^>]*>', "div")
        or _extract_balanced_div_or_tag(page_html, r'<div[^>]*class=["\'][^"\']*txtnav[^"\']*["\'][^>]*>', "div")
        or _extract_balanced_div_or_tag(page_html, r'<div[^>]*id=["\']txtcontent["\'][^>]*>', "div")
        or _extract_balanced_div_or_tag(page_html, r'<div[^>]*id=["\']content["\'][^>]*>', "div")
    )
    if not frag:
        return ""
    frag = re.sub(r"<h1[\s\S]*?</h1>", "", frag, flags=re.I)
    frag = re.sub(r'<div[^>]*class=["\'][^"\']*(?:txtinfo|tools|bottom-ad)[^"\']*["\'][\s\S]*?</div>', "", frag, flags=re.I)
    return clean_novel_html_fragment(frag)


def _parse_single_page_chapters(url: str, page_html: str, strip_site_suffix: str = "") -> Dict[str, Any]:
    soup = BeautifulSoup(page_html, "lxml")
    title = soup.title.get_text(strip=True) if soup.title else "未知書名"
    if strip_site_suffix:
        title = title.replace(strip_site_suffix, "").strip()
    h1 = soup.select_one("h1, h2.post-title, h3.post-title")
    if h1 and len(h1.get_text(strip=True)) > 1:
        title = h1.get_text(strip=True)

    frag = (
        _extract_balanced_div_or_tag(page_html, r"<article[^>]*>", "article")
        or _extract_balanced_div_or_tag(page_html, r'<div[^>]*class=["\'][^"\']*post-body[^"\']*["\'][^>]*>', "div")
        or _extract_balanced_div_or_tag(page_html, r'<div[^>]*class=["\'][^"\']*post-content[^"\']*["\'][^>]*>', "div")
        or _extract_balanced_div_or_tag(page_html, r'<div[^>]*class=["\'][^"\']*entry-content[^"\']*["\'][^>]*>', "div")
        or page_html
    )
    frag_no_lists = re.sub(r"<ul[\s\S]*?</ul>", "", frag, flags=re.I)
    frag_no_lists = re.sub(r"<ol[\s\S]*?</ol>", "", frag_no_lists, flags=re.I)
    clean_text = clean_novel_html_fragment(frag_no_lists)

    heading_re = re.compile(r"(第[零一二三四五六七八九十百千万0-9]+章[^\n]*)")
    parts = heading_re.split(clean_text)
    chapters: List[Dict[str, str]] = []
    inline_texts: List[str] = []

    clean_url = url.split("#")[0]
    if len(parts) > 1:
        num = (len(parts) - 1) // 2
        for i in range(num):
            ch_title = parts[1 + i * 2].strip()
            ch_body = parts[2 + i * 2].strip() if (2 + i * 2) < len(parts) else ""
            if i == 0 and parts[0].strip():
                ch_body = parts[0].strip() + "\n\n" + ch_body
            chapters.append({"url": f"{clean_url}#{i}", "title": ch_title})
            inline_texts.append(f"{ch_title}\n\n{ch_body}".strip())
    else:
        chapters.append({"url": f"{clean_url}#0", "title": "全文"})
        inline_texts.append(clean_text)

    return {
        "id": sanitize_id(clean_url),
        "url": clean_url,
        "title": title,
        "author": "未知作者",
        "cover": "",
        "chapters": chapters,
        "inline_texts": inline_texts,
    }


def _parse_generic_novel(url: str, page_html: str) -> Dict[str, Any]:
    soup = BeautifulSoup(page_html, "lxml")
    h1 = soup.select_one("h1")
    title = (
        h1.get_text(strip=True)
        if h1
        else (soup.title.get_text(strip=True) if soup.title else "未知書名")
    )

    container = (
        soup.select_one("#list")
        or soup.select_one(".listmain")
        or soup.select_one("#chapter-list")
        or soup.select_one(".chapter-list")
        or soup.select_one("ul.chapter")
        or soup.select_one(".catalog")
    )
    chapters: List[Dict[str, str]] = []
    if container:
        seen = set()
        for a in container.select("a[href]"):
            href = urljoin(url, (a.get("href") or "").strip())
            if href in seen or href.startswith("javascript:") or href.rstrip("/") == url.rstrip("/"):
                continue
            txt = a.get_text(strip=True)
            if not txt:
                continue
            seen.add(href)
            chapters.append({"url": href, "title": txt})

    if chapters:
        return {
            "id": sanitize_id(url),
            "url": url,
            "title": title,
            "author": "未知作者",
            "cover": "",
            "chapters": chapters,
        }
    return _parse_single_page_chapters(url, page_html)


def _parse_generic_chapter(page_html: str) -> str:
    for pat, tag in (
        (r'<div[^>]*id=["\'](?:content|chaptercontent|txtcontent|nr1|txtnav)["\'][^>]*>', "div"),
        (r'<div[^>]*class=["\'][^"\']*(?:content|post-content|entry-content|post-body)[^"\']*["\'][^>]*>', "div"),
        (r"<article[^>]*>", "article"),
    ):
        frag = _extract_balanced_div_or_tag(page_html, pat, tag)
        if frag:
            cleaned = clean_novel_html_fragment(frag)
            if len(cleaned) > 60:
                return cleaned
    soup = BeautifulSoup(page_html, "lxml")
    paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
    joined = "\n\n".join(p for p in paragraphs if len(p) > 8)
    return joined.strip()


def run_novel_job(
    task_id: str,
    url: str,
    title_hint: str,
    gas: GasClient,
    session: ScraplingSession,
) -> Tuple[Dict[str, Any], List[Tuple[str, bytes]]]:
    gas.report_progress(task_id, "正在抓取小說目錄與簡介...", force=True)
    html_str, final_url, _ = session.fetch_html(url)
    host = urlparse(final_url).netloc.lower()

    if "czbooks" in host:
        info = _parse_czbooks(final_url, html_str)
        ch_parser: Callable[[str], str] = _parse_czbooks_chapter
    elif "xbanxia" in host:
        info = _parse_xbanxia(final_url, html_str)
        ch_parser = _parse_xbanxia_chapter
    elif "twkan" in host:
        info = _parse_twkan(final_url, html_str, session)
        ch_parser = _parse_twkan_chapter
    elif "wyblogs" in host:
        info = _parse_single_page_chapters(final_url, html_str, strip_site_suffix="- sexy gay wyblogs")
        ch_parser = _parse_generic_chapter
    elif "blogspot" in host or "blogger" in host:
        info = _parse_generic_novel(final_url, html_str)
        ch_parser = _parse_generic_chapter
    else:
        info = _parse_generic_novel(final_url, html_str)
        ch_parser = _parse_generic_chapter

    book_title = info.get("title") or title_hint or "未命名小說"
    chapters = info.get("chapters") or []
    if not chapters:
        raise RuntimeError("無法在該網頁解析出任何章節列表")

    gas.report_progress(task_id, f"已取得 {len(chapters)} 章，開始抓取內文...", title=book_title, force=True)
    entries: List[Tuple[str, bytes]] = []

    if info.get("inline_texts"):
        for idx, ch in enumerate(chapters):
            body = info["inline_texts"][idx] if idx < len(info["inline_texts"]) else ""
            payload = {"title": ch["title"], "text": body, "id": str(idx)}
            entries.append((f"{idx}.json", json.dumps(payload, ensure_ascii=False).encode("utf-8")))
    else:
        total = len(chapters)
        results: Dict[int, str] = {}
        first_ch_url = chapters[0]["url"]
        first_html, _, _ = session.fetch_html(first_ch_url, referer=final_url)
        results[0] = ch_parser(first_html)
        gas.report_progress(task_id, f"抓取章節中 (1/{total})...", title=book_title)

        remaining = list(enumerate(chapters))[1:]
        if remaining:
            use_sequential = session.is_stealth_host(first_ch_url)
            if use_sequential:
                for idx, ch in remaining:
                    ch_html, _, _ = session.fetch_html(ch["url"], referer=final_url)
                    results[idx] = ch_parser(ch_html)
                    done_cnt = len(results)
                    gas.report_progress(task_id, f"抓取章節中 ({done_cnt}/{total})...", title=book_title)
            else:
                def fetch_one(pair: Tuple[int, Dict[str, str]]) -> Tuple[int, str]:
                    c_idx, c_obj = pair
                    c_html, _, _ = session.fetch_html(c_obj["url"], referer=final_url)
                    return c_idx, ch_parser(c_html)

                with ThreadPoolExecutor(max_workers=4) as pool:
                    future_map = {pool.submit(fetch_one, item): item for item in remaining}
                    for fut in as_completed(future_map):
                        c_idx, _ = future_map[fut]
                        try:
                            _, txt = fut.result()
                        except Exception:
                            txt = ""
                        results[c_idx] = txt
                        done_cnt = len(results)
                        gas.report_progress(task_id, f"抓取章節中 ({done_cnt}/{total})...", title=book_title)

        for idx, ch in enumerate(chapters):
            body = results.get(idx, "") or "[本章節抓取失敗，請稍後重試]"
            payload = {"title": ch["title"], "text": body, "id": str(idx)}
            entries.append((f"{idx}.json", json.dumps(payload, ensure_ascii=False).encode("utf-8")))

    meta = {
        "id": info["id"],
        "url": info["url"],
        "title": book_title,
        "author": info.get("author") or "未知作者",
        "cover": info.get("cover") or "",
        "type": "novel",
        "chapters": chapters,
    }
    return meta, entries


# ---------------------------------------------------------------------------
# Comic Descramblers & Parsers
# ---------------------------------------------------------------------------

def get_jm_scramble_pieces(photo_id: int, filename: str) -> int:
    """Exact port of `src/utils/comicUtils.js` (`getScramblePieces` for 18comic)."""
    scramble_id = 220980
    if photo_id < scramble_id:
        return 0
    if photo_id < 268850:
        return 10
    x = 10 if photo_id < 421926 else 8
    stem = filename.split(".")[0]
    digest = hashlib.md5(f"{photo_id}{stem}".encode("utf-8")).hexdigest()
    num = ord(digest[-1]) % x
    return num * 2 + 2


def descramble_jm_image(img_bytes: bytes, photo_id: int, filename: str) -> bytes:
    """Applies Mode-0 vertical slice descrambling matching `DescrambleWebView.js`."""
    num = get_jm_scramble_pieces(photo_id, filename)
    with Image.open(io.BytesIO(img_bytes)) as im:
        rgb = im.convert("RGB")
        w, h = rgb.size
        if num > 1 and not getattr(im, "is_animated", False):
            move = h // num
            over = h % num
            out = Image.new("RGB", (w, h))
            current_y = 0
            for i in range(num):
                slice_h = move + (over if i == num - 1 else 0)
                y_src = current_y
                y_dst = h - current_y - slice_h
                crop = rgb.crop((0, y_src, w, y_src + slice_h))
                out.paste(crop, (0, y_dst))
                current_y += slice_h
        else:
            out = rgb
        buf = io.BytesIO()
        out.save(buf, format="JPEG", quality=90, optimize=True)
        return buf.getvalue()


def descramble_boylove_image(img_bytes: bytes, is_scrambled: bool) -> bytes:
    """Applies Boylove 13-strip horizontal descrambling when `h < 4000`."""
    with Image.open(io.BytesIO(img_bytes)) as im:
        rgb = im.convert("RGB")
        w, h = rgb.size
        if is_scrambled and h < 4000 and w >= 13 and not getattr(im, "is_animated", False):
            num = 13
            piece_w = w // num
            out = Image.new("RGB", (w, h))
            for i in range(1, num + 1):
                if i == num:
                    last_w = w - piece_w * (num - 1)
                    crop = rgb.crop((0, 0, last_w, h))
                    dst_x = piece_w * (num - 1)
                else:
                    x_src = w - piece_w * i
                    crop = rgb.crop((x_src, 0, x_src + piece_w, h))
                    dst_x = piece_w * (i - 1)
                out.paste(crop, (dst_x, 0))
        else:
            out = rgb
        buf = io.BytesIO()
        out.save(buf, format="JPEG", quality=90, optimize=True)
        return buf.getvalue()


def _parse_jm_album(url: str, page_html: str) -> Dict[str, Any]:
    soup = BeautifulSoup(page_html, "lxml")
    h1 = soup.select_one("h1")
    title = h1.get_text(strip=True) if h1 else (soup.title.get_text(strip=True) if soup.title else "")

    author = ""
    author_el = (
        soup.select_one('[data-original-title="作者"] a')
        or soup.select_one('[itemprop="author"]')
    )
    if author_el:
        author = author_el.get_text(strip=True)
    else:
        am = re.search(r"作者[：:]\s*<a[^>]*>([^<]+)</a>", page_html, flags=re.I)
        if am:
            author = am.group(1).strip()

    cover = ""
    cover_el = soup.select_one("img#album_cover") or soup.select_one(".thumb-overlay img")
    if cover_el:
        cover = (cover_el.get("data-original") or cover_el.get("src") or "").strip()
        if cover.startswith("//"):
            cover = "https:" + cover

    origin = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    album_match = re.search(r"/(?:album|photo)/(\d+)", url)
    album_id = album_match.group(1) if album_match else sanitize_id(url)

    chapters: List[Dict[str, str]] = []
    seen_ids = set()
    scope = soup.select_one(".episode") or soup.select_one(".btn-toolbar")
    if scope:
        for a in scope.select('a[href*="/photo/"]'):
            href = (a.get("href") or "").strip()
            id_m = re.search(r"/photo/(\d+)", href)
            if not id_m:
                continue
            pid = id_m.group(1)
            if pid in seen_ids:
                continue
            seen_ids.add(pid)
            raw_title = " ".join(a.get_text().split()) or f"第{len(chapters) + 1}章"
            chapters.append({"title": raw_title, "url": urljoin(origin, href), "id": pid})

    if not chapters and album_id.isdigit():
        chapters.append(
            {
                "title": "開始閱讀",
                "url": f"{origin}/photo/{album_id}",
                "id": album_id,
            }
        )

    chapters.sort(key=lambda ch: int(ch["id"]) if ch["id"].isdigit() else 0)
    return {
        "id": sanitize_id(f"comic_18comic_{album_id}"),
        "url": url,
        "title": title or f"ID: {album_id}",
        "author": author or "未知作者",
        "cover": cover,
        "chapters": chapters,
    }


def _extract_jm_photo_images(photo_html: str, page_url: str) -> List[str]:
    soup = BeautifulSoup(photo_html, "lxml")
    origin = f"{urlparse(page_url).scheme}://{urlparse(page_url).netloc}"
    imgs: List[str] = []
    seen = set()
    nodes = soup.select(
        'img[id^="album_photo_"], .scramble-page img, .panel-body img[data-original], div[id*="photo"] img'
    )
    for img in nodes:
        src = (img.get("data-original") or img.get("src") or "").strip()
        if not src:
            continue
        low = src.lower()
        if any(bad in low for bad in ("blank.gif", "placeholder", "logo", "loading.gif")):
            continue
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            src = urljoin(origin, src)
        if src.startswith("http") and src not in seen:
            seen.add(src)
            imgs.append(src)
    return imgs


def run_jmcomic_job(
    task_id: str,
    url: str,
    title_hint: str,
    gas: GasClient,
    session: ScraplingSession,
    config: Dict[str, Any],
) -> Tuple[Dict[str, Any], List[Tuple[str, bytes]]]:
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.netloc else "https://18comic.ink"
    path_and_query = parsed.path + (f"?{parsed.query}" if parsed.query else "")
    domains = [origin] + [d.rstrip("/") for d in config.get("jmcomic_domains", []) if d]
    unique_domains = list(dict.fromkeys(domains))

    album_html = ""
    working_origin = origin
    last_err: Optional[Exception] = None
    gas.report_progress(task_id, "正在抓取漫畫目錄 (18comic)...", force=True)

    for dom in unique_domains:
        candidate = f"{dom}{path_and_query}"
        try:
            album_html, final_url, _ = session.fetch_html(candidate)
            working_origin = f"{urlparse(final_url).scheme}://{urlparse(final_url).netloc}"
            break
        except Exception as exc:
            last_err = exc
            log(f"⚠️ 18comic 分流失敗 {dom}: {exc}")

    if not album_html:
        raise RuntimeError(f"18comic 所有分流皆無法連線: {last_err}")

    info = _parse_jm_album(f"{working_origin}{path_and_query}", album_html)
    comic_title = info["title"] or title_hint or info["id"]
    chapters = info["chapters"]
    if not chapters:
        raise RuntimeError("找不到任何 18comic 章節")

    gas.report_progress(task_id, f"已取得 {len(chapters)} 話，準備下載與圖片解碼...", title=comic_title, force=True)
    entries: List[Tuple[str, bytes]] = []

    for ch_idx, ch in enumerate(chapters):
        ch_path = urlparse(ch["url"]).path
        photo_html = ""
        photo_cookies: Dict[str, str] = {}
        photo_url_used = ch["url"]

        for dom in list(dict.fromkeys([working_origin] + unique_domains)):
            try:
                candidate = f"{dom}{ch_path}"
                photo_html, photo_url_used, photo_cookies = session.fetch_html(candidate, referer=f"{dom}/")
                imgs = _extract_jm_photo_images(photo_html, photo_url_used)
                if imgs:
                    working_origin = dom
                    break
            except Exception:
                continue
        else:
            imgs = []

        if not imgs:
            raise RuntimeError(f"章節「{ch['title']}」找不到任何圖片")

        gas.report_progress(
            task_id,
            f"第 {ch_idx + 1}/{len(chapters)} 話：下載並重組 {len(imgs)} 張圖片...",
            title=comic_title,
        )

        page_blobs: Dict[int, bytes] = {}

        def dl_and_fix(pair: Tuple[int, str]) -> Tuple[int, bytes]:
            p_idx, img_url = pair
            raw_bytes = session.fetch_bytes(img_url, referer=f"{working_origin}/", cookies=photo_cookies)
            url_no_q = img_url.split("?")[0]
            parts = url_no_q.split("/")
            orig_name = parts[-1] if parts and "." in parts[-1] else f"{p_idx}.jpg"
            pid = int(ch["id"]) if str(ch["id"]).isdigit() else 0
            if len(parts) >= 2 and parts[-2].isdigit():
                pid = int(parts[-2])
            fixed_jpg = descramble_jm_image(raw_bytes, pid, orig_name)
            return p_idx, fixed_jpg

        with ThreadPoolExecutor(max_workers=4) as pool:
            futs = {pool.submit(dl_and_fix, (j, u)): j for j, u in enumerate(imgs)}
            for fut in as_completed(futs):
                j, jpg_bytes = fut.result()
                page_blobs[j] = jpg_bytes

        local_pages: List[str] = []
        for j in range(len(imgs)):
            arc_img = f"images/c{ch_idx}_p{j:04d}.jpg"
            entries.append((arc_img, page_blobs[j]))
            local_pages.append(arc_img)

        ch_json = json.dumps(
            {"title": ch["title"], "pages": local_pages, "id": str(ch_idx)},
            ensure_ascii=False,
        ).encode("utf-8")
        entries.append((f"{ch_idx}.json", ch_json))

    meta = {
        "id": info["id"],
        "url": info["url"],
        "title": comic_title,
        "author": info["author"],
        "cover": info["cover"],
        "type": "comic",
        "chapters": chapters,
    }
    return meta, entries


def _parse_boylove_info(url: str, page_html: str) -> Dict[str, Any]:
    origin = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    soup = BeautifulSoup(page_html, "lxml")

    title = soup.title.get_text(strip=True) if soup.title else ""
    title = title.replace("- 香香腐宅BoyLove", "").strip()
    h1 = soup.select_one("h1")
    if h1 and h1.get_text(strip=True):
        title = h1.get_text(strip=True)

    author = "未知作者"
    am = (
        re.search(r"<i>作者：</i>\s*<a[^>]*>([^<]+)</a>", page_html)
        or re.search(r'<p class="data">作者：([\s\S]*?)</p>', page_html)
    )
    if am:
        author = re.sub(r"<[^>]+>", "", am.group(1)).strip() or "未知作者"

    cover = ""
    cm = re.search(
        r'<a class="stui-vodlist__thumb picture v-thumb"[^>]+data-original="([^"]+)"',
        page_html,
    )
    if cm:
        cover = cm.group(1).strip()
    else:
        og = soup.select_one('meta[property="og:image"]')
        if og:
            cover = (og.get("content") or "").strip()
    if cover and not cover.startswith("http"):
        cover = f"https://img.boylove.cc{cover}" if cover.startswith("/") else urljoin(origin, cover)

    chapters: List[Dict[str, str]] = []
    cl_match = re.search(r'JSON\.parse\("(\{\\"(?:list|data)\\":\[.*?\].*?\})"\)', page_html)
    if cl_match:
        try:
            decoded_str = cl_match.group(1).replace('\\"', '"').replace("\\\\", "\\")
            cl_json = json.loads(decoded_str)
            items = cl_json.get("list") or cl_json.get("data") or []
            for item in items:
                cid = str(item.get("id", "")).strip()
                if not cid:
                    continue
                chapters.append(
                    {
                        "id": cid,
                        "title": str(item.get("title") or f"第{len(chapters) + 1}話"),
                        "url": f"{origin}/home/book/capter/id/{cid}",
                        "vip": bool(item.get("vip") == 1 or item.get("isvip") == 1),
                    }
                )
        except Exception:
            chapters = []

    if not chapters:
        seen = set()
        for a in soup.select('a[href*="/capter/id/"]'):
            href = (a.get("href") or "").strip()
            cm_id = re.search(r"/capter/id/(\d+)", href)
            if not cm_id:
                continue
            cid = cm_id.group(1)
            if cid in seen:
                continue
            seen.add(cid)
            chapters.append(
                {
                    "id": cid,
                    "title": a.get_text(strip=True) or f"第{len(chapters) + 1}話",
                    "url": urljoin(origin, href),
                    "vip": False,
                }
            )

    comic_id_m = re.search(r"/id/(\d+)", url)
    comic_id = comic_id_m.group(1) if comic_id_m else sanitize_id(url)
    return {
        "id": sanitize_id(f"comic_boylove_{comic_id}"),
        "url": url,
        "title": title or f"Boylove {comic_id}",
        "author": author,
        "cover": cover,
        "chapters": chapters,
    }


def _extract_boylove_chapter(chapter_html: str, page_url: str) -> Tuple[List[str], bool]:
    if "VIP" in chapter_html and ("購買" in chapter_html or "VIP 專屬" in chapter_html or "vip" in chapter_html.lower()):
        imgs_check = re.findall(r'data-original=["\']([^"\']+/bookimages/[^"\']+)["\']', chapter_html)
        if not imgs_check:
            raise RuntimeError("VIP_LOCKED")

    soup = BeautifulSoup(chapter_html, "lxml")
    origin = f"{urlparse(page_url).scheme}://{urlparse(page_url).netloc}"
    images: List[str] = []
    seen = set()
    for img in soup.select("img"):
        src = (img.get("data-original") or img.get("src") or "").strip()
        if not src or "/bookimages/" not in src:
            continue
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            src = f"https://img.boylove.cc{src}"
        elif not src.startswith("http"):
            src = urljoin(origin, src)
        if src not in seen:
            seen.add(src)
            images.append(src)

    if not images:
        for m in re.finditer(r"https://img\.boylove\.cc/[a-zA-Z0-9_/.\-]+\.(?:jpg|jpeg|png|webp)", chapter_html):
            u = m.group(0)
            if "/bookimages/" in u and u not in seen:
                seen.add(u)
                images.append(u)

    has_canvas = bool(re.search(r'<canvas[^>]*id=["\']viewport', chapter_html, flags=re.I))
    empty_merge = bool(re.search(r"function\s+firstMergeImg\s*\([^)]*\)\s*\{\s*\}", chapter_html))
    is_scrambled = has_canvas and not empty_merge
    return images, is_scrambled


def run_boylove_job(
    task_id: str,
    url: str,
    title_hint: str,
    gas: GasClient,
    session: ScraplingSession,
) -> Tuple[Dict[str, Any], List[Tuple[str, bytes]]]:
    gas.report_progress(task_id, "正在抓取漫畫目錄 (香香腐宅)...", force=True)
    html_str, final_url, _ = session.fetch_html(url)
    info = _parse_boylove_info(final_url, html_str)
    comic_title = info["title"] or title_hint or info["id"]
    all_chapters = info["chapters"]
    if not all_chapters:
        raise RuntimeError("香香腐宅解析不到章節列表")

    entries: List[Tuple[str, bytes]] = []
    downloaded_chapters: List[Dict[str, str]] = []
    vip_skipped = 0

    for idx, ch in enumerate(all_chapters):
        if ch.get("vip"):
            vip_skipped += 1
            continue
        ch_html, ch_final, ch_cookies = session.fetch_html(ch["url"], referer=final_url)
        try:
            imgs, is_scrambled = _extract_boylove_chapter(ch_html, ch_final)
        except RuntimeError as exc:
            if "VIP_LOCKED" in str(exc):
                vip_skipped += 1
                continue
            raise
        if not imgs:
            continue

        out_idx = len(downloaded_chapters)
        gas.report_progress(
            task_id,
            f"第 {idx + 1}/{len(all_chapters)} 話：下載並處理 {len(imgs)} 張圖片...",
            title=comic_title,
        )

        page_blobs: Dict[int, bytes] = {}

        def dl_one(pair: Tuple[int, str]) -> Tuple[int, bytes]:
            p_idx, img_url = pair
            raw = session.fetch_bytes(img_url, referer=final_url, cookies=ch_cookies)
            return p_idx, descramble_boylove_image(raw, is_scrambled)

        with ThreadPoolExecutor(max_workers=4) as pool:
            futs = {pool.submit(dl_one, (j, u)): j for j, u in enumerate(imgs)}
            for fut in as_completed(futs):
                j, jpg_bytes = fut.result()
                page_blobs[j] = jpg_bytes

        local_pages: List[str] = []
        for j in range(len(imgs)):
            arc_img = f"images/c{out_idx}_p{j:04d}.jpg"
            entries.append((arc_img, page_blobs[j]))
            local_pages.append(arc_img)

        ch_json = json.dumps(
            {"title": ch["title"], "pages": local_pages, "id": str(out_idx)},
            ensure_ascii=False,
        ).encode("utf-8")
        entries.append((f"{out_idx}.json", ch_json))
        downloaded_chapters.append({"id": ch["id"], "title": ch["title"], "url": ch["url"]})

    if not downloaded_chapters:
        raise RuntimeError(
            f"無法取得任何免費章節圖片（已略過 {vip_skipped} 個 VIP 付費章節）"
        )

    meta = {
        "id": info["id"],
        "url": info["url"],
        "title": comic_title,
        "author": info["author"],
        "cover": info["cover"],
        "type": "comic",
        "chapters": downloaded_chapters,
    }
    return meta, entries


# ---------------------------------------------------------------------------
# Zip Chunker & Job Dispatcher
# ---------------------------------------------------------------------------

def pack_zip_chunks(
    meta: Dict[str, Any],
    entries: List[Tuple[str, bytes]],
    max_chunk_bytes: int,
    prefix: str,
) -> List[Tuple[str, bytes]]:
    """Packs `meta.json` (guaranteed in part 1) + entries into <= max_chunk_bytes zips."""
    meta_bytes = json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8")
    all_items: List[Tuple[str, bytes]] = [("meta.json", meta_bytes), *entries]

    chunks: List[List[Tuple[str, bytes]]] = []
    current_group: List[Tuple[str, bytes]] = []
    current_est = 0

    for name, data in all_items:
        # Rough upper bound of compressed size in zip: uncompressed + zip header
        item_size = len(data) + 128
        if current_group and (current_est + item_size) > max_chunk_bytes:
            chunks.append(current_group)
            current_group = []
            current_est = 0
        current_group.append((name, data))
        current_est += item_size

    if current_group:
        chunks.append(current_group)

    out_zips: List[Tuple[str, bytes]] = []
    total = len(chunks)
    for idx, group in enumerate(chunks, start=1):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for arc_name, payload in group:
                zf.writestr(arc_name, payload)
        zip_name = f"{prefix}_part{idx}of{total}.zip"
        out_zips.append((zip_name, buf.getvalue()))
    return out_zips


def detect_job_kind(url: str, requested_kind: str) -> str:
    if requested_kind in ("novel", "comic"):
        return requested_kind
    low = url.lower()
    if any(k in low for k in ("18comic", "jmcomic", "boylove")):
        return "comic"
    return "novel"


def process_task(
    task: Dict[str, Any],
    gas: GasClient,
    session: ScraplingSession,
    config: Dict[str, Any],
) -> None:
    task_id = str(task.get("id", ""))
    url = str(task.get("url", "")).strip()
    kind = detect_job_kind(url, str(task.get("kind", "auto")).lower())
    title_hint = str(task.get("title", "")).strip()

    log(f"▶️ 開始執行任務 [{task_id}] ({kind}): {url}")
    try:
        if kind == "comic":
            low = url.lower()
            if "boylove" in low:
                meta, entries = run_boylove_job(task_id, url, title_hint, gas, session)
            else:
                meta, entries = run_jmcomic_job(task_id, url, title_hint, gas, session, config)
        else:
            meta, entries = run_novel_job(task_id, url, title_hint, gas, session)

        book_title = meta.get("title") or title_hint or task_id
        max_bytes = max(2, int(config.get("max_zip_chunk_mb", 16))) * 1024 * 1024
        gas.report_progress(task_id, "正在打包壓縮成品...", title=book_title, force=True)
        zips = pack_zip_chunks(meta, entries, max_bytes, sanitize_id(meta["id"]))

        uploaded_files: List[Dict[str, Any]] = []
        total_parts = len(zips)
        for p_idx, (zip_name, zip_bytes) in enumerate(zips, start=1):
            mb = len(zip_bytes) / (1024 * 1024)
            gas.report_progress(
                task_id,
                f"正在上傳至 Google 雲端硬碟 ({p_idx}/{total_parts}, {mb:.1f} MB)...",
                title=book_title,
                force=True,
            )
            file_info = gas.upload_chunk(zip_bytes, zip_name, p_idx, total_parts)
            uploaded_files.append(file_info)

        done_msg = f"已完成（共 {len(meta.get('chapters', []))} 章，{total_parts} 個分包），可下載匯入"
        gas.complete(task_id, uploaded_files, title=book_title, progress=done_msg)
        log(f"✅ 任務完成 [{task_id}]: 《{book_title}》 ({total_parts} 份分包)")
    except TaskCancelledError as cancel_exc:
        log(f"🛑 任務已於手機端取消 [{task_id}]: {cancel_exc}")
    except Exception as exc:
        err_msg = str(exc) or repr(exc)
        log(f"❌ 任務失敗 [{task_id}]: {err_msg}")
        gas.fail(task_id, err_msg)


def main() -> int:
    parser = argparse.ArgumentParser(description="NovelSync Scrapling PC Worker")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH, help="設定檔路徑")
    parser.add_argument("--url", type=str, default="", help="覆寫 Google Apps Script Web App 網址")
    parser.add_argument("--once", action="store_true", help="只輪詢一次即結束")
    args = parser.parse_args()

    config = load_config(args.config)
    if args.url:
        config["gas_url"] = args.url.strip()

    if not config.get("gas_url"):
        if args.once:
            log("❌ worker_config.json 尚未填入 gas_url")
            return 1
        print("=" * 60)
        print("尚未設定 Google Apps Script 網頁應用程式網址 (gas_url)。")
        print("請先到 https://script.google.com 部署 Code.gs 並貼上 /exec 網址：")
        entered = input("GAS Web App URL: ").strip()
        if not entered.startswith("https://"):
            log("❌ 網址無效（需以 https:// 開頭），已結束。")
            return 1
        config["gas_url"] = entered
        local_cfg_path = args.config.with_name("worker_config.local.json")
        save_config(local_cfg_path, {"gas_url": entered, "api_key": config.get("api_key", DEFAULT_API_KEY)})
        log(f"💾 已儲存設定至 {local_cfg_path}")

    gas = GasClient(config["gas_url"], config.get("api_key", DEFAULT_API_KEY))
    session = ScraplingSession()

    try:
        ping_res = gas.ping()
        log(f"☁️ 雲端連線成功！Folder ID: {ping_res.get('rootFolderId')}")
    except Exception as exc:
        log(f"❌ 無法連線至 Google Apps Script: {exc}")
        if args.once:
            return 1

    interval = max(3, int(config.get("poll_interval_seconds", 10)))
    log(f"🚀 NovelSync 電腦端 Scrapling Worker 啟動成功！每 {interval} 秒檢查一次雲端任務...")

    while True:
        try:
            task = gas.poll()
            if task:
                process_task(task, gas, session, config)
            else:
                if args.once:
                    log("（目前無排隊中任務）")
                    break
                time.sleep(interval)
        except KeyboardInterrupt:
            log("👋 收到中止訊號，Worker 已關閉。")
            break
        except Exception as exc:
            log(f"⚠️ 輪詢過程發生錯誤: {exc}")
            if args.once:
                return 1
            time.sleep(interval)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

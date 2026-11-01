"""Public primary-source HTTP policy. No cookies, bypasses or arbitrary URLs."""
import ipaddress
import socket
import threading
import time
from urllib.parse import urlsplit, urljoin
from urllib.robotparser import RobotFileParser

import httpx

USER_AGENT = "FINNResearch/1.0"
MAX_BYTES = 20_000_000


class SourceError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class SourceRedirect(Exception):
    def __init__(self, target):
        self.target = target


def validate_url(url, hosts, resolve=True):
    try:
        parts = urlsplit(url)
        if (parts.scheme != "https" or parts.hostname not in hosts or parts.username or parts.password
                or parts.port not in (None, 443) or parts.fragment or "\\" in url or len(url) > 2000):
            raise ValueError()
        if resolve:
            addresses = socket.getaddrinfo(parts.hostname, 443, type=socket.SOCK_STREAM)
            if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
                raise ValueError()
    except (ValueError, OSError) as exc:
        raise SourceError("source_not_permitted", "Source URL or network destination is not permitted.") from exc
    return parts


class SourceClient:
    """Bounded requests; redirect targets must pass the same host/IP policy."""
    _lock = threading.Lock()
    _last = {}

    def __init__(self, hosts):
        self.hosts = set(hosts)
        self.client = httpx.Client(timeout=httpx.Timeout(20, connect=5), follow_redirects=False,
                                  trust_env=False, headers={"User-Agent": USER_AGENT})
        self.robots = {}
        self.deadline = time.monotonic() + 100

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.client.close()

    def _get(self, url, limit, types, allow_missing=False, delay=1):
        host = validate_url(url, self.hosts).hostname
        for attempt in range(2):
            if time.monotonic() >= self.deadline:
                raise SourceError("source_timeout", "Source discovery exceeded its time budget.")
            with self._lock:
                wait = max(0, self._last.get(host, 0) + delay - time.monotonic())
                if wait > 10:
                    raise SourceError("rate_limited", "Source rate limit reached. Retry later.")
                self._last[host] = time.monotonic() + wait
            time.sleep(wait)
            try:
                with self.client.stream("GET", url) as response:
                    if allow_missing and response.status_code in (404, 410):
                        return b"", ""
                    if response.is_redirect:
                        target = urljoin(url, response.headers.get("location", ""))
                        validate_url(target, self.hosts)
                        raise SourceRedirect(target)
                    if response.status_code in (429, 401, 403):
                        raise SourceError("source_restricted", f"Official source returned HTTP {response.status_code}; retry later or use another official source.")
                    if response.status_code >= 500 and attempt == 0:
                        continue
                    response.raise_for_status()
                    content_type = response.headers.get("content-type", "").split(";")[0].lower()
                    if types and content_type not in types:
                        raise SourceError("invalid_content_type", "Source returned an unexpected content type.")
                    if int(response.headers.get("content-length", "0")) > limit:
                        raise SourceError("file_too_large", "Source exceeds the supported file size.")
                    chunks, size = [], 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > limit or time.monotonic() > self.deadline:
                            raise SourceError("download_limit", "Source exceeded the size or time limit.")
                        chunks.append(chunk)
                    return b"".join(chunks), content_type
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt == 0:
                    continue
                raise SourceError("source_unavailable", "Official source could not be reached. Retry later.") from exc
            except (httpx.HTTPError, ValueError) as exc:
                raise SourceError("source_unavailable", "Official source returned an unsuccessful response.") from exc
        raise SourceError("source_unavailable", "Official source is unavailable.")

    def get(self, url, limit=MAX_BYTES, types=None, _redirects=0):
        if _redirects > 3:
            raise SourceError("redirect_limit", "Official source redirected too many times.")
        parts = validate_url(url, self.hosts)
        if parts.hostname not in self.robots:
            robot_url = f"https://{parts.hostname}/robots.txt"
            for hop in range(4):
                try:
                    raw, _ = self._get(robot_url, 200_000, {"text/plain", "text/html"}, allow_missing=True)
                    break
                except SourceRedirect as redirect:
                    if hop == 3:
                        raise SourceError("robots_unavailable", "Source access policy redirects could not be resolved.") from None
                    robot_url = redirect.target
            if raw.lstrip().startswith(b"<"):
                raise SourceError("robots_unavailable", "Source access policy could not be read.")
            parser = RobotFileParser(robot_url)
            parser.parse(raw.decode("utf-8", errors="replace").splitlines())
            self.robots[parts.hostname] = parser
        parser = self.robots[parts.hostname]
        if not parser.can_fetch(USER_AGENT, url):
            raise SourceError("robots_denied", "Official source disallows automated retrieval of this resource.")
        delay = parser.crawl_delay(USER_AGENT) or 1
        rate = parser.request_rate(USER_AGENT)
        if rate:
            delay = max(delay, rate.seconds / rate.requests)
        try:
            return self._get(url, limit, types, delay=delay)[0]
        except SourceRedirect as redirect:
            return self.get(redirect.target, limit, types, _redirects + 1)

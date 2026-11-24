import json, secrets, webbrowser, asyncio, threading, concurrent.futures
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, urlencode
import re, ipaddress, os, signal
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
HOST = '127.0.0.1'

def resolve_address(value):
    value = str(value).strip()
    if not value:
        raise ValueError('Saisissez une adresse ou une recherche')
    if value == 'about:blank':
        return value
    def validate(url):
        u = urlsplit(url)
        if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password:
            raise ValueError('URL HTTP(S) uniquement')
        if any(c.isspace() for c in u.netloc):
            raise ValueError('Adresse invalide')
        _ = u.port
        return url
    if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*://', value):
        return validate(value)
    if not any(c.isspace() for c in value):
        try:
            u = urlsplit('https://' + value)
            host = u.hostname or ''
            try:
                ipaddress.ip_address(host)
                is_ip = True
            except ValueError:
                is_ip = False
            domain = host.encode('idna').decode('ascii').rstrip('.')
            is_domain = bool(re.fullmatch(r'(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:[a-zA-Z]{2,63}|xn--[a-zA-Z0-9-]+)', domain))
            if host == 'localhost' or is_ip or is_domain:
                scheme = 'http' if host == 'localhost' or is_ip else 'https'
                return validate(scheme + '://' + value)
        except (ValueError, UnicodeError):
            pass
    return 'https://www.bing.com/search?' + urlencode({'q': value})

def load_config():
    c = json.loads((ROOT / 'config.json').read_text(encoding='utf-8'))
    for key, lo, hi in [('port', 1024, 65535), ('jpeg_quality', 1, 100), ('navigation_timeout_ms', 1000, 120000)]:
        if type(c.get(key)) is not int or not lo <= c[key] <= hi:
            raise ValueError(f'Configuration invalide : {key}')
    for key in ('auto_port', 'open_browser'):
        if type(c.get(key)) is not bool: raise ValueError(f'Configuration invalide : {key}')
    url = c.get('homepage')
    if not isinstance(url, str): raise ValueError('homepage invalide')
    u = urlsplit(url)
    if url != 'about:blank' and (u.scheme not in ('http','https') or not u.hostname or u.username or u.password):
        raise ValueError('homepage : URL HTTP(S) ou about:blank uniquement')
    c.setdefault('fps', 30)
    if type(c['fps']) is not int or not 1 <= c['fps'] <= 30: raise ValueError('fps invalide')
    return c
TOKEN = secrets.token_urlsafe(32)
WIDTH, HEIGHT = 1280, 800

async def run():
    config = load_config()
    PORT = config['port']
    parent_port = os.environ.get("NAV_UNIT_PARENT_PORT")
    ancestors = "'self'"
    if parent_port is not None:
        port = int(parent_port)
        PORT = int(os.environ["NAV_UNIT_LISTEN_PORT"])
        if not 1 <= port <= 65535:
            raise ValueError("Port Planneli invalide.")
        ancestors += f" http://127.0.0.1:{port} http://localhost:{port} http://[::1]:{port}"
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, chromium_sandbox=True)
        context = await browser.new_context(viewport={'width': WIDTH, 'height': HEIGHT}, accept_downloads=False)
        page = await context.new_page()
        page.set_default_timeout(3500)
        page.set_default_navigation_timeout(config['navigation_timeout_ms'])
        loop = asyncio.get_running_loop()
        latest = {'image': b'', 'url': 'about:blank', 'title': '', 'error': ''}
        lock = asyncio.Lock()
        def popup(p):
            nonlocal page
            page = p
            page.set_default_timeout(3500)
            page.set_default_navigation_timeout(config['navigation_timeout_ms'])
        context.on('page', popup)
        async def frames():
            while True:
                started = loop.time()
                try:
                    if page.is_closed():
                        if context.pages: popup(context.pages[-1])
                        else: await context.new_page()
                    latest['image'] = await page.screenshot(type='jpeg',quality=config['jpeg_quality'],timeout=2000)
                    latest['url'] = page.url
                except Exception: pass
                await asyncio.sleep(max(0, 1/config['fps'] - (loop.time() - started)))
        async def action(d):
            async with lock:
                try:
                    a = d.get('action')
                    if a == 'go':
                        url = resolve_address(d['url'])
                        await page.goto(url, wait_until='commit')
                    elif a == 'back': await page.go_back(wait_until='commit')
                    elif a == 'forward': await page.go_forward(wait_until='commit')
                    elif a == 'reload': await page.reload(wait_until='commit')
                    elif a == 'click': await page.mouse.click(max(0,min(WIDTH-1,float(d['x']))),max(0,min(HEIGHT-1,float(d['y']))))
                    elif a == 'scroll': await page.mouse.wheel(0,max(-2000,min(2000,float(d['dy']))))
                    elif a == 'text': await page.keyboard.insert_text(str(d['text'])[:4000])
                    elif a == 'key' and d.get('key') in ('Enter','Tab','Backspace','Delete','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Control+a'): await page.keyboard.press(d['key'])
                    else: raise ValueError('Action inconnue')
                    latest['error'] = ''
                except Exception as exc:
                    latest['error'] = str(exc).splitlines()[0][:250]
                latest['url'] = page.url
                return {k:v for k,v in latest.items() if k != 'image'}
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def reply(self, status, body, mime='application/json'):
                if isinstance(body, dict): body = json.dumps(body).encode()
                self.send_response(status)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Referrer-Policy', 'no-referrer')
                self.send_header('Content-Security-Policy', f"default-src 'self'; img-src 'self' data: blob:; frame-src 'self'; frame-ancestors {ancestors}; object-src 'none'; base-uri 'none'")
                self.end_headers(); self.wfile.write(body)
            def valid_host(self): return self.headers.get('Host') == f'{HOST}:{PORT}'
            def do_GET(self):
                if not self.valid_host(): return self.reply(403, {})
                files = {'/': ('index.html','text/html'), '/index.html': ('index.html','text/html'), '/browser.html': ('browser.html','text/html'), '/browser.js': ('browser.js','text/javascript'), '/browser.css': ('browser.css','text/css'), '/settings.html': ('settings.html','text/html'), '/demo.css': ('demo.css','text/css'), '/demo.js': ('demo.js','text/javascript')}
                if self.path == '/frame':
                    if not secrets.compare_digest(self.headers.get('X-Nav-Token',''),TOKEN): return self.reply(403,{})
                    frame = latest['image']
                    return self.reply(200, frame, 'image/jpeg') if frame else self.reply(204,b'')
                if self.path == '/token': return self.reply(200, {'token': TOKEN, 'fps': config['fps']})
                if self.path == '/state':
                    if not secrets.compare_digest(self.headers.get('X-Nav-Token',''),TOKEN): return self.reply(403,{})
                    return self.reply(200,{k:v for k,v in latest.items() if k != 'image'})
                if self.path not in files: return self.reply(404,{})
                name, mime = files[self.path]; self.reply(200,(ROOT/name).read_bytes(),mime+'; charset=utf-8')
            def do_POST(self):
                if not self.valid_host() or self.headers.get('Origin') != ORIGIN or not secrets.compare_digest(self.headers.get('X-Nav-Token',''),TOKEN) or self.path != '/action': return self.reply(403,{})
                try:
                    n = int(self.headers.get('Content-Length','0'))
                    if not 0 < n <= 16384: return self.reply(400,{})
                    d = json.loads(self.rfile.read(n))
                    result = asyncio.run_coroutine_threadsafe(action(d),loop).result(timeout=config['navigation_timeout_ms']/1000+10)
                    self.reply(200,result)
                except Exception: self.reply(500,{'error':'Commande interrompue.'})
        try:
            server = ThreadingHTTPServer((HOST, PORT), Handler)
        except OSError as exc:
            import errno
            if exc.errno not in (errno.EADDRINUSE, 10048) or parent_port is not None or not config['auto_port']:
                raise
            server = ThreadingHTTPServer((HOST, 0), Handler)
            print(f'Port {PORT} occupé : sélection automatique.', flush=True)
        PORT = server.server_port
        ORIGIN = f'http://{HOST}:{PORT}'
        if config['homepage'] != 'about:blank':
            try: await page.goto(config['homepage'], wait_until='commit')
            except Exception: print('Page d’accueil indisponible.', flush=True)
        print('Nav Unit : '+ORIGIN, flush=True)
        worker = threading.Thread(target=server.serve_forever,daemon=True)
        worker.start()
        if parent_port is not None:
            Path(os.environ["NAV_UNIT_READY_FILE"]).touch()
        elif config['open_browser']:
            await asyncio.to_thread(webbrowser.open, ORIGIN)
        task = asyncio.create_task(frames())
        stopped = asyncio.Event()
        if os.name == "posix":
            loop.add_signal_handler(signal.SIGTERM, stopped.set)
        try:
            await stopped.wait()
        finally:
            task.cancel()
            await asyncio.gather(task,return_exceptions=True)
            await asyncio.to_thread(server.shutdown)
            server.server_close()
            await context.close()
            await browser.close()

def main():
    try: asyncio.run(run())
    except KeyboardInterrupt: pass

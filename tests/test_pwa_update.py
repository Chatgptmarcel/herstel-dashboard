import mimetypes
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


PROJECTMAP = Path(__file__).resolve().parents[1]


class AppHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        pad = self.path.split("?", 1)[0]
        if pad in {"/", "/index.html"}:
            marker = self.server.app_build
            html = f"""<!doctype html>
<html lang="nl"><head>
<meta charset="utf-8">
<meta name="test-build" content="{marker}">
<script>
window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
</script>
</head><body>{marker}</body></html>"""
            self._stuur(
                html.encode("utf-8"),
                "text/html; charset=utf-8",
                "public, max-age=3600",
            )
            return

        bestand = PROJECTMAP / pad.lstrip("/")
        if bestand.is_file():
            inhoud = bestand.read_bytes()
            content_type = mimetypes.guess_type(bestand.name)[0] or "application/octet-stream"
            cache = "no-cache" if bestand.name == "sw.js" else "public, max-age=3600"
            self._stuur(inhoud, content_type, cache)
            return

        self.send_error(404)

    def _stuur(self, inhoud, content_type, cache_control):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(inhoud)))
        self.send_header("Cache-Control", cache_control)
        self.end_headers()
        self.wfile.write(inhoud)

    def log_message(self, formaat, *args):
        return


class PwaUpdateTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), AppHandler)
        cls.server.app_build = "oude-versie"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def test_nieuwe_appstart_omzeilt_een_nog_geldige_oude_http_cache(self):
        """Een nieuwe PWA-start moet online wijzigingen direct ophalen."""
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(service_workers="allow")

            eerste = context.new_page()
            eerste.goto(self.url, wait_until="load", timeout=60_000)
            eerste.evaluate("navigator.serviceWorker.ready.then(() => true)")
            eerste.wait_for_function("navigator.serviceWorker.controller !== null")
            self.assertEqual(
                eerste.locator('meta[name="test-build"]').get_attribute("content"),
                "oude-versie",
            )

            self.server.app_build = "nieuwe-versie"
            eerste.close()

            herstart = context.new_page()
            herstart.goto(self.url, wait_until="domcontentloaded", timeout=60_000)
            zichtbaar = herstart.locator('meta[name="test-build"]').get_attribute("content")

            context.close()
            browser.close()

        self.assertEqual(zichtbaar, "nieuwe-versie")


if __name__ == "__main__":
    unittest.main()

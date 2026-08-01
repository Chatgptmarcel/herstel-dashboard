import json
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


PROJECTMAP = Path(__file__).resolve().parents[1]


class StilleHandler(SimpleHTTPRequestHandler):
    def log_message(self, formaat, *args):
        return


class MobieleKalenderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = partial(StilleHandler, directory=str(PROJECTMAP))
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}/"

        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=5)

    def setUp(self):
        self.context = self.browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=3,
            is_mobile=True,
            has_touch=True,
            locale="nl-NL",
            timezone_id="Europe/Amsterdam",
        )
        self.context.route("https://identitytoolkit.googleapis.com/**", lambda route: route.abort())
        self.context.route("https://firestore.googleapis.com/**", lambda route: route.abort())

        vakantie = {
            "2026-08-06": [
                {
                    "id": 6001,
                    "summary": "Vakantie",
                    "isManual": True,
                    "isNote": True,
                    "isVakantie": True,
                }
            ]
        }
        vaste_tijd = "2026-08-01T12:00:00+02:00"
        self.context.add_init_script(
            f"""
            (() => {{
                const EchteDatum = Date;
                const vastTijdstip = new EchteDatum({json.dumps(vaste_tijd)}).getTime();
                class VasteDatum extends EchteDatum {{
                    constructor(...args) {{
                        super(...(args.length ? args : [vastTijdstip]));
                    }}
                    static now() {{ return vastTijdstip; }}
                }}
                VasteDatum.parse = EchteDatum.parse;
                VasteDatum.UTC = EchteDatum.UTC;
                window.Date = VasteDatum;
                localStorage.setItem('dashboard_manual_shifts', {json.dumps(json.dumps(vakantie))});
            }})();
            """
        )

        self.page = self.context.new_page()
        self.page.goto(self.url, wait_until="domcontentloaded", timeout=60_000)
        self.page.wait_for_selector(".dagen-grid > div", timeout=30_000)

    def tearDown(self):
        self.context.close()

    def _dagcel(self, dagnummer):
        cellen = self.page.locator(".dagen-grid > div")
        for index in range(cellen.count()):
            cel = cellen.nth(index)
            regels = [regel.strip() for regel in cel.inner_text().splitlines() if regel.strip()]
            if regels and regels[0] == str(dagnummer):
                return cel
        self.fail(f"Dag {dagnummer} niet gevonden in de kalender")

    def test_zwemtijd_is_in_het_vrije_vak_benoemd_en_blauw(self):
        dag_zes = self._dagcel(6)
        self.assertIn("Vakantie", dag_zes.inner_text())
        zwemlabel = dag_zes.get_by_text("Zwem 10u", exact=True)
        self.assertEqual(zwemlabel.count(), 1)
        self.assertEqual(
            zwemlabel.evaluate("element => getComputedStyle(element).backgroundColor"),
            "rgb(186, 230, 253)",
        )
        self.assertLessEqual(
            zwemlabel.evaluate("element => element.scrollWidth"),
            zwemlabel.evaluate("element => element.clientWidth"),
        )

    def test_filter_zwemtijden_verbergt_het_blauwe_zwemlabel(self):
        self.assertEqual(self._dagcel(6).get_by_text("Zwem 10u", exact=True).count(), 1)
        self.page.locator('button:has-text("Filters")').click()
        self.page.get_by_text("Zwemtijden", exact=True).click()
        self.assertEqual(self._dagcel(6).get_by_text("Zwem 10u", exact=True).count(), 0)

    def test_werktijd_staat_op_een_regel(self):
        werktijd = self._dagcel(3).get_by_text("04:45–12:45", exact=True)
        self.assertEqual(werktijd.count(), 1)
        self.assertLessEqual(
            werktijd.evaluate("element => element.scrollWidth"),
            werktijd.evaluate("element => element.clientWidth"),
        )

    def test_blauwe_achtergrond_verhuist_naar_de_aangetikte_dag(self):
        dag_een = self._dagcel(1)
        dag_zes = self._dagcel(6)
        blauw = dag_een.evaluate("element => getComputedStyle(element).backgroundImage")

        dag_zes.click()
        self.page.wait_for_timeout(100)
        self.assertIn("dag-geselecteerd", dag_zes.get_attribute("class"))

        kleur_een = dag_een.evaluate("element => getComputedStyle(element).backgroundImage")
        kleur_zes = dag_zes.evaluate("element => getComputedStyle(element).backgroundImage")
        self.assertEqual(kleur_zes, blauw)
        self.assertNotEqual(kleur_een, blauw)

    def test_legenda_benoemt_blauw_als_geselecteerde_dag(self):
        self.assertEqual(self.page.get_by_text("Geselecteerd", exact=True).count(), 1)


if __name__ == "__main__":
    unittest.main()

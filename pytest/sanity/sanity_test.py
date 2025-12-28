import requests
from bs4 import BeautifulSoup

BASE_URL = "https://judicialsolutions.in"

PAGES = [
    "/",
    "/civil-cases.html",
    "/criminal-defense.html",
    "/family-disputes.html",
    "/corporate-law.html",
]

HEADERS = {"User-Agent": "SanityTest/1.0"}

def test_homepage_loads():
    r = fetch("/")
    assert r.status_code == 200

def fetch(path):
    return requests.get(f"{BASE_URL}{path}", headers=HEADERS, timeout=10)


def test_js_and_css_linked():
    soup = BeautifulSoup(fetch("/").text, "html.parser")

    scripts = [s.get("src") for s in soup.find_all("script") if s.get("src")]
    styles = [l.get("href") for l in soup.find_all("link") if l.get("href")]

    assert any(s.endswith(".js") for s in scripts)
    assert any(c.endswith(".css") for c in styles)
    assert any("CSS/style.css" in c for c in styles)


def test_contact_form_exists():
    soup = BeautifulSoup(fetch("/").text, "html.parser")
    form = soup.find("form")
    assert form is not None


def test_navigation_links_not_broken():
    soup = BeautifulSoup(fetch("/").text, "html.parser")
    links = [a.get("href") for a in soup.find_all("a") if a.get("href")]

    for link in links:
        if (
            link.startswith("#")
            or link.startswith("javascript")
            or link.startswith("tel:")
            or link.startswith("mailto:")
            or link.startswith("http")
        ):
            continue

        path = link if link.startswith("/") else f"/{link}"
        r = fetch(path)
        assert r.status_code in (200, 301, 302), path

def test_robots_txt_exists():
    r = requests.get(f"{BASE_URL}/robots.txt", timeout=10)
    assert r.status_code in (200, 404)  # 404 acceptable if not used

def test_404_page():
    r = requests.get(f"{BASE_URL}/non-existing-page-xyz", timeout=10)
    assert r.status_code in (404, 403)

def test_html_lang_attribute():
    soup = BeautifulSoup(fetch("/").text, "html.parser")
    html = soup.find("html")
    assert html and html.get("lang")

def test_meta_viewport_present():
    soup = BeautifulSoup(fetch("/").text, "html.parser")
    meta = soup.find("meta", {"name": "viewport"})
    assert meta is not None

def test_no_js_error_keywords():
    r = fetch("/")
    for word in ["ReferenceError", "TypeError", "undefined is not"]:
        assert word not in r.text

def test_admin_login_page():
    r = fetch("/admin-login.html")
    assert r.status_code == 200

def test_blog_page_if_exists():
    r = fetch("/blog.html")
    assert r.status_code in (200, 404)

def test_tel_link_format():
    soup = BeautifulSoup(fetch("/").text, "html.parser")
    tel = soup.find("a", href=lambda x: x and x.startswith("tel:"))
    assert tel is not None

def test_contact_form_method():
    soup = BeautifulSoup(fetch("/").text, "html.parser")
    form = soup.find("form", {"id": "contactForm"})
    assert form.get("method") in (None, "post", "POST")

def test_no_http_links_on_https():
    soup = BeautifulSoup(fetch("/").text, "html.parser")
    for tag in soup.find_all(["script", "link", "img"]):
        src = tag.get("src") or tag.get("href")
        if src:
            assert not src.startswith("http://")




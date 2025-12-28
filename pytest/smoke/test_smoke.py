import requests

BASE_URL = "https://judicialsolutions.in"

def test_homepage_up():
    r = requests.get(BASE_URL, timeout=10)
    assert r.status_code == 200

def test_core_pages_up():
    pages = [
        "/",
        "/civil-cases.html",
        "/criminal-defense.html",
        "/family-disputes.html",
        "/corporate-law.html",
    ]
    for page in pages:
        r = requests.get(f"{BASE_URL}{page}", timeout=10)
        assert r.status_code == 200

def test_branding_visible():
    r = requests.get(BASE_URL, timeout=10)
    assert "Judicial Solutions" in r.text


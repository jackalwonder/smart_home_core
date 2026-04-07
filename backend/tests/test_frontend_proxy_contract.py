from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_browser_bundle_no_longer_references_vite_api_key() -> None:
    store_source = (REPO_ROOT / "frontend/src/stores/smartHome.js").read_text(encoding="utf-8")

    assert "VITE_API_KEY" not in store_source
    assert "X-API-Key" not in store_source
    assert "searchParams.set('token'" not in store_source


def test_nginx_template_injects_control_key_for_api_and_websocket() -> None:
    template_source = (REPO_ROOT / "frontend/nginx.conf.template").read_text(encoding="utf-8")

    assert 'proxy_set_header X-API-Key "${APP_CONTROL_API_KEY}";' in template_source
    assert "location /api/" in template_source
    assert "location /ws/" in template_source
    assert "location /media/" in template_source

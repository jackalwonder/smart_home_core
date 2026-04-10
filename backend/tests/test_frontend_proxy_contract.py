from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_browser_bundle_no_longer_references_vite_api_key() -> None:
    store_source = (REPO_ROOT / "frontend/src/stores/smartHome.js").read_text(encoding="utf-8")

    assert "VITE_API_KEY" not in store_source
    assert "X-API-Key" not in store_source
    assert "searchParams.set('token'" not in store_source


def test_nginx_template_injects_read_key_for_api_and_websocket() -> None:
    template_source = (REPO_ROOT / "frontend/nginx.conf.template").read_text(encoding="utf-8")

    assert 'proxy_set_header X-API-Key "${APP_READ_API_KEY}";' in template_source
    assert 'proxy_set_header X-API-Key "${APP_CONTROL_API_KEY}";' not in template_source
    assert "location /api/" in template_source
    assert "location /ws/" in template_source
    assert "location /media/" in template_source


def test_server_compose_passes_read_key_to_frontend_proxy() -> None:
    compose_source = (REPO_ROOT / "docker-compose.server.yml").read_text(encoding="utf-8")
    frontend_section = compose_source.split("  frontend:\n", 1)[1]

    assert "APP_READ_API_KEY: ${APP_READ_API_KEY:-}" in frontend_section
    assert "APP_CONTROL_API_KEY: ${APP_CONTROL_API_KEY:-}" not in frontend_section


def test_local_compose_publishes_backend_port_for_direct_access() -> None:
    compose_source = (REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert '      - "8000:8000"' in compose_source
    assert "    expose:" not in compose_source


def test_env_example_documents_required_runtime_configuration() -> None:
    env_example = (REPO_ROOT / ".env.example").read_text(encoding="utf-8")

    for key in (
        "ALLOWED_ORIGINS",
        "APP_AUTH_COOKIE_SECRET",
        "APP_FLOOR_PLAN_ANALYSIS_PROVIDER",
        "APP_FLOOR_PLAN_VISION_MODEL",
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
    ):
        assert f"{key}=" in env_example

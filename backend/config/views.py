"""The few plain Django views. Everything else is either the API or the SPA."""

from django.conf import settings
from django.http import Http404, HttpResponse, JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie

_DEV_PLACEHOLDER = """<!doctype html>
<meta charset="utf-8">
<title>The Runbook</title>
<body style="font-family: system-ui; margin: 3rem auto; max-width: 40rem; line-height: 1.5">
<h1>The Runbook</h1>
<p>The frontend has not been built into <code>{dist}</code> yet.</p>
<p>Run <code>npm run build</code> in <code>frontend/</code>, or use the Vite dev
server on port 5173, which proxies <code>/api</code> here.</p>
</body>
"""


def spa_index(request, *args, **kwargs):
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        return HttpResponse(
            _DEV_PLACEHOLDER.format(dist=settings.FRONTEND_DIST), status=200,
            content_type="text/html; charset=utf-8",
        )
    response = HttpResponse(index.read_bytes(), content_type="text/html; charset=utf-8")
    # index.html names hashed assets, so it must never be cached itself.
    response["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


# Small files that live at the root of the built frontend. The host's static
# mappings cover /assets/ and /content/; these few are served here so a fresh
# deploy is correct even before the mappings exist.
ROOT_FILES = {
    "favicon.svg": "image/svg+xml",
    "robots.txt": "text/plain; charset=utf-8",
    "manifest.webmanifest": "application/manifest+json",
}


def dist_file(request, filename: str):
    if filename not in ROOT_FILES:
        raise Http404(filename)
    path = settings.FRONTEND_DIST / filename
    if not path.exists():
        raise Http404(filename)
    response = HttpResponse(path.read_bytes(), content_type=ROOT_FILES[filename])
    response["Cache-Control"] = "public, max-age=3600"
    return response


def legal_page(request, page: str):
    source = settings.CONTENT_DIR / "legal" / f"{page}.md"
    if not source.exists():
        raise Http404(page)
    return HttpResponse(source.read_text(encoding="utf-8"), content_type="text/plain; charset=utf-8")


@ensure_csrf_cookie
def csrf_view(request):
    """Hand the SPA a CSRF cookie before it posts anything."""
    return JsonResponse({"ok": True})

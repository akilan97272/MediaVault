import os
import re
import json
import shutil
import contextlib
import random
import threading
import aiofiles
import hashlib
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Form, File, UploadFile, HTTPException
from pydantic import BaseModel
from fastapi.params import Query
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import Signer
from passlib.context import CryptContext
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv
from datetime import datetime, timedelta

from workerFiles.file_renamer_scheduler import start_scheduler, stop_scheduler, get_scheduler_status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-unsafe-default-key")

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MEDIA_DIR  = os.path.join(BASE_DIR, "media")
USERS_FILE = os.path.join(BASE_DIR, "users.json")
ACTIVITY_LOG_FILE = os.path.join(BASE_DIR, "activity_log.json")
SHARED_DIR = os.path.join(MEDIA_DIR, "shared")

_MEDIA_ABS  = os.path.abspath(MEDIA_DIR)
_SHARED_ABS = os.path.abspath(SHARED_DIR)

os.makedirs(SHARED_DIR, exist_ok=True)

# ── Security ──────────────────────────────────────────────────────────────────

signer = Signer(SECRET_KEY)

# rounds=10: ~4× faster on low-end hardware, still >100 ms per hash
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)

# ── Module-level constants ────────────────────────────────────────────────────

_ALLOWED_MIME: frozenset = frozenset({
    "image/jpeg", "image/png", "image/gif",
    "video/mp4",  "video/webm",
    "application/octet-stream", "binary/octet-stream", "",
})
_ALLOWED_EXT: tuple = (".jpg", ".jpeg", ".png", ".gif", ".mp4", ".webm", ".mkv")
_IMAGE_EXT_RE = re.compile(r'\.(jpg|jpeg|png|gif|webp)$', re.IGNORECASE)

_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_\-]{3,30}$')

_NO_CACHE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma":        "no-cache",
    "Expires":       "0",
}

_CHUNK = 256 * 1024
DIST_DIR     = os.path.join(BASE_DIR, "dist")
_index_html: str | None = None

def _load_html_template() -> str:
    with open(os.path.join(DIST_DIR, "index.html"), encoding="utf-8") as f:
        return f.read()
# ── User store ────────────────────────────────────────────────────────────────

_users_cache: dict | None = None
_users_lock  = threading.Lock()


def load_users() -> dict:
    global _users_cache
    if _users_cache is not None:
        return _users_cache
    with _users_lock:
        if _users_cache is None:
            _users_cache = _read_users()
    return _users_cache


def _read_users() -> dict:
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE) as f:
            return json.load(f)
    users = {"admin": pwd_context.hash("admin123")}
    _write_users(users)
    _ensure_user_folder("admin")
    return users


def save_users(users: dict) -> None:
    global _users_cache
    with _users_lock:
        _write_users(users)
        _users_cache = users


def _write_users(users: dict) -> None:
    tmp = USERS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(users, f, separators=(',', ':'))
    os.replace(tmp, USERS_FILE)


def _ensure_user_folder(username: str) -> None:
    if username != "admin":
        os.makedirs(os.path.join(MEDIA_DIR, username), exist_ok=True)


# ── Restrictions ──────────────────────────────────────────────────────────────

RESTRICTIONS_FILE = os.path.join(BASE_DIR, "restrictions.json")
_DAY_NAMES        = ("Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")

_restr_cache: dict | None = None
_restr_lock  = threading.Lock()


def load_restrictions() -> dict:
    global _restr_cache
    if _restr_cache is not None:
        return _restr_cache
    with _restr_lock:
        if _restr_cache is None:
            _restr_cache = json.load(open(RESTRICTIONS_FILE)) \
                           if os.path.exists(RESTRICTIONS_FILE) else {}
    return _restr_cache


def save_restrictions(r: dict) -> None:
    global _restr_cache
    with _restr_lock:
        tmp = RESTRICTIONS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(r, f, separators=(',', ':'))
        os.replace(tmp, RESTRICTIONS_FILE)
        _restr_cache = r


def is_allowed_today(username: str) -> bool:
    if username == "admin":
        return True
    cfg = load_restrictions().get(username)
    if not cfg or not cfg.get("enabled", False):
        return True
    return datetime.now().weekday() in cfg.get("allowed_days", [])


# ── Activity Log ──────────────────────────────────────────────────────────────

_activity_lock = threading.Lock()


def log_login(username: str, user_agent: str, ip_address: str, success: bool = True) -> None:
    with _activity_lock:
        activities = []
        if os.path.exists(ACTIVITY_LOG_FILE):
            try:
                with open(ACTIVITY_LOG_FILE) as f:
                    activities = json.load(f)
            except (json.JSONDecodeError, IOError):
                activities = []

        activity = {
            "timestamp":   datetime.now().isoformat(),
            "username":    username,
            "ip_address":  ip_address,
            "user_agent":  user_agent,
            "device_info": parse_user_agent(user_agent),
            "success":     success,
        }

        activities.insert(0, activity)
        if len(activities) > 500:
            activities = activities[:500]

        tmp = ACTIVITY_LOG_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(activities, f, separators=(',', ':'))
        os.replace(tmp, ACTIVITY_LOG_FILE)


def parse_user_agent(user_agent: str) -> dict:
    ua = user_agent.lower()

    if "windows" in ua:
        os_name = "Windows"
    elif "mac" in ua or "darwin" in ua:
        os_name = "macOS"
    elif "android" in ua:
        os_name = "Android"
    elif "iphone" in ua or "ipad" in ua:
        os_name = "iOS"
    elif "linux" in ua:
        os_name = "Linux"
    else:
        os_name = "Unknown"

    if "edg" in ua:
        browser = "Edge"
    elif "chrome" in ua:
        browser = "Chrome"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "safari" in ua:
        browser = "Safari"
    elif "opera" in ua or "opr" in ua:
        browser = "Opera"
    else:
        browser = "Unknown"

    if "mobile" in ua or "android" in ua or "iphone" in ua:
        device_type = "Mobile"
    elif "tablet" in ua or "ipad" in ua:
        device_type = "Tablet"
    else:
        device_type = "Desktop"

    return {"browser": browser, "os": os_name, "device_type": device_type}


def get_activity_log() -> list:
    if os.path.exists(ACTIVITY_LOG_FILE):
        try:
            with open(ACTIVITY_LOG_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return []


def load_activity() -> list:
    result = []
    for e in get_activity_log():
        di  = e.get("device_info") or {}
        raw = e.get("timestamp", "")
        result.append({
            "ts":     raw[:10] + " " + raw[11:19] if len(raw) >= 19 else raw,
            "user":   e.get("username", ""),
            "ip":     e.get("ip_address", "—"),
            "device": f"{di.get('browser','?')} · {di.get('os','?')} · {di.get('device_type','?')}",
            "action": "login" if e.get("success", True) else "failed",
        })
    return result

# ── Albums ────────────────────────────────────────────────────────────────────
# Cross-folder photo groupings — an album just holds a list of media-relative
# paths, the underlying files never move. Private per-owner (admin can see/
# manage all of them for moderation purposes).

ALBUMS_FILE = os.path.join(BASE_DIR, "albums.json")
_albums_cache: dict | None = None
_albums_lock  = threading.Lock()


def load_albums() -> dict:
    global _albums_cache
    if _albums_cache is not None:
        return _albums_cache
    with _albums_lock:
        if _albums_cache is None:
            _albums_cache = json.load(open(ALBUMS_FILE)) if os.path.exists(ALBUMS_FILE) else {}
    return _albums_cache


def save_albums(a: dict) -> None:
    global _albums_cache
    with _albums_lock:
        tmp = ALBUMS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(a, f, separators=(',', ':'))
        os.replace(tmp, ALBUMS_FILE)
        _albums_cache = a


# ── Favorites ─────────────────────────────────────────────────────────────────
# { "<username>": ["rel/path1", "rel/path2", ...] }

FAVORITES_FILE = os.path.join(BASE_DIR, "favorites.json")
_favorites_cache: dict | None = None
_favorites_lock  = threading.Lock()


def load_favorites() -> dict:
    global _favorites_cache
    if _favorites_cache is not None:
        return _favorites_cache
    with _favorites_lock:
        if _favorites_cache is None:
            _favorites_cache = json.load(open(FAVORITES_FILE)) if os.path.exists(FAVORITES_FILE) else {}
    return _favorites_cache


def save_favorites(fdict: dict) -> None:
    global _favorites_cache
    with _favorites_lock:
        tmp = FAVORITES_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(fdict, f, separators=(',', ':'))
        os.replace(tmp, FAVORITES_FILE)
        _favorites_cache = fdict


# ── File hashes (duplicate detection) ─────────────────────────────────────────
# { "by_hash": { md5hex: [rel_paths...] }, "by_path": { rel_path: md5hex } }
# Content hash is computed while streaming an upload to disk (no second read
# pass needed). Purely informational — a detected duplicate never blocks an
# upload, it's just surfaced back to the user.

HASHES_FILE = os.path.join(BASE_DIR, "file_hashes.json")
_hashes_cache: dict | None = None
_hashes_lock  = threading.Lock()


def load_hashes() -> dict:
    global _hashes_cache
    if _hashes_cache is not None:
        return _hashes_cache
    with _hashes_lock:
        if _hashes_cache is None:
            if os.path.exists(HASHES_FILE):
                _hashes_cache = json.load(open(HASHES_FILE))
            else:
                _hashes_cache = {"by_hash": {}, "by_path": {}}
    return _hashes_cache


def save_hashes(h: dict) -> None:
    global _hashes_cache
    with _hashes_lock:
        tmp = HASHES_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(h, f, separators=(',', ':'))
        os.replace(tmp, HASHES_FILE)
        _hashes_cache = h


def _record_file_hash(rel_path: str, file_hash: str) -> list[str]:
    """Store this file's hash; return any OTHER paths that already carried
    the same hash (i.e. likely duplicates), captured before this file joins
    the index itself so it never flags against its own entry."""
    h = load_hashes()
    existing = list(h["by_hash"].get(file_hash, []))
    h["by_hash"].setdefault(file_hash, [])
    if rel_path not in h["by_hash"][file_hash]:
        h["by_hash"][file_hash].append(rel_path)
    h["by_path"][rel_path] = file_hash
    save_hashes(h)
    return existing


def _remove_file_hash(rel_path: str) -> None:
    h = load_hashes()
    file_hash = h["by_path"].pop(rel_path, None)
    if file_hash and file_hash in h["by_hash"]:
        h["by_hash"][file_hash] = [p for p in h["by_hash"][file_hash] if p != rel_path]
        if not h["by_hash"][file_hash]:
            del h["by_hash"][file_hash]
    save_hashes(h)


def _rename_file_hash(old_rel: str, new_rel: str) -> None:
    """Used on move — same content, new path."""
    h = load_hashes()
    file_hash = h["by_path"].pop(old_rel, None)
    if file_hash:
        h["by_path"][new_rel] = file_hash
        if file_hash in h["by_hash"]:
            h["by_hash"][file_hash] = [new_rel if p == old_rel else p for p in h["by_hash"][file_hash]]
    save_hashes(h)


def _remove_path_everywhere(rel_path: str) -> None:
    """rel_path may be a single file OR a folder prefix (from a folder
    delete) — strip it out of every album and every user's favorites so
    deleted photos don't linger as broken references."""
    def _gone(p: str) -> bool:
        return p == rel_path or p.startswith(rel_path + "/")

    albums  = load_albums()
    changed = False
    for a in albums.values():
        before = len(a.get("photos", []))
        a["photos"] = [p for p in a.get("photos", []) if not _gone(p)]
        if len(a["photos"]) != before:
            changed = True
        if a.get("cover") and _gone(a["cover"]):
            a["cover"] = None
            changed = True
    if changed:
        save_albums(albums)

    favs_all = load_favorites()
    changed  = False
    for user, favs in favs_all.items():
        before = len(favs)
        favs_all[user] = [e for e in favs if not _gone(_fav_path(e))]
        if len(favs_all[user]) != before:
            changed = True
    if changed:
        save_favorites(favs_all)


def _rename_path_everywhere(old_rel: str, new_rel: str) -> None:
    """Keeps album/favorite references pointing at the right place after a
    move — works for both single-file and whole-folder moves via prefix
    rewriting."""
    def _renamed(p: str) -> str | None:
        if p == old_rel:
            return new_rel
        if p.startswith(old_rel + "/"):
            return new_rel + p[len(old_rel):]
        return None

    albums  = load_albums()
    changed = False
    for a in albums.values():
        new_list = []
        for p in a.get("photos", []):
            r = _renamed(p)
            if r is not None:
                new_list.append(r); changed = True
            else:
                new_list.append(p)
        a["photos"] = new_list
        if a.get("cover"):
            r = _renamed(a["cover"])
            if r is not None:
                a["cover"] = r; changed = True
    if changed:
        save_albums(albums)

    favs_all = load_favorites()
    changed  = False
    for user, favs in favs_all.items():
        new_list = []
        for e in favs:
            p = _fav_path(e)
            r = _renamed(p)
            if r is not None:
                changed = True
                if isinstance(e, str):
                    new_list.append(r)
                else:
                    new_list.append({**e, "path": r})
            else:
                new_list.append(e)
        favs_all[user] = new_list
    if changed:
        save_favorites(favs_all)


import json, threading

_INDEX_PATH = os.path.join(os.path.dirname(__file__), "media_index.json")
_index_lock = threading.Lock()

_index_cache: dict | None = None

def _load_media_index() -> dict:
    """{ "username/folder/sub": ["username/folder/sub/fname_001.jpg", ...] }
    Cached in memory after first read — callers must hold _index_lock while
    calling this if they intend to mutate + save the result, same as before."""
    global _index_cache
    if _index_cache is not None:
        return _index_cache
    try:
        with open(_INDEX_PATH, "r") as f:
            _index_cache = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        _index_cache = {}
    return _index_cache

def _save_index(idx: dict):
    global _index_cache
    with open(_INDEX_PATH, "w") as f:
        json.dump(idx, f, indent=2)
    _index_cache = idx

def _next_counter(target_dir: str, folder_name: str) -> int:
    """Find next available counter by scanning existing files in that dir."""
    pattern = re.compile(rf"^{re.escape(folder_name)}_(\d+)\.", re.IGNORECASE)
    max_n = 0
    if os.path.isdir(target_dir):
        for fn in os.listdir(target_dir):
            m = pattern.match(fn)
            if m:
                max_n = max(max_n, int(m.group(1)))
    return max_n + 1

def _add_to_index(rel_path: str):
    """Add a file's relative path (from MEDIA_DIR) to the index."""
    folder_key = "/".join(rel_path.split("/")[:-1])  # everything except filename
    with _index_lock:
        idx = _load_media_index()
        idx.setdefault(folder_key, [])
        if rel_path not in idx[folder_key]:
            idx[folder_key].append(rel_path)
        _save_index(idx)

def _remove_from_index(rel_path: str):
    """Remove a file or all entries under a folder prefix from the index."""
    with _index_lock:
        idx = _load_media_index()
        # Remove exact file match
        for key in list(idx.keys()):
            idx[key] = [p for p in idx[key] if not p.startswith(rel_path)]
            if not idx[key]:
                del idx[key]
        _save_index(idx)


def _bootstrap_index():
    """Scan MEDIA_DIR and index any files not already in the index."""
    if not os.path.isdir(MEDIA_DIR):
        return
    IMAGE_EXT = re.compile(r'\.(jpg|jpeg|png|gif|webp|mp4|webm|mkv)$', re.IGNORECASE)
    with _index_lock:
        idx = _load_media_index()
        changed = False
        for root, _, fnames in os.walk(MEDIA_DIR):
            for fn in fnames:
                if not IMAGE_EXT.search(fn):
                    continue
                abs_path = os.path.join(root, fn)
                rel      = os.path.relpath(abs_path, MEDIA_DIR).replace(os.sep, "/")
                key      = "/".join(rel.split("/")[:-1])
                idx.setdefault(key, [])
                if rel not in idx[key]:
                    idx[key].append(rel)
                    changed = True
        if changed:
            _save_index(idx)

# ── App bootstrap ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_users()
    load_restrictions()
    global _index_html
    try:
        _index_html = _load_html_template()
    except FileNotFoundError:
        pass  # dev mode — Vite serves the frontend directly
    start_scheduler()
    # Build index for any existing files not yet indexed
    _bootstrap_index()
    yield
    stop_scheduler()

app = FastAPI(
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

class LargeUploadMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request._body_size_limit = 500 * 1024 * 1024  # 500 MB
        return await call_next(request)

app.add_middleware(LargeUploadMiddleware)

class CachedStaticFiles(StaticFiles):
    """Same as StaticFiles, but tells the browser it can cache the response
    for a long time instead of revalidating on every single load. Safe here
    because /assets filenames are content-hashed by the Vite build (a new
    build = new filename = automatic cache-bust), and /backgrounds only
    holds a handful of theme wallpapers that essentially never change."""
    def file_response(self, *args, **kwargs):
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return resp

app.mount("/media",  StaticFiles(directory=MEDIA_DIR), name="media")
# app.mount("/static", StaticFiles(directory="static"),  name="static")
if os.path.isdir(os.path.join(DIST_DIR, "assets")):
    app.mount("/assets", CachedStaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")
if os.path.isdir(os.path.join(DIST_DIR, "backgrounds")):
    app.mount("/backgrounds", CachedStaticFiles(directory=os.path.join(DIST_DIR, "backgrounds")), name="backgrounds")

# Compresses JSON/HTML/text responses (admin stats, folder tree, activity
# log, etc.) — cheap win for perceived speed, especially over a real network
# rather than localhost.
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handler ─────────────────────────────────────────────────────────

@app.exception_handler(StarletteHTTPException)
async def http_exc_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
        headers=_NO_CACHE,
    )


# ── Auth helpers ──────────────────────────────────────────────────────────────

def get_current_user(request: Request) -> str | None:
    cookie = request.cookies.get("session")
    if not cookie:
        return None
    try:
        return signer.unsign(cookie).decode()
    except Exception:
        return None


def day_restricted_response(username: str) -> JSONResponse | None:
    if is_allowed_today(username):
        return None
    day = _DAY_NAMES[datetime.now().weekday()]
    return JSONResponse(
        status_code=403,
        content={"error": "Access restricted", "day": day},
    )


# ── Access control ────────────────────────────────────────────────────────────

def can_access_path(username: str, path: str) -> bool:
    if username == "admin" or not path:
        return True
    top = path.split("/", 1)[0]
    if top in ("shared", username):
        return True
    # A bare filename (no "/", with a recognized media extension) sitting
    # directly in the true root of MEDIA_DIR has no folder-based owner at
    # all — any authenticated user may access it, same as "shared". This
    # can never be used to reach into someone else's top-level FOLDER,
    # since folder names never carry a media file extension.
    if "/" not in path and path.lower().endswith(_ALLOWED_EXT):
        return True
    return False


def visible_top_folders(username: str) -> frozenset | None:
    if username == "admin":
        return None
    return frozenset(("shared", username))


# ── Path security ─────────────────────────────────────────────────────────────

def secure_path(sub: str) -> str:
    target = os.path.abspath(os.path.join(MEDIA_DIR, sub.strip("/")))
    if not target.startswith(_MEDIA_ABS):
        raise HTTPException(status_code=400, detail="Invalid path")
    return target


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.get("/")
def login_page(request: Request):
    if get_current_user(request):
        return RedirectResponse("/gallery", status_code=302)
    return page("login")

@app.post("/login")
def login(request: Request, username: str = Form(...), password: str = Form(...)):
    users      = load_users()
    h          = users.get(username)
    client_ip  = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")

    if h and pwd_context.verify(password, h):
        if not is_allowed_today(username):
            log_login(username, user_agent, client_ip, success=False)
            day = _DAY_NAMES[datetime.now().weekday()]
            return RedirectResponse(f"/?error=day&day={day}", status_code=302)

        log_login(username, user_agent, client_ip, success=True)
        r = RedirectResponse("/admin" if username == "admin" else "/gallery", status_code=302)
        r.set_cookie("session", signer.sign(username).decode(),
                     httponly=True, samesite="lax", secure=False)
        return r

    log_login(username, user_agent, client_ip, success=False)
    return RedirectResponse("/?error=cred", status_code=302)


@app.post("/api/register")
async def register(username: str = Form(...), password: str = Form(...)):
    username = username.strip()
    if not _USERNAME_RE.match(username):
        return JSONResponse(status_code=400,
            content={"error": "Username must be 3–30 alphanumeric characters"})
    if len(password) < 4:
        return JSONResponse(status_code=400,
            content={"error": "Password must be at least 4 characters"})
    users = load_users()
    if username in users:
        return JSONResponse(status_code=409, content={"error": "Username already taken"})
    new = dict(users)
    new[username] = pwd_context.hash(password)
    save_users(new)
    _ensure_user_folder(username)
    return {"status": "created", "username": username}


@app.get("/logout")
def logout():
    r = RedirectResponse("/", status_code=302)
    r.delete_cookie("session")
    return r


# ── Page routes (routing only, no HTML) ──────────────────────────────────────

@app.get("/gallery")
def gallery_page(request: Request):
    user = get_current_user(request)
    if not user:
        return page("404", 404)
    if not is_allowed_today(user):
        day = _DAY_NAMES[datetime.now().weekday()]
        return RedirectResponse(f"/?error=day&day={day}", status_code=302)
    return page("gallery", user=user)   # <-- pass user


@app.get("/admin")
def admin_page(request: Request):
    user = get_current_user(request)
    if user != "admin":
        return page("404", 404)
    return page("admin", user=user)     # <-- pass user

# ── Admin helpers ─────────────────────────────────────────────────────────────

def _count_dir(path: str) -> tuple[int, int, float]:
    """Returns (file_count, total_size, most_recent_mtime)."""
    count = size = 0
    last_mtime = 0.0
    try:
        with os.scandir(path) as it:
            for e in it:
                if e.is_file(follow_symlinks=False):
                    if e.name.lower().endswith(_ALLOWED_EXT):
                        st = e.stat()
                        count += 1
                        size  += st.st_size
                        if st.st_mtime > last_mtime:
                            last_mtime = st.st_mtime
                elif e.is_dir(follow_symlinks=False):
                    c, s, m = _count_dir(e.path)
                    count += c
                    size  += s
                    if m > last_mtime:
                        last_mtime = m
    except OSError:
        pass
    return count, size, last_mtime


# ── Admin API ─────────────────────────────────────────────────────────────────

@app.get("/api/admin/stats")
def admin_stats(request: Request):
    if get_current_user(request) != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})

    users        = load_users()
    activity     = load_activity()
    today        = datetime.now().strftime("%Y-%m-%d")
    active_today = len({e["user"] for e in activity if e.get("ts", "").startswith(today)})

    user_stats: dict[str, dict] = {}
    total_files = total_size = 0

    try:
        with os.scandir(MEDIA_DIR) as it:
            for entry in it:
                if entry.is_dir(follow_symlinks=False):
                    c, s, m = _count_dir(entry.path)
                    user_stats[entry.name] = {
                        "files": c,
                        "size": s,
                        "last_upload": datetime.fromtimestamp(m).isoformat() if m else None,
                    }
                    total_files += c
                    total_size  += s
    except OSError:
        pass

    return {
        "total_users":     len(users),
        "active_today":    active_today,
        "total_files":     total_files,
        "total_size":      total_size,
        "user_stats":      user_stats,
        "recent_activity": activity[:15],
    }


@app.get("/api/admin/scheduler-status")
def get_scheduler_status_endpoint(request: Request):
    # if get_current_user(request) != "admin":
    #     return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return get_scheduler_status()


# ── User management (admin only) ──────────────────────────────────────────────

@app.get("/api/users")
def list_users(request: Request):
    if get_current_user(request) != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return {"users": list(load_users().keys())}


@app.post("/api/users")
async def create_user(request: Request,
                      username: str = Form(...), password: str = Form(...)):
    if get_current_user(request) != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    username = username.strip()
    if not _USERNAME_RE.match(username):
        return JSONResponse(status_code=400,
            content={"error": "Username must be 3–30 alphanumeric chars"})
    if not password:
        return JSONResponse(status_code=400, content={"error": "Password required"})
    users = load_users()
    if username in users:
        return JSONResponse(status_code=409, content={"error": "Username already exists"})
    new = dict(users)
    new[username] = pwd_context.hash(password)
    save_users(new)
    _ensure_user_folder(username)
    return {"status": "created", "username": username}


@app.delete("/api/users/{username}")
def delete_user(username: str, request: Request):
    if get_current_user(request) != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    if username == "admin":
        return JSONResponse(status_code=400, content={"error": "Cannot delete admin"})
    users = load_users()
    if username not in users:
        return JSONResponse(status_code=404, content={"error": "User not found"})
    new = dict(users)
    del new[username]
    save_users(new)
    return {"status": "deleted"}

# ── Password management ───────────────────────────────────────────────────────

@app.put("/api/users/{username}/password")
async def change_password_admin(username: str, request: Request):
    """Admin changes any user's password."""
    if get_current_user(request) != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    users = load_users()
    if username not in users:
        return JSONResponse(status_code=404, content={"error": "User not found"})
    try:
        body     = await request.json()
        new_pass = (body.get("password") or "").strip()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid body"})
    if len(new_pass) < 4:
        return JSONResponse(status_code=400, content={"error": "Password must be at least 4 characters"})
    new = dict(users)
    new[username] = pwd_context.hash(new_pass)
    save_users(new)
    return {"status": "updated", "username": username}


@app.put("/api/me/password")
async def change_own_password(request: Request):
    """Logged-in user changes their own password."""
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    try:
        body         = await request.json()
        current_pass = (body.get("current_password") or "").strip()
        new_pass     = (body.get("new_password")     or "").strip()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid body"})
    users = load_users()
    if not pwd_context.verify(current_pass, users[user]):
        return JSONResponse(status_code=401, content={"error": "Current password is incorrect"})
    if len(new_pass) < 4:
        return JSONResponse(status_code=400, content={"error": "New password must be at least 4 characters"})
    new = dict(users)
    new[user] = pwd_context.hash(new_pass)
    save_users(new)
    return {"status": "updated"}

# ── Activity Log API (admin only) ─────────────────────────────────────────────

@app.get("/api/activity-log")
def get_activity_log_endpoint(request: Request):
    if get_current_user(request) != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return {"activities": get_activity_log()}


# ── Restriction API (admin only) ──────────────────────────────────────────────

@app.get("/api/restrictions")
def get_restrictions(request: Request):
    if get_current_user(request) != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return {"restrictions": load_restrictions()}


@app.post("/api/restrictions/{username}")
async def set_restriction(username: str, request: Request):
    if get_current_user(request) != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    if username not in load_users():
        return JSONResponse(status_code=404, content={"error": "User not found"})
    try:
        body     = await request.json()
        enabled  = bool(body.get("enabled", False))
        raw_days = body.get("allowed_days", [])
        days     = [int(d) for d in raw_days if 0 <= int(d) <= 6]
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid body"})
    r = dict(load_restrictions())
    r[username] = {"enabled": enabled, "allowed_days": days}
    save_restrictions(r)
    return {"status": "updated", "username": username}


@app.delete("/api/restrictions/{username}")
def delete_restriction(username: str, request: Request):
    if get_current_user(request) != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    r = dict(load_restrictions())
    r.pop(username, None)
    save_restrictions(r)
    return {"status": "removed"}


# ── Media API ─────────────────────────────────────────────────────────────────

@app.get("/api/media")
def list_media(request: Request, path: str = ""):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    day_restricted = not is_allowed_today(user)

    # If restricted AND they're trying to open a subfolder → block it
    if day_restricted and path:
        return JSONResponse(
            status_code=403,
            content={
                "error":    "restricted",
                "message":  "This area is off-limits for today. Please come back when the gates are open! 🔒",
            },
        )

    if not can_access_path(user, path):
        return JSONResponse(status_code=403, content={"error": "Access denied"})

    target = secure_path(path)
    if not os.path.isdir(target):
        return {"files": [], "folders": [], "current_path": path}

    allowed = visible_top_folders(user)

    try:
        with os.scandir(target) as it:
            entries = list(it)
    except OSError:
        return {"files": [], "folders": [], "current_path": path}

    entries.sort(key=lambda e: (not e.is_dir(follow_symlinks=False), -e.stat().st_mtime))

    files: list   = []
    folders: list = []
    for e in entries:
        if e.is_dir(follow_symlinks=False):
            if not path and allowed is not None and e.name not in allowed:
                continue
            folders.append(e.name)
        elif e.name.lower().endswith(_ALLOWED_EXT):
            # If restricted, only show files at root level (no path) — no files inside folders
            if not day_restricted:
                files.append(e.name)

    return {
        "files":        files,
        "folders":      folders,
        "current_path": path,
        "day_restricted": day_restricted,
    }


@app.get("/api/tree")
def get_folder_tree(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    # Tree is always visible even when restricted (sidebar still shows folders)
    allowed = visible_top_folders(user)
    day_restricted = not is_allowed_today(user)

    def build(directory: str, rel: str, depth: int) -> list:
        result = []
        try:
            with os.scandir(directory) as it:
                dirs = sorted(
                    (e for e in it if e.is_dir(follow_symlinks=False)),
                    key=lambda e: e.name,
                )
            for e in dirs:
                if depth == 0 and allowed is not None and e.name not in allowed:
                    continue
                child_rel = f"{rel}/{e.name}" if rel else e.name
                result.append({
                    "name":      e.name,
                    "path":      child_rel,
                    "children":  build(e.path, child_rel, depth + 1),
                    "is_shared": depth == 0 and e.name == "shared",
                })
        except OSError:
            pass
        return result

    return {"tree": build(MEDIA_DIR, "", 0), "day_restricted": day_restricted}

@app.post("/api/folder")
def create_folder(request: Request,
                  name: str = Form(...), path: str = Form("")):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    restricted = day_restricted_response(user)
    if restricted:
        return restricted
    if not can_access_path(user, path):
        return JSONResponse(status_code=403, content={"error": "Access denied"})

    base      = secure_path(path)
    safe_name = os.path.basename(name.strip())
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid folder name")
    try:
        os.makedirs(os.path.join(base, safe_name), exist_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"status": "created", "name": safe_name}


@app.post("/api/upload")
async def upload_media(request: Request,
                       path: str = Form(""), file: UploadFile = File(...)):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    restricted = day_restricted_response(user)
    if restricted:
        return restricted
    if not can_access_path(user, path):
        return JSONResponse(status_code=403, content={"error": "Access denied"})

    fname  = (file.filename or "").strip()
    flower = fname.lower()
    if not flower.endswith(_ALLOWED_EXT):
        mime = (file.content_type or "").split(";")[0].strip().lower()
        if mime not in _ALLOWED_MIME:
            return JSONResponse(status_code=400,
                content={"error": f"Unsupported file type: {file.content_type}"})

    target_dir = secure_path(path)
    if not os.path.isdir(target_dir):
        raise HTTPException(status_code=404, detail="Target folder does not exist")

    # ── Rename on upload ──────────────────────────────────────
    _, ext       = os.path.splitext(fname)
    folder_name  = os.path.basename(target_dir)   # e.g. "MagicW" or "subfolder"
    counter      = _next_counter(target_dir, folder_name)
    new_filename = f"{folder_name}_{counter:03d}{ext.lower()}"
    file_path    = os.path.join(target_dir, new_filename)

    # Avoid collision (race condition safety)
    while os.path.exists(file_path):
        counter += 1
        new_filename = f"{folder_name}_{counter:03d}{ext.lower()}"
        file_path    = os.path.join(target_dir, new_filename)

    # ── Write file (hashing as we go, for duplicate detection) ─
    file_hash = hashlib.md5()
    try:
        async with aiofiles.open(file_path, "wb") as buf:
            while True:
                chunk = await file.read(_CHUNK)
                if not chunk:
                    break
                file_hash.update(chunk)
                await buf.write(chunk)
    except Exception:
        with contextlib.suppress(OSError):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail="Failed to save file")

    # ── Update index ──────────────────────────────────────────
    rel = os.path.relpath(file_path, MEDIA_DIR).replace(os.sep, "/")
    _add_to_index(rel)

    # ── Duplicate detection (informational only) ───────────────
    dup_paths = _record_file_hash(rel, file_hash.hexdigest())
    dup_paths = [p for p in dup_paths if can_access_path(user, p)]

    return {
        "filename": new_filename,
        "status": "success",
        "duplicate_of": [f"/media/{p}" for p in dup_paths],
    }


@app.delete("/api/media")
def delete_media(request: Request, path: str = "", filename: str = ""):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    restricted = day_restricted_response(user)
    if restricted:
        return restricted

    full_sub = f"{path}/{filename}" if path else filename
    if not can_access_path(user, full_sub):
        return JSONResponse(status_code=403, content={"error": "Access denied"})

    target = secure_path(full_sub)
    if not os.path.exists(target):
        # Already gone — e.g. this was a subfolder/file inside a parent
        # folder that was deleted earlier in the same multi-select batch.
        # Treat it as successfully deleted rather than an error.
        return {"status": "deleted", "already_gone": True}
    if os.path.abspath(target) == _SHARED_ABS:
        raise HTTPException(status_code=403, detail="Cannot delete the shared folder")

    try:
        was_dir = os.path.isdir(target)
        shutil.rmtree(target) if was_dir else os.remove(target)
        # Remove from index
        rel = os.path.relpath(target, MEDIA_DIR).replace(os.sep, "/")
        _remove_from_index(rel)
        _remove_path_everywhere(rel)   # drop from albums/favorites too
        if not was_dir:
            _remove_file_hash(rel)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"status": "deleted"}

# ── Move file/folder ──────────────────────────────────────────────────────────

class MoveRequest(BaseModel):
    src_path:  str = ""
    filename:  str = ""
    dest_path: str = ""

@app.post("/api/move")
def move_media(body: MoveRequest, request: Request):
    """Move a file or folder to a different destination directory.

    Body (JSON):
        src_path  – current parent folder path   (e.g. "alice/trips")
        filename  – file or folder name          (e.g. "photo.jpg" or "beach")
        dest_path – target parent folder path    (e.g. "alice/archive")

    Plain `def` (not `async def`) on purpose: FastAPI runs synchronous route
    functions in a threadpool automatically, so the blocking shutil.move()
    and index read/write below don't stall the single asyncio event loop —
    previously this was `async def` doing blocking I/O directly on the loop,
    which froze every other concurrent request for the duration of the move.
    """
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    restricted = day_restricted_response(user)
    if restricted:
        return restricted

    src_path  = body.src_path.strip("/")
    filename  = body.filename.strip()
    dest_path = body.dest_path.strip("/")

    if not filename:
        return JSONResponse(status_code=400, content={"error": "filename is required"})

    # Reject path traversal in filename
    if "/" in filename or "\\" in filename or filename in (".", ".."):
        return JSONResponse(status_code=400, content={"error": "Invalid filename"})

    full_src = f"{src_path}/{filename}" if src_path else filename
    if not can_access_path(user, full_src):
        return JSONResponse(status_code=403, content={"error": "Access denied"})
    if not can_access_path(user, dest_path or filename):
        return JSONResponse(status_code=403, content={"error": "Access denied for destination"})

    src_abs  = secure_path(full_src)
    dest_abs = secure_path(dest_path) if dest_path else os.path.abspath(MEDIA_DIR)

    if not os.path.exists(src_abs):
        return JSONResponse(status_code=404, content={"error": "Source not found"})
    if not os.path.isdir(dest_abs):
        return JSONResponse(status_code=404, content={"error": "Destination folder not found"})

    dest_file = os.path.join(dest_abs, filename)
    if os.path.exists(dest_file):
        return JSONResponse(status_code=409,
            content={"error": f"'{filename}' already exists in destination"})

    try:
        was_dir = os.path.isdir(src_abs)
        shutil.move(src_abs, dest_file)
        # Update index: remove old path, add new path
        old_rel = os.path.relpath(src_abs,  MEDIA_DIR).replace(os.sep, "/")
        new_rel = os.path.relpath(dest_file, MEDIA_DIR).replace(os.sep, "/")
        _remove_from_index(old_rel)
        _add_to_index(new_rel)
        _rename_path_everywhere(old_rel, new_rel)   # albums/favorites follow the move
        if not was_dir:
            _rename_file_hash(old_rel, new_rel)
    except OSError as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return {"status": "moved", "filename": filename, "dest": dest_path}


# ── Albums API ─────────────────────────────────────────────────────────────────
# Cross-folder groupings — an album is just a named list of media-relative
# paths. Adding/removing a photo never touches the underlying file.

@app.get("/api/albums")
def list_albums(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    albums = load_albums()
    out = []
    for aid, a in albums.items():
        if a.get("owner") != user and user != "admin":
            continue
        photos = [p for p in a.get("photos", []) if can_access_path(user, p)]
        cover_path = a.get("cover")
        if cover_path and cover_path in photos:
            cover = f"/media/{cover_path}"
        elif photos:
            cover = f"/media/{photos[0]}"
        else:
            cover = None
        out.append({
            "id":      aid,
            "name":    a.get("name", ""),
            "count":   len(photos),
            "cover":   cover,
            "created": a.get("created"),
        })
    out.sort(key=lambda a: a["created"] or "", reverse=True)
    return {"albums": out}


class AlbumCreateRequest(BaseModel):
    name: str = ""

@app.post("/api/albums")
def create_album(body: AlbumCreateRequest, request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    name = body.name.strip()
    if not name:
        return JSONResponse(status_code=400, content={"error": "Album name is required"})
    if len(name) > 60:
        return JSONResponse(status_code=400, content={"error": "Album name is too long"})
    albums    = load_albums()
    album_id  = uuid.uuid4().hex[:12]
    created   = datetime.now().isoformat()
    albums[album_id] = {"id": album_id, "name": name, "owner": user, "created": created, "photos": [], "cover": None}
    save_albums(albums)
    return {"id": album_id, "name": name, "count": 0, "cover": None, "created": created}


@app.delete("/api/albums/{album_id}")
def delete_album(album_id: str, request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    albums = load_albums()
    album  = albums.get(album_id)
    if not album:
        return JSONResponse(status_code=404, content={"error": "Album not found"})
    if album.get("owner") != user and user != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    del albums[album_id]
    save_albums(albums)
    return {"status": "deleted"}


@app.get("/api/albums/suggestions")
def album_suggestions(request: Request):
    """'You starred N photos from this folder recently — want an album?'
    Looks at favorites starred in the last 7 days, groups them by folder,
    and suggests any folder with at least 3 that isn't already fully
    covered by an existing album.

    IMPORTANT: this route must be registered before /api/albums/{album_id}
    below — otherwise FastAPI matches "suggestions" as an album_id and this
    handler never runs."""
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    favs = load_favorites().get(user, [])
    cutoff = datetime.now() - timedelta(days=7)
    recent_by_folder: dict[str, list[str]] = {}
    for e in favs:
        p = _fav_path(e)
        t = _fav_time(e)
        if not p or not t or not can_access_path(user, p) or not os.path.exists(secure_path(p)):
            continue
        try:
            if datetime.fromisoformat(t) < cutoff:
                continue
        except ValueError:
            continue
        folder = "/".join(p.split("/")[:-1])
        if not folder:
            continue  # true-root files have no meaningful "folder" to group by
        recent_by_folder.setdefault(folder, []).append(p)

    albums = load_albums()
    existing_sets = [set(a.get("photos", [])) for a in albums.values() if a.get("owner") == user]

    suggestions = []
    for folder, paths in recent_by_folder.items():
        if len(paths) < 3:
            continue
        if any(set(paths).issubset(s) for s in existing_sets):
            continue  # already turned into (or subsumed by) an album
        suggestions.append({
            "folder": folder,
            "count": len(paths),
            "paths": [f"/media/{p}" for p in paths],
        })
    suggestions.sort(key=lambda s: -s["count"])
    return {"suggestions": suggestions[:5]}


@app.get("/api/albums/{album_id}")
def get_album(album_id: str, request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    albums = load_albums()
    album  = albums.get(album_id)
    if not album:
        return JSONResponse(status_code=404, content={"error": "Album not found"})
    if album.get("owner") != user and user != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})

    kept = [p for p in album.get("photos", [])
            if can_access_path(user, p) and os.path.exists(secure_path(p))]
    if len(kept) != len(album.get("photos", [])):
        # Quietly prune references to files that no longer exist
        album["photos"] = kept
        save_albums(albums)

    cover = a_cover if (a_cover := album.get("cover")) and a_cover in kept else None
    return {
        "id": album_id, "name": album["name"],
        "photos": [f"/media/{p}" for p in kept],
        "cover": f"/media/{cover}" if cover else None,
    }


class AlbumPhotosRequest(BaseModel):
    paths: list[str] = []

@app.post("/api/albums/{album_id}/photos/add")
def add_album_photos(album_id: str, body: AlbumPhotosRequest, request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    albums = load_albums()
    album  = albums.get(album_id)
    if not album:
        return JSONResponse(status_code=404, content={"error": "Album not found"})
    if album.get("owner") != user and user != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    added = 0
    for p in body.paths:
        p = p.strip("/")
        if not can_access_path(user, p):
            continue
        if p not in album["photos"]:
            album["photos"].append(p)
            added += 1
    save_albums(albums)
    return {"status": "ok", "added": added, "count": len(album["photos"])}


@app.post("/api/albums/{album_id}/photos/remove")
def remove_album_photos(album_id: str, body: AlbumPhotosRequest, request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    albums = load_albums()
    album  = albums.get(album_id)
    if not album:
        return JSONResponse(status_code=404, content={"error": "Album not found"})
    if album.get("owner") != user and user != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    remove_set = {p.strip("/") for p in body.paths}
    album["photos"] = [p for p in album["photos"] if p not in remove_set]
    if album.get("cover") in remove_set:
        album["cover"] = None
    save_albums(albums)
    return {"status": "ok", "count": len(album["photos"])}


class AlbumCoverRequest(BaseModel):
    path: str = ""

@app.post("/api/albums/{album_id}/cover")
def set_album_cover(album_id: str, body: AlbumCoverRequest, request: Request):
    """Pick any photo already in the album as its cover thumbnail. Passing
    an empty path clears the explicit cover (falls back to the first photo)."""
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    albums = load_albums()
    album  = albums.get(album_id)
    if not album:
        return JSONResponse(status_code=404, content={"error": "Album not found"})
    if album.get("owner") != user and user != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    p = body.path.strip("/")
    if p and p not in album.get("photos", []):
        return JSONResponse(status_code=400, content={"error": "Cover must be a photo already in this album"})
    album["cover"] = p or None
    save_albums(albums)
    return {"status": "ok", "cover": f"/media/{p}" if p else None}


class AlbumReorderRequest(BaseModel):
    paths: list[str] = []

@app.post("/api/albums/{album_id}/reorder")
def reorder_album_photos(album_id: str, body: AlbumReorderRequest, request: Request):
    """Sets the album's photo order to match the given list (drag-and-drop
    reordering on the frontend). Any path not already in the album is
    ignored; any existing photo missing from the given list is appended at
    the end, as a safety net against stale client-side state."""
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    albums = load_albums()
    album  = albums.get(album_id)
    if not album:
        return JSONResponse(status_code=404, content={"error": "Album not found"})
    if album.get("owner") != user and user != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    current   = set(album.get("photos", []))
    new_order = []
    seen      = set()
    for p in body.paths:
        p = p.strip("/")
        if p in current and p not in seen:
            new_order.append(p)
            seen.add(p)
    missing = [p for p in album.get("photos", []) if p not in seen]
    album["photos"] = new_order + missing
    save_albums(albums)
    return {"status": "ok", "photos": [f"/media/{p}" for p in album["photos"]]}


# ── Favorites API ──────────────────────────────────────────────────────────────
# Each entry is {"path": rel_path, "starred_at": iso timestamp}. Older data
# may still have plain path strings — _fav_path() normalizes either shape.

def _fav_path(entry) -> str:
    return entry if isinstance(entry, str) else entry.get("path", "")

def _fav_time(entry) -> str | None:
    return None if isinstance(entry, str) else entry.get("starred_at")

@app.get("/api/favorites")
def list_favorites(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    favs = load_favorites().get(user, [])
    favs = [e for e in favs if can_access_path(user, _fav_path(e)) and os.path.exists(secure_path(_fav_path(e)))]
    # Most recently starred first
    favs.sort(key=lambda e: _fav_time(e) or "", reverse=True)
    return {"photos": [f"/media/{_fav_path(e)}" for e in favs]}


class FavoriteToggleRequest(BaseModel):
    path: str = ""

@app.post("/api/favorites/toggle")
def toggle_favorite(body: FavoriteToggleRequest, request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    p = body.path.strip("/")
    if not p or not can_access_path(user, p):
        return JSONResponse(status_code=403, content={"error": "Access denied"})
    favs_all = load_favorites()
    favs     = favs_all.get(user, [])
    if any(_fav_path(e) == p for e in favs):
        favs = [e for e in favs if _fav_path(e) != p]
        starred = False
    else:
        favs.append({"path": p, "starred_at": datetime.now().isoformat()})
        starred = True
    favs_all[user] = favs
    save_favorites(favs_all)
    return {"starred": starred}



def page(page_key: str, status: int = 200, user: str | None = None) -> HTMLResponse:
    global _index_html
    if _index_html is None:
        _index_html = _load_html_template()
    import json as _json
    init = _json.dumps({"user": user, "is_admin": user == "admin"})
    injection = f'<script>window.__PAGE__="{page_key}";window.__INIT__={init};</script>\n'
    html = _index_html.replace("</head>", injection + "</head>", 1)
    return HTMLResponse(content=html, status_code=status, headers=dict(_NO_CACHE))


# add this new route alongside the other page routes
@app.get("/api/me")
def me(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return {"username": user, "is_admin": user == "admin"}

@app.get("/api/random-photos")
async def random_photos(
    request: Request,
    count: int = 20,
    folders: list[str] = Query(default=[])
):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    count = max(1, min(count, 200))

    with _index_lock:
        idx = _load_media_index()

    if folders:
        # Only paths that start with one of the selected folder keys
        # AND belong to this user or shared
        pool = []
        for folder_key, paths in idx.items():
            if any(folder_key == f or folder_key.startswith(f + "/") for f in folders):
                if can_access_path(user, folder_key):
                    pool.extend(p for p in paths if _IMAGE_EXT_RE.search(p))
    else:
        # All files accessible to this user
        pool = []
        for folder_key, paths in idx.items():
            if can_access_path(user, folder_key):
                pool.extend(p for p in paths if _IMAGE_EXT_RE.search(p))

    # random.sample is O(count) rather than shuffling the entire pool (O(n))
    # when only a handful of photos are actually requested out of a large library.
    picked = random.sample(pool, min(count, len(pool)))
    return {
        "photos":    [f"/media/{p}" for p in picked],
        "available": len(pool),
        "requested": count,
    }
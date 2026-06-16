import os
import re
import json
import shutil
import contextlib
import random
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Form, File, UploadFile, HTTPException
from fastapi.params import Query
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import Signer
from passlib.context import CryptContext
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv
from datetime import datetime

from workerFiles.file_renamer_scheduler import start_scheduler, stop_scheduler, get_scheduler_status
from fastapi.middleware.cors import CORSMiddleware

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

_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_\-]{3,30}$')

_NO_CACHE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma":        "no-cache",
    "Expires":       "0",
}

_CHUNK = 256 * 1024
DIST_DIR     = os.path.join(BASE_DIR, "dist")
_index_html: str | None = None

def _load_index() -> str:
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

import json, threading

_INDEX_PATH = os.path.join(os.path.dirname(__file__), "media_index.json")
_index_lock = threading.Lock()

def _load_index() -> dict:
    """{ "username/folder/sub": ["username/folder/sub/fname_001.jpg", ...] }"""
    try:
        with open(_INDEX_PATH, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def _save_index(idx: dict):
    with open(_INDEX_PATH, "w") as f:
        json.dump(idx, f, indent=2)

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
        idx = _load_index()
        idx.setdefault(folder_key, [])
        if rel_path not in idx[folder_key]:
            idx[folder_key].append(rel_path)
        _save_index(idx)

def _remove_from_index(rel_path: str):
    """Remove a file or all entries under a folder prefix from the index."""
    with _index_lock:
        idx = _load_index()
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
        idx = _load_index()
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
        _index_html = _load_index()
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

app.mount("/media",  StaticFiles(directory=MEDIA_DIR), name="media")
# app.mount("/static", StaticFiles(directory="static"),  name="static")
if os.path.isdir(os.path.join(DIST_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")
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
    return path.split("/", 1)[0] in ("shared", username)


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

def _count_dir(path: str) -> tuple[int, int]:
    count = size = 0
    try:
        with os.scandir(path) as it:
            for e in it:
                if e.is_file(follow_symlinks=False):
                    if e.name.lower().endswith(_ALLOWED_EXT):
                        count += 1
                        size  += e.stat().st_size
                elif e.is_dir(follow_symlinks=False):
                    c, s   = _count_dir(e.path)
                    count += c
                    size  += s
    except OSError:
        pass
    return count, size


def _recent_files(n: int) -> list[str]:
    found: list[tuple[float, str]] = []

    def _walk(directory: str, rel: str) -> None:
        try:
            with os.scandir(directory) as it:
                for e in it:
                    if e.is_file(follow_symlinks=False) and e.name.lower().endswith(_ALLOWED_EXT):
                        r = f"{rel}/{e.name}" if rel else e.name
                        found.append((e.stat().st_mtime, r))
                    elif e.is_dir(follow_symlinks=False):
                        _walk(e.path, f"{rel}/{e.name}" if rel else e.name)
        except OSError:
            pass

    _walk(MEDIA_DIR, "")
    found.sort(reverse=True)
    return [f[1] for f in found[:n]]


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
                    c, s = _count_dir(entry.path)
                    user_stats[entry.name] = {"files": c, "size": s}
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
        "recent_files":    _recent_files(24),
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
    restricted = day_restricted_response(user)
    if restricted:
        return restricted
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

    entries.sort(key=lambda e: (not e.is_dir(follow_symlinks=False),
                                 -e.stat().st_mtime))

    files: list   = []
    folders: list = []
    for e in entries:
        if e.is_dir(follow_symlinks=False):
            if not path and allowed is not None and e.name not in allowed:
                continue
            folders.append(e.name)
        elif e.name.lower().endswith(_ALLOWED_EXT):
            files.append(e.name)

    return {"files": files, "folders": folders, "current_path": path}


@app.get("/api/tree")
def get_folder_tree(request: Request):
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    restricted = day_restricted_response(user)
    if restricted:
        return restricted

    allowed = visible_top_folders(user)

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

    return {"tree": build(MEDIA_DIR, "", 0)}


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

    # ── Write file ────────────────────────────────────────────
    try:
        with open(file_path, "wb") as buf:
            while True:
                chunk = await file.read(_CHUNK)
                if not chunk:
                    break
                buf.write(chunk)
    except Exception:
        with contextlib.suppress(OSError):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail="Failed to save file")

    # ── Update index ──────────────────────────────────────────
    rel = os.path.relpath(file_path, MEDIA_DIR).replace(os.sep, "/")
    _add_to_index(rel)

    return {"filename": new_filename, "status": "success"}


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
        raise HTTPException(status_code=404, detail="File not found")
    if os.path.abspath(target) == _SHARED_ABS:
        raise HTTPException(status_code=403, detail="Cannot delete the shared folder")

    try:
        shutil.rmtree(target) if os.path.isdir(target) else os.remove(target)
        # Remove from index
        rel = os.path.relpath(target, MEDIA_DIR).replace(os.sep, "/")
        _remove_from_index(rel)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"status": "deleted"}

# ── Move file/folder ──────────────────────────────────────────────────────────

@app.post("/api/move")
async def move_media(request: Request):
    """Move a file or folder to a different destination directory.

    Body (JSON):
        src_path  – current parent folder path   (e.g. "alice/trips")
        filename  – file or folder name          (e.g. "photo.jpg" or "beach")
        dest_path – target parent folder path    (e.g. "alice/archive")
    """
    user = get_current_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    restricted = day_restricted_response(user)
    if restricted:
        return restricted

    try:
        body      = await request.json()
        src_path  = (body.get("src_path")  or "").strip("/")
        filename  = (body.get("filename")  or "").strip()
        dest_path = (body.get("dest_path") or "").strip("/")
    except Exception:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON body"})

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
        shutil.move(src_abs, dest_file)
        # Update index: remove old path, add new path
        old_rel = os.path.relpath(src_abs,  MEDIA_DIR).replace(os.sep, "/")
        new_rel = os.path.relpath(dest_file, MEDIA_DIR).replace(os.sep, "/")
        _remove_from_index(old_rel)
        _add_to_index(new_rel)
    except OSError as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    return {"status": "moved", "filename": filename, "dest": dest_path}


def page(page_key: str, status: int = 200, user: str | None = None) -> HTMLResponse:
    global _index_html
    if _index_html is None:
        _index_html = _load_index()
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
        idx = _load_index()

    IMAGE_EXT = re.compile(r'\.(jpg|jpeg|png|gif|webp)$', re.IGNORECASE)

    if folders:
        # Only paths that start with one of the selected folder keys
        # AND belong to this user or shared
        pool = []
        for folder_key, paths in idx.items():
            if any(folder_key == f or folder_key.startswith(f + "/") for f in folders):
                if can_access_path(user, folder_key):
                    pool.extend(p for p in paths if IMAGE_EXT.search(p))
    else:
        # All files accessible to this user
        pool = []
        for folder_key, paths in idx.items():
            if can_access_path(user, folder_key):
                pool.extend(p for p in paths if IMAGE_EXT.search(p))

    random.shuffle(pool)
    return [f"/media/{p}" for p in pool[:count]]
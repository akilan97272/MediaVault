import os
import re
import json
import shutil
import contextlib
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Form, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from jinja2 import Environment, FileSystemLoader
from itsdangerous import Signer
from passlib.context import CryptContext
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv
from datetime import datetime

# File renamer scheduler
from workerFiles.file_renamer_scheduler import start_scheduler, stop_scheduler, get_scheduler_status

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-unsafe-default-key")

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MEDIA_DIR  = os.path.join(BASE_DIR, "media")
USERS_FILE = os.path.join(BASE_DIR, "users.json")
ACTIVITY_LOG_FILE = os.path.join(BASE_DIR, "activity_log.json")
SHARED_DIR = os.path.join(MEDIA_DIR, "shared")

# Computed ONCE at startup — reused on every path-traversal check
_MEDIA_ABS  = os.path.abspath(MEDIA_DIR)
_SHARED_ABS = os.path.abspath(SHARED_DIR)

os.makedirs(SHARED_DIR, exist_ok=True)

# ── Security ──────────────────────────────────────────────────────────────────

signer = Signer(SECRET_KEY)

# rounds=10 instead of default 12: ~4× faster on low-end hardware,
# still >100 ms per hash — more than sufficient against brute-force.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)

# ── Module-level constants (built once, never recreated) ──────────────────────

# frozenset → O(1) lookup on every upload request
_ALLOWED_MIME: frozenset = frozenset({
    "image/jpeg", "image/png", "image/gif",
    "video/mp4",  "video/webm",
    # Firefox Focus / Android WebView send these instead of the real MIME
    "application/octet-stream", "binary/octet-stream", "",
})
_ALLOWED_EXT: tuple = (".jpg", ".jpeg", ".png", ".gif", ".mp4", ".webm", ".mkv")

# Pre-compiled — not re-compiled on every register/create_user call
_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_\-]{3,30}$')

# Reused dict — avoids rebuilding the same 3 headers on every page response
_NO_CACHE = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma":        "no-cache",
    "Expires":       "0",
}

# 256 KB chunks — keeps memory flat on large video uploads
_CHUNK = 256 * 1024

# ── User store — in-memory cache, disk only on first load & writes ─────────────
#
# Problem: every endpoint was calling load_users() → open() → json.load()
# from disk.  With 6 call-sites that's 6 disk reads per busy request.
# Fix: read once, cache forever, invalidate only on writes.

_users_cache: dict | None = None
_users_lock  = threading.Lock()          # protects writes; reads are lock-free


def load_users() -> dict:
    """Return the user dict.  Disk is touched only on the very first call."""
    global _users_cache
    if _users_cache is not None:
        return _users_cache
    with _users_lock:
        if _users_cache is None:            # double-checked locking
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
    """Persist + update the in-memory cache under the write lock."""
    global _users_cache
    with _users_lock:
        _write_users(users)
        _users_cache = users            # atomically replace the reference


def _write_users(users: dict) -> None:
    """Atomic write via tmp + rename — crash-safe, compact JSON."""
    tmp = USERS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(users, f, separators=(',', ':'))   # no pretty-print waste
    os.replace(tmp, USERS_FILE)                      # atomic on POSIX


def _ensure_user_folder(username: str) -> None:
    if username != "admin":
        os.makedirs(os.path.join(MEDIA_DIR, username), exist_ok=True)


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
    """True if the user has no restriction, or today is in their allowed days."""
    if username == "admin":
        return True
    cfg = load_restrictions().get(username)
    if not cfg or not cfg.get("enabled", False):
        return True
    return datetime.now().weekday() in cfg.get("allowed_days", [])


# ── Activity Log (Login tracking) ─────────────────────────────────────────────

_activity_lock = threading.Lock()


def log_login(username: str, user_agent: str, ip_address: str, success: bool = True) -> None:
    """Log a login attempt with device details."""
    with _activity_lock:
        activities = []
        if os.path.exists(ACTIVITY_LOG_FILE):
            try:
                with open(ACTIVITY_LOG_FILE) as f:
                    activities = json.load(f)
            except (json.JSONDecodeError, IOError):
                activities = []
        
        # Parse user agent for device info
        device_info = parse_user_agent(user_agent)
        
        activity = {
            "timestamp": datetime.now().isoformat(),
            "username": username,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "device_info": device_info,
            "success": success
        }
        
        activities.insert(0, activity)  # newest first
        
        # Keep last 500 login records
        if len(activities) > 500:
            activities = activities[:500]
        
        tmp = ACTIVITY_LOG_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(activities, f, separators=(',', ':'))
        os.replace(tmp, ACTIVITY_LOG_FILE)


def parse_user_agent(user_agent: str) -> dict:
    """Parse User-Agent string to extract device info."""
    ua = user_agent.lower()
    
    # Detect OS
    if "windows" in ua:
        os_name = "Windows"
    elif "mac" in ua or "darwin" in ua:
        os_name = "macOS"
    elif "linux" in ua:
        os_name = "Linux"
    elif "android" in ua:
        os_name = "Android"
    elif "iphone" in ua or "ipad" in ua:
        os_name = "iOS"
    else:
        os_name = "Unknown"
    
    # Detect Browser
    if "chrome" in ua and "edg" not in ua:
        browser = "Chrome"
    elif "safari" in ua and "chrome" not in ua:
        browser = "Safari"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "edg" in ua:
        browser = "Edge"
    elif "opera" in ua or "opr" in ua:
        browser = "Opera"
    else:
        browser = "Unknown"
    
    # Detect Device Type
    if "mobile" in ua or "android" in ua or "iphone" in ua:
        device_type = "Mobile"
    elif "tablet" in ua or "ipad" in ua:
        device_type = "Tablet"
    else:
        device_type = "Desktop"
    
    return {
        "browser": browser,
        "os": os_name,
        "device_type": device_type
    }


def get_activity_log() -> list:
    """Retrieve the activity log."""
    if os.path.exists(ACTIVITY_LOG_FILE):
        try:
            with open(ACTIVITY_LOG_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []
    return []

_jinja_env = Environment(
    loader=FileSystemLoader(os.path.join(BASE_DIR, "templates")),
    autoescape=True,
    cache_size=0,
)
_tpl_store: dict = {}


def _tpl(name: str):
    """Compiled Jinja2 Template — disk is only read on the first call."""
    t = _tpl_store.get(name)
    if t is None:
        t = _jinja_env.get_template(name)
        _tpl_store[name] = t
    return t


def render(request: Request, name: str,
           ctx: dict | None = None, status: int = 200) -> HTMLResponse:
    """
    Render a template directly to HTMLResponse.
    Bypasses Starlette's TemplateResponse._load_template() overhead while
    still injecting `request` into the Jinja2 context (needed for url_for etc).
    """
    context: dict = {"request": request}
    if ctx:
        context.update(ctx)
    r = HTMLResponse(content=_tpl(name).render(context), status_code=status)
    return r


# ── App bootstrap ─────────────────────────────────────────────────────────────

async def lifespan(_app: FastAPI):
    # Startup
    load_users()
    load_restrictions()          # ← warm the new cache
    for _n in ("login.html", "gallery.html", "404.html"):
        _tpl(_n)
    
    # Start file renamer scheduler (every 2 hours)
    start_scheduler()
    
    yield
    
    # Shutdown
    stop_scheduler()

app = FastAPI(
    lifespan=lifespan,
    docs_url=None,      # disable Swagger UI — saves ~4 MB RAM + hides API surface
    redoc_url=None,
    openapi_url=None,
)

app.mount("/media",  StaticFiles(directory=MEDIA_DIR), name="media")
app.mount("/static", StaticFiles(directory="static"),  name="static")


# ── Exception handler ─────────────────────────────────────────────────────────

@app.exception_handler(StarletteHTTPException)
async def http_exc_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        r = render(request, "404.html", status=404)
        r.headers.update(_NO_CACHE)
        return r
    return JSONResponse(status_code=exc.status_code,
                        content={"error": exc.detail})


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
    """Admin: everywhere.  Others: only shared/ or their own folder."""
    if username == "admin" or not path:
        return True
    return path.split("/", 1)[0] in ("shared", username)


def visible_top_folders(username: str) -> frozenset | None:
    """None → show all (admin).  frozenset → O(1) membership filter."""
    if username == "admin":
        return None
    return frozenset(("shared", username))


# ── Path security ─────────────────────────────────────────────────────────────

def secure_path(sub: str) -> str:
    """Resolve + validate — prevents path-traversal (../../ etc)."""
    target = os.path.abspath(os.path.join(MEDIA_DIR, sub.strip("/")))
    if not target.startswith(_MEDIA_ABS):
        raise HTTPException(status_code=400, detail="Invalid path")
    return target


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    if get_current_user(request):
        return RedirectResponse("/gallery", status_code=302)
    r = render(request, "login.html")
    r.headers.update(_NO_CACHE)
    return r


@app.post("/login")
def login(request: Request, username: str = Form(...), password: str = Form(...)):
    users = load_users()
    h = users.get(username)
    
    # Get client IP
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    if h and pwd_context.verify(password, h):
        if not is_allowed_today(username):
            log_login(username, user_agent, client_ip, success=False)
            day = _DAY_NAMES[datetime.now().weekday()]
            return RedirectResponse(f"/?error=day&day={day}", status_code=302)
        
        log_login(username, user_agent, client_ip, success=True)
        r = RedirectResponse("/gallery", status_code=302)
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
        return JSONResponse(status_code=409,
            content={"error": "Username already taken"})
    new = dict(users)                   # copy — never mutate the cached ref
    new[username] = pwd_context.hash(password)
    save_users(new)
    _ensure_user_folder(username)
    return {"status": "created", "username": username}


@app.get("/gallery", response_class=HTMLResponse)
def gallery_page(request: Request):
    user = get_current_user(request)
    if not user:
        r = render(request, "404.html", status=404)
        r.headers.update(_NO_CACHE)
        return r
    # Block mid-session if the day changes while cookie is still alive
    if not is_allowed_today(user):
        day = _DAY_NAMES[datetime.now().weekday()]
        r   = RedirectResponse(f"/?error=day&day={day}", status_code=302)
        r.headers.update(_NO_CACHE)
        return r
    r = render(request, "gallery.html", {"user": user, "is_admin": user == "admin"})
    r.headers.update(_NO_CACHE)
    return r

@app.get("/logout")
def logout():
    r = RedirectResponse("/", status_code=302)
    r.delete_cookie("session")
    return r


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
        return JSONResponse(status_code=409,
            content={"error": "Username already exists"})
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
    activities = get_activity_log()
    return {"activities": activities}

@app.get("/api/admin/scheduler-status")
def get_scheduler_status_endpoint(request: Request):
    """Get status of file renamer scheduler (admin only)."""
    if get_current_user(request) != "admin":
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return get_scheduler_status()

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
        body = await request.json()
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
    if not os.path.isdir(target):               # isdir covers exists() too
        return {"files": [], "folders": [], "current_path": path}

    allowed = visible_top_folders(user)

    # os.scandir: single syscall that returns DirEntry objects with
    # cached is_dir() and stat() — replaces listdir + isdir + getmtime
    try:
        with os.scandir(target) as it:
            entries = list(it)
    except OSError:
        return {"files": [], "folders": [], "current_path": path}

    # DirEntry.stat() is cached after first access — no extra syscall
    entries.sort(key=lambda e: (not e.is_dir(follow_symlinks=False),
                                 -e.stat().st_mtime))

    files: list = []
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

    # ── Firefox Focus / Android WebView compatibility ──────────────────────
    # These browsers strip the real MIME and send 'application/octet-stream'
    # or nothing at all.  Strategy: trust the file EXTENSION first; only fall
    # back to MIME if extension is missing or ambiguous.
    fname  = (file.filename or "").strip()
    flower = fname.lower()

    if flower.endswith(_ALLOWED_EXT):
        pass                            # extension is authoritative → accept
    else:
        mime = (file.content_type or "").split(";")[0].strip().lower()
        if mime not in _ALLOWED_MIME:
            return JSONResponse(status_code=400,
                content={"error": f"Unsupported file type: {file.content_type}"})

    target_dir = secure_path(path)
    if not os.path.isdir(target_dir):
        raise HTTPException(status_code=404, detail="Target folder does not exist")

    # Sanitise filename — os.path.basename strips path components
    filename  = os.path.basename(fname) or "upload"
    file_path = os.path.join(target_dir, filename)

    # ── Chunked write ──────────────────────────────────────────────────────
    # shutil.copyfileobj is synchronous and buffers the whole file before
    # writing on some platforms.  Chunked async read keeps RAM flat for
    # large video uploads even on 512 MB servers.
    try:
        with open(file_path, "wb") as buf:
            while True:
                chunk = await file.read(_CHUNK)
                if not chunk:
                    break
                buf.write(chunk)
    except Exception:
        with contextlib.suppress(OSError):  # clean up partial file
            os.remove(file_path)
        raise HTTPException(status_code=500, detail="Failed to save file")

    return {"filename": filename, "status": "success"}


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
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"status": "deleted"}

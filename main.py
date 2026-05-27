import os
import json
import shutil
from fastapi import FastAPI, Request, Form, File, UploadFile, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from jinja2 import Environment, FileSystemLoader
from itsdangerous import Signer
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-unsafe-default-key")

app = FastAPI()
BASE_DIR = os.path.dirname(__file__)
MEDIA_DIR = os.path.join(BASE_DIR, "media")
USERS_FILE = os.path.join(BASE_DIR, "users.json")

os.makedirs(MEDIA_DIR, exist_ok=True)

signer = Signer(SECRET_KEY)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# -------- USER STORE --------

def load_users() -> dict:
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, "r") as f:
            return json.load(f)
    # Bootstrap default admin on first run
    users = {"admin": pwd_context.hash("admin123")}
    save_users(users)
    return users


def save_users(users: dict):
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)


# -------- AUTH HELPERS --------

def get_current_user(request: Request):
    cookie = request.cookies.get("session")
    if not cookie:
        return None
    try:
        username = signer.unsign(cookie).decode()
        return username
    except Exception:
        return None


def is_authenticated(request: Request) -> bool:
    return get_current_user(request) is not None


def is_admin(request: Request) -> bool:
    return get_current_user(request) == "admin"


# -------- PATH HELPER --------

def get_secure_path(sub_path: str) -> str:
    target = os.path.abspath(os.path.join(MEDIA_DIR, sub_path.strip("/")))
    if not target.startswith(os.path.abspath(MEDIA_DIR)):
        raise HTTPException(status_code=400, detail="Invalid path")
    return target


# -------- TEMPLATES / STATIC --------

_jinja_env = Environment(
    loader=FileSystemLoader(os.path.join(BASE_DIR, "templates")),
    autoescape=True,
    cache_size=0,   # disables the LRU cache that causes "unhashable type: dict" in Jinja2 3.x
)
templates = Jinja2Templates(env=_jinja_env)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")
app.mount("/static", StaticFiles(directory="static"), name="static")


# -------- ROUTES --------

@app.get("/", response_class=HTMLResponse)
def login_page(request: Request):
    if is_authenticated(request):
        return RedirectResponse("/gallery", status_code=302)
    return templates.TemplateResponse(request, "login.html")


@app.post("/login")
def login(username: str = Form(...), password: str = Form(...)):
    users = load_users()
    stored_hash = users.get(username)
    if stored_hash and pwd_context.verify(password, stored_hash):
        response = RedirectResponse("/gallery", status_code=302)
        response.set_cookie(
            key="session",
            value=signer.sign(username).decode(),
            httponly=True,
            samesite="lax",
            secure=False,
        )
        return response
    return RedirectResponse("/?error=1", status_code=302)


@app.get("/gallery", response_class=HTMLResponse)
def gallery_page(request: Request):
    if not is_authenticated(request):
        return RedirectResponse("/", status_code=302)
    user = get_current_user(request)
    return templates.TemplateResponse(request, "gallery.html", {"user": user, "is_admin": user == "admin"})


@app.get("/logout")
def logout():
    response = RedirectResponse("/", status_code=302)
    response.delete_cookie("session")
    return response


# -------- USER MANAGEMENT (Admin only) --------

@app.get("/api/users")
def list_users(request: Request):
    if not is_admin(request):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    users = load_users()
    return {"users": list(users.keys())}


@app.post("/api/users")
async def create_user(request: Request, username: str = Form(...), password: str = Form(...)):
    if not is_admin(request):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})

    username = username.strip()
    if not username or not password:
        return JSONResponse(status_code=400, content={"error": "Username and password required"})

    # Sanitize username
    import re
    if not re.match(r'^[a-zA-Z0-9_\-]{3,30}$', username):
        return JSONResponse(status_code=400, content={"error": "Username must be 3–30 alphanumeric chars"})

    users = load_users()
    if username in users:
        return JSONResponse(status_code=409, content={"error": "Username already exists"})

    users[username] = pwd_context.hash(password)
    save_users(users)
    return {"status": "created", "username": username}


@app.delete("/api/users/{username}")
def delete_user(username: str, request: Request):
    if not is_admin(request):
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    if username == "admin":
        return JSONResponse(status_code=400, content={"error": "Cannot delete admin"})

    users = load_users()
    if username not in users:
        return JSONResponse(status_code=404, content={"error": "User not found"})

    del users[username]
    save_users(users)
    return {"status": "deleted"}


# -------- MEDIA API --------

@app.get("/api/media")
def list_media(request: Request, path: str = ""):
    if not is_authenticated(request):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    target_dir = get_secure_path(path)
    if not os.path.exists(target_dir):
        return {"files": [], "folders": [], "current_path": path}

    items = os.listdir(target_dir)
    items.sort(key=lambda x: (
        not os.path.isdir(os.path.join(target_dir, x)),
        -os.path.getmtime(os.path.join(target_dir, x))
    ))

    files = []
    folders = []

    for item in items:
        full_item_path = os.path.join(target_dir, item)
        if os.path.isdir(full_item_path):
            folders.append(item)
        elif item.lower().endswith((".jpg", ".png", ".jpeg", ".mp4", ".webm", ".gif")):
            files.append(item)

    return {"files": files, "folders": folders, "current_path": path}


@app.get("/api/tree")
def get_folder_tree(request: Request):
    """Return recursive folder tree for sidebar."""
    if not is_authenticated(request):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    def build_tree(directory: str, rel_path: str = "") -> list:
        result = []
        try:
            for item in sorted(os.listdir(directory)):
                full = os.path.join(directory, item)
                if os.path.isdir(full):
                    child_rel = f"{rel_path}/{item}" if rel_path else item
                    result.append({
                        "name": item,
                        "path": child_rel,
                        "children": build_tree(full, child_rel)
                    })
        except PermissionError:
            pass
        return result

    tree = build_tree(MEDIA_DIR)
    return {"tree": tree}


@app.post("/api/folder")
def create_folder(request: Request, name: str = Form(...), path: str = Form("")):
    if not is_authenticated(request):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    base_dir = get_secure_path(path)
    safe_name = os.path.basename(name.strip())
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid folder name")

    new_folder_path = os.path.join(base_dir, safe_name)
    try:
        os.makedirs(new_folder_path, exist_ok=True)
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "created", "name": safe_name}


@app.post("/api/upload")
async def upload_media(request: Request, path: str = Form(""), file: UploadFile = File(...)):
    if not is_authenticated(request):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    allowed_types = ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/webm"]
    valid_extensions = (".jpg", ".jpeg", ".png", ".gif", ".mp4", ".webm", ".mkv")

    is_valid_type = file.content_type in allowed_types
    is_valid_ext = file.filename.lower().endswith(valid_extensions)

    if not (is_valid_type or is_valid_ext):
        raise HTTPException(status_code=400, detail=f"Invalid file type: {file.content_type}")

    target_dir = get_secure_path(path)
    if not os.path.exists(target_dir):
        raise HTTPException(status_code=404, detail="Target folder does not exist")

    filename = os.path.basename(file.filename)
    file_path = os.path.join(target_dir, filename)

    try:
        with open(file_path, "wb+") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to save file")

    return {"filename": filename, "status": "success"}


@app.delete("/api/media")
def delete_media(request: Request, path: str = "", filename: str = ""):
    if not is_authenticated(request):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    target = get_secure_path(f"{path}/{filename}" if path else filename)
    if not os.path.exists(target):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        if os.path.isdir(target):
            shutil.rmtree(target)
        else:
            os.remove(target)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "deleted"}
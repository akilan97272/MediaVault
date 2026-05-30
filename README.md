# MediaVault

A self-hosted private media gallery with per-user folders, shared space, and a liquid glass UI.

---

## Features

- **Private galleries** — each user sees only their own folder and the shared folder
- **Shared folder** — visible to all users; upload anything others can browse
- **Admin view** — admin account can browse every user's folder
- **Self-registration** — new users can create an account from the login screen; their personal folder is created automatically
- **Admin user management** — create or remove users from the gallery panel
- **Folder tree** — nested folders with sidebar navigation
- **Lightbox** — full-screen image/video viewer with pinch-to-zoom, drag-to-pan, keyboard navigation
- **Slideshow** — auto-advance with 10 / 15 / 20 / 30 second intervals and a live countdown ring
- **Dark & Light mode** — liquid glass theme in both, preference saved to localStorage
- **Multi-file upload** — select multiple files at once; progress indicator on the upload button
- **Right-click to delete** — right-click any file or folder in the grid to remove it

---

## Project Structure

```
gallery_app/
├── main.py              # FastAPI backend
├── users.json           # Hashed user credentials (auto-created on first run)
├── media/
│   ├── shared/          # Visible to all users
│   └── <username>/      # Per-user private folder
├── static/
│   ├── style.css
│   └── script.js
└── templates/
    ├── login.html
    └── gallery.html
```

---

## Setup

### 1. Install dependencies

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install fastapi uvicorn[standard] passlib[bcrypt] python-multipart itsdangerous python-dotenv jinja2
```

### 2. Configure (optional)

Create a `.env` file to set a custom secret key:

```
SECRET_KEY=replace-with-a-long-random-string
```

### 3. Run

```bash
uvicorn main:app --reload
```

Open [http://localhost:8000](http://localhost:8000)

---

## Default Login

| Username | Password  |
|----------|-----------|
| `admin`  | `admin123` |

> Change the admin password via the **Manage Users** panel after first login.

---

## Access Control

| Who      | Can see                          |
|----------|----------------------------------|
| Any user | `shared/` + their own folder     |
| Admin    | All folders for all users        |

Users cannot access each other's private folders — the API enforces this server-side regardless of what path is requested.

---

## Supported File Types

Images: `.jpg` `.jpeg` `.png` `.gif`
Video:  `.mp4` `.webm` `.mkv`

---

## Notes

- The `shared/` folder cannot be deleted by any user (protected at the API level).
- Usernames must be 3–30 characters, alphanumeric with `_` and `-` allowed.
- Passwords must be at least 4 characters.
- All passwords are stored as bcrypt hashes — plaintext is never saved.

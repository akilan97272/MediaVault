# MediaVault

A self-hosted private media gallery with per-user folders and shared space.

---

## Features

- **Private galleries** — each user sees only their own folder and the shared folder
- **Shared folder** — visible to all users; upload anything others can browse

- **Self-registration** — new users can create an account from the login screen; their personal folder is created automatically
- **Admin user management** — create or remove users from the gallery panel
- **Folder tree** — nested folders with sidebar navigation
- **Lightbox** — full-screen image/video viewer with pinch-to-zoom, drag-to-pan, keyboard navigation
- **Multi-file upload** — select multiple files at once; progress indicator on the upload button
- **Right-click to delete** — right-click any file or folder in the grid to remove it

---

## Project Structure

```
gallery_app/
├── main.py
├── users.json
├── activity_log.json
├── restrictions.json
├── requirements.txt
├── .gitignore
├── README.md
│
├── media/
│   ├── shared/
│   └── <username>/
│
├── static/
│   ├── style.css
│   └── script.js
│
├── templates/
│   ├── login.html
│   ├── gallery.html
│   ├── admin.html
│   └── 404.html
│
└── workerFiles/
    ├── file_renamer.py
    └── file_renamer_scheduler.py
```

---

## Setup

### 1. Install dependencies

```bash
cd MediaVault
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure (optional)

Create a `.env` file to set a custom secret key:

```
SECRET_KEY=replace-with-a-long-random-string
```

### 3. Run

```bash
uvicorn main:app --reload
uvicorn main:app --host 0.0.0.0 --port 8000 #for network visibility
```

Open [http://localhost:8000](http://localhost:8000)

---

## Default Login

| Username | Password  |
|----------|-----------|
| `admin`  | `admin123` |

> Change the admin password via the **Manage Users** panel after first login.

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

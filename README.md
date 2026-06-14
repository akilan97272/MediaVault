# MediaVault

A self-hosted private media gallery with per-user folders, shared space, and an admin dashboard.

---

## Features

- **Private galleries** — each user can only see their own folder and the shared folder
- **Shared folder** — a common space visible and accessible to all users
- **Self-registration** — new users can create an account from the login screen; a personal folder is created automatically
- **Folder navigation** — nested folders with sidebar tree navigation and breadcrumb path
- **Lightbox viewer** — full-screen image and video viewer with keyboard navigation and slideshow support
- **Multi-file upload** — select multiple files at once with live progress feedback
- **Pagination** — gallery is paginated with file and folder count shown per page
- **Multi-select** — right-click (desktop) or long-press (mobile) to select items; supports delete, move, and download
- **Activity log** — admin can view login activity including device and IP information
- **Admin dashboard** — overview of users, storage usage, and recent uploads
- **Dark and light mode** — liquid glass UI with persistent theme preference
- **File renamer worker** — background worker that renames uploaded files to a consistent format

---

## Project Structure

```
MediaVault/
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
├── workerFiles/
│   ├── file_renamer.py
│   └── file_renamer_scheduler.py
│
└── Gallery/                         ← React frontend (Vite)
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── App.css
        ├── index.css
        │
        ├── context/
        │   ├── AuthContext.jsx
        │   └── ThemeContext.jsx
        │
        ├── components/
        │   ├── BaseLayout.jsx
        │   ├── Sidebar.jsx
        │   └── TopBar.jsx
        │
        └── pages/
            ├── Login.jsx
            ├── GalleryDashboard.jsx
            ├── AdminDashboard.jsx
            └── NotFound.jsx
```

---

## Setup

### 1. Backend

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Frontend

```bash
cd Gallery
npm install
npm run build       # production build → dist/
```

Or for development with live reload:

```bash
npm run dev         # Vite dev server on :5173, proxies API to :8000
```


### 3. Run the backend

```bash
uvicorn main:app --reload
# or for network visibility:
uvicorn main:app --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000)

---

## Default Login

| Username | Password   |
|----------|------------|
| `admin`  | `admin123` |

---

## Supported File Types

Images: `.jpg` `.jpeg` `.png` `.gif`
Video:  `.mp4` `.webm` `.mkv`

---

## Notes

- The `shared/` folder is protected and cannot be deleted.
- Usernames must be 3–30 characters, alphanumeric with `_` and `-` allowed.
- Passwords must be at least 4 characters.
- All passwords are stored as bcrypt hashes.

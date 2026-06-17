# MediaVault

A self-hosted private media gallery. Each user gets their own private space
to store and browse photos and videos, with a shared folder accessible to
everyone on the server.

---

## Features

**Gallery**
- Private per-user media storage — users only see their own files
- Shared folder visible to all registered users
- Nested folder support with sidebar tree navigation
- Full-screen lightbox with keyboard navigation, slideshow, and pinch/scroll zoom
- Right-click (desktop) or long-press (mobile) context menu — open, select, download, move, delete
- Multi-select with bulk download and bulk delete
- Paginated grid with file count display

**Uploads**
- Multi-file upload from any device on the network
- Files are automatically renamed on upload to a consistent `foldername_001.jpg` format
- Supported formats: `.jpg` `.jpeg` `.png` `.gif` `.mp4` `.webm` `.mkv`
- Background worker re-checks and renames any files that were missed, every 2 hours

**Random Picks widget**
- Home screen widget that shows a random selection of your photos
- Choose how many to display: 10, 20, 30, 40, or 50
- Filter by specific folders using the folder picker
- Shuffle button to get a fresh random set

**Access control**
- Per-user day-of-week access restrictions (e.g. block access on weekdays)
- Admin can enable/disable restrictions and choose allowed days per user
- All passwords stored as bcrypt hashes

**Admin**
- Dashboard with total users, active users today, file count, and storage used
- Storage breakdown per user with visual bars
- Recent uploads preview
- Login activity log with device info and IP address
- User management: create users, delete users, set access restrictions

**Mobile**
- Responsive layout — sidebar collapses to a bottom navigation bar on small screens
- Folder tree accessible via floating bottom sheet
- Pinch-to-zoom in lightbox
- Long-press for context menu

---

## Project Structure

```
MediaVault/
├── main.py                    ← FastAPI backend — all routes and logic
├── users.json                 ← User accounts (auto-created)
├── activity_log.json          ← Login history (auto-created)
├── restrictions.json          ← Per-user access restrictions (auto-created)
├── media_index.json           ← File index for random photo feature (auto-created)
├── requirements.txt
├── dev.py                     ← Run in development mode (with --reload)
├── start.py                   ← Run in production mode
│
├── media/
│   ├── shared/                ← Files visible to all users
│   └── <username>/            ← Private folder per user
│       └── <subfolder>/       ← Nested folders supported
│
├── workerFiles/
│   ├── file_renamer.py        ← Renames files to foldername_001.jpg format
│   └── file_renamer_scheduler.py  ← Runs renamer every 2 hours in background
│
└── Gallery/                   ← React frontend (Vite)
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── context/
        │   ├── AuthContext.jsx
        │   └── ThemeContext.jsx
        ├── components/
        │   ├── BaseLayout.jsx
        │   ├── Sidebar.jsx
        │   └── TopBar.jsx
        └── pages/
            ├── Login.jsx
            ├── GalleryDashboard.jsx
            ├── AdminDashboard.jsx
            └── NotFound.jsx
```

---

## Setup

### 1. Install backend dependencies

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Build the frontend

```bash
cd Gallery
npm install
npm run build
cd ..
```

This compiles the React app into `Gallery/dist/`, which FastAPI serves automatically.

### 3. Start the server

**Development** (auto-reloads on code changes):
```bash
python dev.py
```

**Production** (stable, no reload, available on your network):
```bash
python start.py
```

Then open `http://localhost:8000` in your browser.
Other devices on the same network can reach it at `http://<your-machine-ip>:8000`.

---

## Default Login

| Username | Password   |
|----------|------------|
| `admin`  | `admin123` |

Change the admin password after first login via the Manage Users panel.

---

## Accounts

New users can register themselves from the login screen. A private media
folder is created for them automatically. Usernames must be 3–30 characters
(letters, numbers, `_`, `-`). Passwords must be at least 4 characters.

The `shared/` folder is protected and cannot be deleted by any user.

---

## Supported File Types

| Type   | Extensions                    |
|--------|-------------------------------|
| Images | `.jpg` `.jpeg` `.png` `.gif`  |
| Video  | `.mp4` `.webm` `.mkv`         |

---

## File Naming

When a file is uploaded, it is automatically renamed to match the destination
folder name with a sequential number:

```
Uploads to folder "Trips":   Trips_001.jpg, Trips_002.jpg, ...
Uploads to folder "Videos":  Videos_001.mp4, Videos_002.mp4, ...
```

This applies at upload time. A background worker also runs every 2 hours to
catch any files that were added outside the normal upload flow.

---

## Access Restrictions

Admins can restrict specific users to certain days of the week. For example,
a user can be set to only have access on weekends. When they try to log in on
a restricted day, they are shown a message explaining the restriction.

Restrictions are configured per user from the Manage Users panel in the
admin section.

---

## API Reference

All routes require a valid session cookie except `/login`, `/register`, and
static file routes.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Login page |
| `POST` | `/login` | Submit credentials |
| `GET` | `/logout` | Clear session and redirect |
| `GET` | `/gallery` | Main gallery page |
| `GET` | `/admin` | Admin dashboard (admin only) |
| `GET` | `/api/me` | Current user info |
| `GET` | `/api/media` | List files and folders at a path |
| `POST` | `/api/upload` | Upload a file |
| `DELETE` | `/api/media` | Delete a file or folder |
| `POST` | `/api/move` | Move a file or folder |
| `POST` | `/api/folder` | Create a folder |
| `GET` | `/api/tree` | Full folder tree for sidebar |
| `GET` | `/api/random-photos` | Random photo selection |
| `GET` | `/api/users` | List all users (admin only) |
| `POST` | `/api/users` | Create a user (admin only) |
| `DELETE` | `/api/users/{username}` | Delete a user (admin only) |
| `GET` | `/api/restrictions` | Get all access restrictions (admin only) |
| `POST` | `/api/restrictions/{username}` | Set restriction for a user (admin only) |
| `DELETE` | `/api/restrictions/{username}` | Remove restriction (admin only) |
| `GET` | `/api/activity` | Login activity log (admin only) |
| `GET` | `/api/admin/stats` | Dashboard statistics (admin only) |
| `GET` | `/api/register` | Register a new account |
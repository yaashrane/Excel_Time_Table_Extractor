# Extractify — Timetable Extractor

Extractify is a Flask-based web application that reads a master Excel timetable, detects the timetable layout automatically, extracts structured class slots, builds faculty-wise schedules, and lets users download individual faculty timetables as PDFs from the browser.

The project is tuned for FE-style college timetable sheets where:

- a row contains `Day` and `Time`
- division headers look like `FE-A`, `FE-B`, etc.
- cells may contain merged rows, batch-wise classes, labs, tutorials, rooms, and faculty codes

## What the Program Does

1. Authenticates users via email OTP registration and login
2. Uploads an Excel file (`.xlsx` or `.xls`)
3. Reads every worksheet into a normalized 2D grid
4. Expands merged cells so repeated values are preserved
5. Detects the day column, time column, division columns, and data range
6. Parses each timetable cell into structured entries such as subject, faculty, batch, room, and class type
7. Builds teacher-wise schedules from the extracted timetable
8. Merges consecutive matching periods into multi-hour blocks
9. Shows the results in a browser and exports individual faculty timetables as PDF

## Key Features

- Session-based login — no access without authentication
- User registration with email OTP verification via Brevo
- Forgot password flow with OTP reset
- User credentials persisted to `users.json`
- Drag-and-drop Excel upload UI
- Automatic timetable structure detection
- Merged-cell support for `.xlsx` files
- Best-effort `.xls` parsing
- Faculty code to faculty name mapping
- Teacher-wise timetable generation
- Consecutive lab/practical slot merging
- Validation warnings for incomplete or weak extraction
- Searchable faculty list
- Browser-side PDF export using `jsPDF` and `jspdf-autotable`
- Light/dark theme toggle
- Deployed on Render

## Tech Stack

- Backend: Flask, Flask-CORS
- Email OTP: Brevo HTTP API via `requests`
- Excel parsing: `openpyxl`, `pandas`, `numpy`
- Frontend: HTML, CSS, vanilla JavaScript
- PDF export: `jsPDF`, `jspdf-autotable` via CDN
- Deployment: Render (gunicorn)

## Auth Flow

### Register
1. Enter full name and institute email
2. Receive 6-digit OTP on email (via Brevo)
3. Verify OTP
4. Create password → auto login

### Login
- Enter email and password
- Session cookie set on success
- All pages and API endpoints protected

### Forgot Password
1. Enter institute email
2. Receive OTP on email
3. Verify OTP
4. Set new password → redirect to login

## Processing Pipeline

### 1. App startup

- `app.py` creates the Flask app
- serves `login.html`, `index.html`, `style.css`, `script.js`, and `favicon.ico`
- registers the API blueprint from `api.py`
- redirects unauthenticated users to `/login`

### 2. Authentication

- `auth_store.py` manages user accounts and OTPs
- users stored in `users.json` (path configurable via `USERS_FILE` env var)
- passwords hashed with SHA-256
- OTPs are 6-digit, expire in 10 minutes, stored in memory

### 3. File upload

- `file_service.py` validates file extensions and stores uploads in `uploads/`
- files are saved with a UUID prefix to avoid name collisions

### 4. Excel extraction

- `extractor.py` loads workbook sheets into plain grids
- `.xlsx` files use `openpyxl` and preserve merged-cell information
- `.xls` files use a pandas fallback

### 5. Structure detection

- `structure_detector.py` finds the header row, day/time columns, division row, and data bounds
- detection is specifically tuned for FE timetable formats

### 6. Cell normalization

- `normalizer.py` parses timetable cell text into structured entries
- extracts batch, subject, faculty code, room, and class kind (`lecture`, `lab`, `tutorial`, `break`)

### 7. Timetable assembly

- `timetable_engine.py` processes all sheets into a flat timetable
- removes duplicate slots
- generates teacher-wise schedules
- returns validation stats and warnings

### 8. Teacher schedule generation

- `teacher_parser.py` groups extracted slots by faculty code
- `slot_merger.py` merges consecutive identical periods into longer blocks

### 9. Frontend rendering and export

- `script.js` uploads the file to `/api/extract`
- renders detected faculty, timetable stats, warnings, and faculty sheets
- exports the selected faculty timetable as PDF

## API Endpoints

### `GET /api/health`
Simple health check.

### `POST /api/login`
Authenticates a user. Body: `{ "email", "password" }`.

### `POST /api/logout`
Clears the session.

### `GET /api/me`
Returns current session status.

### `POST /api/register/send-otp`
Sends a registration OTP to the given email. Body: `{ "full_name", "email" }`.

### `POST /api/register/verify-otp`
Verifies the registration OTP. Body: `{ "email", "otp" }`.

### `POST /api/register/complete`
Creates the account and logs in. Body: `{ "email", "otp", "password" }`.

### `POST /api/forgot/send-otp`
Sends a password reset OTP. Body: `{ "email" }`.

### `POST /api/forgot/verify-otp`
Verifies the reset OTP. Body: `{ "email", "otp" }`.

### `POST /api/forgot/reset`
Resets the password. Body: `{ "email", "otp", "password" }`.

### `POST /api/extract`
Uploads an Excel file and returns the full extracted payload. Requires login.

### `POST /api/upload`
Uploads a file only, without running extraction. Requires login.

### `GET /api/teachers`
Returns a summary of teachers from the latest extracted timetable. Requires login.

### `GET /api/timetable/<teacher>`
Returns the timetable for one faculty code. Requires login.

## Repository Structure

```text
Excel_Time_Table_Extractor/
|-- README.md                   # Project documentation
|-- app.py                      # Flask app entry point
|-- api.py                      # REST API routes
|-- config.py                   # App configuration
|-- auth_store.py               # User and OTP store
|-- extractor.py                # Excel workbook/sheet extraction
|-- structure_detector.py       # Timetable layout detection
|-- normalizer.py               # Timetable cell parsing and normalization
|-- timetable_engine.py         # End-to-end extraction pipeline
|-- teacher_parser.py           # Faculty-wise timetable builder
|-- slot_merger.py              # Consecutive slot merging logic
|-- file_service.py             # Upload validation and storage
|-- validators.py               # Extraction validation warnings/statistics
|-- utils.py                    # Shared text/day/time helpers
|-- __init__.py                 # Package export for TimetableEngine
|-- login.html                  # Login / register / forgot password UI
|-- index.html                  # Main app frontend markup
|-- style.css                   # Frontend styling
|-- script.js                   # Frontend logic and PDF export
|-- favicon.ico                 # App icon
|-- requirements.txt            # Python dependencies
|-- Procfile                    # Render/gunicorn start command
|-- render.yaml                 # Render deployment config
|-- runtime.txt                 # Python version for Render
|-- .env.example                # Example environment variables
|-- users.json                  # Persisted user accounts (auto-created)
|-- uploads/                    # Saved uploaded Excel files
|-- tests/                      # Test folder
`-- __pycache__/                # Python bytecode cache
```

## Setup

### 1. Create and activate a virtual environment

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 2. Install dependencies

```powershell
pip install -r requirements.txt
```

### 3. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```env
MAIL_USERNAME=your-verified-sender@email.com
BREVO_API_KEY=xkeysib-...
SECRET_KEY=your-random-secret
USERS_FILE=users.json
```

### 4. Run the app

```powershell
python app.py
```

The app starts on:

```text
http://localhost:5000
```

## Deployment on Render

### Environment Variables (set in Render dashboard)

| Key | Description |
|-----|-------------|
| `BREVO_API_KEY` | Brevo API key for sending OTP emails |
| `MAIL_USERNAME` | Verified sender email in Brevo |
| `SECRET_KEY` | Flask session secret key |
| `USERS_FILE` | `/data/users.json` (with Render disk) or `/tmp/users.json` |
| `RENDER` | Set to `true` |

### Persistent User Storage on Render

By default `/tmp/users.json` is wiped on every redeploy. To persist users:

1. Go to Render dashboard → your service → **Disks** → Add disk
2. Mount path: `/data`
3. Set `USERS_FILE` = `/data/users.json`

## How to Use

1. Open the app in the browser
2. Register with your institute email — verify via OTP
3. Log in with your email and password
4. Upload the master timetable Excel file
5. Wait for extraction to complete
6. Select a faculty code from the sidebar
7. Review the generated timetable
8. Click `Download PDF` to export the faculty timetable

## Configuration Notes

Important settings from `config.py`:

- upload limit: `16 MB`
- allowed extensions: `.xlsx`, `.xls`
- upload directory: `uploads/`
- OTP expiry: `10 minutes`
- CORS origins: `*`
- debug mode: controlled by `DEBUG` env var (default `false`)

## Assumptions and Limitations

- The structure detector is tuned for FE-style sheets and may need adjustment for very different layouts.
- `.xlsx` handling is stronger than `.xls` because merged-cell metadata is only preserved in the `.xlsx` path.
- The backend keeps only the latest extraction in an in-memory cache — best suited for single-user or demo usage.
- User accounts in `/tmp/users.json` are wiped on Render redeploy unless a persistent disk is attached.
- OTPs are stored in memory and lost on server restart.

## Suggested Next Improvements

- Add PostgreSQL for permanent user storage
- Move extraction cache to Redis for multi-user support
- Add automated tests for parser and API routes
- Make academic year and semester configurable in PDF export
- Add Docker support
- Add rate limiting on OTP endpoints

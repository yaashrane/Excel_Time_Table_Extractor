# Excel Time Table Extractor

Excel Time Table Extractor is a Flask-based web application that reads a master Excel timetable, detects the timetable layout automatically, extracts structured class slots, builds faculty-wise schedules, and lets users download individual faculty timetables as PDFs from the browser.

The project is tuned for FE-style college timetable sheets where:

- a row contains `Day` and `Time`
- division headers look like `FE-A`, `FE-B`, etc.
- cells may contain merged rows, batch-wise classes, labs, tutorials, rooms, and faculty codes

## What the Program Does

1. Uploads an Excel file (`.xlsx` or `.xls`)
2. Reads every worksheet into a normalized 2D grid
3. Expands merged cells so repeated values are preserved
4. Detects the day column, time column, division columns, and data range
5. Parses each timetable cell into structured entries such as subject, faculty, batch, room, and class type
6. Builds teacher-wise schedules from the extracted timetable
7. Merges consecutive matching periods into multi-hour blocks
8. Shows the results in a browser and exports individual faculty timetables as PDF

## Key Features

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

## Tech Stack

- Backend: Flask, Flask-CORS
- Excel parsing: `openpyxl`, `pandas`, `numpy`
- Frontend: HTML, CSS, vanilla JavaScript
- PDF export: `jsPDF`, `jspdf-autotable` via CDN

## Processing Pipeline

### 1. App startup

- `app.py` creates the Flask app
- serves `index.html`, `style.css`, `script.js`, and `favicon.ico`
- registers the API blueprint from `api.py`

### 2. File upload

- `file_service.py` validates file extensions and stores uploads in `uploads/`
- files are saved with a UUID prefix to avoid name collisions

### 3. Excel extraction

- `extractor.py` loads workbook sheets into plain grids
- `.xlsx` files use `openpyxl` and preserve merged-cell information
- `.xls` files use a pandas fallback

### 4. Structure detection

- `structure_detector.py` finds the header row, day/time columns, division row, and data bounds
- detection is specifically tuned for FE timetable formats

### 5. Cell normalization

- `normalizer.py` parses timetable cell text into structured entries
- extracts batch, subject, faculty code, room, and class kind (`lecture`, `lab`, `tutorial`, `break`)

### 6. Timetable assembly

- `timetable_engine.py` processes all sheets into a flat timetable
- removes duplicate slots
- generates teacher-wise schedules
- returns validation stats and warnings

### 7. Teacher schedule generation

- `teacher_parser.py` groups extracted slots by faculty code
- `slot_merger.py` merges consecutive identical periods into longer blocks

### 8. Frontend rendering and export

- `script.js` uploads the file to `/api/extract`
- renders detected faculty, timetable stats, warnings, and faculty sheets
- exports the selected faculty timetable as PDF

## API Endpoints

### `GET /api/health`

Simple health check.

### `POST /api/extract`

Uploads an Excel file and returns the full extracted payload in one request.

### `POST /api/upload`

Uploads a file only, without running extraction.

### `GET /api/teachers`

Returns a summary of teachers from the latest extracted timetable.

### `GET /api/timetable/<teacher>`

Returns the timetable for one faculty code from the latest extracted result.

## Response Shape

The main extraction response contains:

```json
{
  "timetable": [],
  "teachers": {},
  "faculty_directory": {},
  "divisions": [],
  "days": [],
  "validation": {
    "valid": true,
    "warnings": [],
    "stats": {
      "total_slots": 0,
      "days": [],
      "unique_faculty": 0
    }
  }
}
```

Each teacher entry includes:

```json
{
  "code": "ST",
  "name": "Ms. Shilpa Tambe",
  "schedule": [],
  "total_classes": 0,
  "total_hours": 0
}
```

## Repository Structure

```text
Excel_Time_Table_Extractor/
|-- README.md                   # Project documentation
|-- app.py                      # Flask app entry point
|-- api.py                      # REST API routes
|-- config.py                   # App configuration
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
|-- index.html                  # Frontend markup
|-- style.css                   # Frontend styling
|-- script.js                   # Frontend logic and PDF export
|-- favicon.ico                 # App icon
|-- requirement.txt             # Python dependencies
|-- uploads/                    # Saved uploaded Excel files
|-- tests/                      # Test folder (currently no source tests)
|-- tmp*/                       # Temporary runtime folders
|-- __pycache__/                # Python bytecode cache
`-- timetable_                  # Empty placeholder file
```

## Setup

### 1. Create and activate a virtual environment

PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 2. Install dependencies

```powershell
pip install -r requirement.txt
```

### 3. Run the app

```powershell
python app.py
```

The app starts on:

```text
http://localhost:5000
```

## How to Use

1. Open the app in the browser
2. Upload the master timetable Excel file
3. Wait for extraction to complete
4. Select a faculty code from the sidebar
5. Review the generated timetable
6. Click `Download PDF` to export the faculty timetable

## Configuration Notes

Important defaults from `config.py`:

- upload limit: `16 MB`
- allowed extensions: `.xlsx`, `.xls`
- upload directory: `uploads/`
- CORS origins: `*`
- debug mode: enabled

## Assumptions and Limitations

- The structure detector is tuned for FE-style sheets and may need adjustment for very different layouts.
- `.xlsx` handling is stronger than `.xls` because merged-cell metadata is only preserved in the `.xlsx` path.
- Legacy `.xls` support may require `xlrd` in the environment, depending on the file and pandas engine behavior.
- The backend keeps only the latest extraction in an in-memory cache, so the API is currently best suited for single-user or demo usage.
- The frontend PDF layout currently uses fixed labels such as academic year and semester.
- The `tests/` folder exists, but there are no current source test files in the repository.

## Suggested Next Improvements

- Add automated tests for the parser and API routes
- Move the extraction cache to session storage or Redis
- Make academic year and semester configurable
- Add support for more timetable layouts and departments
- Add Docker support and production deployment settings

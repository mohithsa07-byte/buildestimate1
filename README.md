# BuildEstimate

A full-stack construction material & cost estimator built for a first-year
**Basic Civil Engineering** software project. Enter a building's built-up
area, number of floors, wall type and concrete grade — the app applies
standard thumb-rule civil engineering formulas and returns a full material
quantity and cost breakdown, plus a separate concrete mix design calculator.

```
buildestimate/
├── backend/    Node.js + Express API (calculation engine)
└── frontend/   React + Vite + Tailwind (interactive UI)
```

## 1. Run it locally

### Backend
```bash
cd backend
npm install
npm start          # runs on http://localhost:5050
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env   # points to the local backend
npm run dev             # runs on http://localhost:5173
```

Open `http://localhost:5173` — the estimator, concrete mix calculator, and
saved projects tabs are all live.

## 2. What it calculates

All formulas live in `backend/utils/formulas.js`, fully commented. Summary:

| Quantity | Method |
|---|---|
| Wall length | Perimeter from √(built-up area) + a partition-wall allowance based on room count |
| Bricks | Net wall volume × 500 bricks/m³ (standard thumb rule) |
| Cement & sand (masonry) | 1:6 mortar, 30% of wall volume, ×1.33 dry-volume factor |
| Plastering | 12 mm coat, 1:6 mix, ×1.27 dry-volume factor |
| RCC slab concrete | Nominal mix (IS 456 Table 9) for the chosen grade, ×1.54 dry-volume factor |
| Steel | 4.5 kg per sq.ft of built-up area (residential RCC thumb rule) |
| Cost | Quantities × editable rates in `backend/data/rates.json` |

These are **preliminary estimation formulas for academic demonstration**,
not a substitute for a detailed BOQ or a structural engineer's design.

## 3. Editing material rates

`GET/PUT /api/rates` reads and writes `backend/data/rates.json`. Update the
per-unit rates there (cement/bag, sand/cft, steel/kg, etc.) to match your
local market before a demo.

## 4. Deploying (free tier friendly)

**Backend → Render**
1. Push this repo to GitHub.
2. On Render: New → Web Service → point at `/backend`, build command
   `npm install`, start command `npm start`.

**Frontend → Vercel**
1. New Project → point at `/frontend`.
2. Set the environment variable `VITE_API_URL` to your deployed backend's
   `/api` URL (e.g. `https://buildestimate-api.onrender.com/api`).
3. Deploy — Vercel auto-detects the Vite build.

> **Note:** rates and saved projects are stored as JSON files in `backend/data/`.
> On Render's free tier the filesystem is ephemeral, so they reset on every
> redeploy/restart. Use a database (see section 6) for real persistence.
> `VITE_API_URL` must include the `/api` suffix.

## 5. API reference

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/estimate` | Full building estimate |
| POST | `/api/mix` | Concrete mix design for a given volume + grade |
| GET/PUT | `/api/rates` | Read/update material rates |
| GET/POST | `/api/projects` | List / save an estimate |
| DELETE | `/api/projects/:id` | Delete a saved estimate |

## 6. Suggested things to add for extra marks

- User accounts (JWT auth) so estimates are per-user
- PDF export of the estimate (e.g. with `pdf-lib` or the browser print stylesheet)
- Swap the JSON file storage for MongoDB/Postgres for a "real" database layer
- A boundary-wall / compound-wall module
- Unit tests for `formulas.js` (it's pure functions — easy to test with Jest/Vitest)

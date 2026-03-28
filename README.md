# KaufDa Deal Finder 🛒

I got tired of manually checking every supermarket app to find the best deals. So I built this instead.

It scrapes the KaufDa brochure API, stores everything in a database, and gives you a clean interface where you can either browse deals by store or search for a specific product across **all stores at once** — so you immediately know where to buy it cheapest.

![screenshot placeholder](<img width="1882" height="2930" alt="localhost_5173_ (1)" src="https://github.com/user-attachments/assets/69ffb87b-2952-4de5-a879-d9cfa9f7fe88" />)

---

## what it does

- click any store (Lidl, Rewe, Netto, Kaufland etc.) to see all their current deals
- type something like "Cola" or "Milch" in the search bar and it searches every store at the same time
- the cheapest result gets a green badge so you don't have to think about it
- filter by category, sort by discount % or price, set a minimum discount threshold
- hit the refresh button anytime to pull fresh data from KaufDa

---

## how it's built

this is a proper full-stack project — three separate parts that work together:

```
KaufDa API ──► scraper.py ──► MySQL database ──► Flask API ──► React frontend
```

**scraper** (`scraper/scraper.py`)
hits the KaufDa backend API (the same one their website uses internally), parses the JSON response, calculates discount percentages, and saves everything to MySQL. uses an upsert so running it multiple times doesn't create duplicates.

**backend** (`backend/app.py`)
a Flask REST API that sits between the database and the frontend. React can't talk directly to MySQL (browsers don't allow that), so Flask acts as the middleman. exposes a few endpoints like `/api/deals?store=Lidl` and `/api/scrape`.

**frontend** (`frontend/src/App.jsx`)
a React app that calls the Flask API and renders deal cards. the cross-store search fires all requests in parallel using `Promise.all()` so it's fast. each store has its own brand colors so the UI feels familiar.

---

## tech stack

| what          | why                                              |
|---------------|--------------------------------------------------|
| Python        | scraping and API — great for this kind of work  |
| requests      | fetching the KaufDa API                         |
| Flask         | lightweight API framework, easy to get running  |
| MySQL         | storing and querying deals                      |
| React         | interactive UI, state management                |
| Vite          | fast dev server for React                       |

---

## running it locally

you'll need Python 3, Node.js, and MySQL installed. on Mac I'd recommend DBngin for MySQL — it's the easiest.

**1. start MySQL** (via DBngin or however you have it set up)

**2. create the database**
```sql
CREATE DATABASE kaufda;
```

**3. run the scraper** — this creates the table and fetches deal data
```bash
cd scraper
pip3 install requests mysql-connector-python
python3 scraper.py
```

to scrape just one store:
```bash
python3 scraper.py Lidl
```

**4. start the Flask API**
```bash
cd backend
pip3 install -r requirements.txt
python3 app.py
```

**5. start the React frontend**
```bash
cd frontend
npm install
npm run dev
```

open `http://localhost:5173` and you're good to go.

---

## finding UUIDs for more stores

the scraper uses brochure UUIDs from the KaufDa API. the ones included work for my location (Wernigerode) — yours might differ.

to find them:
1. open kaufda.de in Chrome
2. open DevTools → Network tab
3. click on a store's brochure
4. look for a request like `GET /v1/brochures/{UUID}/pages`
5. copy that UUID and add it to `STORE_BROCHURES` in `scraper.py`

brochures change weekly when new deals come out, so you'll need to update UUIDs periodically. (a proper fix would be to auto-discover them from the KaufDa listing API — might add that later)

---

## API endpoints

once Flask is running you can call these directly too:

| endpoint | what it does |
|----------|-------------|
| `GET /api/deals?store=Lidl` | all deals for Lidl, sorted by discount |
| `GET /api/deals?store=Lidl&sort=price&min_disc=20` | deals with at least 20% off, sorted by price |
| `GET /api/categories?store=Lidl` | all product categories for Lidl |
| `GET /api/stores` | all stores with deal counts and last scraped date |
| `POST /api/scrape` body: `{"store":"Lidl"}` | trigger a fresh scrape |

---

## deploying (making it live)

if you want to host this properly for free:

- **database** → PlanetScale (free cloud MySQL)
- **backend** → Render.com (free Python hosting)
- **frontend** → Vercel (free React hosting, auto-deploys from GitHub)
- **scraping** → GitHub Actions (scheduled weekly, completely free)

update `API` in `App.jsx` to your Render URL, and set DB credentials as environment variables in Render. that's basically it.

---

## project structure

```
kaufda/
├── scraper/
│   └── scraper.py          fetches deals from KaufDa and saves to MySQL
├── backend/
│   ├── app.py              Flask REST API
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx         main React component
│   │   └── main.jsx        entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── .github/
│   └── workflows/
│       └── scrape.yml      GitHub Actions for auto scraping
├── .gitignore
└── README.md
```

---

## things i'd add next

- price history charts — track how a product's price changes week to week
- email/push notifications when something on your watchlist drops below a price
- auto-discovery of new brochure UUIDs so you don't have to update them manually
- mobile app version

---

built this as a portfolio project to practice web scraping, REST APIs, and full-stack development. the whole thing from idea to working app took a few days of on-and-off coding.

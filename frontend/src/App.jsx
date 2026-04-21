import { useState, useCallback } from "react"

// change this to your Render URL when you deploy
const API = "http://127.0.0.1:5001"

const STORES = ["Lidl", "Rewe", "Netto", "Müller", "Kaufland", "Penny"]

// each store has its own brand colors
const STORE_COLORS = {
  Lidl:     { bg: "#FFE000", text: "#E00024" },
  Rewe:     { bg: "#CC0007", text: "#fff" },
  Netto:    { bg: "#E30613", text: "#fff" },
  Müller:   { bg: "#E8001A", text: "#fff" },
  Kaufland: { bg: "#E3000F", text: "#fff" },
  Penny:    { bg: "#CC0000", text: "#fff" },
}


// small reusable components 

function DiscountBadge({ pct }) {
  if (!pct || pct <= 0) return null

  // color goes from green → orange → red based on how good the deal is
  const color = pct >= 50 ? "#C0392B" : pct >= 25 ? "#E67E22" : "#27AE60"

  return (
    <span style={{
      display:      "inline-block",
      background:   color + "18",
      color,
      border:       `1px solid ${color}40`,
      borderRadius: 6,
      fontSize:     11,
      fontWeight:   700,
      padding:      "2px 8px",
    }}>
      -{Math.round(pct)}%
    </span>
  )
}

function StorePill({ store }) {
  const colors = STORE_COLORS[store] || { bg: "#eee", text: "#333" }
  return (
    <span style={{
      display:      "inline-block",
      background:   colors.bg,
      color:        colors.text,
      borderRadius: 4,
      fontSize:     10,
      fontWeight:   700,
      padding:      "2px 8px",
    }}>
      {store}
    </span>
  )
}

function DealCard({ deal, isCheapest }) {
  const hasSaving = deal.regular_price && deal.regular_price > deal.sale_price
  const saving    = hasSaving
    ? (deal.regular_price - deal.sale_price).toFixed(2)
    : null

  return (
    <div
      style={{
        background:    "#fff",
        border:        isCheapest ? "2px solid #27AE60" : "1px solid #e8e8e8",
        borderRadius:  14,
        overflow:      "hidden",
        display:       "flex",
        flexDirection: "column",
        position:      "relative",
        transition:    "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform  = "translateY(-2px)"
        e.currentTarget.style.boxShadow  = "0 8px 24px rgba(0,0,0,0.09)"
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform  = "translateY(0)"
        e.currentTarget.style.boxShadow  = "none"
      }}
    >
      {/* green badge for cheapest result in search */}
      {isCheapest && (
        <div style={{
          position:     "absolute",
          top:          10,
          right:        10,
          background:   "#27AE60",
          color:        "#fff",
          fontSize:     9,
          fontWeight:   700,
          padding:      "3px 8px",
          borderRadius: 20,
          letterSpacing: "0.05em",
        }}>
          GÜNSTIGSTER
        </div>
      )}

      {/* product image */}
      {deal.image_url && (
        <div style={{
          height:         130,
          background:     "#f8f8f8",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          overflow:       "hidden",
        }}>
          <img
            src={deal.image_url}
            alt={deal.name}
            style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
            onError={e => { e.target.style.display = "none" }}
          />
        </div>
      )}

      {/* card content */}
      <div style={{ padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <DiscountBadge pct={deal.discount_pct} />
          {saving && (
            <span style={{ fontSize: 11, color: "#999" }}>spare €{saving}</span>
          )}
        </div>

        <p style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.4, margin: 0 }}>
          {deal.name}
        </p>

        {deal.description && (
          <p style={{ fontSize: 11, color: "#999", margin: 0, lineHeight: 1.4 }}>
            {deal.description.length > 65
              ? deal.description.slice(0, 65) + "…"
              : deal.description}
          </p>
        )}

        {/* price */}
        <div style={{ marginTop: "auto", paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>
              €{deal.sale_price.toFixed(2)}
            </span>
            {hasSaving && (
              <span style={{ fontSize: 13, color: "#ccc", textDecoration: "line-through" }}>
                €{deal.regular_price.toFixed(2)}
              </span>
            )}
          </div>
          {deal.price_per_unit && (
            <p style={{ fontSize: 10, color: "#bbb", margin: "2px 0 0" }}>
              {deal.price_per_unit}
            </p>
          )}
        </div>

        {/* store pill + shop link */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <StorePill store={deal.store} />
          {deal.product_url && (
            <a
              href={deal.product_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: "#4A90D9", textDecoration: "none" }}
            >
              Shop →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: "#f5f5f2", borderRadius: 10, padding: "12px 18px", flex: 1 }}>
      <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>{value}</div>
    </div>
  )
}


// main app 

export default function App() {
  const [activeStore,    setActiveStore]    = useState(null)
  const [mode,           setMode]           = useState("store")   // "store" or "search"
  const [deals,          setDeals]          = useState([])
  const [searchResults,  setSearchResults]  = useState([])
  const [categories,     setCategories]     = useState([])
  const [category,       setCategory]       = useState("")
  const [sort,           setSort]           = useState("discount")
  const [minDisc,        setMinDisc]        = useState(0)
  const [searchQuery,    setSearchQuery]    = useState("")
  const [loading,        setLoading]        = useState(false)
  const [searching,      setSearching]      = useState(false)
  const [scraping,       setScraping]       = useState(false)
  const [lastScraped,    setLastScraped]    = useState(null)
  const [error,          setError]          = useState("")


  // load deals for a specific store
  const loadDeals = useCallback(async (store, opts = {}) => {
    setLoading(true)
    setError("")

    try {
      const params = new URLSearchParams({
        store,
        sort:     opts.sort     ?? sort,
        min_disc: opts.minDisc  ?? minDisc,
        limit:    200,
      })

      if (opts.category ?? category) {
        params.set("category", opts.category ?? category)
      }

      const res  = await fetch(`${API}/api/deals?${params}`)
      if (!res.ok) throw new Error(`server error ${res.status}`)

      const data = await res.json()
      setDeals(data)

      if (data.length > 0) setLastScraped(data[0].scraped_date)

      // also load categories for the filter dropdown
      const catRes  = await fetch(`${API}/api/categories?store=${store}`)
      const catData = await catRes.json()
      setCategories(catData)

    } catch (e) {
      setError(`couldn't load deals: ${e.message}`)
      setDeals([])
    } finally {
      setLoading(false)
    }
  }, [sort, minDisc, category])


  // search across all stores at once
  const searchAllStores = async () => {
    if (!searchQuery.trim()) return

    setSearching(true)
    setError("")
    setSearchResults([])

    try {
      // fire all store requests at the same time
      const responses = await Promise.all(
        STORES.map(store =>
          fetch(`${API}/api/deals?store=${store}&limit=200`)
            .then(r => r.json())
            .catch(() => [])
        )
      )

      const q   = searchQuery.toLowerCase()
      const all = responses
        .flat()
        .filter(d =>
          d.name?.toLowerCase().includes(q) ||
          d.description?.toLowerCase().includes(q) ||
          d.category?.toLowerCase().includes(q)
        )
        .sort((a, b) => a.sale_price - b.sale_price)  // cheapest first

      setSearchResults(all)
      setMode("search")

    } catch (e) {
      setError(`search failed: ${e.message}`)
    } finally {
      setSearching(false)
    }
  }


  // trigger a fresh scrape for the active store
  const refreshStore = async () => {
    if (!activeStore) return
    setScraping(true)

    try {
      await fetch(`${API}/api/scrape`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ store: activeStore }),
      })
      await loadDeals(activeStore)
    } catch (e) {
      setError(`refresh failed: ${e.message}`)
    } finally {
      setScraping(false)
    }
  }


  const handleStoreClick = (store) => {
    setActiveStore(store)
    setMode("store")
    setCategory("")
    setSearchResults([])
    loadDeals(store, { category: "" })
  }


  // stats for the store view
  const avgDisc  = deals.length
    ? Math.round(deals.reduce((a, d) => a + d.discount_pct, 0) / deals.length)
    : 0
  const bestDisc = deals.length
    ? Math.round(Math.max(...deals.map(d => d.discount_pct)))
    : 0

  const storeColor   = activeStore ? STORE_COLORS[activeStore] : null
  const cheapestId   = searchResults[0]?.id   // first result is always cheapest


  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f0", fontFamily: "'DM Sans', sans-serif" }}>

      {/* header — changes color to match active store */}
      <div style={{
        background: storeColor && mode === "store" ? storeColor.bg : "#1a1a1a",
        padding:    "24px 32px 22px",
        transition: "background 0.3s",
      }}>
        <h1 style={{
          margin:        0,
          fontSize:      28,
          fontWeight:    800,
          letterSpacing: "-0.02em",
          color:         storeColor && mode === "store" ? storeColor.text : "#fff",
        }}>
          KaufDa Deal Finder
        </h1>
        <p style={{
          margin:  "4px 0 0",
          fontSize: 13,
          color:   storeColor && mode === "store" ? storeColor.text + "aa" : "#ffffff77",
        }}>
          click a store to browse — or search a product across all stores
        </p>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 60px" }}>

        {/* search bar */}
        <div style={{
          display:      "flex",
          gap:          10,
          background:   "#fff",
          border:       "1px solid #e5e5e5",
          borderRadius: 14,
          padding:      "12px 16px",
          alignItems:   "center",
          marginBottom: 20,
        }}>
          <span style={{ fontSize: 16, opacity: 0.4 }}>🔍</span>
          <input
            type="text"
            placeholder='search e.g. "Cola", "Milch", "Hähnchen" ...'
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && searchAllStores()}
            style={{
              flex:       1,
              border:     "none",
              outline:    "none",
              fontSize:   14,
              background: "transparent",
              color:      "#1a1a1a",
            }}
          />
          <button
            onClick={searchAllStores}
            disabled={searching}
            style={{
              padding:      "8px 18px",
              borderRadius: 8,
              background:   "#1a1a1a",
              color:        "#fff",
              border:       "none",
              fontSize:     13,
              fontWeight:   600,
              cursor:       searching ? "not-allowed" : "pointer",
              opacity:      searching ? 0.6 : 1,
            }}
          >
            {searching ? "searching..." : "search all stores"}
          </button>
        </div>

        {/* store buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24, alignItems: "center" }}>
          {STORES.map(store => {
            const sc       = STORE_COLORS[store] || { bg: "#eee", text: "#333" }
            const isActive = store === activeStore && mode === "store"

            return (
              <button
                key={store}
                onClick={() => handleStoreClick(store)}
                style={{
                  padding:      "9px 22px",
                  borderRadius: 50,
                  fontWeight:   700,
                  fontSize:     14,
                  cursor:       "pointer",
                  border:       isActive ? "none" : "1.5px solid #ddd",
                  background:   isActive ? sc.bg : "#fff",
                  color:        isActive ? sc.text : "#555",
                  transition:   "all 0.15s",
                  outline:      "none",
                  boxShadow:    isActive ? "0 4px 14px rgba(0,0,0,0.12)" : "none",
                }}
              >
                {store}
              </button>
            )
          })}

          {/* refresh button — only shows when a store is active */}
          {activeStore && mode === "store" && (
            <button
              onClick={refreshStore}
              disabled={scraping}
              style={{
                marginLeft:   "auto",
                padding:      "9px 18px",
                borderRadius: 50,
                fontSize:     13,
                fontWeight:   600,
                cursor:       scraping ? "not-allowed" : "pointer",
                border:       "1.5px solid #ddd",
                background:   "#fff",
                color:        scraping ? "#bbb" : "#444",
              }}
            >
              {scraping ? "refreshing..." : "↻ refresh"}
            </button>
          )}
        </div>

        {/* error message */}
        {error && (
          <div style={{
            background:   "#fff5f5",
            border:       "1px solid #ffd5d5",
            borderRadius: 8,
            padding:      "10px 16px",
            color:        "#c0392b",
            fontSize:     13,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}


        {/* ── SEARCH RESULTS ── */}
        {mode === "search" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>
                {searchResults.length} results for "{searchQuery}"
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: "#999" }}>
                sorted by lowest price — green border = best deal
              </p>
            </div>

            {searchResults.length === 0 && !searching && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb" }}>
                <p style={{ fontSize: 15 }}>nothing found — try a different keyword</p>
              </div>
            )}

            <div style={{
              display:               "grid",
              gridTemplateColumns:   "repeat(auto-fill, minmax(200px, 1fr))",
              gap:                   16,
            }}>
              {searchResults.map(d => (
                <DealCard
                  key={`${d.store}-${d.id}`}
                  deal={d}
                  isCheapest={d.id === cheapestId}
                />
              ))}
            </div>
          </>
        )}


        {/* ── STORE VIEW ── */}
        {mode === "store" && (
          <>
            {/* filters */}
            {activeStore && (
              <div style={{
                display:      "flex",
                flexWrap:     "wrap",
                gap:          10,
                alignItems:   "center",
                marginBottom: 20,
              }}>
                <select
                  value={sort}
                  onChange={e => { setSort(e.target.value); loadDeals(activeStore, { sort: e.target.value }) }}
                  style={selectStyle}
                >
                  <option value="discount">highest discount</option>
                  <option value="price">lowest price</option>
                  <option value="saving">biggest saving</option>
                </select>

                {categories.length > 0 && (
                  <select
                    value={category}
                    onChange={e => { setCategory(e.target.value); loadDeals(activeStore, { category: e.target.value }) }}
                    style={selectStyle}
                  >
                    <option value="">all categories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}

                <label style={{ fontSize: 13, color: "#666", display: "flex", alignItems: "center", gap: 6 }}>
                  min discount
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={minDisc}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setMinDisc(v)
                      loadDeals(activeStore, { minDisc: v })
                    }}
                    style={{ ...selectStyle, width: 60 }}
                  />
                  %
                </label>

                {lastScraped && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#bbb" }}>
                    last updated: {lastScraped}
                  </span>
                )}
              </div>
            )}

            {/* stats */}
            {deals.length > 0 && !loading && (
              <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                <StatCard label="deals found"   value={deals.length} />
                <StatCard label="avg discount"  value={`${avgDisc}%`} />
                <StatCard label="best deal"     value={`${bestDisc}%`} />
              </div>
            )}

            {/* loading state */}
            {loading && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb", fontSize: 14 }}>
                loading deals...
              </div>
            )}

            {/* empty state */}
            {!loading && activeStore && deals.length === 0 && !error && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb" }}>
                <p style={{ fontSize: 14 }}>
                  no deals found — try clicking "refresh" to fetch latest data
                </p>
              </div>
            )}

            {/* welcome state */}
            {!activeStore && (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#ccc" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🏪</div>
                <p style={{ fontSize: 15 }}>pick a store above or search for a product</p>
              </div>
            )}

            {/* deal grid */}
            {!loading && deals.length > 0 && (
              <div style={{
                display:             "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap:                 16,
              }}>
                {deals.map(d => (
                  <DealCard key={d.id} deal={d} isCheapest={false} />
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}

const selectStyle = {
  padding:      "7px 12px",
  borderRadius: 8,
  border:       "1.5px solid #e0e0e0",
  background:   "#fff",
  fontSize:     13,
  color:        "#333",
  outline:      "none",
  cursor:       "pointer",
}

from flask import Flask, jsonify, request
from flask_cors import CORS
import mysql.connector
import os
import logging

app = Flask(__name__)

# add your Vercel URL here when you deploy
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173"
).split(",")
CORS(app, origins=ALLOWED_ORIGINS)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB = {
    "host":               os.getenv("DB_HOST",     "127.0.0.1"),
    "user":               os.getenv("DB_USER",     "root"),
    "password":           os.getenv("DB_PASSWORD", ""),
    "database":           os.getenv("DB_NAME",     "kaufda"),
    "connection_timeout": 10,
}

ALLOWED_SORT = {
    "discount": "discount_pct DESC",
    "price":    "sale_price ASC",
    "saving":   "(regular_price - sale_price) DESC",
}


ALLOWED_STORES = {
    "Lidl", "Rewe", "Netto", "Müller",
    "Kaufland", "Penny", "Fressnapf", "Aldi",
}

MAX_LIMIT = 500  # cap results so nobody requests 999999 rows


def get_connection():
    return mysql.connector.connect(**DB)


def run_query(sql, params=None):
    conn = None
    try:
        conn = get_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute(sql, params or ())
        rows = cur.fetchall()
        cur.close()

        # Decimal isn't JSON serializable — convert to float
        for row in rows:
            for key, val in row.items():
                if hasattr(val, "__float__"):
                    row[key] = float(val)

        return rows

    except mysql.connector.Error as e:
        logger.error(f"database error: {e}")
        raise

    finally:
        # always close connection even if something crashes
        if conn and conn.is_connected():
            conn.close()


# endpoints 

@app.route("/api/stores")
def get_stores():
    try:
        rows = run_query("""
            SELECT
                store,
                COUNT(*)                    AS total_deals,
                ROUND(AVG(discount_pct), 1) AS avg_discount,
                MAX(scraped_date)           AS last_scraped
            FROM deals
            GROUP BY store
            ORDER BY store
        """)
        return jsonify(rows)
    except Exception:
        return jsonify({"error": "could not load stores"}), 500


@app.route("/api/deals")
def get_deals():
    store    = request.args.get("store", "").strip()
    sort     = request.args.get("sort", "discount").strip()
    category = request.args.get("category", "").strip()
    min_disc = request.args.get("min_disc", 0, type=float)
    limit    = request.args.get("limit", 200, type=int)

    if not store:
        return jsonify({"error": "store param is required"}), 400
    if store not in ALLOWED_STORES:
        return jsonify({"error": "unknown store"}), 400

    order_by = ALLOWED_SORT.get(sort, ALLOWED_SORT["discount"])

    # SECURITY: clamp numbers to safe ranges
    min_disc = max(0.0, min(100.0, min_disc))
    limit    = max(1,   min(MAX_LIMIT, limit))

    cat_filter = "AND category = %s" if category else ""

    sql = f"""
        SELECT
            id, store, name, description, category,
            sale_price, regular_price, discount_pct,
            price_per_unit, image_url, product_url, scraped_date
        FROM deals
        WHERE store = %s
          AND scraped_date = (
              SELECT MAX(scraped_date) FROM deals WHERE store = %s
          )
          AND discount_pct >= %s
          {cat_filter}
        ORDER BY {order_by}
        LIMIT %s
    """

    params = [store, store, min_disc]
    if category:
        params.append(category)
    params.append(limit)

    try:
        return jsonify(run_query(sql, params))
    except Exception:
        return jsonify({"error": "could not load deals"}), 500


@app.route("/api/categories")
def get_categories():
    store = request.args.get("store", "").strip()

    if not store or store not in ALLOWED_STORES:
        return jsonify([])

    try:
        rows = run_query("""
            SELECT DISTINCT category
            FROM deals
            WHERE store = %s
            ORDER BY category
        """, [store])
        return jsonify([r["category"] for r in rows])
    except Exception:
        return jsonify([])


@app.route("/api/scrape", methods=["POST"])
def trigger_scrape():
    body = request.get_json(force=True, silent=True)

    if not body:
        return jsonify({"error": "invalid JSON body"}), 400

    store = body.get("store", "").strip()

    if not store:
        return jsonify({"error": "store is required"}), 400
    if store not in ALLOWED_STORES:
        return jsonify({"error": "unknown store"}), 400

    import sys
    scraper_path = os.path.join(os.path.dirname(__file__), "../scraper")
    if scraper_path not in sys.path:
        sys.path.insert(0, scraper_path)

    try:
        import scraper
        deals = scraper.scrape_store(store)
        return jsonify({"ok": True, "store": store, "deals_saved": len(deals)})
    except Exception as e:
        logger.error(f"scrape failed for {store}: {e}")
        # return a generic message — don't leak internal errors
        return jsonify({"ok": False, "error": "scrape failed"}), 500


# global error handlers 
# these catch unhandled exceptions and return clean JSON
# instead of leaking Python stack traces to the browser

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "endpoint not found"}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "method not allowed"}), 405

@app.errorhandler(500)
def server_error(e):
    logger.error(f"unhandled error: {e}")
    return jsonify({"error": "something went wrong"}), 500


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(debug=debug_mode, port=5001)

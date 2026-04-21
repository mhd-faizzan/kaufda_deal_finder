import requests
import mysql.connector
from datetime import date
import os
import sys


LAT = os.getenv("LAT", "51.8368113")   #city coordinates
LNG = os.getenv("LNG", "10.7844266")

DB = {
    "host":     os.getenv("DB_HOST",     "127.0.0.1"),
    "user":     os.getenv("DB_USER",     "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME",     "kaufda"),
}

# these UUIDs come from the KaufDa backend API
STORE_BROCHURES = {
    "Lidl":     "00bcb384-5d81-4a51-9e58-c74cbf8ad7b4",
    "Rewe":     "a3d4dbb4-1d82-4789-adb8-ac625c6fbd71",
    "Netto":    "cf784ebf-0a64-4fdd-9324-f7e64a14910d",
    "Müller":   "d59312e8-2ee8-483d-a56c-3ec4d05dd573",
    "Kaufland": "3d27dba1-392f-4dcd-9b42-5075ec8dd74d",
    "Penny":    "dd18c3cc-4a06-412a-a997-84d4c85ef93c",
    # add more stores here as you find their UUIDs
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept":     "application/json",
    "Referer":    "https://www.kaufda.de/",
}

BASE_URL = "https://content-viewer-be.kaufda.de/v1/brochures/{uuid}/pages"



def fetch_store(store_name, uuid):
    """hit the kaufda API and return a clean list of deals"""

    url = BASE_URL.format(uuid=uuid)
    params = {
        "partner":     "kaufda_web",
        "brochureKey": "",
        "lat":         LAT,
        "lng":         LNG,
    }

    response = requests.get(url, headers=HEADERS, params=params, timeout=15)
    response.raise_for_status()

    pages = response.json().get("contents", [])
    deals = []

    for page in pages:
        for offer_wrap in page.get("offers", []):
            deal = parse_offer(offer_wrap, store_name)
            if deal:
                deals.append(deal)

    return deals


def parse_offer(offer_wrap, store_name):
    """pull out the fields we care about from one offer"""

    content   = offer_wrap.get("content", {})
    products  = content.get("products", [])
    deal_list = content.get("deals", [])

    if not products:
        return None

    product = products[0]
    name    = product.get("name", "").strip()

    if not name:
        return None

    # description is a list of paragraphs, join them
    desc = " ".join(
        p.get("paragraph", "")
        for p in product.get("description", [])
    ).strip()

    # category — last path entry is the most specific one
    cat_paths = product.get("categoryPaths", [])
    category  = cat_paths[-1]["name"] if cat_paths else "Sonstiges"

    # grab first product image
    imgs  = product.get("images", [])
    image = imgs[0]["url"] if imgs else content.get("image", "")

    # find sale price and regular price from the deals array
    sale_price = None
    reg_price  = None

    for d in deal_list:
        deal_type = d.get("type", "")
        currency  = d.get("currencyCode", "")

        if deal_type == "SALES_PRICE" and currency == "EUR":
            sale_price = d.get("min") or d.get("max")

        elif deal_type in ("REGULAR_PRICE", "RECOMMENDED_RETAIL_PRICE") and currency == "EUR":
            reg_price = d.get("min") or d.get("max")

    # skip if no sale price found
    if sale_price is None:
        return None

    # calculate discount %
    # sometimes kaufda gives it directly, otherwise we calculate it
    disc_label = content.get("discountLabel", {})

    if disc_label.get("type") == "DISCOUNT_PERCENTAGE":
        discount_pct = float(disc_label["value"])
    elif reg_price and reg_price > sale_price:
        discount_pct = round((1 - sale_price / reg_price) * 100, 1)
    else:
        discount_pct = 0.0

    # unit price like "1 kg = 2.98"
    price_per_unit = next(
        (d.get("priceByBaseUnit", "") for d in deal_list if d.get("priceByBaseUnit")),
        ""
    )

    # direct product link if available
    link_outs   = content.get("linkOuts", [])
    product_url = link_outs[0]["webUrl"] if link_outs else ""

    return {
        "store":          store_name,
        "name":           name,
        "description":    desc,
        "category":       category,
        "sale_price":     float(sale_price),
        "regular_price":  float(reg_price) if reg_price else None,
        "discount_pct":   discount_pct,
        "price_per_unit": price_per_unit,
        "image_url":      image,
        "product_url":    product_url,
        "scraped_date":   str(date.today()),
    }



def get_connection():
    return mysql.connector.connect(**DB)


def setup_database():
    """create the deals table if it doesn't exist yet"""

    conn = get_connection()
    cur  = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS deals (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            store           VARCHAR(100)  NOT NULL,
            name            VARCHAR(500)  NOT NULL,
            description     TEXT,
            category        VARCHAR(200),
            sale_price      DECIMAL(10,2) NOT NULL,
            regular_price   DECIMAL(10,2),
            discount_pct    DECIMAL(5,1)  DEFAULT 0,
            price_per_unit  VARCHAR(100),
            image_url       TEXT,
            product_url     TEXT,
            scraped_date    DATE          NOT NULL,
            created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_deal (store, name, scraped_date)
        )
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("database is ready")


def save_deals(deals):
    """upsert deals — insert new ones, update existing ones"""

    if not deals:
        print("  nothing to save")
        return

    conn = get_connection()
    cur  = conn.cursor()

    sql = """
        INSERT INTO deals
            (store, name, description, category, sale_price, regular_price,
             discount_pct, price_per_unit, image_url, product_url, scraped_date)
        VALUES
            (%(store)s, %(name)s, %(description)s, %(category)s, %(sale_price)s,
             %(regular_price)s, %(discount_pct)s, %(price_per_unit)s,
             %(image_url)s, %(product_url)s, %(scraped_date)s)
        ON DUPLICATE KEY UPDATE
            sale_price     = VALUES(sale_price),
            regular_price  = VALUES(regular_price),
            discount_pct   = VALUES(discount_pct),
            price_per_unit = VALUES(price_per_unit),
            image_url      = VALUES(image_url),
            product_url    = VALUES(product_url)
    """

    cur.executemany(sql, deals)
    conn.commit()
    print(f"  saved {cur.rowcount} deals to database")

    cur.close()
    conn.close()


def scrape_store(store_name):
    uuid = STORE_BROCHURES.get(store_name)

    if not uuid:
        print(f"no UUID found for {store_name} — add it to STORE_BROCHURES")
        return []

    print(f"fetching {store_name}...")
    deals = fetch_store(store_name, uuid)
    print(f"  found {len(deals)} deals")
    save_deals(deals)
    return deals


def scrape_all():
    seen = set()

    for store, uuid in STORE_BROCHURES.items():
        if uuid in seen:
            print(f"skipping {store} — UUID already used by another store")
            continue
        seen.add(uuid)

        try:
            scrape_store(store)
        except Exception as e:
            print(f"  error scraping {store}: {e}")


if __name__ == "__main__":
    setup_database()

    if len(sys.argv) > 1:
        scrape_store(sys.argv[1])
    else:
        scrape_all()

"""Set up a flash sale for the k6 load test.

Creates one product with limited stock and N buyers. Each buyer has 1 unit in their cart and a login token, so
the load test measures only the checkout. Writes loadtest/.data/flash_sale.json (gitignored: it holds tokens).

Uses the backend's own services and settings (DATABASE_URL, JWT_SECRET from the repo .env or the environment),
so point it at a throwaway stack, not a database you care about.

    backend/.venv/Scripts/python loadtest/prepare_flash_sale.py --buyers 500 --stock 100
"""

import argparse
import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))  # reuse the backend's models and services

from app.core.security import create_access_token  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402
from app.schemas.product import ProductCreate  # noqa: E402
from app.services import cart_service, product_service  # noqa: E402

OUTPUT = ROOT / "loadtest" / ".data" / "flash_sale.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--buyers", type=int, default=500)
    parser.add_argument("--stock", type=int, default=100)
    args = parser.parse_args()

    run_id = uuid.uuid4().hex[:8]
    with SessionLocal() as db:
        product = product_service.create_product(
            db,
            ProductCreate(sku=f"FLASH-{run_id.upper()}", name="Flash sale item (load test)", price_paise=99_900,
                          initial_stock=args.stock),
            actor=None,
        )
        # Inserted directly: these accounts never log in (the hash is deliberately invalid), so there is no point
        # spending ~0.1 s of argon2 per user. They get tokens below instead.
        buyers = [User(email=f"flash-{run_id}-{i}@example.com", password_hash="!no-login") for i in range(args.buyers)]
        db.add_all(buyers)
        db.commit()
        for buyer in buyers:
            cart_service.add_item(db, buyer, product.id, 1)
        tokens = [create_access_token(buyer.id) for buyer in buyers]

    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps({"product_id": product.id, "sku": product.sku, "stock": args.stock, "tokens": tokens}))
    print(f"prepared {product.sku}: {args.stock} units, {args.buyers} buyers with 1 in their cart -> {OUTPUT}")


if __name__ == "__main__":
    main()

"""After the k6 run: check in the database that the flash sale never oversold.

Checks the product from loadtest/.data/flash_sale.json: units sold vs starting stock, final stock, and the
movement ledger replayed in order (stock must never have gone below zero at any point). Exits 1 on any problem.

    backend/.venv/Scripts/python loadtest/verify_flash_sale.py
"""

import json
import sys
from itertools import accumulate
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import func, select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import Inventory, InventoryMovement, OrderItem  # noqa: E402


def main() -> int:
    prepared = json.loads((ROOT / "loadtest" / ".data" / "flash_sale.json").read_text())
    product_id, stock = prepared["product_id"], prepared["stock"]
    with SessionLocal() as db:
        # One consistent snapshot for all the reads below. Under the default READ COMMITTED each statement sees the
        # latest commits, so if the server is still finishing requests the numbers can disagree with each other
        # (this happened on the first run: stock 99 but ledger total 98).
        db.connection(execution_options={"isolation_level": "REPEATABLE READ"})
        final = db.scalar(select(Inventory.quantity).where(Inventory.product_id == product_id))
        sold = db.scalar(select(func.coalesce(func.sum(OrderItem.quantity), 0)).where(OrderItem.product_id == product_id))
        orders = db.scalar(select(func.count(func.distinct(OrderItem.order_id))).where(OrderItem.product_id == product_id))
        deltas = db.scalars(
            select(InventoryMovement.delta).where(InventoryMovement.product_id == product_id).order_by(InventoryMovement.id)
        ).all()
    running = list(accumulate(deltas))

    oversold = max(0, sold - stock)
    print(f"product {prepared['sku']}: starting stock {stock}, sold {sold} in {orders} orders, final stock {final}")
    print(f"oversold units: {oversold}; lowest stock during the sale: {min(running)}; ledger total {running[-1]}")
    problems = [
        oversold and "sold more than the stock",
        final < 0 and "negative final stock",
        min(running) < 0 and "stock went negative during the sale",
        stock - final != sold and "stock change doesn't match units sold",
        running[-1] != final and "ledger total doesn't match stock",
    ]
    problems = [p for p in problems if p]
    print("RESULT:", "OK" if not problems else "FAILED: " + "; ".join(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

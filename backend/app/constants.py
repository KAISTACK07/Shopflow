"""Business limits shared by the Pydantic schemas and the database constraints."""

# SKU: upper-case letters/digits in hyphen-separated groups, e.g. "TSHIRT-BLK-M".
SKU_PATTERN = r"^[A-Z0-9]+(-[A-Z0-9]+)*$"
SKU_MIN_LENGTH = 3
SKU_MAX_LENGTH = 64

PRODUCT_NAME_MAX_LENGTH = 200
EMAIL_MAX_LENGTH = 254  # the practical maximum length of an email address (RFC 5321 path limit)

# A sane cap per cart line: stops typos like 10000 and limits how much stock one request can lock up.
MAX_CART_ITEM_QUANTITY = 100

DEFAULT_LOW_STOCK_THRESHOLD = 5

IDEMPOTENCY_KEY_MAX_LENGTH = 255

# Length only, no "must contain a symbol" rules (NIST SP 800-63B). The max stops huge inputs from
# being hashed on every login attempt.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

PRODUCT_DESCRIPTION_MAX_LENGTH = 5000
# ₹10,00,000 (in paise). A typo guard: nothing in this shop costs more, and it keeps totals far from overflow.
MAX_PRICE_PAISE = 100_000_000
# Initial stock / admin adjustments above this are almost certainly typos.
MAX_STOCK_QUANTITY = 1_000_000

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
SEARCH_QUERY_MAX_LENGTH = 100

MOVEMENT_NOTE_MAX_LENGTH = 500

SHIPPING_ADDRESS_MAX_LENGTH = 500

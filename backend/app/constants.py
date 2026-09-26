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

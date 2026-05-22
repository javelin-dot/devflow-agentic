"""ID generation. Mirrors server/src/db/index.ts newId() / nextReqId() so legacy IDs remain compatible."""

import secrets
import string

_ALPHABET = string.ascii_letters + string.digits


def new_id(prefix: str, length: int = 8) -> str:
    suffix = "".join(secrets.choice(_ALPHABET) for _ in range(length))
    return f"{prefix}_{suffix}"


def format_req_id(n: int) -> str:
    return str(n).zfill(6)

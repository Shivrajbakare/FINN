"""Replaceable artifact storage; keys never contain caller-controlled paths."""
from hashlib import sha256
import os
from pathlib import Path
import re
from typing import Protocol
from uuid import uuid4


class Storage(Protocol):
    def read(self, key: str) -> bytes: ...
    def write(self, raw: bytes, suffix: str) -> str: ...
    def delete(self, key: str) -> None: ...


class FileStorage:
    def __init__(self, root=None):
        self.root = Path(root or os.getenv("DOCUMENT_STORAGE_DIR", str(Path(__file__).resolve().parents[2] / "data" / "documents"))).resolve()

    def path(self, key):
        if not re.fullmatch(r"[a-f0-9]{64}\.(pdf|json)", key):
            raise ValueError("Invalid artifact key")
        return self.root / key

    def read(self, key):
        path = self.path(key)
        if path.stat().st_size > 25_000_000:
            raise ValueError("Artifact exceeds limit")
        raw = path.read_bytes()
        if sha256(raw).hexdigest() != key.split(".")[0]:
            raise ValueError("Artifact integrity check failed")
        return raw

    def write(self, raw, suffix):
        key = f"{sha256(raw).hexdigest()}.{suffix}"
        target = self.path(key)
        self.root.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f"{uuid4().hex}.tmp")
        try:
            temporary.write_bytes(raw)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        return key

    def delete(self, key):
        self.path(key).unlink(missing_ok=True)


def storage() -> Storage:
    return FileStorage()

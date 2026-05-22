"""MinIO object key conventions for documents and attachments."""

from __future__ import annotations

from devflow.core import storage


def doc_object_key(tenant_id: str, doc_id: str, version: int, ext: str = "") -> str:
    return f"{tenant_id}/documents/{doc_id}/v{version:04d}{ext}"


def attachment_object_key(tenant_id: str, req_id: str, attachment_id: str, filename: str) -> str:
    return f"{tenant_id}/attachments/{req_id}/{attachment_id}/{filename}"


def put_document_blob(
    tenant_id: str, doc_id: str, version: int, data: bytes, mime: str = "application/octet-stream"
) -> str:
    key = doc_object_key(tenant_id, doc_id, version)
    storage.put_bytes(key, data, content_type=mime)
    return key


def get_blob(object_key: str) -> bytes:
    return storage.get_bytes(object_key)

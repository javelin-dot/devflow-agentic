"""MinIO wrapper. All object I/O goes through here so we can swap backends later."""

from __future__ import annotations

import io
from collections.abc import Iterator
from datetime import timedelta

from minio import Minio
from minio.error import S3Error

from devflow.config import get_settings

_client: Minio | None = None


def get_minio() -> Minio:
    global _client
    if _client is None:
        s = get_settings()
        _client = Minio(
            endpoint=s.minio_endpoint,
            access_key=s.minio_access_key,
            secret_key=s.minio_secret_key,
            secure=s.minio_secure,
        )
    return _client


def ensure_bucket(bucket: str | None = None) -> str:
    s = get_settings()
    name = bucket or s.minio_bucket
    client = get_minio()
    if not client.bucket_exists(name):
        client.make_bucket(name)
    return name


def put_bytes(
    object_key: str,
    data: bytes,
    content_type: str = "application/octet-stream",
    bucket: str | None = None,
) -> str:
    bucket = ensure_bucket(bucket)
    get_minio().put_object(
        bucket,
        object_key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return object_key


def get_bytes(object_key: str, bucket: str | None = None) -> bytes:
    bucket = ensure_bucket(bucket)
    resp = get_minio().get_object(bucket, object_key)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()


def delete_object(object_key: str, bucket: str | None = None) -> None:
    bucket = ensure_bucket(bucket)
    try:
        get_minio().remove_object(bucket, object_key)
    except S3Error:
        pass


def stat_object(object_key: str, bucket: str | None = None) -> dict[str, object]:
    bucket = ensure_bucket(bucket)
    info = get_minio().stat_object(bucket, object_key)
    return {
        "size": info.size,
        "etag": info.etag,
        "content_type": info.content_type,
        "last_modified": info.last_modified,
    }


def presigned_get(object_key: str, expires_seconds: int = 3600, bucket: str | None = None) -> str:
    bucket = ensure_bucket(bucket)
    return get_minio().presigned_get_object(
        bucket, object_key, expires=timedelta(seconds=expires_seconds)
    )


def stream_object(object_key: str, bucket: str | None = None) -> Iterator[bytes]:
    bucket = ensure_bucket(bucket)
    resp = get_minio().get_object(bucket, object_key)
    try:
        for chunk in resp.stream(64 * 1024):
            yield chunk
    finally:
        resp.close()
        resp.release_conn()

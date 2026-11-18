"""Upload validation: size limit and content sniffing (never trust the declared MIME type)."""

SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
)


def sniff_image_type(head: bytes) -> str | None:
    for sig, mime in SIGNATURES:
        if head.startswith(sig):
            return mime
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

"""Prepare the maintainer's real payment-code images without changing their payloads.

Offline only. Requires Pillow and zxing-cpp; never opens a payment URL or prints one.
The normal application build uses the checked-in sanitized PNGs, not these dependencies.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import io
import json
import math
from pathlib import Path
import sys
from urllib.parse import urlsplit

from PIL import Image
import zxingcpp

Image.MAX_IMAGE_PIXELS = 20_000_000
ROOT = Path(__file__).resolve().parents[1]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def decode_one(image: Image.Image):
    codes = zxingcpp.read_barcodes(image)
    if len(codes) != 1 or codes[0].format != zxingcpp.BarcodeFormat.QRCode:
        raise ValueError('Expected one readable QR symbol')
    return codes[0]


def prepare(method: str, path: Path) -> tuple[bytes, dict]:
    original = path.read_bytes()
    if len(original) > 16 * 1024 * 1024:
        raise ValueError('Payment image exceeds the input budget')
    with Image.open(io.BytesIO(original)) as source:
        source.load()
        image = source.convert('RGB')
    code = decode_one(image)
    parsed = urlsplit(code.text)
    valid = parsed.scheme.lower() == 'wxp' if method == 'wechat' else (
        parsed.scheme.lower() == 'https' and parsed.hostname == 'qr.alipay.com'
        and parsed.username is None and parsed.password is None and parsed.port in (None, 443))
    if not valid:
        raise ValueError('Payment provider does not match the supplied method')
    payload_digest = digest(bytes(code.bytes))
    points = [getattr(code.position, name) for name in ('top_left', 'top_right', 'bottom_right', 'bottom_left')]
    left, right = min(p.x for p in points), max(p.x for p in points)
    top, bottom = min(p.y for p in points), max(p.y for p in points)
    # DENSO WAVE: Model 2 has 17 + 4*version modules and needs a 4-module quiet zone.
    # https://www.qrcode.com/en/about/version.html ; https://www.qrcode.com/en/howto/code.html
    qr_version = int(code.extra['Version'])
    if not 1 <= qr_version <= 40:
        raise ValueError('Unsupported QR version')
    margin = math.ceil(max(right - left, bottom - top) / (17 + 4 * qr_version) * 5)
    bounds = (max(0, left - margin), max(0, top - margin), min(image.width, right + margin), min(image.height, bottom + margin))
    cropped = image.crop(bounds)
    cropped.info.clear()  # EXIF, location, comments and other original metadata never ship.
    border = [cropped.getpixel((x, y)) for x in range(cropped.width) for y in (0, cropped.height - 1)]
    border += [cropped.getpixel((x, y)) for y in range(cropped.height) for x in (0, cropped.width - 1)]
    if any(min(pixel) < 235 for pixel in border):
        raise ValueError('Crop would retain clipped annotations or a nonwhite boundary')
    if digest(bytes(decode_one(cropped).bytes)) != payload_digest:
        raise ValueError('Crop changed the decoded payment payload')
    display = cropped.resize((300, 300), Image.Resampling.LANCZOS)
    if digest(bytes(decode_one(display).bytes)) != payload_digest:
        raise ValueError('The proposed 300px display is not reliably decodable')
    output = io.BytesIO()
    cropped.save(output, 'PNG', optimize=True)
    png = output.getvalue()
    with Image.open(io.BytesIO(png)) as check:
        check.load()
        if check.info or digest(bytes(decode_one(check.convert('RGB')).bytes)) != payload_digest:
            raise ValueError('Saved PNG verification failed')
    record = {
        'sourceSha256': digest(original), 'sourceSize': list(image.size), 'crop': list(bounds),
        'asset': f'src/renderer/assets/donation-{method}.png', 'assetSha256': digest(png),
        'assetSize': list(cropped.size), 'payloadSha256': payload_digest,
        'providerFormatConfirmed': True, 'payloadUnchanged': True, 'display300pxDecoded': True,
        'metadataStripped': True,
    }
    return png, record


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wechat', required=True, type=Path)
    parser.add_argument('--alipay', required=True, type=Path)
    parser.add_argument('--allow-public-distribution', action='store_true')
    parser.add_argument('--replace', action='store_true')
    args = parser.parse_args()
    if not args.allow_public_distribution:
        parser.error('Explicit permission for installer and public-source distribution is required')
    prepared = {method: prepare(method, getattr(args, method)) for method in ('wechat', 'alipay')}
    manifest_path = ROOT / 'build/donation-assets.json'
    if manifest_path.exists() and not args.replace:
        prior = json.loads(manifest_path.read_text(encoding='utf-8'))
        if any(prior.get('codes', {}).get(method, {}).get('sourceSha256') != record['sourceSha256'] for method, (_, record) in prepared.items()):
            raise ValueError('Refusing to replace previously approved payment images')
    for png, record in prepared.values():
        target = ROOT / record['asset']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(png)
        if digest(target.read_bytes()) != record['assetSha256']:
            raise ValueError('Written image differs from the verified bytes')
    manifest = {
        'source': 'Two real QR images supplied by the user in this conversation',
        'distributionPermission': {'installer': True, 'publicSource': True},
        'permissionSource': 'Explicit user confirmation followed by the two supplied images',
        'decoder': {'name': 'zxing-cpp', 'version': version('zxing-cpp')},
        'verifiedAtUtc': datetime.now(timezone.utc).isoformat(),
        'operation': 'Lossless crop with quiet margin, RGB PNG encoding and metadata removal; no QR regeneration',
        'paymentAttempted': False, 'paymentAddressOpened': False, 'recipientIdentityVerified': False,
        'codes': {method: record for method, (_, record) in prepared.items()},
    }
    manifest_path.write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    print(json.dumps({'verifiedCodes': len(prepared), 'payloadsUnchanged': True, 'display300pxDecoded': True,
                      'assets': [record['asset'] for _, record in prepared.values()],
                      'paymentAttempted': False, 'paymentAddressOpened': False}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # A parser/provider exception must never echo a QR address or its opaque identifiers.
        print(f'QR asset preparation failed ({type(error).__name__}); no payment was attempted.', file=sys.stderr)
        raise SystemExit(1)

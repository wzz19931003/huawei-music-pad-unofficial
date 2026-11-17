"""Offline integrity check for the two bundled user-supplied donation PNGs."""
import hashlib
import json
from pathlib import Path

from PIL import Image
import zxingcpp

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'build/donation-assets.json').read_text(encoding='utf-8'))
observed = []
for method in ('wechat', 'alipay'):
    record = manifest['codes'][method]
    expected_path = f'src/renderer/assets/donation-{method}.png'
    assert record['asset'] == expected_path, 'Unexpected payment-image path'
    path = root / expected_path
    assert hashlib.sha256(path.read_bytes()).hexdigest() == record['assetSha256'], 'Payment-image bytes changed'
    with Image.open(path) as image:
        image.load()
        assert not image.info, 'Private original metadata must not ship'
        rgb = image.convert('RGB')
        border = [rgb.getpixel((x, y)) for x in range(rgb.width) for y in (0, rgb.height - 1)]
        border += [rgb.getpixel((x, y)) for y in range(rgb.height) for x in (0, rgb.width - 1)]
        assert all(min(pixel) >= 235 for pixel in border), f'{method}: clipped annotations or nonwhite image boundary'
        for size in (None, 300):
            rendered = rgb if size is None else rgb.resize((size, size), Image.Resampling.LANCZOS)
            codes = zxingcpp.read_barcodes(rendered)
            assert len(codes) == 1, f'{method}: image must decode as one symbol'
            assert hashlib.sha256(bytes(codes[0].bytes)).hexdigest() == record['payloadSha256'], f'{method}: changed payment data'
        observed.append({'method': method, 'pngBytesBound': True, 'metadataAbsent': True, 'whiteBoundary': True,
                         'originalAnd300pxPayloadsMatch': True})
print(json.dumps({'checks': observed, 'paymentAttempted': False, 'paymentAddressOpened': False}))

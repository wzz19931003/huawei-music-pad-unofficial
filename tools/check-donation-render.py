"""Decode a screenshot of the real rendered QR element without opening its URL."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image
import zxingcpp

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('method', choices=('wechat', 'alipay'))
parser.add_argument('image', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'build/donation-assets.json').read_text(encoding='utf-8'))
with Image.open(args.image) as image:
    image.load()
    codes = zxingcpp.read_barcodes(image.convert('RGB'))
assert len(codes) == 1, 'Rendered payment image did not decode as a single symbol'
assert hashlib.sha256(bytes(codes[0].bytes)).hexdigest() == manifest['codes'][args.method]['payloadSha256'], 'Rendered payment payload differs from the supplied code'
print(json.dumps({'method': args.method, 'renderedPayloadMatches': True, 'paymentAddressOpened': False}))

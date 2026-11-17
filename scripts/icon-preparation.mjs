// BGRA matches Electron nativeImage.toBitmap()/createFromBitmap().
// Flood only the edge-connected ivory presentation matte: enclosed ivory is the mark.
export function prepareIconBitmap(input, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3
      || width > 4096 || height > 4096 || !(input instanceof Uint8Array)
      || input.length !== width * height * 4) throw new Error('Invalid icon bitmap');
  const bitmap = Buffer.from(input);
  const count = width * height;
  const exterior = new Uint8Array(count);
  const queue = new Uint32Array(count);
  let head = 0, tail = 0;
  const isMatte = pixel => {
    const offset = pixel * 4;
    const blue = bitmap[offset], green = bitmap[offset + 1], red = bitmap[offset + 2];
    return bitmap[offset + 3] < 8 || (Math.max(red, green, blue) - Math.min(red, green, blue) < 60 && red - green < 32);
  };
  const visit = pixel => {
    if (exterior[pixel] || !isMatte(pixel)) return;
    exterior[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const pixel = queue[head++], x = pixel % width, y = Math.floor(pixel / width);
    if (x > 0) visit(pixel - 1);
    if (x + 1 < width) visit(pixel + 1);
    if (y > 0) visit(pixel - width);
    if (y + 1 < height) visit(pixel + width);
  }
  // Remove at most a few source pixels of ivory-matted antialias fringe before resizing.
  // This affects the outer tile only, never an enclosed warm-ivory glyph.
  const inset = Math.floor(Math.min(width, height) / 384);
  for (let pass = 0; pass < inset; pass++) {
    const boundary = [];
    for (let pixel = 0; pixel < count; pixel++) {
      if (exterior[pixel]) continue;
      const x = pixel % width, y = Math.floor(pixel / width);
      if ((x > 0 && exterior[pixel - 1]) || (x + 1 < width && exterior[pixel + 1])
          || (y > 0 && exterior[pixel - width]) || (y + 1 < height && exterior[pixel + width])) boundary.push(pixel);
    }
    for (const pixel of boundary) exterior[pixel] = 1;
  }
  let left = width, top = height, right = -1, bottom = -1;
  for (let pixel = 0; pixel < count; pixel++) {
    if (exterior[pixel]) { bitmap.fill(0, pixel * 4, pixel * 4 + 4); continue; }
    if (!bitmap[pixel * 4 + 3]) continue;
    const x = pixel % width, y = Math.floor(pixel / width);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error('Icon contains no foreground');
  const croppedWidth = right - left + 1, croppedHeight = bottom - top + 1;
  const result = Buffer.alloc(croppedWidth * croppedHeight * 4);
  for (let y = 0; y < croppedHeight; y++) {
    const start = ((top + y) * width + left) * 4;
    bitmap.copy(result, y * croppedWidth * 4, start, start + croppedWidth * 4);
  }
  return { bitmap: result, width: croppedWidth, height: croppedHeight, crop: { left, top, right, bottom }, removedPixels: tail };
}

// The browser-side shrink that makes a new upload a WebP (client/src/utils/shrinkImage.js), run
// here with a stand-in canvas: a PNG or JPEG becomes a smaller WebP of at most 4096 px; a GIF, a
// WebP, a browser that cannot encode WebP, a WebP that is not clearly smaller, or any failure
// sends the original up instead. No browser, no network.
//
//   node --test server/test/shrink-image.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modulePath = pathToFileURL(path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'shrinkImage.js')).href;
let mod;
test.before(async () => { mod = await import(modulePath); });

// a stand-in browser: createImageBitmap reports a size, the canvas hands back what `encode` says
let drawn, bitmapSize, encode, bitmapFails;
globalThis.createImageBitmap = async () => {
  if (bitmapFails) throw new Error('not a picture');
  return { ...bitmapSize, close() {} };
};
globalThis.document = {
  createElement: () => {
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ drawImage: (bm, x, y, w, h) => { drawn = { w, h }; } }),
      toBlob: (cb, type, q) => cb(encode(type, q, canvas)),
    };
    return canvas;
  },
};

const file = (name, type, size) => new File([new Uint8Array(size)], name, { type, lastModified: 1700000000000 });
const webp = (size) => (type) => new Blob([new Uint8Array(size)], { type });
const reset = () => { drawn = null; bitmapSize = { width: 2000, height: 1000 }; bitmapFails = false; encode = webp(100); };

test('fitWithin keeps the longest side under the cap and never enlarges', () => {
  assert.deepStrictEqual(mod.fitWithin(8000, 4000), { width: 4096, height: 2048 });
  assert.deepStrictEqual(mod.fitWithin(3000, 6000), { width: 2048, height: 4096 });
  assert.deepStrictEqual(mod.fitWithin(1000, 500), { width: 1000, height: 500 });
  assert.deepStrictEqual(mod.fitWithin(5000, 1), { width: 4096, height: 1 });
  assert.strictEqual(mod.MAX_SIDE, 4096);
});

test('webpName swaps the extension and keeps the rest of the name', () => {
  assert.strictEqual(mod.webpName('Old Harbour.final.PNG'), 'Old Harbour.final.webp');
  assert.strictEqual(mod.webpName('map'), 'map.webp');
  assert.strictEqual(mod.webpName(''), 'image.webp');
});

test('a PNG becomes a smaller WebP, drawn at the capped size', async () => {
  reset();
  bitmapSize = { width: 8000, height: 4000 };
  const out = await mod.shrinkImage(file('map.png', 'image/png', 3_000_000));
  assert.strictEqual(out.type, 'image/webp');
  assert.strictEqual(out.name, 'map.webp');
  assert.strictEqual(out.size, 100);
  assert.deepStrictEqual(drawn, { w: 4096, h: 2048 });
});

test('a JPEG becomes a WebP too, at 0.85', async () => {
  reset();
  let quality;
  encode = (type, q) => { quality = q; return new Blob([new Uint8Array(500)], { type }); };
  const out = await mod.shrinkImage(file('photo.jpg', 'image/jpeg', 4000));
  assert.strictEqual(out.type, 'image/webp');
  assert.strictEqual(quality, 0.85);
});

test('a GIF (it may be animated) and a WebP go up as they are', async () => {
  reset();
  for (const [name, type] of [['spin.gif', 'image/gif'], ['already.webp', 'image/webp']]) {
    const f = file(name, type, 5000);
    assert.strictEqual(await mod.shrinkImage(f), f, name);
  }
  assert.strictEqual(drawn, null, 'never even decoded');
});

test('the original goes up when the WebP is not clearly smaller, or the browser cannot make one', async () => {
  reset();
  encode = webp(950); // 95% of the original: not worth a lossy re-encode
  const f = file('tiny.png', 'image/png', 1000);
  assert.strictEqual(await mod.shrinkImage(f), f);

  reset();
  encode = (type) => new Blob([new Uint8Array(10)], { type: 'image/png' }); // a browser without WebP encoding answers PNG
  assert.strictEqual(await mod.shrinkImage(f), f);

  reset();
  encode = () => null; // toBlob gave nothing
  assert.strictEqual(await mod.shrinkImage(f), f);
});

test('a picture the browser cannot read, or a missing file, never throws', async () => {
  reset();
  bitmapFails = true;
  const f = file('broken.png', 'image/png', 1000);
  assert.strictEqual(await mod.shrinkImage(f), f);
  assert.strictEqual(await mod.shrinkImage(null), null);
});

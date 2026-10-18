import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const nativeRequire = createRequire(import.meta.url);
const React = nativeRequire('react');
const { renderToStaticMarkup } = nativeRequire('react-dom/server');
const cssModule = new Proxy({}, { get: (_t, key) => (typeof key === 'string' ? key : undefined) });
const cache = new Map();
function load(path) {
  const url = new URL(path, import.meta.url).href;
  if (cache.has(url)) return cache.get(url);
  const { outputText } = ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const module = { exports: {} };
  cache.set(url, module.exports);
  const require = id => {
    if (id === 'react' || id.startsWith('react/')) return nativeRequire(id);
    if (id === 'next/link') return { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) };
    if (id.endsWith('.module.css')) return { __esModule: true, default: cssModule };
    if (id.startsWith('./')) return load(resolve(url, id));
    throw new Error(`Unexpected dependency ${id}`);
  };
  new vm.Script(outputText).runInContext(vm.createContext({ module, exports: module.exports, require, process: { env: {} }, URL }));
  Object.assign(cache.get(url), module.exports);
  return module.exports;
}
function resolve(from, id) {
  for (const ext of ['.tsx', '.ts']) { const candidate = new URL(`${id}${ext}`, from); try { readFileSync(candidate); return candidate.href; } catch { /* next */ } }
  throw new Error(`Cannot resolve ${id}`);
}
const Catalog = load('../src/components/commerce/Catalog.tsx').default;
const ProductGallery = load('../src/components/commerce/ProductGallery.tsx').default;
const types = load('../src/components/commerce/types.ts');
const productMedia = p => JSON.parse(JSON.stringify(types.productMedia(p)));
const { slideIndex } = load('../src/components/commerce/MediaCarousel.tsx');

const product = {
  id: '10000000-0000-4000-8000-0000000000e1', name: 'Fictional mug', slug: 'fictional-mug', description: null, price: 25000, stock: 3, is_active: true, created_at: '2026-10-18T00:00:00Z',
  image_url: 'https://example.invalid/front.jpg',
  commerce: { storefronts: ['general'], media: [{ url: 'https://example.invalid/back.jpg', type: 'image', alt: 'Back view' }, { url: 'https://example.invalid/front.jpg', type: 'image', alt: 'Front view' }, { url: 'https://example.invalid/demo.mp4', type: 'video', alt: 'Demo' }] },
};
const count = (html, needle) => html.split(needle).length - 1;

test('all media in order, primary first, duplicates removed', () => {
  assert.deepEqual(productMedia(product).map(m => [m.url.split('/').pop(), m.alt]), [['front.jpg', 'Front view'], ['back.jpg', 'Back view'], ['demo.mp4', 'Demo']]);
  assert.deepEqual(productMedia({ ...product, image_url: null }).map(m => m.url.split('/').pop()), ['back.jpg', 'front.jpg', 'demo.mp4']);
  assert.equal(slideIndex(530, 300, 2), 1); assert.equal(slideIndex(0, 0, 2), 0); assert.equal(slideIndex(9999, 300, 3), 2);
});
test('a grid card with two photos renders both as swipeable slides inside the product link, with dots', () => {
  const html = renderToStaticMarkup(React.createElement(Catalog, { products: [product], storefront: 'general' }));
  assert.equal(count(html, 'src="https://example.invalid/front.jpg"'), 1);
  assert.equal(count(html, 'src="https://example.invalid/back.jpg"'), 1);
  assert.doesNotMatch(html, /demo\.mp4/); // grid shows photos; videos play on the product page
  assert.match(html, /<a href="\/products\/fictional-mug\?storefront=general" aria-label="Fictional mug"[^>]*><div[^>]*aria-roledescription="carousel"/);
  assert.match(html, /loading="lazy"/);
  assert.equal(count(html, 'aria-label="Show photo '), 2);
  assert.match(html, /aria-label="Show photo 1 of 2" aria-current="true"/);
});
test('the product page gallery shows every media item in order, including video, with thumbnails', () => {
  const html = renderToStaticMarkup(React.createElement(ProductGallery, { product }));
  const order = ['front.jpg', 'back.jpg', 'demo.mp4'].map(name => html.indexOf(`src="https://example.invalid/${name}"`));
  assert.ok(order.every(i => i >= 0)); assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(html, /<video[^>]*src="https:\/\/example.invalid\/demo.mp4"[^>]*controls/);
  assert.equal(count(html, 'aria-label="View '), 3); assert.match(html, /aria-label="View video 3 of 3"/);
  assert.equal(count(html, 'aria-label="Show '), 3); // swipe dots for phones
  const two = renderToStaticMarkup(React.createElement(ProductGallery, { product: { ...product, commerce: { ...product.commerce, media: product.commerce.media.slice(0, 2) } } }));
  assert.equal(count(two, 'src="https://example.invalid/back.jpg"'), 2); // slide + thumbnail
  assert.equal(count(two, 'src="https://example.invalid/front.jpg"'), 2);
});

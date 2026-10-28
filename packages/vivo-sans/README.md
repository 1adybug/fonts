# @1adybug/vivo-sans

Self-host **vivo Sans** with a variable weight axis and Unicode-range WOFF2 subsets.

```sh
npm install @1adybug/vivo-sans
```

Import one of these equivalent CSS entry points in your application:

```js
import "@1adybug/vivo-sans";
// Or: import "@1adybug/vivo-sans/wght";
// Or: import "@1adybug/vivo-sans/wght.css";
```

```css
body {
  font-family: "vivo Sans", sans-serif;
  font-weight: 400;
}
```

## Font data

- Weight axis: **100–850**, native default **400**; normal style.
- **149** local WOFF2 files, loaded by character range.
- Font version: OS SC 1.05 / EN 1.150.
- No runtime dependencies or install scripts; no external font service requests.
- `metadata.json`, `unicode.json`, `sources.json`, and `files/*` are exported.

Optical size axis: **10–22**, native default **16**. Both the weight and optical size axes are preserved; the browser can use automatic optical sizing.

## Copyright and license

Copyright vivo Mobile Communication Co., Ltd.. Font rights remain with the original copyright holder.
The original vendor license is included as **LICENSE**; it is not an MIT or SIL OFL font license.
This is an independently maintained package, not an official vendor package.

[Official font source](https://developers.vivo.com/doc/d/314fa33cbaec4a93be351cd44757d9d9). File hashes and original download details are recorded in `sources.json`.

# @1adybug/oppo-sans

Self-host **OPPO Sans 4.0** with a variable weight axis and Unicode-range WOFF2 subsets.

```sh
npm install @1adybug/oppo-sans
```

Import one of these equivalent CSS entry points in your application:

```js
import "@1adybug/oppo-sans";
// Or: import "@1adybug/oppo-sans/wght";
// Or: import "@1adybug/oppo-sans/wght.css";
```

```css
body {
  font-family: "OPPO Sans 4.0", sans-serif;
  font-weight: 400;
}
```

## Font data

- Weight axis: **100–700**, native default **400**; normal style.
- **148** local WOFF2 files, loaded by character range.
- Font version: 4.0 (font version 1.700).
- No runtime dependencies or install scripts; no external font service requests.
- `metadata.json`, `unicode.json`, `sources.json`, and `files/*` are exported.


## Copyright and license

Copyright Guangdong OPPO Mobile Telecommunications Corp., Ltd.. Font rights remain with the original copyright holder.
The original vendor license is included as **LICENSE**; it is not an MIT or SIL OFL font license.
This is an independently maintained package, not an official vendor package.

[Official font source](https://www.coloros.com/article/A00000074/). File hashes and original download details are recorded in `sources.json`.

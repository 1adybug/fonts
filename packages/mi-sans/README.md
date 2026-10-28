# @1adybug/mi-sans

Self-host **MiSans VF** with a variable weight axis and Unicode-range WOFF2 subsets.

```sh
npm install @1adybug/mi-sans
```

Import one of these equivalent CSS entry points in your application:

```js
import "@1adybug/mi-sans";
// Or: import "@1adybug/mi-sans/wght";
// Or: import "@1adybug/mi-sans/wght.css";
```

```css
body {
  font-family: "MiSans VF", sans-serif;
  font-weight: 330;
}
```

## Font data

- Weight axis: **150–700**, native default **330**; normal style.
- **56** local WOFF2 files, loaded by character range.
- Font version: MiSans VF (official split WOFF2).
- No runtime dependencies or install scripts; no external font service requests.
- `metadata.json`, `unicode.json`, `sources.json`, and `files/*` are exported.

MiSans Regular, Medium and Demibold use native weights 330, 380 and 450. UI weight remapping belongs in the consuming application.

## Copyright and license

Copyright Xiaomi Inc.. Font rights remain with the original copyright holder.
The original vendor license is included as **LICENSE.pdf**; it is not an MIT or SIL OFL font license.
This is an independently maintained package, not an official vendor package.

[Official font source](https://hyperos.mi.com/font/en/download/). File hashes and original download details are recorded in `sources.json`.

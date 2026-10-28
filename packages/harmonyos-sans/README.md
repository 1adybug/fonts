# @1adybug/harmonyos-sans

Self-host **HarmonyOS Sans** with a variable weight axis and Unicode-range WOFF2 subsets.

```sh
npm install @1adybug/harmonyos-sans
```

Import one of these equivalent CSS entry points in your application:

```js
import "@1adybug/harmonyos-sans";
// Or: import "@1adybug/harmonyos-sans/wght";
// Or: import "@1adybug/harmonyos-sans/wght.css";
```

```css
body {
  font-family: "HarmonyOS Sans", sans-serif;
  font-weight: 400;
}
```

## Font data

- Weight axis: **40–900**, native default **400**; normal style.
- **150** local WOFF2 files, loaded by character range.
- Font version: 2.040.
- No runtime dependencies or install scripts; no external font service requests.
- `metadata.json`, `unicode.json`, `sources.json`, and `files/*` are exported.


## Copyright and license

Copyright Huawei Device Co., Ltd.. Font rights remain with the original copyright holder.
The original vendor license is included as **LICENSE**; it is not an MIT or SIL OFL font license.
This is an independently maintained package, not an official vendor package.

[Official font source](https://developer.huawei.com/consumer/cn/design/resource/). File hashes and original download details are recorded in `sources.json`.

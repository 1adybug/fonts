import { writeFile } from "node:fs/promises"
import path from "node:path"
import { ROOT, node, python, fingerprint } from "./lib.mjs"
import { packAll } from "./pack.mjs"

await python("scripts/generate.py", ["--check"])
await node("--test", ["tests/package.test.mjs", "tests/release-state.test.mjs"])
await python("scripts/geometry.py")
await node("tests/browser.mjs")
const artifacts = await packAll()
await node("tests/consumer.mjs")
await writeFile(
  path.join(ROOT, "output/verification.json"),
  JSON.stringify(
    {
      passed: true,
      fingerprint: await fingerprint(),
      artifacts,
      checks: [
        "package exports and binary hashes",
        "all glyphs, hinting, metrics and variable tuples",
        "browser raster comparisons at native weights and sizes, including optical sizing",
        "tarball isolation and file whitelist",
        "TypeScript side-effect import resolution",
        "Vite production build and nested base URL",
        "actual browser fonts and local font requests",
      ],
    },
    null,
    2,
  ) + "\n",
)
console.log("All font repository checks passed; release artifacts are verified")

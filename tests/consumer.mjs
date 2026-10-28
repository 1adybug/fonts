import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"
import { chromium } from "playwright"
import {
  ROOT,
  config,
  fonts,
  json,
  makeOutput,
  run,
  npmCommand,
  node,
  hash,
  chromeOptions,
} from "../scripts/lib.mjs"
import { serve } from "../scripts/server.mjs"

const registry = process.argv.includes("--registry")
const mode = registry ? "registry" : "local"
const folder = await makeOutput(`consumer-${mode}`)
const packed = await json("output/pack.json")
const dependencies = Object.fromEntries(
  packed.packages.map((p) => [
    p.name,
    registry
      ? p.version
      : `file:${path.join(ROOT, p.tarball).replaceAll("\\", "/")}`,
  ]),
)
await writeFile(
  path.join(folder, "package.json"),
  JSON.stringify(
    {
      name: `fonts-${mode}-consumer`,
      version: "1.0.0",
      private: true,
      type: "module",
      dependencies,
    },
    null,
    2,
  ) + "\n",
)
await writeFile(path.join(folder, "empty.npmrc"), "")
await run(
  npmCommand(),
  [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--workspaces=false",
    "--registry=https://registry.npmjs.org/",
    "--userconfig",
    path.join(folder, "empty.npmrc"),
    ...(registry ? ["--prefer-online"] : ["--offline"]),
  ],
  { cwd: folder },
)

const require = createRequire(path.join(folder, "package.json"))
for (const entry of packed.packages) {
  const packageJson = require.resolve(`${entry.name}/package.json`)
  const installed = path.dirname(packageJson)
  for (const file of entry.files)
    assert.equal(
      hash(await readFile(path.join(installed, file.file))),
      file.sha256,
      `${entry.name}/${file.file}`,
    )
  for (const exportPath of [
    entry.name,
    `${entry.name}/wght`,
    `${entry.name}/wght.css`,
    `${entry.name}/metadata.json`,
    `${entry.name}/unicode.json`,
    `${entry.name}/sources.json`,
    `${entry.name}/LICENSE`,
  ])
    assert.ok(require.resolve(exportPath))
  const woff = entry.files.find((f) => f.file.endsWith(".woff2")).file
  assert.ok(require.resolve(`${entry.name}/${woff}`))
}

const imports = []
const paragraphs = []
for (const [index, font] of fonts.entries()) {
  imports.push(
    `import ${JSON.stringify(font.name)};`,
    `import ${JSON.stringify(font.name + "/wght")};`,
    `import ${JSON.stringify(font.name + "/wght.css")};`,
    `import meta${index} from ${JSON.stringify(font.name + "/metadata.json")};`,
  )
  paragraphs.push(
    `<p id="font-${index}" style='font: ${font.axis.default} 18px "${font.family}", sans-serif'>中文字体测试 English font 123</p>`,
  )
}
await writeFile(
  path.join(folder, "index.html"),
  '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Packaged fonts smoke test</title></head><body><script type="module" src="/main.ts"></script></body></html>',
)
await writeFile(
  path.join(folder, "main.ts"),
  imports.join("\n") +
    `\ndocument.body.innerHTML = ${JSON.stringify(paragraphs.join(""))};\nconsole.log(${fonts.map((_, i) => `meta${i}.family`).join(", ")});\n`,
)
await writeFile(
  path.join(folder, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        noUncheckedSideEffectImports: true,
        resolveJsonModule: true,
        skipLibCheck: true,
        types: ["vite/client"],
      },
      include: ["main.ts"],
    },
    null,
    2,
  ),
)
await writeFile(
  path.join(folder, "vite.config.mjs"),
  `export default { root: ${JSON.stringify(folder)}, base: "/nested/fonts/", build: { outDir: "build", emptyOutDir: true, assetsInlineLimit: 0 } };\n`,
)
await node("node_modules/typescript/bin/tsc", [
  "--project",
  path.join(folder, "tsconfig.json"),
])
await node("node_modules/vite/bin/vite.js", [
  "build",
  "--config",
  path.join(folder, "vite.config.mjs"),
])
const server = await serve(path.join(folder, "build"), {
  base: "/nested/fonts/",
})
const browser = await chromium.launch(chromeOptions())
const errors = []
const report = {
  mode,
  version: config.version,
  verifiedFiles: packed.packages.reduce((n, p) => n + p.files.length, 0),
  fonts: [],
}
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`)
  })
  await page.goto(server.url)
  await page.locator(`#font-${fonts.length - 1}`).waitFor()
  await page.evaluate(() => document.fonts.ready)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("DOM.enable")
  await cdp.send("CSS.enable")
  const { root } = await cdp.send("DOM.getDocument")
  for (const [index, font] of fonts.entries()) {
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: `#font-${index}`,
    })
    const result = await cdp.send("CSS.getPlatformFontsForNode", { nodeId })
    assert.ok(result.fonts.length > 0)
    assert.ok(
      result.fonts.every((f) => f.isCustomFont),
      JSON.stringify(result),
    )
    report.fonts.push({ name: font.name, ...result })
  }
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((r) => ({ name: r.name, bytes: r.encodedBodySize })),
  )
  assert.ok(resources.some((r) => r.name.endsWith(".woff2") && r.bytes > 0))
  assert.ok(resources.every((r) => r.name.startsWith(server.url)))
  assert.deepEqual(errors, [])
  report.fontRequests = resources.filter((r) =>
    r.name.endsWith(".woff2"),
  ).length
  report.passed = true
  await page.screenshot({ path: path.join(folder, "smoke.png") })
} finally {
  report.errors = errors
  await writeFile(
    path.join(folder, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  )
  await browser.close()
  await server.close()
}
console.log(
  `${mode}: all package bytes, three CSS entry forms, TypeScript, Vite and browser font loads verified`,
)

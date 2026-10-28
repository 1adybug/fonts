import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import { chromium } from "playwright"
import {
  ROOT,
  fonts,
  json,
  makeOutput,
  chromeOptions,
} from "../scripts/lib.mjs"
import { serve } from "../scripts/server.mjs"

const output = await makeOutput("browser")
const server = await serve(ROOT, {
  html: '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Font fidelity test</title>',
})
const browser = await chromium.launch(chromeOptions())
const samples = [
  "探索知识，学习与创造。字体一、字体二：中文测试！",
  "光与透镜的奇妙世界（第123课）",
  "English font: office, efficient, affine, AV To fi fl ffi.",
  "Café déjà vu, naïve, coöperate; Việt Nam, Ελληνικά, Привет.",
  "标点「括号」《书名》【强调】——……￥€¥ ± × ÷",
  "中文AB、ABC123，小孔成像/AI Cosmos",
  "生僻字：龘、𠮷、𠀀。组合字符：e\u0301 a\u0308 o\u0302",
]
const report = { fonts: [], errors: [] }
try {
  for (const font of fonts) {
    const source = await json(`sources/${font.id}/source.json`)
    const page = await browser.newPage({
      viewport: { width: 1000, height: 600 },
    })
    page.on("pageerror", (error) => report.errors.push(error.message))
    await page.goto(server.url)
    await page.addStyleTag({ url: `${server.url}packages/${font.id}/wght.css` })
    const comparisons = await page.evaluate(
      async ({ font, source, samples }) => {
        const reference = `Reference ${font.family}`
        if (font.kind === "official-woff2") {
          const css = source.faces
            .map(
              (e) =>
                `@font-face { font-family: "${reference}"; font-style: normal; font-weight: ${font.axis.min} ${font.axis.max}; src: url("/sources/${font.id}/files/${e.file}") format("woff2"); unicode-range: ${e.unicodeRange}; }`,
            )
            .join("\n")
          const style = document.createElement("style")
          style.textContent = css
          document.head.append(style)
        } else {
          for (const [i, original] of source.originals.entries()) {
            const face = new FontFace(
              reference,
              `url("/sources/${font.id}/${original.file}")`,
              {
                weight: `${font.axis.min} ${font.axis.max}`,
                ...(font.composite && original.file === font.composite.override
                  ? { unicodeRange: font.composite.unicodeRange }
                  : {}),
              },
            )
            document.fonts.add(await face.load())
          }
        }
        const canvas = document.createElement("canvas")
        canvas.width = 1800
        canvas.height = 120
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        ctx.fontKerning = "normal"
        const render = (name, weight, size, text) => {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.font = `${weight} ${size}px "${name}", sans-serif`
          ctx.fillText(text, 10, 70)
          return {
            width: ctx.measureText(text).width,
            pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          }
        }
        const results = []
        const weights =
          font.testWeights ||
          (font.id === "mi-sans"
            ? [330, 355, 380, 415, 450]
            : [400, 450, 500, 550, 600])
        for (const weight of weights)
          for (const size of font.testSizes || [14, 16, 18])
            for (const text of samples) {
              await document.fonts.load(
                `${weight} ${size}px "${font.family}"`,
                text,
              )
              await document.fonts.load(
                `${weight} ${size}px "${reference}"`,
                text,
              )
              const actual = render(font.family, weight, size, text)
              const expected = render(reference, weight, size, text)
              let different = 0
              for (let i = 0; i < actual.pixels.length; i++)
                if (actual.pixels[i] !== expected.pixels[i]) different++
              results.push({
                weight,
                size,
                text,
                different,
                widthDifference: actual.width - expected.width,
              })
            }
        document.body.innerHTML = `<p id="han" style='font: ${font.axis.default} 18px "${font.family}"'>中文字体测试</p><p id="latin" style='font: ${font.axis.default} 18px "${font.family}"'>English font 123</p>`
        await document.fonts.ready
        return results
      },
      { font, source, samples },
    )
    const mismatches = comparisons.filter(
      (r) => r.different || Math.abs(r.widthDifference) > 1 / 1024,
    )
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("DOM.enable")
    await cdp.send("CSS.enable")
    const { root } = await cdp.send("DOM.getDocument")
    const rendered = []
    for (const id of ["han", "latin"]) {
      const { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector: `#${id}`,
      })
      const actual = await cdp.send("CSS.getPlatformFontsForNode", { nodeId })
      assert.ok(actual.fonts.length > 0)
      assert.ok(
        actual.fonts.every((f) => f.isCustomFont),
        JSON.stringify(actual),
      )
      rendered.push({ script: id, ...actual })
    }
    const remote = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter((r) => !r.name.startsWith(location.origin))
        .map((r) => r.name),
    )
    assert.deepEqual(remote, [])
    report.fonts.push({
      name: font.name,
      comparisons: comparisons.length,
      maxWidthDifference: Math.max(
        ...comparisons.map((r) => Math.abs(r.widthDifference)),
      ),
      mismatches,
      rendered,
    })
    await page.screenshot({ path: `${output}/${font.id}.png` })
    assert.deepEqual(mismatches, [], `${font.name}: raster or shaping changed`)
    await page.close()
    console.log(`${font.name}: ${comparisons.length} raster comparisons passed`)
  }
  assert.deepEqual(report.errors, [])
  report.passed = true
} finally {
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  )
  await browser.close()
  await server.close()
}

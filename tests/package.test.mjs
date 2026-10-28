import test from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { ROOT, config, fonts, json, hash } from "../scripts/lib.mjs"

for (const font of fonts) {
  test(`${font.name}: reusable CSS exports, metadata and exact baseline bytes`, async () => {
    const folder = path.join(ROOT, "packages", font.id)
    const manifest = await json(`packages/${font.id}/package.json`)
    const provenance = await json(`packages/${font.id}/sources.json`)
    const source = await json(`sources/${font.id}/source.json`)
    assert.equal(manifest.name, font.name)
    assert.equal(manifest.version, config.version)
    assert.equal(manifest.publishConfig.access, "public")
    assert.equal(manifest.publishConfig.registry, "https://registry.npmjs.org/")
    assert.equal(manifest.scripts, undefined)
    assert.equal(manifest.dependencies, undefined)
    assert.deepEqual(manifest.sideEffects, ["**/*.css"])
    assert.equal(manifest.license, `SEE LICENSE IN ${font.licenseFile}`)
    for (const entry of [".", "./wght", "./wght.css"]) {
      assert.equal(manifest.exports[entry].types, "./index.d.css.ts")
      await readFile(path.join(folder, manifest.exports[entry].default))
    }
    const css = await readFile(path.join(folder, "wght.css"), "utf8")
    assert.equal(css, await readFile(path.join(folder, "index.css"), "utf8"))
    assert.ok(!/https?:\/\//.test(css), "Font requests must be local")
    const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)]
    assert.equal(faces.length, font.expectedSlices)
    assert.equal(provenance.files.length, font.expectedSlices)
    const unicode = await json(`packages/${font.id}/unicode.json`)
    const filenames = []
    for (let i = 0; i < faces.length; i++) {
      const block = faces[i][1]
      const entry = source.faces[i]
      assert.ok(block.includes(`font-family: "${font.family}";`))
      assert.ok(
        block.includes(`font-weight: ${font.axis.min} ${font.axis.max};`),
      )
      assert.ok(block.includes("font-style: normal;"))
      assert.ok(block.includes(`unicode-range: ${entry.unicodeRange};`))
      const relative = /url\("([^"]+)"\)/.exec(block)[1]
      assert.equal(relative, `./files/${entry.file}`)
      filenames.push(entry.file)
      const data = await readFile(path.join(folder, relative))
      assert.equal(hash(data), entry.sha256)
      assert.equal(data.length, entry.bytes)
      assert.equal(unicode[entry.file], entry.unicodeRange)
    }
    assert.deepEqual(
      (await readdir(path.join(folder, "files"))).sort(),
      filenames.sort(),
    )
    assert.equal(
      hash(await readFile(path.join(folder, font.licenseFile))),
      source.license.sha256,
    )
    const metadata = await json(`packages/${font.id}/metadata.json`)
    assert.equal(metadata.family, font.family)
    assert.deepEqual(metadata.variable.wght, {
      default: String(font.axis.default),
      min: String(font.axis.min),
      max: String(font.axis.max),
      step: "1",
    })
    if (font.opticalSize) {
      assert.deepEqual(
        metadata.variable.opsz,
        Object.fromEntries(
          Object.entries(font.opticalSize).map(([k, v]) => [k, String(v)]),
        ),
      )
    }
  })
}

import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  ROOT,
  config,
  fonts,
  run,
  npmCommand,
  makeOutput,
  walk,
  hash,
  json,
} from "./lib.mjs"

export async function packAll() {
  const destination = await makeOutput("tarballs")
  const previous = await json("output/pack.json").catch(() => null)
  const packages = []
  for (const font of fonts) {
    const folder = path.join(ROOT, "packages", font.id)
    const currentFiles = (await walk(folder)).map((f) =>
      path.relative(folder, f).replaceAll("\\", "/"),
    )
    const prior = previous?.packages.find(
      (p) => p.name === font.name && p.version === config.version,
    )
    let reusable =
      prior &&
      JSON.stringify(prior.files.map((f) => f.file).sort()) ===
        JSON.stringify([...currentFiles].sort())
    if (reusable) {
      for (const f of prior.files)
        if (hash(await readFile(path.join(folder, f.file))) !== f.sha256)
          reusable = false
      const data = await readFile(path.join(ROOT, prior.tarball)).catch(
        () => null,
      )
      reusable = reusable && data && hash(data) === prior.sha256
    }
    if (reusable) {
      packages.push(prior)
      console.log(
        `Reusing unchanged verified artifact: ${font.name}@${config.version}`,
      )
      continue
    }
    const { stdout } = await run(
      npmCommand(),
      ["pack", "--json", "--ignore-scripts", "--pack-destination", destination],
      { cwd: folder, capture: true },
    )
    const [packed] = JSON.parse(stdout)
    assert.equal(packed.name, font.name)
    assert.equal(packed.version, config.version)
    const files = (await walk(folder)).map((f) =>
      path.relative(folder, f).replaceAll("\\", "/"),
    )
    assert.deepEqual(
      packed.files.map((f) => f.path).sort(),
      files.sort(),
      "Unexpected npm package content",
    )
    assert.ok(
      files.every(
        (f) =>
          !f.endsWith(".ttf") &&
          !f.includes("node_modules") &&
          !f.startsWith("scripts/"),
      ),
    )
    assert.equal(
      files.filter((f) => f.endsWith(".woff2")).length,
      font.expectedSlices,
    )
    const tarball = path.join(destination, packed.filename)
    const entry = {
      id: font.id,
      name: font.name,
      version: config.version,
      tarball: path.relative(ROOT, tarball).replaceAll("\\", "/"),
      integrity: packed.integrity,
      sha256: hash(await readFile(tarball)),
      bytes: packed.size,
      files: [],
    }
    for (const file of files)
      entry.files.push({
        file,
        sha256: hash(await readFile(path.join(folder, file))),
      })
    packages.push(entry)
    console.log(
      `Packed ${font.name}@${config.version}: ${files.length} files, ${packed.size} bytes`,
    )
  }
  const result = { version: config.version, packages }
  await writeFile(
    path.join(ROOT, "output/pack.json"),
    JSON.stringify(result, null, 2) + "\n",
  )
  return result
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await packAll()

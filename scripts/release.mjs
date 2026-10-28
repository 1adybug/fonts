import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  ROOT,
  config,
  fonts,
  json,
  run,
  npmCommand,
  node,
  fingerprint,
  hash,
  makeOutput,
} from "./lib.mjs"
import { acceptedSubmission } from "./release-state.mjs"

const policy = await json("release-policy.json")
assert.equal(policy.enabled, true, policy.reason)
await makeOutput("tarballs")
let verified = await json("output/verification.json").catch(() => null)
const intact = async (record) => {
  if (!record?.passed || record.fingerprint !== (await fingerprint()))
    return false
  for (const artifact of record.artifacts.packages)
    if (
      hash(await readFile(path.join(ROOT, artifact.tarball))) !==
      artifact.sha256
    )
      return false
  return true
}
if (!(await intact(verified).catch(() => false))) {
  await node("scripts/test.mjs")
  verified = await json("output/verification.json")
}
assert.ok(await intact(verified))
const { stdout } = await run(
  npmCommand(),
  ["whoami", "--registry=https://registry.npmjs.org/"],
  { capture: true },
)
assert.equal(
  stdout.trim(),
  "1adybug",
  "Publishing must use the 1adybug npm account",
)

async function remote(name) {
  const response = await fetch(
    `https://registry.npmjs.org/${name.replace("/", "%2f")}?cacheBust=${Date.now()}`,
    { headers: { "Cache-Control": "no-cache" } },
  )
  if (response.status === 404) return null
  assert.ok(response.ok, `Registry lookup failed: ${response.status}`)
  const document = await response.json()
  const version = document.versions?.[config.version]
  return version ? { ...version, latest: document["dist-tags"]?.latest } : null
}
// Check every collision before publishing any new package.
for (const artifact of verified.artifacts.packages) {
  const existing = await remote(artifact.name)
  if (existing)
    assert.equal(
      existing.dist.integrity,
      artifact.integrity,
      `Different package already exists: ${artifact.name}@${config.version}`,
    )
}
const progress = {
  version: config.version,
  packages: [],
  submissions: [],
  passed: false,
}
const previous = await json("output/release.json").catch(() => null)
const save = () =>
  writeFile(
    path.join(ROOT, "output/release.json"),
    JSON.stringify(progress, null, 2) + "\n",
  )
try {
  for (const artifact of verified.artifacts.packages) {
    assert.equal(
      verified.fingerprint,
      await fingerprint(),
      "Sources changed after verification",
    )
    assert.equal(
      hash(await readFile(path.join(ROOT, artifact.tarball))),
      artifact.sha256,
    )
    let published = await remote(artifact.name)
    const pending = acceptedSubmission(previous, artifact)
    if (!published && pending) {
      progress.submissions.push(pending)
      await save()
      console.log(
        `Recovering accepted upload without resubmitting: ${artifact.name}`,
      )
      for (let attempt = 0; attempt < 60 && !published; attempt++) {
        published = await remote(artifact.name)
        if (!published)
          await new Promise((resolve) => setTimeout(resolve, 5000))
      }
      assert.ok(
        published,
        `${artifact.name}: accepted upload still pending; not resubmitted`,
      )
    }
    if (!published) {
      console.log(`Publishing ${artifact.name}@${config.version}`)
      await run(npmCommand(), [
        "publish",
        path.join(ROOT, artifact.tarball),
        "--access",
        "public",
        "--tag",
        "latest",
        "--registry=https://registry.npmjs.org/",
        "--ignore-scripts",
      ])
      progress.submissions.push({
        name: artifact.name,
        version: config.version,
        integrity: artifact.integrity,
        status: "accepted-awaiting-public-verification",
        at: new Date().toISOString(),
      })
      await save()
      for (let attempt = 0; attempt < 60 && !published; attempt++) {
        published = await remote(artifact.name)
        if (!published)
          await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
    assert.ok(published, `${artifact.name}: no public registry version found`)
    assert.equal(published.dist.integrity, artifact.integrity)
    const tarResponse = await fetch(published.dist.tarball)
    assert.ok(tarResponse.ok)
    assert.equal(
      hash(Buffer.from(await tarResponse.arrayBuffer())),
      artifact.sha256,
      "Registry tarball differs from the verified artifact",
    )
    assert.equal(published.latest, config.version)
    progress.packages.push({
      name: artifact.name,
      version: config.version,
      integrity: published.dist.integrity,
      url: `https://www.npmjs.com/package/${artifact.name}`,
      verified: true,
    })
    await save()
    console.log(`Public package verified: ${artifact.name}@${config.version}`)
  }
  assert.equal(progress.packages.length, fonts.length)
  await node("tests/consumer.mjs", ["--registry"])
  progress.passed = true
  await save()
  console.log(
    `All ${fonts.length} public npm releases and fresh registry installation verified`,
  )
} catch (error) {
  progress.error = error.message
  await save()
  throw error
}

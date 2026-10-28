import test from "node:test"
import assert from "node:assert/strict"
import { acceptedSubmission } from "../scripts/release-state.mjs"

const artifact = {
  name: "@1adybug/harmonyos-sans",
  version: "0.1.0",
  integrity: "sha512-verified",
}
test("an accepted upload survives a publisher crash and is not submitted twice", () => {
  const pending = {
    name: artifact.name,
    version: artifact.version,
    integrity: artifact.integrity,
    status: "accepted-awaiting-public-verification",
  }
  assert.equal(
    acceptedSubmission({ submissions: [pending] }, artifact),
    pending,
  )
})
test("a different version remains independently publishable", () => {
  assert.equal(
    acceptedSubmission(
      { submissions: [{ ...artifact, version: "0.0.1" }] },
      artifact,
    ),
    null,
  )
})
test("pending uploads with different bytes cannot be silently reused", () => {
  assert.throws(() =>
    acceptedSubmission(
      { submissions: [{ ...artifact, integrity: "sha512-other" }] },
      artifact,
    ),
  )
})

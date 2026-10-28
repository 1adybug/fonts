import assert from "node:assert/strict"

export function acceptedSubmission(previous, artifact) {
  const submission = previous?.submissions?.find(
    (s) => s.name === artifact.name && s.version === artifact.version,
  )
  if (!submission) return null
  if (submission.integrity) {
    assert.equal(
      submission.integrity,
      artifact.integrity,
      "Pending upload belongs to a different artifact",
    )
  }
  return submission
}

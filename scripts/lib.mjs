import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile, readdir, mkdir } from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

export const ROOT = fileURLToPath(new URL("../", import.meta.url))
export const config = JSON.parse(
  await readFile(path.join(ROOT, "font-config.json"), "utf8"),
)
export const fonts = config.fonts
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
export const json = async (file) =>
  JSON.parse(await readFile(path.resolve(ROOT, file), "utf8"))
export const makeOutput = async (name) => {
  const target = path.join(ROOT, "output", name)
  await mkdir(target, { recursive: true })
  return target
}
export function npmCommand() {
  if (process.platform !== "win32") return ["npm"]
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (existsSync(path.join(dir, "npm.exe")))
      return [path.join(dir, "npm.exe")]
  }
  const cli = path.join(
    path.dirname(process.execPath),
    "node_modules/npm/bin/npm-cli.js",
  )
  assert.ok(
    existsSync(cli),
    "Set up Node.js/npm before running package commands",
  )
  return [process.execPath, cli]
}
export function pythonCommand() {
  const interpreter =
    process.env.FONT_PYTHON ||
    path.join(
      ROOT,
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    )
  assert.ok(
    existsSync(interpreter),
    "Create .venv and install scripts/requirements.txt, or set FONT_PYTHON",
  )
  return [interpreter]
}
export async function run(command, args = [], options = {}) {
  const { capture = false, ...extra } = options
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], [...command.slice(1), ...args], {
      cwd: ROOT,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: process.env,
      ...extra,
    })
    let stdout = "",
      stderr = ""
    if (capture) {
      child.stdout.on("data", (data) => {
        stdout += data
      })
      child.stderr.on("data", (data) => {
        stderr += data
      })
    }
    child.once("error", reject)
    child.once("close", (code) => {
      if (code !== 0)
        reject(new Error(`${command[0]} exited ${code}\n${stdout}\n${stderr}`))
      else resolve({ stdout, stderr })
    })
  })
}
export const node = (script, args = [], options = {}) =>
  run([process.execPath], [script, ...args], options)
export const python = (script, args = []) =>
  run(pythonCommand(), [script, ...args])
export async function walk(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...(await walk(file)))
    else if (entry.isFile()) result.push(file)
    else throw new Error(`Unexpected symbolic link: ${file}`)
  }
  return result.sort()
}
export async function fingerprint() {
  const files = [
    ".npmrc",
    "release-policy.json",
    "font-config.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ]
  for (const dir of ["scripts", "tests", "sources", "packages"])
    files.push(
      ...(await walk(path.join(ROOT, dir))).map((p) =>
        path.relative(ROOT, p).replaceAll("\\", "/"),
      ),
    )
  const digest = createHash("sha256")
  for (const name of files.sort())
    digest
      .update(name)
      .update("\0")
      .update(await readFile(path.join(ROOT, name)))
      .update("\0")
  return digest.digest("hex")
}
export function chromeOptions() {
  const configured = process.env.CHROME_EXECUTABLE
  const chrome =
    configured ||
    (process.platform === "win32" &&
      "C:/Program Files/Google/Chrome/Application/chrome.exe")
  return {
    headless: true,
    ...(chrome && existsSync(chrome) ? { executablePath: chrome } : {}),
  }
}

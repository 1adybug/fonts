import { run, pythonCommand } from "./lib.mjs"
await run(pythonCommand(), process.argv.slice(2))

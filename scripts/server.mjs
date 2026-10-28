import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"

export async function serve(directory, { html, base = "/" } = {}) {
  const types = {
    ".css": "text/css",
    ".js": "text/javascript",
    ".html": "text/html",
    ".json": "application/json",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
  }
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      )
      let body, extension
      if (pathname === "/" || pathname === base) {
        body =
          html === undefined
            ? await readFile(path.join(directory, "index.html"))
            : Buffer.from(html)
        extension = ".html"
      } else {
        if (!pathname.startsWith(base)) throw new Error("Not found")
        const file = path.resolve(directory, pathname.slice(base.length))
        if (!file.startsWith(path.resolve(directory) + path.sep))
          throw new Error("Invalid path")
        if (!(await stat(file)).isFile()) throw new Error("Not a file")
        body = await readFile(file)
        extension = path.extname(file)
      }
      response.writeHead(200, {
        "Content-Type": types[extension] || "application/octet-stream",
        "Content-Length": body.length,
        "Cache-Control": "no-store",
      })
      response.end(body)
    } catch {
      response.writeHead(404)
      response.end("Not found")
    }
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}${base}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

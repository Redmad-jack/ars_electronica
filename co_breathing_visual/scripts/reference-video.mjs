import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { loadEnv } from "vite";

export function byteRange(header, size) {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  if (!header) return { start: 0, end: size - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size ? { start, end } : null;
}

export function referenceVideo() {
  let file = "";
  const serve = async (request, response, next) => {
    if (request.url?.split("?")[0] !== "/__local/reference-video") { next(); return; }
    // Expose exactly the configured file, not a filesystem path supplied by a browser.
    const site = request.headers["sec-fetch-site"];
    if ((site && site !== "same-origin" && site !== "none") ||
      (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`)) {
      response.writeHead(403).end(); return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405, { Allow: "GET, HEAD" }).end(); return; }
    try {
      const info = file ? await stat(file) : null;
      if (!info?.isFile() || info.size === 0) { response.writeHead(404).end("Choose a local video in the controls."); return; }
      const range = byteRange(request.headers.range, info.size);
      if (!range) { response.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end(); return; }
      const headers = {
        "Accept-Ranges": "bytes", "Content-Length": range.end - range.start + 1,
        "Content-Type": extname(file).toLowerCase() === ".webm" ? "video/webm" : extname(file).toLowerCase() === ".mov" ? "video/quicktime" : "video/mp4",
        "Cache-Control": "no-store", "Cross-Origin-Resource-Policy": "same-origin",
      };
      if (request.headers.range) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${info.size}`;
      response.writeHead(request.headers.range ? 206 : 200, headers);
      if (request.method === "HEAD") { response.end(); return; }
      const stream = createReadStream(file, range);
      response.on("close", () => stream.destroy());
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    } catch { response.writeHead(404).end("Local video is unavailable. Choose another file."); }
  };
  return { name: "local-reference-video",
    configResolved(config) { file = process.env.LOCAL_REFERENCE_VIDEO ?? loadEnv(config.mode, config.envDir, "LOCAL_").LOCAL_REFERENCE_VIDEO ?? ""; },
    configureServer: server => { server.middlewares.use((req, res, next) => { void serve(req, res, next); }); },
    configurePreviewServer: server => { server.middlewares.use((req, res, next) => { void serve(req, res, next); }); },
  };
}

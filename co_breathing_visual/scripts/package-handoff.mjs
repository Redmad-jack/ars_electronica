import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const visual = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = path.dirname(visual);
const output = path.join(repository, "outputs/handoff");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const staging = await mkdtemp(path.join(tmpdir(), "co-breathing-handoff-"));
const root = path.join(staging, "Co-Breathing-Visual");
const archive = path.join(output, `co-breathing-visual-mac-mini-${stamp}.zip`);
const files = [];
const sha256 = data => createHash("sha256").update(data).digest("hex");
const skip = name => name === ".DS_Store" || name.startsWith("._") || (name.startsWith(".env") && name !== ".env.example") ||
  /\.(pem|key|p12|tsbuildinfo)$/.test(name) || [".git", "node_modules", "test-results", "playwright-report"].includes(name);

async function collect(relative) {
  const absolute = path.join(repository, relative);
  const parent = path.dirname(absolute);
  const entry = (await readdir(parent, { withFileTypes: true })).find(item => item.name === path.basename(absolute));
  if (!entry) throw new Error(`Required handoff file is missing: ${relative}`);
  if (skip(entry.name)) return;
  if (entry.isSymbolicLink()) throw new Error(`Do not package symlinks: ${relative}`);
  if (entry.isDirectory()) {
    for (const child of (await readdir(absolute)).sort()) await collect(path.join(relative, child));
  } else if (entry.isFile()) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await cp(absolute, path.join(root, relative));
    files.push(relative);
  }
}

try {
  // Explicit roots capture uncommitted visual work without unrelated hardware data or credentials.
  const visualEntries = ["src", "tests", "e2e", "scripts", "dist", "README.md", ".gitignore", ".nvmrc", ".env.example",
    "package.json", "package-lock.json", "index.html", "tsconfig.json", "vite.config.ts", "playwright.config.ts"];
  for (const entry of visualEntries) await collect(`co_breathing_visual/${entry}`);
  for (const entry of ["AGENTS.md", ".gitignore", ".codex/skills/karpathy-guidelines/SKILL.md"]) await collect(entry);
  for (const entry of ["README", "PRD", "APP_FLOW", "TECH_STACK", "HARDWARE_BOM", "WIRING_PLAN",
    "FRONTEND_GUIDELINES", "BACKEND_STRUCTURE", "IMPLEMENTATION_PLAN", "HARDWARE_AUDIT",
    "EXHIBITION_VISUAL_PLAN", "MAC_MINI_HANDOFF"]) await collect(`docs/${entry}.md`);
  const media = ["specimen-ribbon.png", "specimen-fan.png", "specimen-pair.png", "school-4.png", "school-12.png",
    "school-24.png", "gpu-motion-review.png", "specimen-pair.webm", "school-12.webm",
    "benchmark-30min.json", "school-24-after-30min.png"];
  for (const entry of media) {
    // Media may be absent in a Git clone; the source package remains independently useful.
    try { await collect(`outputs/exhibition/${entry}`); }
    catch (error) {
      if (error.code === "ENOENT" || error.message.startsWith("Required handoff file is missing:")) {
        console.warn(`Optional review artifact not included: ${entry}`);
      } else throw error;
    }
  }
  const start = "# Co-Breathing Visual · Mac mini 交接包\n\n先阅读 [交接文档](docs/MAC_MINI_HANDOFF.md)。\n\n" +
    "这是当前工作区快照，包含尚未提交的模拟代码，不是整个硬件仓库的备份。\n\n" +
    "安装 Node.js 后：`cd co_breathing_visual` → `npm ci` → `npm run dev`。\n\n" +
    "在 Chrome 打开 http://127.0.0.1:4173/?view=exhibition 。不要双击 dist/index.html。\n\n" +
    "包内不含 node_modules、Git 历史、密钥、Python 后端、固件或浏览器本地参数。\n";
  await writeFile(path.join(root, "START_HERE.md"), start);
  files.push("START_HERE.md");
  const entries = [];
  for (const file of files.sort()) {
    const data = await readFile(path.join(root, file));
    entries.push({ path: file, bytes: data.length, sha256: sha256(data) });
  }
  const git = args => {
    try { return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { return null; }
  };
  const manifest = JSON.stringify({ createdAt: new Date().toISOString(), snapshot: "working-tree, including uncommitted files",
    sourceHead: git(["rev-parse", "HEAD"]), sourceBranch: git(["branch", "--show-current"]),
    node: process.version, files: entries }, null, 2) + "\n";
  await writeFile(path.join(root, "MANIFEST.json"), manifest);
  await writeFile(path.join(root, "CHECKSUMS.sha256"), entries.map(file => `${file.sha256}  ${file.path}\n`).join("") +
    `${sha256(manifest)}  MANIFEST.json\n`);
  await mkdir(output, { recursive: true });
  execFileSync("zip", ["-q", "-r", "-X", archive, "Co-Breathing-Visual"], { cwd: staging, env: { ...process.env, COPYFILE_DISABLE: "1" } });
  execFileSync("unzip", ["-tq", archive], { stdio: "inherit" });
  const bytes = await readFile(archive);
  await writeFile(`${archive}.sha256`, `${sha256(bytes)}  ${path.basename(archive)}\n`);
  console.log(JSON.stringify({ archive, bytes: bytes.length, files: entries.length + 2, sha256: sha256(bytes) }, null, 2));
} finally {
  // Only the uniquely created packaging staging directory is removed.
  await rm(staging, { recursive: true, force: true });
}

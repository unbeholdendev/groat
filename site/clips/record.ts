import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type APIRequestContext, type Browser, chromium, type Page } from "@playwright/test";
import { serveStatic, websocket } from "hono/bun";
import { createApp } from "../../server/app";
import { clips } from "./scenes";
import { seed } from "./seed";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
};
process.env.LOG_LEVEL ??= "warn";
const target = env("CLIPS_AI_URL").replace(/\/+$/, "");
const session = crypto.randomUUID();
// OpenCode Go refuses requests without a session header, which Groat does not send. Speech is stubbed:
// the clips are muted, so a fixed transcript shows the same thing without a voice or a speech-to-text key.
const proxy = Bun.serve({
  hostname: "127.0.0.1",
  port: 3201,
  idleTimeout: 0,
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/stt/models") return Response.json({ data: [{ id: "whisper-1" }] });
    if (url.pathname === "/stt/audio/transcriptions") return Response.json({ text: "taxi home 14.80" });
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.set("x-opencode-session", session);
    headers.set("user-agent", "groat-clips");
    const res = await fetch(`${target}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body: req.body,
    });
    const back = new Headers(res.headers);
    back.delete("content-encoding");
    back.delete("content-length");
    return new Response(res.body, { status: res.status, headers: back });
  },
});
const ai = { url: `http://127.0.0.1:${proxy.port}`, key: env("CLIPS_AI_KEY"), model: env("CLIPS_AI_MODEL") };
const only = process.argv.slice(2);
const port = 3200;
const baseURL = `http://127.0.0.1:${port}`;
const raw = "site/clips/.raw";
const out = "site/public/clips";
const viewport = { width: 390, height: 844 };
const scale = 2;
const manifest = join(out, "clips.json");

export type Band = { top: number; bottom: number };
export type Scene = {
  before?: (api: APIRequestContext) => Promise<unknown>;
  open?: (page: Page) => Promise<void>;
  run: (s: { page: Page; wait: <T>(work: () => Promise<T>) => Promise<T> }) => Promise<void>;
  crop: (page: Page) => Promise<Band>;
};

function serve() {
  const app = createApp({ db: new Database(":memory:"), clock: () => new Date(), fetch });
  app.use("*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
  const server = Bun.serve({ hostname: "127.0.0.1", port, idleTimeout: 0, fetch: app.fetch, websocket });
  return async () => {
    await server.stop(true);
    app.close();
  };
}

type Frame = { t: number; file: string };

async function record(browser: Browser, storageState: string, name: string, scene: Scene) {
  const context = await browser.newContext({
    baseURL,
    storageState,
    viewport,
    deviceScaleFactor: scale,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox", { name: /Add an expense/ }).waitFor();
  await scene.open?.(page);
  await page.waitForTimeout(600);

  const dir = join(raw, name);
  mkdirSync(dir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const now = () => Date.now() / 1000;
  const frames: Frame[] = [];
  let recording = true;
  const capturing = (async () => {
    while (recording) {
      const t = now();
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "jpeg",
        quality: 92,
        clip: { x: 0, y: 0, ...viewport, scale },
      });
      const file = join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
      writeFileSync(file, Buffer.from(data, "base64"));
      frames.push({ t, file });
    }
  })();
  const cuts: [number, number][] = [];
  const wait = async <T>(work: () => Promise<T>) => {
    const from = now();
    const result = await work();
    cuts.push([from + 0.2, now() - 0.2]);
    return result;
  };
  const start = now();
  await scene.run({ page, wait });
  await page.waitForTimeout(1500);
  const end = now();
  recording = false;
  await capturing;
  const band = await scene.crop(page);
  await context.close();
  const top = Math.max(0, Math.round(band.top));
  const height = Math.min(viewport.height, Math.round(band.bottom)) - top;
  return { shots: timeline(frames, start, end, cuts), crop: { y: top * scale, height: height * scale } };
}

function timeline(frames: Frame[], start: number, end: number, cuts: [number, number][]) {
  const shift = (t: number) => cuts.reduce((s, [a, b]) => s - Math.max(0, Math.min(t, b) - a), t) - start;
  const inCut = (t: number) => cuts.some(([a, b]) => t > a && t < b);
  const kept = frames.filter((f, i) => {
    const next = frames[i + 1]?.t ?? end;
    return next > start && f.t < end && !(inCut(f.t) && inCut(next));
  });
  return kept.map((f, i) => ({
    file: f.file,
    duration: Math.max(0, shift(Math.min(kept[i + 1]?.t ?? end, end)) - shift(Math.max(f.t, start))),
  }));
}

function encode(name: string, shots: { file: string; duration: number }[], crop: { y: number; height: number }) {
  const list = join(raw, `${name}.txt`);
  writeFileSync(
    list,
    `ffconcat version 1.0\n${shots.map((s) => `file '${s.file.slice(raw.length + 1)}'\nduration ${s.duration.toFixed(3)}`).join("\n")}\nfile '${shots.at(-1)?.file.slice(raw.length + 1)}'\n`,
  );
  const ffmpeg = (...args: string[]) => {
    const r = Bun.spawnSync(["ffmpeg", "-loglevel", "error", "-y", ...args]);
    if (r.exitCode !== 0) throw new Error(`ffmpeg ${name}: ${r.stderr}`);
  };
  const cut = `crop=${viewport.width * scale}:${crop.height}:0:${crop.y}`;
  const input = ["-f", "concat", "-safe", "0", "-i", list, "-an", "-vf", `${cut},fps=30,format=yuv420p`];
  ffmpeg(...input, "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-movflags", "+faststart", `${out}/${name}.mp4`);
  ffmpeg(...input, "-c:v", "libvpx-vp9", "-crf", "33", "-b:v", "0", "-row-mt", "1", `${out}/${name}.webm`);
  ffmpeg("-i", shots.at(-1)?.file ?? "", "-vf", cut, "-q:v", "3", `${out}/${name}.jpg`);
}

if (Bun.spawnSync(["ffmpeg", "-version"]).exitCode !== 0) throw new Error("ffmpeg is not on PATH");
if (Bun.spawnSync(["bun", "run", "build"], { stdout: "inherit", stderr: "inherit" }).exitCode !== 0) process.exit(1);
rmSync(raw, { recursive: true, force: true });
mkdirSync(raw, { recursive: true });
mkdirSync(out, { recursive: true });
const sizes: Record<string, { width: number; height: number }> = existsSync(manifest)
  ? JSON.parse(readFileSync(manifest, "utf8"))
  : {};
let browser: Browser | undefined;
try {
  browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const stop = serve();
  try {
    const setup = await browser.newContext({ baseURL });
    await seed(setup.request, ai);
    const storageState = join(raw, "state.json");
    await setup.storageState({ path: storageState });
    for (const [name, scene] of Object.entries(clips)) {
      if (only.length && !only.includes(name)) continue;
      await scene.before?.(setup.request);
      const { shots, crop } = await record(browser, storageState, name, scene);
      encode(name, shots, crop);
      sizes[name] = { width: viewport.width * scale, height: crop.height };
      console.log(`${name}: ${shots.reduce((s, f) => s + f.duration, 0).toFixed(1)} s, ${crop.height} px`);
    }
    await setup.close();
  } finally {
    await stop();
  }
} finally {
  await browser?.close();
  proxy.stop(true);
  writeFileSync(
    manifest,
    `${JSON.stringify(Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`,
  );
}

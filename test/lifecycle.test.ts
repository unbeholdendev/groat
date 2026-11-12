import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const launch = (path: string) =>
  Bun.spawn([process.execPath, `${import.meta.dir}/../server/index.ts`], {
    env: { ...process.env, NODE_ENV: "test", DB_PATH: path, PORT: "0", LOG_LEVEL: "debug" },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });

test("the real server logs readiness and drains live connections on SIGTERM", async () => {
  const dir = await mkdtemp(join(tmpdir(), "groat-lifecycle-"));
  const child = launch(join(dir, "private-database"));
  const errorOutput = new Response(child.stderr).text();
  const logs: Record<string, any>[] = [];
  let socket: WebSocket | undefined;
  try {
    let buffer = "";
    for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        const entry = JSON.parse(line);
        logs.push(entry);
        if (entry.event !== "process.ready") continue;
        const origin = `http://127.0.0.1:${entry.port}`;
        const response = await fetch(origin + "/api/setup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "private-user", password: "private-password" }),
        });
        expect(response.status).toBe(201);
        socket = new (WebSocket as unknown as { new (url: string, options: Bun.WebSocketOptions): WebSocket })(
          origin.replace("http:", "ws:") + "/api/live",
          {
            headers: { origin, cookie: response.headers.get("set-cookie")!.split(";")[0] },
          },
        );
        await new Promise<void>((resolve, reject) => {
          socket!.onmessage = () => resolve();
          socket!.onerror = reject;
        });
        child.kill("SIGTERM");
      }
    }
    expect(await child.exited).toBe(0);
    expect(await errorOutput).toBe("");
    expect(logs.map((entry) => entry.event)).toEqual(
      expect.arrayContaining([
        "process.starting",
        "database.migration.completed",
        "recurring.generate.completed",
        "process.ready",
        "process.shutdown.started",
        "process.shutdown.completed",
      ]),
    );
    expect(JSON.stringify(logs)).not.toContain("private");
  } finally {
    socket?.close();
    child.kill();
    await child.exited;
    await rm(dir, { recursive: true, force: true });
  }
}, 10_000);

test("startup failures exit unsuccessfully and log no filesystem details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "groat-lifecycle-"));
  const child = launch(join(dir, "private-missing-directory", "private-database"));
  try {
    const stdout = new Response(child.stdout).text();
    const stderr = new Response(child.stderr).text();
    expect(await child.exited).toBe(1);
    const output = await stdout;
    const errors = await stderr;
    expect(output).not.toContain("process.ready");
    expect(JSON.parse(errors)).toMatchObject({ level: "error", event: "process.failed" });
    expect(output + errors).not.toContain("private");
  } finally {
    child.kill();
    await rm(dir, { recursive: true, force: true });
  }
});

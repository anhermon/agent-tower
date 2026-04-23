import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAndServe } from "./resolver";

// ─── Test harness ─────────────────────────────────────────────────────────────
// All cases exercise the real path-resolution + size-gate logic; the file
// system access itself is mocked via the injectable `statImpl` / `readFileImpl`
// hooks when we don't want to touch the disk. We touch real disk just enough
// to get `path.resolve` + realpath to match a session cwd under /tmp.

function makeCwd(): string {
  return mkdtempSync(path.join(tmpdir(), "wave3-file-route-"));
}

describe("GET /sessions/:id/file — path validation", () => {
  it("given_valid_relative_path_under_cwd__when_requested__then_returns_200_with_content", async () => {
    const cwd = makeCwd();
    const target = path.join(cwd, "src", "hello.ts");
    mkdirSync(path.dirname(target));
    writeFileSync(target, "export const hello = 'world';\n", "utf8");

    const res = await resolveAndServe({ cwd, requestedPath: "src/hello.ts" });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("hello");
    expect(res.headers.get("content-type")).toContain("text/plain");
  });

  it("given_path_traversal_attempt__when_requested__then_returns_403", async () => {
    const cwd = makeCwd();
    const res = await resolveAndServe({ cwd, requestedPath: "../../etc/passwd" });
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body).toMatch(/forbidden/i);
  });

  it("given_absolute_path_outside_cwd__when_requested__then_returns_403", async () => {
    const cwd = makeCwd();
    const res = await resolveAndServe({ cwd, requestedPath: "/etc/hosts" });
    expect(res.status).toBe(403);
  });

  it("given_absolute_path_inside_cwd__when_file_exists__then_returns_200", async () => {
    const cwd = makeCwd();
    const target = path.join(cwd, "notes.md");
    writeFileSync(target, "# hi\n", "utf8");
    const res = await resolveAndServe({ cwd, requestedPath: target });
    expect(res.status).toBe(200);
  });

  it("given_missing_file_under_cwd__when_requested__then_returns_404", async () => {
    const cwd = makeCwd();
    const res = await resolveAndServe({ cwd, requestedPath: "does/not/exist.ts" });
    expect(res.status).toBe(404);
  });

  it("given_file_with_unsafe_extension__when_requested__then_returns_415", async () => {
    const cwd = makeCwd();
    const target = path.join(cwd, "blob.bin");
    writeFileSync(target, Buffer.from([0, 1, 2, 3]));
    const res = await resolveAndServe({ cwd, requestedPath: "blob.bin" });
    expect(res.status).toBe(415);
  });

  it("given_traversal_with_encoded_segments__when_normalised_under_cwd__then_returns_200", async () => {
    const cwd = makeCwd();
    const target = path.join(cwd, "a", "b.ts");
    mkdirSync(path.dirname(target));
    writeFileSync(target, "ok", "utf8");
    const res = await resolveAndServe({ cwd, requestedPath: "./a/../a/b.ts" });
    expect(res.status).toBe(200);
  });

  it("given_sibling_cwd_prefix_collision__when_requested__then_returns_403", async () => {
    // e.g. cwd is /tmp/proj and requestedPath resolves to /tmp/projEvil/file.ts
    // Without the trailing-separator check this would leak out.
    const cwd = makeCwd();
    const sibling = `${cwd}Evil`;
    mkdirSync(sibling);
    const target = path.join(sibling, "leak.ts");
    writeFileSync(target, "secret", "utf8");
    const res = await resolveAndServe({ cwd, requestedPath: target });
    expect(res.status).toBe(403);
  });
});

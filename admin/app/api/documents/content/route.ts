import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join, normalize, resolve } from "path";

const DOCS_ROOT = resolve(join(process.cwd(), "..", "company-docs"));
const BACKEND   = "https://tag-n-ride-production.up.railway.app";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const docPath = searchParams.get("path");
  const dbId    = searchParams.get("dbId");
  const token   = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

  // ── DB-first: fetch from backend if dbId provided ──────────
  if (dbId && token) {
    try {
      const res = await fetch(`${BACKEND}/api/admin/documents/${dbId}`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 0 },
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ content: data.content, path: data.fileName, source: "db" });
      }
    } catch {}
  }

  // ── Filesystem fallback ────────────────────────────────────
  if (!docPath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  const normalized = normalize(docPath).replace(/\\/g, "/");
  if (normalized.includes("..") || normalized.startsWith("/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  if (!normalized.endsWith(".md")) {
    return NextResponse.json({ error: "Only markdown files are accessible" }, { status: 400 });
  }

  const absolutePath = resolve(join(DOCS_ROOT, normalized));
  if (!absolutePath.startsWith(DOCS_ROOT)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const content = await readFile(absolutePath, "utf-8");
    return NextResponse.json({ content, path: normalized, source: "filesystem" });
  } catch {
    return NextResponse.json(
      { error: "Document not available. Ensure company-docs is present in the monorepo." },
      { status: 404 }
    );
  }
}

import { NextResponse } from "next/server";
import { exportDatabaseFileBuffer, isFileBackedDatabase } from "@/lib/db";

export async function GET() {
  if (!isFileBackedDatabase()) {
    return NextResponse.json(
      { error: "Database export is not available in this environment." },
      { status: 503 },
    );
  }

  try {
    const buffer = await exportDatabaseFileBuffer();
    if (!buffer) {
      return NextResponse.json(
        { error: "Could not create database snapshot." },
        { status: 503 },
      );
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="budget.db"',
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

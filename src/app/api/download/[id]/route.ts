import { NextResponse } from "next/server";
import { Readable } from "stream";
import { ZipArchive } from "archiver";
import { getShareById, getCurrentTime } from "@/lib/d1";
import { getFromR2 } from "@/lib/r2";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const files = await getShareById(id);
    const now = getCurrentTime();

    if (files.length === 0 || files[0].expires_at < now) {
        return NextResponse.json({ error: "This link is gone" }, { status: 404 });
    }

    if (files.length === 1) {
        const file = files[0];
        const range = request.headers.get("range") ?? undefined;
        const { body, contentRange, contentLength } = await getFromR2(file.r2_key, range);

        const headers: Record<string, string> = {
            "Content-Type": file.content_type,
            "Content-Disposition": `attachment; filename="${file.filename}"`,
            "Accept-Ranges": "bytes",
        };

        if (range && contentRange) {
            headers["Content-Range"] = contentRange;
            headers["Content-Length"] = String(contentLength);
            return new NextResponse(body, { status: 206, headers });
        }

        headers["Content-Length"] = String(file.size);
        return new NextResponse(body, { status: 200, headers });
    }

    const archive = new ZipArchive({ zlib: { level: 9 } });

    for (const file of files) {
        const { body } = await getFromR2(file.r2_key);
        archive.append(Readable.fromWeb(body as import("stream/web").ReadableStream), { name: file.filename });
    }
    archive.finalize();

    return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
        status: 200,
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="poof-files.zip"`,
        },
    });
}

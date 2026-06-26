import { NextResponse } from "next/server";
import { deleteExpiredShares, getOrphanedFiles, deleteFileByHash, getCurrentTime, deleteExpiredShareFiles } from "@/lib/d1";
import { deleteFromR2 } from "@/lib/r2";

export async function GET(request: Request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = getCurrentTime();
    await deleteExpiredShareFiles(now);
    await deleteExpiredShares(now);

    const orphanedFiles = await getOrphanedFiles();
    for (const file of orphanedFiles) {
        await deleteFromR2(file.r2_key);
        await deleteFileByHash(file.hash);
    }

    return NextResponse.json({ message: "Cleanup Complete", deletedFiles: orphanedFiles.length });

}
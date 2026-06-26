import { NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";
import { uploadRatelimit } from "@/lib/ratelimit";
import { checkHashWithVirusTotal, VirusTotalVerdict } from "@/lib/virustotal";
import { uploadToR2 } from "@/lib/r2";
import { getFileByHash, insertFile, insertShare, insertShareFile, getTotalStorageUsed } from "@/lib/d1";

//File Validation and values
const MAX_FILE_SIZE = 1024 * 1024 * 1024; //1GB LIMIT
const MAX_BATCH_SIZE = 2 * 1024 * 1024 * 1024; // 2GB total for multi-file batches
const STORAGE_BUDGET = 10 * 1024 * 1024 * 1024; // 10GB total budget
const KILL_SWITCH_THRESHOLD = STORAGE_BUDGET * 0.8; // 8GB — reject uploads past this

type FileResult = {
    filename: string;
    status: "ok" | "failed";
    reason?: string;
};

export async function POST(request: Request) {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    const { remaining } = await uploadRatelimit.getRemaining(ip);
    if (remaining <= 0) {
        return NextResponse.json({ error: "Rate limit exceeded. Try again later" }, { status: 429 });
    }

    const formData = await request.formData();
    const files = formData.getAll("file");

    if (files.length === 0 || !files.every((f) => f instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileList = files as File[];

    if (fileList.length === 1) {
        if (fileList[0].size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: "File exceeds 1GB limit" }, { status: 413 });
        }
    } else {
        const totalRequestedSize = fileList.reduce((sum, f) => sum + f.size, 0);
        if (totalRequestedSize > MAX_BATCH_SIZE) {
            return NextResponse.json({ error: "Batch exceeds 2GB total limit" }, { status: 413 });
        }
    }

    const results: FileResult[] = [];
    const successfulFiles: { hash: string; filename: string }[] = [];

    for (const file of fileList) {
        const totalStorageUsed = await getTotalStorageUsed();
        if (totalStorageUsed + file.size > KILL_SWITCH_THRESHOLD) {
            results.push({ filename: file.name, status: "failed", reason: "Storage limit reached" });
            continue;
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const hash = createHash("sha256").update(buffer).digest("hex");

        let verdict: VirusTotalVerdict = "Unknown";
        try {
            verdict = await checkHashWithVirusTotal(hash);
        } catch {
            verdict = "Unknown";
        }

        if (verdict === "malicious") {
            results.push({ filename: file.name, status: "failed", reason: "Flagged as malicious" });
            continue;
        }

        const existingFile = await getFileByHash(hash);
        if (!existingFile) {
            await uploadToR2(hash, buffer, file.type);
            await insertFile(hash, hash, file.size, file.type);
        }

        successfulFiles.push({ hash, filename: file.name });
        results.push({ filename: file.name, status: "ok" });
    }

    if (successfulFiles.length === 0) {
        return NextResponse.json({ results }, { status: 207 });
    }

    const shareId = randomUUID();
    const createdAt = Date.now();
    const expiresAt = createdAt + 24 * 60 * 60 * 1000;

    await insertShare(shareId, createdAt, expiresAt);
    for (const { hash, filename } of successfulFiles) {
        await insertShareFile(shareId, hash, filename);
    }

    await uploadRatelimit.limit(ip);

    return NextResponse.json({ shareId, results }, { status: 207 });
}

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { uploadRatelimit } from "@/lib/ratelimit";
import { checkHashWithVirusTotal, VirusTotalVerdict } from "@/lib/virustotal";
import { uploadToR2 } from "@/lib/r2";
//File Validation and values 
const MAX_FILE_SIZE = 1024 * 1024 * 1024; //1GB LIMIT
const BLOCKED_EXTENSIONS = [".exe", ".bat", ".sh", ".msi", ".ps1", ".vbs"];

export async function POST(request: Request) {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    const { remaining } = await uploadRatelimit.getRemaining(ip);
    if (remaining <= 0) {
        return NextResponse.json({ error: "Rate limit exceeded. Try again later" }, { status: 429 })
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "No file provided " }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File Exceeds 1GB limit" }, { status: 413 });

    }

    const lowerName = file.name.toLowerCase();
    const isBlocked = BLOCKED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (isBlocked) {
        return NextResponse.json({ error: "File type not allowed" }, { status: 415 });
    }
    const buffer = Buffer.from (await file.arrayBuffer())
    const hash = createHash("sha256").update(buffer).digest("hex");

    let verdict: VirusTotalVerdict = "Unknown";
    try {
        verdict = await checkHashWithVirusTotal(hash);
    }
    catch {
        verdict = "Unknown";
    }

    if (verdict === "malicious") {
        return NextResponse.json({ error: "File flagged as malicious" }, { status: 403 });
    }
    
    await uploadToR2(hash, buffer, file.type);
    await uploadRatelimit.limit(ip);
    return NextResponse.json({ message: "File passed the Initial validation", name: file.name, size: file.size, hash: hash });

}


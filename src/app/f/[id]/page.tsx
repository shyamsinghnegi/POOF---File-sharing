import { getShareById, getCurrentTime } from "@/lib/d1";
import Header from "@/app/components/Header";
import CopyLinkButton from "@/app/components/CopyLinkButton";
import styles from "./page.module.css";

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeRemaining(expiresAt: number, now: number): string {

    const msRemaining = expiresAt - now;
    const hours = Math.floor(msRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
}

function formatUploadedDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString("en-Us", { month: "short", day: "numeric", year: "numeric" });
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const files = await getShareById(id);
    const now = getCurrentTime();
    const isExpired = files.length === 0 || files[0].expires_at < now;

    if (isExpired) {
        return (<div className={styles.page}>
            <Header variant="faq" />
            <main className={styles.main}>
                <p className={styles.gone}>This link is gone.</p>
            </main>
        </div>
        );
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    return (
        <div className={styles.page}>
            <Header variant="faq" />
            <main className={styles.main}>
                <h1 className={styles.title}>Download your file{files.length > 1 ? "s" : ""}</h1>
                <p className={styles.subtitle}>Shared via poof.</p>

                <div className={styles.card}>
                    {files.map((file) => (
                        <div className={styles.row} key={file.hash}>
                            <span className={styles.label}>{file.filename}</span>
                            <span className={styles.value}>{formatBytes(file.size)}</span>
                        </div>
                    ))}
                </div>

                <div className={styles.statsRow}>
                    <div className={styles.statBox}>
                        <span className={styles.statLabel}>Total size</span>
                        <span className={styles.statValue}>{formatBytes(totalSize)}</span>
                    </div>
                    <div className={styles.statBox}>
                        <span className={styles.statLabel}>Uploaded</span>
                        <span className={styles.statValue}>{formatUploadedDate(files[0].created_at)}</span>
                    </div>
                    <div className={styles.statBox}>
                        <span className={styles.statLabel}>Expires in</span>
                        <span className={styles.statValue}>{formatTimeRemaining(files[0].expires_at, now)}</span>
                    </div>
                </div>

                <p className={styles.warning}>
                    This file was shared with you by someone else. POOF scans for known
                    threats, but can&apos;t guarantee every file is safe - only download
                    if you trust the sender.
                </p>

                <a href={`/api/download/${id}`} className={styles.downloadButton}>Download</a>
                <CopyLinkButton shareId={id} />
            </main>
        </div>
    );
}

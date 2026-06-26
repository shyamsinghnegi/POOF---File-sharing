'use client';

import { useEffect, useRef, useState } from "react";
import styles from "./UploadForm.module.css";
import ShareIcon from "./ShareIcon";
import Toast from "./Toast";

type Stage = "idle" | "uploading" | "done" | "error";

type FileEntry = {
    name: string;
    size: number;
    status?: "ok" | "failed";
    reason?: string;
};

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadForm() {
    const [stage, setStage] = useState<Stage>("idle");
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [shareId, setShareId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [fakeProgress, setFakeProgress] = useState(0);
    const [showErrorToast, setShowErrorToast] = useState(false);
    const [showComingSoonToast, setShowComingSoonToast] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    useEffect(() => {
        if (stage !== "uploading") return;

        const assumedBytesPerSecond = 2 * 1024 * 1024; // rough assumption: ~2 MB/s
        const estimatedSeconds = Math.max(totalSize / assumedBytesPerSecond, 2);
        const startTime = Date.now();

        const interval = setInterval(() => {
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            const fractionOfEstimate = elapsedSeconds / estimatedSeconds;

            setFakeProgress(90 * (1 - Math.exp(-fractionOfEstimate * 2)));
        }, 200);

        return () => clearInterval(interval);
    }, [stage, totalSize]);

    useEffect(() => {
        if (stage !== "error") return;
        const timeout = setTimeout(() => setShowErrorToast(false), 4000);
        return () => clearTimeout(timeout);
    }, [stage, errorMessage]);

    useEffect(() => {
        if (!showComingSoonToast) return;
        const timeout = setTimeout(() => setShowComingSoonToast(false), 3000);
        return () => clearTimeout(timeout);
    }, [showComingSoonToast]);

    function handlePickClick() {
        fileInputRef.current?.click();
    }

    function reset() {
        setStage("idle");
        setFiles([]);
        setShareId(null);
        setErrorMessage(null);
        setCopied(false);
        setFakeProgress(0);
        setShowErrorToast(false);
    }

    async function handleCopy() {
        if (!shareId) return;
        const url = `${window.location.origin}/f/${shareId}`;
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const selected = event.target.files;
        if (!selected || selected.length === 0) return;

        const pickedFiles = Array.from(selected);
        setFiles(pickedFiles.map((f) => ({ name: f.name, size: f.size })));
        setFakeProgress(0);
        setStage("uploading");
        setErrorMessage(null);

        const formData = new FormData();
        for (const file of pickedFiles) {
            formData.append("file", file);
        }

        try {
            const response = await fetch("/api/upload", { method: "POST", body: formData });
            const data = await response.json();

            if (!response.ok) {
                setErrorMessage(data.error ?? "Upload failed.");
                setShowErrorToast(true);
                setStage("error");
                return;
            }

            setFiles((current) =>
                current.map((f) => {
                    const result = data.results?.find((r: { filename: string }) => r.filename === f.name);
                    return result ? { ...f, status: result.status, reason: result.reason } : f;
                })
            );

            setFakeProgress(100);

            if (!data.shareId) {
                setErrorMessage("All files failed validation.");
                setShowErrorToast(true);
                setStage("error");
                return;
            }

            setShareId(data.shareId);
            setStage("done");
        } catch {
            setErrorMessage("Something went wrong. Please try again.");
            setShowErrorToast(true);
            setStage("error");
        }
        event.target.value = "";
    }

    const fileInput = (
        <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className={styles.hiddenInput}
        />
    );

    if (stage === "uploading" || stage === "done" || stage === "error") {
        return (
            <>
                {fileInput}
                <div className={styles.fileRowWrapper}>
                    <div className={styles.fileRow}>
                        {files.map((file) => (
                            <div className={styles.fileInfo} key={file.name}>
                                <span className={styles.fileName}>{file.name}</span>
                                <span className={styles.fileSize}>
                                    {file.status === "failed" ? file.reason : formatBytes(file.size)}
                                </span>
                            </div>
                        ))}
                        <div className={styles.progressTrack}>
                            <div
                                className={stage === "error" ? styles.progressBarError : styles.progressBarFill}
                                style={{ width: `${stage === "done" ? 100 : fakeProgress}%` }}
                            />
                        </div>
                        <div className={styles.fileStatus}>
                            {stage === "uploading" && <span className={styles.spinner} aria-label="Uploading" />}
                            {stage === "done" && <span className={styles.check} aria-label="Done">✓</span>}
                            {stage === "error" && <span className={styles.cross} aria-label="Failed">✕</span>}
                        </div>
                    </div>
                    {stage === "done" && (
                        <button onClick={handleCopy} aria-label="Copy link" className={styles.shareButton}>
                            <ShareIcon />
                        </button>
                    )}
                </div>

                {copied && <Toast message="Link copied" />}
                {stage === "error" && errorMessage && showErrorToast && <Toast message={errorMessage} />}

                <button onClick={reset} className={styles.backButton}>
                    ← {stage === "done" ? "Upload another file" : "Back"}
                </button>
            </>
        );
    }

    return (
        <>
            {fileInput}
            <div className={styles.buttonRow}>
                <button onClick={handlePickClick} className={styles.primaryButton}>Upload File</button>
                <button onClick={() => setShowComingSoonToast(true)} className={styles.secondaryButton}>Remote Upload</button>
            </div>
            {showComingSoonToast && <Toast message="Remote Upload coming soon" />}
        </>
    );
}

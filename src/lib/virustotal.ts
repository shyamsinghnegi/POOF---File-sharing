const VT_BASE_URL = "https://www.virustotal.com/api/v3/files";

export type VirusTotalVerdict = "clean" | "malicious" | "Unknown";

export async function checkHashWithVirusTotal(hash: string): Promise<VirusTotalVerdict> {
    const response = await fetch(`${VT_BASE_URL}/${hash}`, {
        headers: {
            "x-apikey": process.env.VIRUSTOTAL_API_KEY!,
        },
    });

    if (response.status === 404) {
        return "Unknown";
    }
    if (!response.ok) {
        throw new Error(`VirusTotal lookup failed with status ${response.status}`);
    }

    const data = await response.json();
    const stats= data.data.attributes.last_analysis_stats;

    return stats.malicious> 0 ? "malicious" : "clean"
}
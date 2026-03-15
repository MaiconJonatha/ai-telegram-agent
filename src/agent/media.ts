/**
 * Per-user media cache and video merging via ffmpeg.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface MediaItem {
  buffer: Buffer;
  type: "image" | "video";
  prompt: string;
  timestamp: number;
}

const MAX_ITEMS_PER_USER = 10;
const mediaCache: Map<string, MediaItem[]> = new Map();

export function addMedia(userId: string, buffer: Buffer, type: "image" | "video", prompt: string): void {
  if (!mediaCache.has(userId)) {
    mediaCache.set(userId, []);
  }
  const items = mediaCache.get(userId)!;
  items.push({ buffer, type, prompt, timestamp: Date.now() });
  // Keep only last 10
  if (items.length > MAX_ITEMS_PER_USER) {
    mediaCache.set(userId, items.slice(-MAX_ITEMS_PER_USER));
  }
}

export function getLastVideos(userId: string, count: number): Buffer[] {
  const items = mediaCache.get(userId);
  if (!items) return [];
  const videos = items.filter((item) => item.type === "video");
  return videos.slice(-count).map((item) => item.buffer);
}

function getFFmpegPath(): string {
  // Try default PATH first
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return "ffmpeg";
  } catch {
    // Try known install locations
    const paths = [
      "C:\\ProgramData\\winget\\Links\\ffmpeg.exe",
      "C:\\Users\\maico\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe",
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return "ffmpeg";
  }
}

export async function mergeVideos(videos: Buffer[]): Promise<Buffer> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-vid-"));
  const ffmpeg = getFFmpegPath();

  try {
    // Save each video to a temp file
    const videoFiles: string[] = [];
    for (let i = 0; i < videos.length; i++) {
      const filePath = path.join(tmpDir, `input_${i}.mp4`);
      fs.writeFileSync(filePath, videos[i]);
      videoFiles.push(filePath);
    }

    // Create concat file list
    const listPath = path.join(tmpDir, "list.txt");
    const listContent = videoFiles
      .map((f) => `file '${f.replace(/\\/g, "/")}'`)
      .join("\n");
    fs.writeFileSync(listPath, listContent);

    const outputPath = path.join(tmpDir, "output.mp4");

    // Try concat with stream copy first (faster, works if codecs match)
    try {
      execSync(
        `"${ffmpeg}" -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`,
        { stdio: "pipe", timeout: 120000 }
      );
    } catch {
      // If codec mismatch, re-encode
      console.log("[Media] Stream copy failed, re-encoding...");
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      execSync(
        `"${ffmpeg}" -f concat -safe 0 -i "${listPath}" -c:v libx264 -c:a aac "${outputPath}"`,
        { stdio: "pipe", timeout: 300000 }
      );
    }

    const result = fs.readFileSync(outputPath);
    return result;
  } finally {
    // Clean up temp files
    try {
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tmpDir, file));
      }
      fs.rmdirSync(tmpDir);
    } catch (e: any) {
      console.log("[Media] Cleanup warning:", e.message);
    }
  }
}

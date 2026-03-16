"use strict";
/**
 * Per-user media cache and video merging via ffmpeg.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMedia = addMedia;
exports.getLastVideos = getLastVideos;
exports.mergeVideos = mergeVideos;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const MAX_ITEMS_PER_USER = 10;
const mediaCache = new Map();
function addMedia(userId, buffer, type, prompt) {
    if (!mediaCache.has(userId)) {
        mediaCache.set(userId, []);
    }
    const items = mediaCache.get(userId);
    items.push({ buffer, type, prompt, timestamp: Date.now() });
    // Keep only last 10
    if (items.length > MAX_ITEMS_PER_USER) {
        mediaCache.set(userId, items.slice(-MAX_ITEMS_PER_USER));
    }
}
function getLastVideos(userId, count) {
    const items = mediaCache.get(userId);
    if (!items)
        return [];
    const videos = items.filter((item) => item.type === "video");
    return videos.slice(-count).map((item) => item.buffer);
}
function getFFmpegPath() {
    // Try default PATH first
    try {
        (0, child_process_1.execSync)("ffmpeg -version", { stdio: "ignore" });
        return "ffmpeg";
    }
    catch {
        // Try known install locations
        const paths = [
            "C:\\ProgramData\\winget\\Links\\ffmpeg.exe",
            "C:\\Users\\maico\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe",
        ];
        for (const p of paths) {
            if (fs.existsSync(p))
                return p;
        }
        return "ffmpeg";
    }
}
async function mergeVideos(videos) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-vid-"));
    const ffmpeg = getFFmpegPath();
    try {
        // Save each video to a temp file
        const videoFiles = [];
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
            (0, child_process_1.execSync)(`"${ffmpeg}" -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`, { stdio: "pipe", timeout: 120000 });
        }
        catch {
            // If codec mismatch, re-encode
            console.log("[Media] Stream copy failed, re-encoding...");
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
            (0, child_process_1.execSync)(`"${ffmpeg}" -f concat -safe 0 -i "${listPath}" -c:v libx264 -c:a aac "${outputPath}"`, { stdio: "pipe", timeout: 300000 });
        }
        const result = fs.readFileSync(outputPath);
        return result;
    }
    finally {
        // Clean up temp files
        try {
            const files = fs.readdirSync(tmpDir);
            for (const file of files) {
                fs.unlinkSync(path.join(tmpDir, file));
            }
            fs.rmdirSync(tmpDir);
        }
        catch (e) {
            console.log("[Media] Cleanup warning:", e.message);
        }
    }
}
//# sourceMappingURL=media.js.map
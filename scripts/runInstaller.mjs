/*
 * Kamidere, a modification for Discord's desktop app
 * Copyright (c) 2026 Kamidere contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import "./checkNodeVersion.js";

import { execFileSync, execSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, isAbsolute, join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { fileURLToPath } from "url";

const BASE_URL = process.env.KAMIDERE_INSTALLER_BASE_URL || "https://github.com/clrxxo/KamidereInstaller/releases/latest/download/";
const INSTALLER_PATH_DARWIN = process.env.KAMIDERE_INSTALLER_PATH_DARWIN || "KamidereInstaller.app/Contents/MacOS/KamidereInstaller";
const INSTALLER_APP_DARWIN = process.env.KAMIDERE_INSTALLER_APP_DARWIN || "KamidereInstaller.app";

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER_PROJECT_DIR = join(dirname(BASE_DIR), "KamidereInstaller");
const FILE_DIR = join(BASE_DIR, "dist", "Installer");

function unique(values) {
    return [...new Set(values)];
}

function installerDownloadCandidates() {
    switch (process.platform) {
        case "win32":
            return unique([
                process.env.KAMIDERE_INSTALLER_FILENAME_WIN32,
                "KamidereCli.exe",
                "EquilotlCli.exe"
            ].filter(Boolean));
        case "darwin":
            return unique([
                process.env.KAMIDERE_INSTALLER_FILENAME_DARWIN,
                "KamidereInstaller.MacOS.zip",
                "Equilotl.MacOS.zip"
            ].filter(Boolean));
        case "linux":
            return unique([
                process.env.KAMIDERE_INSTALLER_FILENAME_LINUX,
                "KamidereCli-linux",
                "EquilotlCli-linux",
                "EquilotlCli-Linux"
            ].filter(Boolean));
        default:
            throw new Error("Unsupported platform: " + process.platform);
    }
}

function installerBinaryCandidates() {
    const project = [];
    const cached = [];

    switch (process.platform) {
        case "win32":
            project.push(
                join(INSTALLER_PROJECT_DIR, "KamidereCli.exe"),
                join(INSTALLER_PROJECT_DIR, "EquilotlCli.exe")
            );
            cached.push(
                join(FILE_DIR, "KamidereCli.exe"),
                join(FILE_DIR, "EquilotlCli.exe")
            );
            break;
        case "darwin":
            project.push(
                join(INSTALLER_PROJECT_DIR, INSTALLER_PATH_DARWIN),
                join(INSTALLER_PROJECT_DIR, "KamidereInstaller"),
                join(INSTALLER_PROJECT_DIR, "Equilotl.app", "Contents", "MacOS", "Equilotl")
            );
            cached.push(
                join(FILE_DIR, INSTALLER_PATH_DARWIN),
                join(FILE_DIR, "Equilotl.app", "Contents", "MacOS", "Equilotl")
            );
            break;
        case "linux":
            project.push(
                join(INSTALLER_PROJECT_DIR, "KamidereCli-linux"),
                join(INSTALLER_PROJECT_DIR, "EquilotlCli-linux")
            );
            cached.push(
                join(FILE_DIR, "KamidereCli-linux"),
                join(FILE_DIR, "EquilotlCli-linux"),
                join(FILE_DIR, "EquilotlCli-Linux")
            );
            break;
        default:
            throw new Error("Unsupported platform: " + process.platform);
    }

    return unique([...project, ...cached]);
}

function resolveInstallerOverride() {
    const override = process.env.KAMIDERE_INSTALLER_BIN;
    if (!override)
        return null;

    return isAbsolute(override) ? override : join(BASE_DIR, override);
}

function findLocalInstaller() {
    const override = resolveInstallerOverride();
    if (override && existsSync(override))
        return override;

    return installerBinaryCandidates().find(candidate => existsSync(candidate)) || null;
}

function getEtagFile(filename) {
    return join(FILE_DIR, `${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}.etag.txt`);
}

async function downloadInstaller(filename) {
    console.log(`Downloading Kamidere installer payload (${filename})`);

    const downloadName = join(FILE_DIR, filename);
    const outputFile = process.platform === "darwin"
        ? join(FILE_DIR, INSTALLER_PATH_DARWIN)
        : downloadName;
    const outputApp = process.platform === "darwin"
        ? join(FILE_DIR, INSTALLER_APP_DARWIN)
        : null;
    const etagFile = getEtagFile(filename);
    const etag = existsSync(outputFile) && existsSync(etagFile)
        ? readFileSync(etagFile, "utf-8")
        : null;

    const res = await fetch(BASE_URL + filename, {
        headers: {
            "User-Agent": "Kamidere",
            "If-None-Match": etag
        }
    });

    if (res.status === 304) {
        console.log(`Installer cache for ${filename} is up to date.`);
        return outputFile;
    }
    if (res.status === 404)
        return null;
    if (!res.ok)
        throw new Error(`Failed to download installer: ${res.status} ${res.statusText}`);

    writeFileSync(etagFile, res.headers.get("etag") || "");

    if (process.platform === "darwin") {
        console.log("Saving zip...");
        const zip = new Uint8Array(await res.arrayBuffer());
        writeFileSync(downloadName, zip);

        console.log("Unzipping app bundle...");
        execSync(`ditto -x -k '${downloadName}' '${FILE_DIR}'`);

        console.log("Clearing quarantine from installer app (this is required to run it)");
        console.log("xattr might error, that's okay");

        const logAndRun = cmd => {
            console.log("Running", cmd);
            try {
                execSync(cmd);
            } catch {}
        };
        logAndRun(`sudo xattr -dr com.apple.quarantine '${outputApp}'`);
    } else {
        if (!res.body)
            throw new Error("Installer download returned an empty response body");

        const body = Readable.fromWeb(res.body);
        await finished(body.pipe(createWriteStream(outputFile, {
            mode: 0o755,
            autoClose: true
        })));
    }

    console.log("Finished downloading!");

    return outputFile;
}

async function ensureBinary() {
    mkdirSync(FILE_DIR, { recursive: true });

    const localInstaller = findLocalInstaller();
    if (localInstaller) {
        console.log(`Using local Kamidere installer: ${localInstaller}`);
        return localInstaller;
    }

    for (const filename of installerDownloadCandidates()) {
        const downloaded = await downloadInstaller(filename);
        if (downloaded)
            return downloaded;
    }

    throw new Error(`Failed to find a compatible Kamidere installer binary. Checked ${INSTALLER_PROJECT_DIR} and ${BASE_URL}`);
}

const installerBin = await ensureBinary();

console.log("Now running Kamidere Installer...");

const argStart = process.argv.indexOf("--");
const args = argStart === -1 ? [] : process.argv.slice(argStart + 1);

try {
    execFileSync(installerBin, args, {
        stdio: "inherit",
        env: {
            ...process.env,
            KAMIDERE_USER_DATA_DIR: BASE_DIR,
            KAMIDERE_DIRECTORY: join(BASE_DIR, "dist/desktop"),
            KAMIDERE_DEV_INSTALL: "1",
            EQUICORD_USER_DATA_DIR: BASE_DIR,
            EQUICORD_DIRECTORY: join(BASE_DIR, "dist/desktop"),
            EQUICORD_DEV_INSTALL: "1"
        }
    });
} catch {
    console.error("Something went wrong. Please check the logs above.");
}

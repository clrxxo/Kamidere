/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BRAND_ICON_DATA_URL, BRAND_NAME } from "@shared/branding";

export type PluginSourceId = "kamidere" | "equicord" | "vencord" | "user" | "unknown";

interface PluginSourceInfo {
    id: PluginSourceId;
    displayName: string;
    badgeAlt: string;
    badgeSrc: string;
    sourceButtonText: string;
    tooltip: string;
    websiteButtonText?: string;
    websiteUrl?: string;
}

const VENCORD_ICON_URL = "https://vencord.dev/assets/favicon.png";
const EQUICORD_ICON_URL = "https://equicord.org/assets/favicon.webp";
const svgToDataUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const USER_PLUGIN_ICON_DATA_URL = svgToDataUrl([
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    '<path fill="#507a2a" d="M16 3a6 6 0 1 1 0 12A6 6 0 0 1 16 3Z"/>',
    '<path fill="#507a2a" d="M5 28a11 11 0 1 1 22 0Z"/>',
    "</svg>",
].join(""));

const UNKNOWN_PLUGIN_ICON_DATA_URL = svgToDataUrl([
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    '<path fill="#7f8388" d="M16 3a13 13 0 1 1 0 26a13 13 0 0 1 0-26Zm0 18.2a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3Zm0-13.3c-3 0-5.1 1.9-5.1 4.7h3.1c0-1.1.8-1.9 2-1.9c1.1 0 1.9.7 1.9 1.8c0 1-.5 1.5-1.6 2.1c-1.7.9-2.7 1.9-2.7 4.3h3c0-1.1.3-1.6 1.7-2.4c1.4-.8 2.7-2 2.7-4.3c0-2.7-2-4.3-5-4.3Z"/>',
    "</svg>",
].join(""));

const SOURCE_PATHS = {
    kamidere: "src/kamidereplugins/",
    equicord: "src/equicordplugins/",
    vencord: "src/plugins/",
} as const;

export function getPluginSourceId(folderName?: string, userPlugin = false): PluginSourceId {
    if (userPlugin) return "user";
    if (!folderName) return "unknown";
    if (folderName.startsWith(SOURCE_PATHS.kamidere)) return "kamidere";
    if (folderName.startsWith(SOURCE_PATHS.equicord)) return "equicord";
    if (folderName.startsWith(SOURCE_PATHS.vencord)) return "vencord";
    return "unknown";
}

export function getPluginSourceInfo(folderName?: string, userPlugin = false, isModified = false, pluginName?: string): PluginSourceInfo {
    const sourceId = getPluginSourceId(folderName, userPlugin);

    switch (sourceId) {
        case "kamidere":
            return {
                id: sourceId,
                displayName: BRAND_NAME,
                badgeAlt: BRAND_NAME,
                badgeSrc: BRAND_ICON_DATA_URL,
                sourceButtonText: `${BRAND_NAME} Source`,
                tooltip: isModified ? `Modified upstream plugin from ${BRAND_NAME}` : `${BRAND_NAME} Plugin`,
            };
        case "equicord":
            return {
                id: sourceId,
                displayName: "Equicord",
                badgeAlt: "Equicord",
                badgeSrc: EQUICORD_ICON_URL,
                sourceButtonText: "Equicord Source",
                tooltip: isModified ? "Modified upstream plugin from Equicord" : "Equicord Plugin",
            };
        case "vencord":
            return {
                id: sourceId,
                displayName: "Vencord",
                badgeAlt: "Vencord",
                badgeSrc: VENCORD_ICON_URL,
                sourceButtonText: "Vencord Source",
                tooltip: isModified ? "Modified upstream plugin from Vencord" : "Vencord Plugin",
                websiteButtonText: "Vencord Page",
                websiteUrl: pluginName ? `https://vencord.dev/plugins/${pluginName}` : undefined,
            };
        case "user":
            return {
                id: sourceId,
                displayName: "User",
                badgeAlt: "User",
                badgeSrc: USER_PLUGIN_ICON_DATA_URL,
                sourceButtonText: "Source Code",
                tooltip: "User Plugin",
            };
        default:
            return {
                id: sourceId,
                displayName: "Unknown",
                badgeAlt: "Unknown",
                badgeSrc: UNKNOWN_PLUGIN_ICON_DATA_URL,
                sourceButtonText: "Source Code",
                tooltip: isModified ? "Modified upstream plugin" : "Unknown Plugin",
            };
    }
}

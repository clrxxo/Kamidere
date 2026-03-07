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

const svgToDataUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const EQUICORD_ICON_DATA_URL = svgToDataUrl([
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 930 930">',
    '<path fill="#8e2337" d="M836 465.5C836 670.121 670.121 836 465.5 836C260.879 836 95 670.121 95 465.5C95 260.879 260.879 95 465.5 95C670.121 95 836 260.879 836 465.5ZM242.322 465.5C242.322 588.758 342.242 688.678 465.5 688.678C588.758 688.678 688.678 588.758 688.678 465.5C688.678 342.242 588.758 242.322 465.5 242.322C342.242 242.322 242.322 342.242 242.322 465.5Z"/>',
    '<path fill="#8e2337" d="M584.219 465.898C584.219 531.245 531.245 584.219 465.898 584.219C440.35 584.219 416.693 576.122 397.353 562.354L260.937 644.321C451.4 528.542 329.698 492.311 204.538 566.663L348.433 480.202C347.868 475.513 347.577 470.74 347.577 465.898C347.577 400.552 400.552 347.577 465.898 347.577C491.108 347.577 514.477 355.462 533.673 368.899L627.819 312.331C610.898 294.399 591.056 279.324 569.045 267.796C534.72 249.819 496.306 241.088 457.582 242.462C418.858 243.837 381.16 255.27 348.196 275.637C315.232 296.003 288.138 324.6 269.581 358.616C262.856 370.943 257.336 383.828 253.065 397.091C240.595 435.815 209.386 470.244 168.712 470.997C128.037 471.751 93.7099 439.084 101.005 399.061C108.06 360.359 121.262 322.87 140.254 288.06C171.06 231.591 216.039 184.116 270.763 150.306C325.486 116.495 388.07 97.5155 452.356 95.2335C516.641 92.9515 580.413 107.446 637.397 137.29C694.38 167.134 742.612 211.301 777.345 265.444C812.079 319.586 832.118 381.839 835.491 446.076C838.863 510.313 825.452 574.322 796.579 631.804C778.78 667.239 755.483 699.439 727.687 727.279C698.944 756.068 652.543 746.455 629.998 712.591C607.453 678.727 617.982 633.466 642.711 601.164C651.181 590.1 658.628 578.224 664.932 565.676C682.324 531.051 690.402 492.494 688.371 453.799C687.303 433.462 683.462 413.454 677.02 394.312L583.246 450.657C583.889 455.647 584.219 460.734 584.219 465.898ZM260.937 644.321C258.599 645.742 256.214 647.175 253.783 648.619L260.937 644.321Z"/>',
    '<path fill="#f2ddcf" d="M470.711 406.73C493.342 393.132 522.712 400.455 536.311 423.086C549.909 445.718 542.587 475.088 519.955 488.687L253.783 648.619L204.538 566.663L470.711 406.73Z"/>',
    "</svg>",
].join(""));

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
                badgeSrc: EQUICORD_ICON_DATA_URL,
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

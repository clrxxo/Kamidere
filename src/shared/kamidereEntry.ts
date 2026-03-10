/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BRAND_NAME } from "@shared/branding";
import { FluxDispatcher, UserStore } from "@webpack/common";

const ROOT_ID = "kamidere-entry";
const STYLE_ID = "kamidere-entry-style";
const SESSION_KEY = "kamidere-entry-shown";
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

let initialized = false;
let shown = false;
let observer: MutationObserver | null = null;
let fallbackTimer: number | null = null;
let scrambleTimer: number | null = null;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        #${ROOT_ID} {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: grid;
            place-items: center;
            pointer-events: none;
            opacity: 0;
            transition: opacity 220ms ease;
        }

        #${ROOT_ID}.is-visible {
            opacity: 1;
        }

        #${ROOT_ID}.is-leaving {
            opacity: 0;
        }

        .kamidere-entry__title {
            display: inline-flex;
            align-items: center;
            gap: 0.02em;
            padding: 0 24px;
            color: var(--header-primary, #f2f3f5);
            font-family: "gg sans", "ABC Ginto Nord", "Segoe UI Variable", "Helvetica Neue", system-ui, sans-serif;
            font-size: clamp(3.2rem, 8vw, 7rem);
            font-weight: 700;
            letter-spacing: 0.1em;
            line-height: 1;
            text-shadow: 0 0 18px rgb(255 255 255 / 0.035);
            white-space: nowrap;
        }

        .kamidere-entry__char {
            display: inline-block;
            min-width: 0.72em;
            text-align: center;
            transition:
                opacity 160ms ease,
                color 160ms ease,
                transform 160ms ease;
        }

        .kamidere-entry__char.is-scrambling {
            color: var(--text-normal, #dbdee1);
            opacity: 0.82;
        }

        .kamidere-entry__char.is-final {
            color: var(--header-primary, #f2f3f5);
            opacity: 1;
        }
    `;

    (document.head ?? document.documentElement).append(style);
}

function hasLoggedInUser() {
    return !!UserStore.getCurrentUser()?.id;
}

function cleanupWaiters() {
    observer?.disconnect();
    observer = null;

    if (fallbackTimer != null) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
    }
}

function randomGlyph(reference: string) {
    if (reference === " ") return " ";
    const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    return reference === reference.toUpperCase() ? glyph.toUpperCase() : glyph.toLowerCase();
}

function finalizeChars(charNodes: HTMLSpanElement[]) {
    charNodes.forEach((node, index) => {
        node.textContent = BRAND_NAME[index];
        node.className = "kamidere-entry__char is-final";
    });
}

function mountEntry() {
    if (shown || sessionStorage.getItem(SESSION_KEY) === "1") return;

    shown = true;
    sessionStorage.setItem(SESSION_KEY, "1");
    ensureStyle();

    const root = document.createElement("div");
    root.id = ROOT_ID;

    const title = document.createElement("div");
    title.className = "kamidere-entry__title";

    const charNodes = Array.from(BRAND_NAME, char => {
        const node = document.createElement("span");
        node.className = "kamidere-entry__char is-scrambling";
        node.textContent = randomGlyph(char);
        title.append(node);
        return node;
    });

    root.append(title);
    (document.body ?? document.documentElement).append(root);

    requestAnimationFrame(() => root.classList.add("is-visible"));

    let settled = 0;
    scrambleTimer = window.setInterval(() => {
        settled = Math.min(BRAND_NAME.length, settled + 1);

        charNodes.forEach((node, index) => {
            if (index < settled) {
                node.textContent = BRAND_NAME[index];
                node.className = "kamidere-entry__char is-final";
                return;
            }

            node.textContent = randomGlyph(BRAND_NAME[index]);
            node.className = "kamidere-entry__char is-scrambling";
        });

        if (settled >= BRAND_NAME.length) {
            if (scrambleTimer != null) {
                clearInterval(scrambleTimer);
                scrambleTimer = null;
            }

            finalizeChars(charNodes);

            window.setTimeout(() => {
                root.classList.add("is-leaving");
                window.setTimeout(() => root.remove(), 220);
            }, 620);
        }
    }, 52);
}

function scheduleShowWhenReady() {
    if (shown || !hasLoggedInUser()) return;

    const maybeShow = () => {
        if (shown || !hasLoggedInUser()) return;

        const appMount = document.querySelector("#app-mount") as HTMLElement | null;
        if (!appMount || appMount.childElementCount === 0) return;

        cleanupWaiters();
        window.setTimeout(mountEntry, 160);
    };

    maybeShow();
    if (shown) return;

    cleanupWaiters();
    observer = new MutationObserver(maybeShow);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    fallbackTimer = window.setTimeout(() => {
        cleanupWaiters();
        if (hasLoggedInUser()) mountEntry();
    }, 4000);
}

export function initKamidereEntry() {
    if (initialized || sessionStorage.getItem(SESSION_KEY) === "1") return;
    initialized = true;

    const onConnectionOpen = () => {
        scheduleShowWhenReady();
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", onConnectionOpen);
        FluxDispatcher.unsubscribe("CONNECTION_OPEN_SUPPLEMENTAL", onConnectionOpen);
    };

    scheduleShowWhenReady();
    FluxDispatcher.subscribe("CONNECTION_OPEN", onConnectionOpen);
    FluxDispatcher.subscribe("CONNECTION_OPEN_SUPPLEMENTAL", onConnectionOpen);
}

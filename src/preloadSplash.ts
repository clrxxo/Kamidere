/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BRAND_NAME } from "@shared/branding";
import { KamidereSplashBridge, KamidereSplashStage, KAMIDERE_SPLASH_MAIN_WINDOW_ARG } from "@shared/kamidereSplash";

const ROOT_ID = "kamidere-loading-screen";
const STYLE_ID = "kamidere-loading-screen-style";
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const REVEAL_PROGRESS: Record<KamidereSplashStage, number> = {
    [KamidereSplashStage.Preload]: 0.2,
    [KamidereSplashStage.Renderer]: 0.42,
    [KamidereSplashStage.DOMReady]: 0.68,
    [KamidereSplashStage.WebpackReady]: 0.88,
    [KamidereSplashStage.Ready]: 1
};

interface SplashState {
    active: boolean;
    mounted: boolean;
    finished: boolean;
    currentProgress: number;
    targetProgress: number;
    animationFrame: number | null;
    root: HTMLDivElement | null;
    textNode: HTMLSpanElement | null;
}

function getSplashCss() {
    return `
        html, body {
            background: #070508;
        }

        #${ROOT_ID} {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            display: grid;
            place-items: center;
            overflow: hidden;
            background:
                radial-gradient(circle at 22% 18%, rgb(245 184 95 / 0.12), transparent 28%),
                radial-gradient(circle at 78% 78%, rgb(124 30 46 / 0.18), transparent 34%),
                linear-gradient(135deg, #060406 0%, #0c0709 38%, #160a10 100%);
            opacity: 1;
            visibility: visible;
            transition:
                opacity 460ms cubic-bezier(0.22, 1, 0.36, 1),
                visibility 460ms linear;
            pointer-events: all;
            user-select: none;
        }

        #${ROOT_ID}::before {
            content: "";
            position: absolute;
            inset: -18%;
            background:
                radial-gradient(circle at 50% 50%, rgb(237 187 95 / 0.12), transparent 22%),
                radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0.03), transparent 38%);
            filter: blur(34px);
            transform: scale(1.08);
            pointer-events: none;
        }

        #${ROOT_ID}.is-finishing {
            opacity: 0;
            visibility: hidden;
        }

        #${ROOT_ID}.is-finishing .kamidere-loading-screen__text {
            transform: translateY(-6px) scale(0.985);
            filter: blur(8px);
            opacity: 0;
        }

        .kamidere-loading-screen__inner {
            position: relative;
            z-index: 1;
            display: grid;
            place-items: center;
            width: min(92vw, 1120px);
            padding: 32px 24px;
        }

        .kamidere-loading-screen__text {
            margin: 0;
            color: #f7ead6;
            font-family: "gg sans", "ABC Ginto Nord", "Segoe UI Variable", "Helvetica Neue", system-ui, sans-serif;
            font-size: clamp(3.5rem, 9vw, 8.5rem);
            font-weight: 700;
            letter-spacing: 0.14em;
            line-height: 1;
            text-transform: none;
            text-wrap: nowrap;
            text-shadow:
                0 0 18px rgb(240 186 102 / 0.12),
                0 0 38px rgb(123 30 46 / 0.2);
            transition:
                transform 460ms cubic-bezier(0.22, 1, 0.36, 1),
                opacity 460ms cubic-bezier(0.22, 1, 0.36, 1),
                filter 460ms cubic-bezier(0.22, 1, 0.36, 1);
            white-space: nowrap;
        }
    `;
}

function createRoot() {
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-label", `${BRAND_NAME} is loading`);

    const inner = document.createElement("div");
    inner.className = "kamidere-loading-screen__inner";

    const textNode = document.createElement("span");
    textNode.className = "kamidere-loading-screen__text";
    textNode.textContent = "";

    inner.append(textNode);
    root.append(inner);

    return { root, textNode };
}

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = getSplashCss();

    (document.head ?? document.documentElement).append(style);
}

function getMountTarget() {
    return document.body ?? document.documentElement;
}

function ensureMounted(state: SplashState) {
    if (state.mounted) return;

    ensureStyle();

    const { root, textNode } = createRoot();
    getMountTarget().append(root);

    state.root = root;
    state.textNode = textNode;
    state.mounted = true;
}

function randomGlyph(reference: string) {
    if (reference === " ") return " ";
    const index = Math.floor(Math.random() * GLYPHS.length);
    const glyph = GLYPHS[index];
    return reference === reference.toUpperCase() ? glyph.toUpperCase() : glyph.toLowerCase();
}

function renderText(state: SplashState) {
    if (!state.textNode) return;

    const revealCount = Math.floor(BRAND_NAME.length * state.currentProgress);
    const chars = Array.from(BRAND_NAME, (char, index) => index < revealCount ? char : randomGlyph(char));
    state.textNode.textContent = chars.join("");
}

function stepAnimation(state: SplashState) {
    if (!state.active || state.finished) {
        state.animationFrame = null;
        return;
    }

    state.currentProgress += (state.targetProgress - state.currentProgress) * 0.18;

    if (Math.abs(state.targetProgress - state.currentProgress) < 0.0025) {
        state.currentProgress = state.targetProgress;
    }

    renderText(state);
    state.animationFrame = requestAnimationFrame(() => stepAnimation(state));
}

function ensureAnimation(state: SplashState) {
    if (state.animationFrame != null) return;
    state.animationFrame = requestAnimationFrame(() => stepAnimation(state));
}

export function shouldInstallKamidereSplash() {
    return location.protocol !== "data:" && process.argv.includes(KAMIDERE_SPLASH_MAIN_WINDOW_ARG);
}

export function createKamidereSplashBridge(): KamidereSplashBridge {
    const state: SplashState = {
        active: true,
        mounted: false,
        finished: false,
        currentProgress: 0,
        targetProgress: 0,
        animationFrame: null,
        root: null,
        textNode: null
    };

    const mount = () => {
        if (state.finished) return;
        ensureMounted(state);
        ensureAnimation(state);
        renderText(state);
    };

    if (document.documentElement) {
        mount();
    } else if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
        mount();
    }

    const bridge: KamidereSplashBridge = {
        setStage(stage) {
            if (state.finished) return;

            mount();
            const progress = REVEAL_PROGRESS[stage as KamidereSplashStage] ?? state.targetProgress;
            state.targetProgress = Math.max(state.targetProgress, progress);
            state.root?.setAttribute("data-stage", stage);
            ensureAnimation(state);
        },
        finish() {
            if (state.finished) return;

            mount();
            state.finished = true;
            state.targetProgress = 1;
            state.currentProgress = 1;
            renderText(state);

            if (state.animationFrame != null) {
                cancelAnimationFrame(state.animationFrame);
                state.animationFrame = null;
            }

            state.root?.classList.add("is-finishing");
            window.setTimeout(() => {
                state.active = false;
                state.root?.remove();
                state.root = null;
                state.textNode = null;
            }, 480);
        },
        isActive() {
            return state.active;
        }
    };

    bridge.setStage(KamidereSplashStage.Preload);
    return bridge;
}

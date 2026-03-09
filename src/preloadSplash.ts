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
const MAX_SPLASH_LIFETIME_MS = 2200;
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
    revealedCount: number;
    targetRevealedCount: number;
    animationFrame: number | null;
    phaseStartAt: number;
    phaseDurationMs: number;
    phaseFromCount: number;
    phaseToCount: number;
    finishingTimer: number | null;
    fallbackTimer: number | null;
    fallbackPollTimer: number | null;
    root: HTMLDivElement | null;
    textNode: HTMLSpanElement | null;
    charNodes: HTMLSpanElement[];
}

function getSplashCss() {
    return `
        html, body {
            background: var(--background-primary, #111214);
        }

        #${ROOT_ID} {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            display: grid;
            place-items: center;
            overflow: hidden;
            background:
                linear-gradient(180deg, var(--background-primary, #111214) 0%, var(--background-secondary, #1a1b1e) 100%);
            opacity: 1;
            visibility: visible;
            transition:
                opacity 460ms cubic-bezier(0.22, 1, 0.36, 1),
                visibility 460ms linear;
            pointer-events: none;
            user-select: none;
        }

        #${ROOT_ID}::before {
            content: "";
            position: absolute;
            inset: -18%;
            background:
                radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0.018), transparent 18%);
            filter: blur(56px);
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
            display: inline-flex;
            align-items: center;
            gap: 0.02em;
            margin: 0;
            font-family: "gg sans", "ABC Ginto Nord", "Segoe UI Variable", "Helvetica Neue", system-ui, sans-serif;
            font-size: clamp(3.5rem, 9vw, 8.5rem);
            font-weight: 700;
            letter-spacing: 0.1em;
            line-height: 1;
            text-transform: none;
            text-wrap: nowrap;
            text-shadow:
                0 0 18px rgb(255 255 255 / 0.03);
            transition:
                transform 460ms cubic-bezier(0.22, 1, 0.36, 1),
                opacity 460ms cubic-bezier(0.22, 1, 0.36, 1),
                filter 460ms cubic-bezier(0.22, 1, 0.36, 1);
            white-space: nowrap;
        }

        .kamidere-loading-screen__char {
            display: inline-block;
            min-width: 0.72em;
            color: var(--header-primary, #f2f3f5);
            text-align: center;
            transition:
                color 180ms ease,
                opacity 180ms ease,
                transform 180ms ease;
        }

        .kamidere-loading-screen__char.is-ghost {
            color: var(--text-muted, #8b8d97);
            opacity: 0.18;
        }

        .kamidere-loading-screen__char.is-scrambling {
            color: var(--text-normal, #dbdee1);
            opacity: 0.76;
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
    const charNodes = Array.from(BRAND_NAME, char => {
        const charNode = document.createElement("span");
        charNode.className = "kamidere-loading-screen__char is-ghost";
        charNode.textContent = char;
        textNode.append(charNode);
        return charNode;
    });

    inner.append(textNode);
    root.append(inner);

    return { root, textNode, charNodes };
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

    const { root, textNode, charNodes } = createRoot();
    getMountTarget().append(root);

    state.root = root;
    state.textNode = textNode;
    state.charNodes = charNodes;
    state.mounted = true;
}

function randomGlyph(reference: string) {
    if (reference === " ") return " ";
    const index = Math.floor(Math.random() * GLYPHS.length);
    const glyph = GLYPHS[index];
    return reference === reference.toUpperCase() ? glyph.toUpperCase() : glyph.toLowerCase();
}

function renderText(state: SplashState, revealCount: number, scrambleCount = 0) {
    if (!state.charNodes.length) return;

    state.charNodes.forEach((node, index) => {
        if (index < revealCount) {
            node.textContent = BRAND_NAME[index];
            node.className = "kamidere-loading-screen__char";
            return;
        }

        if (index < revealCount + scrambleCount) {
            node.textContent = randomGlyph(BRAND_NAME[index]);
            node.className = "kamidere-loading-screen__char is-scrambling";
            return;
        }

        node.textContent = BRAND_NAME[index];
        node.className = "kamidere-loading-screen__char is-ghost";
    });
}

function stepAnimation(state: SplashState) {
    if (!state.active) {
        state.animationFrame = null;
        return;
    }

    const elapsed = performance.now() - state.phaseStartAt;
    const progress = Math.min(1, elapsed / state.phaseDurationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    const interpolated = state.phaseFromCount + (state.phaseToCount - state.phaseFromCount) * eased;
    const revealCount = Math.floor(interpolated);
    const scrambleCount = progress >= 1 ? 0 : Math.min(2, Math.max(1, state.phaseToCount - revealCount));

    renderText(state, revealCount, scrambleCount);

    if (progress >= 1) {
        state.revealedCount = state.phaseToCount;
        state.targetRevealedCount = state.phaseToCount;
        state.animationFrame = null;
        renderText(state, state.revealedCount, 0);

        if (state.finished && state.finishingTimer == null) {
            state.root?.classList.add("is-finishing");
            state.finishingTimer = window.setTimeout(() => {
                state.active = false;
                state.root?.remove();
                state.root = null;
                state.textNode = null;
                state.charNodes = [];
            }, 480);
        }

        return;
    }

    state.animationFrame = requestAnimationFrame(() => stepAnimation(state));
}

function ensureAnimation(state: SplashState, nextCount: number) {
    state.phaseStartAt = performance.now();
    state.phaseDurationMs = Math.max(260, 260 + Math.abs(nextCount - state.revealedCount) * 110);
    state.phaseFromCount = state.revealedCount;
    state.phaseToCount = nextCount;

    if (state.animationFrame != null) return;
    state.animationFrame = requestAnimationFrame(() => stepAnimation(state));
}

function toRevealCount(stage: KamidereSplashStage | `${KamidereSplashStage}`) {
    const progress = REVEAL_PROGRESS[stage as KamidereSplashStage] ?? 0;
    return Math.max(1, Math.min(BRAND_NAME.length, Math.round(BRAND_NAME.length * progress)));
}

function cleanupFallback(state: SplashState) {
    if (state.fallbackTimer != null) {
        clearTimeout(state.fallbackTimer);
        state.fallbackTimer = null;
    }

    if (state.fallbackPollTimer != null) {
        clearInterval(state.fallbackPollTimer);
        state.fallbackPollTimer = null;
    }
}

function scheduleBridgeFinish(bridge: KamidereSplashBridge, delayMs = 0) {
    window.setTimeout(() => {
        bridge.setStage(KamidereSplashStage.Ready);
        bridge.finish();
    }, delayMs);
}

function startFallbackFinishWatch(state: SplashState, bridge: KamidereSplashBridge) {
    const maybeFinish = () => {
        if (state.finished) return;

        const appMount = document.querySelector("#app-mount") as HTMLElement | null;
        const hasContent = !!appMount && appMount.childElementCount > 0;

        if (!hasContent) return;

        cleanupFallback(state);
        scheduleBridgeFinish(bridge, 80);
    };

    state.fallbackPollTimer = window.setInterval(maybeFinish, 120);
    window.addEventListener("load", maybeFinish, { once: true });
    document.addEventListener("DOMContentLoaded", maybeFinish, { once: true });
    requestAnimationFrame(maybeFinish);
    state.fallbackTimer = window.setTimeout(() => {
        cleanupFallback(state);
        scheduleBridgeFinish(bridge);
    }, MAX_SPLASH_LIFETIME_MS);
}

export function shouldInstallKamidereSplash() {
    return location.protocol !== "data:" && process.argv.includes(KAMIDERE_SPLASH_MAIN_WINDOW_ARG);
}

export function createKamidereSplashBridge(): KamidereSplashBridge {
    const state: SplashState = {
        active: true,
        mounted: false,
        finished: false,
        revealedCount: 0,
        targetRevealedCount: 0,
        animationFrame: null,
        phaseStartAt: 0,
        phaseDurationMs: 360,
        phaseFromCount: 0,
        phaseToCount: 0,
        finishingTimer: null,
        fallbackTimer: null,
        fallbackPollTimer: null,
        root: null,
        textNode: null,
        charNodes: []
    };

    const mount = () => {
        if (state.finished) return;
        ensureMounted(state);
        renderText(state, state.revealedCount, 0);
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
            if (state.finished || !state.active) return;

            mount();
            const nextCount = Math.max(state.targetRevealedCount, toRevealCount(stage));
            if (nextCount <= state.revealedCount && state.animationFrame == null) return;

            state.targetRevealedCount = nextCount;
            state.root?.setAttribute("data-stage", stage);
            ensureAnimation(state, nextCount);
        },
        finish() {
            if (state.finished || !state.active) return;

            mount();
            state.finished = true;
            cleanupFallback(state);
            ensureAnimation(state, BRAND_NAME.length);
        },
        isActive() {
            return state.active;
        }
    };

    bridge.setStage(KamidereSplashStage.Preload);
    startFallbackFinishWatch(state, bridge);
    return bridge;
}

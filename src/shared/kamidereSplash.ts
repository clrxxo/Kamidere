/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const KAMIDERE_SPLASH_MAIN_WINDOW_ARG = "--kamidere-main-window";

export const enum KamidereSplashStage {
    Preload = "preload",
    Renderer = "renderer",
    DOMReady = "dom-ready",
    WebpackReady = "webpack-ready",
    Ready = "ready"
}

export interface KamidereSplashBridge {
    setStage(stage: KamidereSplashStage | `${KamidereSplashStage}`): void;
    finish(): void;
    isActive(): boolean;
}

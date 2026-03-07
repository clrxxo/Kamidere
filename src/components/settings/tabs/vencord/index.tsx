/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./VencordTab.css";

import { openNotificationLogModal } from "@api/Notifications/notificationLog";
import { plugins } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { CloudIcon, FolderIcon, GithubIcon, LogIcon, PaintbrushIcon, RestartIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { openPluginModal, SettingsTab, wrapTab } from "@components/settings";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { SpecialCard } from "@components/settings/SpecialCard";
import { BRAND_ICON_DATA_URL, BRAND_NAME, BRAND_TAGLINE, BRAND_TAGLINE_SHORT } from "@shared/branding";
import { gitRemote } from "@shared/vencordUserAgent";
import { IS_MAC, IS_WINDOWS } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { identity } from "@utils/misc";
import { relaunch } from "@utils/native";
import { React, Select, SettingsRouter } from "@webpack/common";

import { openNotificationSettingsModal } from "./NotificationSettings";

const cl = classNameFactory("vc-vencord-tab-");

const HERO_BACKGROUND = `data:image/svg+xml;utf8,${encodeURIComponent(
    [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600">',
        "<defs>",
        '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
        '<stop stop-color="#1B0A0F"/>',
        '<stop offset="0.55" stop-color="#6F1A2D"/>',
        '<stop offset="1" stop-color="#C25D3B"/>',
        "</linearGradient>",
        "</defs>",
        '<rect width="1200" height="600" fill="url(#g)"/>',
        '<circle cx="220" cy="110" r="110" fill="#F4B85A" opacity=".16"/>',
        '<circle cx="1020" cy="500" r="160" fill="#F6E6C8" opacity=".10"/>',
        '<path d="M-40 430C112 338 212 324 358 374s223 71 360 21 243-45 522 75V640H-40Z" fill="#12070A" opacity=".55"/>',
        '<path d="M620 36 1140 554" stroke="#F6E3BE" stroke-opacity=".08" stroke-width="36"/>',
        '<path d="M420 -30 956 506" stroke="#F6E3BE" stroke-opacity=".05" stroke-width="22"/>',
        "</svg>",
    ].join(""),
)}`;

type KeysOfType<Object, Type> = {
    [K in keyof Object]: Object[K] extends Type ? K : never;
}[keyof Object];

function getBuildLabel() {
    if (IS_DEV) return "Dev Build";
    if (IS_WEB) return "Web";
    if (IS_VESKTOP) return `Vesktop ${VesktopNative.app.getVersion()}`;
    if (IS_EQUIBOP) return `Equibop ${VesktopNative.app.getVersion()}`;
    if (IS_STANDALONE) return "Standalone";
    return "Desktop";
}

function KamidereSettings() {
    const settings = useSettings();
    const needsVibrancySettings = IS_DISCORD_DESKTOP && IS_MAC;

    const totalPlugins = React.useMemo(
        () => Object.values(plugins).filter(plugin => !plugin.hidden && !plugin.name.endsWith("API")).length,
        [],
    );
    const enabledPlugins = Object.values(settings.plugins).filter(plugin => plugin.enabled).length;

    const Switches: Array<false | {
        key: KeysOfType<typeof settings, boolean>;
        title: string;
        description?: string;
        restartRequired?: boolean;
        warning: { enabled: boolean; message?: string; };
    }> = [
        {
            key: "useQuickCss",
            title: "Enable Custom CSS",
            description: "Load custom CSS from the QuickCSS editor so you can reshape Discord's visual surface with your own styles.",
            restartRequired: true,
            warning: { enabled: false },
        },
        !IS_WEB && {
            key: "enableReactDevtools",
            title: "Enable React Developer Tools",
            description: "Expose React DevTools for inspecting Discord internals and debugging plugin UI.",
            restartRequired: true,
            warning: { enabled: false },
        },
        (!IS_WEB && !IS_DISCORD_DESKTOP || !IS_WINDOWS) && {
            key: "mainWindowFrameless",
            title: "Disable the Main Window Frame",
            description: "Strip the native frame for a cleaner shell while keeping Discord's title area draggable.",
            restartRequired: true,
            warning: { enabled: false },
        },
        !IS_WEB &&
        (!IS_DISCORD_DESKTOP || !IS_WINDOWS
            ? {
                key: "frameless",
                title: "Disable All Window Frames",
                description: "Remove native window chrome across every app window.",
                restartRequired: true,
                warning: { enabled: false },
            }
            : {
                key: "winNativeTitleBar",
                title: "Use the native Windows title bar",
                description: "Swap Discord's custom title bar for the stock Windows frame to improve compatibility with tiling and window tools.",
                restartRequired: true,
                warning: { enabled: false },
            }
        ),
        !IS_WEB && {
            key: "transparent",
            title: "Enable Window Transparency",
            description: "Make the window transparent. Pair this with a transparency-aware theme or QuickCSS setup.",
            restartRequired: true,
            warning: {
                enabled: true,
                message: IS_WINDOWS
                    ? "Transparent mode disables resizing and prevents window snapping on Windows."
                    : "Transparent mode disables window resizing.",
            },
        },
        IS_DISCORD_DESKTOP && {
            key: "disableMinSize",
            title: "Disable Minimum Window Size",
            description: "Let the window shrink below Discord's default limits for compact layouts and tiling setups.",
            restartRequired: true,
            warning: { enabled: false },
        },
        !IS_WEB &&
        IS_WINDOWS && {
            key: "winCtrlQ",
            title: "Register Ctrl+Q to close Discord",
            description: "Add a desktop-style close shortcut without reaching for Alt+F4.",
            restartRequired: true,
            warning: { enabled: false },
        },
    ];

    return (
        <SettingsTab>
            <SpecialCard
                title={BRAND_NAME}
                subtitle={BRAND_TAGLINE_SHORT}
                description={BRAND_TAGLINE}
                cardImage={BRAND_ICON_DATA_URL}
                backgroundImage={HERO_BACKGROUND}
                backgroundColor="#69192a"
            >
                <div className={cl("hero-metrics")}>
                    <span className={cl("hero-pill")}>{getBuildLabel()}</span>
                    <span className={cl("hero-pill")}>{enabledPlugins}/{totalPlugins} plugins enabled</span>
                    <span className={cl("hero-pill")}>{gitRemote || "local source tree"}</span>
                </div>
            </SpecialCard>

            <Notice.Info className={Margins.bottom20} style={{ width: "100%" }}>
                {BRAND_NAME} is the new public-facing identity of this fork. Some internal Vencord and Equicord names remain in developer-facing keys to preserve compatibility.
            </Notice.Info>

            <Heading className={Margins.top16}>Quick Actions</Heading>
            <Paragraph className={Margins.bottom16}>
                Jump straight to the parts of the client you are likely to touch while tuning visuals, checking updates, or diagnosing behavior.
            </Paragraph>

            <QuickActionCard>
                <QuickAction Icon={LogIcon} text="Notification Log" action={openNotificationLogModal} />
                <QuickAction Icon={PaintbrushIcon} text="Edit QuickCSS" action={() => VencordNative.quickCss.openEditor()} />
                <QuickAction Icon={CloudIcon} text="Open Cloud Sync" action={() => SettingsRouter.openUserSettings("equicord_cloud_panel")} />
                {!IS_WEB && <QuickAction Icon={RestartIcon} text="Relaunch Discord" action={relaunch} />}
                {!IS_WEB && <QuickAction Icon={FolderIcon} text="Open Settings Folder" action={() => VencordNative.settings.openFolder()} />}
                <QuickAction
                    Icon={GithubIcon}
                    text="View Source Code"
                    disabled={!gitRemote}
                    action={() => gitRemote && VencordNative.native.openExternal(`https://github.com/${gitRemote}`)}
                />
            </QuickActionCard>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>Client Settings</Heading>
            <Paragraph className={Margins.bottom16}>
                Configure how {BRAND_NAME} behaves inside Discord. These switches shape the shell, renderer behavior, and desktop integration points of the client.
            </Paragraph>
            <Notice.Info className={Margins.bottom20} style={{ width: "100%" }}>
                You can change where this section appears in Discord's settings menu from the{" "}
                <a
                    role="button"
                    onClick={() => openPluginModal(plugins.Settings)}
                    style={{ cursor: "pointer", color: "var(--text-link)" }}
                >
                    Settings plugin
                </a>.
            </Notice.Info>

            {Switches.filter((s): s is Exclude<typeof s, false> => !!s).map(s => (
                <FormSwitch
                    key={s.key}
                    value={settings[s.key]}
                    onChange={v => (settings[s.key] = v)}
                    title={s.title}
                    description={
                        s.warning.enabled ? (
                            <>
                                {s.description}
                                <Notice.Warning className={Margins.top8} style={{ width: "100%" }}>
                                    {s.warning.message}
                                </Notice.Warning>
                            </>
                        ) : (
                            s.description
                        )
                    }
                    hideBorder
                />
            ))}

            {needsVibrancySettings && (
                <>
                    <Divider className={Margins.top20} />

                    <Heading className={Margins.top20}>Window Vibrancy</Heading>
                    <Paragraph className={Margins.bottom16}>
                        Fine-tune the macOS blur treatment applied to the window. Changes here affect the entire shell and require a restart.
                    </Paragraph>
                    <Select
                        className={Margins.bottom20}
                        placeholder="Window vibrancy style"
                        options={[
                            { label: "No vibrancy", value: undefined },
                            { label: "Under Page (window tinting)", value: "under-page" },
                            { label: "Content", value: "content" },
                            { label: "Window", value: "window" },
                            { label: "Selection", value: "selection" },
                            { label: "Titlebar", value: "titlebar" },
                            { label: "Header", value: "header" },
                            { label: "Sidebar", value: "sidebar" },
                            { label: "Tooltip", value: "tooltip" },
                            { label: "Menu", value: "menu" },
                            { label: "Popover", value: "popover" },
                            { label: "Fullscreen UI (transparent but slightly muted)", value: "fullscreen-ui" },
                            { label: "HUD (Most transparent)", value: "hud" },
                        ]}
                        select={v => (settings.macosVibrancyStyle = v)}
                        isSelected={v => settings.macosVibrancyStyle === v}
                        serialize={identity}
                    />
                </>
            )}

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>Notifications</Heading>
            <Paragraph className={Margins.bottom16}>
                Tune how {BRAND_NAME} surfaces plugin alerts, whether you prefer in-app overlays or native desktop notifications.
            </Paragraph>

            <Flex gap="16px">
                <Button onClick={openNotificationSettingsModal}>
                    Notification Settings
                </Button>
                <Button variant="secondary" onClick={openNotificationLogModal}>
                    View Notification Log
                </Button>
            </Flex>
        </SettingsTab>
    );
}

export default wrapTab(KamidereSettings, `${BRAND_NAME} Settings`);

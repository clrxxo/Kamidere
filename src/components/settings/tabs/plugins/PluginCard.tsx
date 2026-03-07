/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotice } from "@api/Notices";
import { isPluginEnabled, pluginRequiresRestart, startDependenciesRecursive, startPlugin, stopPlugin } from "@api/PluginManager";
import { CogWheel, InfoIcon } from "@components/Icons";
import { AddonCard } from "@components/settings/AddonCard";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { OptionType, Plugin } from "@utils/types";
import { React, SettingsRouter, showToast, Toasts } from "@webpack/common";
import { Settings } from "Vencord";

import { PluginMeta } from "~plugins";

import { openPluginModal } from "./PluginModal";
import { getPluginSourceInfo } from "./pluginSource";

const logger = new Logger("PluginCard");
const cl = classNameFactory("vc-plugins-");

interface PluginCardProps extends React.HTMLProps<HTMLDivElement> {
    plugin: Plugin;
    disabled?: boolean;
    onRestartNeeded(name: string, key: string): void;
    isNew?: boolean;
    onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
}

const SETTINGS_TAB_STATUS_HIDE_DELAY_MS = 2200;
const SETTINGS_TAB_STATUS_TRANSITION_MS = 280;

export function PluginCard({ plugin, disabled, onRestartNeeded, onMouseEnter, onMouseLeave, isNew }: PluginCardProps) {
    const settings = Settings.plugins[plugin.name];
    const pluginMeta = PluginMeta[plugin.name];
    const isUserPlugin = pluginMeta?.userPlugin ?? false;
    const sourceInfo = getPluginSourceInfo(pluginMeta?.folderName, isUserPlugin, plugin.isModified ?? false);
    const [renderedSettingsTabStatus, setRenderedSettingsTabStatus] = React.useState<null | { enabled: boolean; }>(null);
    const [isSettingsTabStatusVisible, setIsSettingsTabStatusVisible] = React.useState(false);
    const settingsTabStatusHideTimerRef = React.useRef<number | null>(null);
    const settingsTabStatusUnmountTimerRef = React.useRef<number | null>(null);

    const isEnabled = () => isPluginEnabled(plugin.name);

    React.useEffect(() => () => {
        if (settingsTabStatusHideTimerRef.current !== null) {
            window.clearTimeout(settingsTabStatusHideTimerRef.current);
        }

        if (settingsTabStatusUnmountTimerRef.current !== null) {
            window.clearTimeout(settingsTabStatusUnmountTimerRef.current);
        }
    }, []);

    async function refreshPluginSettingsView() {
        if (!plugin.settingsTab) return;

        try {
            await SettingsRouter.openUserSettings("my_account_panel");
            await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
            await SettingsRouter.openUserSettings("equicord_plugins_panel");
        } catch {
            void SettingsRouter.openUserSettings("equicord_plugins_panel");
        }
    }

    function showSettingsTabStatus(enabled: boolean) {
        if (!plugin.settingsTab) return;

        if (settingsTabStatusHideTimerRef.current !== null) {
            window.clearTimeout(settingsTabStatusHideTimerRef.current);
            settingsTabStatusHideTimerRef.current = null;
        }

        if (settingsTabStatusUnmountTimerRef.current !== null) {
            window.clearTimeout(settingsTabStatusUnmountTimerRef.current);
            settingsTabStatusUnmountTimerRef.current = null;
        }

        setRenderedSettingsTabStatus({ enabled });
        window.requestAnimationFrame(() => setIsSettingsTabStatusVisible(true));

        settingsTabStatusHideTimerRef.current = window.setTimeout(() => {
            setIsSettingsTabStatusVisible(false);
            settingsTabStatusUnmountTimerRef.current = window.setTimeout(() => {
                setRenderedSettingsTabStatus(null);
                settingsTabStatusUnmountTimerRef.current = null;
            }, SETTINGS_TAB_STATUS_TRANSITION_MS);
        }, SETTINGS_TAB_STATUS_HIDE_DELAY_MS);
    }

    function toggleEnabled() {
        const wasEnabled = isEnabled();

        // If we're enabling a plugin, make sure all deps are enabled recursively.
        if (!wasEnabled) {
            const { restartNeeded, failures } = startDependenciesRecursive(plugin);

            if (failures.length) {
                logger.error(`Failed to start dependencies for ${plugin.name}: ${failures.join(", ")}`);
                showNotice("Failed to start dependencies: " + failures.join(", "), "Close", () => null);
                return;
            }

            if (restartNeeded) {
                // If any dependencies have patches, don't start the plugin yet.
                settings.enabled = true;
                onRestartNeeded(plugin.name, "enabled");
                return;
            }
        }

        // if the plugin requires a restart, don't use stopPlugin/startPlugin. Wait for restart to apply changes.
        if (pluginRequiresRestart(plugin)) {
            settings.enabled = !wasEnabled;
            onRestartNeeded(plugin.name, "enabled");
            return;
        }

        // If the plugin is enabled, but hasn't been started, then we can just toggle it off.
        if (wasEnabled && !plugin.started) {
            settings.enabled = !wasEnabled;
            return;
        }

        const result = wasEnabled ? stopPlugin(plugin) : startPlugin(plugin);

        if (!result) {
            settings.enabled = false;

            const msg = `Error while ${wasEnabled ? "stopping" : "starting"} plugin ${plugin.name}`;
            showToast(msg, Toasts.Type.FAILURE, {
                position: Toasts.Position.BOTTOM,
            });

            return;
        }

        settings.enabled = !wasEnabled;

        if (plugin.settingsTab) {
            void refreshPluginSettingsView();
            showSettingsTabStatus(!wasEnabled);
        }
    }

    const sourceBadge = (
        <img
            src={sourceInfo.badgeSrc}
            alt={sourceInfo.badgeAlt}
            className={cl("source")}
        />
    );

    return (
        <AddonCard
            name={plugin.name}
            sourceBadge={sourceBadge}
            tooltip={sourceInfo.tooltip}
            description={plugin.description}
            isNew={isNew}
            enabled={isEnabled()}
            setEnabled={toggleEnabled}
            disabled={disabled}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            footer={renderedSettingsTabStatus && (
                <div
                    className={cl(
                        "settings-tab-status-region",
                        isSettingsTabStatusVisible ? "settings-tab-status-region-visible" : "settings-tab-status-region-hidden",
                    )}
                >
                    <div
                        className={cl(
                            "settings-tab-status",
                            renderedSettingsTabStatus.enabled ? "settings-tab-status-enabled" : "settings-tab-status-disabled",
                        )}
                    >
                        <span className={cl("settings-tab-status-dot")} />
                        <span className={cl("settings-tab-status-copy")}>
                            {renderedSettingsTabStatus.enabled
                                ? `${plugin.settingsTab?.title} tab added to Kamidere Settings.`
                                : `${plugin.settingsTab?.title} tab removed from Kamidere Settings.`}
                        </span>
                    </div>
                </div>
            )}
            infoButton={
                <button
                    role="switch"
                    onClick={() => openPluginModal(plugin, onRestartNeeded)}
                    className={cl("info-button")}
                >
                    {plugin.settings?.def && Object.values(plugin.settings.def).some(s => s.type !== OptionType.CUSTOM && !s.hidden)
                        ? <CogWheel className={cl("info-icon")} />
                        : <InfoIcon className={cl("info-icon")} />
                    }
                </button>
            } />
    );
}

import "./styles.css";

import { BaseText } from "@components/BaseText";
import { Button, TextButton } from "@components/Button";
import { Card } from "@components/Card";
import { Heading, HeadingTertiary } from "@components/Heading";
import { CogWheel, DeleteIcon, LogIcon, MagnifyingGlassIcon, OpenExternalIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings";
import { SpecialCard } from "@components/settings/SpecialCard";
import { Switch } from "@components/Switch";
import { BRAND_ICON_DATA_URL, BRAND_NAME } from "@shared/branding";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { sleep } from "@utils/misc";
import { Alerts, ChannelStore, MessageActions, NavigationRouter, React, Select, Toasts, UserStore, useStateFromStores } from "@webpack/common";

import { clearSentTrailRecords, removeSentTrailRecord, useSentTrailRecords } from "./store";
import { parseProtectedDmChannels, settings, SendTrailPurgeTarget } from "./settings";
import type { SentTrailMediaItem, SentTrailRecord } from "./types";
import { buildSearchIndex, formatDayLabel, formatTime, getChannelRecipientIds, recordMatchesScope, resolveRecordContext } from "./utils";

const cl = classNameFactory("vc-send-trail-");
const LIVE_DELETE_DELAY_MS = 850;
const PURGE_STATUS_HIDE_DELAY_MS = 2400;
const PURGE_STATUS_TRANSITION_MS = 280;

const HERO_BACKGROUND = `data:image/svg+xml;utf8,${encodeURIComponent(
    [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600">',
        "<defs>",
        '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
        '<stop stop-color="#101114"/>',
        '<stop offset="0.45" stop-color="#22272E"/>',
        '<stop offset="1" stop-color="#3A332A"/>',
        "</linearGradient>",
        "</defs>",
        '<rect width="1200" height="600" fill="url(#g)"/>',
        '<circle cx="980" cy="120" r="150" fill="#F4BD6A" opacity=".10"/>',
        '<circle cx="220" cy="470" r="180" fill="#9FB5D1" opacity=".08"/>',
        '<path d="M-40 440C132 342 260 332 396 368s254 53 380 15 250-39 464 86V640H-40Z" fill="#0C0E12" opacity=".62"/>',
        '<path d="M160 54 720 614" stroke="#FFE9BF" stroke-opacity=".05" stroke-width="28"/>',
        '<path d="M560 -20 1140 560" stroke="#FFE9BF" stroke-opacity=".06" stroke-width="18"/>',
        "</svg>",
    ].join(""),
)}`;

type ScopeValue = "all" | "dms" | `guild:${string}`;
type KindValue = "all" | "text" | "media";
type PeriodValue = "all" | "24h" | "7d";
type PurgeStatusPhase = "idle" | "running" | "success" | "partial" | "failure";

interface SelectOption<T extends string> {
    label: string;
    value: T;
}

interface RecordGroup {
    label: string;
    records: SentTrailRecord[];
}

interface PurgeStatusState {
    phase: PurgeStatusPhase;
    total: number;
    processed: number;
    deleted: number;
    failed: number;
    skipped: number;
    currentLabel?: string;
}

interface DmConversation {
    channelId: string;
    label: string;
    details: string;
    count: number;
}

function showToast(message: string, type: any) {
    Toasts.show({
        message,
        type,
        id: Toasts.genId(),
        options: {
            position: Toasts.Position.BOTTOM,
        },
    });
}

function makeEmptyPurgeStatus(): PurgeStatusState {
    return {
        phase: "idle",
        total: 0,
        processed: 0,
        deleted: 0,
        failed: 0,
        skipped: 0,
    };
}

function isDirectMessageRecord(record: SentTrailRecord) {
    return record.guildId === "@me";
}

function isRecordProtected(
    record: SentTrailRecord,
    purgeTarget: SendTrailPurgeTarget,
    protectAllDms: boolean,
    protectedDmChannels: Set<string>,
) {
    const isDm = isDirectMessageRecord(record);

    if (purgeTarget === "dms" && !isDm) return true;
    if (purgeTarget === "servers" && isDm) return true;
    if (isDm && protectAllDms) return true;
    if (isDm && protectedDmChannels.has(record.channelId)) return true;

    return false;
}

function buildDmConversations(records: SentTrailRecord[]) {
    const conversations = new Map<string, DmConversation>();

    for (const record of records) {
        if (!isDirectMessageRecord(record)) continue;

        const context = resolveRecordContext(record);
        const channel = ChannelStore.getChannel(record.channelId);
        const recipientIds = getChannelRecipientIds(channel);
        const recipientNames = recipientIds
            .map(id => UserStore.getUser(id))
            .filter(Boolean)
            .map(user => user.globalName || user.username)
            .filter(Boolean);

        const label = recipientNames[0] ?? context.channelName;
        const details = recipientNames.length > 1
            ? recipientNames.join(", ")
            : context.channelName;

        const existing = conversations.get(record.channelId);
        if (existing) {
            existing.count++;
            continue;
        }

        conversations.set(record.channelId, {
            channelId: record.channelId,
            label,
            details,
            count: 1,
        });
    }

    return Array.from(conversations.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function MediaPreview({ media }: { media: SentTrailMediaItem[]; }) {
    if (media.length === 0) return null;

    return (
        <div className={cl("preview-grid")}>
            {media.map(item => (
                <a
                    key={`${item.source}:${item.kind}:${item.url}`}
                    className={cl("preview-card")}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                >
                    {item.kind === "image" ? (
                        <img
                            className={cl("preview-image")}
                            src={item.url}
                            alt={item.filename ?? "Sent media"}
                            loading="lazy"
                        />
                    ) : (
                        <video
                            className={cl("preview-video")}
                            src={item.url}
                            controls
                            preload="metadata"
                            playsInline
                        />
                    )}
                    <span className={cl("preview-caption")}>
                        {item.filename ?? (item.kind === "image" ? "Image" : "Video")}
                    </span>
                </a>
            ))}
        </div>
    );
}

function PurgeStatusBanner({ status }: { status: PurgeStatusState; }) {
    if (status.phase === "idle") return null;

    const isRunning = status.phase === "running";
    const isSuccess = status.phase === "success";
    const isPartial = status.phase === "partial";
    const progress = status.total > 0 ? Math.max(8, Math.round((status.processed / status.total) * 100)) : 0;

    let title = "Preparing purge";
    let subtitle = "Checking the current queue.";

    if (isRunning) {
        title = `Purging ${status.processed}/${status.total}`;
        subtitle = status.currentLabel
            ? `Deleting ${status.currentLabel} one message at a time.`
            : "Deleting selected messages one by one to keep the pace safe.";
    } else if (isSuccess) {
        title = "Purge complete";
        subtitle = `Deleted ${status.deleted} message${status.deleted === 1 ? "" : "s"}${status.skipped ? ` and skipped ${status.skipped} protected entr${status.skipped === 1 ? "y" : "ies"}` : ""}.`;
    } else if (isPartial) {
        title = "Purge finished with some skips";
        subtitle = `Deleted ${status.deleted}, failed ${status.failed}${status.skipped ? `, skipped ${status.skipped} protected` : ""}.`;
    } else {
        title = "Purge could not finish";
        subtitle = `Nothing was deleted${status.skipped ? ` and ${status.skipped} entr${status.skipped === 1 ? "y was" : "ies were"} protected by config` : ""}.`;
    }

    return (
        <div className={cl("purge-status", status.phase)} aria-live="polite">
            <div className={cl("purge-status-icon", isRunning ? "spinning" : status.phase)}>
                {isRunning ? <span className={cl("spinner")} /> : <span className={cl("checkmark")}>OK</span>}
            </div>

            <div className={cl("purge-status-body")}>
                <div className={cl("purge-status-title-row")}>
                    <BaseText size="md" weight="semibold">{title}</BaseText>
                    <span className={cl("meta-tag", "quiet")}>
                        {status.deleted} deleted{status.failed ? ` / ${status.failed} failed` : ""}{status.skipped ? ` / ${status.skipped} skipped` : ""}
                    </span>
                </div>
                <Paragraph className={cl("purge-status-text")}>{subtitle}</Paragraph>
                <div className={cl("purge-progress-track")}>
                    <div className={cl("purge-progress-fill")} style={{ width: `${isRunning ? progress : 100}%` }} />
                </div>
            </div>
        </div>
    );
}

function SendTrailConfigModal({
    modalProps,
    close,
    records,
}: {
    modalProps: ModalProps;
    close(): void;
    records: SentTrailRecord[];
}) {
    const config = settings.use(["purgeTarget", "protectAllDms", "protectedDmChannels"]);
    const protectedDmChannels = React.useMemo(() => parseProtectedDmChannels(config.protectedDmChannels), [config.protectedDmChannels]);
    const dmConversations = React.useMemo(() => buildDmConversations(records), [records]);

    const purgeTargetOptions: SelectOption<SendTrailPurgeTarget>[] = [
        { label: "Everything", value: "all" },
        { label: "Direct Messages only", value: "dms" },
        { label: "Servers only", value: "servers" },
    ];

    const updateProtectedDmChannels = React.useCallback((next: Set<string>) => {
        settings.store.protectedDmChannels = Array.from(next).sort().join(",");
    }, []);

    const toggleProtectedDm = React.useCallback((channelId: string, enabled: boolean) => {
        const next = new Set(protectedDmChannels);
        if (enabled) next.add(channelId);
        else next.delete(channelId);
        updateProtectedDmChannels(next);
    }, [protectedDmChannels, updateProtectedDmChannels]);

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false}>
                <BaseText size="lg" weight="semibold" style={{ flexGrow: 1 }}>Purge Config</BaseText>
                <ModalCloseButton onClick={close} />
            </ModalHeader>

            <ModalContent className={cl("config-modal")}>
                <Paragraph className={cl("config-copy")}>
                    These rules decide what the `Purge Selected` action is allowed to delete. Protected direct messages stay in Send Trail until you change the config.
                </Paragraph>

                <div className={cl("config-grid")}>
                    <div className={cl("config-field")}>
                        <span className={cl("field-label")}>Purge Target</span>
                        <Select
                            options={purgeTargetOptions}
                            select={(value: SendTrailPurgeTarget) => settings.store.purgeTarget = value}
                            isSelected={(value: SendTrailPurgeTarget) => value === config.purgeTarget}
                            serialize={(value: SendTrailPurgeTarget) => value}
                        />
                    </div>

                    <div className={cl("config-switch-row")}>
                        <div>
                            <BaseText size="md" weight="semibold">Protect all DMs</BaseText>
                            <Paragraph className={cl("config-hint")}>
                                When enabled, no DM or group DM is ever purged, even if it is selected.
                            </Paragraph>
                        </div>
                        <Switch checked={config.protectAllDms} onChange={value => settings.store.protectAllDms = value} />
                    </div>
                </div>

                <div className={cl("config-list-header")}>
                    <BaseText size="md" weight="semibold">Protected DM conversations</BaseText>
                    {!!protectedDmChannels.size && (
                        <TextButton variant="secondary" onClick={() => settings.store.protectedDmChannels = ""}>
                            Clear protected DM list
                        </TextButton>
                    )}
                </div>

                {dmConversations.length === 0 ? (
                    <Card className={cl("config-empty")} defaultPadding>
                        <Paragraph className={Margins.reset}>
                            No direct-message history has been captured yet. Once you send a DM from this client, it can be protected here.
                        </Paragraph>
                    </Card>
                ) : (
                    <div className={cl("config-list")}>
                        {dmConversations.map(conversation => (
                            <Card key={conversation.channelId} className={cl("config-item")} defaultPadding>
                                <div className={cl("config-item-copy")}>
                                    <BaseText size="md" weight="semibold">{conversation.label}</BaseText>
                                    <Paragraph className={cl("config-hint")}>
                                        {conversation.details} / {conversation.count} saved message{conversation.count === 1 ? "" : "s"}
                                    </Paragraph>
                                </div>
                                <Switch
                                    checked={protectedDmChannels.has(conversation.channelId)}
                                    onChange={value => toggleProtectedDm(conversation.channelId, value)}
                                />
                            </Card>
                        ))}
                    </div>
                )}
            </ModalContent>

            <ModalFooter>
                <Button variant="secondary" onClick={close}>Close</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function RecordCard({
    record,
    selected,
    deleting,
    protectedFromPurge,
    onToggleSelected,
}: {
    record: SentTrailRecord;
    selected: boolean;
    deleting: boolean;
    protectedFromPurge: boolean;
    onToggleSelected(): void;
}) {
    const context = resolveRecordContext(record);

    return (
        <Card className={cl("record-card")} defaultPadding>
            <div className={cl("record-header")}>
                <div className={cl("record-meta")}>
                    <div className={cl("record-origin-line")}>
                        <span className={cl("record-scope-label")}>
                            {context.isDirectMessage ? "Direct Messages" : context.guildName}
                        </span>
                        <span className={cl("record-separator")}>/</span>
                        <span className={cl("channel-name")}>
                            {context.isDirectMessage ? context.channelName : `#${context.channelName}`}
                        </span>
                        {protectedFromPurge && (
                            <span className={cl("record-flag")}>Protected</span>
                        )}
                    </div>

                    <Paragraph className={cl("record-timestamp")}>
                        {new Date(record.timestamp).toLocaleString()}
                    </Paragraph>
                </div>
            </div>

            {record.hasText ? (
                <Paragraph className={cl("record-content")}>{record.preview || record.content}</Paragraph>
            ) : (
                <Paragraph className={cl("record-muted")}>
                    This entry is media-only. Use the preview below to inspect what was sent.
                </Paragraph>
            )}

            <MediaPreview media={record.media} />

            <div className={cl("record-footer")}>
                <span className={cl("record-time")}>{formatTime(record.timestamp)}</span>

                <div className={cl("record-buttons")}>
                    <TextButton variant="secondary" className={cl("record-open-button")} onClick={() => NavigationRouter.transitionTo(record.jumpLink)}>
                        <OpenExternalIcon className={cl("record-open-icon")} width={14} height={14} />
                        <span>Open Message</span>
                    </TextButton>
                    <Button
                        size="small"
                        variant={selected ? "primary" : "secondary"}
                        className={cl("record-select-button", selected ? "record-select-button-selected" : "record-select-button-idle")}
                        disabled={deleting}
                        onClick={onToggleSelected}
                    >
                        {deleting ? "Deleting..." : selected ? "Selected" : "Select"}
                    </Button>
                </div>
            </div>
        </Card>
    );
}

function SendTrailTab() {
    const currentUserId = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id ?? null);
    const [records, pending] = useSentTrailRecords(currentUserId);
    const purgeConfig = settings.use(["purgeTarget", "protectAllDms", "protectedDmChannels"]);
    const protectedDmChannels = React.useMemo(
        () => parseProtectedDmChannels(purgeConfig.protectedDmChannels),
        [purgeConfig.protectedDmChannels],
    );
    const purgeTarget = purgeConfig.purgeTarget as SendTrailPurgeTarget;

    const [scope, setScope] = React.useState<ScopeValue>("all");
    const [kind, setKind] = React.useState<KindValue>("all");
    const [period, setPeriod] = React.useState<PeriodValue>("all");
    const [query, setQuery] = React.useState("");
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
    const [deletingIds, setDeletingIds] = React.useState<Set<string>>(() => new Set());
    const [purgeStatus, setPurgeStatus] = React.useState<PurgeStatusState>(makeEmptyPurgeStatus);
    const [renderedPurgeStatus, setRenderedPurgeStatus] = React.useState<PurgeStatusState>(makeEmptyPurgeStatus);
    const [isPurgeStatusVisible, setIsPurgeStatusVisible] = React.useState(false);
    const purgeStatusTimerRef = React.useRef<number | null>(null);
    const purgeStatusExitTimerRef = React.useRef<number | null>(null);
    const purgeStatusFrameRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        return () => {
            if (purgeStatusTimerRef.current) {
                window.clearTimeout(purgeStatusTimerRef.current);
            }
            if (purgeStatusExitTimerRef.current) {
                window.clearTimeout(purgeStatusExitTimerRef.current);
            }
            if (purgeStatusFrameRef.current) {
                window.cancelAnimationFrame(purgeStatusFrameRef.current);
            }
        };
    }, []);

    React.useEffect(() => {
        const recordIds = new Set(records.map(record => record.id));
        setSelectedIds(current => {
            const next = new Set(Array.from(current).filter(id => recordIds.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [records]);

    React.useEffect(() => {
        if (purgeStatus.phase === "running" || purgeStatus.phase === "idle") return;

        if (purgeStatusTimerRef.current) {
            window.clearTimeout(purgeStatusTimerRef.current);
        }

        purgeStatusTimerRef.current = window.setTimeout(() => {
            setPurgeStatus(makeEmptyPurgeStatus());
            purgeStatusTimerRef.current = null;
        }, PURGE_STATUS_HIDE_DELAY_MS);
    }, [purgeStatus]);

    React.useEffect(() => {
        if (purgeStatus.phase !== "idle") {
            if (purgeStatusExitTimerRef.current) {
                window.clearTimeout(purgeStatusExitTimerRef.current);
                purgeStatusExitTimerRef.current = null;
            }
            if (purgeStatusFrameRef.current) {
                window.cancelAnimationFrame(purgeStatusFrameRef.current);
            }

            setRenderedPurgeStatus(purgeStatus);
            purgeStatusFrameRef.current = window.requestAnimationFrame(() => {
                setIsPurgeStatusVisible(true);
                purgeStatusFrameRef.current = null;
            });
            return;
        }

        if (renderedPurgeStatus.phase === "idle") return;

        if (purgeStatusFrameRef.current) {
            window.cancelAnimationFrame(purgeStatusFrameRef.current);
            purgeStatusFrameRef.current = null;
        }

        setIsPurgeStatusVisible(false);

        if (purgeStatusExitTimerRef.current) {
            window.clearTimeout(purgeStatusExitTimerRef.current);
        }

        purgeStatusExitTimerRef.current = window.setTimeout(() => {
            setRenderedPurgeStatus(makeEmptyPurgeStatus());
            purgeStatusExitTimerRef.current = null;
        }, PURGE_STATUS_TRANSITION_MS);
    }, [purgeStatus, renderedPurgeStatus.phase]);

    const updateDeletingId = React.useCallback((recordId: string, active: boolean) => {
        setDeletingIds(current => {
            const next = new Set(current);
            if (active) next.add(recordId);
            else next.delete(recordId);
            return next;
        });
    }, []);

    const scopeOptions = React.useMemo<SelectOption<ScopeValue>[]>(() => {
        const guilds = new Map<string, string>();

        for (const record of records) {
            if (record.guildId === "@me") continue;

            const context = resolveRecordContext(record);
            guilds.set(record.guildId, context.guildName);
        }

        const guildEntries = Array.from(guilds.entries())
            .sort((left, right) => left[1].localeCompare(right[1]))
            .map(([guildId, name]) => ({
                label: name,
                value: `guild:${guildId}` as ScopeValue,
            }));

        return [
            { label: "All destinations", value: "all" },
            { label: "Direct Messages", value: "dms" },
            ...guildEntries,
        ];
    }, [records]);

    const periodOptions: SelectOption<PeriodValue>[] = [
        { label: "All time", value: "all" },
        { label: "Last 24 hours", value: "24h" },
        { label: "Last 7 days", value: "7d" },
    ];

    const kindOptions: SelectOption<KindValue>[] = [
        { label: "Everything", value: "all" },
        { label: "Text only", value: "text" },
        { label: "Media only", value: "media" },
    ];

    const filteredRecords = React.useMemo(() => {
        const search = query.trim().toLowerCase();
        const cutoff = period === "24h"
            ? Date.now() - 24 * 60 * 60 * 1000
            : period === "7d"
                ? Date.now() - 7 * 24 * 60 * 60 * 1000
                : 0;

        return records.filter(record => {
            if (!recordMatchesScope(record, scope)) return false;
            if (kind === "text" && !record.hasText) return false;
            if (kind === "media" && !record.hasMedia) return false;
            if (cutoff && record.timestamp < cutoff) return false;
            if (search && !buildSearchIndex(record).includes(search)) return false;
            return true;
        });
    }, [kind, period, query, records, scope]);

    const groupedRecords = React.useMemo<RecordGroup[]>(() => {
        const groups = new Map<string, SentTrailRecord[]>();

        for (const record of filteredRecords) {
            const label = formatDayLabel(record.timestamp);
            const existing = groups.get(label);
            if (existing) existing.push(record);
            else groups.set(label, [record]);
        }

        return Array.from(groups.entries()).map(([label, grouped]) => ({
            label,
            records: grouped,
        }));
    }, [filteredRecords]);

    const selectedRecords = React.useMemo(
        () => records.filter(record => selectedIds.has(record.id)),
        [records, selectedIds],
    );

    const selectedEligibleRecords = React.useMemo(
        () => selectedRecords.filter(record => !isRecordProtected(record, purgeTarget, purgeConfig.protectAllDms, protectedDmChannels)),
        [protectedDmChannels, purgeConfig.protectAllDms, purgeTarget, selectedRecords],
    );

    const allVisibleSelected = filteredRecords.length > 0 && filteredRecords.every(record => selectedIds.has(record.id));
    const protectedSelectedCount = selectedRecords.length - selectedEligibleRecords.length;
    const dmConversationCount = React.useMemo(() => buildDmConversations(records).length, [records]);
    const isBusy = purgeStatus.phase === "running";
    const scopeLabel = scopeOptions.find(option => option.value === scope)?.label ?? "All destinations";
    const kindLabel = kindOptions.find(option => option.value === kind)?.label ?? "Everything";
    const periodLabel = periodOptions.find(option => option.value === period)?.label ?? "All time";

    const toggleVisibleSelection = React.useCallback(() => {
        setSelectedIds(current => {
            const next = new Set(current);

            if (filteredRecords.length === 0) return next;

            if (filteredRecords.every(record => next.has(record.id))) {
                for (const record of filteredRecords) next.delete(record.id);
            } else {
                for (const record of filteredRecords) next.add(record.id);
            }

            return next;
        });
    }, [filteredRecords]);

    const clearSelection = React.useCallback(() => setSelectedIds(new Set()), []);

    const toggleRecordSelection = React.useCallback((recordId: string) => {
        setSelectedIds(current => {
            const next = new Set(current);
            if (next.has(recordId)) next.delete(recordId);
            else next.add(recordId);
            return next;
        });
    }, []);

    const openConfigModal = React.useCallback(() => {
        const modalKey = openModal(modalProps => (
            <SendTrailConfigModal
                modalProps={modalProps}
                close={() => closeModal(modalKey)}
                records={records}
            />
        ));
    }, [records]);

    const runPurge = React.useCallback(async (targetRecords: SentTrailRecord[]) => {
        if (!currentUserId || targetRecords.length === 0) return;

        if (purgeStatusTimerRef.current) {
            window.clearTimeout(purgeStatusTimerRef.current);
            purgeStatusTimerRef.current = null;
        }

        const eligibleRecords = targetRecords.filter(record =>
            !isRecordProtected(record, purgeTarget, purgeConfig.protectAllDms, protectedDmChannels),
        );
        const skipped = targetRecords.length - eligibleRecords.length;

        if (eligibleRecords.length === 0) {
            setPurgeStatus({
                phase: "failure",
                total: 0,
                processed: 0,
                deleted: 0,
                failed: 0,
                skipped,
                currentLabel: undefined,
            });
            showToast("Nothing in the current selection is allowed by your purge config.", Toasts.Type.FAILURE);
            return;
        }

        let deleted = 0;
        let failed = 0;

        setPurgeStatus({
            phase: "running",
            total: eligibleRecords.length,
            processed: 0,
            deleted: 0,
            failed: 0,
            skipped,
            currentLabel: undefined,
        });

        for (const [index, record] of eligibleRecords.entries()) {
            const context = resolveRecordContext(record);

            updateDeletingId(record.id, true);
            setPurgeStatus(current => ({
                ...current,
                currentLabel: context.isDirectMessage ? context.channelName : `#${context.channelName}`,
            }));

            try {
                await MessageActions.deleteMessage(record.channelId, record.messageId);
                await removeSentTrailRecord(currentUserId, record.channelId, record.messageId);

                deleted++;
                setSelectedIds(current => {
                    if (!current.has(record.id)) return current;
                    const next = new Set(current);
                    next.delete(record.id);
                    return next;
                });
            } catch (error) {
                failed++;
            } finally {
                updateDeletingId(record.id, false);
                setPurgeStatus(current => ({
                    ...current,
                    processed: index + 1,
                    deleted,
                    failed,
                }));
            }

            if (index < eligibleRecords.length - 1) {
                await sleep(LIVE_DELETE_DELAY_MS);
            }
        }

        const phase: PurgeStatusPhase = failed === 0
            ? "success"
            : deleted > 0
                ? "partial"
                : "failure";

        setPurgeStatus({
            phase,
            total: eligibleRecords.length,
            processed: eligibleRecords.length,
            deleted,
            failed,
            skipped,
            currentLabel: undefined,
        });

        if (phase === "success") {
            showToast(`Purged ${deleted} message${deleted === 1 ? "" : "s"} from Discord.`, Toasts.Type.SUCCESS);
        } else if (phase === "partial") {
            showToast(`Purged ${deleted} message${deleted === 1 ? "" : "s"}, but ${failed} failed.`, Toasts.Type.FAILURE);
        } else {
            showToast("No selected messages could be purged from Discord.", Toasts.Type.FAILURE);
        }
    }, [currentUserId, protectedDmChannels, purgeConfig.protectAllDms, purgeTarget, updateDeletingId]);

    const confirmPurge = React.useCallback(() => {
        if (selectedRecords.length === 0) return;

        const eligibleCount = selectedEligibleRecords.length;
        const skippedCount = selectedRecords.length - eligibleCount;

        Alerts.show({
            title: `Purge ${selectedRecords.length} selected message${selectedRecords.length === 1 ? "" : "s"}?`,
            body: eligibleCount === 0
                ? "Everything selected is currently protected by your purge config."
                : `Send Trail will delete ${eligibleCount} selected message${eligibleCount === 1 ? "" : "s"} from Discord one by one.${skippedCount ? ` ${skippedCount} selected entr${skippedCount === 1 ? "y is" : "ies are"} protected by config and will be skipped.` : ""}`,
            confirmText: "Start Purge",
            cancelText: "Cancel",
            async onConfirm() {
                await runPurge(selectedRecords);
            },
        });
    }, [runPurge, selectedEligibleRecords.length, selectedRecords]);

    const confirmLocalClear = React.useCallback(() => {
        Alerts.show({
            title: "Clear local Send Trail history?",
            body: `This removes ${records.length} saved entr${records.length === 1 ? "y" : "ies"} from Send Trail only. It will not delete anything from Discord itself.`,
            confirmText: "Clear Local History",
            cancelText: "Cancel",
            async onConfirm() {
                await clearSentTrailRecords(currentUserId);
                setSelectedIds(new Set());
                showToast("Cleared local Send Trail history.", Toasts.Type.SUCCESS);
            },
        });
    }, [currentUserId, records.length]);

    return (
        <SettingsTab>
            <SpecialCard
                title="Send Trail"
                subtitle="Selective outbound purge"
                description={`Track what you send from ${BRAND_NAME}, choose exactly which messages should go, and purge them one by one without losing control of DMs or protected conversations.`}
                cardImage={BRAND_ICON_DATA_URL}
                backgroundImage={HERO_BACKGROUND}
                backgroundColor="#27221d"
            >
                <div className={cl("hero-metrics")}>
                    <span className={cl("hero-tag")}>{records.length} tracked</span>
                    <span className={cl("hero-tag")}>{filteredRecords.length} visible</span>
                    <span className={cl("hero-tag")}>{selectedRecords.length} selected</span>
                    <span className={cl("hero-tag")}>{dmConversationCount} DM threads known</span>
                </div>
            </SpecialCard>

            <Notice.Info className={Margins.top20} style={{ width: "100%" }}>
                Send Trail is local to this device. `Purge Selected` deletes the real Discord messages one by one, while `Clear Local History` only removes the saved index shown here.
            </Notice.Info>

            <Heading className={Margins.top20}>History</Heading>
            <Card className={cl("history-shell")} defaultPadding>
                <div className={cl("history-shell-header")}>
                    <div className={cl("history-shell-copy")}>
                        <HeadingTertiary className={Margins.reset}>Sent Messages</HeadingTertiary>
                        <Paragraph className={cl("history-subtitle")}>
                            Review your global send history, narrow it down, and purge the exact set you want.
                        </Paragraph>
                    </div>
                </div>

                <div className={cl("history-filter-surface")}>
                    <div className={cl("history-filter-header")}>
                        <div className={cl("history-filter-meta")}>
                            <Paragraph className={cl("history-summary")}>
                                {scopeLabel} / {kindLabel} / {periodLabel}
                            </Paragraph>
                            <Paragraph className={cl("history-summary")}>
                                Purge target: {purgeTarget === "all" ? "everything" : purgeTarget === "dms" ? "DMs only" : "servers only"}
                                {purgeConfig.protectAllDms ? " / all DMs protected" : ""}
                                {protectedDmChannels.size ? ` / ${protectedDmChannels.size} DM thread${protectedDmChannels.size === 1 ? "" : "s"} protected` : ""}
                            </Paragraph>
                        </div>

                        <Button
                            size="iconOnly"
                            variant="secondary"
                            className={cl("action-icon-button")}
                            disabled={isBusy}
                            onClick={openConfigModal}
                            title="Open purge config"
                            aria-label="Open purge config"
                        >
                            <CogWheel width={16} height={16} />
                        </Button>
                    </div>

                    <div className={cl("toolbar-grid")}>
                        <div className={cl("toolbar-field")}>
                            <Paragraph className={cl("field-label")}>Destination</Paragraph>
                            <Select
                                options={scopeOptions}
                                select={(value: ScopeValue) => setScope(value)}
                                isSelected={(value: ScopeValue) => scope === value}
                                serialize={(value: ScopeValue) => value}
                                isDisabled={isBusy}
                            />
                        </div>

                        <div className={cl("toolbar-field")}>
                            <Paragraph className={cl("field-label")}>Content Type</Paragraph>
                            <Select
                                options={kindOptions}
                                select={(value: KindValue) => setKind(value)}
                                isSelected={(value: KindValue) => kind === value}
                                serialize={(value: KindValue) => value}
                                isDisabled={isBusy}
                            />
                        </div>

                        <div className={cl("toolbar-field")}>
                            <Paragraph className={cl("field-label")}>Period</Paragraph>
                            <Select
                                options={periodOptions}
                                select={(value: PeriodValue) => setPeriod(value)}
                                isSelected={(value: PeriodValue) => period === value}
                                serialize={(value: PeriodValue) => value}
                                isDisabled={isBusy}
                            />
                        </div>

                        <div className={cl("toolbar-field", "search")}>
                            <Paragraph className={cl("field-label")}>Search</Paragraph>
                            <label className={cl("search-shell")}>
                                <MagnifyingGlassIcon className={cl("search-icon")} width={16} height={16} />
                                <input
                                    className={cl("search-input")}
                                    type="text"
                                    value={query}
                                    placeholder="Search messages, channels, servers, or media"
                                    onChange={event => setQuery(event.currentTarget.value)}
                                    disabled={isBusy}
                                    spellCheck={false}
                                />
                            </label>
                        </div>
                    </div>

                    <div className={cl("history-controls-row")}>
                        <div className={cl("history-chip-row")}>
                            <span className={cl("history-chip")}>{filteredRecords.length} visible</span>
                            <span className={cl("history-chip")}>{selectedRecords.length} selected</span>
                            <span className={cl("history-chip", "accent")}>{selectedEligibleRecords.length} eligible</span>
                            {!!protectedSelectedCount && (
                                <span className={cl("history-chip", "protected")}>{protectedSelectedCount} protected</span>
                            )}
                        </div>

                        <div className={cl("toolbar-actions")}>
                            <Button
                                size="small"
                                variant="secondary"
                                className={cl("action-button", "action-button-select")}
                                disabled={filteredRecords.length === 0 || isBusy}
                                onClick={toggleVisibleSelection}
                            >
                                <span>{allVisibleSelected ? "Unselect Visible" : "Select Visible"}</span>
                                <span className={cl("action-button-count")}>{filteredRecords.length}</span>
                            </Button>
                            <TextButton
                                variant="secondary"
                                className={cl("toolbar-clear")}
                                disabled={selectedRecords.length === 0 || isBusy}
                                onClick={clearSelection}
                            >
                                Clear Selection
                            </TextButton>
                            <Button
                                size="small"
                                variant="dangerPrimary"
                                className={cl("action-button", "action-button-purge")}
                                disabled={selectedRecords.length === 0 || isBusy}
                                onClick={confirmPurge}
                            >
                                <DeleteIcon width={15} height={15} />
                                <span>Purge Selected</span>
                            </Button>
                        </div>
                    </div>
                </div>

                <div
                    className={cl(
                        "purge-status-region",
                        renderedPurgeStatus.phase !== "idle" ? "purge-status-region-mounted" : "purge-status-region-empty",
                        isPurgeStatusVisible ? "purge-status-region-visible" : "purge-status-region-hidden",
                    )}
                >
                    {renderedPurgeStatus.phase !== "idle" && (
                        <PurgeStatusBanner status={renderedPurgeStatus} />
                    )}
                </div>

                <div className={cl("history-list")}>
                    {pending && (
                        <Card className={cl("empty-card")} defaultPadding>
                            <LogIcon className={cl("empty-icon")} />
                            <HeadingTertiary>Loading Send Trail history...</HeadingTertiary>
                        </Card>
                    )}

                    {!pending && records.length === 0 && (
                        <Card className={cl("empty-card")} defaultPadding>
                            <LogIcon className={cl("empty-icon")} />
                            <HeadingTertiary>No saved sends yet</HeadingTertiary>
                            <Paragraph>
                                Send a message, image, GIF, video, or direct media link from this client and it will start appearing here.
                            </Paragraph>
                        </Card>
                    )}

                    {!pending && records.length > 0 && filteredRecords.length === 0 && (
                        <Card className={cl("empty-card")} defaultPadding>
                            <LogIcon className={cl("empty-icon")} />
                            <HeadingTertiary>No results match this view</HeadingTertiary>
                            <Paragraph>
                                Broaden the destination, type, period, or search query to bring more sent messages into view.
                            </Paragraph>
                        </Card>
                    )}

                    {groupedRecords.map(group => (
                        <div key={group.label} className={cl("group")}>
                            <div className={cl("group-header")}>
                                <HeadingTertiary className={Margins.reset}>{group.label}</HeadingTertiary>
                                <span className={cl("group-count")}>
                                    {group.records.length} entr{group.records.length === 1 ? "y" : "ies"}
                                </span>
                            </div>

                            <div className={cl("group-list")}>
                                {group.records.map(record => (
                                    <RecordCard
                                        key={record.id}
                                        record={record}
                                        selected={selectedIds.has(record.id)}
                                        deleting={deletingIds.has(record.id)}
                                        protectedFromPurge={isRecordProtected(record, purgeTarget, purgeConfig.protectAllDms, protectedDmChannels)}
                                        onToggleSelected={() => toggleRecordSelection(record.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className={cl("history-footer")}>
                    <Paragraph className={cl("history-summary")}>
                        Local history stays on this device. Purge removes live Discord messages one by one.
                    </Paragraph>
                    <TextButton variant="secondary" disabled={records.length === 0 || isBusy} onClick={confirmLocalClear}>
                        Clear Local History
                    </TextButton>
                </div>
            </Card>
        </SettingsTab>
    );
}

export default wrapTab(SendTrailTab, "Send Trail");

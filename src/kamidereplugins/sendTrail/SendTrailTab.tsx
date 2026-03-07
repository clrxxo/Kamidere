import "./styles.css";

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { Heading, HeadingTertiary } from "@components/Heading";
import { DeleteIcon, LinkIcon, LogIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { SettingsTab, wrapTab } from "@components/settings";
import { SpecialCard } from "@components/settings/SpecialCard";
import { BRAND_ICON_DATA_URL, BRAND_NAME } from "@shared/branding";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { sleep } from "@utils/misc";
import { Alerts, MessageActions, NavigationRouter, React, Select, TextInput, Toasts, UserStore, useStateFromStores } from "@webpack/common";

import { clearSentTrailRecords, removeSentTrailRecordsWhere, useSentTrailRecords } from "./store";
import type { SentTrailMediaItem, SentTrailRecord } from "./types";
import { buildSearchIndex, formatDayLabel, formatTime, recordMatchesScope, resolveRecordContext } from "./utils";

const cl = classNameFactory("vc-send-trail-");
const LIVE_DELETE_DELAY_MS = 350;

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

interface SelectOption<T extends string> {
    label: string;
    value: T;
}

interface RecordGroup {
    label: string;
    records: SentTrailRecord[];
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

function RecordCard({
    record,
    deleting,
    onDelete,
}: {
    record: SentTrailRecord;
    deleting: boolean;
    onDelete(): void;
}) {
    const context = resolveRecordContext(record);

    return (
        <Card className={cl("record-card")} defaultPadding>
            <div className={cl("record-header")}>
                <div className={cl("record-meta")}>
                    <div className={cl("record-context-row")}>
                        <span className={cl("scope-pill", context.isDirectMessage ? "dm" : "guild")}>
                            {context.isDirectMessage ? "Direct Messages" : context.guildName}
                        </span>
                        <span className={cl("channel-name")}>
                            {context.isDirectMessage ? context.channelName : `#${context.channelName}`}
                        </span>
                    </div>

                    <Paragraph className={cl("record-timestamp")}>
                        {new Date(record.timestamp).toLocaleString()}
                    </Paragraph>
                </div>

                <div className={cl("record-actions")}>
                    <span className={cl("time-pill")}>{formatTime(record.timestamp)}</span>
                    <div className={cl("record-buttons")}>
                        <Button size="small" variant="secondary" onClick={() => NavigationRouter.transitionTo(record.jumpLink)}>
                            Open Message
                        </Button>
                        <Button size="small" variant="dangerSecondary" disabled={deleting} onClick={onDelete}>
                            {deleting ? "Deleting..." : "Delete Message"}
                        </Button>
                    </div>
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
        </Card>
    );
}

function SendTrailTab() {
    const currentUserId = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id ?? null);
    const [records, pending] = useSentTrailRecords(currentUserId);

    const [scope, setScope] = React.useState<ScopeValue>("all");
    const [kind, setKind] = React.useState<KindValue>("all");
    const [period, setPeriod] = React.useState<PeriodValue>("all");
    const [query, setQuery] = React.useState("");
    const [deletingIds, setDeletingIds] = React.useState<Set<string>>(() => new Set());

    const updateDeletingIds = React.useCallback((recordsToUpdate: SentTrailRecord[], active: boolean) => {
        setDeletingIds(current => {
            const next = new Set(current);
            for (const record of recordsToUpdate) {
                if (active) next.add(record.id);
                else next.delete(record.id);
            }
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

    const latestRecord = records[0] ?? null;
    const totalMedia = records.filter(record => record.hasMedia).length;
    const totalText = records.filter(record => record.hasText).length;
    const isBusy = deletingIds.size > 0;

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

    const scopeLabel = scopeOptions.find(option => option.value === scope)?.label ?? "All destinations";

    const deleteLiveMessages = React.useCallback(async (targetRecords: SentTrailRecord[]) => {
        if (!currentUserId || targetRecords.length === 0) return;

        updateDeletingIds(targetRecords, true);

        const removedIds = new Set<string>();
        let failed = 0;

        try {
            for (const record of targetRecords) {
                try {
                    await MessageActions.deleteMessage(record.channelId, record.messageId);
                    removedIds.add(record.id);
                    await sleep(LIVE_DELETE_DELAY_MS);
                } catch (error) {
                    failed++;
                }
            }

            if (removedIds.size > 0) {
                await removeSentTrailRecordsWhere(currentUserId, record => removedIds.has(record.id));
            }

            if (removedIds.size > 0 && failed === 0) {
                showToast(`Deleted ${removedIds.size} message${removedIds.size === 1 ? "" : "s"} from Discord.`, Toasts.Type.SUCCESS);
            } else if (removedIds.size > 0 && failed > 0) {
                showToast(`Deleted ${removedIds.size} message${removedIds.size === 1 ? "" : "s"}, but ${failed} failed.`, Toasts.Type.FAILURE);
            } else {
                showToast("No messages could be deleted from Discord.", Toasts.Type.FAILURE);
            }
        } finally {
            updateDeletingIds(targetRecords, false);
        }
    }, [currentUserId, updateDeletingIds]);

    const confirmDeleteRecords = React.useCallback((targetRecords: SentTrailRecord[], title: string, body: string) => {
        Alerts.show({
            title,
            body,
            confirmText: "Delete",
            cancelText: "Cancel",
            async onConfirm() {
                await deleteLiveMessages(targetRecords);
            },
        });
    }, [deleteLiveMessages]);

    const confirmLocalClear = React.useCallback(() => {
        Alerts.show({
            title: "Clear local Send Trail history?",
            body: `This removes ${records.length} saved entr${records.length === 1 ? "y" : "ies"} from Send Trail only. It will not delete anything from Discord itself.`,
            confirmText: "Clear Local History",
            cancelText: "Cancel",
            async onConfirm() {
                await clearSentTrailRecords(currentUserId);
                showToast("Cleared local Send Trail history.", Toasts.Type.SUCCESS);
            },
        });
    }, [currentUserId, records.length]);

    return (
        <SettingsTab>
            <SpecialCard
                title="Send Trail"
                subtitle="Global outbound cleanup"
                description={`Review every message sent from ${BRAND_NAME}, filter it by destination or media type, and delete the visible set directly from Discord when you need to clean up fast.`}
                cardImage={BRAND_ICON_DATA_URL}
                backgroundImage={HERO_BACKGROUND}
                backgroundColor="#27221d"
            >
                <div className={cl("hero-metrics")}>
                    <span className={cl("hero-pill")}>{records.length} tracked sends</span>
                    <span className={cl("hero-pill")}>{totalMedia} media entries</span>
                    <span className={cl("hero-pill")}>{totalText} text entries</span>
                    <span className={cl("hero-pill")}>{filteredRecords.length} visible right now</span>
                </div>
            </SpecialCard>

            <Notice.Info className={Margins.top20} style={{ width: "100%" }}>
                Send Trail stores a local index of your sent messages on this device. Deleting from this page can remove the actual Discord messages, while clearing local history only removes the index shown here.
            </Notice.Info>

            <Heading className={Margins.top20}>Actions</Heading>
            <Paragraph className={Margins.bottom16}>
                Use your current filters to decide what will be affected before deleting anything live.
            </Paragraph>

            <QuickActionCard columns={3}>
                <QuickAction
                    Icon={LinkIcon}
                    text="Open Latest Message"
                    disabled={!latestRecord || isBusy}
                    action={() => latestRecord && NavigationRouter.transitionTo(latestRecord.jumpLink)}
                />
                <QuickAction
                    Icon={DeleteIcon}
                    text="Delete Visible Messages"
                    disabled={filteredRecords.length === 0 || isBusy}
                    action={() => confirmDeleteRecords(
                        filteredRecords,
                        `Delete ${filteredRecords.length} visible message${filteredRecords.length === 1 ? "" : "s"}?`,
                        `This will delete the currently visible messages from Discord itself and remove them from Send Trail.`,
                    )}
                />
                <QuickAction
                    Icon={LogIcon}
                    text="Clear Local History"
                    disabled={records.length === 0 || isBusy}
                    action={confirmLocalClear}
                />
            </QuickActionCard>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>Current View</Heading>
            <Paragraph className={Margins.bottom16}>
                Narrow the list down first, then use “Delete Visible Messages” to wipe the live messages that match.
            </Paragraph>

            <Card className={cl("summary-card")} defaultPadding>
                <div className={cl("summary-row")}>
                    <div className={cl("summary-block")}>
                        <span className={cl("summary-label")}>Scope</span>
                        <span className={cl("summary-value")}>{scopeLabel}</span>
                    </div>
                    <div className={cl("summary-block")}>
                        <span className={cl("summary-label")}>Type</span>
                        <span className={cl("summary-value")}>{kindOptions.find(option => option.value === kind)?.label ?? "Everything"}</span>
                    </div>
                    <div className={cl("summary-block")}>
                        <span className={cl("summary-label")}>Period</span>
                        <span className={cl("summary-value")}>{periodOptions.find(option => option.value === period)?.label ?? "All time"}</span>
                    </div>
                    <div className={cl("summary-block")}>
                        <span className={cl("summary-label")}>Visible</span>
                        <span className={cl("summary-value")}>{filteredRecords.length} message{filteredRecords.length === 1 ? "" : "s"}</span>
                    </div>
                </div>
            </Card>

            <Card className={cl("toolbar-card")} defaultPadding>
                <div className={cl("toolbar-grid")}>
                    <div className={cl("toolbar-field")}>
                        <Paragraph className={cl("field-label")}>Destination</Paragraph>
                        <Select
                            options={scopeOptions}
                            select={(value: ScopeValue) => setScope(value)}
                            isSelected={(value: ScopeValue) => scope === value}
                            serialize={(value: ScopeValue) => value}
                        />
                    </div>

                    <div className={cl("toolbar-field")}>
                        <Paragraph className={cl("field-label")}>Content Type</Paragraph>
                        <Select
                            options={kindOptions}
                            select={(value: KindValue) => setKind(value)}
                            isSelected={(value: KindValue) => kind === value}
                            serialize={(value: KindValue) => value}
                        />
                    </div>

                    <div className={cl("toolbar-field")}>
                        <Paragraph className={cl("field-label")}>Period</Paragraph>
                        <Select
                            options={periodOptions}
                            select={(value: PeriodValue) => setPeriod(value)}
                            isSelected={(value: PeriodValue) => period === value}
                            serialize={(value: PeriodValue) => value}
                        />
                    </div>

                    <div className={cl("toolbar-field", "search")}>
                        <Paragraph className={cl("field-label")}>Search</Paragraph>
                        <TextInput
                            value={query}
                            placeholder="Search content, server, channel, filename, or media URL..."
                            onChange={setQuery}
                        />
                    </div>
                </div>
            </Card>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>History</Heading>
            <Paragraph className={Margins.bottom16}>
                Every entry below is a real message you sent. Open it, preview media directly, or delete it in place.
            </Paragraph>

            {pending && (
                <Notice.Info style={{ width: "100%" }}>
                    Loading Send Trail history...
                </Notice.Info>
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
                                deleting={deletingIds.has(record.id)}
                                onDelete={() => confirmDeleteRecords(
                                    [record],
                                    "Delete this message?",
                                    "This will delete the selected message from Discord and remove it from Send Trail.",
                                )}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </SettingsTab>
    );
}

export default wrapTab(SendTrailTab, "Send Trail");

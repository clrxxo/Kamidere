import "./styles.css";

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { Heading, HeadingTertiary } from "@components/Heading";
import { ClockIcon, DeleteIcon, ImageIcon, LinkIcon, LogIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { SettingsTab, wrapTab } from "@components/settings";
import { SpecialCard } from "@components/settings/SpecialCard";
import { BRAND_ICON_DATA_URL, BRAND_NAME } from "@shared/branding";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { Alerts, NavigationRouter, React, Select, TextInput, UserStore, useStateFromStores } from "@webpack/common";

import { clearSentTrailRecords, clearSentTrailRecordsWhere, useSentTrailRecords } from "./store";
import type { SentTrailMediaItem, SentTrailRecord } from "./types";
import { buildSearchIndex, formatDayLabel, formatTime, recordMatchesScope, resolveRecordContext } from "./utils";

const cl = classNameFactory("vc-send-trail-");

const HERO_BACKGROUND = `data:image/svg+xml;utf8,${encodeURIComponent(
    [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600">',
        "<defs>",
        '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
        '<stop stop-color="#12060A"/>',
        '<stop offset="0.45" stop-color="#6B1D23"/>',
        '<stop offset="1" stop-color="#D06D3C"/>',
        "</linearGradient>",
        "</defs>",
        '<rect width="1200" height="600" fill="url(#g)"/>',
        '<circle cx="1020" cy="130" r="140" fill="#F6E1B0" opacity=".12"/>',
        '<circle cx="240" cy="490" r="180" fill="#F4AF57" opacity=".12"/>',
        '<path d="M-30 440C170 290 370 310 530 365c160 55 285 66 404 24 119-41 212-38 296 15V640H-30Z" fill="#18070B" opacity=".58"/>',
        '<path d="M180 56 788 664" stroke="#FFF0C8" stroke-opacity=".06" stroke-width="28"/>',
        '<path d="M530 -30 1110 550" stroke="#FFF0C8" stroke-opacity=".08" stroke-width="18"/>',
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

function getMediaLabel(media: SentTrailMediaItem) {
    const sourceLabel = media.source === "embed" ? "Embed" : media.kind === "video" ? "Upload" : "Image";
    const baseLabel = media.kind === "video" ? "Video" : "Image";
    return media.filename
        ? `${sourceLabel} ${baseLabel}: ${media.filename}`
        : `${sourceLabel} ${baseLabel}`;
}

function RecordCard({ record }: { record: SentTrailRecord; }) {
    const context = resolveRecordContext(record);

    return (
        <Card className={cl("record-card")}>
            <div className={cl("record-header")}>
                <div>
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
                    <Button size="small" variant="secondary" onClick={() => NavigationRouter.transitionTo(record.jumpLink)}>
                        Open Message
                    </Button>
                </div>
            </div>

            {record.hasText ? (
                <Paragraph className={cl("record-content")}>{record.preview || record.content}</Paragraph>
            ) : (
                <Paragraph className={cl("record-muted")}>
                    This message does not include saved text content.
                </Paragraph>
            )}

            {record.media.length > 0 && (
                <div className={cl("media-row")}>
                    {record.media.map(media => (
                        <span key={`${record.id}-${media.source}-${media.kind}-${media.url}`} className={cl("media-chip")}>
                            {getMediaLabel(media)}
                        </span>
                    ))}
                </div>
            )}
        </Card>
    );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string; }) {
    return (
        <Card className={cl("stat-card")}>
            <Paragraph className={cl("stat-title")}>{title}</Paragraph>
            <HeadingTertiary className={cl("stat-value")}>{value}</HeadingTertiary>
            <Paragraph className={cl("stat-subtitle")}>{subtitle}</Paragraph>
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

    const scopedRecords = React.useMemo(
        () => records.filter(record => recordMatchesScope(record, scope)),
        [records, scope],
    );

    const groupedRecords = React.useMemo<RecordGroup[]>(() => {
        const groups = new Map<string, SentTrailRecord[]>();

        for (const record of filteredRecords) {
            const label = formatDayLabel(record.timestamp);
            const existing = groups.get(label);
            if (existing) {
                existing.push(record);
            } else {
                groups.set(label, [record]);
            }
        }

        return Array.from(groups.entries()).map(([label, grouped]) => ({
            label,
            records: grouped,
        }));
    }, [filteredRecords]);

    const latestRecord = records[0] ?? null;
    const totalText = records.filter(record => record.hasText).length;
    const totalMedia = records.filter(record => record.hasMedia).length;

    const periodOptions: SelectOption<PeriodValue>[] = [
        { label: "All time", value: "all" },
        { label: "Last 24 hours", value: "24h" },
        { label: "Last 7 days", value: "7d" },
    ];

    const kindOptions: SelectOption<KindValue>[] = [
        { label: "Everything", value: "all" },
        { label: "Text", value: "text" },
        { label: "Media", value: "media" },
    ];

    const scopeLabel = scopeOptions.find(option => option.value === scope)?.label ?? "Current scope";

    const confirmClear = React.useCallback((title: string, body: string, action: () => Promise<void>) => {
        Alerts.show({
            title,
            body,
            confirmText: "Clear",
            cancelText: "Cancel",
            async onConfirm() {
                await action();
            },
        });
    }, []);

    return (
        <SettingsTab>
            <SpecialCard
                title="Send Trail"
                subtitle="Outbound message ledger"
                description={`Track the messages you send from ${BRAND_NAME}, inspect where they landed, and jump back into the exact chat later.`}
                cardImage={BRAND_ICON_DATA_URL}
                backgroundImage={HERO_BACKGROUND}
                backgroundColor="#701d28"
            >
                <div className={cl("hero-metrics")}>
                    <span className={cl("hero-pill")}>{records.length} saved sends</span>
                    <span className={cl("hero-pill")}>{filteredRecords.length} visible in current view</span>
                    <span className={cl("hero-pill")}>{totalMedia} media entries</span>
                    <span className={cl("hero-pill")}>{totalText} text entries</span>
                </div>
            </SpecialCard>

            <Notice.Info className={Margins.top20} style={{ width: "100%" }}>
                Send Trail saves everything locally on this device only. It does not sync to the cloud, does not auto-expire, and only records messages sent after the plugin is active.
            </Notice.Info>

            <Heading className={Margins.top20}>Quick Actions</Heading>
            <Paragraph className={Margins.bottom16}>
                Open the latest saved message or clean up the history without leaving this page.
            </Paragraph>

            <QuickActionCard>
                <QuickAction
                    Icon={LinkIcon}
                    text="Open Latest Message"
                    disabled={!latestRecord}
                    action={() => latestRecord && NavigationRouter.transitionTo(latestRecord.jumpLink)}
                />
                <QuickAction
                    Icon={ClockIcon}
                    text="Clear Current Scope"
                    disabled={scopedRecords.length === 0 || scope === "all"}
                    action={() => confirmClear(
                        `Clear ${scopeLabel}?`,
                        `This will permanently remove ${scopedRecords.length} saved entr${scopedRecords.length === 1 ? "y" : "ies"} from ${scopeLabel}.`,
                        () => clearSentTrailRecordsWhere(currentUserId, record => recordMatchesScope(record, scope)),
                    )}
                />
                <QuickAction
                    Icon={DeleteIcon}
                    text="Clear Full History"
                    disabled={records.length === 0}
                    action={() => confirmClear(
                        "Clear Send Trail history?",
                        `This will permanently remove all ${records.length} saved entr${records.length === 1 ? "y" : "ies"} for this account.`,
                        () => clearSentTrailRecords(currentUserId),
                    )}
                />
            </QuickActionCard>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>Overview</Heading>
            <Paragraph className={Margins.bottom16}>
                The dashboard below is grouped by day and can be sliced by destination, content type, and time range.
            </Paragraph>

            <div className={cl("stats-grid")}>
                <StatCard
                    title="Saved Entries"
                    value={String(records.length)}
                    subtitle="All confirmed sends stored on this device"
                />
                <StatCard
                    title="Current Scope"
                    value={String(scopedRecords.length)}
                    subtitle={scopeLabel}
                />
                <StatCard
                    title="Visible Results"
                    value={String(filteredRecords.length)}
                    subtitle="After applying filters and search"
                />
            </div>

            <div className={cl("filter-grid")}>
                <Card className={cl("filter-card")}>
                    <Paragraph className={cl("filter-label")}>Destination</Paragraph>
                    <Select
                        options={scopeOptions}
                        select={(value: ScopeValue) => setScope(value)}
                        isSelected={(value: ScopeValue) => scope === value}
                        serialize={(value: ScopeValue) => value}
                    />
                </Card>

                <Card className={cl("filter-card")}>
                    <Paragraph className={cl("filter-label")}>Content Type</Paragraph>
                    <Select
                        options={kindOptions}
                        select={(value: KindValue) => setKind(value)}
                        isSelected={(value: KindValue) => kind === value}
                        serialize={(value: KindValue) => value}
                    />
                </Card>

                <Card className={cl("filter-card")}>
                    <Paragraph className={cl("filter-label")}>Period</Paragraph>
                    <Select
                        options={periodOptions}
                        select={(value: PeriodValue) => setPeriod(value)}
                        isSelected={(value: PeriodValue) => period === value}
                        serialize={(value: PeriodValue) => value}
                    />
                </Card>

                <Card className={cl("filter-card")}>
                    <Paragraph className={cl("filter-label")}>Search</Paragraph>
                    <TextInput
                        value={query}
                        placeholder="Search content, server, channel, or media filename..."
                        onChange={setQuery}
                    />
                </Card>
            </div>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>History</Heading>
            <Paragraph className={Margins.bottom16}>
                Browse your outbound activity globally or drill into a specific server to review exactly what you sent and when.
            </Paragraph>

            {pending && (
                <Notice.Info style={{ width: "100%" }}>
                    Loading Send Trail history...
                </Notice.Info>
            )}

            {!pending && records.length === 0 && (
                <Card className={cl("empty-card")}>
                    <LogIcon className={cl("empty-icon")} />
                    <HeadingTertiary>No saved sends yet</HeadingTertiary>
                    <Paragraph>
                        Send a message, image, video, or embed-backed link from this client and it will start appearing here.
                    </Paragraph>
                </Card>
            )}

            {!pending && records.length > 0 && filteredRecords.length === 0 && (
                <Card className={cl("empty-card")}>
                    <ImageIcon className={cl("empty-icon")} />
                    <HeadingTertiary>No results match this view</HeadingTertiary>
                    <Paragraph>
                        Adjust the destination, content type, period, or search query to widen the current filter set.
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
                            <RecordCard key={record.id} record={record} />
                        ))}
                    </div>
                </div>
            ))}
        </SettingsTab>
    );
}

export default wrapTab(SendTrailTab, "Send Trail");

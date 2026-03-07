import type { MessageObject, MessageOptions } from "@api/MessageEvents";
import { ClockIcon } from "@components/Icons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";
import { ChannelStore, GuildStore, MessageStore, UserStore } from "@webpack/common";

import SendTrailTab from "./SendTrailTab";
import { appendSentTrailRecord, mergeSentTrailRecordMedia } from "./store";
import type { MessageCreatePayload, MessageUpdatePayload, PendingSendDraft, SentTrailRecord } from "./types";
import { buildJumpLink, collectMediaItems, getMessageTimestamp, getRecordPreview, makeAttachmentSignature, makeUploadSignature, normalizeContent } from "./utils";

const DRAFT_TTL_MS = 20_000;
const MIN_MATCH_SCORE = 5;

let draftCounter = 0;
const pendingDrafts = new Map<string, PendingSendDraft>();

function cleanupExpiredDrafts(now = Date.now()) {
    for (const [key, draft] of pendingDrafts.entries()) {
        if (now - draft.createdAt > DRAFT_TTL_MS) {
            pendingDrafts.delete(key);
        }
    }
}

function createPendingDraft(channelId: string, messageObj: MessageObject, options: MessageOptions) {
    cleanupExpiredDrafts();

    const content = options.content ?? messageObj.content ?? "";
    const normalizedContent = normalizeContent(content);
    const localId = `${Date.now()}-${++draftCounter}`;

    pendingDrafts.set(localId, {
        localId,
        channelId,
        createdAt: Date.now(),
        content,
        normalizedContent,
        hasText: normalizedContent.length > 0,
        mediaHint: (options.uploads?.length ?? 0) > 0,
        uploadSignature: makeUploadSignature({ uploads: options.uploads }),
        replyMessageId: options.replyOptions?.messageReference?.message_id,
    });
}

function getDraftScore(draft: PendingSendDraft, payload: MessageCreatePayload) {
    const { message } = payload;
    if (draft.channelId !== message.channel_id) return Number.NEGATIVE_INFINITY;

    const now = Date.now();
    if (now - draft.createdAt > DRAFT_TTL_MS) return Number.NEGATIVE_INFINITY;

    const normalizedContent = normalizeContent(message.content);
    const attachmentSignature = makeAttachmentSignature(message.attachments ?? []);
    const media = collectMediaItems({
        attachments: message.attachments ?? [],
        embeds: message.embeds ?? [],
    });

    let score = 0;

    if (draft.normalizedContent === normalizedContent) {
        score += 6;
    } else if (!draft.normalizedContent && !normalizedContent) {
        score += 3;
    }

    if (draft.replyMessageId && draft.replyMessageId === message.messageReference?.message_id) {
        score += 2;
    }

    if (draft.uploadSignature && draft.uploadSignature === attachmentSignature) {
        score += 4;
    } else if (!draft.uploadSignature && !attachmentSignature) {
        score += 1;
    }

    if (draft.mediaHint === (media.length > 0)) {
        score += 1;
    }

    if (draft.hasText === (normalizedContent.length > 0)) {
        score += 1;
    }

    score -= Math.min(4, Math.abs(now - draft.createdAt) / 2000);
    return score;
}

function resolveBestDraft(payload: MessageCreatePayload) {
    let bestDraft: PendingSendDraft | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const draft of pendingDrafts.values()) {
        const score = getDraftScore(draft, payload);
        if (score > bestScore || (score === bestScore && bestDraft && draft.createdAt > bestDraft.createdAt)) {
            bestDraft = draft;
            bestScore = score;
        }
    }

    if (!bestDraft || bestScore < MIN_MATCH_SCORE) return null;

    pendingDrafts.delete(bestDraft.localId);
    return bestDraft;
}

function buildRecord(payload: MessageCreatePayload, draft: PendingSendDraft): SentTrailRecord {
    const { message } = payload;
    const channel = ChannelStore.getChannel(message.channel_id);
    const guildId = payload.guildId ?? channel?.guild_id ?? "@me";
    const guild = guildId !== "@me" ? GuildStore.getGuild(guildId) : null;
    const timestamp = getMessageTimestamp(message);
    const media = collectMediaItems({
        attachments: message.attachments ?? [],
        embeds: message.embeds ?? [],
    });
    const content = message.content ?? draft.content ?? "";
    const normalizedContent = normalizeContent(content);

    return {
        id: `${message.channel_id}:${message.id}`,
        messageId: message.id,
        channelId: message.channel_id,
        guildId,
        timestamp,
        content,
        preview: getRecordPreview(content),
        hasText: normalizedContent.length > 0,
        hasMedia: media.length > 0,
        jumpLink: buildJumpLink(guildId, message.channel_id, message.id),
        media,
        channelNameSnapshot: channel?.name ?? undefined,
        guildNameSnapshot: guild?.name ?? undefined,
        replyMessageId: message.messageReference?.message_id ?? draft.replyMessageId,
    };
}

async function maybeEnrichRecord(payload: MessageUpdatePayload) {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    const cachedMessage = MessageStore.getMessage(payload.message.channel_id, payload.message.id);
    const message = cachedMessage ?? payload.message;
    if (!message?.author || message.author.id !== currentUserId) return;

    const media = collectMediaItems({
        attachments: message.attachments ?? [],
        embeds: message.embeds ?? [],
    });
    if (!media.length) return;

    const channel = ChannelStore.getChannel(message.channel_id);
    const guildId = payload.guildId ?? channel?.guild_id ?? "@me";
    const guild = guildId !== "@me" ? GuildStore.getGuild(guildId) : null;

    await mergeSentTrailRecordMedia(
        message.channel_id,
        message.id,
        media,
        {
            guildId,
            jumpLink: buildJumpLink(guildId, message.channel_id, message.id),
            channelNameSnapshot: channel?.name ?? undefined,
            guildNameSnapshot: guild?.name ?? undefined,
        },
    );
}

export default definePlugin({
    name: "SendTrail",
    description: "Tracks your newly sent messages in a dedicated Kamidere settings page.",
    authors: [Devs.Megu],
    dependencies: ["Settings", "MessageEventsAPI"],
    enabledByDefault: true,
    tags: ["kamidere", "chat", "utility"],
    requiresRestart: false,

    start() {
        SettingsPlugin.customEntries.push({
            key: "kamidere_send_trail",
            title: "Send Trail",
            Component: SendTrailTab,
            Icon: ClockIcon,
        });

        SettingsPlugin.settingsSectionMap.push(["KamidereSendTrail", "kamidere_send_trail"]);
    },

    stop() {
        pendingDrafts.clear();
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === "kamidere_send_trail");
        removeFromArray(SettingsPlugin.settingsSectionMap, entry => entry[1] === "kamidere_send_trail");
    },

    onBeforeMessageSend(channelId, messageObj, options) {
        createPendingDraft(channelId, messageObj, options);
    },

    flux: {
        async MESSAGE_CREATE(payload: MessageCreatePayload) {
            cleanupExpiredDrafts();

            if (payload.optimistic || payload.type !== "MESSAGE_CREATE") return;
            if (payload.message.state === "SENDING") return;

            const currentUserId = UserStore.getCurrentUser()?.id;
            if (!currentUserId || payload.message.author?.id !== currentUserId) return;

            const draft = resolveBestDraft(payload);
            if (!draft) return;

            await appendSentTrailRecord(buildRecord(payload, draft));
        },

        async MESSAGE_UPDATE(payload: MessageUpdatePayload) {
            cleanupExpiredDrafts();
            await maybeEnrichRecord(payload);
        },
    },
});

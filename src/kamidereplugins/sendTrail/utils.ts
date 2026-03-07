import type { Channel, CloudUpload, Message, MessageAttachment } from "@vencord/discord-types";
import type { Embed, EmbedMedia } from "@vencord/discord-types";
import { ChannelStore, GuildStore } from "@webpack/common";

import type { MediaExtractionInput, SentTrailMediaItem, SentTrailMediaKind, SentTrailRecord, UploadSignatureInput } from "./types";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif", ".svg"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v", ".mkv", ".gifv"];

function getFileExtension(value?: string) {
    if (!value) return "";

    const normalized = value.split("?")[0].toLowerCase();
    const dotIndex = normalized.lastIndexOf(".");
    return dotIndex === -1 ? "" : normalized.slice(dotIndex);
}

function inferMediaKind(value?: string, contentType?: string): SentTrailMediaKind | null {
    const normalizedContentType = contentType?.toLowerCase();

    if (normalizedContentType?.startsWith("image/")) return "image";
    if (normalizedContentType?.startsWith("video/")) return "video";

    const extension = getFileExtension(value);
    if (IMAGE_EXTENSIONS.includes(extension)) return "image";
    if (VIDEO_EXTENSIONS.includes(extension)) return "video";

    return null;
}

function dedupeMedia(items: SentTrailMediaItem[]) {
    const seen = new Set<string>();
    return items.filter(item => {
        const key = `${item.source}:${item.kind}:${item.url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function makeEmbedMediaItem(media: EmbedMedia | undefined, kind: SentTrailMediaKind): SentTrailMediaItem | null {
    if (!media?.url) return null;

    return {
        kind,
        source: "embed",
        url: media.url,
        contentType: media.contentType,
        width: media.width,
        height: media.height,
    };
}

export function normalizeContent(content?: string) {
    return (content ?? "")
        .replace(/\r\n/g, "\n")
        .trim();
}

export function getRecordPreview(content?: string) {
    const normalized = normalizeContent(content).replace(/\s+/g, " ");
    if (!normalized) return "";
    return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

export function makeUploadSignature({ uploads = [] }: UploadSignatureInput) {
    return uploads
        .map(upload => {
            const size = typeof upload.getSize === "function"
                ? upload.getSize()
                : upload.preCompressionSize ?? upload.currentSize ?? 0;
            const kind = upload.isVideo ? "video" : upload.isImage ? "image" : "file";
            return `${kind}:${upload.filename ?? ""}:${upload.mimeType ?? ""}:${size}`;
        })
        .sort()
        .join("|");
}

export function makeAttachmentSignature(attachments: MessageAttachment[] = []) {
    return attachments
        .map(attachment => {
            const kind = inferMediaKind(attachment.filename, attachment.content_type) ?? "file";
            return `${kind}:${attachment.filename}:${attachment.content_type ?? ""}:${attachment.size}`;
        })
        .sort()
        .join("|");
}

export function collectMediaItems({ attachments = [], embeds = [] }: MediaExtractionInput) {
    const items: SentTrailMediaItem[] = [];

    for (const attachment of attachments) {
        const kind = inferMediaKind(attachment.filename, attachment.content_type);
        if (!kind) continue;

        items.push({
            kind,
            source: "attachment",
            url: attachment.url,
            filename: attachment.filename,
            contentType: attachment.content_type,
            width: attachment.width,
            height: attachment.height,
        });
    }

    for (const embed of embeds) {
        if (embed.video) {
            const item = makeEmbedMediaItem(embed.video, "video");
            if (item) items.push(item);
        }

        if (embed.image) {
            const item = makeEmbedMediaItem(embed.image, "image");
            if (item) items.push(item);
        }

        if (embed.thumbnail) {
            const item = makeEmbedMediaItem(embed.thumbnail, "image");
            if (item) items.push(item);
        }

        for (const image of embed.images ?? []) {
            const item = makeEmbedMediaItem(image, inferMediaKind(image.url, image.contentType) ?? "image");
            if (item) items.push(item);
        }
    }

    return dedupeMedia(items);
}

export function getMessageTimestamp(message: Pick<Message, "timestamp">) {
    const value = new Date(message.timestamp as unknown as string | number | Date).getTime();
    return Number.isFinite(value) ? value : Date.now();
}

export function buildJumpLink(guildId: string | undefined, channelId: string, messageId: string) {
    return `/channels/${guildId || "@me"}/${channelId}/${messageId}`;
}

export function resolveRecordContext(record: SentTrailRecord) {
    const channel = ChannelStore.getChannel(record.channelId);
    const guildId = record.guildId === "@me"
        ? "@me"
        : channel?.guild_id ?? record.guildId;
    const guild = guildId && guildId !== "@me"
        ? GuildStore.getGuild(guildId)
        : null;

    return {
        guildId: guildId || "@me",
        guildName: guild?.name ?? record.guildNameSnapshot ?? (record.guildId === "@me" ? "Direct Messages" : "Unknown Server"),
        channelName: getChannelDisplayName(channel) ?? record.channelNameSnapshot ?? (record.guildId === "@me" ? "Direct Message" : "Unknown Channel"),
        isDirectMessage: (guildId || "@me") === "@me",
    };
}

function getChannelDisplayName(channel: Channel | undefined) {
    if (!channel) return null;

    if (typeof channel.name === "string" && channel.name.length) return channel.name;

    const recipients = (channel as Channel & { rawRecipients?: Array<{ username?: string; global_name?: string; }>; }).rawRecipients;
    if (recipients?.length) {
        return recipients
            .map(recipient => recipient.global_name || recipient.username || "Unknown User")
            .join(", ");
    }

    return null;
}

export function formatDayLabel(timestamp: number) {
    const date = new Date(timestamp);
    const now = new Date();

    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return "Today";

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

    return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    });
}

export function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function recordMatchesScope(record: SentTrailRecord, scope: string) {
    if (scope === "all") return true;
    if (scope === "dms") return record.guildId === "@me";
    if (scope.startsWith("guild:")) return record.guildId === scope.slice("guild:".length);
    return true;
}

export function buildSearchIndex(record: SentTrailRecord) {
    const context = resolveRecordContext(record);
    const mediaText = record.media
        .map(media => `${media.filename ?? ""} ${media.url}`)
        .join(" ");

    return [
        record.content,
        record.preview,
        context.guildName,
        context.channelName,
        mediaText,
    ]
        .join(" ")
        .toLowerCase();
}

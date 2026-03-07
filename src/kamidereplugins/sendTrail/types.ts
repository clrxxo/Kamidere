import type { CloudUpload } from "@vencord/discord-types";
import type { Embed, Message, MessageAttachment } from "@vencord/discord-types";

export type SentTrailMediaKind = "image" | "video";
export type SentTrailMediaSource = "attachment" | "embed";

export interface SentTrailMediaItem {
    kind: SentTrailMediaKind;
    source: SentTrailMediaSource;
    url: string;
    filename?: string;
    contentType?: string;
    width?: number;
    height?: number;
}

export interface SentTrailRecord {
    id: string;
    messageId: string;
    channelId: string;
    guildId: string;
    timestamp: number;
    content: string;
    preview: string;
    hasText: boolean;
    hasMedia: boolean;
    jumpLink: string;
    media: SentTrailMediaItem[];
    channelNameSnapshot?: string;
    guildNameSnapshot?: string;
    replyMessageId?: string;
}

export interface PendingSendDraft {
    localId: string;
    channelId: string;
    createdAt: number;
    content: string;
    normalizedContent: string;
    hasText: boolean;
    mediaHint: boolean;
    uploadSignature: string;
    replyMessageId?: string;
}

export interface MessageCreatePayload {
    type: "MESSAGE_CREATE";
    optimistic: boolean;
    channelId: string;
    guildId?: string;
    message: Message;
}

export interface MessageUpdatePayload {
    type: "MESSAGE_UPDATE";
    guildId?: string;
    message: Partial<Message> & Pick<Message, "id" | "channel_id">;
}

export interface MediaExtractionInput {
    attachments?: MessageAttachment[];
    embeds?: Embed[];
}

export interface UploadSignatureInput {
    uploads?: CloudUpload[];
}

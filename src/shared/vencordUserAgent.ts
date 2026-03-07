/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import gitHash from "~git-hash";
import gitRemote from "~git-remote";

import { BRAND_NAME } from "./branding";

export { gitHash, gitRemote };

export const gitHashShort = gitHash.slice(0, 7);
export const VENCORD_USER_AGENT = `${BRAND_NAME}/${gitHash}${gitRemote ? ` (https://github.com/${gitRemote})` : ""}`;
export const VENCORD_USER_AGENT_HASHLESS = `${BRAND_NAME}${gitRemote ? ` (https://github.com/${gitRemote})` : ""}`;

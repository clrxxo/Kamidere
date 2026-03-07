/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Flex } from "@components/Flex";
import { HeadingPrimary } from "@components/Heading";
import { Heart } from "@components/Heart";
import { Paragraph } from "@components/Paragraph";
import { DonateButton, TranslateButton } from "@components/settings";
import { BRAND_ICON_DATA_URL, BRAND_NAME } from "@shared/branding";
import { Margins } from "@utils/margins";
import { closeModal, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";

export function VencordDonorModal() {
    const modalKey = openModal(props => (
        <ErrorBoundary noop onError={() => {
            closeModal(modalKey);
            VencordNative.native.openExternal("https://github.com/sponsors/Vendicated");
        }}>
            <ModalRoot {...props}>
                <ModalHeader>
                    <HeadingPrimary
                        style={{
                            width: "100%",
                            textAlign: "center",
                            margin: 0
                        }}
                    >
                        <Flex justifyContent="center" alignItems="center" gap="0.5em">
                            <Heart />
                            Vencord Donor
                        </Flex>
                    </HeadingPrimary>
                </ModalHeader>
                <ModalContent>
                    <Flex>
                        <img
                            role="presentation"
                            src="https://cdn.discordapp.com/emojis/1026533070955872337.png"
                            alt=""
                            style={{ margin: "auto" }}
                        />
                        <img
                            role="presentation"
                            src="https://cdn.discordapp.com/emojis/1026533090627174460.png"
                            alt=""
                            style={{ margin: "auto" }}
                        />
                    </Flex>
                    <div style={{ padding: "1em" }}>
                        <Paragraph>
                            This Badge is a special perk for Vencord Donors
                        </Paragraph>
                        <Paragraph className={Margins.top20}>
                            Please consider supporting the development of Vencord by becoming a donor. It would mean a lot!!
                        </Paragraph>
                    </div>
                </ModalContent>
                <ModalFooter>
                    <Flex justifyContent="center" style={{ width: "100%" }}>
                        <DonateButton />
                    </Flex>
                </ModalFooter>
            </ModalRoot>
        </ErrorBoundary>
    ));
}

export function KamidereDonorModal() {
    const modalKey = openModal(props => (
        <ErrorBoundary noop onError={() => {
            closeModal(modalKey);
            VencordNative.native.openExternal("https://github.com/sponsors/thororen1234");
        }}>
            <ModalRoot {...props}>
                <ModalHeader>
                    <HeadingPrimary
                        style={{
                            width: "100%",
                            textAlign: "center",
                            margin: 0
                        }}
                    >
                        <Flex justifyContent="center" alignItems="center" gap="0.5em">
                            <Heart />
                            {BRAND_NAME} Donor
                        </Flex>
                    </HeadingPrimary>
                </ModalHeader>
                <ModalContent>
                    <Flex>
                        <img
                            role="presentation"
                            src="https://cdn.discordapp.com/emojis/1026533070955872337.png"
                            alt=""
                            style={{ margin: "auto" }}
                        />
                        <img
                            role="presentation"
                            src="https://cdn.discordapp.com/emojis/1026533090627174460.png"
                            alt=""
                            style={{ margin: "auto" }}
                        />
                    </Flex>
                    <div style={{ padding: "1em" }}>
                        <Paragraph>
                            This badge is a special perk for {BRAND_NAME} donors.
                        </Paragraph>
                        <Paragraph className={Margins.top20}>
                            Please consider supporting the development of {BRAND_NAME} by becoming a donor.
                        </Paragraph>
                    </div>
                </ModalContent>
                <ModalFooter>
                    <Flex justifyContent="center" style={{ width: "100%" }}>
                        <DonateButton brand={true} />
                    </Flex>
                </ModalFooter>
            </ModalRoot>
        </ErrorBoundary>
    ));
}

export function KamidereTranslatorModal() {
    const modalKey = openModal(props => (
        <ErrorBoundary noop onError={() => {
            closeModal(modalKey);
        }}>
            <ModalRoot {...props}>
                <ModalHeader>
                    <HeadingPrimary
                        style={{
                            width: "100%",
                            textAlign: "center",
                            margin: 0
                        }}
                    >
                        <Flex justifyContent="center" alignItems="center" gap="0.5em">
                            {BRAND_NAME} Translator
                        </Flex>
                    </HeadingPrimary>
                </ModalHeader>
                <ModalContent>
                    <Flex>
                        <img
                            className="vc-translate-modal-icon"
                            role="presentation"
                            src={BRAND_ICON_DATA_URL}
                            alt=""
                        />
                    </Flex>
                    <div className="vc-translate-modal-paragraph">
                        <Paragraph>
                            Awarded to contributors who expand {BRAND_NAME}'s language support by translating content for the community.
                        </Paragraph>
                    </div>
                </ModalContent>
                <ModalFooter>
                    <Flex justifyContent="center" style={{ width: "100%" }}>
                        <TranslateButton />
                    </Flex>
                </ModalFooter>
            </ModalRoot>
        </ErrorBoundary>
    ));
}

/*
 * Custom Name Pings
 * Full Discord-like mention system for custom names:
 * Red mention badges on channels/servers, authentic ping sound, desktop notifications,
 * and message row highlights.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Text } from "@components/Text";
import definePlugin, { OptionType } from "@utils/types";
import { waitFor } from "@webpack";
import {
    ChannelRouter,
    ChannelStore,
    FluxDispatcher,
    GuildReadStateStore,
    GuildStore,
    Menu,
    NavigationRouter,
    React,
    ReadStateStore,
    SelectedChannelStore,
    TextInput,
    useMemo,
    useState,
    UserStore
} from "@webpack/common";

const DISCORD_PING_AUDIO_URL = "https://discord.com/assets/dd920c06a01e5bb8b09678581e29d56f.mp3";
let pingAudio: HTMLAudioElement | null = null;

function playPingSound(volume = 1) {
    try {
        if (!pingAudio) {
            pingAudio = new Audio(DISCORD_PING_AUDIO_URL);
            pingAudio.preload = "auto";
        }
        pingAudio.currentTime = 0;
        pingAudio.volume = Math.min(1, Math.max(0, volume));
        pingAudio.play().catch(err => {
            console.error("[CustomNamePings] Audio play error", err);
        });
    } catch (e) {
        console.error("[CustomNamePings] Failed to play sound", e);
    }
}

const SANYA_VARIANTS = [
    // Основные формы
    "саня", "сани", "сане", "саню", "саней", "санею",

    // Санёк
    "санёк", "санек",
    "санька", "саньки", "саньке", "саньку", "санькой", "санькою",
    "саньком", "сань",

    // Санечка
    "санечка", "санечки", "санечке", "санечку",
    "санечкой", "санечкою",

    // Санюша
    "санюша", "санюши", "санюше", "санюшу", "санюшей",
    "санюшка", "санюшки", "санюшке", "санюшку", "санюшкой",

    // Санюха
    "санюха", "санюхи", "санюхе", "санюху", "санюхой", "санюхою",

    // Латиница
    "sanya", "sania", "san'ya",
    "sanyok", "sanek", "sanyusha", "sanyukha"
];

const SASHA_VARIANTS = [
    // Основные формы
    "саша", "саши", "саше", "сашу", "сашей", "сашею",

    // Сашка
    "сашка", "сашки", "сашке", "сашку", "сашкой", "сашкою",

    // Сашок
    "сашок", "сашком", "сашка", "сашку", "сашке",

    // Сашенька
    "сашенька", "сашеньки", "сашеньке", "сашеньку",
    "сашенькой", "сашенькою",

    // Сашуля
    "сашуля", "сашули", "сашуле", "сашулю", "сашулей", "сашулею",

    // Сашуня
    "сашуня", "сашуни", "сашуне", "сашуню", "сашуней",

    // Латиница
    "sasha", "sacha", "sashka", "sashok",
    "sashenka", "sashulya", "sashunya"
];

const SHURA_VARIANTS = [
    // Шура
    "шура", "шуры", "шуре", "шуру", "шурой", "шурою",

    // Шурик
    "шурик", "шурика", "шурику", "шуриком", "шурике",

    // Шурка
    "шурка", "шурки", "шурке", "шурку", "шуркой", "шуркою",

    // Латиница
    "shura", "shurik", "shurka"
];

const ALEXANDER_VARIANTS = [
    // Полное имя
    "александр", "александра", "александру",
    "александром", "александре",

    // Латиница
    "alexander", "alexandre", "aleksandr", "aleksander",

    // Уменьшительные имена
    ...SANYA_VARIANTS,
    ...SASHA_VARIANTS
];

const EFROSIM_VARIANTS = [
    // Основные формы
    "ефросим", "ефросима", "ефросиму",
    "ефросимом", "ефросиме",

    // Фросим
    "фросим", "фросима", "фросиму",
    "фросимом", "фросиме",

    // Ефрос
    "ефрос", "ефроса", "ефросу", "ефросом", "ефросе",

    // Ефросимка
    "ефросимка", "ефросимки", "ефросимке",
    "ефросимку", "ефросимкой",

    // Латиница
    "efrosim", "efrosym", "efrosima",
    "efros", "frosim"
];

/**
 * Common distinct Russian names that must never be accidentally triggered
 * by fuzzy matching unless the user explicitly configured them in settings.
 */
const COMMON_OTHER_NAMES = new Set([
    // Алексей и производные (не Александр!)
    "алексей", "алексея", "алексею", "алексеем", "алексее",
    "алеша", "алеши", "алеше", "алешу", "алешей", "алешею",
    "леша", "леши", "леше", "лешу", "лешей", "лешею",
    "леха", "лехи", "лехе", "леху", "лехой", "лехою",
    "алекс", "alex", "aleks",

    // Даниил / Даня
    "даня", "дани", "дане", "даню", "даней", "данею",
    "данил", "данила", "данилу", "данилом", "даниле",
    "даниил", "даниила", "даниилу", "даниилом", "данииле",

    // Иван / Ваня
    "ваня", "вани", "ване", "ваню", "ваней", "ванею",
    "иван", "ивана", "ивану", "иваном", "иване",

    // Павел / Паша
    "паша", "паши", "паше", "пашу", "пашей", "пашею",
    "павел", "павла", "павлу", "павлом", "павле",

    // Михаил / Миша
    "миша", "миши", "мише", "мишу", "мишей", "мишею",
    "михаил", "михаила", "михаилу", "михаилом", "михаиле",

    // Другие популярные мужские имена
    "андрей", "андрея", "андрею", "андреем", "андрее",
    "артем", "артема", "артему", "артемом", "артеме",
    "дмитрий", "дмитрия", "дима", "димы", "диме", "диму", "димой",
    "сергей", "сергея", "сережа", "серый",
    "максим", "максима", "макс", "макса", "максу", "максом",
    "никита", "никиты", "никите", "никиту", "никитой",
    "антон", "антона", "антону", "антоном", "антоне",
    "денис", "дениса", "денису", "денисом", "денисе",
    "илья", "ильи", "илье", "илью", "ильей",
    "кирилл", "кирилла", "кириллу", "кириллом", "кирилле",
    "егор", "егора", "егору", "егором", "егоре",

    // Женские частые
    "маша", "маши", "маше", "машу", "машей", "машею",
    "даша", "даши", "даше", "дашу", "дашей", "дашею",
    "таня", "тани", "тане", "таню", "таней", "танею",
    "аня", "ани", "ане", "аню", "аней", "анею"
]);

/**
 * Common Russian dictionary words that are close in edit distance (<= 1)
 * to various Russian name forms (e.g. шуткой <-> шуркой, сушкой <-> сашкой).
 * These must never trigger a mention unless specifically added in settings.
 */
const COMMON_EXCLUDED_WORDS = new Set([
    // шутка / шуткой (раньше матчилось с "шуркой")
    "шутка", "шутки", "шутке", "шутку", "шуткой", "шуткою", "шуток", "шуткам", "шутками", "шутках",
    "шутить", "шучу", "шутит", "шутим", "шутите", "шутят", "шутеечка",

    // сушка / сошка (раньше могло матчиться с "сашкой")
    "сушка", "сушки", "сушке", "сушку", "сушкой", "сушкою", "сушек", "сушкам", "сушками", "сушках",
    "сошка", "сошки", "сошке", "сошку", "сошкой", "сошкою", "сошек", "сошкам", "сошками", "сошках",

    // шарик / шкурка
    "шарик", "шарика", "шарику", "шариком", "шарике", "шарики", "шариков", "шарикам", "шариками", "шариках",
    "шкурка", "шкурки", "шкурке", "шкурку", "шкуркой", "шкуркою", "шкурок", "шкуркам", "шкурками", "шкурках"
]);

function normalizeText(text: string): string {
    return text
        .normalize("NFKC")
        .toLocaleLowerCase("ru-RU")
        .replace(/ё/g, "е");
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collapseDuplicates(s: string): string {
    let res = "";
    for (let i = 0; i < s.length; i++) {
        if (i === 0 || s[i] !== s[i - 1]) res += s[i];
    }
    return res;
}

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }
    return dp[m][n];
}

const KNOWN_NAME_EXPANSIONS: Record<string, string[]> = {};

function registerGroupAliases(group: string[]) {
    for (const alias of group) {
        KNOWN_NAME_EXPANSIONS[normalizeText(alias)] = group;
    }
}

// Broad group first, narrower override so "Саня" maps to Sanya's group, etc.
registerGroupAliases(ALEXANDER_VARIANTS);
registerGroupAliases(SANYA_VARIANTS);
registerGroupAliases(SASHA_VARIANTS);
registerGroupAliases(EFROSIM_VARIANTS);
registerGroupAliases(SHURA_VARIANTS);

interface FuzzyIndex {
    exactSet: Set<string>;
    byCharAndLength: Map<string, Map<number, string[]>>;
}

function buildFuzzyIndex(words: Iterable<string>): FuzzyIndex {
    const exactSet = new Set<string>();
    const byCharAndLength = new Map<string, Map<number, string[]>>();

    for (const w of words) {
        exactSet.add(w);
        if (!w) continue;
        const c = w[0];
        const len = w.length;
        let charMap = byCharAndLength.get(c);
        if (!charMap) {
            charMap = new Map<number, string[]>();
            byCharAndLength.set(c, charMap);
        }
        let lenList = charMap.get(len);
        if (!lenList) {
            lenList = [];
            charMap.set(len, lenList);
        }
        lenList.push(w);
    }

    return { exactSet, byCharAndLength };
}

function isFuzzyMatchWord(rawWord: string, index: FuzzyIndex): boolean {
    const norm = normalizeText(rawWord);
    if (index.exactSet.has(norm)) return true;

    const collapsed = collapseDuplicates(norm);
    if (index.exactSet.has(collapsed)) return true;

    // Never match another person's distinct Russian name unless specifically in exactSet
    if (COMMON_OTHER_NAMES.has(norm) || COMMON_OTHER_NAMES.has(collapsed)) {
        return false;
    }

    // Never match common Russian dictionary words unless specifically in exactSet
    if (COMMON_EXCLUDED_WORDS.has(norm) || COMMON_EXCLUDED_WORDS.has(collapsed)) {
        return false;
    }

    // Words shorter than 6 characters should not use Levenshtein distance matching to avoid
    // colliding with short words and names (like Даня/Ваня/Таня). Letter repeats are handled above.
    if (norm.length < 6) return false;

    const charMap = index.byCharAndLength.get(norm[0]);
    if (!charMap) return false;

    const wordLen = norm.length;
    for (let l = wordLen - 1; l <= wordLen + 1; l++) {
        const bucket = charMap.get(l);
        if (!bucket) continue;

        for (const target of bucket) {
            if (target.length < 6) continue;

            if (levenshtein(norm, target) <= 1) return true;
        }
    }

    return false;
}

function generateRussianDeclensions(w: string): string[] {
    // Masculine consonant ending: Антон -> Антона, Антону, Антоном, Антоне
    if (/^[а-яё]+[бвгджзклмнпрстфхцчшщ]$/i.test(w)) {
        return [w, w + "а", w + "у", w + "ом", w + "е"];
    }

    // Ending in -я: Ваня -> Вани, Ване, Ваню, Ваней, (Вань)
    if (/^[а-яё]+я$/i.test(w)) {
        const stem = w.slice(0, -1);
        const forms = [w, stem + "и", stem + "е", stem + "ю", stem + "ей", stem + "ею"];
        if (w.endsWith("ня")) {
            forms.push(stem + "ь");
        }
        return forms;
    }

    // Ending in -а: Маша, Миша, Никита
    if (/^[а-яё]+а$/i.test(w)) {
        const stem = w.slice(0, -1);
        const lastStemChar = stem.slice(-1);
        const genitive = /[гкхжчшщ]/i.test(lastStemChar) ? stem + "и" : stem + "ы";
        const instrumental = /[жчшщц]/i.test(lastStemChar)
            ? [stem + "ей", stem + "ею"]
            : [stem + "ой", stem + "ей", stem + "ою"];
        return [w, genitive, stem + "е", stem + "у", ...instrumental];
    }

    return [w];
}

function expandWord(rawWord: string): string[] {
    const w = normalizeText(rawWord.trim());
    if (!w) return [];

    if (KNOWN_NAME_EXPANSIONS[w]) {
        return KNOWN_NAME_EXPANSIONS[w];
    }

    return generateRussianDeclensions(w);
}

function buildPatternFromWord(rawWord: string): string | null {
    const w = rawWord.trim();
    if (!w) return null;

    if (w.endsWith("*")) {
        const base = normalizeText(w.slice(0, -1).trim());
        const escaped = escapeRegex(base).replace(/е/g, "[её]");
        return `${escaped}[\\p{L}\\p{N}_]*`;
    }

    const escaped = escapeRegex(normalizeText(w)).replace(/е/g, "[её]");
    return escaped;
}

let cachedCacheKey = "";
let cachedMatcher: { regex: RegExp | null; fuzzyIndex: FuzzyIndex } | null = null;

function getCompiledMatcher(): { regex: RegExp | null; fuzzyIndex: FuzzyIndex } | null {
    const { words, matchWordForms, fuzzyMatch } = settings.store;
    const cacheKey = `${words}|${matchWordForms}|${fuzzyMatch}`;
    if (cachedMatcher && cacheKey === cachedCacheKey) return cachedMatcher;

    cachedCacheKey = cacheKey;
    const rawList = words.split(",").map(w => w.trim()).filter(Boolean);
    if (rawList.length === 0) {
        cachedMatcher = null;
        return null;
    }

    const wordsToMatch = new Set<string>();
    const wildcardPatterns: string[] = [];

    for (const item of rawList) {
        if (item.endsWith("*")) {
            const p = buildPatternFromWord(item);
            if (p) wildcardPatterns.push(p);
        } else if (matchWordForms) {
            expandWord(item).forEach(w => wordsToMatch.add(normalizeText(w)));
        } else {
            wordsToMatch.add(normalizeText(item));
        }
    }

    const compiledWordPatterns = Array.from(wordsToMatch).map(w => {
        const escaped = escapeRegex(w);
        return escaped.replace(/е/g, "[её]");
    });

    const allPatterns = [
        ...compiledWordPatterns,
        ...wildcardPatterns
    ];

    allPatterns.sort((a, b) => b.length - a.length);

    let regex: RegExp | null = null;
    if (allPatterns.length > 0) {
        regex = new RegExp(`(?<![\\p{L}\\p{N}_])(${allPatterns.join("|")})(?![\\p{L}\\p{N}_])`, "giu");
    }

    cachedMatcher = {
        regex,
        fuzzyIndex: buildFuzzyIndex(wordsToMatch)
    };

    return cachedMatcher;
}

function isGuildAllowed(guildId: string | null): boolean {
    const { guildMode, selectedGuilds } = settings.store;
    if (guildMode === "all") return true;

    if (!guildId) {
        // Direct messages (DMs / Group DMs) are always allowed
        return true;
    }

    const list = selectedGuilds.split(",").map(id => id.trim()).filter(Boolean);
    if (guildMode === "whitelist") {
        return list.includes(guildId);
    }
    if (guildMode === "blacklist") {
        return !list.includes(guildId);
    }
    return true;
}

function getChannelCategory(channel: any): any {
    if (!channel) return null;
    if (channel.type === 4) return channel;
    if (channel.parent_id) {
        const parent = ChannelStore?.getChannel(channel.parent_id);
        if (parent?.type === 4) return parent;
        if (parent?.parent_id) {
            const grandParent = ChannelStore?.getChannel(parent.parent_id);
            if (grandParent?.type === 4) return grandParent;
        }
        return parent;
    }
    return null;
}

function isChannelAllowed(channelId: string | null | undefined, channel?: any): boolean {
    if (!channelId) return true;
    if (!channel && ChannelStore) {
        channel = ChannelStore.getChannel(channelId);
    }

    const { blacklistedChannels, blacklistedCategories } = settings.store;

    // 1. Direct channel blacklist
    if (blacklistedChannels) {
        const channelList = blacklistedChannels.split(",").map(id => id.trim()).filter(Boolean);
        if (channelList.includes(channelId)) {
            return false;
        }
        // If this channel is a thread whose parent channel is blacklisted
        if (channel?.parent_id && channelList.includes(channel.parent_id)) {
            return false;
        }
    }

    // 2. Category blacklist
    if (blacklistedCategories && channel) {
        const categoryList = blacklistedCategories.split(",").map(id => id.trim()).filter(Boolean);

        // If the channel itself is a category
        if (channel.type === 4 && categoryList.includes(channel.id)) {
            return false;
        }

        const category = getChannelCategory(channel);
        if (category && categoryList.includes(category.id)) {
            return false;
        }
    }

    return true;
}

let pluginStarted = false;

// Channel ID -> Set of unread message IDs
const unreadCustomMentions = new Map<string, Set<string>>();

function getCustomMentionCount(channelId: string | undefined): number {
    if (!channelId) return 0;
    return unreadCustomMentions.get(channelId)?.size ?? 0;
}

function clearCustomMentions(channelId: string | undefined) {
    if (channelId && unreadCustomMentions.has(channelId)) {
        unreadCustomMentions.delete(channelId);
        notifyStores();
    }
}

function notifyStores() {
    try {
        ReadStateStore?.emitChange?.();
        GuildReadStateStore?.emitChange?.();
    } catch (e) {
        console.error("[CustomNamePings] Failed to emit store change", e);
    }
}

function checkIsMentioned(message: any): boolean {
    if (!pluginStarted) return false;
    if (!message || typeof message.content !== "string" || !message.content) return false;

    try {
        const currentUserId = UserStore?.getCurrentUser()?.id;
        if (currentUserId && (message.author?.id === currentUserId || message.author_id === currentUserId)) {
            return false;
        }

        const channelId = message.channel_id;
        const channel = channelId ? ChannelStore?.getChannel(channelId) : null;
        const guildId = channel?.guild_id ?? channel?.getGuildId?.() ?? null;

        if (!isGuildAllowed(guildId) || !isChannelAllowed(channelId, channel)) {
            return false;
        }

        const matcher = getCompiledMatcher();
        if (!matcher) return false;

        const { regex, fuzzyIndex } = matcher;
        if (regex) {
            regex.lastIndex = 0;
            if (regex.test(message.content)) return true;
        }

        if (settings.store.fuzzyMatch && fuzzyIndex) {
            const wordRegex = /(?<![\p{L}\p{N}_])[\p{L}\p{N}_]+(?![\p{L}\p{N}_])/gu;
            let wm: RegExpExecArray | null;
            while ((wm = wordRegex.exec(message.content)) !== null) {
                if (isFuzzyMatchWord(wm[0], fuzzyIndex)) {
                    return true;
                }
            }
        }

        return false;
    } catch (err) {
        console.error("[CustomNamePings] Error in checkIsMentioned", err);
        return false;
    }
}

/**
 * Injects current user into message.mentions so Discord treats it natively as a real ping!
 */
function injectMention(message: any): boolean {
    if (!pluginStarted) return false;
    if (!message || typeof message.content !== "string") return false;

    const currentUser = UserStore?.getCurrentUser?.();
    if (!currentUser) return false;
    if (message.author?.id === currentUser.id || message.author_id === currentUser.id) return false;

    const channelId = message.channel_id;
    const channel = channelId ? ChannelStore?.getChannel(channelId) : null;
    const guildId = channel?.guild_id ?? message.guild_id ?? null;
    if (!isGuildAllowed(guildId) || !isChannelAllowed(channelId, channel)) return false;

    if (!checkIsMentioned(message)) return false;

    if (!Array.isArray(message.mentions)) {
        message.mentions = [];
    }

    if (!message.mentions.some((m: any) => (m?.id || m) === currentUser.id)) {
        message.mentions.push({
            id: currentUser.id,
            username: currentUser.username,
            discriminator: currentUser.discriminator || "0",
            avatar: currentUser.avatar,
            global_name: currentUser.globalName || currentUser.username,
            bot: false
        });
    }

    message.mentioned = true;
    return true;
}

function processDispatchEvent(event: any) {
    if (!pluginStarted || !event) return;

    if (event.type === "MESSAGE_CREATE" && event.message) {
        injectMention(event.message);
    } else if (event.type === "LOAD_MESSAGES_SUCCESS" && Array.isArray(event.messages)) {
        for (const msg of event.messages) {
            injectMention(msg);
        }
    } else if (event.type === "MESSAGE_UPDATE" && event.message) {
        injectMention(event.message);
    }
}

let origDispatch: any = null;
let origInternalDispatch: any = null;

function patchDispatcher(dispatcher: any) {
    if (!dispatcher) return;

    if (!origDispatch && typeof dispatcher.dispatch === "function") {
        origDispatch = dispatcher.dispatch;
        dispatcher.dispatch = function(event: any) {
            try {
                processDispatchEvent(event);
            } catch (err) {
                console.error("[CustomNamePings] Dispatch intercept error", err);
            }
            return origDispatch.apply(this, arguments);
        };
    }

    if (!origInternalDispatch && typeof dispatcher._dispatch === "function") {
        origInternalDispatch = dispatcher._dispatch;
        dispatcher._dispatch = function(event: any) {
            try {
                processDispatchEvent(event);
            } catch (err) {
                console.error("[CustomNamePings] _dispatch intercept error", err);
            }
            return origInternalDispatch.apply(this, arguments);
        };
    }
}

function unpatchDispatcher(dispatcher: any) {
    if (dispatcher) {
        if (origDispatch) {
            dispatcher.dispatch = origDispatch;
            origDispatch = null;
        }
        if (origInternalDispatch) {
            dispatcher._dispatch = origInternalDispatch;
            origInternalDispatch = null;
        }
    }
}

let originalReadStateGetMentionCount: any = null;
let originalReadStateHasUnreadOrMentions: any = null;
let originalReadStateGetGuildChannelUnreadState: any = null;
let originalGuildReadStateGetMentionCount: any = null;
let originalGuildReadStateHasUnread: any = null;

function patchStores() {
    if (ReadStateStore && !originalReadStateGetMentionCount) {
        originalReadStateGetMentionCount = ReadStateStore.getMentionCount;
        ReadStateStore.getMentionCount = function(channelId: string, type?: any) {
            const orig = originalReadStateGetMentionCount.call(this, channelId, type);
            if (orig > 0) return orig;
            const custom = getCustomMentionCount(channelId);
            return orig + custom;
        };

        originalReadStateHasUnreadOrMentions = ReadStateStore.hasUnreadOrMentions;
        ReadStateStore.hasUnreadOrMentions = function(channelId: string, type?: any) {
            if (getCustomMentionCount(channelId) > 0) return true;
            return originalReadStateHasUnreadOrMentions.call(this, channelId, type);
        };

        if (ReadStateStore.getGuildChannelUnreadState) {
            originalReadStateGetGuildChannelUnreadState = ReadStateStore.getGuildChannelUnreadState;
            ReadStateStore.getGuildChannelUnreadState = function(channel: any, ...args: any[]) {
                const state = originalReadStateGetGuildChannelUnreadState.apply(this, [channel, ...args]);
                const custom = getCustomMentionCount(channel?.id);
                if (custom > 0 && state) {
                    return {
                        ...state,
                        mentionCount: (state.mentionCount || 0) + custom,
                        unread: true
                    };
                }
                return state;
            };
        }
    }

    if (GuildReadStateStore && !originalGuildReadStateGetMentionCount) {
        originalGuildReadStateGetMentionCount = GuildReadStateStore.getMentionCount;
        GuildReadStateStore.getMentionCount = function(guildId: string | null) {
            const orig = originalGuildReadStateGetMentionCount.call(this, guildId);
            if (orig > 0) return orig;
            let customTotal = 0;
            for (const [chId, msgSet] of unreadCustomMentions.entries()) {
                if (msgSet.size === 0) continue;
                const ch = ChannelStore.getChannel(chId);
                if (ch && ch.guild_id === guildId) {
                    customTotal += msgSet.size;
                }
            }
            return orig + customTotal;
        };

        originalGuildReadStateHasUnread = GuildReadStateStore.hasUnread;
        GuildReadStateStore.hasUnread = function(guildId: string) {
            for (const [chId, msgSet] of unreadCustomMentions.entries()) {
                if (msgSet.size > 0) {
                    const ch = ChannelStore.getChannel(chId);
                    if (ch && ch.guild_id === guildId) return true;
                }
            }
            return originalGuildReadStateHasUnread.call(this, guildId);
        };
    }
}

function unpatchStores() {
    if (ReadStateStore && originalReadStateGetMentionCount) {
        ReadStateStore.getMentionCount = originalReadStateGetMentionCount;
        originalReadStateGetMentionCount = null;
    }
    if (ReadStateStore && originalReadStateHasUnreadOrMentions) {
        ReadStateStore.hasUnreadOrMentions = originalReadStateHasUnreadOrMentions;
        originalReadStateHasUnreadOrMentions = null;
    }
    if (ReadStateStore && originalReadStateGetGuildChannelUnreadState) {
        ReadStateStore.getGuildChannelUnreadState = originalReadStateGetGuildChannelUnreadState;
        originalReadStateGetGuildChannelUnreadState = null;
    }
    if (GuildReadStateStore && originalGuildReadStateGetMentionCount) {
        GuildReadStateStore.getMentionCount = originalGuildReadStateGetMentionCount;
        originalGuildReadStateGetMentionCount = null;
    }
    if (GuildReadStateStore && originalGuildReadStateHasUnread) {
        GuildReadStateStore.hasUnread = originalGuildReadStateHasUnread;
        originalGuildReadStateHasUnread = null;
    }
}

function scanChannelMessages(channelId: string, messages: any[]) {
    if (!pluginStarted) return;
    const currentChannelId = SelectedChannelStore?.getChannelId?.();
    if (currentChannelId === channelId && document.hasFocus()) {
        return;
    }

    const channel = ChannelStore?.getChannel(channelId);
    const guildId = channel?.guild_id ?? null;
    if (!isGuildAllowed(guildId) || !isChannelAllowed(channelId, channel)) return;

    const ackId = ReadStateStore?.ackMessageId?.(channelId) || ReadStateStore?.getTrackedAckMessageId?.(channelId);

    let changed = false;
    for (const msg of messages) {
        if (!msg || typeof msg.content !== "string") continue;
        if (ackId && msg.id <= ackId) continue;
        if (checkIsMentioned(msg)) {
            injectMention(msg);
            if (!unreadCustomMentions.has(channelId)) {
                unreadCustomMentions.set(channelId, new Set());
            }
            unreadCustomMentions.get(channelId)!.add(msg.id);
            changed = true;
        }
    }

    if (changed) {
        notifyStores();
    }
}

function GuildSelector() {
    const { selectedGuilds, guildMode } = settings.use(["selectedGuilds", "guildMode"]);
    const [search, setSearch] = useState("");

    const selectedSet = useMemo(() => {
        return new Set(selectedGuilds.split(",").map(id => id.trim()).filter(Boolean));
    }, [selectedGuilds]);

    const allGuilds = useMemo(() => {
        try {
            const raw = GuildStore?.getGuilds?.() ?? {};
            return Object.values(raw).sort((a: any, b: any) =>
                (a.name || "").localeCompare(b.name || "")
            );
        } catch {
            return [];
        }
    }, []);

    const filteredGuilds = useMemo(() => {
        if (!search.trim()) return allGuilds;
        const q = search.toLowerCase();
        return allGuilds.filter((g: any) =>
            (g.name || "").toLowerCase().includes(q) || (g.id || "").includes(q)
        );
    }, [allGuilds, search]);

    const toggleGuild = (guildId: string) => {
        const next = new Set(selectedSet);
        if (next.has(guildId)) {
            next.delete(guildId);
        } else {
            next.add(guildId);
        }
        settings.store.selectedGuilds = Array.from(next).join(",");
    };

    const selectAll = () => {
        const allIds = allGuilds.map((g: any) => g.id);
        settings.store.selectedGuilds = allIds.join(",");
    };

    const clearAll = () => {
        settings.store.selectedGuilds = "";
    };

    if (guildMode === "all") {
        return (
            <Text color="text-muted" size="sm" style={{ marginTop: "8px" }}>
                Выбран режим "Все серверы", поэтому упоминания работают везде.
            </Text>
        );
    }

    return (
        <div className="vc-cnp-guilds-container">
            <div className="vc-cnp-guilds-header">
                <TextInput
                    placeholder="Поиск серверов по названию или ID..."
                    value={search}
                    onChange={setSearch}
                    style={{ flex: 1 }}
                />
                <Button size="small" variant="secondary" onClick={selectAll}>Выбрать все</Button>
                <Button size="small" variant="dangerPrimary" onClick={clearAll}>Очистить</Button>
            </div>

            <Text size="xs" color="text-muted">
                Выбрано: {selectedSet.size} из {allGuilds.length} серверов
            </Text>

            <div className="vc-cnp-guilds-list">
                {filteredGuilds.length === 0 ? (
                    <Text size="sm" color="text-muted" style={{ padding: "12px", textAlign: "center" }}>
                        Серверы не найдены
                    </Text>
                ) : (
                    filteredGuilds.map((guild: any) => {
                        const isSelected = selectedSet.has(guild.id);
                        const iconUrl = guild.getIconURL ? guild.getIconURL(32) : null;
                        const initials = (guild.name || "?")
                            .split(" ")
                            .map((w: string) => w[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase();

                        return (
                            <div
                                key={guild.id}
                                className="vc-cnp-guild-item"
                                onClick={() => toggleGuild(guild.id)}
                                style={{ cursor: "pointer" }}
                            >
                                <div className="vc-cnp-guild-info">
                                    {iconUrl ? (
                                        <img src={iconUrl} alt="" className="vc-cnp-guild-icon" />
                                    ) : (
                                        <div className="vc-cnp-guild-icon">{initials}</div>
                                    )}
                                    <div style={{ display: "flex", flexDirection: "column" }}>
                                        <span className="vc-cnp-guild-name">{guild.name}</span>
                                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{guild.id}</span>
                                    </div>
                                </div>

                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onClick={e => e.stopPropagation()}
                                    onChange={() => toggleGuild(guild.id)}
                                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                                />
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

function BlacklistManager() {
    const { blacklistedChannels, blacklistedCategories } = settings.use(["blacklistedChannels", "blacklistedCategories"]);
    const [channelInput, setChannelInput] = useState("");
    const [categoryInput, setCategoryInput] = useState("");

    const channelIds = useMemo(() => {
        return blacklistedChannels.split(",").map(id => id.trim()).filter(Boolean);
    }, [blacklistedChannels]);

    const categoryIds = useMemo(() => {
        return blacklistedCategories.split(",").map(id => id.trim()).filter(Boolean);
    }, [blacklistedCategories]);

    const addChannel = () => {
        const id = channelInput.trim();
        if (!id) return;
        const next = new Set(channelIds);
        next.add(id);
        settings.store.blacklistedChannels = Array.from(next).join(",");
        setChannelInput("");
    };

    const removeChannel = (idToRemove: string) => {
        const next = new Set(channelIds);
        next.delete(idToRemove);
        settings.store.blacklistedChannels = Array.from(next).join(",");
    };

    const clearChannels = () => {
        settings.store.blacklistedChannels = "";
    };

    const addCategory = () => {
        const id = categoryInput.trim();
        if (!id) return;
        const next = new Set(categoryIds);
        next.add(id);
        settings.store.blacklistedCategories = Array.from(next).join(",");
        setCategoryInput("");
    };

    const removeCategory = (idToRemove: string) => {
        const next = new Set(categoryIds);
        next.delete(idToRemove);
        settings.store.blacklistedCategories = Array.from(next).join(",");
    };

    const clearCategories = () => {
        settings.store.blacklistedCategories = "";
    };

    return (
        <div className="vc-cnp-blacklist-container">
            {/* Channels Blacklist */}
            <div className="vc-cnp-blacklist-section">
                <Text size="md" color="header-primary" style={{ fontWeight: 600 }}>
                    Черный список каналов ({channelIds.length})
                </Text>
                <Text size="xs" color="text-muted">
                    В этих каналах (и ветках внутри них) упоминания будут полностью игнорироваться.
                </Text>

                <div className="vc-cnp-blacklist-input-row">
                    <TextInput
                        placeholder="Вставьте ID канала..."
                        value={channelInput}
                        onChange={setChannelInput}
                        onKeyDown={(e: any) => { if (e.key === "Enter") addChannel(); }}
                        style={{ flex: 1 }}
                    />
                    <Button size="small" variant="primary" onClick={addChannel} disabled={!channelInput.trim()}>
                        Добавить
                    </Button>
                    {channelIds.length > 0 && (
                        <Button size="small" variant="dangerPrimary" onClick={clearChannels}>
                            Очистить
                        </Button>
                    )}
                </div>

                <div className="vc-cnp-blacklist-list">
                    {channelIds.length === 0 ? (
                        <Text size="sm" color="text-muted" style={{ padding: "8px 12px" }}>
                            Черный список каналов пуст. Вы можете добавить ID выше или нажать ПКМ по каналу в списке.
                        </Text>
                    ) : (
                        channelIds.map(id => {
                            const ch = ChannelStore?.getChannel(id);
                            const guild = ch?.guild_id ? GuildStore?.getGuild(ch.guild_id) : null;
                            const cat = ch ? getChannelCategory(ch) : null;
                            const title = ch?.name ? `#${ch.name}` : `Канал ${id}`;
                            const subtitle = [guild?.name, cat?.name ? `📁 ${cat.name}` : null, id].filter(Boolean).join(" • ");

                            return (
                                <div key={id} className="vc-cnp-blacklist-item">
                                    <div className="vc-cnp-blacklist-item-info">
                                        <span className="vc-cnp-blacklist-item-title">{title}</span>
                                        <span className="vc-cnp-blacklist-item-sub">{subtitle}</span>
                                    </div>
                                    <Button
                                        size="small"
                                        variant="dangerPrimary"
                                        onClick={() => removeChannel(id)}
                                        style={{ minWidth: "auto", padding: "2px 8px" }}
                                    >
                                        Удалить
                                    </Button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Categories Blacklist */}
            <div className="vc-cnp-blacklist-section">
                <Text size="md" color="header-primary" style={{ fontWeight: 600 }}>
                    Черный список категорий ({categoryIds.length})
                </Text>
                <Text size="xs" color="text-muted">
                    Все каналы внутри указанных категорий будут автоматически игнорироваться.
                </Text>

                <div className="vc-cnp-blacklist-input-row">
                    <TextInput
                        placeholder="Вставьте ID категории..."
                        value={categoryInput}
                        onChange={setCategoryInput}
                        onKeyDown={(e: any) => { if (e.key === "Enter") addCategory(); }}
                        style={{ flex: 1 }}
                    />
                    <Button size="small" variant="primary" onClick={addCategory} disabled={!categoryInput.trim()}>
                        Добавить
                    </Button>
                    {categoryIds.length > 0 && (
                        <Button size="small" variant="dangerPrimary" onClick={clearCategories}>
                            Очистить
                        </Button>
                    )}
                </div>

                <div className="vc-cnp-blacklist-list">
                    {categoryIds.length === 0 ? (
                        <Text size="sm" color="text-muted" style={{ padding: "8px 12px" }}>
                            Черный список категорий пуст. Вы можете добавить ID выше или нажать ПКМ по категории в списке.
                        </Text>
                    ) : (
                        categoryIds.map(id => {
                            const cat = ChannelStore?.getChannel(id);
                            const guild = cat?.guild_id ? GuildStore?.getGuild(cat.guild_id) : null;
                            const title = cat?.name ? `📁 ${cat.name}` : `Категория ${id}`;
                            const subtitle = [guild?.name, id].filter(Boolean).join(" • ");

                            return (
                                <div key={id} className="vc-cnp-blacklist-item">
                                    <div className="vc-cnp-blacklist-item-info">
                                        <span className="vc-cnp-blacklist-item-title">{title}</span>
                                        <span className="vc-cnp-blacklist-item-sub">{subtitle}</span>
                                    </div>
                                    <Button
                                        size="small"
                                        variant="dangerPrimary"
                                        onClick={() => removeCategory(id)}
                                        style={{ minWidth: "auto", padding: "2px 8px" }}
                                    >
                                        Удалить
                                    </Button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <Text size="xs" color="text-muted" style={{ marginTop: "4px", fontStyle: "italic" }}>
                💡 Подсказка: вы также можете нажать правой кнопкой мыши по любому каналу или категории в Discord и выбрать пункт «Игнорировать упоминания имени».
            </Text>
        </div>
    );
}

const patchChannelContextMenu: NavContextMenuPatchCallback = (children, { channel }) => {
    if (!pluginStarted || !channel) return;

    const isCategory = channel.type === 4;
    const { blacklistedChannels, blacklistedCategories } = settings.store;

    const channelList = blacklistedChannels.split(",").map(id => id.trim()).filter(Boolean);
    const categoryList = blacklistedCategories.split(",").map(id => id.trim()).filter(Boolean);

    const isChanBlacklisted = channelList.includes(channel.id);
    const isCatBlacklisted = isCategory ? categoryList.includes(channel.id) : false;

    const category = !isCategory ? getChannelCategory(channel) : null;
    const isParentCatBlacklisted = category ? categoryList.includes(category.id) : false;

    const items: any[] = [];

    if (isCategory) {
        items.push(
            <Menu.MenuCheckboxItem
                id="vc-cnp-ignore-category"
                label="Игнорировать упоминания имени в категории"
                checked={isCatBlacklisted}
                action={() => {
                    const next = new Set(categoryList);
                    if (isCatBlacklisted) {
                        next.delete(channel.id);
                    } else {
                        next.add(channel.id);
                    }
                    settings.store.blacklistedCategories = Array.from(next).join(",");
                }}
            />
        );
    } else {
        items.push(
            <Menu.MenuCheckboxItem
                id="vc-cnp-ignore-channel"
                label="Игнорировать упоминания имени в этом канале"
                checked={isChanBlacklisted}
                action={() => {
                    const next = new Set(channelList);
                    if (isChanBlacklisted) {
                        next.delete(channel.id);
                    } else {
                        next.add(channel.id);
                    }
                    settings.store.blacklistedChannels = Array.from(next).join(",");
                }}
            />
        );

        if (category && category.name) {
            items.push(
                <Menu.MenuCheckboxItem
                    id="vc-cnp-ignore-parent-category"
                    label={`Игнорировать во всей категории "${category.name}"`}
                    checked={isParentCatBlacklisted}
                    action={() => {
                        const next = new Set(categoryList);
                        if (isParentCatBlacklisted) {
                            next.delete(category.id);
                        } else {
                            next.add(category.id);
                        }
                        settings.store.blacklistedCategories = Array.from(next).join(",");
                    }}
                />
            );
        }
    }

    const group = findGroupChildrenByChildId("mark-channel-read", children) ?? children;
    group.push(...items);
};

const settings = definePluginSettings({
    words: {
        type: OptionType.STRING,
        description: "Базовые имена и ники (через запятую, можно с * в конце для маски)",
        default: "Саня, Саша, Александр, Ефросим, Efrosim",
        onChange: () => {
            cachedCacheKey = "";
            cachedMatcher = null;
        }
    },
    matchWordForms: {
        type: OptionType.BOOLEAN,
        description: "Учитывать группы уменьшительных имён и падежи (Саня ↔ Санёк ↔ Санечка, Саша ↔ Сашка, Александр ↔ Шура и др.)",
        default: true,
        onChange: () => {
            cachedCacheKey = "";
            cachedMatcher = null;
        }
    },
    fuzzyMatch: {
        type: OptionType.BOOLEAN,
        description: "Распознавать опечатки и растянутые буквы (Саааня, Саняа, Ефросимм, Ефросип и др.)",
        default: true,
        onChange: () => {
            cachedCacheKey = "";
            cachedMatcher = null;
        }
    },
    playPingSound: {
        type: OptionType.BOOLEAN,
        description: "Воспроизводить оригинальный звук пинга Discord при упоминании",
        default: true
    },
    soundVolume: {
        type: OptionType.SLIDER,
        description: "Громкость звука пинга (%)",
        default: 100,
        markers: [0, 25, 50, 75, 100]
    },
    desktopNotification: {
        type: OptionType.BOOLEAN,
        description: "Показывать всплывающее уведомление (Desktop / In-app) с переходом в чат по клику",
        default: true
    },
    highlightWords: {
        type: OptionType.BOOLEAN,
        description: "Подсвечивать слова в тексте красненьким цветом",
        default: true
    },
    guildMode: {
        type: OptionType.SELECT,
        description: "Режим фильтрации серверов",
        options: [
            {
                label: "Все серверы (Везде)",
                value: "all",
                default: true
            },
            {
                label: "Только выбранные серверы (Whitelist)",
                value: "whitelist"
            },
            {
                label: "Все серверы, кроме выбранных (Blacklist)",
                value: "blacklist"
            }
        ]
    },
    guildSelector: {
        type: OptionType.COMPONENT,
        component: GuildSelector
    },
    selectedGuilds: {
        type: OptionType.STRING,
        description: "ID выбранных серверов (через запятую)",
        default: ""
    },
    blacklistedChannels: {
        type: OptionType.STRING,
        description: "ID игнорируемых каналов (через запятую)",
        default: ""
    },
    blacklistedCategories: {
        type: OptionType.STRING,
        description: "ID игнорируемых категорий (через запятую)",
        default: ""
    },
    blacklistManager: {
        type: OptionType.COMPONENT,
        component: BlacklistManager
    }
});

const authorEfrosim = {
    name: "efrosim",
    id: 545638389890678802n
};

export default definePlugin({
    name: "CustomNamePings",
    description: "Превращает имена и ники в настоящие пинги Discord (красный бейдж на канале и сервере, звук, уведомление, подсветка).",
    authors: [authorEfrosim],
    settings,
    contextMenus: {
        "channel-context": patchChannelContextMenu,
        "thread-context": patchChannelContextMenu
    },

    settingsAboutComponent: () => (
        <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
            <Button
                size="small"
                variant="primary"
                onClick={() => {
                    const vol = (settings.store.soundVolume ?? 100) / 100;
                    playPingSound(vol);
                    showNotification({
                        title: "Тестовый пинг (CustomNamePings)",
                        body: "Ваше имя упомянули в сообщении!",
                        color: "#ed4245"
                    });
                }}
            >
                Проверить звук и уведомление
            </Button>
        </div>
    ),

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic: boolean; }) {
            if (optimistic) return;
            if (!pluginStarted) return;
            if (!message || typeof message.content !== "string") return;

            const currentUser = UserStore?.getCurrentUser?.();
            if (!currentUser || message.author?.id === currentUser.id || message.author_id === currentUser.id) {
                return;
            }

            const channelId = message.channel_id;
            const channel = channelId ? ChannelStore?.getChannel(channelId) : null;
            const guildId = channel?.guild_id ?? message.guild_id ?? null;

            if (!isGuildAllowed(guildId) || !isChannelAllowed(channelId, channel)) return;

            if (!injectMention(message)) return;

            const currentChannelId = SelectedChannelStore?.getChannelId?.();
            const isLookingAtChannel = (currentChannelId === channelId && document.hasFocus());

            // 1. Audio ping sound (Official Discord Mention Sound)
            if (settings.store.playPingSound) {
                const vol = (settings.store.soundVolume ?? 100) / 100;
                playPingSound(vol);
            }

            // 2. Desktop / In-app notification popup
            if (settings.store.desktopNotification && !isLookingAtChannel) {
                try {
                    const authorName = message.author?.global_name || message.author?.username || "Пользователь";
                    let title = authorName;

                    if (guildId) {
                        const guild = GuildStore?.getGuild(guildId);
                        const channelName = channel?.name || "чат";
                        title = `${authorName} (${guild?.name ?? "Сервер"}, #${channelName})`;
                    } else if (channel?.name) {
                        title = `${authorName} (${channel.name})`;
                    }

                    const avatarUrl = message.author?.avatar
                        ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png?size=128`
                        : undefined;

                    showNotification({
                        title,
                        body: message.content.length > 250 ? message.content.slice(0, 247) + "..." : message.content,
                        icon: avatarUrl,
                        color: "#ed4245",
                        onClick() {
                            try {
                                if (NavigationRouter?.transitionTo) {
                                    NavigationRouter.transitionTo(`/channels/${guildId ?? "@me"}/${channelId}/${message.id}`);
                                } else if (ChannelRouter?.transitionToChannel) {
                                    ChannelRouter.transitionToChannel(channelId);
                                }
                            } catch (e) {
                                console.error("[CustomNamePings] Navigation error", e);
                            }
                        }
                    });
                } catch (err) {
                    console.error("[CustomNamePings] Notification error", err);
                }
            }

            // 3. Register as an unread mention so the RED BADGE appears on the channel and server
            if (!isLookingAtChannel) {
                if (!unreadCustomMentions.has(channelId)) {
                    unreadCustomMentions.set(channelId, new Set());
                }
                unreadCustomMentions.get(channelId)!.add(message.id);
                notifyStores();
            }
        },

        CHANNEL_SELECT({ channelId }: { channelId: string; }) {
            clearCustomMentions(channelId);
        },

        MESSAGE_ACK({ channelId }: { channelId: string; }) {
            clearCustomMentions(channelId);
        },

        LOAD_MESSAGES_SUCCESS({ channelId, messages }: { channelId: string; messages: any[]; }) {
            if (channelId && Array.isArray(messages)) {
                scanChannelMessages(channelId, messages);
            }
        }
    },

    patches: [
        {
            find: 'text:{react:(e,t,n)=>"string"==typeof e.content',
            replacement: {
                match: /text:\{react:\((\i),(\i),(\i)\)=>"string"==typeof \1\.content\?\(0,\i\.jsx\)\("span",\{children:\1\.content\},\3\.key\):\(0,\i\.jsx\)\("span",\{children:\2\(\1\.content,\3\)\},\3\.key\)\}/,
                replace: "text:{react:(e,t,n)=>$self.renderText(e,t,n)}"
            }
        }
    ],

    renderText(node: any, recurse: any, state: any) {
        if (typeof node?.content !== "string") {
            return (0, React.createElement)("span", { key: state?.key }, recurse(node.content, state));
        }

        if (!pluginStarted || !settings.store.highlightWords) {
            return <span key={state?.key}>{node.content}</span>;
        }

        try {
            const channelId = state?.channelId;
            const channel = channelId ? ChannelStore?.getChannel(channelId) : null;
            const guildId = channel?.guild_id ?? channel?.getGuildId?.() ?? null;

            if (!isGuildAllowed(guildId) || !isChannelAllowed(channelId, channel)) {
                return <span key={state?.key}>{node.content}</span>;
            }

            const matcher = getCompiledMatcher();
            if (!matcher) {
                return <span key={state?.key}>{node.content}</span>;
            }

            const { regex, fuzzyIndex } = matcher;
            const text = node.content;
            const ranges: { start: number; end: number }[] = [];

            if (regex) {
                regex.lastIndex = 0;
                let m: RegExpExecArray | null;
                while ((m = regex.exec(text)) !== null) {
                    ranges.push({ start: m.index, end: m.index + m[0].length });
                    if (m[0].length === 0) regex.lastIndex++;
                }
            }

            if (settings.store.fuzzyMatch && fuzzyIndex) {
                const wordRegex = /(?<![\p{L}\p{N}_])[\p{L}\p{N}_]+(?![\p{L}\p{N}_])/gu;
                let wm: RegExpExecArray | null;
                while ((wm = wordRegex.exec(text)) !== null) {
                    const start = wm.index;
                    const end = start + wm[0].length;
                    if (ranges.some(r => Math.max(r.start, start) < Math.min(r.end, end))) {
                        continue;
                    }
                    if (isFuzzyMatchWord(wm[0], fuzzyIndex)) {
                        ranges.push({ start, end });
                    }
                }
            }

            if (ranges.length === 0) {
                return <span key={state?.key}>{text}</span>;
            }

            ranges.sort((a, b) => a.start - b.start);

            // Merge any overlapping or adjacent ranges
            const merged: { start: number; end: number }[] = [];
            for (const r of ranges) {
                if (merged.length === 0) {
                    merged.push({ ...r });
                } else {
                    const last = merged[merged.length - 1];
                    if (r.start <= last.end) {
                        last.end = Math.max(last.end, r.end);
                    } else {
                        merged.push({ ...r });
                    }
                }
            }

            const elements: React.ReactNode[] = [];
            let lastIdx = 0;
            for (let i = 0; i < merged.length; i++) {
                const { start, end } = merged[i];
                if (start > lastIdx) {
                    elements.push(<span key={`${state?.key}-txt-${lastIdx}`}>{text.slice(lastIdx, start)}</span>);
                }
                elements.push(
                    <span
                        key={`${state?.key}-m-${start}`}
                        className="mention vc-custom-name-mention"
                        title="Упоминание имени (CustomNamePings)"
                    >
                        {text.slice(start, end)}
                    </span>
                );
                lastIdx = end;
            }
            if (lastIdx < text.length) {
                elements.push(<span key={`${state?.key}-txt-${lastIdx}`}>{text.slice(lastIdx)}</span>);
            }

            return <span key={state?.key}>{elements}</span>;
        } catch (err) {
            console.error("[CustomNamePings] Error in renderText", err);
            return <span key={state?.key}>{node.content}</span>;
        }
    },

    isMentioned: checkIsMentioned,

    start() {
        pluginStarted = true;
        patchStores();
        if (FluxDispatcher) {
            patchDispatcher(FluxDispatcher);
        } else {
            waitFor(["dispatch", "subscribe"], (m: any) => patchDispatcher(m));
        }
        notifyStores();
        console.info("[CustomNamePings] Plugin started with native mention injection");
    },

    stop() {
        pluginStarted = false;
        unpatchStores();
        if (FluxDispatcher) {
            unpatchDispatcher(FluxDispatcher);
        }
        unreadCustomMentions.clear();
        notifyStores();
        console.info("[CustomNamePings] Plugin stopped");
    }
});

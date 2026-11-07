import type { pl } from "./pl";

export type Plural = { one: string; few: string; many: string; other: string };
export type Message = string | Plural;
export type MessageKey = keyof typeof pl;
/** Every language provides every key; plural keys stay plural. */
export type Dictionary = { [K in MessageKey]: (typeof pl)[K] extends string ? string : Plural };
export type Lang = "pl" | "en" | "uk";

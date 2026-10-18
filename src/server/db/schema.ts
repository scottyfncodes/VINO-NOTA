import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Authentication (Better Auth core tables)                                   */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* -------------------------------------------------------------------------- */
/* Enumerations                                                               */
/* -------------------------------------------------------------------------- */

export const wineTypeEnum = pgEnum("wine_type", [
  "red",
  "white",
  "rose",
  "sparkling",
  "orange",
  "dessert",
  "fortified",
  "other",
]);

/** Where a value came from. `user` = entered or confirmed by the user. */
export const sourceEnum = pgEnum("value_source", ["user", "provider", "inferred"]);

export const imageTypeEnum = pgEnum("image_type", ["front_label", "back_label", "bottle", "other"]);

export const blindStatusEnum = pgEnum("blind_status", ["not_blind", "blind_unrevealed", "blind_revealed"]);

export const priceBasisEnum = pgEnum("price_basis", ["retail_bottle", "restaurant_bottle", "glass"]);

/**
 * Status of a sensory observation. "Not assessed" is represented by the
 * absence of an observation row, so it can never be confused with a value.
 */
export const observationStatusEnum = pgEnum("observation_status", [
  "assessed",
  "unknown",
  "absent",
  "not_applicable",
]);

export const regionLevelEnum = pgEnum("region_level", ["region", "subregion"]);

/* -------------------------------------------------------------------------- */
/* Preferences                                                                */
/* -------------------------------------------------------------------------- */

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    defaultCurrency: text("default_currency").notNull().default("USD"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("user_preferences_currency_chk", sql`${t.defaultCurrency} ~ '^[A-Z]{3}$'`)],
);

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                  */
/* -------------------------------------------------------------------------- */

export const producer = pgTable(
  "producer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    externalIds: jsonb("external_ids").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("producer_owner_name_uq").on(t.ownerId, t.normalizedName),
    check("producer_name_chk", sql`length(trim(${t.name})) > 0`),
  ],
);

export const region = pgTable(
  "region",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    /** ISO 3166-1 alpha-2 country code. */
    country: text("country").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => region.id, { onDelete: "set null" }),
    level: regionLevelEnum("level").notNull().default("region"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    /** Who supplied the geographic data; coordinates are never inferred. */
    coordinateSource: text("coordinate_source"),
    source: sourceEnum("source").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("region_owner_country_parent_name_uq")
      .on(t.ownerId, t.country, t.parentId, t.normalizedName)
      .nullsNotDistinct(),
    index("region_owner_idx").on(t.ownerId),
    check("region_country_chk", sql`${t.country} ~ '^[A-Z]{2}$'`),
    check(
      "region_coordinates_chk",
      sql`(${t.latitude} IS NULL AND ${t.longitude} IS NULL) OR (${t.latitude} BETWEEN -90 AND 90 AND ${t.longitude} BETWEEN -180 AND 180 AND ${t.coordinateSource} IS NOT NULL)`,
    ),
  ],
);

export type FieldProvenance = {
  source: "user" | "provider" | "inferred";
  provider?: string;
  confidence?: number;
  /** ISO timestamp of the user's confirmation of a provider-supplied value. */
  confirmedAt?: string;
};

export const wine = pgTable(
  "wine",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    producerId: uuid("producer_id").references(() => producer.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    vintage: smallint("vintage"),
    /** Explicitly non-vintage — distinct from an unknown vintage (vintage null, isNonVintage false). */
    isNonVintage: boolean("is_non_vintage").notNull().default(false),
    wineType: wineTypeEnum("wine_type").notNull(),
    country: text("country"),
    regionId: uuid("region_id").references(() => region.id, { onDelete: "set null" }),
    appellation: text("appellation"),
    alcoholPct: numeric("alcohol_pct", { precision: 4, scale: 2 }),
    externalIds: jsonb("external_ids").$type<Record<string, string>>(),
    fieldProvenance: jsonb("field_provenance").$type<Record<string, FieldProvenance>>().notNull().default({}),
    /** producer|name|vintage normalised key used for duplicate detection. */
    identityKey: text("identity_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wine_owner_idx").on(t.ownerId),
    index("wine_owner_identity_idx").on(t.ownerId, t.identityKey),
    index("wine_producer_idx").on(t.producerId),
    index("wine_region_idx").on(t.regionId),
    check("wine_name_chk", sql`length(trim(${t.name})) > 0`),
    check("wine_vintage_chk", sql`${t.vintage} IS NULL OR ${t.vintage} BETWEEN 1800 AND 2100`),
    check("wine_nv_chk", sql`NOT (${t.isNonVintage} AND ${t.vintage} IS NOT NULL)`),
    check("wine_alcohol_chk", sql`${t.alcoholPct} IS NULL OR ${t.alcoholPct} BETWEEN 0 AND 25`),
    check("wine_country_chk", sql`${t.country} IS NULL OR ${t.country} ~ '^[A-Z]{2}$'`),
  ],
);

export const wineGrape = pgTable(
  "wine_grape",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wineId: uuid("wine_id")
      .notNull()
      .references(() => wine.id, { onDelete: "cascade" }),
    grape: text("grape").notNull(),
    normalizedGrape: text("normalized_grape").notNull(),
    /** Share of the blend, when known. */
    percentage: numeric("percentage", { precision: 5, scale: 2 }),
    position: smallint("position").notNull().default(0),
    source: sourceEnum("source").notNull().default("user"),
  },
  (t) => [
    unique("wine_grape_uq").on(t.wineId, t.normalizedGrape),
    index("wine_grape_grape_idx").on(t.normalizedGrape),
    check("wine_grape_pct_chk", sql`${t.percentage} IS NULL OR (${t.percentage} > 0 AND ${t.percentage} <= 100)`),
  ],
);

export const wineImage = pgTable(
  "wine_image",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Null while an upload is pending attachment during capture. */
    wineId: uuid("wine_id").references(() => wine.id, { onDelete: "cascade" }),
    imageType: imageTypeEnum("image_type").notNull().default("front_label"),
    originalKey: text("original_key").notNull(),
    displayKey: text("display_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    source: text("source").notNull().default("user_upload"),
    attribution: text("attribution"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wine_image_wine_idx").on(t.wineId), index("wine_image_owner_idx").on(t.ownerId)],
);

/** Raw output of a recognition or metadata provider, kept for provenance. */
export const metadataSourceRecord = pgTable(
  "metadata_source_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    wineId: uuid("wine_id").references(() => wine.id, { onDelete: "cascade" }),
    imageId: uuid("image_id").references(() => wineImage.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    extractedText: text("extracted_text"),
    candidate: jsonb("candidate"),
    confidence: doublePrecision("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("metadata_source_wine_idx").on(t.wineId), index("metadata_source_owner_idx").on(t.ownerId)],
);

/* -------------------------------------------------------------------------- */
/* Tastings                                                                   */
/* -------------------------------------------------------------------------- */

export const tasting = pgTable(
  "tasting",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    wineId: uuid("wine_id")
      .notNull()
      .references(() => wine.id, { onDelete: "cascade" }),
    /** Calendar date of the tasting as experienced by the user (no time zone shift). */
    tastedOn: date("tasted_on", { mode: "string" }).notNull(),
    personalScore: numeric("personal_score", { precision: 3, scale: 1 }),
    purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
    currency: text("currency"),
    priceBasis: priceBasisEnum("price_basis"),
    venue: text("venue"),
    occasion: text("occasion"),
    foodPairing: text("food_pairing"),
    wouldBuyAgain: boolean("would_buy_again"),
    blindStatus: blindStatusEnum("blind_status").notNull().default("not_blind"),
    blindGuess: text("blind_guess"),
    impression: text("impression"),
    notes: text("notes"),
    servingTempC: numeric("serving_temp_c", { precision: 4, scale: 1 }),
    decantMinutes: integer("decant_minutes"),
    bottleProvenance: text("bottle_provenance"),
    storageNotes: text("storage_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasting_owner_date_idx").on(t.ownerId, t.tastedOn),
    index("tasting_wine_idx").on(t.wineId),
    check("tasting_score_chk", sql`${t.personalScore} IS NULL OR ${t.personalScore} BETWEEN 0 AND 10`),
    check("tasting_price_chk", sql`${t.purchasePrice} IS NULL OR ${t.purchasePrice} >= 0`),
    check("tasting_currency_chk", sql`${t.currency} IS NULL OR ${t.currency} ~ '^[A-Z]{3}$'`),
    check("tasting_price_currency_chk", sql`${t.purchasePrice} IS NULL OR ${t.currency} IS NOT NULL`),
    check("tasting_decant_chk", sql`${t.decantMinutes} IS NULL OR ${t.decantMinutes} BETWEEN 0 AND 2880`),
    check("tasting_temp_chk", sql`${t.servingTempC} IS NULL OR ${t.servingTempC} BETWEEN -5 AND 40`),
  ],
);

export const sensoryObservation = pgTable(
  "sensory_observation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tastingId: uuid("tasting_id")
      .notNull()
      .references(() => tasting.id, { onDelete: "cascade" }),
    /** e.g. body, acidity, sweetness, tannin, finish, aroma, flavor, clarity. */
    dimension: text("dimension").notNull(),
    status: observationStatusEnum("status").notNull().default("assessed"),
    /** Ordinal 1–5 measurement for structural dimensions. */
    value: smallint("value"),
    /** Structured descriptor (aroma/flavor) or categorical value (e.g. colour). */
    descriptor: text("descriptor"),
    /** primary / secondary / tertiary for aroma descriptors. */
    category: text("category"),
    intensity: smallint("intensity"),
    source: sourceEnum("source").notNull().default("user"),
    confidence: doublePrecision("confidence"),
  },
  (t) => [
    index("sensory_tasting_idx").on(t.tastingId),
    index("sensory_dimension_idx").on(t.dimension),
    check("sensory_value_chk", sql`${t.value} IS NULL OR ${t.value} BETWEEN 1 AND 5`),
    check("sensory_intensity_chk", sql`${t.intensity} IS NULL OR ${t.intensity} BETWEEN 1 AND 5`),
    check("sensory_assessed_chk", sql`${t.status} <> 'assessed' OR ${t.value} IS NOT NULL OR ${t.descriptor} IS NOT NULL`),
    check("sensory_unassessed_chk", sql`${t.status} = 'assessed' OR (${t.value} IS NULL AND ${t.descriptor} IS NULL)`),
    check("sensory_confidence_chk", sql`${t.confidence} IS NULL OR ${t.confidence} BETWEEN 0 AND 1`),
  ],
);

export const tastingTag = pgTable(
  "tasting_tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tastingId: uuid("tasting_id")
      .notNull()
      .references(() => tasting.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => [unique("tasting_tag_uq").on(t.tastingId, t.tag), index("tasting_tag_tag_idx").on(t.tag)],
);

/* -------------------------------------------------------------------------- */
/* Operational                                                                */
/* -------------------------------------------------------------------------- */

/** Fixed-window counters for expensive provider operations. */
export const providerUsage = pgTable(
  "provider_usage",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

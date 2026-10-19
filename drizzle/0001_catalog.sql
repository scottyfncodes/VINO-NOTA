CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."catalog_entity" AS ENUM('producer', 'region', 'grape', 'wine');--> statement-breakpoint
CREATE TYPE "public"."catalog_region_kind" AS ENUM('region', 'subregion', 'appellation');--> statement-breakpoint
CREATE TYPE "public"."catalog_contribution_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "catalog_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" "catalog_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "catalog_alias_uq" UNIQUE("entity","entity_id","normalized_alias")
);
--> statement-breakpoint
CREATE TABLE "catalog_contribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"identity_key" text NOT NULL,
	"fields" jsonb NOT NULL,
	"field_origins" jsonb NOT NULL,
	"matched_wine_id" uuid,
	"status" "catalog_contribution_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_contribution_user_identity_uq" UNIQUE("user_id","identity_key")
);
--> statement-breakpoint
CREATE TABLE "catalog_grape" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_grape_source_uq" UNIQUE("source_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_producer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"country" text,
	"region_id" uuid,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_producer_source_uq" UNIQUE("source_id","external_id"),
	CONSTRAINT "catalog_producer_country_chk" CHECK ("catalog_producer"."country" IS NULL OR "catalog_producer"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "catalog_producer_confidence_chk" CHECK ("catalog_producer"."confidence" >= 0 AND "catalog_producer"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "catalog_product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"barcode" text,
	"wine_id" uuid,
	"producer_name" text,
	"product_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"vintage" smallint,
	"is_non_vintage" boolean DEFAULT false NOT NULL,
	"volume_ml" integer,
	"alcohol_pct" numeric(4, 2),
	"country" text,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_product_source_uq" UNIQUE("source_id","external_id"),
	CONSTRAINT "catalog_product_barcode_chk" CHECK ("catalog_product"."barcode" IS NULL OR "catalog_product"."barcode" ~ '^[0-9]{8,14}$'),
	CONSTRAINT "catalog_product_vintage_chk" CHECK ("catalog_product"."vintage" IS NULL OR "catalog_product"."vintage" BETWEEN 1800 AND 2100),
	CONSTRAINT "catalog_product_nv_chk" CHECK (NOT ("catalog_product"."is_non_vintage" AND "catalog_product"."vintage" IS NOT NULL)),
	CONSTRAINT "catalog_product_alcohol_chk" CHECK ("catalog_product"."alcohol_pct" IS NULL OR "catalog_product"."alcohol_pct" BETWEEN 0 AND 25)
);
--> statement-breakpoint
CREATE TABLE "catalog_region" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" "catalog_region_kind" NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"country" text,
	"parent_id" uuid,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_region_source_uq" UNIQUE("source_id","external_id"),
	CONSTRAINT "catalog_region_country_chk" CHECK ("catalog_region"."country" IS NULL OR "catalog_region"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "catalog_region_confidence_chk" CHECK ("catalog_region"."confidence" >= 0 AND "catalog_region"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "catalog_source" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"license" text NOT NULL,
	"attribution" text,
	"approved_for_lookup" boolean DEFAULT false NOT NULL,
	"retrieved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalog_wine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"external_id" text NOT NULL,
	"producer_id" uuid,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"wine_type" "wine_type",
	"region_id" uuid,
	"country" text,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_wine_source_uq" UNIQUE("source_id","external_id"),
	CONSTRAINT "catalog_wine_country_chk" CHECK ("catalog_wine"."country" IS NULL OR "catalog_wine"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "catalog_wine_confidence_chk" CHECK ("catalog_wine"."confidence" >= 0 AND "catalog_wine"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "catalog_wine_grape" (
	"wine_id" uuid NOT NULL,
	"grape_id" uuid NOT NULL,
	"percentage" numeric(5, 2),
	CONSTRAINT "catalog_wine_grape_wine_id_grape_id_pk" PRIMARY KEY("wine_id","grape_id"),
	CONSTRAINT "catalog_wine_grape_pct_chk" CHECK ("catalog_wine_grape"."percentage" IS NULL OR ("catalog_wine_grape"."percentage" > 0 AND "catalog_wine_grape"."percentage" <= 100))
);
--> statement-breakpoint
ALTER TABLE "catalog_alias" ADD CONSTRAINT "catalog_alias_source_id_catalog_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_contribution" ADD CONSTRAINT "catalog_contribution_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_contribution" ADD CONSTRAINT "catalog_contribution_matched_wine_id_catalog_wine_id_fk" FOREIGN KEY ("matched_wine_id") REFERENCES "public"."catalog_wine"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_grape" ADD CONSTRAINT "catalog_grape_source_id_catalog_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_producer" ADD CONSTRAINT "catalog_producer_source_id_catalog_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_producer" ADD CONSTRAINT "catalog_producer_region_id_catalog_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."catalog_region"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_product" ADD CONSTRAINT "catalog_product_source_id_catalog_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_product" ADD CONSTRAINT "catalog_product_wine_id_catalog_wine_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."catalog_wine"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_region" ADD CONSTRAINT "catalog_region_source_id_catalog_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_region" ADD CONSTRAINT "catalog_region_parent_id_catalog_region_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."catalog_region"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_wine" ADD CONSTRAINT "catalog_wine_source_id_catalog_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."catalog_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_wine" ADD CONSTRAINT "catalog_wine_producer_id_catalog_producer_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."catalog_producer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_wine" ADD CONSTRAINT "catalog_wine_region_id_catalog_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."catalog_region"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_wine_grape" ADD CONSTRAINT "catalog_wine_grape_wine_id_catalog_wine_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."catalog_wine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_wine_grape" ADD CONSTRAINT "catalog_wine_grape_grape_id_catalog_grape_id_fk" FOREIGN KEY ("grape_id") REFERENCES "public"."catalog_grape"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_alias_lookup_idx" ON "catalog_alias" USING btree ("entity","normalized_alias");--> statement-breakpoint
CREATE INDEX "catalog_alias_trgm_idx" ON "catalog_alias" USING gin ("normalized_alias" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "catalog_contribution_identity_idx" ON "catalog_contribution" USING btree ("identity_key","status");--> statement-breakpoint
CREATE INDEX "catalog_grape_name_idx" ON "catalog_grape" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "catalog_producer_name_idx" ON "catalog_producer" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "catalog_producer_name_trgm_idx" ON "catalog_producer" USING gin ("normalized_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "catalog_product_barcode_idx" ON "catalog_product" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "catalog_region_name_idx" ON "catalog_region" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "catalog_region_name_trgm_idx" ON "catalog_region" USING gin ("normalized_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "catalog_wine_producer_idx" ON "catalog_wine" USING btree ("producer_id");--> statement-breakpoint
CREATE INDEX "catalog_wine_name_trgm_idx" ON "catalog_wine" USING gin ("normalized_name" gin_trgm_ops);
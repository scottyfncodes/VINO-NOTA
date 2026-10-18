CREATE TYPE "public"."blind_status" AS ENUM('not_blind', 'blind_unrevealed', 'blind_revealed');--> statement-breakpoint
CREATE TYPE "public"."image_type" AS ENUM('front_label', 'back_label', 'bottle', 'other');--> statement-breakpoint
CREATE TYPE "public"."observation_status" AS ENUM('assessed', 'unknown', 'absent', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."price_basis" AS ENUM('retail_bottle', 'restaurant_bottle', 'glass');--> statement-breakpoint
CREATE TYPE "public"."region_level" AS ENUM('region', 'subregion');--> statement-breakpoint
CREATE TYPE "public"."value_source" AS ENUM('user', 'provider', 'inferred');--> statement-breakpoint
CREATE TYPE "public"."wine_type" AS ENUM('red', 'white', 'rose', 'sparkling', 'orange', 'dessert', 'fortified', 'other');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metadata_source_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"wine_id" uuid,
	"image_id" uuid,
	"provider" text NOT NULL,
	"extracted_text" text,
	"candidate" jsonb,
	"confidence" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "producer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"external_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "producer_owner_name_uq" UNIQUE("owner_id","normalized_name"),
	CONSTRAINT "producer_name_chk" CHECK (length(trim("producer"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "provider_usage" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "provider_usage_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "region" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"country" text NOT NULL,
	"parent_id" uuid,
	"level" "region_level" DEFAULT 'region' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"coordinate_source" text,
	"source" "value_source" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "region_owner_country_parent_name_uq" UNIQUE NULLS NOT DISTINCT("owner_id","country","parent_id","normalized_name"),
	CONSTRAINT "region_country_chk" CHECK ("region"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "region_coordinates_chk" CHECK (("region"."latitude" IS NULL AND "region"."longitude" IS NULL) OR ("region"."latitude" BETWEEN -90 AND 90 AND "region"."longitude" BETWEEN -180 AND 180 AND "region"."coordinate_source" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "sensory_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tasting_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"status" "observation_status" DEFAULT 'assessed' NOT NULL,
	"value" smallint,
	"descriptor" text,
	"category" text,
	"intensity" smallint,
	"source" "value_source" DEFAULT 'user' NOT NULL,
	"confidence" double precision,
	CONSTRAINT "sensory_value_chk" CHECK ("sensory_observation"."value" IS NULL OR "sensory_observation"."value" BETWEEN 1 AND 5),
	CONSTRAINT "sensory_intensity_chk" CHECK ("sensory_observation"."intensity" IS NULL OR "sensory_observation"."intensity" BETWEEN 1 AND 5),
	CONSTRAINT "sensory_assessed_chk" CHECK ("sensory_observation"."status" <> 'assessed' OR "sensory_observation"."value" IS NOT NULL OR "sensory_observation"."descriptor" IS NOT NULL),
	CONSTRAINT "sensory_unassessed_chk" CHECK ("sensory_observation"."status" = 'assessed' OR ("sensory_observation"."value" IS NULL AND "sensory_observation"."descriptor" IS NULL)),
	CONSTRAINT "sensory_confidence_chk" CHECK ("sensory_observation"."confidence" IS NULL OR "sensory_observation"."confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tasting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"wine_id" uuid NOT NULL,
	"tasted_on" date NOT NULL,
	"personal_score" numeric(3, 1),
	"purchase_price" numeric(12, 2),
	"currency" text,
	"price_basis" "price_basis",
	"venue" text,
	"occasion" text,
	"food_pairing" text,
	"would_buy_again" boolean,
	"blind_status" "blind_status" DEFAULT 'not_blind' NOT NULL,
	"blind_guess" text,
	"impression" text,
	"notes" text,
	"serving_temp_c" numeric(4, 1),
	"decant_minutes" integer,
	"bottle_provenance" text,
	"storage_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasting_score_chk" CHECK ("tasting"."personal_score" IS NULL OR "tasting"."personal_score" BETWEEN 0 AND 10),
	CONSTRAINT "tasting_price_chk" CHECK ("tasting"."purchase_price" IS NULL OR "tasting"."purchase_price" >= 0),
	CONSTRAINT "tasting_currency_chk" CHECK ("tasting"."currency" IS NULL OR "tasting"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "tasting_price_currency_chk" CHECK ("tasting"."purchase_price" IS NULL OR "tasting"."currency" IS NOT NULL),
	CONSTRAINT "tasting_decant_chk" CHECK ("tasting"."decant_minutes" IS NULL OR "tasting"."decant_minutes" BETWEEN 0 AND 2880),
	CONSTRAINT "tasting_temp_chk" CHECK ("tasting"."serving_temp_c" IS NULL OR "tasting"."serving_temp_c" BETWEEN -5 AND 40)
);
--> statement-breakpoint
CREATE TABLE "tasting_tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tasting_id" uuid NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "tasting_tag_uq" UNIQUE("tasting_id","tag")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_currency_chk" CHECK ("user_preferences"."default_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"producer_id" uuid,
	"name" text NOT NULL,
	"vintage" smallint,
	"is_non_vintage" boolean DEFAULT false NOT NULL,
	"wine_type" "wine_type" NOT NULL,
	"country" text,
	"region_id" uuid,
	"appellation" text,
	"alcohol_pct" numeric(4, 2),
	"external_ids" jsonb,
	"field_provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"identity_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wine_name_chk" CHECK (length(trim("wine"."name")) > 0),
	CONSTRAINT "wine_vintage_chk" CHECK ("wine"."vintage" IS NULL OR "wine"."vintage" BETWEEN 1800 AND 2100),
	CONSTRAINT "wine_nv_chk" CHECK (NOT ("wine"."is_non_vintage" AND "wine"."vintage" IS NOT NULL)),
	CONSTRAINT "wine_alcohol_chk" CHECK ("wine"."alcohol_pct" IS NULL OR "wine"."alcohol_pct" BETWEEN 0 AND 25),
	CONSTRAINT "wine_country_chk" CHECK ("wine"."country" IS NULL OR "wine"."country" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "wine_grape" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wine_id" uuid NOT NULL,
	"grape" text NOT NULL,
	"normalized_grape" text NOT NULL,
	"percentage" numeric(5, 2),
	"position" smallint DEFAULT 0 NOT NULL,
	"source" "value_source" DEFAULT 'user' NOT NULL,
	CONSTRAINT "wine_grape_uq" UNIQUE("wine_id","normalized_grape"),
	CONSTRAINT "wine_grape_pct_chk" CHECK ("wine_grape"."percentage" IS NULL OR ("wine_grape"."percentage" > 0 AND "wine_grape"."percentage" <= 100))
);
--> statement-breakpoint
CREATE TABLE "wine_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"wine_id" uuid,
	"image_type" "image_type" DEFAULT 'front_label' NOT NULL,
	"original_key" text NOT NULL,
	"display_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"source" text DEFAULT 'user_upload' NOT NULL,
	"attribution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_source_record" ADD CONSTRAINT "metadata_source_record_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_source_record" ADD CONSTRAINT "metadata_source_record_wine_id_wine_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metadata_source_record" ADD CONSTRAINT "metadata_source_record_image_id_wine_image_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."wine_image"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer" ADD CONSTRAINT "producer_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region" ADD CONSTRAINT "region_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region" ADD CONSTRAINT "region_parent_id_region_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."region"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensory_observation" ADD CONSTRAINT "sensory_observation_tasting_id_tasting_id_fk" FOREIGN KEY ("tasting_id") REFERENCES "public"."tasting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting" ADD CONSTRAINT "tasting_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting" ADD CONSTRAINT "tasting_wine_id_wine_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasting_tag" ADD CONSTRAINT "tasting_tag_tasting_id_tasting_id_fk" FOREIGN KEY ("tasting_id") REFERENCES "public"."tasting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine" ADD CONSTRAINT "wine_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine" ADD CONSTRAINT "wine_producer_id_producer_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."producer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine" ADD CONSTRAINT "wine_region_id_region_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."region"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_grape" ADD CONSTRAINT "wine_grape_wine_id_wine_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_image" ADD CONSTRAINT "wine_image_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wine_image" ADD CONSTRAINT "wine_image_wine_id_wine_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wine"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "metadata_source_wine_idx" ON "metadata_source_record" USING btree ("wine_id");--> statement-breakpoint
CREATE INDEX "metadata_source_owner_idx" ON "metadata_source_record" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "region_owner_idx" ON "region" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "sensory_tasting_idx" ON "sensory_observation" USING btree ("tasting_id");--> statement-breakpoint
CREATE INDEX "sensory_dimension_idx" ON "sensory_observation" USING btree ("dimension");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasting_owner_date_idx" ON "tasting" USING btree ("owner_id","tasted_on");--> statement-breakpoint
CREATE INDEX "tasting_wine_idx" ON "tasting" USING btree ("wine_id");--> statement-breakpoint
CREATE INDEX "tasting_tag_tag_idx" ON "tasting_tag" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "wine_owner_idx" ON "wine" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "wine_owner_identity_idx" ON "wine" USING btree ("owner_id","identity_key");--> statement-breakpoint
CREATE INDEX "wine_producer_idx" ON "wine" USING btree ("producer_id");--> statement-breakpoint
CREATE INDEX "wine_region_idx" ON "wine" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "wine_grape_grape_idx" ON "wine_grape" USING btree ("normalized_grape");--> statement-breakpoint
CREATE INDEX "wine_image_wine_idx" ON "wine_image" USING btree ("wine_id");--> statement-breakpoint
CREATE INDEX "wine_image_owner_idx" ON "wine_image" USING btree ("owner_id");
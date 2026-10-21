CREATE TABLE "alert_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rule_id" bigint,
	"event_id" bigint,
	"status" text NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_distribution_snap" (
	"as_of_date" date NOT NULL,
	"protocol" text NOT NULL,
	"capital_usd" double precision NOT NULL,
	"share" double precision NOT NULL,
	"total_aum_usd" double precision NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "capital_distribution_snap_as_of_date_protocol_pk" PRIMARY KEY("as_of_date","protocol")
);
--> statement-breakpoint
CREATE TABLE "chain_snap" (
	"ts" timestamp with time zone PRIMARY KEY NOT NULL,
	"supply" double precision,
	"holders" integer,
	"top_holders" jsonb,
	"custody_balances" jsonb
);
--> statement-breakpoint
CREATE TABLE "collateral_assets_snap" (
	"ts" timestamp with time zone NOT NULL,
	"row_index" integer NOT NULL,
	"asset" text NOT NULL,
	"amount_usd" double precision NOT NULL,
	"allocation" double precision,
	"apy" double precision,
	"liquidity_layer" boolean NOT NULL,
	"proofs" jsonb NOT NULL,
	CONSTRAINT "collateral_assets_snap_ts_row_index_pk" PRIMARY KEY("ts","row_index")
);
--> statement-breakpoint
CREATE TABLE "collateral_snapshots" (
	"ts" timestamp with time zone PRIMARY KEY NOT NULL,
	"sheet_snapshot_date" date NOT NULL,
	"total_usd" double precision,
	"aum_usd" double precision,
	"metadata" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "defi_opportunities_snap" (
	"ts" timestamp with time zone NOT NULL,
	"opp_key" text NOT NULL,
	"classification" text NOT NULL,
	"protocol" text NOT NULL,
	"strategy" text NOT NULL,
	"activity" text NOT NULL,
	"assets" jsonb NOT NULL,
	"apy" double precision,
	"tvl" double precision,
	"reward" double precision,
	"link" text NOT NULL,
	"flags" jsonb NOT NULL,
	CONSTRAINT "defi_opportunities_snap_ts_opp_key_pk" PRIMARY KEY("ts","opp_key")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"data" jsonb,
	"dedup_key" text
);
--> statement-breakpoint
CREATE TABLE "leaderboard_crawls" (
	"date" date PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"total_elements" integer,
	"wallets_stored" integer DEFAULT 0 NOT NULL,
	"page_size" integer NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "leaderboard_snap" (
	"date" date NOT NULL,
	"address" text NOT NULL,
	"rank" integer NOT NULL,
	"total_points" double precision NOT NULL,
	"rank_change" integer,
	"global_multiplier" double precision,
	"breakdown" jsonb,
	CONSTRAINT "leaderboard_snap_date_address_pk" PRIMARY KEY("date","address")
);
--> statement-breakpoint
CREATE TABLE "leaderboard_top_snap" (
	"ts" timestamp with time zone NOT NULL,
	"rank" integer NOT NULL,
	"address" text NOT NULL,
	"total_points" double precision NOT NULL,
	"rank_change" integer,
	CONSTRAINT "leaderboard_top_snap_ts_rank_pk" PRIMARY KEY("ts","rank")
);
--> statement-breakpoint
CREATE TABLE "leaderboard_venue_daily" (
	"date" date NOT NULL,
	"venue" text NOT NULL,
	"points" double precision NOT NULL,
	CONSTRAINT "leaderboard_venue_daily_date_venue_pk" PRIMARY KEY("date","venue")
);
--> statement-breakpoint
CREATE TABLE "live_ticks" (
	"ts" timestamp with time zone PRIMARY KEY NOT NULL,
	"nav" double precision,
	"apy" double precision,
	"tvl" double precision,
	"market_price" double precision,
	"premium_bps" double precision
);
--> statement-breakpoint
CREATE TABLE "llama_pools_snap" (
	"ts" timestamp with time zone NOT NULL,
	"pool" text NOT NULL,
	"project" text NOT NULL,
	"chain" text NOT NULL,
	"symbol" text NOT NULL,
	"apy" double precision,
	"apy_base" double precision,
	"tvl" double precision NOT NULL,
	CONSTRAINT "llama_pools_snap_ts_pool_pk" PRIMARY KEY("ts","pool")
);
--> statement-breakpoint
CREATE TABLE "llama_tvl_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"tvl" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_pools_snap" (
	"ts" timestamp with time zone NOT NULL,
	"pool" text NOT NULL,
	"name" text NOT NULL,
	"dex" text NOT NULL,
	"price_usd" double precision,
	"liquidity_usd" double precision,
	"volume_24h" double precision,
	"price_change_24h_pct" double precision,
	CONSTRAINT "market_pools_snap_ts_pool_pk" PRIMARY KEY("ts","pool")
);
--> statement-breakpoint
CREATE TABLE "mint_offers" (
	"address" text PRIMARY KEY NOT NULL,
	"token_in_mint" text NOT NULL,
	"token_out_mint" text NOT NULL,
	"price" double precision NOT NULL,
	"apy" double precision NOT NULL,
	"active_now" boolean NOT NULL,
	"allow_permissionless" boolean NOT NULL,
	"fee_basis_points" double precision NOT NULL,
	"disabled" boolean NOT NULL,
	"valid_from" timestamp with time zone,
	"first_seen" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nav_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"nav" double precision NOT NULL,
	"aum" double precision,
	"circulating_supply" double precision,
	"apy_reported" double precision,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nav_sheet_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"nav" double precision NOT NULL,
	"aum" double precision,
	"apy" double precision,
	"circulating_supply" double precision,
	"changed" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_growth_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"base" double precision NOT NULL,
	"referral" double precision NOT NULL,
	"total" double precision NOT NULL,
	"daily_base" double precision NOT NULL,
	"daily_referral" double precision NOT NULL,
	"daily_total" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_vectors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"offer" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"base_time" timestamp with time zone NOT NULL,
	"base_price" bigint NOT NULL,
	"apr" integer NOT NULL,
	"price_fix_duration" integer NOT NULL,
	"state" text NOT NULL,
	"first_seen" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protocol_aum_daily" (
	"date" date NOT NULL,
	"protocol" text NOT NULL,
	"aum_usd" double precision NOT NULL,
	"delta_usd" double precision,
	"delta_pct" double precision,
	CONSTRAINT "protocol_aum_daily_date_protocol_pk" PRIMARY KEY("date","protocol")
);
--> statement-breakpoint
CREATE TABLE "raw_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"endpoint" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"seen_count" integer DEFAULT 1 NOT NULL,
	"status" integer NOT NULL,
	"payload" jsonb,
	"payload_text" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_snap" (
	"as_of_date" date PRIMARY KEY NOT NULL,
	"nav_usd" double precision NOT NULL,
	"circulating_onyc" double precision NOT NULL,
	"circulating_usd" double precision NOT NULL,
	"known_custody_usd" double precision NOT NULL,
	"adjusted_wallet_usd" double precision NOT NULL,
	"attributed_protocol_usd" double precision NOT NULL,
	"unexplained_usd" double precision NOT NULL,
	"entries" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redemption_offers_snap" (
	"ts" timestamp with time zone NOT NULL,
	"offer" text NOT NULL,
	"redemption_offer" text NOT NULL,
	"token_out_mint" text NOT NULL,
	"executed" double precision NOT NULL,
	"requested" double precision NOT NULL,
	"fee_bps" double precision NOT NULL,
	"prop_amm_fee_bps" double precision NOT NULL,
	"vault_target" double precision NOT NULL,
	"disabled" boolean NOT NULL,
	CONSTRAINT "redemption_offers_snap_ts_offer_pk" PRIMARY KEY("ts","offer")
);
--> statement-breakpoint
CREATE TABLE "redemption_requests" (
	"request_pda" text PRIMARY KEY NOT NULL,
	"request_number" text NOT NULL,
	"redeemer" text NOT NULL,
	"offer_pda" text NOT NULL,
	"status" text NOT NULL,
	"requested_at" timestamp with time zone,
	"redemption_time" timestamp with time zone,
	"amount" double precision NOT NULL,
	"fulfilled_amount" double precision NOT NULL,
	"token_in_mint" text NOT NULL,
	"token_out_mint" text NOT NULL,
	"submission_tx" text,
	"fulfillment_txs" jsonb NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redemption_settings_snap" (
	"ts" timestamp with time zone PRIMARY KEY NOT NULL,
	"allow_partial" boolean NOT NULL,
	"cool_down" integer NOT NULL,
	"growth_rate" double precision NOT NULL,
	"initial_capacity" double precision NOT NULL,
	"max_capacity" double precision NOT NULL,
	"max_share_per_request" double precision NOT NULL,
	"start_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reinsurance_layers" (
	"layer_id" text PRIMARY KEY NOT NULL,
	"ui_layer_number" text NOT NULL,
	"status" text NOT NULL,
	"inception" date NOT NULL,
	"renewal" date NOT NULL,
	"perils" text NOT NULL,
	"structure" text NOT NULL,
	"capital" double precision NOT NULL,
	"premium" double precision NOT NULL,
	"expected_loss" double precision NOT NULL,
	"expected_yield" double precision NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reinsurance_layers_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"layer_id" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"inception" date NOT NULL,
	"renewal" date NOT NULL,
	"perils" text NOT NULL,
	"structure" text NOT NULL,
	"capital" double precision NOT NULL,
	"premium" double precision NOT NULL,
	"expected_loss" double precision NOT NULL,
	"expected_yield" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings_snap" (
	"ts" timestamp with time zone PRIMARY KEY NOT NULL,
	"onyc_apy" double precision NOT NULL,
	"susde_apy_pct" double precision NOT NULL,
	"tvl_value" double precision NOT NULL,
	"onyc_supply" double precision,
	"token_supplies" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solvency_snap" (
	"ts" timestamp with time zone PRIMARY KEY NOT NULL,
	"collateralization" double precision NOT NULL,
	"reserves_usd" double precision NOT NULL,
	"supply_usd" double precision NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"merkle_root" text NOT NULL,
	"venues" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_health" (
	"source" text NOT NULL,
	"endpoint" text NOT NULL,
	"status" text NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"last_error_kind" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_latency_ms" integer,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_health_source_endpoint_pk" PRIMARY KEY("source","endpoint")
);
--> statement-breakpoint
CREATE TABLE "wallet_points_cache" (
	"address" text PRIMARY KEY NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_deliveries_rule_event_idx" ON "alert_deliveries" USING btree ("rule_id","event_id");--> statement-breakpoint
CREATE INDEX "defi_opp_key_idx" ON "defi_opportunities_snap" USING btree ("opp_key","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "events_dedup_key_idx" ON "events" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX "events_kind_ts_idx" ON "events" USING btree ("kind","ts");--> statement-breakpoint
CREATE INDEX "events_ts_idx" ON "events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "leaderboard_snap_date_rank_idx" ON "leaderboard_snap" USING btree ("date","rank");--> statement-breakpoint
CREATE INDEX "leaderboard_snap_address_idx" ON "leaderboard_snap" USING btree ("address","date");--> statement-breakpoint
CREATE UNIQUE INDEX "price_vectors_identity_idx" ON "price_vectors" USING btree ("offer","start_time","base_time","base_price","apr");--> statement-breakpoint
CREATE INDEX "raw_snapshots_source_endpoint_idx" ON "raw_snapshots" USING btree ("source","endpoint","fetched_at");--> statement-breakpoint
CREATE INDEX "redemption_requests_time_idx" ON "redemption_requests" USING btree ("redemption_time");--> statement-breakpoint
CREATE INDEX "reinsurance_history_layer_idx" ON "reinsurance_layers_history" USING btree ("layer_id","ts");
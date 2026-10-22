CREATE TABLE "chain_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"signature" text NOT NULL,
	"kind" text NOT NULL,
	"instruction" text,
	"ts" timestamp with time zone NOT NULL,
	"slot" bigint NOT NULL,
	"signer" text,
	"onyc_supply_delta" double precision,
	"onyc_largest_move" double precision,
	"data" jsonb,
	"seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_holders" (
	"scan_ts" timestamp with time zone NOT NULL,
	"rank" integer NOT NULL,
	"owner" text NOT NULL,
	"amount" double precision NOT NULL,
	"token_accounts" integer NOT NULL,
	"kind" text NOT NULL,
	"protocol" text,
	"label" text,
	"labelled_by" text,
	CONSTRAINT "chain_holders_scan_ts_rank_pk" PRIMARY KEY("scan_ts","rank")
);
--> statement-breakpoint
CREATE TABLE "chain_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"slot" bigint,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chain_events_sig_kind_idx" ON "chain_events" USING btree ("signature","kind");--> statement-breakpoint
CREATE INDEX "chain_events_ts_idx" ON "chain_events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "chain_events_kind_ts_idx" ON "chain_events" USING btree ("kind","ts");--> statement-breakpoint
CREATE INDEX "chain_holders_owner_idx" ON "chain_holders" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "chain_snapshots_kind_ts_idx" ON "chain_snapshots" USING btree ("kind","ts");
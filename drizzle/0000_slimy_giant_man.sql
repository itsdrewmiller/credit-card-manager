CREATE TABLE `benefit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`amount_cents` integer,
	`unit_value` real DEFAULT 1 NOT NULL,
	`period` text,
	`year` integer,
	`use_after` text,
	`use_by` text,
	`used` integer DEFAULT false NOT NULL,
	`confirmed` integer DEFAULT false NOT NULL,
	`is_subscription` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `benefit_card_idx` ON `benefit` (`card_id`);--> statement-breakpoint
CREATE TABLE `business` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`owner_person_id` integer NOT NULL,
	`type` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `card` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_product_id` integer,
	`owner_person_id` integer,
	`business_id` integer,
	`raw_creditor_name` text,
	`raw_account_label` text,
	`network` text,
	`last4` text,
	`statement_day` integer,
	`payment_day` integer,
	`annual_fee_cents` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`responsibility` text,
	`applied_date` text,
	`opened_date` text,
	`closed_date` text,
	`rejected_date` text,
	`rejection_reason` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_product_id`) REFERENCES `card_product`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `card_owner_idx` ON `card` (`owner_person_id`);--> statement-breakpoint
CREATE INDEX `card_product_idx` ON `card` (`card_product_id`);--> statement-breakpoint
CREATE INDEX `card_status_idx` ON `card` (`status`);--> statement-breakpoint
CREATE TABLE `card_product` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issuer_id` integer NOT NULL,
	`name` text NOT NULL,
	`network` text,
	`is_business` integer DEFAULT false NOT NULL,
	`default_annual_fee_cents` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`issuer_id`) REFERENCES `issuer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `card_product_issuer_idx` ON `card_product` (`issuer_id`);--> statement-breakpoint
CREATE TABLE `card_product_alias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_product_id` integer NOT NULL,
	`alias_text` text NOT NULL,
	FOREIGN KEY (`card_product_id`) REFERENCES `card_product`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alias_product_idx` ON `card_product_alias` (`card_product_id`);--> statement-breakpoint
CREATE TABLE `issuer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issuer_name_unique` ON `issuer` (`name`);--> statement-breakpoint
CREATE TABLE `person` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `point_program` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`owner_person_id` integer,
	`kind` text,
	`valuation_cpp` real,
	`balance` integer,
	`balance_updated` text,
	`next_expiration` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `referral` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_person_id` integer NOT NULL,
	`to_person_id` integer,
	`card_product_id` integer,
	`link` text,
	`reward_amount` text,
	`reward_kind` text,
	`date` text,
	`status` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`from_person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`card_product_id`) REFERENCES `card_product`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `signup_bonus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`target_spend_cents` integer,
	`start_date` text,
	`deadline` text,
	`spend_so_far_cents` integer DEFAULT 0 NOT NULL,
	`reward_kind` text,
	`point_program_id` integer,
	`points_amount` integer,
	`cash_amount_cents` integer,
	`referral_bonus` text,
	`received` integer DEFAULT false NOT NULL,
	`amount_used_cents` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`point_program_id`) REFERENCES `point_program`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bonus_card_idx` ON `signup_bonus` (`card_id`);
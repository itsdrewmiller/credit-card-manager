CREATE TABLE `product_benefit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_product_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`amount_cents` integer,
	`period` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_product_id`) REFERENCES `card_product`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_benefit_product_idx` ON `product_benefit` (`card_product_id`);--> statement-breakpoint
CREATE TABLE `product_offer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_product_id` integer NOT NULL,
	`reward_kind` text,
	`point_program_id` integer,
	`points_amount` integer,
	`cash_amount_cents` integer,
	`min_spend_cents` integer,
	`window_months` integer,
	`expires` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_product_id`) REFERENCES `card_product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`point_program_id`) REFERENCES `point_program`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `offer_product_idx` ON `product_offer` (`card_product_id`);--> statement-breakpoint
ALTER TABLE `benefit` DROP COLUMN `unit_value`;
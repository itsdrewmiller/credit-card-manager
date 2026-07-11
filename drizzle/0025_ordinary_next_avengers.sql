CREATE TABLE `card_product_change` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`from_product_id` integer,
	`to_product_id` integer,
	`changed_date` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_product_id`) REFERENCES `card_product`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_product_id`) REFERENCES `card_product`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `card_product_change_card_idx` ON `card_product_change` (`card_id`);
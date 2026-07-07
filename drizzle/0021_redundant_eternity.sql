CREATE TABLE `referral_link` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_product_id` integer NOT NULL,
	`url` text NOT NULL,
	`owner_person_id` integer,
	`owner_business_id` integer,
	`source` text DEFAULT 'user' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_product_id`) REFERENCES `card_product`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_business_id`) REFERENCES `business`(`id`) ON UPDATE no action ON DELETE cascade
);

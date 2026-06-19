CREATE TABLE `issuer_alias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issuer_id` integer NOT NULL,
	`alias_text` text NOT NULL,
	FOREIGN KEY (`issuer_id`) REFERENCES `issuer`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `issuer_alias_issuer_idx` ON `issuer_alias` (`issuer_id`);
CREATE TABLE `spend_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bonus_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`bonus_id`) REFERENCES `signup_bonus`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `spend_entry_bonus_idx` ON `spend_entry` (`bonus_id`);--> statement-breakpoint
ALTER TABLE `benefit` ADD `used_date` text;--> statement-breakpoint
ALTER TABLE `referral` ADD `reward_value_cents` integer;--> statement-breakpoint
ALTER TABLE `signup_bonus` ADD `received_date` text;--> statement-breakpoint
INSERT INTO `spend_entry` (`bonus_id`, `amount_cents`, `date`, `note`)
SELECT `id`, `spend_so_far_cents`,
       COALESCE(`start_date`, date(`created_at` / 1000, 'unixepoch')),
       'opening balance (migrated)'
FROM `signup_bonus` WHERE `spend_so_far_cents` > 0;--> statement-breakpoint
UPDATE `signup_bonus` SET `received_date` = date(`updated_at` / 1000, 'unixepoch')
WHERE `received` = 1 AND `received_date` IS NULL;--> statement-breakpoint
UPDATE `benefit` SET `used_date` = date(`updated_at` / 1000, 'unixepoch')
WHERE `used` = 1 AND `used_date` IS NULL;

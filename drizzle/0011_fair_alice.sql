ALTER TABLE `card_product` ADD `default_cashback_pct` real;--> statement-breakpoint
UPDATE `spend_entry` SET `date` = (
  SELECT date(`sb`.`updated_at` / 1000, 'unixepoch')
  FROM `signup_bonus` `sb` WHERE `sb`.`id` = `spend_entry`.`bonus_id`
)
WHERE `note` = 'opening balance (migrated)';

ALTER TABLE `card_product` ADD `reports_to_personal` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `card_product` SET `reports_to_personal` = 1
WHERE `is_business` = 1 AND `issuer_id` IN (SELECT `id` FROM `issuer` WHERE `name` = 'Capital One');

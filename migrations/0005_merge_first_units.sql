-- Tạp chí Khoa học and Nhà xuất bản are one Đơn vị, not two: "Tạp chí Khoa học & Nhà xuất bản".
-- The seed made two, so this folds the second into the first - its Links, Khóa API and members -
-- wherever both still exist under their seeded names. Elsewhere every statement changes nothing.
UPDATE `units` SET `name` = 'Tạp chí Khoa học & Nhà xuất bản'
WHERE `name` = 'Tạp chí Khoa học' AND `dissolved_at` IS NULL
  AND EXISTS (SELECT 1 FROM `units` WHERE `name` = 'Nhà xuất bản' AND `dissolved_at` IS NULL);
--> statement-breakpoint
-- A Link that changes Đơn vị says so in its history, here as anywhere.
INSERT INTO `unit_changes` (`link_id`, `old_unit_id`, `new_unit_id`)
SELECT l.`id`, l.`unit_id`, keep.`id`
FROM `links` l
JOIN `units` gone ON gone.`id` = l.`unit_id` AND gone.`name` = 'Nhà xuất bản' AND gone.`dissolved_at` IS NULL
JOIN `units` keep ON keep.`name` = 'Tạp chí Khoa học & Nhà xuất bản' AND keep.`dissolved_at` IS NULL;
--> statement-breakpoint
UPDATE `links` SET `unit_id` = (SELECT `id` FROM `units` WHERE `name` = 'Tạp chí Khoa học & Nhà xuất bản')
WHERE `unit_id` = (SELECT `id` FROM `units` WHERE `name` = 'Nhà xuất bản' AND `dissolved_at` IS NULL)
  AND EXISTS (SELECT 1 FROM `units` WHERE `name` = 'Tạp chí Khoa học & Nhà xuất bản' AND `dissolved_at` IS NULL);
--> statement-breakpoint
UPDATE `api_keys` SET `unit_id` = (SELECT `id` FROM `units` WHERE `name` = 'Tạp chí Khoa học & Nhà xuất bản')
WHERE `unit_id` = (SELECT `id` FROM `units` WHERE `name` = 'Nhà xuất bản' AND `dissolved_at` IS NULL)
  AND EXISTS (SELECT 1 FROM `units` WHERE `name` = 'Tạp chí Khoa học & Nhà xuất bản' AND `dissolved_at` IS NULL);
--> statement-breakpoint
-- Someone in both keeps the higher of their two roles.
UPDATE `memberships` SET `role` = 'manager'
WHERE `unit_id` = (SELECT `id` FROM `units` WHERE `name` = 'Tạp chí Khoa học & Nhà xuất bản' AND `dissolved_at` IS NULL)
  AND `account_id` IN (
    SELECT `account_id` FROM `memberships`
    WHERE `role` = 'manager'
      AND `unit_id` = (SELECT `id` FROM `units` WHERE `name` = 'Nhà xuất bản' AND `dissolved_at` IS NULL)
  );
--> statement-breakpoint
INSERT OR IGNORE INTO `memberships` (`account_id`, `unit_id`, `role`, `created_at`)
SELECT m.`account_id`, keep.`id`, m.`role`, m.`created_at`
FROM `memberships` m
JOIN `units` gone ON gone.`id` = m.`unit_id` AND gone.`name` = 'Nhà xuất bản' AND gone.`dissolved_at` IS NULL
JOIN `units` keep ON keep.`name` = 'Tạp chí Khoa học & Nhà xuất bản' AND keep.`dissolved_at` IS NULL;
--> statement-breakpoint
DELETE FROM `memberships`
WHERE `unit_id` = (SELECT `id` FROM `units` WHERE `name` = 'Nhà xuất bản' AND `dissolved_at` IS NULL)
  AND EXISTS (SELECT 1 FROM `units` WHERE `name` = 'Tạp chí Khoa học & Nhà xuất bản' AND `dissolved_at` IS NULL);
--> statement-breakpoint
-- The emptied Đơn vị goes: removed where nothing ever pointed at it, dissolved where a Link's
-- history still names it.
DELETE FROM `units`
WHERE `name` = 'Nhà xuất bản' AND `dissolved_at` IS NULL
  AND EXISTS (SELECT 1 FROM `units` WHERE `name` = 'Tạp chí Khoa học & Nhà xuất bản' AND `dissolved_at` IS NULL)
  AND NOT EXISTS (SELECT 1 FROM `unit_changes` c WHERE c.`old_unit_id` = `units`.`id` OR c.`new_unit_id` = `units`.`id`);
--> statement-breakpoint
UPDATE `units` SET `dissolved_at` = unixepoch() * 1000
WHERE `name` = 'Nhà xuất bản' AND `dissolved_at` IS NULL
  AND EXISTS (SELECT 1 FROM `units` WHERE `name` = 'Tạp chí Khoa học & Nhà xuất bản' AND `dissolved_at` IS NULL);

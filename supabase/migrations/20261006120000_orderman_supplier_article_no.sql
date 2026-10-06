-- ════════════════════════════════════════════════════════════════════
-- Orderman-Lieferanten-Artikelnummern (Art.-Nr.) für Produkte.
--
-- Füllt products.supplier_article_no für die Orderman-Produkte, damit die
-- Bestell-E-Mail an sales@orderman.com je Position die korrekte Orderman-
-- Artikelnummer trägt (Orderman verlangt lt. AGB Artikelnummer + Preis +
-- Menge auf jeder Bestellung).
--
-- Nummern aus der Orderman U.V.P. Preisliste März 2026 (V3), zugeordnet
-- über Gerät/Variante + U.V.P.-Preis. Update per stabiler id (TEXT-PK).
-- ════════════════════════════════════════════════════════════════════

-- Magellan Easy (PC POS) ------------------------------------------------
UPDATE products SET supplier_article_no = 'OM.PMG3.5N97BB.BL' WHERE id = '88086a87-6865-4be2-a95b-49e8fbbbd00a'; -- Magelan Easy 15.1" Celeron
UPDATE products SET supplier_article_no = 'OM.PMG3.5305BB.BL' WHERE id = 'b85579a5-371a-469c-8879-a5341be9c653'; -- Magelan Easy 15.1" i3
UPDATE products SET supplier_article_no = 'OM.PMG3.6N97BB.BL' WHERE id = '5117bc14-c2de-4226-a2b1-442ddd475255'; -- Magelan Easy 15.6" Celeron
UPDATE products SET supplier_article_no = 'OM.PMG3.6305BB.BL' WHERE id = '6110f594-e20d-4001-8b45-0ccf6dfc3393'; -- Magelan Easy 15.6" i3
UPDATE products SET supplier_article_no = 'OM.PMG3.ACCADM'    WHERE id = 'c9f18758-c26e-4eb2-b98c-c040494d5ab7'; -- Magellan Easy Addimat

-- Magellan (PC POS) -----------------------------------------------------
UPDATE products SET supplier_article_no = 'OM.PMG1.5N97BB.BL' WHERE id = 'orderman-magellan-celeron'; -- Magellan Celeron (15.1" N97)
UPDATE products SET supplier_article_no = 'OM.PMG1.5305BB.BL' WHERE id = 'orderman-magellan-i3';      -- Magellan i3 (15.1" N305)
UPDATE products SET supplier_article_no = 'OM.PMG1.5U5UCC.BL' WHERE id = 'orderman-magellan-i5';      -- Magellan i5 (15.1" Ultra5)

-- Garantie-Erweiterungen Care Gold 60 Monate bei Kauf (35 %) = EW.CG.P60 -
UPDATE products SET supplier_article_no = 'EW.CG.P60' WHERE id = '25bde68f-9113-40cd-bd91-c781d1f1a960'; -- Magelan Easy Celeron Garantie (35% x 1040 = 364)
UPDATE products SET supplier_article_no = 'EW.CG.P60' WHERE id = '1f62ca45-9489-47a5-9f84-979868e7585e'; -- Magelan Easy i3 Garantie (35% x 1380 = 483)
UPDATE products SET supplier_article_no = 'EW.CG.P60' WHERE id = 'orderman-magellan-celeron-garantie';  -- Magellan Celeron Garantie (35% x 1780 = 623)
UPDATE products SET supplier_article_no = 'EW.CG.P60' WHERE id = 'orderman-magellan-i3-garantie';       -- Magellan i3 Garantie (35% x 2080 = 728)
UPDATE products SET supplier_article_no = 'EW.CG.P60' WHERE id = 'orderman-magellan-i5-garantie';       -- Magellan i5 Garantie (35% x 3120 = 1092)

-- Orderman 10 (Handheld) ------------------------------------------------
UPDATE products SET supplier_article_no = 'OM.OM10.6.AHE'    WHERE id = '591d5910-776c-4864-8cfc-0ad55c6ccca9'; -- Orderman 10 (Hospitality, 950)
UPDATE products SET supplier_article_no = 'OM.OM10.6.OSR'    WHERE id = '378c1bcc-63aa-46c0-ad18-d9d03f2c3964'; -- Orderman 10 OSR (990)
UPDATE products SET supplier_article_no = 'OM.OM10.ACC.CRD'  WHERE id = '6b8ccb5b-d690-4daf-82d5-ef637822817f'; -- Orderman Ladestation inkl. Netzteil (210)
UPDATE products SET supplier_article_no = 'OM.OM10.BATT'     WHERE id = '711b6e2d-1347-4929-992e-f52bc230c9d8'; -- Orderman Zusatzbatterie (70)
UPDATE products SET supplier_article_no = '33-930'           WHERE id = '2f11d459-5755-418c-bbde-9814f201b33e'; -- Orderman Safety Cord (3er Pack, 36)

-- ⚠️ ZU BESTÄTIGEN: "auf 48 Monate" = 24 inkl. + 24 (A24); Preis (270)
-- deckt sich mit keinem aktuellen Orderman-10-Prozentsatz → ggf. Legacy.
UPDATE products SET supplier_article_no = 'EW.CG.A24'        WHERE id = '24931794-f0f7-44a8-a476-f0a1c5380484'; -- Orderman Garantieverlängerung (auf 48 Monate, 270)

-- Orderman Gürteldrucker 4 ---------------------------------------------
UPDATE products SET supplier_article_no = '9900-6017-8801'   WHERE id = '2f289160-3c8f-4722-8acd-e6280b287f31'; -- Gürteldrucker 4 (470)
UPDATE products SET supplier_article_no = '501-528'          WHERE id = 'a96c68ba-9a01-40d6-84f3-57e2daf1cb50'; -- Gürteldrucker 4 - Akkupack (88)
UPDATE products SET supplier_article_no = 'EW.CG.P36'        WHERE id = 'd708eaf6-9bff-4622-b8ea-4898a87fe841'; -- Gürteldrucker 4 - Gold Care 3 Jahre (10% x 470 = 47)
UPDATE products SET supplier_article_no = '501-529'          WHERE id = 'a8ad5cfc-ade3-4603-8e4a-ac41b6fbe40b'; -- Gürteldrucker 4 - Vierfach Ladeschale (4-fach Akkuladestation, 278)

-- Orderman Gürteltaschen ------------------------------------------------
UPDATE products SET supplier_article_no = '7777-K412-V001'   WHERE id = '45cbe87d-d9d8-429c-9d39-8b96c34e123b'; -- Gürteltasche mit Klipp (58)
-- ⚠️ ZU BESTÄTIGEN: "mit Schlaufe" steht in der Preisliste als V001
-- (Classic-Seite) UND V002 (Orderman-10-Zubehör). Default: V002.
UPDATE products SET supplier_article_no = '7777-K415-V002'   WHERE id = '0658321f-9c14-4d06-a1e9-2abe7f2a7db2'; -- Gürteltasche mit Schlaufe (58)

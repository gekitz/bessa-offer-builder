-- Add product descriptions (info) for all Sunmi products: display size,
-- Android version, integrated printer + paper width, customer display + size,
-- and a "Garantie laut Hersteller" line. Mirrors the same edits in
-- src/features/offers/data/catalogs.ts (the offline fallback).
UPDATE products SET info = '15,6" Full-HD Display · Android 13 · kein integrierter Drucker · Kundendisplay 10,1" optional · Garantie laut Hersteller' WHERE id = 'fdb37b6a-4ad5-4a46-ba8f-53e4a2154ce3'; -- Sunmi D3 Pro
UPDATE products SET info = '10,1" HD Display · Android 13 · Bondrucker 80mm integriert (Auto-Cutter) · Kundendisplay 4" IPS Touch · Garantie laut Hersteller' WHERE id = 'c36c776a-194a-4c32-b758-8ffc09cf991b'; -- Sunmi D3 Mini
UPDATE products SET info = '15,6" Full-HD Display · Android 14 · Bondrucker 80mm integriert · Kundendisplay 10,1" optional · Garantie laut Hersteller' WHERE id = '149f374e-6341-4a33-a1bc-23dff12ad749'; -- Sunmi D3 80mm
UPDATE products SET info = '15,6" Full-HD Display · Android 13 · Bondrucker 80mm integriert (Auto-Cutter) · kein Kundendisplay · Garantie laut Hersteller' WHERE id = '9a92555d-b845-4282-ae38-963980fc1479'; -- Sunmi T3 80mm
UPDATE products SET info = '6,75" HD+ Display · Android 13 · Bondrucker 58mm integriert · kein Kundendisplay · Garantie laut Hersteller' WHERE id = '91b8a7fa-5b0c-44a4-a4a7-fd6c6f0b25f6'; -- Sunmi V3H
UPDATE products SET info = '6,8" HD+ Display · Android 14 · kein integrierter Drucker · kein Kundendisplay · Garantie laut Hersteller' WHERE id = '4bc17b56-5e4e-49cf-b4fb-a0e4d295335a'; -- Sunmi L3H
UPDATE products SET info = '22" Full-HD Touchdisplay · Android 13 · kein integrierter Drucker · kein Kundendisplay · Garantie laut Hersteller' WHERE id = '5c1b7d35-27b4-4bc1-b44c-fb8a2f1ca153'; -- Flex 3 22''
UPDATE products SET info = '27" Full-HD Touchdisplay · Android 13 · kein integrierter Drucker · kein Kundendisplay · Garantie laut Hersteller' WHERE id = '9105cea7-5ce7-4cab-87ba-12395c184861'; -- Flex 3 27''
UPDATE products SET info = '27" Full-HD Touchdisplay · Android 13 · kein integrierter Drucker · kein Kundendisplay · Garantie laut Hersteller' WHERE id = 'kiosk-flex-3-27'; -- Flex Kiosk 3 27''
UPDATE products SET info = '22" Full-HD Touchdisplay · Android 13 · kein integrierter Drucker · kein Kundendisplay · Garantie laut Hersteller' WHERE id = 'kiosk-flex-3-22'; -- Flex Kiosk 3 22''

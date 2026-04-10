-- Migration: Rewrite old short item IDs to UUIDs in offer_data JSONB
-- Affects: offer_data.cart (object keys), offer_data.cartOrder (array values),
--          offer_data.customItems (object keys -> new UUIDs)

DO $$
DECLARE
  rec RECORD;
  data jsonb;
  new_cart jsonb;
  new_cart_order jsonb;
  new_custom_items jsonb;
  old_key text;
  new_key text;
  val jsonb;
  i int;
  arr_val text;
  custom_old_to_new jsonb := '{}'::jsonb;
  id_map jsonb := '{
    "k100": "3942f638-1abb-4be9-85a5-d3bf442aa3d8",
    "k109": "c4aca644-5fb4-46cf-9fea-8ddc1bee8c30",
    "k110": "cb003c42-11dc-48c9-a5de-68a2c998501a",
    "k111": "4d6ee0aa-32ad-480a-aa2f-4d1ddf620b12",
    "k115": "6fa5da94-d90b-41a1-ab17-f515d172b940",
    "k119": "1dfe4874-04a7-47e9-9230-e1696b6e8901",
    "k120": "a4e9ba39-ee22-41b9-8f94-936ee3ce3de3",
    "k121": "95cd9f0f-ec0d-46eb-aaa6-330a8ce129d4",
    "k129": "6f8ed70a-8388-40d6-8e9e-516f524cd3e5",
    "k020": "40769d58-ebbb-40f8-b4b8-9a89da35a934",
    "k021": "4bc73978-ee15-4858-8107-87d3faa210e2",
    "k022": "f7a4cb27-d3cf-4e84-ba58-a273da596c06",
    "k023": "00c9aca1-e463-4c63-a5c2-9fd51d70010a",
    "k024": "3296ada4-f7f8-47a1-9cf5-a3dc64326f3a",
    "k030": "b2a3bb5a-370c-49d4-96e3-874b5df66c56",
    "k040a": "14105277-c0ca-400f-9444-3ec9414fb279",
    "k040": "65e7e1a8-23b3-444f-8b18-c5ca7312cf28",
    "k041": "117be9d9-f2b0-409d-9ec6-9497f943ff4f",
    "k042": "eceb4278-06cc-4fe5-9413-d41ae999166c",
    "k043": "0824405f-8780-4371-919b-5cee2c6efb07",
    "k044": "ad5d1834-f864-43a1-8be4-2bae0bfeade4",
    "k049": "a336d467-a39f-4acd-8872-e7d185c45ea9",
    "m300": "3ad3609d-c87a-485f-b96f-827e60c79e81",
    "m310": "d3a94a99-982c-4969-aab8-9aed654ed0cb",
    "m320": "37551e30-8b3f-44cf-a126-702dfd2539ea",
    "m200": "bfa4ca0e-b5ed-4cd2-a1a7-12c02854082f",
    "m201": "48065ab3-b47f-46ae-a32e-2176ae41dd30",
    "m202": "35518df7-6eb3-4bd3-a21c-33e379d23271",
    "m203": "d2c207cf-3c6f-41f6-a1df-739e8e48d4bb",
    "m204": "d0c56974-678a-41b0-9924-e5353cc0891b",
    "m205": "cdc84a4d-99b6-48c5-b414-c5be9daeff03",
    "m206": "ec32520e-cbba-4739-8cf0-fd8bb918ca55",
    "m207": "01289762-3f01-486f-8ab8-d5aa9038996e",
    "m208": "33da16d1-bbaf-40b1-bac4-9160ce593952",
    "m209": "f2d30dd5-e54f-426d-8ea5-20ccb6396b06",
    "h1": "fdb37b6a-4ad5-4a46-ba8f-53e4a2154ce3",
    "h3": "c36c776a-194a-4c32-b758-8ffc09cf991b",
    "h10": "bbcba755-3fa2-4c21-85e2-9842a1baa541",
    "h2": "91b8a7fa-5b0c-44a4-a4a7-fd6c6f0b25f6",
    "h4": "4bc17b56-5e4e-49cf-b4fb-a0e4d295335a",
    "h11": "1a4f3300-edd2-477f-8188-604b8ef8fba3",
    "h12": "7ea30866-25d7-4fa2-b970-0fd6911a3de8",
    "h13": "4be8df2f-6293-4a06-b559-d7856c12c1bf",
    "d1": "d2769912-6880-4996-b6b9-07d4fdbc9406",
    "d2": "2ce55292-b567-488a-bd35-20f280dc8381",
    "km1": "b98e4215-ab79-45b0-a365-32a6bb9367a5",
    "km2": "be7b9177-1682-4388-bfe5-07615adf7cde",
    "km3": "ca26b2dd-e2ee-4068-baeb-0b30bef3652f",
    "km4": "fcb98549-60de-4634-bf8d-267648cde83e",
    "km5": "82dfb1e9-37e8-465c-8f08-d56fbe5cd525",
    "km6": "227beac0-cae4-444b-b349-75692a4c288f",
    "km7": "ba4b1c27-d6dc-4120-b348-236430abecc8",
    "km8": "c659e63f-1305-4729-89ab-560e527cd8a2",
    "km9": "ce5d9b69-52e4-4199-8adf-97f192a9b4e3",
    "km10": "4a898f54-638b-45e8-8f29-d1d3f573d9ad",
    "km11": "bd6f02cc-856f-42b2-b3a2-90aacf32c76f",
    "km20": "3fff9523-d8bd-4c3f-bcd2-00068feba867",
    "km21": "7e3f6afa-b17a-4254-aa8a-a40d80610aa1",
    "km22": "94561292-0c42-47a1-b938-ed3337d8583e",
    "km30": "69363519-c612-4ecb-9733-02bd782bd654",
    "km31": "9472265f-181b-403c-bec5-1a53cdc88117",
    "km32": "767029e1-52cf-40a3-9f76-e49c145b94eb",
    "km33": "90dc559f-f14a-457d-a328-eb7c6945a5c3",
    "kms1": "5c1b7d35-27b4-4bc1-b44c-fb8a2f1ca153",
    "kms2": "9105cea7-5ce7-4cab-87ba-12395c184861",
    "kms3": "dcfacd8a-e274-44ae-89f7-ecc03164c439",
    "h7": "00caa501-4266-4459-bbf6-38074fa7a00d",
    "h8": "b01429e1-672e-44ae-ae79-1d08c4f7f918",
    "o1": "591d5910-776c-4864-8cfc-0ad55c6ccca9",
    "o2": "24931794-f0f7-44a8-a476-f0a1c5380484",
    "o3": "6b8ccb5b-d690-4daf-82d5-ef637822817f",
    "o4": "a252444d-0ac6-4809-9ede-16125a3bc5f0",
    "o5": "d1697574-cac7-4fec-8e72-89a582a0d6d5",
    "o6": "0134901e-4d85-4e1d-a65b-c53be99e8ef4"
  }'::jsonb;
BEGIN
  FOR rec IN SELECT id, offer_data FROM offers WHERE offer_data IS NOT NULL LOOP
    data := rec.offer_data;
    custom_old_to_new := '{}'::jsonb;

    -- 1. Migrate customItems: assign new UUIDs to custom_N keys
    IF data ? 'customItems' AND jsonb_typeof(data->'customItems') = 'object' THEN
      new_custom_items := '{}'::jsonb;
      FOR old_key, val IN SELECT * FROM jsonb_each(data->'customItems') LOOP
        IF old_key LIKE 'custom_%' THEN
          new_key := gen_random_uuid()::text;
          -- Update the item's own id field to match the new key
          val := jsonb_set(val, '{id}', to_jsonb(new_key));
          new_custom_items := new_custom_items || jsonb_build_object(new_key, val);
          custom_old_to_new := custom_old_to_new || jsonb_build_object(old_key, to_jsonb(new_key));
        ELSE
          -- Already a UUID or unknown format — keep as-is
          new_custom_items := new_custom_items || jsonb_build_object(old_key, val);
        END IF;
      END LOOP;
      data := jsonb_set(data, '{customItems}', new_custom_items);
    END IF;

    -- 2. Migrate cart keys
    IF data ? 'cart' AND jsonb_typeof(data->'cart') = 'object' THEN
      new_cart := '{}'::jsonb;
      FOR old_key, val IN SELECT * FROM jsonb_each(data->'cart') LOOP
        -- Check catalog mapping first
        IF id_map ? old_key THEN
          new_key := id_map->>old_key;
        -- Check custom item mapping
        ELSIF custom_old_to_new ? old_key THEN
          new_key := custom_old_to_new->>old_key;
        ELSE
          -- Unknown key — keep as-is (safety net)
          new_key := old_key;
        END IF;
        new_cart := new_cart || jsonb_build_object(new_key, val);
      END LOOP;
      data := jsonb_set(data, '{cart}', new_cart);
    END IF;

    -- 3. Migrate cartOrder array values
    IF data ? 'cartOrder' AND jsonb_typeof(data->'cartOrder') = 'array' THEN
      new_cart_order := '[]'::jsonb;
      FOR i IN 0..jsonb_array_length(data->'cartOrder') - 1 LOOP
        arr_val := (data->'cartOrder'->>i);
        IF id_map ? arr_val THEN
          new_cart_order := new_cart_order || to_jsonb(id_map->>arr_val);
        ELSIF custom_old_to_new ? arr_val THEN
          new_cart_order := new_cart_order || to_jsonb(custom_old_to_new->>arr_val);
        ELSE
          new_cart_order := new_cart_order || to_jsonb(arr_val);
        END IF;
      END LOOP;
      data := jsonb_set(data, '{cartOrder}', new_cart_order);
    END IF;

    -- 4. Update the row
    UPDATE offers SET offer_data = data WHERE id = rec.id;
  END LOOP;
END;
$$;

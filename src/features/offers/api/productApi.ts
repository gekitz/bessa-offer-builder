// Admin CRUD for the product catalog (products table). Staff-facing;
// the offer builder reads via catalogLoader.hydrateCatalog().

import { supabase } from '../../../lib/supabase';

export interface ProductPricing {
  price?: number;
  tiers?: { y?: number; s?: number; m?: number; e?: number };
  servicePercent?: number;
  discount?: unknown;
}

export interface Product {
  id: string;
  code: string | null;
  name: string;
  catalog: string;
  category: string | null;
  kind: string; // 'm' | 'o' | 'h' | 'copier'
  note: string | null;
  info: string | null;
  pricing: ProductPricing;
  attrs: Record<string, unknown>;
  autoAdd: unknown;
  active: boolean;
  sort: number;
  // Beschaffung: bevorzugte Bezugsquelle + Alternativen (Doppelquelle).
  supplierId: string | null;
  altSupplierIds: string[];
  // Jarltech-Artikelkennung für die Preis-/Lagerabfrage (jarltech-proxy).
  jarltechItemId: string | null;
  // Artikelnummer beim Lieferanten (z. B. Orderman) — für die Bestell-E-Mail.
  supplierArticleNo: string | null;
}

export interface ProductInput {
  id?: string;
  code?: string | null;
  name: string;
  catalog: string;
  category?: string | null;
  kind: string;
  note?: string | null;
  info?: string | null;
  pricing?: ProductPricing;
  attrs?: Record<string, unknown>;
  active?: boolean;
  sort?: number;
  supplierId?: string | null;
  altSupplierIds?: string[];
  jarltechItemId?: string | null;
  supplierArticleNo?: string | null;
}

const COLS = 'id, code, name, catalog, category, kind, note, info, pricing, attrs, auto_add, active, sort, supplier_id, alt_supplier_ids, jarltech_item_id, supplier_article_no';

function requireSb(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error('Supabase nicht konfiguriert');
  return supabase;
}

function rowToProduct(r: Record<string, unknown>): Product {
  return {
    id: r.id as string,
    code: (r.code as string) ?? null,
    name: r.name as string,
    catalog: r.catalog as string,
    category: (r.category as string) ?? null,
    kind: r.kind as string,
    note: (r.note as string) ?? null,
    info: (r.info as string) ?? null,
    pricing: (r.pricing as ProductPricing) ?? {},
    attrs: (r.attrs as Record<string, unknown>) ?? {},
    autoAdd: r.auto_add ?? null,
    active: !!r.active,
    sort: (r.sort as number) ?? 0,
    supplierId: (r.supplier_id as string) ?? null,
    altSupplierIds: (r.alt_supplier_ids as string[]) ?? [],
    jarltechItemId: (r.jarltech_item_id as string) ?? null,
    supplierArticleNo: (r.supplier_article_no as string) ?? null,
  };
}

// All products (incl. inactive) for the admin list.
export async function listProductsAdmin(): Promise<Product[]> {
  const sb = requireSb();
  const { data, error } = await sb
    .from('products')
    .select(COLS)
    .order('catalog', { ascending: true })
    .order('sort', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToProduct);
}

// Patch editable fields. attrs/auto_add are preserved (not touched here).
export async function updateProduct(
  id: string,
  patch: Partial<Omit<ProductInput, 'id'>>,
): Promise<Product> {
  const sb = requireSb();
  const db: Record<string, unknown> = {};
  if (patch.code !== undefined) db.code = patch.code;
  if (patch.name !== undefined) db.name = patch.name;
  if (patch.catalog !== undefined) db.catalog = patch.catalog;
  if (patch.category !== undefined) db.category = patch.category;
  if (patch.kind !== undefined) db.kind = patch.kind;
  if (patch.note !== undefined) db.note = patch.note;
  if (patch.info !== undefined) db.info = patch.info;
  if (patch.pricing !== undefined) db.pricing = patch.pricing;
  if (patch.attrs !== undefined) db.attrs = patch.attrs;
  if (patch.active !== undefined) db.active = patch.active;
  if (patch.sort !== undefined) db.sort = patch.sort;
  if (patch.supplierId !== undefined) db.supplier_id = patch.supplierId;
  if (patch.altSupplierIds !== undefined) db.alt_supplier_ids = patch.altSupplierIds;
  if (patch.jarltechItemId !== undefined) db.jarltech_item_id = patch.jarltechItemId;
  if (patch.supplierArticleNo !== undefined) db.supplier_article_no = patch.supplierArticleNo;
  const { data, error } = await sb.from('products').update(db).eq('id', id).select(COLS).single();
  if (error) throw new Error(error.message);
  return rowToProduct(data);
}

export async function deleteProduct(id: string): Promise<void> {
  const sb = requireSb();
  const { error } = await sb.from('products').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const sb = requireSb();
  const { data, error } = await sb
    .from('products')
    .insert({
      id: input.id ?? crypto.randomUUID(),
      code: input.code ?? null,
      name: input.name,
      catalog: input.catalog,
      category: input.category ?? null,
      kind: input.kind,
      note: input.note ?? null,
      info: input.info ?? null,
      pricing: input.pricing ?? {},
      attrs: input.attrs ?? {},
      active: input.active ?? true,
      sort: input.sort ?? 999,
      supplier_id: input.supplierId ?? null,
      alt_supplier_ids: input.altSupplierIds ?? [],
      jarltech_item_id: input.jarltechItemId ?? null,
      supplier_article_no: input.supplierArticleNo ?? null,
    })
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return rowToProduct(data);
}

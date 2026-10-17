import { NextRequest, NextResponse } from 'next/server';
import { requireOwner, isAllowedMutationOrigin } from '@/lib/commerce-auth';
import { saveOwnerProduct } from '@/lib/product-admin';
import { ProductValidationError, isRecord } from '@/lib/product-validation';

/** Legacy URL retained: archival preserves inventory history and order references. */
export async function POST(request: NextRequest) {
  if (!await requireOwner(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAllowedMutationOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  try {
    const body = await request.json();
    if (!isRecord(body)) throw new ProductValidationError('Product information must be an object.');
    const product = await saveOwnerProduct({ id: body?.id, action: 'archive' },'update');
    return NextResponse.json({ ok: true, archived: true, product });
  } catch (error) {
    const validation = error instanceof ProductValidationError || error instanceof SyntaxError;
    return NextResponse.json({ error: validation ? error.message : 'Product could not be archived.' }, { status: validation ? 400 : 500 });
  }
}

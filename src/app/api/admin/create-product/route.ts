import { NextRequest, NextResponse } from 'next/server';
import { isAllowedMutationOrigin, requireOwner } from '@/lib/commerce-auth';
import { saveOwnerProduct } from '@/lib/product-admin';
import { ProductValidationError } from '@/lib/product-validation';

export async function POST(request: NextRequest) {
  if (!await requireOwner(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAllowedMutationOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > 100000) return NextResponse.json({ error: 'Product information is too large.' }, { status: 413 });
  try {
    const product = await saveOwnerProduct(await request.json(),'create');
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    const validation = error instanceof ProductValidationError || error instanceof SyntaxError;
    return NextResponse.json({ error: validation ? error.message : 'Unable to save product. Please try again.' }, { status: validation ? 400 : 500 });
  }
}

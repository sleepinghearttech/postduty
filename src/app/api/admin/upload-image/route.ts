import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isCommerceSandbox } from '@/lib/commerce-db';
import { requireOwner, isAllowedMutationOrigin } from '@/lib/commerce-auth';
import { ProductValidationError, validateMediaFile } from '@/lib/product-validation';

export async function POST(request: NextRequest) {
  if (!await requireOwner(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAllowedMutationOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > 26 * 1024 * 1024) return NextResponse.json({ error: 'Upload is too large.' }, { status: 413 });
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new ProductValidationError('Choose a photo or video to upload.');
    if (file.size > (file.type.startsWith('video/') ? 25 : 8) * 1024 * 1024) throw new ProductValidationError('Photos must be 8 MB or smaller; videos 25 MB or smaller.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const media = validateMediaFile(file.type,bytes);
    const filename = `${randomUUID()}.${media.extension}`;
    const bucket = isCommerceSandbox() ? 'commerce-preview-media' : 'product-images';
    const { error } = await supabaseAdmin.storage.from(bucket).upload(filename,bytes,{ contentType: file.type, upsert: false, cacheControl: '3600' });
    if (error) return NextResponse.json({ error: 'Media upload failed. Please retry.' }, { status: 502 });
    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(filename);
    return NextResponse.json({ url: data.publicUrl, type: media.type });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ProductValidationError ? error.message : 'Unable to process this upload.' }, { status: 400 });
  }
}

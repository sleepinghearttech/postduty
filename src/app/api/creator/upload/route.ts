import { NextRequest, NextResponse } from 'next/server';
import { requireCreator, creatorDenied } from '@/lib/creator-auth';
import { isCommerceSandbox } from '@/lib/commerce-db';
import { supabaseAdmin } from '@/lib/supabase';
import { validateMediaFile } from '@/lib/product-validation';

export async function POST(request: NextRequest) {
  const creator = await requireCreator(request);
  if (!creator) return creatorDenied();
  if (Number(request.headers.get('content-length') ?? 0) > 26 * 1024 * 1024) return NextResponse.json({ error: 'The upload is too large.' }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'Choose an image up to 8 MB or a video up to 25 MB.' }, { status: 400 });
    if (file.type.startsWith('image/') && file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'Images must be 8 MB or smaller.' }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const media = validateMediaFile(file.type, bytes);
    const bucket = isCommerceSandbox() ? 'commerce-preview-media' : 'product-images';
    const key = `${crypto.randomUUID()}.${media.extension}`;
    const { error } = await supabaseAdmin.storage.from(bucket).upload(key, bytes, { contentType: file.type, upsert: false, cacheControl: '3600' });
    if (error) throw new Error('Upload unavailable');
    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(key);
    return NextResponse.json({ url: data.publicUrl, type: media.type });
  } catch { return NextResponse.json({ error: 'Upload failed. Use a valid JPEG, PNG, WebP, GIF, MP4 or WebM file and try again.' }, { status: 400 }); }
}

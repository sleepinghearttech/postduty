import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // strip special chars
    .trim()
    .replace(/\s+/g, '-')          // spaces → hyphens
}

async function uniqueSlug(base: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('products')
    .select('slug')
    .like('slug', `${base}%`)

  const existing = new Set((data ?? []).map((r) => r.slug))
  if (!existing.has(base)) return base

  let i = 2
  while (existing.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

export async function POST(request: NextRequest) {
  const session = request.cookies.get('admin_session')?.value
  if (!session || session !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as {
    name: string
    price: number       // rupees from form — converted to paise below
    description?: string
    stock?: number
    image_url?: string
    is_active?: boolean
  }

  if (!body.name || body.price == null) {
    return NextResponse.json({ error: 'name and price are required' }, { status: 400 })
  }

  const slug = await uniqueSlug(toSlug(body.name))
  const priceInPaise = Math.round(body.price * 100)

  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      name: body.name,
      slug,
      price: priceInPaise,
      description: body.description ?? null,
      stock: body.stock ?? 0,
      image_url: body.image_url ?? null,
      is_active: body.is_active ?? false,   // new products default hidden
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ product: data })
}

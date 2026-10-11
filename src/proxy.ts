import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Keep the dedicated store hostname within the existing PostDuty application.
// The root domain continues to show the creative homepage, while the shop
// hostname opens the existing /store catalogue without duplicate databases.
export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (host === "store.postduty.in" && request.nextUrl.pathname === "/") {
    const destination = request.nextUrl.clone();
    destination.pathname = "/store";
    return NextResponse.rewrite(destination);
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };

import Link from "next/link";

export default function Header() {
  return (
    <header className="bg-white border-b border-warm-border sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="font-extrabold text-xl tracking-tight text-brand"
        >
          PostDuty
        </Link>
      </div>
    </header>
  );
}

import Link from "next/link";

const policyLinks = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Refund Policy", href: "/refunds" },
  { label: "Shipping Policy", href: "/shipping" },
  { label: "Contact Us", href: "/contact" },
];

export default function Footer() {
  return (
    <footer className="border-t border-warm-border bg-white mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex flex-col sm:flex-row justify-between gap-8">
          <div>
            <p className="font-extrabold text-brand text-lg tracking-tight">PostDuty</p>
            <p className="text-stone-500 text-sm mt-1 max-w-xs leading-relaxed">
              Thoughtful gifts for nurses, doctors, and every healthcare hero across India.
            </p>
            <p className="text-stone-400 text-xs mt-3">hello@postduty.in</p>
          </div>
          <nav className="flex flex-col gap-2.5">
            {policyLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-stone-500 hover:text-brand transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-warm-border mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-xs text-stone-400">
            © 2026 PostDuty. Made with care in India.
          </p>
          <p className="text-xs text-stone-400">
            Payments secured by Razorpay
          </p>
        </div>
      </div>
    </footer>
  );
}

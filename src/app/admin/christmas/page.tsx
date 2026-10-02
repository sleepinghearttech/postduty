import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import AdminChristmasClient, {
  type ChristmasDashboardRow,
} from "./AdminChristmasClient";

type Filament = {
  key: string;
  brand: string;
  product_line: string;
  color_name: string;
  price_per_kg_paise: number;
  finish: string;
  best_for: string[];
};

export default async function AdminChristmasPage() {
  const [{ data: candidates }, { data: filaments }, { data: settings }] =
    await Promise.all([
      supabaseAdmin
        .from("christmas_product_candidates")
        .select("*")
        .order("priority", { ascending: true }),
      supabaseAdmin
        .from("christmas_filaments")
        .select("*")
        .eq("is_active", true)
        .order("price_per_kg_paise", { ascending: true }),
      supabaseAdmin
        .from("christmas_cost_settings")
        .select("*")
        .eq("id", 1)
        .single(),
    ]);

  const filamentMap = new Map(
    ((filaments || []) as Filament[]).map((f) => [f.key, f])
  );

  const electricityRate = Number(settings?.electricity_rate_paise_per_kwh ?? 900);
  const watts = Number(settings?.avg_printer_watts ?? 120);
  const machinePerHour = Number(settings?.machine_overhead_paise_per_hour ?? 800);
  const labor = Number(settings?.labor_paise_per_item ?? 1000);
  const failurePct = Number(settings?.failure_allowance_percent ?? 10);
  const defaultPackaging = Number(settings?.default_packaging_paise ?? 2500);

  const rows: ChristmasDashboardRow[] = (candidates || []).map((candidate) => {
    const filament = candidate.default_filament_key
      ? filamentMap.get(candidate.default_filament_key)
      : undefined;

    const grams =
      candidate.filament_grams == null ? null : Number(candidate.filament_grams);
    const minutes =
      candidate.print_time_minutes == null
        ? null
        : Number(candidate.print_time_minutes);

    const materialCost =
      grams != null && filament
        ? Math.round((grams / 1000) * filament.price_per_kg_paise)
        : null;

    const electricityCost =
      minutes != null
        ? Math.round((minutes / 60) * (watts / 1000) * electricityRate)
        : null;

    const machineCost =
      minutes != null ? Math.round((minutes / 60) * machinePerHour) : null;

    const hardware = Number(candidate.hardware_cost_paise ?? 0);
    const packaging = Number(candidate.packaging_cost_paise ?? defaultPackaging);

    const knownBase =
      materialCost != null && electricityCost != null && machineCost != null
        ? materialCost + electricityCost + machineCost + labor + hardware + packaging
        : null;

    const failureAllowance =
      knownBase != null ? Math.round(knownBase * (failurePct / 100)) : null;

    const total =
      knownBase != null && failureAllowance != null
        ? knownBase + failureAllowance
        : null;

    const suggested =
      candidate.suggested_price_paise == null
        ? null
        : Number(candidate.suggested_price_paise);

    const margin =
      total != null && suggested != null && suggested > 0
        ? ((suggested - total) / suggested) * 100
        : null;

    return {
      id: candidate.id,
      name: candidate.name,
      category: candidate.category,
      sourcePlatform: candidate.source_platform,
      sourceUrl: candidate.source_url,
      sourceLicense: candidate.source_license,
      licenseStatus: candidate.license_status,
      attributionRequired: candidate.attribution_required,
      rating:
        candidate.source_rating == null ? null : Number(candidate.source_rating),
      ratingCount: candidate.source_rating_count,
      downloads: candidate.source_downloads,
      likes: candidate.source_likes,
      printTimeMinutes: minutes,
      filamentGrams: grams,
      filamentName: filament
        ? filament.brand + " " + filament.product_line + " · " + filament.color_name
        : null,
      filamentPricePerKgPaise: filament?.price_per_kg_paise ?? null,
      materialCostPaise: materialCost,
      electricityCostPaise: electricityCost,
      machineCostPaise: machineCost,
      laborCostPaise: labor,
      hardwareCostPaise: hardware,
      packagingCostPaise: packaging,
      failureAllowancePaise: failureAllowance,
      totalCostPaise: total,
      suggestedPricePaise: suggested,
      marginPercent: margin,
      status: candidate.status,
      notes: candidate.notes,
      isHero: candidate.is_hero,
    };
  });

  const freeCommercial = rows.filter(
    (row) => row.licenseStatus === "free_commercial"
  ).length;
  const needsLicense = rows.filter((row) =>
    ["commercial_available", "paid_commercial"].includes(row.licenseStatus)
  ).length;
  const costed = rows.filter((row) => row.totalCostPaise != null).length;
  const hero = rows.find((row) => row.isHero);

  return (
    <main className="max-w-[1500px] mx-auto px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">
            Christmas 2026 · Product Lab
          </p>
          <h1 className="font-serif text-4xl mt-2 text-ink-900">
            Product economics & approval dashboard
          </h1>
          <p className="text-sm text-stone-500 mt-2 max-w-3xl">
            One place for model demand, licensing, filament, print time, true
            production cost, target price and the final make / don’t-make decision.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/christmas/catalog" className="btn-premium">
            Open private visual catalog →
          </Link>
          <Link href="/christmas" className="btn-ghost">
            View public Christmas store
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-7">
        {[
          ["Candidates", rows.length],
          ["Free commercial", freeCommercial],
          ["Licence needed", needsLicense],
          ["Fully costed", costed],
          ["Hero", hero?.name ?? "Not set"],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="text-[10px] uppercase tracking-wider text-stone-400">
              {label}
            </div>
            <div className="mt-1 text-lg font-bold text-stone-900">{value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
        <strong className="text-sm text-emerald-900">Printer workflow is permanently manual.</strong>
        <p className="text-xs text-emerald-800 mt-1">
          PostDuty may read printer/job status and maintain a production queue, but it will never
          start, pause, cancel, upload or control a Bambu printer. You start prints in Bambu
          Studio/Handy and someone clears the bed between jobs.
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 mb-7">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl text-stone-900">
              Filament purchase map
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              Price snapshots are for planning; re-check before buying.
            </p>
          </div>
          <div className="text-xs text-stone-500">
            Current costing assumes ₹{(electricityRate / 100).toFixed(0)}/kWh ·{" "}
            {watts}W average printer draw · {failurePct}% failure allowance
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {((filaments || []) as Filament[]).map((f) => (
            <div key={f.key} className="rounded-xl border border-stone-100 bg-stone-50 p-3">
              <strong className="block text-sm text-stone-900">
                {f.brand} {f.product_line}
              </strong>
              <span className="text-xs text-stone-500">
                {f.color_name} · {f.finish}
              </span>
              <div className="text-brand font-bold mt-2">
                ₹{Math.round(f.price_per_kg_paise / 100).toLocaleString("en-IN")}/kg
              </div>
              <div className="text-[10px] text-stone-400 mt-2 leading-relaxed">
                Best for: {f.best_for.join(", ")}
              </div>
            </div>
          ))}
        </div>
      </section>

      <AdminChristmasClient rows={rows} />
    </main>
  );
}

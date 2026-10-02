"use client";

import { useMemo, useState } from "react";

export type ChristmasDashboardRow = {
  id: string;
  name: string;
  category: string;
  sourcePlatform: string;
  sourceUrl: string;
  sourceLicense: string | null;
  licenseStatus: string;
  attributionRequired: boolean;
  rating: number | null;
  ratingCount: number | null;
  downloads: number | null;
  likes: number | null;
  printTimeMinutes: number | null;
  filamentGrams: number | null;
  filamentName: string | null;
  filamentPricePerKgPaise: number | null;
  materialCostPaise: number | null;
  electricityCostPaise: number | null;
  machineCostPaise: number | null;
  laborCostPaise: number;
  hardwareCostPaise: number;
  packagingCostPaise: number;
  failureAllowancePaise: number | null;
  totalCostPaise: number | null;
  suggestedPricePaise: number | null;
  marginPercent: number | null;
  status: string;
  notes: string | null;
  isHero: boolean;
};

function money(paise: number | null) {
  if (paise == null) return "—";
  return "₹" + Math.round(paise / 100).toLocaleString("en-IN");
}

function duration(minutes: number | null) {
  if (!minutes) return "Need slice";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? h + "h " + m + "m" : m + "m";
}

const statuses = [
  "candidate",
  "shortlisted",
  "approved",
  "test_printed",
  "live",
  "rejected",
];

export default function AdminChristmasClient({
  rows,
}: {
  rows: ChristmasDashboardRow[];
}) {
  const [items, setItems] = useState(rows);
  const [filter, setFilter] = useState("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  const visible = useMemo(
    () => items.filter((item) => filter === "all" || item.status === filter),
    [items, filter]
  );

  async function updateStatus(id: string, status: string) {
    setSavingId(id);
    try {
      const response = await fetch("/api/admin/christmas-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Update failed");
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, status } : item))
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {["all", ...statuses].map((status) => {
          const active = filter === status;
          const cls =
            "rounded-full px-3 py-1.5 text-xs font-semibold border transition " +
            (active
              ? "bg-brand text-white border-brand"
              : "bg-white text-stone-600 border-stone-200 hover:border-brand");
          return (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={cls}
            >
              {status.replace("_", " ")}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="min-w-[1450px] w-full text-left text-xs">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="p-3">Product</th>
              <th className="p-3">Demand</th>
              <th className="p-3">Licence</th>
              <th className="p-3">Print</th>
              <th className="p-3">Filament</th>
              <th className="p-3">Material</th>
              <th className="p-3">Machine + power</th>
              <th className="p-3">Other</th>
              <th className="p-3">Total cost</th>
              <th className="p-3">Target</th>
              <th className="p-3">Margin</th>
              <th className="p-3">Decision</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-t border-stone-100 align-top">
                <td className="p-3 max-w-[240px]">
                  <div className="flex items-start gap-2">
                    {row.isHero && (
                      <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                        HERO
                      </span>
                    )}
                    <div>
                      <strong className="block text-stone-900 text-sm">{row.name}</strong>
                      <span className="text-stone-400">{row.category}</span>
                      <a
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block mt-1 text-brand font-semibold"
                      >
                        {row.sourcePlatform} source ↗
                      </a>
                    </div>
                  </div>
                </td>
                <td className="p-3 text-stone-600">
                  {row.rating != null && (
                    <div>
                      ★ {row.rating.toFixed(1)} {row.ratingCount ? "(" + row.ratingCount + ")" : ""}
                    </div>
                  )}
                  {row.downloads != null && <div>{row.downloads.toLocaleString()} downloads</div>}
                  {row.likes != null && <div>{row.likes.toLocaleString()} likes</div>}
                </td>
                <td className="p-3 max-w-[180px]">
                  <div
                    className={
                      row.licenseStatus === "free_commercial"
                        ? "text-emerald-700 font-semibold"
                        : "text-amber-700 font-semibold"
                    }
                  >
                    {row.licenseStatus.replace("_", " ")}
                  </div>
                  <div className="text-stone-500">{row.sourceLicense || "Unknown"}</div>
                  {row.attributionRequired && (
                    <div className="text-[10px] text-stone-400 mt-1">
                      Attribution required
                    </div>
                  )}
                </td>
                <td className="p-3 text-stone-600">
                  <div>{duration(row.printTimeMinutes)}</div>
                  <div>{row.filamentGrams != null ? row.filamentGrams + " g" : "Need slice"}</div>
                </td>
                <td className="p-3 max-w-[150px]">
                  <div className="font-semibold text-stone-800">
                    {row.filamentName || "Assign filament"}
                  </div>
                  {row.filamentPricePerKgPaise != null && (
                    <div className="text-stone-400">
                      {money(row.filamentPricePerKgPaise)}/kg
                    </div>
                  )}
                </td>
                <td className="p-3 font-semibold text-stone-800">{money(row.materialCostPaise)}</td>
                <td className="p-3 text-stone-600">
                  <div>Machine {money(row.machineCostPaise)}</div>
                  <div>Power {money(row.electricityCostPaise)}</div>
                </td>
                <td className="p-3 text-stone-600">
                  <div>Labour {money(row.laborCostPaise)}</div>
                  <div>Hardware {money(row.hardwareCostPaise)}</div>
                  <div>Pack {money(row.packagingCostPaise)}</div>
                  <div>Failure {money(row.failureAllowancePaise)}</div>
                </td>
                <td className="p-3 text-sm font-bold text-stone-900">{money(row.totalCostPaise)}</td>
                <td className="p-3 text-sm font-bold text-brand">{money(row.suggestedPricePaise)}</td>
                <td className="p-3">
                  {row.marginPercent != null ? (
                    <span
                      className={
                        row.marginPercent >= 55
                          ? "text-emerald-700 font-bold"
                          : "text-amber-700 font-bold"
                      }
                    >
                      {row.marginPercent.toFixed(0)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3">
                  <select
                    value={row.status}
                    disabled={savingId === row.id}
                    onChange={(e) => updateStatus(row.id, e.target.value)}
                    className="rounded-lg border border-stone-200 bg-white px-2 py-1.5"
                  >
                    {statuses.map((status) => (
                      <option value={status} key={status}>
                        {status.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

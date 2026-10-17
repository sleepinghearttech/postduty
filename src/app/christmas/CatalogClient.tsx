"use client";

import { useMemo, useState } from "react";
import styles from "./christmas.module.css";

export type ChristmasCandidate = {
  id: string;
  slug: string;
  name: string;
  category: string;
  store_role: string | null;
  short_description: string | null;
  source_platform: string;
  source_url: string;
  source_author: string | null;
  source_license: string | null;
  license_status: string;
  attribution_required: boolean;
  commercial_license_required: boolean;
  source_rating: number | null;
  source_rating_count: number | null;
  source_downloads: number | null;
  source_likes: number | null;
  source_reviews: number | null;
  print_time_minutes: number | null;
  filament_grams: number | null;
  recommended_colors: string[] | null;
  image_url: string | null;
  suggested_price_paise: number | null;
  status: string;
  is_hero: boolean;
  priority: number;
};

function money(paise: number | null) {
  if (paise == null) return "TBD";
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

function hours(minutes: number | null) {
  if (!minutes) return "Slice needed";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function licenseLabel(value: string) {
  if (value === "free_commercial") return "Commercial use included";
  if (value === "commercial_available") return "Commercial licence available";
  if (value === "paid_commercial") return "Paid commercial licence";
  if (value === "not_sellable") return "Do not sell";
  return "Licence needs verification";
}
export default function CatalogClient({
  candidates,
}: {
  candidates: ChristmasCandidate[];
}) {
  const [items, setItems] = useState(candidates);
  const [category, setCategory] = useState("All");
  const [license, setLicense] = useState("All");
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(items.map((c) => c.category))).sort()],
    [items]
  );

  const visible = useMemo(() => {
    return items.filter((candidate) => {
      const categoryOk = category === "All" || candidate.category === category;
      const licenseOk =
        license === "All" ||
        (license === "Free commercial" && candidate.license_status === "free_commercial") ||
        (license === "Licence needed" &&
          ["commercial_available", "paid_commercial"].includes(candidate.license_status));
      const q = query.trim().toLowerCase();
      const searchOk =
        !q ||
        candidate.name.toLowerCase().includes(q) ||
        candidate.category.toLowerCase().includes(q) ||
        (candidate.short_description || "").toLowerCase().includes(q);
      return categoryOk && licenseOk && searchOk;
    });
  }, [items, category, license, query]);

  async function setDecision(id: string, status: string) {
    setSavingId(id);
    try {
      const response = await fetch("/api/admin/christmas-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not save decision");
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, status } : item))
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save decision");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <div className={styles.catalogToolbar}>
        <div className={styles.searchWrap}>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search lanterns, ornaments, DIY kits..."
            aria-label="Search Christmas product concepts"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select value={license} onChange={(e) => setLicense(e.target.value)}>
          <option>All</option>
          <option>Free commercial</option>
          <option>Licence needed</option>
        </select>
        <div className={styles.resultCount}>{visible.length} concepts</div>
      </div>

      <div className={styles.conceptGrid}>
        {visible.map((candidate) => (
          <article
            className={candidate.is_hero ? styles.conceptCardHero : styles.conceptCard}
            key={candidate.id}
          >
            <div className={styles.conceptImage}>
              {candidate.image_url ? (
                <img src={candidate.image_url} alt={candidate.name} />
              ) : (
                <div className={styles.conceptPlaceholder}>
                  <span>✦</span>
                  <small>Source preview</small>
                </div>
              )}
              <div className={styles.conceptBadges}>
                {candidate.is_hero && <span className={styles.heroBadge}>Hero</span>}
                <span>{candidate.category}</span>
              </div>
            </div>

            <div className={styles.conceptBody}>
              <div className={styles.conceptTopline}>
                <span>{candidate.source_platform}</span>
                <span>{candidate.status.replace("_", " ")}</span>
              </div>
              <h3>{candidate.name}</h3>
              <p>{candidate.short_description}</p>

              <div className={styles.quickStats}>
                <div>
                  <span>Print</span>
                  <strong>{hours(candidate.print_time_minutes)}</strong>
                </div>
                <div>
                  <span>Filament</span>
                  <strong>
                    {candidate.filament_grams != null
                      ? `${candidate.filament_grams} g`
                      : "Slice needed"}
                  </strong>
                </div>
                <div>
                  <span>Target</span>
                  <strong>{money(candidate.suggested_price_paise)}</strong>
                </div>
              </div>
              <div className={styles.licenseRow}>
                <span
                  className={
                    candidate.license_status === "free_commercial"
                      ? styles.licenseFree
                      : styles.licensePaid
                  }
                >
                  {licenseLabel(candidate.license_status)}
                </span>
                {candidate.attribution_required && <small>Attribution required</small>}
              </div>

              <div className={styles.socialProof}>
                {candidate.source_rating != null && (
                  <span>★ {candidate.source_rating.toFixed(1)}</span>
                )}
                {candidate.source_rating_count != null && (
                  <span>{candidate.source_rating_count} ratings</span>
                )}
                {candidate.source_downloads != null && (
                  <span>{candidate.source_downloads.toLocaleString()} downloads</span>
                )}
                {candidate.source_likes != null && (
                  <span>{candidate.source_likes.toLocaleString()} likes</span>
                )}
              </div>

              {candidate.recommended_colors?.length ? (
                <div className={styles.colorLine}>
                  <span>Suggested:</span> {candidate.recommended_colors.join(" · ")}
                </div>
              ) : null}

              <a
                className={styles.sourceButton}
                href={candidate.source_url}
                target="_blank"
                rel="noreferrer"
              >
                View source model <span aria-hidden="true">↗</span>
              </a>

              <div className={styles.decisionRow}>
                <button
                  type="button"
                  disabled={savingId === candidate.id}
                  className={candidate.status === "shortlisted" ? styles.decisionActive : styles.decisionButton}
                  onClick={() => setDecision(candidate.id, "shortlisted")}
                >
                  Shortlist
                </button>
                <button
                  type="button"
                  disabled={savingId === candidate.id}
                  className={candidate.status === "approved" ? styles.decisionApproveActive : styles.decisionButton}
                  onClick={() => setDecision(candidate.id, "approved")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={savingId === candidate.id}
                  className={candidate.status === "rejected" ? styles.decisionRejectActive : styles.decisionButton}
                  onClick={() => setDecision(candidate.id, "rejected")}
                >
                  Reject
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

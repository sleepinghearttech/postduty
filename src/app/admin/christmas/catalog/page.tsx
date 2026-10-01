import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import CatalogClient, { type ChristmasCandidate } from "@/app/christmas/CatalogClient";
import styles from "@/app/christmas/christmas.module.css";

export default async function ChristmasCatalogLabPage() {
  const { data, error } = await supabaseAdmin
    .from("christmas_product_candidates")
    .select(
      "id,slug,name,category,store_role,short_description,source_platform,source_url,source_author,source_license,license_status,attribution_required,commercial_license_required,source_rating,source_rating_count,source_downloads,source_likes,source_reviews,print_time_minutes,filament_grams,recommended_colors,image_url,suggested_price_paise,status,is_hero,priority"
    )
    .neq("license_status", "not_sellable")
    .order("priority", { ascending: true });

  if (error) console.error("Failed to load Christmas candidate catalog:", error.message);

  const candidates = (data || []) as ChristmasCandidate[];
  const hero = candidates.find((candidate) => candidate.is_hero) || candidates[0];

  return (
    <main className={styles.page}>
      <section className={styles.shopHero}>
        <div className={styles.shopHeroCopy}>
          <p className={styles.kicker}>Private Christmas Product Lab</p>
          <h1>Choose what PostDuty should <span>actually make.</span></h1>
          <p>
            This is your internal visual decision board. Products shown here are
            research candidates, not customer listings.
          </p>
          <div className={styles.shopHeroActions}>
            <a href="#catalog" className={styles.primaryCta}>Browse candidates ↓</a>
            <Link href="/admin/christmas" className={styles.secondaryCta}>
              Economics dashboard
            </Link>
          </div>
        </div>
        {hero && (
          <div className={styles.heroProductPanel}>
            <div className={styles.heroProductImage}>
              {hero.image_url ? <img src={hero.image_url} alt={hero.name} /> : <div className={styles.heroProductPlaceholder}>✦</div>}
              <span>Current hero</span>
            </div>
            <div className={styles.heroProductMeta}>
              <p>{hero.category}</p>
              <h2>{hero.name}</h2>
              <span>{hero.short_description}</span>
              <div>
                <strong>{hero.suggested_price_paise ? "₹" + Math.round(hero.suggested_price_paise / 100) + " target" : "Price TBD"}</strong>
                <a href={hero.source_url} target="_blank" rel="noreferrer">Source model ↗</a>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className={styles.catalogIntro}>
        <div>
          <p className={styles.sectionKicker}>Candidate shelf</p>
          <h2>Research first. Manufacture later.</h2>
        </div>
        <p>
          Shortlist visually here, then use the economics dashboard to approve,
          reject, test-print and eventually publish.
        </p>
      </section>

      <section id="catalog" className={styles.catalogSection}>
        <CatalogClient candidates={candidates} />
      </section>
    </main>
  );
}

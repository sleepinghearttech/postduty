import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import CatalogClient, { type ChristmasCandidate } from "./CatalogClient";
import styles from "./christmas.module.css";

export default async function ChristmasPage() {
  const { data, error } = await supabaseAdmin
    .from("christmas_product_candidates")
    .select(
      "id,slug,name,category,store_role,short_description,source_platform,source_url,source_author,source_license,license_status,attribution_required,commercial_license_required,source_rating,source_rating_count,source_downloads,source_likes,source_reviews,print_time_minutes,filament_grams,recommended_colors,image_url,suggested_price_paise,status,is_hero,priority"
    )
    .neq("license_status", "not_sellable")
    .order("priority", { ascending: true });

  if (error) {
    console.error("Failed to load Christmas catalog:", error.message);
  }

  const candidates = (data || []) as ChristmasCandidate[];
  const hero = candidates.find((candidate) => candidate.is_hero) || candidates[0];
  return (
    <main className={styles.page}>
      <section className={styles.shopHero}>
        <div className={styles.shopHeroCopy}>
          <p className={styles.kicker}>Christmas by PostDuty · Product Lab</p>
          <h1>
            A Christmas shop built
            <span> one print at a time.</span>
          </h1>
          <p>
            Browse every product we are considering for Christmas 2026.
            Nothing appears in the live store until it has been test-printed,
            costed and commercially cleared.
          </p>
          <div className={styles.shopHeroActions}>
            <a href="#catalog" className={styles.primaryCta}>
              Browse all product ideas <span aria-hidden="true">↓</span>
            </a>
            <Link href="/admin/christmas" className={styles.secondaryCta}>
              Open decision dashboard
            </Link>
          </div>
          <div className={styles.shopTrust}>
            <span>{candidates.length} researched concepts</span>
            <span>Licence tracked</span>
            <span>Print economics linked</span>
          </div>
        </div>

        {hero && (
          <div className={styles.heroProductPanel}>
            <div className={styles.heroProductImage}>
              {hero.image_url ? (
                <img src={hero.image_url} alt={hero.name} />
              ) : (
                <div className={styles.heroProductPlaceholder}>✦</div>
              )}
              <span>Hero product</span>
            </div>
            <div className={styles.heroProductMeta}>
              <p>{hero.category}</p>
              <h2>{hero.name}</h2>
              <span>{hero.short_description}</span>
              <div>
                <strong>
                  {hero.suggested_price_paise
                    ? `₹${Math.round(hero.suggested_price_paise / 100)} target`
                    : "Price TBD"}
                </strong>
                <a href={hero.source_url} target="_blank" rel="noreferrer">
                  Source model ↗
                </a>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className={styles.catalogIntro}>
        <div>
          <p className={styles.sectionKicker}>The product map</p>
          <h2>See the whole shelf before we manufacture it.</h2>
        </div>
        <p>
          Use this page as the visual decision board. The admin dashboard contains
          the detailed costs, filament choices, licence notes and approval controls.
        </p>
      </section>

      <section id="catalog" className={styles.catalogSection}>
        <CatalogClient candidates={candidates} />
      </section>

      <section className={styles.catalogFooter}>
        <div>
          <p className={styles.sectionKicker}>How a concept becomes a product</p>
          <h2>Research → licence → test print → cost → approve → sell.</h2>
        </div>
        <Link href="/admin/christmas">Review economics and approvals →</Link>
      </section>
    </main>
  );
}

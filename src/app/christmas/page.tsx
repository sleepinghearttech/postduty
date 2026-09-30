import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";
import styles from "./christmas.module.css";

function formatPriceAmount(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function ProductPlaceholder() {
  return (
    <div className={styles.productPlaceholder} aria-hidden="true">
      <svg viewBox="0 0 120 120" className={styles.placeholderMark}>
        <path d="M60 15 72 42l29 3-22 19 7 28-26-15-26 15 7-28-22-19 29-3Z" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="1" opacity=".35" />
      </svg>
    </div>
  );
}

export default async function ChristmasPage() {
  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load Christmas collection:", error.message);
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.snow} aria-hidden="true" />
        <div className={styles.heroOrnaments} aria-hidden="true">
          <span className={styles.threadOne} />
          <span className={styles.threadTwo} />
          <span className={styles.threadThree} />
          <span className={styles.baubleOne}>✦</span>
          <span className={styles.baubleTwo}>P</span>
          <span className={styles.baubleThree}>✶</span>
        </div>

        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>PostDuty Christmas · 2026</p>
            <div className={styles.goldRule} />
            <h1>
              For the ones still
              <span> showing up </span>
              this Christmas.
            </h1>
            <p className={styles.heroText}>
              A warmer, more festive side of PostDuty — thoughtful little gifts
              for the people who spend the season caring for everyone else.
            </p>

            <div className={styles.heroActions}>
              <a href="#christmas-edit" className={styles.primaryCta}>
                Enter the Christmas edit
                <span aria-hidden="true">↘</span>
              </a>
              <Link href="/" className={styles.secondaryCta}>
                Visit PostDuty
              </Link>
            </div>

            <div className={styles.heroTrust}>
              <span>Shared PostDuty cart</span>
              <i aria-hidden="true" />
              <span>Secure checkout</span>
              <i aria-hidden="true" />
              <span>India-wide delivery</span>
            </div>
          </div>

          <div className={styles.heroStillLife} aria-hidden="true">
            <div className={styles.halo} />
            <div className={styles.giftShadow} />
            <div className={styles.giftBox}>
              <div className={styles.giftRibbonVertical} />
              <div className={styles.giftRibbonHorizontal} />
              <div className={styles.giftSeal}>PD</div>
            </div>
            <div className={styles.giftTag}>
              <span>after duty,</span>
              <strong>merry christmas.</strong>
            </div>
            <span className={styles.sparkleA}>✦</span>
            <span className={styles.sparkleB}>✧</span>
          </div>
        </div>
      </section>

      <section className={styles.editorialStrip}>
        <p>Small gifts.</p>
        <span>Warm lights.</span>
        <p>A little Christmas after duty.</p>
      </section>

      <section className={styles.moments}>
        <div className={styles.sectionHeading}>
          <p className={styles.sectionKicker}>Gift by moment</p>
          <h2>A reason for every little present.</h2>
          <p>
            The same PostDuty collection, reframed for the small exchanges that
            make December feel special.
          </p>
        </div>

        <div className={styles.momentGrid}>
          <a href="#christmas-edit" className={styles.momentCard}>
            <span className={styles.momentNumber}>01</span>
            <div>
              <p>For Secret Santa</p>
              <span>Small, useful, easy to love.</span>
            </div>
            <b aria-hidden="true">↗</b>
          </a>
          <a href="#christmas-edit" className={styles.momentCard}>
            <span className={styles.momentNumber}>02</span>
            <div>
              <p>For your ward person</p>
              <span>A thank-you after the long shifts.</span>
            </div>
            <b aria-hidden="true">↗</b>
          </a>
          <a href="#christmas-edit" className={styles.momentCard}>
            <span className={styles.momentNumber}>03</span>
            <div>
              <p>For yourself</p>
              <span>You made it through the year too.</span>
            </div>
            <b aria-hidden="true">↗</b>
          </a>
        </div>
      </section>

      <section id="christmas-edit" className={styles.collection}>
        <div className={styles.collectionHeader}>
          <div>
            <p className={styles.sectionKicker}>The Christmas edit</p>
            <h2>PostDuty, dressed for December.</h2>
          </div>
          <p className={styles.collectionNote}>
            The products stay real. The atmosphere changes completely.
          </p>
        </div>

        {!products || products.length === 0 ? (
          <div className={styles.emptyState}>
            <span>✦</span>
            <h3>The shelves are being dressed.</h3>
            <p>Your active PostDuty products will appear here automatically.</p>
          </div>
        ) : (
          <div className={styles.productGrid}>
            {products.map((product: Product, index: number) => (
              <Link
                key={product.id}
                href={`/products/${product.slug}`}
                className={styles.productCard}
              >
                <div className={styles.productImageWrap}>
                  <span className={styles.cardIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className={styles.productImage}
                    />
                  ) : (
                    <ProductPlaceholder />
                  )}
                  <div className={styles.imageGlow} />
                </div>

                <div className={styles.productMeta}>
                  <div>
                    <h3>{product.name}</h3>
                    <p>{product.stock > 0 ? "Ready to gift" : "Out of stock"}</p>
                  </div>
                  <div className={styles.price}>
                    <span>₹</span>{formatPriceAmount(product.price)}
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <span>View gift</span>
                  <span aria-hidden="true">↗</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className={styles.storyPanel}>
        <div className={styles.storyArt} aria-hidden="true">
          <span className={styles.storyStar}>✦</span>
          <div className={styles.storyCircle}>
            <span>PD</span>
          </div>
          <svg viewBox="0 0 320 180" className={styles.storyBranches}>
            <path d="M18 146c56-18 82-72 96-126M58 118c18-8 28-26 39-46M86 84c-18-4-30-14-42-27M302 154c-58-24-88-82-104-140M260 119c-18-9-29-27-40-48M226 82c20-3 34-15 46-29" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="88" cy="86" r="4" fill="currentColor" />
            <circle cx="232" cy="86" r="4" fill="currentColor" />
          </svg>
        </div>
        <div className={styles.storyCopy}>
          <p className={styles.sectionKicker}>The feeling</p>
          <h2>Less festive clutter. More Christmas atmosphere.</h2>
          <p>
            Rich colour, quiet motion, generous photography and small handcrafted
            details make this feel like a seasonal boutique — not a template with
            snowflakes pasted on top.
          </p>
          <a href="#christmas-edit">Browse the edit <span aria-hidden="true">→</span></a>
        </div>
      </section>

      <section className={styles.closing}>
        <span className={styles.closingStar}>✦</span>
        <p className={styles.kicker}>Christmas belongs to the people working through it, too.</p>
        <h2>After duty, come home to Christmas.</h2>
        <a href="#christmas-edit" className={styles.primaryCta}>
          Shop the Christmas edit
          <span aria-hidden="true">↑</span>
        </a>
      </section>
    </main>
  );
}

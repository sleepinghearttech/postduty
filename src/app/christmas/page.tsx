import Link from "next/link";
import { supabase } from "@/lib/supabase";
import styles from "./christmas.module.css";

type LiveCandidate = {
  id: string;
  product_id: string;
  is_hero: boolean;
  priority: number;
};

type StoreProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  image_url: string | null;
  stock: number;
  is_active: boolean;
};

export default async function ChristmasPage() {
  const { data: liveCandidates } = await supabase
    .from("christmas_product_candidates")
    .select("id,product_id,is_hero,priority")
    .eq("status", "live")
    .not("product_id", "is", null)
    .order("priority", { ascending: true });

  const candidates = (liveCandidates || []) as LiveCandidate[];
  const productIds = candidates.map((candidate) => candidate.product_id);

  let products: StoreProduct[] = [];
  if (productIds.length) {
    const { data } = await supabase
      .from("products")
      .select("id,name,slug,description,price,image_url,stock,is_active")
      .in("id", productIds)
      .eq("is_active", true);
    products = (data || []) as StoreProduct[];
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const orderedProducts = candidates
    .map((candidate) => ({
      candidate,
      product: productMap.get(candidate.product_id),
    }))
    .filter((item): item is { candidate: LiveCandidate; product: StoreProduct } => !!item.product);

  const hero =
    orderedProducts.find((item) => item.candidate.is_hero)?.product ||
    orderedProducts[0]?.product;

  return (
    <main className={styles.page}>
      <section className={styles.shopHero}>
        <div className={styles.shopHeroCopy}>
          <p className={styles.kicker}>Christmas by PostDuty · 2026</p>
          <h1>
            Small-batch Christmas,
            <span> made after duty.</span>
          </h1>
          <p>
            A seasonal collection of 3D-printed ornaments, light-up decor,
            personalised gifts and small festive objects — tested, costed and
            made in limited batches.
          </p>
          {orderedProducts.length > 0 ? (
            <div className={styles.shopHeroActions}>
              <a href="#shop" className={styles.primaryCta}>
                Shop the collection ↓
              </a>
              <Link href="/" className={styles.secondaryCta}>
                Back to PostDuty
              </Link>
            </div>
          ) : (
            <div className={styles.shopHeroActions}>
              <span className={styles.primaryCta}>Collection being prepared</span>
              <Link href="/" className={styles.secondaryCta}>
                Back to PostDuty
              </Link>
            </div>
          )}
        </div>

        <div className={styles.heroProductPanel}>
          <div className={styles.heroProductImage}>
            {hero?.image_url ? (
              <img src={hero.image_url} alt={hero.name} />
            ) : (
              <div className={styles.heroProductPlaceholder}>✦</div>
            )}
            <span>{hero ? "Seasonal favourite" : "Christmas 2026"}</span>
          </div>
          <div className={styles.heroProductMeta}>
            <p>{hero ? "Christmas by PostDuty" : "In preparation"}</p>
            <h2>{hero?.name || "The Christmas collection is being curated."}</h2>
            <span>
              {hero?.description ||
                "Only products that pass our print, finish, licensing and costing checks will appear here."}
            </span>
            {hero && (
              <div>
                <strong>₹{Math.round(hero.price / 100).toLocaleString("en-IN")}</strong>
                <Link href={"/products/" + hero.slug}>View product →</Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.catalogIntro}>
        <div>
          <p className={styles.sectionKicker}>Christmas collection</p>
          <h2>
            {orderedProducts.length
              ? "Made in small batches, ready to gift."
              : "We are testing the first batch now."}
          </h2>
        </div>
        <p>
          Candidate research, licensing notes and production economics remain
          private. Customers only see products that are fully approved and live.
        </p>
      </section>

      <section id="shop" className={styles.catalogSection}>
        {orderedProducts.length === 0 ? (
          <div className={styles.emptyState}>
            <span>✦</span>
            <h3>Nothing is on sale yet.</h3>
            <p>The first approved Christmas products will appear here automatically.</p>
          </div>
        ) : (
          <div className={styles.productGrid}>
            {orderedProducts.map(({ product }) => (
              <Link
                key={product.id}
                href={"/products/" + product.slug}
                className={styles.productCard}
              >
                <div className={styles.productImageWrap}>
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className={styles.productImage} />
                  ) : (
                    <div className={styles.productPlaceholder}>✦</div>
                  )}
                </div>
                <div className={styles.productMeta}>
                  <div>
                    <h3>{product.name}</h3>
                    <p>{product.stock > 0 ? "Available" : "Sold out"}</p>
                  </div>
                  <div className={styles.price}>
                    ₹{Math.round(product.price / 100).toLocaleString("en-IN")}
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <span>View product</span>
                  <span aria-hidden="true">↗</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

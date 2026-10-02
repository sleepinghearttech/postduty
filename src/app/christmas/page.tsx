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

const previewIdeas = [
  { name: "LED Christmas Lantern", category: "Hero lighting", note: "Lantern-led centrepiece for the first shortlist." },
  { name: "Personalised Ornaments", category: "Tree decor", note: "Name-led keepsakes designed for low-cost gifting." },
  { name: "Snowman Decor", category: "Festive decor", note: "Small-batch tabletop pieces for easy display." },
  { name: "Lithophane Keepsakes", category: "Personalised", note: "Photo-led gifts to test after print and finish checks." },
  { name: "DIY Paint Kits", category: "Family activity", note: "Paintable festive kits for gifting and children." },
  { name: "Faith Ornaments", category: "Tree decor", note: "Classic seasonal ornaments with licence review before sale." },
];

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
      <section
        className={styles.shopHero}
        style={{ minHeight: "520px", paddingTop: "52px", paddingBottom: "52px" }}
      >
        <div className={styles.shopHeroCopy}>
          <p className={styles.kicker}>
            {hero ? "Christmas by PostDuty · 2026" : "Owner selection preview · Christmas 2026"}
          </p>
          <h1>
            {hero ? "Small-batch Christmas," : "Choose the Christmas line,"}
            <span>{hero ? " made after duty." : " before we print it."}</span>
          </h1>
          <p>
            {hero
              ? "A seasonal collection of 3D-printed ornaments, light-up decor, personalised gifts and small festive objects — tested, costed and made in limited batches."
              : "Review the first product directions now. This branch preview is for choosing what to make; nothing here is for sale and the customer-facing store comes later."}
          </p>
          <div className={styles.shopHeroActions}>
            <a href="#shop" className={styles.primaryCta}>
              {hero ? "Shop the collection ↓" : "Review product ideas ↓"}
            </a>
            <Link
              href={hero ? "/" : "/admin/christmas/catalog"}
              className={styles.secondaryCta}
            >
              {hero ? "Back to PostDuty" : "Open private decision board"}
            </Link>
          </div>
          {!hero && (
            <div className={styles.shopTrust}>
              <span>Review-only preview</span>
              <span>No checkout actions</span>
              <span>Printer stays manual</span>
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
            <span>{hero ? "Seasonal favourite" : "Lantern hero candidate"}</span>
          </div>
          <div className={styles.heroProductMeta}>
            <p>{hero ? "Christmas by PostDuty" : "Owner selection preview"}</p>
            <h2>{hero?.name || "LED Christmas Lantern"}</h2>
            <span>
              {hero?.description ||
                "The lantern stays the hero while the rest of the Christmas range is shortlisted, costed and test-printed."}
            </span>
            {hero ? (
              <div>
                <strong>₹{Math.round(hero.price / 100).toLocaleString("en-IN")}</strong>
                <Link href={"/products/" + hero.slug}>View product →</Link>
              </div>
            ) : (
              <div>
                <strong>Review only · not for sale</strong>
                <Link href="/admin/christmas/catalog">Decision board →</Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.catalogIntro} style={{ paddingTop: "52px" }}>
        <div>
          <p className={styles.sectionKicker}>
            {hero ? "Christmas collection" : "Candidate shelf"}
          </p>
          <h2>
            {hero
              ? "Made in small batches, ready to gift."
              : "Pick the range first. Turn it into a shop later."}
          </h2>
        </div>
        <p>
          {hero
            ? "Only products that have completed print, finish, licensing and costing checks are shown."
            : "These cards are planning concepts only. Review them visually, then use the private decision board to shortlist."}
        </p>
      </section>

      <section id="shop" className={styles.catalogSection}>
        {orderedProducts.length === 0 ? (
          <div className={styles.conceptGrid}>
            {previewIdeas.map((idea, index) => (
              <article
                key={idea.name}
                className={index === 0 ? styles.conceptCardHero : styles.conceptCard}
              >
                <div className={styles.conceptImage}>
                  <div className={styles.conceptPlaceholder}>
                    <span>✦</span>
                    <small>{index === 0 ? "Hero candidate" : "Product direction"}</small>
                  </div>
                  <div className={styles.conceptBadges}>
                    {index === 0 && <span className={styles.heroBadge}>Hero</span>}
                    <span>{idea.category}</span>
                  </div>
                </div>
                <div className={styles.conceptBody}>
                  <div className={styles.conceptTopline}>
                    <span>Owner review</span>
                    <span>Not for sale</span>
                  </div>
                  <h3>{idea.name}</h3>
                  <p>{idea.note}</p>
                </div>
              </article>
            ))}
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
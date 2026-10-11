import Link from "next/link";
import styles from "./landing.module.css";
import { featuredProjects, type FeaturedProject } from "@/lib/featured-projects";

const rings = Array.from({ length: 21 }, (_, index) => index);
const filaments = Array.from({ length: 15 }, (_, index) => index);

function SignalMark() {
  return (
    <svg viewBox="0 0 38 38" fill="none" aria-hidden="true">
      <path d="M7 5H29L33 9V31H7V5Z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 20H11L14 15L19 25L23 11L27 20H35" stroke="#B5F6D1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OrbitalSculpture() {
  return (
    <svg
      className={styles.orbGraphic}
      viewBox="0 0 640 640"
      fill="none"
      role="img"
      aria-label="Abstract three-dimensional wireframe sculpture surrounded by an electrocardiogram-inspired light trace"
    >
      <defs>
        <radialGradient id="pd-orb-aura">
          <stop offset="0" stopColor="#2EE8AF" stopOpacity=".29" />
          <stop offset=".55" stopColor="#3774BA" stopOpacity=".09" />
          <stop offset="1" stopColor="#10151B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pd-orb-lines" x1="130" y1="130" x2="505" y2="540">
          <stop stopColor="#C5FFF0" />
          <stop offset=".45" stopColor="#7B9AFA" />
          <stop offset="1" stopColor="#D2BAFE" />
        </linearGradient>
        <linearGradient id="pd-pulse" x1="20" y1="0" x2="620" y2="0">
          <stop stopColor="#A5FAE5" stopOpacity="0" />
          <stop offset=".2" stopColor="#A5FAE5" stopOpacity=".35" />
          <stop offset=".48" stopColor="#A5FAE5" />
          <stop offset=".82" stopColor="#A5FAE5" stopOpacity=".5" />
          <stop offset="1" stopColor="#A5FAE5" stopOpacity="0" />
        </linearGradient>
        <filter id="pd-halo" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      <circle cx="320" cy="318" r="292" fill="url(#pd-orb-aura)" />
      <circle cx="320" cy="318" r="249" stroke="#86A8BF" strokeOpacity=".14" strokeDasharray="1 10" />
      <circle cx="320" cy="318" r="217" stroke="#86A8BF" strokeOpacity=".1" />
      <circle cx="320" cy="318" r="266" stroke="#86A8BF" strokeOpacity=".09" />
      <path d="M320 29V92M320 547V611M29 318H93M548 318H612" stroke="#B6DBD6" strokeOpacity=".28" strokeWidth="1.3" />

      <g className={styles.sculptureRotation}>
        <circle cx="320" cy="318" r="155" fill="#061C26" fillOpacity=".46" />
        {rings.map((index) => (
          <ellipse
            key={index}
            cx="320"
            cy="318"
            rx={164 + (index % 3) * 3}
            ry={72 + (index % 4) * 4}
            transform={"rotate(" + index * 8.6 + " 320 318)"}
            stroke="url(#pd-orb-lines)"
            strokeWidth={index % 5 === 0 ? "1.8" : "1"}
            strokeOpacity={index % 4 === 0 ? ".75" : ".36"}
          />
        ))}
        <ellipse cx="320" cy="318" rx="160" ry="162" stroke="#ACF9E3" strokeOpacity=".22" strokeDasharray="4 7" />
        <circle cx="320" cy="318" r="8" fill="#D6FFF3" fillOpacity=".83" />
        <circle cx="320" cy="318" r="26" stroke="#C2FDEB" strokeOpacity=".32" />
      </g>
      <path
        d="M17 365H144L167 365L186 349L207 388L234 275L260 435L288 365H391L413 365L432 355L449 373L464 331L480 365H623"
        stroke="url(#pd-pulse)" strokeWidth="5.5" filter="url(#pd-halo)" strokeLinejoin="round" opacity=".68"
      />
      <path
        d="M17 365H144L167 365L186 349L207 388L234 275L260 435L288 365H391L413 365L432 355L449 373L464 331L480 365H623"
        stroke="url(#pd-pulse)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round"
      />
      <circle cx="234" cy="275" r="3.5" fill="#C8FFE9" />
      <circle cx="464" cy="331" r="2.5" fill="#C8FFE9" />
      <path d="M105 120H151M105 120V165M534 473V519H489" stroke="#C0D5D7" strokeOpacity=".36" />
      <text x="110" y="107" fill="#BBD5D7" fontSize="10" letterSpacing="3">FIG / 001</text>
      <text x="489" y="540" fill="#BBD5D7" fontSize="10" letterSpacing="2">FORM + SIGNAL</text>
    </svg>
  );
}

function ProjectArt({ id }: { id: FeaturedProject["id"] }) {
  if (id === "christmas") {
    return (
      <svg viewBox="0 0 300 190" aria-hidden="true" fill="none">
        <defs>
          <linearGradient id="pd-lantern" x1="80" y1="20" x2="210" y2="170">
            <stop stopColor="#FFD2A3" />
            <stop offset="1" stopColor="#CE916D" stopOpacity=".2" />
          </linearGradient>
        </defs>
        <circle cx="152" cy="93" r="85" stroke="#EDBE8B" strokeOpacity=".1" />
        <path d="M150 23V42M132 32H168M138 32L134 41M162 32L166 41" stroke="#FAD2AD" strokeWidth="1.6" />
        <path d="M111 54L150 35L189 54L202 142L150 171L98 142L111 54Z" stroke="#F8C99C" strokeWidth="1.8" />
        <path d="M111 54L150 75L189 54M150 75V171M98 142L150 115L202 142" stroke="url(#pd-lantern)" strokeWidth="1.3" />
        <path d="M111 54L125 151M189 54L175 151M130 44L138 162M170 44L162 162" stroke="#F8C99C" strokeOpacity=".4" />
        <path d="M150 94C141 107 139 112 150 125C161 112 159 107 150 94Z" fill="#F6B46B" fillOpacity=".68" />
        <circle cx="150" cy="112" r="24" fill="#E9A05F" opacity=".18" />
        <path d="M65 108H92M208 108H236M150 5V19" stroke="#F8C99C" strokeOpacity=".42" strokeDasharray="3 5" />
      </svg>
    );
  }

  if (id === "clads") {
    return (
      <svg viewBox="0 0 300 190" aria-hidden="true" fill="none">
        <rect x="47" y="29" width="206" height="132" rx="14" stroke="#B5D0FF" strokeOpacity=".77" strokeWidth="1.8" />
        <rect x="57" y="40" width="186" height="110" rx="7" fill="#779BD9" fillOpacity=".09" />
        <path d="M72 77H228M72 103H228M72 129H228M95 53V141M127 53V141M159 53V141M191 53V141" stroke="#7D9CCC" strokeOpacity=".14" />
        <path d="M67 103H104L113 90L125 115L138 67L151 130L163 103H200L210 92L222 103H234" stroke="#B4FFD9" strokeWidth="2.7" strokeLinejoin="round" />
        <circle cx="228" cy="54" r="3" fill="#B4FFD9" />
        <rect x="106" y="168" width="88" height="4" rx="2" fill="#ABCDF9" fillOpacity=".5" />
        <path d="M149 161V169" stroke="#ABCDF9" strokeOpacity=".5" strokeWidth="3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 300 190" aria-hidden="true" fill="none">
      <path d="M150 18L225 59V139L150 181L75 139V59L150 18Z" stroke="#D8C6FF" strokeWidth="1.8" />
      <path d="M75 59L150 101L225 59M150 101V181" stroke="#D8C6FF" strokeWidth="1.6" />
      {filaments.map((index) => (
        <path
          key={index}
          d={"M" + (81 + index * 4.6) + " " + (62 + index * 2.8) + "L" + (150 + index * 0.0) + " " + (103 + index * 4.7) + "L" + (220 - index * 4.6) + " " + (62 + index * 2.8)}
          stroke="#CBB1FF"
          strokeOpacity=".3"
          strokeWidth=".9"
        />
      ))}
      <path d="M75 59L150 18L225 59L150 101L75 59Z" fill="#CBB1FF" fillOpacity=".07" />
      <path d="M55 58V140M245 58V140M111 13H189" stroke="#D8C6FF" strokeOpacity=".28" strokeDasharray="3 6" />
      <circle cx="150" cy="101" r="4" fill="#E5D6FF" />
    </svg>
  );
}

function ProjectCard({ project }: { project: FeaturedProject }) {
  const className = [styles.projectCard, styles["card_" + project.id], !project.href ? styles.cardPending : ""].join(" ");
  const body = (
    <>
      <div className={styles.projectTop}>
        <span>{project.number} / {project.category}</span>
        <span className={styles.projectArrow} aria-hidden="true">{project.href ? "↗" : "· · ·"}</span>
      </div>
      <div className={styles.projectArt}><ProjectArt id={project.id} /></div>
      <div className={styles.projectBottom}>
        <div>
          <h3>{project.title}</h3>
          <p>{project.description}</p>
        </div>
        <span className={styles.statusLabel}>
          <span className={project.href ? styles.liveDot : styles.pendingDot} />
          {project.href ? "EXPLORE" : "IN THE WORKS"}
        </span>
      </div>
    </>
  );
  if (!project.href) {
    return <article className={className}>{body}</article>;
  }
  if (project.href.startsWith("/")) {
    return <Link href={project.href} className={className}>{body}</Link>;
  }
  return (
    <a href={project.href} className={className} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  );
}

export default function CreativeHomePage() {
  const projects = featuredProjects.filter((project) => project.featured);

  return (
    <main id="top" className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.topbar}>
        <Link href="/" className={styles.wordmark} aria-label="PostDuty home">
          <span className={styles.mark}><SignalMark /></span>
          <span>POST<span className={styles.wordmarkMuted}>DUTY</span><span className={styles.wordmarkDot}>.</span></span>
        </Link>
        <div className={styles.headerRight}>
          <span className={styles.locationTag}>INDEPENDENT CREATIVE SPACE / IN</span>
          <a href="#creator" className={styles.aboutNav}>ABOUT</a>
          <a href="#work" className={styles.indexLink}>EXPLORE <span aria-hidden="true">↘</span></a>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><span className={styles.signalDot} /> NOT JUST A DAY JOB <span className={styles.serial}>/ 001</span></div>
          <h1 id="hero-title" className={styles.headline}>
            <span className={styles.headlineRow}>AFTER</span>
            <span className={styles.headlineRow}><em>the</em>SHIFT<span className={styles.headlinePeriod}>.</span></span>
          </h1>
          <p className={styles.intro}>Medicine. Machines. Making.<br /><span>Curiosity doesn’t clock out.</span></p>
          <div className={styles.heroBottom}>
            <a href="#work" className={styles.exploreButton}>ENTER THE STUDIO <span aria-hidden="true">↗</span></a>
            <span className={styles.heroMeta}>CARDIAC ANAESTHESIA <span>×</span> TECHNOLOGY <span>×</span> 3D PRINT</span>
          </div>
        </div>
        <div className={styles.visualWrap}>
          <div className={styles.orbStage}>
            <OrbitalSculpture />
            <span className={styles.twinkle} aria-hidden="true" />
          </div>
          <div className={styles.orbCalloutA}>PULSE <span>↗</span> FORM</div>
          <div className={styles.orbCalloutB}>ITERATION / ∞</div>
        </div>
      </section>

      <div className={styles.ticker} aria-hidden="true">
        <span>01 / THE HUMAN SIGNAL</span><span className={styles.tickerLine} /><span>02 / THE DIGITAL WORLD</span><span className={styles.tickerLine} /><span>03 / THE PHYSICAL OBJECT</span>
      </div>

      <section id="work" className={styles.work} aria-labelledby="work-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionLabel}>SELECTED EXPERIMENTS / {String(projects.length).padStart(2, "0")}</p>
            <h2 id="work-title">A few worlds<br /><em>in progress.</em></h2>
          </div>
          <p>Different disciplines.<br />One curious mind.</p>
        </div>
        <div className={styles.projectGrid}>
          {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
        </div>
        <p className={styles.note}>A growing collection of things imagined, coded and made after hours.</p>
      </section>

      <section id="creator" className={styles.creator} aria-labelledby="creator-title">
        <div className={styles.creatorVisual} aria-hidden="true">
          <span className={styles.creatorOrbit} />
          <span className={styles.creatorOrbitInner} />
          <span className={styles.creatorMonogram}>JF<span>.</span></span>
          <span className={styles.creatorVisualTag}>WHERE SCIENCE MEETS CURIOSITY</span>
        </div>
        <div className={styles.creatorText}>
          <p className={styles.sectionLabel}>THE PERSON BEHIND THE PROJECTS / 004</p>
          <h2 id="creator-title">About <em>the creator.</em></h2>
          <p className={styles.creatorName}>DR. JIJO FRANCIS</p>
          <p className={styles.creatorRole}>Cardiac Anaesthesiologist · Intensivist · Medical Technology Innovator</p>
          <p className={styles.creatorIntro}>Somewhere between the operating theatre and the digital workshop, I build things that make work—and life—a little more interesting.</p>
          <div className={styles.creatorCredentials}>
            <span>AIIMS NEW DELHI</span><span>PGIMER CHANDIGARH</span><span>JIPMER</span>
          </div>
          <a className={styles.portfolioLink} href="https://drjijofrancis.netlify.app/" target="_blank" rel="noopener noreferrer">
            EXPLORE MY PROFESSIONAL PORTFOLIO <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>POSTDUTY<span>.</span>IN</span>
        <span>© {new Date().getFullYear()} · MADE AFTER THE SHIFT</span>
        <a href="#top" aria-label="Back to top">BACK TO TOP ↑</a>
      </footer>
    </main>
  );
}

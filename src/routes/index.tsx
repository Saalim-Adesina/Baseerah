import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Timeline, { type TimelineItem } from "@/components/ui/timeline";
import logoMark from "@/assets/logo-mark.png";
import cityPhoto from "@/assets/landing-city.jpg";
import handoverPhoto from "@/assets/landing-handover.jpg";
import heroPhoto from "@/assets/landing-hero.webp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Baseerah — Liquidity for private markets" },
      {
        name: "description",
        content:
          "A new way to buy and sell stakes in private companies and funds, starting in Qatar.",
      },
      { property: "og:title", content: "Baseerah — Liquidity for private markets" },
      {
        property: "og:description",
        content: "GP-led, LP-led and founder-led secondaries, starting in Doha.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  component: Landing,
});

// Type and control styles shared across the page, from the Baseerah Landing
// Page design: Geist for copy, Geist Mono uppercase for labels and buttons.
const mono = "font-['Geist_Mono',ui-monospace,monospace]";
const eyebrowDark = `${mono} m-0 text-xs uppercase tracking-[0.1em] text-[#77c9b3]`;
const eyebrowLight = `${mono} m-0 text-xs uppercase tracking-[0.1em] text-[#2b6e5f]`;
const sectionTitle =
  "m-0 font-['Geist',sans-serif] text-[clamp(32px,3.6vw,48px)] font-normal leading-[1.12] tracking-[-0.035em]";
const pill = `${mono} inline-flex min-h-11 items-center rounded-full px-6 text-xs uppercase tracking-[0.08em] transition-colors`;
// Photos fill their box behind the content; ink washes keep white type legible.
const photo = "absolute inset-0 h-full w-full object-cover";

const NAV = [
  { href: "#types", label: "Secondaries" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

const STATS = [
  { value: "$3B", label: "committed to QIA's Fund of Funds programme" },
  { value: "6 years", label: "average exit horizon for MENA venture investors" },
  { value: "2", label: "MENA startup IPOs in 2025" },
];

const AUDIENCES = [
  "Fund managers",
  "Limited partners",
  "Family offices",
  "Angel investors",
  "Founders",
];

const SALE_TYPES = [
  {
    audience: "For fund managers",
    title: "GP-led",
    body: "Give your investors an option for liquidity while you keep backing the companies you believe in.",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M9 20V10" />
      </>
    ),
  },
  {
    audience: "For investors and LPs",
    title: "LP-led",
    body: "Sell a fund interest or a direct stake to a new investor, on your own timeline.",
    icon: (
      <>
        <path d="M7 17 17 7" />
        <path d="M7 7h10v10" />
      </>
    ),
  },
  {
    audience: "For founders and teams",
    title: "Founder-led",
    body: "Take some value off the table as the company grows, in a way that works for everyone involved.",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </>
    ),
  },
];

// Module-level so the timeline's animation setup sees a stable array.
const STEPS: TimelineItem[] = [
  {
    id: "step-1",
    label: "01",
    title: "Tell us what you're looking for",
    description: "Whether you want to buy or sell.",
  },
  {
    id: "step-2",
    label: "02",
    title: "Meet the right counterparty",
    description: "We connect you securely with vetted institutaitonal investors, ",
  },
  {
    id: "step-3",
    label: "03",
    title: "Close with confidence",
    description: "We take care of the details along the way.",
  },
  {
    id: "step-4",
    label: "04",
    title: "Settle securely",
    description: "Funds and shares change hands safely.",
  },
];

const FAQ = [
  {
    q: "What is Baseerah?",
    a: "Baseerah is a Qatar-based startup helping investors unlock liquidity from their private holdings, from fund interests to direct stakes in private companies.",
  },
  {
    q: "How is Baseerah different from a bank deal brokerage?",
    a: "Baseerah value propsotiions is built on delivering better-matched counterparties and a faster path from first conversation to close for investors.",
  },
  {
    q: "Is Baseerah live?",
    a: "Baseerah is at it's early stage building partnerships with relevant stakeholders in Qatar's private-markets landscape ahead of launch.",
  },
  {
    q: "Who is it for?",
    a: "Fund managers, investors and founders in private markets, starting with Qatar.",
  },
];

// The five things Baseerah gives an investor, floating around the headline.
const HERO_CHIPS = [
  {
    label: "Liquidity",
    className: "top-[30%] left-[35%]",
    tint: "bg-[#77c9b3]",
    icon: (
      <>
        <path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11Z" />
      </>
    ),
  },
  {
    label: "Speed",
    className: "top-[23%] right-[5%]",
    tint: "bg-[#c9eadf]",
    icon: (
      <>
        <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />
      </>
    ),
  },
  {
    label: "Matching",
    className: "top-[55%] right-[3%]",
    tint: "bg-[#77c9b3]",
    icon: (
      <>
        <circle cx="9" cy="12" r="5" />
        <circle cx="15" cy="12" r="5" />
      </>
    ),
  },
  {
    label: "Simplicity",
    className: "top-[40%] left-[3%]",
    tint: "bg-[#c9eadf]",
    icon: (
      <>
        <path d="M5 12.5 10 17 19 7" />
      </>
    ),
  },
  {
    label: "Flexibility",
    className: "top-[64%] left-[0%]",
    tint: "bg-[#77c9b3]",
    icon: (
      <>
        <path d="M4 7h10" />
        <path d="M18 7h2" />
        <circle cx="16" cy="7" r="2" />
        <path d="M4 17h2" />
        <path d="M10 17h10" />
        <circle cx="8" cy="17" r="2" />
      </>
    ),
  },
];

// Navbar morph: full-width and transparent over the hero, a compact dark-gray
// pill once the hero has scrolled away. `paintNavbar` maps progress 0..1 onto
// inline styles so each animation frame skips React entirely.
const NAVBAR_MS = 420;
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function paintNavbar(wrap: HTMLElement, bar: HTMLElement, p: number) {
  const inset = `${lerp(0, 12, p)}px`;
  wrap.style.paddingTop = inset;
  wrap.style.paddingLeft = inset;
  wrap.style.paddingRight = inset;
  const roomy = window.innerWidth >= 640;
  bar.style.maxWidth = `${lerp(1280, 920, p)}px`;
  bar.style.paddingTop = bar.style.paddingBottom = `${lerp(roomy ? 24 : 20, 10, p)}px`;
  bar.style.paddingLeft = bar.style.paddingRight = `${lerp(roomy ? 32 : 20, roomy ? 24 : 16, p)}px`;
  bar.style.borderRadius = `${lerp(0, 28, p)}px`;
  bar.style.backgroundColor = `rgba(38, 45, 56, ${lerp(0, 0.92, p)})`;
  bar.style.borderColor = `rgba(255, 255, 255, ${lerp(0, 0.08, p)})`;
  bar.style.boxShadow = `0 12px 32px rgba(0, 0, 0, ${lerp(0, 0.28, p)})`;
  const blur = `blur(${lerp(0, 14, p)}px)`;
  bar.style.backdropFilter = blur;
  bar.style.setProperty("-webkit-backdrop-filter", blur);
}

function Icon({ children, size, stroke }: { children: ReactNode; size: number; stroke: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={size < 16 ? 2.4 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function Wordmark({ size }: { size: "nav" | "footer" }) {
  return (
    <span className="flex items-center gap-2.5 text-white">
      <img
        src={logoMark}
        alt=""
        className={size === "nav" ? "h-[30px] w-[30px] object-contain" : "h-7 w-7 object-contain"}
      />
      <span
        className={`font-semibold tracking-[-0.035em] ${size === "nav" ? "text-xl" : "text-lg"}`}
      >
        Baseerah
      </span>
    </span>
  );
}

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const heroRef = useRef<HTMLElement>(null);
  const navWrapRef = useRef<HTMLElement>(null);
  const navBarRef = useRef<HTMLDivElement>(null);

  // Tween the navbar between its two looks whenever the hero enters or leaves
  // the viewport; a fresh trigger mid-tween starts from wherever it got to.
  useEffect(() => {
    const hero = heroRef.current;
    const wrap = navWrapRef.current;
    const bar = navBarRef.current;
    if (!hero || !wrap || !bar) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let progress = 0;
    let from = 0;
    let target = 0;
    let startedAt = 0;
    let frame = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / NAVBAR_MS);
      progress = lerp(from, target, easeOutCubic(t));
      paintNavbar(wrap, bar, progress);
      if (t < 1) frame = requestAnimationFrame(step);
    };

    const animateTo = (next: number) => {
      if (next === target) return;
      target = next;
      from = progress;
      cancelAnimationFrame(frame);
      if (reduceMotion) {
        progress = next;
        paintNavbar(wrap, bar, progress);
        return;
      }
      startedAt = performance.now();
      frame = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      ([entry]) => animateTo(entry?.isIntersecting ? 0 : 1),
      { rootMargin: "-96px 0px 0px 0px" },
    );
    observer.observe(hero);
    const onResize = () => paintNavbar(wrap, bar, progress);
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <main className="bg-[#131922] font-['Geist',system-ui,sans-serif] text-[#131922] antialiased">
      {/* NAVBAR: pinned; morphs into a floating pill once the hero is gone */}
      <header ref={navWrapRef} className="fixed inset-x-0 top-0 z-50">
        <div
          ref={navBarRef}
          className="mx-auto box-border w-full max-w-[1280px] border border-transparent px-5 py-5 sm:px-8 sm:py-6"
        >
          <div className="flex items-center justify-between gap-4">
            <a href="#top" aria-label="Baseerah home" onClick={closeMenu}>
              <Wordmark size="nav" />
            </a>
            <nav
              aria-label="Main"
              className={`${mono} hidden gap-7 text-xs uppercase tracking-[0.08em] md:flex`}
            >
              {NAV.map((item) => (
                <a key={item.href} href={item.href} className="text-[#e6ecf0] hover:text-[#a6dccd]">
                  {item.label}
                </a>
              ))}
            </nav>
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="landing-menu"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 md:hidden"
            >
              <Icon size={20} stroke="currentColor">
                {menuOpen ? (
                  <>
                    <path d="M6 6l12 12" />
                    <path d="M18 6 6 18" />
                  </>
                ) : (
                  <>
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h16" />
                  </>
                )}
              </Icon>
            </button>
          </div>

          {menuOpen ? (
            <nav
              id="landing-menu"
              aria-label="Main"
              className="mt-4 flex flex-col gap-1 rounded-[20px] border border-white/10 bg-[#131922]/95 p-3 backdrop-blur md:hidden"
            >
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className={`${mono} flex min-h-11 items-center rounded-xl px-4 text-[13px] uppercase tracking-[0.08em] text-[#e6ecf0] hover:bg-white/10`}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      {/* HERO: photo runs behind the navbar */}
      <section
        ref={heroRef}
        id="top"
        className="relative flex min-h-[640px] flex-col overflow-hidden bg-[#131922] sm:min-h-[860px]"
      >
        <img src={heroPhoto} alt="" className={`${photo} object-[70%_100%]`} />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(19,25,34,.55)_0%,rgba(19,25,34,.25)_35%,rgba(19,25,34,.7)_75%,#131922_100%)]"
        />

        <div className="relative z-[1] mx-auto box-border flex w-full max-w-[1100px] flex-1 flex-col items-center justify-end px-5 pb-20 pt-32 text-center sm:px-8 sm:pb-[120px] sm:pt-36">
          {HERO_CHIPS.map((chip) => (
            <span
              key={chip.label}
              className={`absolute hidden items-center gap-2 rounded-full border border-white/15 bg-white/10 py-2 pl-2 pr-3.5 text-[13px] text-[#e6ecf0] min-[861px]:inline-flex ${chip.className}`}
            >
              <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-full ${chip.tint}`}
              >
                <Icon size={12} stroke="#131922">
                  {chip.icon}
                </Icon>
              </span>
              {chip.label}
            </span>
          ))}

          <h1 className="m-0 max-w-[820px] font-['Geist',sans-serif] text-[clamp(44px,6.4vw,84px)] font-normal leading-[1.04] tracking-[-0.045em] text-white">
            Liquidity for private markets
          </h1>
          <p className="mt-5 max-w-[560px] text-base leading-[1.55] text-[#d5dce2] sm:mt-6 sm:text-lg">
            A new way to buy and sell stakes in private companies and funds, starting in Qatar.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <a
              href="#types"
              className={`${pill} min-h-12 border border-white/35 px-7 text-[13px] text-white hover:bg-white/10`}
            >
              Learn more
            </a>
          </div>
        </div>
      </section>

      {/* WHY NOW */}
      <section className="mx-auto box-border flex max-w-[1280px] flex-wrap gap-6 px-5 pb-16 pt-20 sm:gap-12 sm:px-8 sm:pb-24 sm:pt-28">
        <p className={`${eyebrowDark} flex-[1_1_220px]`}>• Why now</p>
        <div className="min-w-0 flex-[999_1_640px]">
          <h2 className={`${sectionTitle} text-[#77c9b3]`}>
            Private markets are growing. Liquidity hasn't kept up.
          </h2>
          <p className="mt-5 max-w-[600px] text-[17px] leading-[1.6] text-[#c5ced6]">
            Capital is flowing into the region, but exits take time. We think there's a better way
            to unlock value along the way.
          </p>
          <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-8 sm:mt-14">
            {STATS.map((stat) => (
              <div key={stat.value} className="border-t border-white/15 pt-5">
                <p className="m-0 text-[44px] font-light leading-none sm:text-[52px] tracking-[-0.045em] text-white">
                  {stat.value}
                </p>
                <p className="mt-2.5 text-sm leading-[1.5] text-[#a9b4bf]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BUILT FOR STRIP */}
      <section
        aria-label="Who Baseerah is for"
        className="border-y border-white/10 px-5 py-7 sm:px-8"
      >
        <p className="mx-auto max-w-[1280px] text-center text-[15px] leading-[1.6] text-[#c5ced6]">
          <span className={`${mono} mr-3 text-[11px] uppercase tracking-[0.1em] text-[#8a96a3]`}>
            Built for
          </span>
          {AUDIENCES.join(", ")}
        </p>
      </section>

      {/* LIGHT BODY */}
      <div className="bg-[#f6faf8]">
        {/* PROBLEM */}
        <section className="mx-auto box-border flex max-w-[1280px] flex-wrap items-center gap-10 px-5 pb-16 pt-20 sm:gap-14 sm:px-8 sm:pb-24 sm:pt-[120px]">
          <div className="min-w-0 flex-[999_1_560px]">
            <p className={`${eyebrowLight} mb-4`}>• The problem</p>
            <h2 className={`${sectionTitle} max-w-[620px]`}>Value locked in private companies</h2>
            <p className="mt-5 max-w-[540px] text-[17px] leading-[1.6] text-[#3d4652]">
              Holding a private stake often means waiting years for an exit. Selling early is slow,
              manual and hard to navigate. Baseerah is building a simpler path.
            </p>
          </div>
          <div className="w-full max-w-[420px] flex-[1_1_300px] rounded-[20px] border border-[#131922]/[.07] bg-white/85 p-6 shadow-[0_8px_28px_rgba(19,25,34,.07)]">
            <div className="flex items-center justify-between">
              <p className="m-0 text-[15px] font-semibold">Secondary request</p>
            </div>
            <p
              className={`${mono} mb-1 mt-5 text-[11px] uppercase tracking-[0.08em] text-[#5b6572]`}
            >
              Private company stake
            </p>
            <p className="m-0 text-[40px] font-light leading-[1.1] tracking-[-0.045em]">
              LP-led sale
            </p>
            <dl className="m-0 mt-5 flex flex-col gap-2.5 text-sm">
              {[
                ["Stage", "Matching"],
                ["Counterparties", "Vetted"],
                ["Process", "Managed end to end"],
              ].map(([term, detail]) => (
                <div
                  key={term}
                  className="flex justify-between border-t border-[#131922]/[.07] pt-2.5"
                >
                  <dt className="text-[#5b6572]">{term}</dt>
                  <dd className="m-0 font-medium">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* SALE TYPES */}
        <section
          id="types"
          className="mx-auto box-border max-w-[1280px] px-5 pb-20 pt-8 sm:px-8 sm:pb-[120px] sm:pt-12"
        >
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className={`${eyebrowLight} mb-4`}>• Secondaries</p>
              <h2 className={sectionTitle}>Three ways to liquidity</h2>
            </div>
          </div>
          <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-5 sm:mt-12">
            {SALE_TYPES.map((type) => (
              <article
                key={type.title}
                className="flex flex-col gap-3.5 rounded-[20px] bg-[#e9f2ee] p-6 sm:p-7"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#131922]">
                  <Icon size={20} stroke="#77c9b3">
                    {type.icon}
                  </Icon>
                </span>
                <p
                  className={`${mono} mb-0 mt-2 text-[11px] uppercase tracking-[0.1em] text-[#2b6e5f]`}
                >
                  {type.audience}
                </p>
                <h3 className="m-0 font-['Geist',sans-serif] text-[22px] font-medium tracking-[-0.03em]">
                  {type.title}
                </h3>
                <p className="m-0 text-[15px] leading-[1.6] text-[#3d4652]">{type.body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      {/* HOW IT WORKS: pinned horizontal timeline, scrubbed by scroll */}
      <Timeline
        id="how"
        items={STEPS}
        title="How it works"
        backgroundColor="#131922"
        textColor="#ffffff"
        mutedTextColor="#a9b4bf"
        activeColor="#77c9b3"
        imageUrl={handoverPhoto}
        imageAlt="One person handing a document folder to another"
        duration={1.4}
      />

      {/* FAQ */}
      <section id="faq" className="bg-[#f6faf8] px-5 py-20 sm:px-8 sm:py-[120px]">
        <div className="mx-auto flex max-w-[1280px] flex-wrap gap-8 sm:gap-14">
          <div className="flex-[1_1_320px]">
            <p className={`${eyebrowLight} mb-4`}>• Questions</p>
            <h2 className={sectionTitle}>FAQ</h2>
          </div>
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-[20px] bg-[#e9f2ee] px-6 py-5 sm:px-7 sm:py-6">
                <h3 className="m-0 font-['Geist',sans-serif] text-lg font-medium tracking-[-0.02em]">
                  {item.q}
                </h3>
                <p className="mt-2 text-[15px] leading-[1.6] text-[#3d4652]">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CLOSING: photo fills the whole section */}
      <section
        aria-labelledby="closing-title"
        className="relative overflow-hidden bg-[#1c2430] px-5 py-28 text-center sm:px-8 sm:py-40"
      >
        <img src={cityPhoto} alt="" className={photo} />
        <div aria-hidden="true" className="absolute inset-0 bg-[#131922]/60" />
        <h2
          id="closing-title"
          className="relative mx-auto max-w-[820px] font-['Geist',sans-serif] text-[clamp(36px,4.6vw,64px)] font-normal leading-[1.08] tracking-[-0.045em] text-white"
        >
          The best time to unlock value isn't always the exit.
        </h2>
        <p className="relative mx-auto mt-6 max-w-[560px] text-[17px] leading-[1.6] text-[#d5dce2]">
          Private stakes are built to be held for years. Baseerah is building a way to move them
          sooner, on terms that work for everyone at the table.
        </p>
      </section>

      {/* FOOTER */}
      <footer className="mx-auto box-border max-w-[1280px] overflow-hidden px-5 pt-16 sm:px-8 sm:pt-[72px]">
        <Wordmark size="footer" />
        <p className="mt-4 max-w-[380px] text-sm leading-[1.6] text-[#a9b4bf]">
          We're building liquidity for private markets, starting in Doha.
        </p>
        <p
          aria-hidden="true"
          className="mb-[-0.18em] mt-12 whitespace-nowrap text-center font-['Geist',sans-serif] text-[clamp(64px,21vw,300px)] font-medium leading-[0.9] tracking-[-0.06em] text-[#77c9b3]"
        >
          Baseerah
        </p>
      </footer>
    </main>
  );
}

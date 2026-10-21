// Built using Hyperiux Vault: https://vault.hyperiux.com
// Adapted for Baseerah: the original's hard-coded dated milestones became an
// `items` prop, laid out alternately above and below the line.
import { type CSSProperties, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText);
}

/* Inline stand-in for @gsap/react's useGSAP. Mirrors its default
   `revertOnUpdate: false`: one gsap.context lives for the component's
   lifetime, the callback is re-added when dependencies change, and the
   context is reverted only on unmount. A callback may return its own
   cleanup, which runs before the next re-add and on unmount. */
function useGSAP(
  callback: () => void | (() => void),
  options?: {
    dependencies?: unknown[];
    scope?: { current: Element | null } | Element | null;
  },
) {
  const deps = options?.dependencies ?? [];
  const scope = options?.scope;
  const ctxRef = useRef<gsap.Context | null>(null);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  useLayoutEffect(() => {
    const el =
      scope && typeof scope === "object" && "current" in scope
        ? scope.current
        : (scope as Element | null);
    ctxRef.current = gsap.context(() => {}, el ?? undefined);
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = undefined;
      ctxRef.current?.revert();
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!ctxRef.current) return;
    cleanupRef.current?.();
    const ret = ctxRef.current.add(callback);
    cleanupRef.current = typeof ret === "function" ? ret : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export type TimelineItem = {
  id: string;
  /** Small mono label above the title, e.g. "01". */
  label: string;
  title: string;
  description: string;
};

type SplitTextInstance = InstanceType<typeof SplitText>;

export type TimelineProps = {
  id?: string;
  /** In order; even indexes sit above the line, odd ones below. */
  items: TimelineItem[];
  title?: string;
  periodLabel?: string;
  textColor?: string;
  mutedTextColor?: string;
  activeColor?: string;
  backgroundColor?: string;
  imageUrl: string;
  imageAlt?: string;
  /** Reveal animation duration, in seconds. */
  duration?: number;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const mediaQueryList = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQueryList.addEventListener("change", callback);

  return () => mediaQueryList.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  if (typeof window === "undefined") return false;

  return window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches ?? false;
}

function getServerReducedMotionSnapshot() {
  return false;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot,
  );
}

/*
 * Track geometry, in vw. Everything that decides what is on screen derives
 * from these numbers: steps sit `step` apart so a 100vw viewport holds two
 * at most, and `travel` carries the image and title fully off-screen by the
 * time the second step arrives. The JSX below uses the same values through
 * CSS variables, so keep the two in step when tuning.
 */
type Geometry = {
  /** Total track width. */
  track: number;
  /** Where the content (title, line, steps) starts on the track. */
  contentStart: number;
  /** First step's offset from the content start. */
  firstStep: number;
  /** Distance between consecutive steps. */
  step: number;
  /** How far the track slides by the end of the section. */
  travel: number;
  /** Viewport x at which a step begins to reveal. */
  enterAt: number;
};

const DESKTOP: Geometry = {
  track: 265,
  contentStart: 40,
  firstStep: 30,
  step: 50,
  travel: 160,
  enterAt: 75,
};

const MOBILE: Geometry = {
  track: 506,
  contentStart: 99,
  firstStep: 70,
  step: 85,
  travel: 412,
  enterAt: 60,
};

/** Point on the 0..1 scroll timeline where step `index` starts revealing. */
function revealAt(geometry: Geometry, index: number) {
  const x = geometry.contentStart + geometry.firstStep + index * geometry.step;
  return Math.min(0.9, Math.max(0.02, (x - geometry.enterAt) / geometry.travel));
}

export default function Timeline({
  id,
  items,
  title = "",
  periodLabel = "",
  textColor = "var(--color-foreground, #000000)",
  mutedTextColor = "var(--color-muted-foreground, #3f3f46)",
  activeColor = "#ff5f00",
  backgroundColor = "var(--color-background, #ffffff)",
  imageUrl,
  imageAlt = "",
  duration = 1.2,
}: TimelineProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const wholeSliderRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  // Share of the scroll timeline one step's reveal takes.
  const revealSpan = Math.min(0.2, Math.max(0.04, 0.07 * duration));
  const sectionStyle: CSSProperties = {
    color: textColor,
    backgroundColor,
  };
  const activeStyle: CSSProperties = {
    backgroundColor: activeColor,
  };
  const mutedTextStyle: CSSProperties = {
    color: mutedTextColor,
  };
  const labelStyle: CSSProperties = {
    color: activeColor,
  };

  // One scrubbed timeline drives everything: the slide, the line, and each
  // step's reveal at the moment it slides into view.
  useGSAP(
    () => {
      const section = sectionRef.current;
      const slider = wholeSliderRef.current;

      if (!section || !slider) return;

      const geometry = window.innerWidth < 600 ? MOBILE : DESKTOP;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
        },
        defaults: { ease: "none" },
      });

      tl.fromTo(
        slider,
        { xPercent: 0 },
        { xPercent: -(geometry.travel / geometry.track) * 100, duration: 1 },
        0,
      );
      tl.fromTo(".journey-line", { width: "0%" }, { width: "100%", duration: 1 }, 0);

      if (reducedMotion) {
        gsap.set([".journey-stem", ".journey-dot"], { scale: 1 });
        return;
      }

      const splits: SplitTextInstance[] = [];

      items.forEach((item, index) => {
        const at = revealAt(geometry, index);
        const titleSplit = new SplitText(`.title-${item.id}`, { type: "lines", mask: "lines" });
        const descriptionSplit = new SplitText(`.description-${item.id}`, {
          type: "lines",
          mask: "lines",
        });
        splits.push(titleSplit, descriptionSplit);

        tl.fromTo(`.jl-${item.id}`, { scaleY: 0 }, { scaleY: 1, duration: revealSpan * 0.6 }, at)
          .fromTo(`.jd-${item.id}`, { scale: 0 }, { scale: 1, duration: revealSpan * 0.4 }, at)
          .fromTo(
            titleSplit.lines,
            { yPercent: 100 },
            { yPercent: 0, duration: revealSpan, stagger: 0.01, ease: "power2.out" },
            at + revealSpan * 0.3,
          )
          .fromTo(
            descriptionSplit.lines,
            { yPercent: 100 },
            { yPercent: 0, duration: revealSpan, stagger: 0.01, ease: "power2.out" },
            at + revealSpan * 0.45,
          );
      });

      const handleResize = () => {
        ScrollTrigger.refresh();
      };

      window.addEventListener("resize", handleResize);

      return () => {
        splits.forEach((split) => split.revert());
        window.removeEventListener("resize", handleResize);
      };
    },
    { dependencies: [items, revealSpan, reducedMotion], scope: sectionRef },
  );

  const itemCopy = (item: TimelineItem) => (
    <>
      <p
        className="m-0 font-['Geist_Mono',ui-monospace,monospace] text-[1vw] tracking-[0.08em] max-[600px]:text-[3.4vw]"
        style={labelStyle}
      >
        {item.label}
      </p>
      <h3
        className={`title-${item.id} m-0 font-['Geist',sans-serif] text-[2.2vw] font-medium leading-[1.05] tracking-[-0.03em] max-[600px]:text-[6.4vw]`}
      >
        {item.title}
      </h3>
      <p
        className={`description-${item.id} m-0 w-[90%] text-[1.3vw] leading-[1.3] max-[600px]:text-[4.4vw]`}
        style={mutedTextStyle}
      >
        {item.description}
      </p>
    </>
  );

  return (
    <section
      ref={sectionRef}
      id={id}
      className="relative h-[calc(180vw+100vh)] w-full max-[600px]:h-[500vh]"
      style={sectionStyle}
    >
      <div className="sticky top-0 flex h-screen w-full items-center overflow-hidden">
        <div
          ref={wholeSliderRef}
          className="flex h-[30vw] w-[265vw] shrink-0 items-center gap-[5vw] px-[5vw] max-[600px]:h-[80vh] max-[600px]:w-[506vw] max-[600px]:gap-[7vw] max-[600px]:px-[7vw]"
        >
          <div className="h-full w-[30vw] shrink-0 overflow-hidden rounded-[1vw] max-[600px]:h-[65vw] max-[600px]:w-[85vw] max-[600px]:rounded-[5vw]">
            <img
              src={imageUrl}
              alt={imageAlt}
              draggable={false}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="relative h-full w-[220vw] shrink-0 max-[600px]:w-[400vw]">
            {/* Title, above the line at the content's left edge. */}
            <div className="absolute left-0 top-0 h-1/2 w-[22vw] pt-[1vw] max-[600px]:w-[60vw] max-[600px]:pt-[4vw]">
              <h2 className="m-0 font-['Geist',sans-serif] text-[2.6vw] font-normal leading-[1] tracking-[-0.04em] max-[600px]:text-[8.5vw]">
                {title}
              </h2>
            </div>
            {periodLabel ? (
              <div className="absolute bottom-0 left-0 h-1/2 w-[22vw] pt-[2vw] max-[600px]:w-[60vw] max-[600px]:pt-[5vw]">
                <p
                  className="m-0 font-['Geist_Mono',ui-monospace,monospace] text-[1.1vw] uppercase leading-none tracking-[0.1em] max-[600px]:text-[3.4vw]"
                  style={mutedTextStyle}
                >
                  {periodLabel}
                </p>
              </div>
            ) : null}

            {/* The line the steps hang from. */}
            <div className="absolute left-0 top-1/2 flex w-full -translate-y-1/2 items-center">
              <div
                className="h-[.8vw] w-[.8vw] shrink-0 rounded-full max-[600px]:h-[2vw] max-[600px]:w-[2vw]"
                style={activeStyle}
              ></div>
              <div className="journey-line h-px w-[0%] rounded-full" style={activeStyle}></div>
              <div
                className="h-[.8vw] w-[.8vw] shrink-0 rounded-full max-[600px]:h-[2vw] max-[600px]:w-[2vw]"
                style={activeStyle}
              ></div>
            </div>

            {items.map((item, index) => {
              const isTop = index % 2 === 0;
              const position = {
                "--x-desktop": `${DESKTOP.firstStep + index * DESKTOP.step}vw`,
                "--x-mobile": `${MOBILE.firstStep + index * MOBILE.step}vw`,
              } as CSSProperties;
              const dot = (
                <div
                  className={`journey-dot relative aspect-square size-[1vw] shrink-0 -translate-x-1/2 rounded-full max-[600px]:size-[2.5vw] jd-${item.id}`}
                  style={activeStyle}
                ></div>
              );
              const stem = (
                <div
                  className={`journey-stem w-px flex-1 rounded-full ${isTop ? "origin-bottom" : "origin-top"} jl-${item.id}`}
                  style={activeStyle}
                ></div>
              );

              return (
                <div
                  key={item.id}
                  className={`absolute left-[var(--x-desktop)] h-1/2 w-[32vw] max-[600px]:left-[var(--x-mobile)] max-[600px]:w-[75vw] ${isTop ? "top-0" : "top-1/2"}`}
                  style={position}
                >
                  <div className="absolute left-0 top-0 flex h-full flex-col">
                    {isTop ? (
                      <>
                        {dot}
                        {stem}
                      </>
                    ) : (
                      <>
                        {stem}
                        {dot}
                      </>
                    )}
                  </div>

                  <div
                    className={`flex h-full flex-col space-y-[.8vw] pl-[3vw] max-[600px]:space-y-[2vw] max-[600px]:pl-[7vw] ${isTop ? "justify-start" : "justify-end"}`}
                  >
                    {itemCopy(item)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

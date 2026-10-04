"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Play,
  Target,
  Coins,
  Trophy,
  Shield,
  Eye,
  Zap,
  Globe2,
  Smartphone,
  Gift,
  Dumbbell,
  BookOpen,
  Gamepad2,
  PiggyBank,
  Briefcase,
  GraduationCap,
  Building2,
  Code2,
  Send,
  MessageCircle,
  Share2,
  ChevronDown,
  Mail,
  MapPin,
  Users,
  LayoutDashboard,
  Wallet,
  Award,
  Menu,
  X,
  BookMarked,
  FileText,
  ExternalLink,
  Droplets,
} from "lucide-react";
import { Button } from "~~/components/otterpot/Button";
import {
  BotChatArt,
  BrandLockup,
  OtterLogo,
  FriendsShareArt,
  HeroProductArt,
  type BotChatLabels,
  type FriendsArtLabels,
  type HeroArtLabels,
} from "~~/components/otterpot/BrandMark";
import { LandingLiveStrip } from "~~/components/otterpot/LandingLiveStrip";
import { ReviewsSlider } from "~~/components/otterpot/ReviewsSlider";
import { SwitchTheme } from "~~/components/SwitchTheme";
import { LanguageSwitcher } from "~~/components/ui/LanguageSwitcher";
import { useSiteConfig } from "~~/hooks/otterpot/useSiteConfig";
import { useTranslation } from "~~/lib/i18n";
import { submitContactMessage } from "~~/services/firebase/site";
import { isFirebaseConfigured } from "~~/services/firebase/firebase.config";
import { openTelegramUrl } from "~~/services/telegram/telegram";
import { cn } from "~~/utils/cn";

const partners = ["Arbitrum", "Stylus", "Telegram", "Firebase", "Privy", "Ethereum"];

const headerLinks = [
  ["#como", "nav.howItWorks"],
  ["#presentacion", "nav.demo"],
  ["#feedback", "nav.feedback"],
  ["#equipo", "nav.team"],
  ["#faq", "nav.faq"],
] as const;

// Los textos viven en locales/*.json; acá solo quedan los iconos y las keys.
const pillars = [
  { icon: Target, key: "create" },
  { icon: Coins, key: "fund" },
  { icon: Trophy, key: "win" },
] as const;

const steps = ["create", "invite", "deposit", "complete", "claim"] as const;

const botGuideSteps = ["find", "create", "join", "deposit", "confirm", "payout"] as const;

const MANUAL_VIDEO_URL = "https://www.youtube.com/watch?v=em8TmMHwyNw";

const why = [
  { icon: Shield, key: "secure" },
  { icon: Eye, key: "transparent" },
  { icon: Zap, key: "fast" },
  { icon: Globe2, key: "community" },
  { icon: Smartphone, key: "easy" },
  { icon: Gift, key: "rewards" },
] as const;

const useCases = [
  { icon: Dumbbell, key: "fitness" },
  { icon: BookOpen, key: "learning" },
  { icon: Gamepad2, key: "gaming" },
  { icon: PiggyBank, key: "saving" },
  { icon: Briefcase, key: "teams" },
  { icon: GraduationCap, key: "universities" },
  { icon: Building2, key: "companies" },
  { icon: Code2, key: "hackathons" },
] as const;


const team = [
  { name: "Moises David Cisneros Laura", role: "blockchain" },
  { name: "Luishiño Pericena Choque", role: "frontend" },
  { name: "Julio Cesar Severiche Orellana", role: "backend" },
  { name: "William Yucra", role: "business" },
] as const;

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join("");
}

const gallery = [
  { icon: LayoutDashboard, key: "dashboard" },
  { icon: Target, key: "create" },
  { icon: Wallet, key: "wallet" },
  { icon: Award, key: "ranking" },
  { icon: Users, key: "profile" },
  { icon: Smartphone, key: "mobile" },
] as const;

const faqs = ["blockchain", "funds", "telegram", "noContract", "cost"] as const;

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-otter-border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <span className="pr-2 text-sm font-semibold sm:text-base">{q}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-otter-action transition", open && "rotate-180")} />
      </button>
      {open ? <p className="pb-4 text-sm leading-relaxed text-otter-muted">{a}</p> : null}
    </div>
  );
}

/** Pasos numerados de "Cómo funciona"; también los usa el tutorial del bot. */
function NumberedSteps({
  items,
  className,
}: {
  items: { key: string; title: string; body: string }[];
  className: string;
}) {
  return (
    <ol className={className}>
      {items.map((s, i) => (
        <li key={s.key} className="rounded-2xl border border-otter-border bg-otter-card p-4 sm:p-5">
          <span className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-otter-action text-xs font-bold text-white">
            {i + 1}
          </span>
          <h3 className="font-bold">{s.title}</h3>
          <p className="mt-1 text-sm text-otter-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

function botHandle(username: string) {
  const u = username.replace(/^@/, "");
  return u ? `@${u}` : "@otter_pot_bot";
}

export function LandingPage() {
  const { config } = useSiteConfig();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [contactMsg, setContactMsg] = useState("");
  const [contactErr, setContactErr] = useState("");
  const [contactBusy, setContactBusy] = useState(false);

  const bot = botHandle(config.telegramBotUsername);

  const heroArtLabels: HeroArtLabels = {
    aria: t("art.hero.aria"),
    challenge: t("art.hero.challenge"),
    goal: t("art.hero.goal"),
    pot: t("art.hero.pot"),
    locked: t("art.hero.locked"),
    deposited: t("art.hero.deposited"),
    vote: t("art.hero.vote"),
    chipTelegram: t("art.hero.chipTelegram"),
    chipContract: t("art.hero.chipContract"),
    chipFriends: t("art.hero.chipFriends"),
  };
  const botChatLabels: BotChatLabels = {
    aria: t("art.botChat.aria"),
    group: t("art.botChat.group"),
    members: t("art.botChat.members"),
    bot: t("art.botChat.bot"),
    cmdNew: t("art.botChat.cmdNew"),
    setup: t("art.botChat.setup"),
    join: t("art.botChat.join"),
    joined: t("art.botChat.joined"),
    locked: t("art.botChat.locked"),
    cmdConfirm: t("art.botChat.cmdConfirm"),
    paid: t("art.botChat.paid"),
  };
  const friendsArtLabels: FriendsArtLabels = {
    aria: t("art.friends.aria"),
    deposit: t("art.friends.deposit"),
    pot: t("art.friends.pot"),
    potCaption: t("art.friends.potCaption"),
    winner: t("art.friends.winner"),
    refund: t("art.friends.refund"),
  };

  async function onContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setContactMsg("");
    setContactErr("");
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "");
    const email = String(fd.get("email") || "");
    const message = String(fd.get("message") || "");
    setContactBusy(true);
    try {
      await submitContactMessage({ name, email, message });
      setContactMsg(t("contact.success"));
      e.currentTarget.reset();
    } catch (err) {
      setContactErr(err instanceof Error ? err.message : t("contact.error"));
    } finally {
      setContactBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-otter-bg text-otter-text">
      <header className="sticky top-0 z-50 border-b border-otter-border bg-otter-bg/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="min-w-0">
            <BrandLockup />
          </Link>
          {/* Navegación: un solo grupo, en el orden en que aparecen las secciones. */}
          <nav className="hidden items-center gap-5 text-sm text-otter-muted lg:flex">
            {headerLinks.map(([href, key]) => (
              <a key={href} href={href} className="hover:text-otter-text">
                {t(key)}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Preferencias */}
            <LanguageSwitcher />
            <SwitchTheme />
            {/* Acciones, separadas de las preferencias */}
            <span aria-hidden="true" className="hidden h-6 w-px bg-otter-border sm:block" />
            <Link href="/login" className="hidden sm:block">
              <Button size="sm" variant="secondary">{t("nav.signIn")}</Button>
            </Link>
            <Button
              type="button"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => openTelegramUrl(config.telegramBotUrl)}
            >
              <Send className="h-3.5 w-3.5" /> {t("nav.tryBot")}
            </Button>
            <button
              type="button"
              className="rounded-xl border border-otter-border p-2 text-otter-muted lg:hidden"
              aria-label={t("nav.openMenu")}
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label={t("nav.closeMenu")} onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-[min(18rem,88vw)] flex-col border-l border-otter-border bg-otter-card p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <OtterLogo size={36} />
              <button type="button" className="rounded-lg p-2 text-otter-muted" onClick={() => setMenuOpen(false)} aria-label={t("nav.closeMenu")}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 text-sm">
              {[...headerLinks, ["#bot", "nav.botGuide"] as const, ["#contacto", "nav.contact"] as const].map(([href, key]) => [href, t(key)]).map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-otter-muted hover:bg-otter-surface hover:text-otter-text"
                >
                  {label}
                </a>
              ))}
              <Link
                href="/manual/"
                onClick={() => setMenuOpen(false)}
                className="rounded-xl px-3 py-2.5 text-otter-muted hover:bg-otter-surface hover:text-otter-text"
              >
                {t("nav.manual")}
              </Link>
            </nav>
            <div className="mt-auto space-y-2 pt-6">
              <Link href="/login" onClick={() => setMenuOpen(false)}>
                <Button className="w-full">{t("nav.getStarted")}</Button>
              </Link>
              <Button
                type="button"
                variant="telegram"
                className="w-full"
                onClick={() => {
                  openTelegramUrl(config.telegramGroupUrl);
                  setMenuOpen(false);
                }}
              >
                {t("nav.telegramGroup")}
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      <main className="pb-24 lg:pb-0">
        <section className="relative mx-auto grid max-w-6xl items-center gap-8 overflow-hidden px-4 py-8 sm:py-12 md:grid-cols-2 md:gap-10 md:py-16">
          <div className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-otter-action/15 blur-3xl" />
          <div className="relative order-2 md:order-1 animate-[fadeUp_0.6s_ease]">
            <div className="mb-4 flex items-center gap-3 md:hidden">
              <Image src="/otter-logo.png" alt="OtterPot" width={56} height={56} priority className="rounded-2xl" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-otter-action">
                {t("hero.eyebrow")}
              </p>
            </div>
            <p className="hidden text-[11px] font-semibold uppercase tracking-[0.2em] text-otter-action md:block">
              {t("hero.eyebrow")}
            </p>
            <h1 className="mt-2 text-[1.75rem] font-bold leading-[1.12] tracking-tight sm:text-4xl md:mt-3 md:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-otter-muted sm:text-base">
              {t("hero.subtitle")}
            </p>
            <div className="mt-5 flex flex-col gap-2.5 sm:mt-7 sm:flex-row sm:flex-wrap">
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto">
                  {t("hero.ctaPrimary")} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#como" className="w-full sm:w-auto">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  <Play className="h-4 w-4" /> {t("hero.ctaSecondary")}
                </Button>
              </a>
            </div>
            <p className="mt-3 text-xs text-otter-muted">
            <span className="font-semibold text-otter-action">{t("hero.install")}</span>{" "}

            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button type="button" size="sm" variant="telegram" className="w-full sm:w-auto" onClick={() => openTelegramUrl(config.telegramBotUrl)}>
                <Send className="h-3.5 w-3.5" /> {bot}
              </Button>
              <Button type="button" size="sm" variant="secondary" className="w-full sm:w-auto" onClick={() => openTelegramUrl(config.telegramGroupUrl)}>
                <Users className="h-3.5 w-3.5" /> {t("hero.group")}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="w-full sm:w-auto" onClick={() => openTelegramUrl(config.telegramMiniAppUrl)}>
                {t("hero.miniApp")}
              </Button>
              <Link href="/manual/" className="w-full sm:w-auto">
                <Button type="button" size="sm" variant="ghost" className="w-full sm:w-auto">
                  <BookMarked className="h-3.5 w-3.5" /> {t("hero.manual")}
                </Button>
              </Link>
            </div>
          </div>
          <div className="relative order-1 md:order-2 animate-[fadeUp_0.7s_ease]">
            <div className="mx-auto hidden max-w-[7rem] md:mb-4 md:block">
              <Image src="/otter-logo.png" alt={t("hero.mascotAlt")} width={112} height={112} priority className="mx-auto rounded-3xl shadow-lg" />
            </div>
            <HeroProductArt className="mx-auto h-auto w-full max-w-xs sm:max-w-md" labels={heroArtLabels} />
          </div>
        </section>

        {config.showLiveStats ? <LandingLiveStrip /> : null}

        <section className="border-b border-otter-border bg-otter-bg py-6 sm:py-8">
          <div className="mx-auto max-w-6xl px-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-otter-muted">{t("builtOn")}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:gap-x-8">
              {partners.map(p => (
                <span key={p} className="text-xs font-bold tracking-wide text-otter-text/80 sm:text-sm">{p}</span>
              ))}
            </div>
          </div>
        </section>

        <section id="producto" className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{t("product.title")}</h2>
            <p className="mt-3 text-sm text-otter-muted sm:text-base">
              {t("product.subtitle")}
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:mt-10 sm:gap-5 md:grid-cols-3">
            {pillars.map(({ icon: Icon, key }) => (
              <article key={key} className="rounded-2xl border border-otter-border bg-otter-card p-5 sm:p-7">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-otter-action/15 sm:mb-4 sm:h-12 sm:w-12">
                  <Icon className="h-5 w-5 text-otter-action sm:h-6 sm:w-6" />
                </div>
                <h3 className="text-lg font-bold sm:text-xl">{t(`product.pillars.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-otter-muted">{t(`product.pillars.${key}.body`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="como" className="bg-otter-surface py-12 md:py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{t("how.title")}</h2>
              <p className="mt-3 text-sm text-otter-muted">{t("how.subtitle")}</p>
            </div>
            <NumberedSteps
              className="mt-8 grid gap-3 sm:grid-cols-2 md:mt-10 md:grid-cols-5 md:gap-4"
              items={steps.map(key => ({
                key,
                title: t(`how.steps.${key}.title`),
                body: t(`how.steps.${key}.body`),
              }))}
            />
            <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Link href="/manual/">
                <Button size="sm" variant="secondary" className="h-9 px-4 text-sm">
                  {t("how.manuals")} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
              <Link href="/manual/faucets/">
                <Button size="sm" variant="ghost" className="h-9 px-4 text-sm">
                  <Droplets className="h-3.5 w-3.5" /> {t("how.faucets")}
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section id="bot" className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-otter-action">
              {t("botGuide.eyebrow")}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{t("botGuide.title")}</h2>
            <p className="mt-3 text-sm text-otter-muted">{t("botGuide.subtitle")}</p>
          </div>
          <div className="mt-8 grid items-start gap-6 md:mt-10 lg:grid-cols-5">
            <BotChatArt className="mx-auto h-auto w-full max-w-xs lg:col-span-2" labels={botChatLabels} />
            <div className="lg:col-span-3">
              <NumberedSteps
                className="grid gap-3 sm:grid-cols-2 md:gap-4"
                items={botGuideSteps.map(key => ({
                  key,
                  title: t(`botGuide.steps.${key}.title`),
                  body: t(`botGuide.steps.${key}.body`, { bot }),
                }))}
              />
              <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
                <p className="text-xs text-otter-muted">{t("botGuide.note")}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <a href={MANUAL_VIDEO_URL} target="_blank" rel="noreferrer">
                    <Button type="button" size="sm" variant="secondary" className="h-9 px-4 text-sm">
                      <Play className="h-3.5 w-3.5" /> {t("botGuide.watchVideo")}
                    </Button>
                  </a>
                  <Button type="button" size="sm" variant="telegram" className="h-9 px-4 text-sm" onClick={() => openTelegramUrl(config.telegramBotUrl)}>
                    <Send className="h-3.5 w-3.5" /> {t("botGuide.openBot", { bot })}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="presentacion"className="border-y border-otter-border bg-otter-bg py-12 md:py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-otter-action">
                {t("demo.eyebrow")}
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
                {t("demo.title")}
              </h2>
              <p className="mt-3 text-sm text-otter-muted">
                {t("demo.subtitle")}
              </p>
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-5 lg:items-start">
              <div className="overflow-hidden rounded-2xl border border-otter-border bg-otter-card lg:col-span-3">
                <div className="aspect-video bg-otter-surface">
                  <iframe
                    className="h-full w-full"
                    src="https://www.youtube.com/embed/S8C3VcsNtLA"
                    title={t("demo.videoTitle")}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
              <div className="space-y-3 lg:col-span-2">
                <a
                  href="https://www.youtube.com/watch?v=S8C3VcsNtLA"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-2xl border border-otter-border bg-otter-card p-4 transition hover:border-otter-action/40"
                >
                  <Play className="h-5 w-5 shrink-0 text-otter-action" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{t("demo.youtube.title")}</p>
                    <p className="text-xs text-otter-muted">{t("demo.youtube.body")}</p>
                  </div>
                  <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-otter-muted" />
                </a>
                <a
                  href={MANUAL_VIDEO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-2xl border border-otter-border bg-otter-card p-4 transition hover:border-otter-action/40"
                >
                  <Play className="h-5 w-5 shrink-0 text-otter-action" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{t("demo.manualVideo.title")}</p>
                    <p className="text-xs text-otter-muted">{t("demo.manualVideo.body")}</p>
                  </div>
                  <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-otter-muted" />
                </a>
                <a
                  href="https://sleek-falcon-34.convex.cloud/api/storage/d90a9a64-ae76-418c-aacf-ab08ef78acbf"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-2xl border border-otter-border bg-otter-card p-4 transition hover:border-otter-action/40"
                >
                  <FileText className="h-5 w-5 shrink-0 text-otter-action" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{t("demo.pdf.title")}</p>
                    <p className="text-xs text-otter-muted">{t("demo.pdf.body")}</p>
                  </div>
                  <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-otter-muted" />
                </a>
                <Link
                  href="/manual/sencillo/"
                  className="flex items-center gap-3 rounded-2xl border border-otter-border bg-otter-card p-4 transition hover:border-otter-action/40"
                >
                  <BookMarked className="h-5 w-5 shrink-0 text-otter-action" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{t("demo.simpleManual.title")}</p>
                    <p className="text-xs text-otter-muted">{t("demo.simpleManual.body")}</p>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-otter-muted" />
                </Link>
                <Link
                  href="/manual/faucets/"
                  className="flex items-center gap-3 rounded-2xl border border-otter-border bg-otter-card p-4 transition hover:border-otter-action/40"
                >
                  <Droplets className="h-5 w-5 shrink-0 text-otter-action" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{t("demo.faucets.title")}</p>
                    <p className="text-xs text-otter-muted">{t("demo.faucets.body")}</p>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-otter-muted" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="comunidad" className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <Image src="/otter-logo.png" alt="" width={40} height={40} className="rounded-xl" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-otter-action">
                  {t("community.eyebrow")}
                </p>
              </div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
                {t("community.title")}
              </h2>
              <p className="mt-3 text-sm text-otter-muted sm:text-base">
                {t("community.subtitle", { bot })}
              </p>
              <div className="mt-4 overflow-hidden rounded-2xl border border-otter-border">
                <Image
                  src="/telegram-friends.jpg"
                  alt={t("community.imageAlt")}
                  width={900}
                  height={675}
                  className="h-40 w-full object-cover sm:h-48"
                />
              </div>
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                <Button type="button" size="sm" variant="telegram" className="h-9 w-full px-4 text-sm sm:w-auto" onClick={() => openTelegramUrl(config.telegramGroupUrl)}>
                  <Users className="h-3.5 w-3.5" /> {t("community.joinGroup")}
                </Button>
                <Button type="button" size="sm" variant="secondary" className="h-9 w-full px-4 text-sm sm:w-auto" onClick={() => openTelegramUrl(config.telegramBotUrl)}>
                  <Send className="h-3.5 w-3.5" /> {bot}
                </Button>
              </div>
              <ul className="mt-5 space-y-2 text-xs text-otter-muted sm:text-sm">
                <li className="flex items-start gap-2 break-all">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-otter-action" />
                  {config.telegramGroupUrl}
                </li>
                <li className="flex items-center gap-2">
                  <Send className="h-4 w-4 shrink-0 text-otter-action" />
                  {bot}
                </li>
              </ul>
            </div>
            <FriendsShareArt className="w-full" labels={friendsArtLabels} />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{t("why.title")}</h2>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {why.map(({ icon: Icon, key }) => (
              <article key={key} className="rounded-2xl border border-otter-border bg-otter-card p-5">
                <Icon className="h-5 w-5 text-otter-action" />
                <h3 className="mt-3 font-bold">{t(`why.items.${key}.title`)}</h3>
                <p className="mt-2 text-sm text-otter-muted">{t(`why.items.${key}.body`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="casos" className="bg-otter-surface py-12 md:py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{t("useCases.title")}</h2>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
              {useCases.map(({ icon: Icon, key }) => (
                <article key={key} className="rounded-2xl border border-otter-border bg-otter-card p-4 sm:p-5">
                  <Icon className="h-5 w-5 text-otter-action" />
                  <h3 className="mt-2 text-sm font-bold sm:mt-3 sm:text-base">{t(`useCases.items.${key}.title`)}</h3>
                  <p className="mt-1 text-xs text-otter-muted sm:text-sm">{t(`useCases.items.${key}.body`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="feedback" className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-otter-action">
              {t("feedback.eyebrow")}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{t("feedback.title")}</h2>
            <p className="mt-3 text-sm text-otter-muted">{t("feedback.subtitle")}</p>
          </div>
          <div className="mt-8">
            <ReviewsSlider />
          </div>
        </section>

        <section id="equipo" className="py-12 md:py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{t("team.title")}</h2>
            <div className="mt-8 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
              {team.map(({ name, role }) => (
                <article key={name} className="rounded-2xl border border-otter-border bg-otter-card p-4 text-center sm:p-5">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-otter-action/15 text-sm font-bold text-otter-action">
                    {initials(name)}
                  </div>
                  <h3 className="mt-3 text-sm font-bold sm:text-base">{name}</h3>
                  <p className="mt-1 text-xs text-otter-muted sm:text-sm">{t(`team.roles.${role}`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-otter-surface py-12 md:py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{t("gallery.title")}</h2>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.map(({ icon: Icon, key }) => (
                <div key={key} className="overflow-hidden rounded-2xl border border-otter-border bg-otter-card">
                  <div className="flex h-28 items-center justify-center bg-otter-bg sm:h-36">
                    <Icon className="h-9 w-9 text-otter-action sm:h-10 sm:w-10" />
                  </div>
                  <div className="p-4 sm:p-5">
                    <h3 className="font-bold">{t(`gallery.items.${key}.title`)}</h3>
                    <p className="mt-1 text-sm text-otter-muted">{t(`gallery.items.${key}.body`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-otter-bg py-12 md:py-16">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">{t("faq.title")}</h2>
            <div className="mt-8">
              {faqs.map(key => (
                <FaqItem key={key} q={t(`faq.items.${key}.q`)} a={t(`faq.items.${key}.a`)} />
              ))}
            </div>
          </div>
        </section>

        <section id="contacto" className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="grid gap-8 md:grid-cols-2 md:gap-10">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("contact.title")}</h2>
              <p className="mt-3 text-sm text-otter-muted">
                {t("contact.subtitle")}
              </p>
              <ul className="mt-5 space-y-3 text-sm text-otter-muted">
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-otter-action" /> {config.contactEmail}
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-otter-action" /> {t("contact.location")}
                </li>
                <li>
                  <button type="button" onClick={() => openTelegramUrl(config.telegramGroupUrl)} className="flex items-center gap-2 hover:text-otter-text">
                    <Users className="h-4 w-4 text-otter-action" /> {t("contact.telegramGroup")}
                  </button>
                </li>
              </ul>
              {!isFirebaseConfigured ? (
                <p className="mt-4 text-xs font-medium text-otter-action">{t("contact.notConfigured")}</p>
              ) : null}
            </div>
            <form onSubmit={e => void onContact(e)} className="space-y-3 rounded-2xl border border-otter-border bg-otter-card p-5 sm:p-6">
              <label className="block text-sm">
                <span className="mb-1.5 block text-otter-muted">{t("contact.name")}</span>
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  className="h-11 w-full rounded-xl border border-otter-border bg-otter-bg px-3 text-otter-text outline-none focus:border-otter-action"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-otter-muted">{t("contact.email")}</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="h-11 w-full rounded-xl border border-otter-border bg-otter-bg px-3 text-otter-text outline-none focus:border-otter-action"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-otter-muted">{t("contact.message")}</span>
                <textarea
                  name="message"
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={4}
                  className="w-full rounded-xl border border-otter-border bg-otter-bg px-3 py-2 text-otter-text outline-none focus:border-otter-action"
                />
              </label>
              <Button type="submit" className="w-full" disabled={contactBusy || !isFirebaseConfigured}>
                {contactBusy ? t("contact.sending") : t("contact.send")}
              </Button>
              {contactMsg ? <p className="text-sm text-otter-action">{contactMsg}</p> : null}
              {contactErr ? <p className="text-sm text-red-300">{contactErr}</p> : null}
            </form>
          </div>
        </section>

        <section className="border-t border-otter-border bg-otter-card py-12 md:py-16">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <Image src="/otter-logo.png" alt={t("finalCta.mascotAlt")} width={64} height={64} className="mx-auto rounded-2xl" />
            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{t("finalCta.title")}</h2>
            <p className="mt-3 text-sm text-otter-muted">{t("finalCta.subtitle")}</p>
            <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row sm:flex-wrap">
              <Link href="/login">
                <Button size="lg" className="w-full sm:w-auto">{t("finalCta.primary")}</Button>
              </Link>
              <Button size="lg" variant="telegram" type="button" className="w-full sm:w-auto" onClick={() => openTelegramUrl(config.telegramGroupUrl)}>
                {t("finalCta.group")}
              </Button>
              <Button size="lg" variant="secondary" type="button" className="w-full sm:w-auto" onClick={() => openTelegramUrl(config.telegramBotUrl)}>
                {bot}
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Barra fija móvil */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-otter-border bg-otter-bg/95 p-3 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button
            type="button"
            size="sm"
            variant="telegram"
            className="flex-1"
            onClick={() => openTelegramUrl(config.telegramGroupUrl)}
          >
            {t("mobileBar.group")}
          </Button>
          <Link href="/login" className="flex-1">
            <Button size="sm" className="w-full">
              {t("mobileBar.start")}
            </Button>
          </Link>
        </div>
      </div>

      <footer className="border-t border-otter-border bg-otter-bg py-10 sm:py-14">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          <div className="lg:col-span-2">
            <BrandLockup />
            <p className="mt-3 max-w-xs text-sm text-otter-muted">
              {t("footer.tagline")}
            </p>
          </div>
          <div>
            <p className="text-sm font-bold">{t("footer.productHeading")}</p>
            <ul className="mt-3 space-y-2 text-sm text-otter-muted">
              <li><a href="#producto">{t("footer.whatIs")}</a></li>
              <li><a href="#como">{t("footer.howItWorks")}</a></li>
              <li><Link href="/manual/">{t("footer.manual")}</Link></li>
              <li><a href="#presentacion">{t("footer.demo")}</a></li>
              <li><Link href="/login">{t("footer.start")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-bold">{t("footer.communityHeading")}</p>
            <ul className="mt-3 space-y-2 text-sm text-otter-muted">
              <li>
                <button type="button" className="hover:text-otter-text" onClick={() => openTelegramUrl(config.telegramGroupUrl)}>
                  {t("footer.telegramGroup")}
                </button>
              </li>
              <li>
                <button type="button" className="hover:text-otter-text" onClick={() => openTelegramUrl(config.telegramBotUrl)}>
                  {bot}
                </button>
              </li>
              <li className="flex gap-3 pt-1">
                <MessageCircle className="h-4 w-4" />
                <Share2 className="h-4 w-4" />
                <Code2 className="h-4 w-4" />
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-8 flex max-w-6xl flex-col gap-2 border-t border-otter-border px-4 pt-5 text-xs text-otter-muted sm:flex-row sm:items-center sm:justify-between">
          <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
          <p>{t("footer.disclaimer")}</p>
        </div>
      </footer>
    </div>
  );
}

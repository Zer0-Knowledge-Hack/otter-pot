import Image from "next/image";
import { cn } from "~~/utils/cn";

export function BrandMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect width="40" height="40" rx="10" fill="#F47434" />
      <path
        d="M12 26V14h4.2c2.6 0 4.2 1.4 4.2 3.5 0 1.4-.7 2.5-1.9 3.1L22.8 26h-3.4l-3.4-4.8H15.2V26H12zm3.2-7.2h1c1.1 0 1.8-.5 1.8-1.4s-.7-1.4-1.8-1.4h-1v2.8zM24.2 26l3.6-12h3.5l3.6 12h-3.3l-.6-2.2h-3.9l-.6 2.2h-3.3zm5.2-4.8h2.4l-1.2-4.2-1.2 4.2z"
        fill="#111D43"
      />
    </svg>
  );
}

/** Logo: la nutria de OtterPot en una insignia con aro naranja para que resalte en el header. */
export function OtterLogo({ className, size = 44 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2xl bg-otter-action/10 ring-1 ring-otter-action/40",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image src="/otter-logo.png" alt="" width={size} height={size} priority className="h-[88%] w-[88%] object-contain" />
    </span>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <OtterLogo />
      <span className="text-lg font-bold tracking-tight text-otter-text">
        Otter<span className="text-otter-action">Pot</span>
      </span>
    </div>
  );
}

const FONT = "Sora, sans-serif";

export type HeroArtLabels = {
  aria: string;
  challenge: string;
  goal: string;
  pot: string;
  locked: string;
  deposited: string;
  vote: string;
  chipTelegram: string;
  chipContract: string;
  chipFriends: string;
};

const defaultHeroLabels: HeroArtLabels = {
  aria: "Un reto de OtterPot en el teléfono: pozo de 250 USDC bloqueado y 5 de 5 amigos que ya depositaron",
  challenge: "Reto del grupo",
  goal: "Correr 50 km en 30 días",
  pot: "250 USDC",
  locked: "Bloqueado en el contrato",
  deposited: "5/5 depositaron",
  vote: "Votar ganador",
  chipTelegram: "Desde Telegram",
  chipContract: "En Arbitrum",
  chipFriends: "5 amigos",
};

/** Pantalla de la Mini App con un reto en curso: meta, pozo bloqueado, quién depositó y el voto. */
export function HeroProductArt({ className, labels = defaultHeroLabels }: { className?: string; labels?: HeroArtLabels }) {
  const avatars = [
    { x: 178, l: "A" },
    { x: 208, l: "B" },
    { x: 238, l: "C" },
    { x: 268, l: "D" },
    { x: 298, l: "E" },
  ];
  return (
    <svg
      viewBox="0 0 480 420"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={labels.aria}
    >
      {/* Teléfono */}
      <rect x="120" y="20" width="240" height="380" rx="36" fill="#182548" stroke="#F47434" strokeWidth="3" />
      <rect x="140" y="48" width="200" height="320" rx="18" fill="#111D43" />
      <circle cx="240" cy="36" r="4" fill="#8B97B8" />

      {/* Encabezado del reto */}
      <text x="160" y="80" fill="#8B97B8" fontSize="10" fontFamily={FONT} fontWeight="600" letterSpacing="1">
        {labels.challenge.toUpperCase()}
      </text>
      <text x="160" y="100" fill="#F2F4FA" fontSize="13" fontFamily={FONT} fontWeight="700">
        {labels.goal}
      </text>

      {/* Pozo bloqueado */}
      <rect x="160" y="116" width="160" height="66" rx="12" fill="#182548" stroke="rgba(244,116,52,0.5)" />
      <text x="240" y="146" fill="#F47434" fontSize="20" fontFamily={FONT} fontWeight="700" textAnchor="middle">
        {labels.pot}
      </text>
      <g transform="translate(176 158)">
        <rect x="0" y="2" width="9" height="8" rx="1.5" fill="#3DBA7A" />
        <path d="M2 2.5V1a2.5 2.5 0 0 1 5 0v1.5" stroke="#3DBA7A" strokeWidth="1.5" />
      </g>
      <text x="192" y="168" fill="#3DBA7A" fontSize="10" fontFamily={FONT} fontWeight="600">
        {labels.locked}
      </text>

      {/* Quién depositó */}
      {avatars.map(a => (
        <g key={a.l}>
          <circle cx={a.x} cy="212" r="13" fill="#182548" stroke="#F47434" strokeWidth="1.5" />
          <text x={a.x} y="216.5" fill="#F2F4FA" fontSize="11" fontFamily={FONT} fontWeight="700" textAnchor="middle">
            {a.l}
          </text>
          <circle cx={a.x + 9} cy="203" r="5" fill="#3DBA7A" />
          <path d={`M${a.x + 6.8} 203 l1.6 1.6 l3 -3`} stroke="#111D43" strokeWidth="1.3" strokeLinecap="round" />
        </g>
      ))}
      <text x="240" y="246" fill="#8B97B8" fontSize="11" fontFamily={FONT} fontWeight="600" textAnchor="middle">
        {labels.deposited}
      </text>
      <rect x="160" y="256" width="160" height="6" rx="3" fill="#182548" />
      <rect x="160" y="256" width="160" height="6" rx="3" fill="#3DBA7A" />

      {/* Acción */}
      <rect x="160" y="286" width="160" height="40" rx="12" fill="#F47434" />
      <text x="240" y="311" fill="#111D43" fontSize="12" fontFamily={FONT} fontWeight="700" textAnchor="middle">
        {labels.vote}
      </text>

      {/* Chips flotantes */}
      <rect x="10" y="100" width="112" height="36" rx="18" fill="#F47434" />
      <text x="66" y="123" fill="#111D43" fontSize="12" fontFamily={FONT} fontWeight="700" textAnchor="middle">
        {labels.chipTelegram}
      </text>
      <rect x="362" y="160" width="108" height="36" rx="18" fill="#182548" stroke="#F47434" />
      <text x="416" y="183" fill="#F47434" fontSize="12" fontFamily={FONT} fontWeight="700" textAnchor="middle">
        {labels.chipContract}
      </text>
      <rect x="26" y="280" width="92" height="36" rx="18" fill="#182548" stroke="#F47434" />
      <text x="72" y="303" fill="#F2F4FA" fontSize="11" fontFamily={FONT} fontWeight="600" textAnchor="middle">
        {labels.chipFriends}
      </text>
    </svg>
  );
}

export type BotChatLabels = {
  aria: string;
  group: string;
  members: string;
  bot: string;
  cmdNew: string;
  setup: string;
  join: string;
  joined: string;
  locked: string;
  cmdConfirm: string;
  paid: string;
};

const defaultBotChatLabels: BotChatLabels = {
  aria: "Chat de Telegram con el bot de OtterPot: se crea un reto con /nuevo, los amigos se suman, el pozo queda bloqueado y el ganador cobra",
  group: "Retos del gym",
  members: "4 miembros",
  bot: "OtterPot",
  cmdNew: "/nuevo 25 24",
  setup: "Reto armado · 25 USDC · 24 h",
  join: "Me sumo",
  joined: "Ana, Beto y Caro se sumaron",
  locked: "Pozo: 100 USDC · 4/4 depositaron",
  cmdConfirm: "/confirmar @ana",
  paid: "Ana ganó 100 USDC",
};

/** Mockup del chat de Telegram con el flujo del bot, de /nuevo al pago. */
export function BotChatArt({ className, labels = defaultBotChatLabels }: { className?: string; labels?: BotChatLabels }) {
  const userBubble = (y: number, text: string) => (
    <g>
      <rect x="150" y={y} width="186" height="34" rx="14" fill="#F47434" />
      <text x="324" y={y + 22} fill="#111D43" fontSize="12" fontFamily={FONT} fontWeight="700" textAnchor="end">
        {text}
      </text>
    </g>
  );
  const botBubble = (y: number, text: string, accent = "#F2F4FA") => (
    <g>
      <rect x="24" y={y} width="236" height="34" rx="14" fill="#182548" stroke="rgba(244,116,52,0.35)" />
      <text x="38" y={y + 22} fill={accent} fontSize="11.5" fontFamily={FONT} fontWeight="600">
        {text}
      </text>
    </g>
  );
  return (
    <svg
      viewBox="0 0 360 440"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={labels.aria}
    >
      <rect width="360" height="440" rx="24" fill="#111D43" stroke="#F47434" strokeOpacity="0.4" />

      {/* Barra del grupo */}
      <rect width="360" height="60" rx="24" fill="#182548" />
      <rect y="36" width="360" height="24" fill="#182548" />
      <circle cx="40" cy="30" r="16" fill="#F47434" />
      <text x="40" y="35" fill="#111D43" fontSize="13" fontFamily={FONT} fontWeight="700" textAnchor="middle">
        {labels.group.charAt(0)}
      </text>
      <text x="66" y="27" fill="#F2F4FA" fontSize="13" fontFamily={FONT} fontWeight="700">
        {labels.group}
      </text>
      <text x="66" y="44" fill="#8B97B8" fontSize="10" fontFamily={FONT} fontWeight="600">
        {labels.members}
      </text>

      {userBubble(78, labels.cmdNew)}

      {/* Tarjeta del bot con botón */}
      <rect x="24" y="126" width="236" height="78" rx="14" fill="#182548" stroke="rgba(244,116,52,0.35)" />
      <text x="38" y="146" fill="#F47434" fontSize="10" fontFamily={FONT} fontWeight="700">
        {labels.bot}
      </text>
      <text x="38" y="164" fill="#F2F4FA" fontSize="11.5" fontFamily={FONT} fontWeight="600">
        {labels.setup}
      </text>
      <rect x="38" y="174" width="208" height="22" rx="8" fill="#F47434" opacity="0.2" />
      <text x="142" y="189" fill="#F47434" fontSize="11" fontFamily={FONT} fontWeight="700" textAnchor="middle">
        {labels.join}
      </text>

      {botBubble(216, `✓ ${labels.joined}`)}
      {botBubble(262, `🔒 ${labels.locked}`, "#3DBA7A")}
      {userBubble(308, labels.cmdConfirm)}

      {/* Pago */}
      <rect x="24" y="356" width="236" height="44" rx="14" fill="#182548" stroke="#3DBA7A" strokeWidth="1.5" />
      <text x="38" y="383" fill="#3DBA7A" fontSize="12.5" fontFamily={FONT} fontWeight="700">
        🏆 {labels.paid}
      </text>
    </svg>
  );
}

export type FriendsArtLabels = {
  aria: string;
  deposit: string;
  pot: string;
  potCaption: string;
  winner: string;
  refund: string;
};

const defaultFriendsLabels: FriendsArtLabels = {
  aria: "Cuatro amigos depositan 50 USDC cada uno en un pozo bloqueado en el contrato; el pozo va al ganador o vuelve a todos",
  deposit: "+50",
  pot: "200 USDC",
  potCaption: "Pozo en el contrato",
  winner: "Ganador",
  refund: "Sin acuerdo: vuelve a todos",
};

/** Escena: cada amigo deposita, el pozo queda en el contrato y sale al ganador (o vuelve a todos). */
export function FriendsShareArt({ className, labels = defaultFriendsLabels }: { className?: string; labels?: FriendsArtLabels }) {
  const friends = [
    { x: 70, l: "A" },
    { x: 150, l: "B" },
    { x: 230, l: "C" },
    { x: 310, l: "D" },
  ];
  return (
    <svg
      viewBox="0 0 560 320"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={labels.aria}
    >
      <rect width="560" height="320" rx="24" fill="#182548" />
      <circle cx="80" cy="60" r="48" fill="#F47434" opacity="0.12" />
      <circle cx="500" cy="260" r="64" fill="#F47434" opacity="0.1" />

      {/* Amigos que depositan */}
      {friends.map(f => (
        <g key={f.l}>
          <circle cx={f.x} cy="70" r="26" fill="#111D43" stroke="#F47434" strokeWidth="2" />
          <text x={f.x} y="77" fill="#F2F4FA" fontSize="18" fontFamily={FONT} fontWeight="700" textAnchor="middle">
            {f.l}
          </text>
          <rect x={f.x - 24} y="104" width="48" height="22" rx="11" fill="#F47434" opacity="0.15" />
          <text x={f.x} y="119" fill="#F47434" fontSize="11" fontFamily={FONT} fontWeight="700" textAnchor="middle">
            {labels.deposit}
          </text>
          <path d={`M${f.x} 130 L190 172`} stroke="#F47434" strokeWidth="2" strokeDasharray="4 4" />
        </g>
      ))}

      {/* Pozo bloqueado */}
      <rect x="110" y="172" width="160" height="72" rx="18" fill="#111D43" stroke="#F47434" strokeWidth="2" />
      <g transform="translate(130 196)">
        <rect x="0" y="5" width="16" height="14" rx="3" fill="#3DBA7A" />
        <path d="M3.5 5.5V3a4.5 4.5 0 0 1 9 0v2.5" stroke="#3DBA7A" strokeWidth="2" />
      </g>
      <text x="200" y="210" fill="#F47434" fontSize="20" fontFamily={FONT} fontWeight="700" textAnchor="middle">
        {labels.pot}
      </text>
      <text x="200" y="230" fill="#8B97B8" fontSize="11" fontFamily={FONT} fontWeight="600" textAnchor="middle">
        {labels.potCaption}
      </text>

      {/* Pago al ganador */}
      <path d="M270 208 H380" stroke="#3DBA7A" strokeWidth="2.5" />
      <path d="M372 201 L382 208 L372 215" stroke="#3DBA7A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="430" cy="208" r="36" fill="#111D43" stroke="#3DBA7A" strokeWidth="2.5" />
      <path
        d="M418 192h24v8a12 12 0 0 1-24 0v-8zM418 196h-6a6 6 0 0 0 6 8M442 196h6a6 6 0 0 1-6 8M430 212v6M422 222h16"
        stroke="#F47434"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="430" y="266" fill="#3DBA7A" fontSize="13" fontFamily={FONT} fontWeight="700" textAnchor="middle">
        {labels.winner}
      </text>

      {/* Reembolso si no hay acuerdo */}
      <text x="190" y="284" fill="#8B97B8" fontSize="11" fontFamily={FONT} fontWeight="600" textAnchor="middle">
        ↺ {labels.refund}
      </text>
    </svg>
  );
}

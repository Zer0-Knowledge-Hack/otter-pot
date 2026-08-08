/**
 * Landing de OtterPot.
 *
 * Regla que ordena el contenido: **todo lo que afirma acá tiene que ser verificable**.
 * Por eso no dice que resolvemos fricción cross-border (las fintech ya lo hacen), ni que
 * el pozo genera rendimiento (falso a esta escala), ni usa el eslogan «Retos que crecen
 * juntos» — la propia demo lo desmiente. Ver `docs/VALIDATION.md` §10 y `DESIGN.md` §1.
 *
 * Los enlaces a Arbiscan son el argumento central: un jurado los abre y ve los contratos.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OtterPot — El pozo existe antes de que haya un ganador",
  description:
    "Retos con pozo compartido en Telegram. El dinero queda bloqueado en un contrato en Arbitrum: nadie lo custodia y nadie puede desviarlo.",
};

const POOL = "0xc03f18bb6056b57af3329133faa8e412ba02ce1f";
const VAULT = "0xba2fc3e3acedf233040dab303facf7443c3b501e";
const USDC = "0x02dd6a59881ef4deabe89af19fa5dd8231e20137";
const SCAN = "https://sepolia.arbiscan.io/address";

const NARANJA = "#FF6B35";
const NARANJA_OSCURO = "#E5533D";
const NARANJA_CLARO = "#FFE0D0";
const NAVY = "#1D3557";
const AZUL = "#457B9D";
const AZUL_CLARO = "#A8DADC";
const GRIS = "#F8F9FA";

const PASOS = [
  {
    n: "1",
    t: "Armás el reto en el grupo",
    d: "Escribís /nuevo y cada uno se anota con un botón. Todavía no hay nada en la cadena: abandonarlo no cuesta nada.",
  },
  {
    n: "2",
    t: "Cada uno deposita",
    d: "El pozo queda bloqueado en el contrato. Ni el bot ni nosotros podemos tocarlo — la firma es tuya y la custodia es del contrato.",
  },
  {
    n: "3",
    t: "El grupo confirma",
    d: "Cuando se alcanza el umbral que el grupo configuró, el contrato paga al ganador. Si nadie se pone de acuerdo antes del plazo, devuelve todo sin comisión.",
  },
];

const CASOS = [
  { e: "🏃", t: "Retos entre amigos", d: "Quién corre más, quién se levanta temprano, quién cocina mejor." },
  { e: "🌐", t: "Comunidades sin país común", d: "Donde nadie se conoce y la palabra no alcanza." },
  { e: "🐄", t: "Vaquitas y juntas", d: "Mismo pozo, otra regla de salida. Un regalo, un viaje, una emergencia." },
  { e: "🤝", t: "Colectas", d: "El destino es una wallet externa y no cobramos comisión." },
];

const EQUIPO = [
  { n: "William", r: "Pitch y narrativa" },
  { n: "Julio", r: "Landing, bot y orquestación" },
  { n: "Moises", r: "Contratos y backend" },
  { n: "Luishiño", r: "Auditoría y frontend" },
];

export default function Landing() {
  return (
    <main style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: NAVY }}>
      {/* Hero */}
      <section
        style={{
          background: `linear-gradient(160deg, ${NARANJA_CLARO} 0%, ${AZUL_CLARO} 100%)`,
          padding: "80px 24px 96px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 72, lineHeight: 1 }}>🦦</div>
        <h1 style={{ fontSize: "clamp(32px, 6vw, 56px)", fontWeight: 800, margin: "16px 0 8px", letterSpacing: -1 }}>
          OtterPot
        </h1>
        <p style={{ fontSize: "clamp(18px, 3vw, 26px)", fontWeight: 600, maxWidth: 720, margin: "0 auto 20px" }}>
          El pozo existe <em>antes</em> de que haya un ganador.
        </p>
        <p style={{ fontSize: 17, color: AZUL, maxWidth: 620, margin: "0 auto 32px", lineHeight: 1.6 }}>
          Retos con pozo compartido dentro de Telegram. El dinero queda bloqueado en un contrato en Arbitrum: nadie lo
          guarda y nadie puede desviarlo.
        </p>
        <a
          href="https://t.me/otter_pot_bot"
          style={{
            display: "inline-block",
            background: NARANJA,
            color: "#fff",
            padding: "14px 32px",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 17,
            textDecoration: "none",
          }}
        >
          Probar el bot en Telegram
        </a>
      </section>

      {/* Problema */}
      <section style={{ padding: "72px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <h2 style={{ fontSize: 30, fontWeight: 700, marginTop: 0 }}>El problema no es pagar. Es cobrar.</h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: AZUL }}>
            Mandar plata ya es gratis: Yape, Takenos, UglyCash. Pero cuando un grupo apuesta algo, el pozo{" "}
            <b style={{ color: NAVY }}>no existe</b> — es una promesa de N personas. Nadie puede verificar que los demás
            apartaron su parte, y nadie puede obligarlos a pagar.
          </p>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: AZUL }}>
            Entre amigos cercanos la presión social alcanza.{" "}
            <b style={{ color: NAVY }}>Entre desconocidos no hay quien cobre</b>, y por eso las comunidades online
            simplemente no hacen esto.
          </p>
          <div
            style={{
              background: NARANJA_CLARO,
              borderLeft: `4px solid ${NARANJA}`,
              padding: "18px 22px",
              borderRadius: 8,
              marginTop: 28,
            }}
          >
            <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
              Ganás un pozo de $50 y cobrás $30, porque cuatro de diez no pagaron.
            </p>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section style={{ padding: "72px 24px", background: GRIS }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h2 style={{ fontSize: 30, fontWeight: 700, marginTop: 0, textAlign: "center" }}>Cómo funciona</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 20,
              marginTop: 36,
            }}
          >
            {PASOS.map(p => (
              <div
                key={p.n}
                style={{ background: "#fff", borderRadius: 12, padding: 26, borderTop: `4px solid ${NARANJA}` }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: NARANJA,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    marginBottom: 14,
                  }}
                >
                  {p.n}
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 10px" }}>{p.t}</h3>
                <p style={{ fontSize: 15, lineHeight: 1.65, color: AZUL, margin: 0 }}>{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Por qué blockchain */}
      <section style={{ padding: "72px 24px", background: NAVY, color: "#fff" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <h2 style={{ fontSize: 30, fontWeight: 700, marginTop: 0 }}>¿Por qué blockchain y no una app común?</h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: AZUL_CLARO }}>
            Porque retener dinero de terceros convierte a cualquiera en transmisor de dinero: licencia, KYC y AML, país
            por país. Y porque si la plata la guardamos nosotros, seguís confiando en alguien — solo cambiaste en quién.
          </p>
          <p style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.6, marginTop: 24 }}>
            La cadena no piensa. Ejecuta lo que el grupo ratificó.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: AZUL_CLARO, marginTop: 24 }}>
            Los contratos están desplegados y son públicos. Podés abrirlos y ver cada transacción:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
            {[
              ["ChallengePool", POOL],
              ["TreasuryVault", VAULT],
              ["MockUSDC", USDC],
            ].map(([nombre, addr]) => (
              <a
                key={addr}
                href={`${SCAN}/${addr}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: `1px solid ${AZUL}`,
                  color: "#fff",
                  padding: "10px 16px",
                  borderRadius: 8,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                {nombre} ↗
              </a>
            ))}
          </div>
          <p style={{ fontSize: 13, color: AZUL_CLARO, marginTop: 16 }}>
            Arbitrum Sepolia · contratos en Rust con Stylus
          </p>
        </div>
      </section>

      {/* Casos de uso */}
      <section style={{ padding: "72px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h2 style={{ fontSize: 30, fontWeight: 700, marginTop: 0, textAlign: "center" }}>
            Un mismo pozo, distintas reglas
          </h2>
          <p style={{ textAlign: "center", color: AZUL, fontSize: 16, maxWidth: 600, margin: "12px auto 36px" }}>
            Cambia quién decide y adónde va el dinero. El contrato es el mismo.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
            {CASOS.map(c => (
              <div key={c.t} style={{ background: GRIS, borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>{c.e}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px" }}>{c.t}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: AZUL, margin: 0 }}>{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Equipo */}
      <section style={{ padding: "72px 24px", background: GRIS }}>
        <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 30, fontWeight: 700, marginTop: 0 }}>Quiénes lo estamos construyendo</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 18,
              marginTop: 32,
            }}
          >
            {EQUIPO.map(p => (
              <div key={p.n} style={{ background: "#fff", borderRadius: 12, padding: 22 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{p.n}</div>
                <div style={{ fontSize: 14, color: AZUL, marginTop: 4 }}>{p.r}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 14, color: AZUL, marginTop: 32 }}>ETH Lima 2026 · track de Arbitrum</p>
        </div>
      </section>

      {/* Cierre */}
      <footer style={{ background: NAVY, color: "#fff", padding: "56px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🦦</div>
        <p style={{ fontSize: 18, fontWeight: 600, margin: "0 0 24px" }}>Agregalo a tu grupo y probalo.</p>
        <a
          href="https://t.me/otter_pot_bot"
          style={{
            display: "inline-block",
            background: NARANJA,
            color: "#fff",
            padding: "13px 30px",
            borderRadius: 8,
            fontWeight: 700,
            textDecoration: "none",
          }}
          onMouseOver={undefined}
        >
          @otter_pot_bot
        </a>
        <p style={{ fontSize: 13, color: AZUL_CLARO, marginTop: 32, marginBottom: 0 }}>
          Prototipo en testnet. No uses fondos reales.
        </p>
        <p style={{ fontSize: 12, color: AZUL, marginTop: 8 }}>
          <span style={{ color: NARANJA_OSCURO }}>Otter</span>Pot · Apache 2.0
        </p>
      </footer>
    </main>
  );
}

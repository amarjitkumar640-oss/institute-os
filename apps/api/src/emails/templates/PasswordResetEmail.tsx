import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Row,
  Column,
  Text,
  Button,
  Link,
  Hr,
  Preview,
} from "@react-email/components";

// Default brand color — matches apps/web's own fallback
// (var(--color-primary,#7C3AED)) for a tenant with no configured brandPrimary,
// so an unbranded institute's reset email still looks consistent with its
// unbranded web portal.
const DEFAULT_PRIMARY = "#7C3AED";

// Plain hex → rgba string, no dependency — email clients don't reliably
// support color-mix()/CSS variables, so tints have to be pre-computed here
// rather than derived in CSS.
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(124,58,237,${alpha})`; // DEFAULT_PRIMARY fallback
  return `rgba(${r},${g},${b},${alpha})`;
}

interface PasswordResetEmailProps {
  firstName?: string;
  resetUrl?: string;
  expiresIn?: string;
  /** Tenant's Tenant.brandPrimary — falls back to DEFAULT_PRIMARY when unset. */
  primaryColor?: string;
}

const PasswordResetEmail = ({
  firstName = "there",
  resetUrl = "https://app.instituteos.com/login",
  expiresIn = "1 hour",
  primaryColor = DEFAULT_PRIMARY,
}: PasswordResetEmailProps) => {
  const styles = makeStyles(primaryColor);

  return (
    <Html>
      <Head />

      <Preview>
        Reset your InstituteOS password. This link expires in {expiresIn}.
      </Preview>

      <Body style={styles.body}>
        <Container style={styles.container}>

          {/* =========================
              HEADER
          ========================== */}
          <Section style={styles.header}>
            <Row>
              <Column>
                <Text style={styles.logo}>
                  <span style={styles.logoInstitute}>Institute</span>
                  <span style={styles.logoOs}>OS</span>
                </Text>
              </Column>

              <Column style={styles.helpColumn}>
                <Text style={styles.helpText}>
                  Need help?
                </Text>

                <Link
                  href="https://instituteos.com/help"
                  style={styles.helpLink}
                >
                  Visit Help Center
                </Link>
              </Column>
            </Row>
          </Section>

          {/* =========================
              HERO
          ========================== */}
          <Section style={styles.hero}>
            <Row>
              <Column style={styles.heroContent}>
                <Text style={styles.heroTitle}>
                  Reset your
                  <br />
                  InstituteOS password
                </Text>

                <Text style={styles.heroDescription}>
                  We received a request to reset your InstituteOS
                  account password.
                </Text>
              </Column>

              <Column style={styles.heroIconColumn}>
                <div style={styles.lockCircle}>
                  🔐
                </div>
              </Column>
            </Row>
          </Section>

          {/* =========================
              MAIN CONTENT
          ========================== */}
          <Section style={styles.content}>

            <Text style={styles.greeting}>
              Hi {firstName},
            </Text>

            <Text style={styles.description}>
              Click the button below to reset your password.
              This link will expire in{" "}
              <strong style={styles.expiry}>
                {expiresIn}.
              </strong>
            </Text>

            {/* CTA */}
            <Section style={styles.buttonSection}>
              <Button
                href={resetUrl}
                style={styles.button}
              >
                Reset Password
              </Button>
            </Section>

            {/* Expiry */}
            <Text style={styles.expiryText}>
              🔒 This password reset link is valid for {expiresIn}.
            </Text>

            {/* =========================
                OR DIVIDER
            ========================== */}
            <Section style={styles.dividerSection}>
              <Row>
                <Column style={styles.dividerLine} />
                <Column style={styles.orColumn}>
                  <Text style={styles.orText}>OR</Text>
                </Column>
                <Column style={styles.dividerLine} />
              </Row>
            </Section>

            {/* =========================
                FALLBACK URL
            ========================== */}
            <Text style={styles.fallbackTitle}>
              Having trouble with the button?
            </Text>

            <Text style={styles.fallbackText}>
              Copy and paste the following link into your browser:
            </Text>

            <Section style={styles.urlBox}>
              <Link
                href={resetUrl}
                style={styles.url}
              >
                {resetUrl}
              </Link>
            </Section>

            {/* =========================
                SECURITY NOTICE — deliberately NOT brand-colored (amber/warning
                is a fixed semantic meaning, same rule as the mobile design
                system: never derive a warning color from the tenant's brand).
            ========================== */}
            <Section style={styles.securityBox}>
              <Row>
                <Column style={styles.securityIconColumn}>
                  <div style={styles.securityIcon}>
                    ✓
                  </div>
                </Column>

                <Column>
                  <Text style={styles.securityTitle}>
                    Didn't request this?
                  </Text>

                  <Text style={styles.securityText}>
                    If you didn't request a password reset,
                    you can safely ignore this email — your
                    password won't change.
                  </Text>
                </Column>
              </Row>
            </Section>

          </Section>

          {/* =========================
              FOOTER
          ========================== */}
          <Section style={styles.footer}>

            <Text style={styles.thanks}>
              Thanks,
            </Text>

            <Text style={styles.team}>
              The InstituteOS Team
            </Text>

            <Text style={styles.automated}>
              This is an automated email, please do not reply.
            </Text>

            <Hr style={styles.footerDivider} />

            <Text style={styles.footerCopyright}>
              © {new Date().getFullYear()} InstituteOS. All rights reserved.
            </Text>

          </Section>

        </Container>
      </Body>
    </Html>
  );
};

export default PasswordResetEmail;

/* =========================================================
   STYLES — a function of primaryColor so every brand-driven
   value below is computed once per render, not hardcoded.
========================================================= */

function makeStyles(primaryColor: string) {
  return {

    body: {
      margin: 0,
      padding: "40px 20px",
      backgroundColor: "#f5f7fb",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      color: "#172033",
    },

    container: {
      width: "100%",
      maxWidth: "640px",
      margin: "0 auto",
      backgroundColor: "#ffffff",
      borderRadius: "16px",
      overflow: "hidden",
      border: "1px solid #e7ebf2",
    },

    /* =========================
       HEADER
    ========================== */

    header: {
      padding: "24px 40px",
      backgroundColor: "#ffffff",
    },

    logo: {
      margin: 0,
      fontSize: "25px",
      lineHeight: "32px",
      fontWeight: "700",
      letterSpacing: "-0.8px",
    },

    logoInstitute: {
      color: "#172033",
    },

    logoOs: {
      color: primaryColor,
    },

    helpColumn: {
      textAlign: "right" as const,
      verticalAlign: "middle" as const,
    },

    helpText: {
      margin: 0,
      fontSize: "13px",
      lineHeight: "18px",
      color: "#6b7280",
    },

    helpLink: {
      fontSize: "13px",
      lineHeight: "18px",
      color: primaryColor,
      textDecoration: "none",
      fontWeight: "600",
    },

    /* =========================
       HERO
    ========================== */

    hero: {
      padding: "42px 40px",
      backgroundColor: hexToRgba(primaryColor, 0.08),
    },

    heroContent: {
      verticalAlign: "middle" as const,
      width: "68%",
    },

    heroTitle: {
      margin: 0,
      fontSize: "32px",
      lineHeight: "40px",
      fontWeight: "700",
      letterSpacing: "-1px",
      color: "#102a56",
    },

    heroDescription: {
      margin: "18px 0 0",
      fontSize: "16px",
      lineHeight: "26px",
      color: "#455875",
    },

    heroIconColumn: {
      width: "32%",
      textAlign: "center" as const,
      verticalAlign: "middle" as const,
    },

    lockCircle: {
      width: "88px",
      height: "88px",
      lineHeight: "88px",
      margin: "0 auto",
      borderRadius: "50%",
      backgroundColor: "#ffffff",
      fontSize: "42px",
      textAlign: "center" as const,
    },

    /* =========================
       CONTENT
    ========================== */

    content: {
      padding: "40px",
    },

    greeting: {
      margin: 0,
      fontSize: "19px",
      lineHeight: "28px",
      fontWeight: "700",
      color: "#172033",
    },

    description: {
      margin: "16px 0 0",
      fontSize: "16px",
      lineHeight: "26px",
      color: "#374151",
    },

    expiry: {
      color: primaryColor,
    },

    /* =========================
       BUTTON
    ========================== */

    buttonSection: {
      textAlign: "center" as const,
      padding: "28px 0 12px",
    },

    button: {
      backgroundColor: primaryColor,
      color: "#ffffff",
      padding: "14px 38px",
      borderRadius: "8px",
      fontSize: "16px",
      lineHeight: "24px",
      fontWeight: "600",
      textDecoration: "none",
      display: "inline-block",
    },

    expiryText: {
      margin: "10px 0 0",
      textAlign: "center" as const,
      fontSize: "13px",
      lineHeight: "20px",
      color: "#6b7280",
    },

    /* =========================
       DIVIDER
    ========================== */

    dividerSection: {
      padding: "28px 0 22px",
    },

    dividerLine: {
      borderTop: "1px solid #e5e7eb",
      width: "45%",
    },

    orColumn: {
      width: "10%",
      textAlign: "center" as const,
    },

    orText: {
      margin: 0,
      fontSize: "12px",
      color: "#9ca3af",
      fontWeight: "600",
    },

    /* =========================
       FALLBACK
    ========================== */

    fallbackTitle: {
      margin: 0,
      fontSize: "15px",
      lineHeight: "22px",
      fontWeight: "600",
      color: "#172033",
    },

    fallbackText: {
      margin: "6px 0 12px",
      fontSize: "14px",
      lineHeight: "22px",
      color: "#6b7280",
    },

    urlBox: {
      padding: "14px 16px",
      backgroundColor: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: "8px",
    },

    url: {
      color: primaryColor,
      fontSize: "13px",
      lineHeight: "20px",
      textDecoration: "none",
      wordBreak: "break-all" as const,
    },

    /* =========================
       SECURITY — fixed amber/warning, not brand-derived
    ========================== */

    securityBox: {
      marginTop: "24px",
      padding: "16px",
      backgroundColor: "#fff9e9",
      border: "1px solid #ffe5a3",
      borderRadius: "10px",
    },

    securityIconColumn: {
      width: "48px",
      verticalAlign: "top" as const,
    },

    securityIcon: {
      width: "34px",
      height: "34px",
      lineHeight: "34px",
      borderRadius: "50%",
      backgroundColor: "#fff0c2",
      color: "#d99200",
      fontSize: "18px",
      fontWeight: "700",
      textAlign: "center" as const,
    },

    securityTitle: {
      margin: 0,
      fontSize: "14px",
      lineHeight: "20px",
      fontWeight: "700",
      color: "#3b321c",
    },

    securityText: {
      margin: "3px 0 0",
      fontSize: "13px",
      lineHeight: "20px",
      color: "#665a3c",
    },

    /* =========================
       FOOTER — fixed neutral, not brand-derived
    ========================== */

    footer: {
      padding: "30px 40px",
      backgroundColor: "#f8fafc",
    },

    thanks: {
      margin: 0,
      fontSize: "14px",
      lineHeight: "22px",
      color: "#374151",
    },

    team: {
      margin: "2px 0 0",
      fontSize: "14px",
      lineHeight: "22px",
      fontWeight: "700",
      color: "#172033",
    },

    automated: {
      margin: "6px 0 0",
      fontSize: "12px",
      lineHeight: "18px",
      color: "#9ca3af",
    },

    footerDivider: {
      margin: "22px 0 16px",
      borderColor: "#e5e7eb",
    },

    footerCopyright: {
      margin: 0,
      fontSize: "11px",
      lineHeight: "18px",
      color: "#9ca3af",
    },
  };
}

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BarChart3, ScrollText, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  CURRENT_ACCOUNT_KEY,
  fetchCurrentAccount,
  fetchSignInStatus,
  leaveGateway,
  signInWithPassword,
  signInWithZoho,
  type SignInStatus,
} from "@/lib/session";
import tgoLogoOnDark from "@/assets/tgo-logo-ondark.png";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Torero Global Outsourcing HR Operations" },
      {
        name: "description",
        content:
          "Sign in to the Torero Global Outsourcing HR Operations portal with your Zoho account.",
      },
      { property: "og:title", content: "Sign In — Torero Global Outsourcing HR Operations" },
    ],
  }),
  component: LoginPage,
});

// Mirrors the real navigation (Directory, Analytics, Activity Logs) so the pitch
// on this screen matches what's actually in the product.
const HIGHLIGHTS = [
  { icon: Users, label: "Manage your directory, hires and exits in one place" },
  { icon: BarChart3, label: "Visual analytics on headcount and tenure" },
  { icon: ScrollText, label: "Full audit trail on every record change" },
];

function LoginPage() {
  const navigate = useNavigate();
  // Null until /auth/status answers. With the TGO Gateway in front (mode
  // "gateway"), this page never shows the Zoho button: a signed-out visitor
  // goes straight to the Gateway, and anyone the Gateway turned away sees why
  // instead of bouncing between the two.
  const [signIn, setSignIn] = useState<SignInStatus | null>(null);
  // The email + password form. Opened by default with /login?fallback=1 — the
  // way in when the Gateway is the thing that's broken, since a signed-out
  // Gateway-mode visitor is otherwise redirected before ever seeing this page.
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const wantsFallback = new URLSearchParams(window.location.search).has("fallback");
    if (wantsFallback) setShowPasswordForm(true);
    fetchSignInStatus().then(async (result) => {
      if (cancelled) return;
      if (result.mode === "gateway") {
        if (result.status === "signed_in") {
          navigate({ to: "/" });
        } else if (result.status === "signed_out" && result.login_url && !wantsFallback) {
          window.location.href = result.login_url;
        } else {
          setSignIn(result);
        }
        return;
      }
      // Zoho mode: already signed in — no reason to show the login screen.
      const profile = await fetchCurrentAccount();
      if (cancelled) return;
      if (profile) {
        navigate({ to: "/" });
      } else {
        setSignIn(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Surfaces why we're back on this screen after a round trip to Zoho that
  // didn't end in a session — see backend/app/api/routes/auth.py, which
  // appends ?error=... to this redirect for each failure case.
  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error === "inactive") {
      toast.error("Your account isn't active yet. Contact your admin.");
    } else if (error === "invite_only") {
      toast.error(
        "Sign-in is currently invite-only. Ask an admin to add you from User Management before you can sign in.",
      );
    } else if (error === "zoho") {
      toast.error("Zoho sign-in didn't go through. Please try again.");
    }
  }, []);

  function handleZohoSignIn() {
    signInWithZoho();
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-muted/30 p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: "radial-gradient(600px circle at 50% 35%, var(--primary), transparent 60%)",
          opacity: 0.06,
        }}
      />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative grid w-full max-w-3xl overflow-hidden rounded-3xl border bg-card shadow-2xl sm:grid-cols-2">
        {/* Sign-in panel */}
        <div className="flex flex-col justify-center px-8 py-12 sm:px-10">
          <div className="mx-auto w-full max-w-xs">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            {signIn?.mode === "gateway" ? (
              <GatewayNotice signIn={signIn} />
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in to your HR Operations account
                </p>
                <Button
                  className="mt-6 w-full shadow-sm transition-shadow hover:shadow-md"
                  size="lg"
                  disabled={!signIn}
                  onClick={handleZohoSignIn}
                >
                  Continue with Zoho
                </Button>
              </>
            )}
            {showPasswordForm ? (
              <PasswordSignInForm onCancel={() => setShowPasswordForm(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setShowPasswordForm(true)}
                className="mt-4 w-full cursor-pointer text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Sign in with email and password instead
              </button>
            )}
            <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
              Access is limited to authorized HR Operations staff. Contact your admin if you can't
              sign in.
            </p>
          </div>
        </div>

        {/* Decorative panel — fixed dark colors, not theme tokens */}
        <div className="relative hidden flex-col justify-center gap-8 bg-[#0f2a3d] px-10 py-12 sm:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 1px, transparent 0)",
              backgroundSize: "20px 20px",
            }}
          />
          <img
            src={tgoLogoOnDark}
            alt="Torero Global Outsourcing"
            className="relative h-16 w-auto object-contain"
          />
          <div className="relative">
            <h2 className="text-xl font-semibold text-white">Torero Global Outsourcing</h2>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-white/40">
              HR Operations
            </p>
            <p className="mt-2 max-w-[240px] text-sm text-white/60">
              For Torero Global Outsourcing's HR Operations team
            </p>
          </div>
          <ul className="relative flex w-full flex-col gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#8bc47f]/15">
                  <Icon className="size-4 text-[#8bc47f]" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// Why a Gateway-mode visitor is still on this page. Every case offers one way
// forward; an ended session or a denial needs a fresh Gateway sign-in (possibly
// as someone else), so that button signs out of the Gateway first.
function GatewayNotice({ signIn }: { signIn: SignInStatus }) {
  const ended = signIn.status === "ended";
  const message = ended
    ? "Your session was ended by an admin. Sign in again through the TGO Gateway."
    : signIn.status === "denied" && signIn.email
      ? `You're signed in to the TGO Gateway as ${signIn.email}, but that account hasn't been granted TGO Workforce there. Ask an admin to grant it in the Gateway, or sign in with a different account.`
      : (signIn.detail ?? "Sign in through the TGO Gateway to continue.");
  const retry = signIn.status === "unavailable" || !signIn.logout_url;

  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button
        className="mt-6 w-full shadow-sm transition-shadow hover:shadow-md"
        size="lg"
        onClick={() => {
          if (retry) {
            window.location.reload();
          } else if (signIn.logout_url) {
            void leaveGateway({ logoutUrl: signIn.logout_url, loginUrl: signIn.login_url });
          }
        }}
      >
        {retry ? "Try again" : ended ? "Sign in again" : "Sign in as someone else"}
      </Button>
    </>
  );
}

// The fallback sign-in: a plain email + password form against POST /auth/login.
// Works with either SSO mode in front. Errors come back as safe messages (and a
// lockout message after repeated failures); success drops the account straight
// into the query cache so the app shell doesn't have to re-fetch it.
function PasswordSignInForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const account = await signInWithPassword(email.trim(), password);
      queryClient.setQueryData(CURRENT_ACCOUNT_KEY, account);
      navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in. Please try again.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-3 border-t pt-5">
      <div className="space-y-1.5">
        <Label htmlFor="fallback-email">Email</Label>
        <Input
          id="fallback-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="fallback-password">Password</Label>
        <Input
          id="fallback-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={submitting || !email || !password}>
        {submitting ? "Signing in..." : "Sign in"}
      </Button>
      <button
        type="button"
        onClick={onCancel}
        className="w-full cursor-pointer text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CURRENT_ACCOUNT_KEY,
  fetchCurrentAccount,
  fetchSignInStatus,
  leaveGateway,
  signInWithPassword,
  signInWithZoho,
  type SignInStatus,
} from "@/lib/session";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "TGO Workforce" }],
  }),
  component: LoginPage,
});

// Not a login screen any more: sign-in happens at the TGO Gateway. This route
// is only ever seen when something needs saying —
//   * a Gateway turned-away / inactive / invite-only / unreachable status,
//   * Zoho mode (no GATEWAY_URL set), which keeps a bare "Continue with Zoho",
//   * /login?fallback=1, the hidden email + password form for emergencies.
// A signed-out Gateway visitor never lands here at all (the app shell sends them
// straight to the Gateway), and if they do arrive they're forwarded at once.
function LoginPage() {
  const navigate = useNavigate();
  // Null until /auth/status answers.
  const [signIn, setSignIn] = useState<SignInStatus | null>(null);
  const [wantsFallback, setWantsFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fallback = new URLSearchParams(window.location.search).has("fallback");
    setWantsFallback(fallback);
    fetchSignInStatus().then(async (result) => {
      if (cancelled) return;
      if (result.mode === "gateway") {
        if (result.status === "signed_in") {
          navigate({ to: "/" });
        } else if (result.status === "signed_out" && result.login_url && !fallback) {
          window.location.href = result.login_url;
        } else {
          setSignIn(result);
        }
        return;
      }
      // Zoho mode: already signed in — nothing to show.
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

  // Surfaces why we're back here after a round trip to Zoho that didn't end in a
  // session — see backend/app/api/routes/auth.py, which appends ?error=... to
  // this redirect for each failure case.
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

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm text-center">
        {signIn === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            {wantsFallback ? "Loading…" : "Taking you to the TGO Gateway…"}
          </p>
        ) : (
          <>
            <h1 className="text-lg font-semibold tracking-tight">TGO Workforce</h1>
            {signIn.mode === "gateway" ? (
              <GatewayNotice signIn={signIn} />
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">Sign in to continue.</p>
                <Button className="mt-5 w-full" onClick={() => signInWithZoho()}>
                  Continue with Zoho
                </Button>
              </>
            )}
          </>
        )}
        {wantsFallback && <PasswordSignInForm />}
      </div>
    </div>
  );
}

// Why a Gateway-mode visitor is on this page. Every case offers one way
// forward; an ended session or a denial needs a fresh Gateway sign-in (possibly
// as someone else), so that button signs out of the Gateway first.
function GatewayNotice({ signIn }: { signIn: SignInStatus }) {
  const ended = signIn.status === "ended";
  const signedOut = signIn.status === "signed_out";
  const message = ended
    ? "Your session was ended by an admin. Sign in again through the TGO Gateway."
    : signIn.status === "denied" && signIn.email
      ? `You're signed in to the TGO Gateway as ${signIn.email}, but that account hasn't been granted TGO Workforce there. Ask an admin to grant it in the Gateway, or sign in with a different account.`
      : (signIn.detail ?? "Sign in through the TGO Gateway to continue.");
  const retry = signIn.status === "unavailable" || (!signedOut && !signIn.logout_url);

  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button
        className="mt-5 w-full"
        onClick={() => {
          if (retry) {
            window.location.reload();
          } else if (signedOut && signIn.login_url) {
            window.location.href = signIn.login_url;
          } else if (signIn.logout_url) {
            void leaveGateway({ logoutUrl: signIn.logout_url, loginUrl: signIn.login_url });
          }
        }}
      >
        {retry
          ? "Try again"
          : signedOut
            ? "Continue to the TGO Gateway"
            : ended
              ? "Sign in again"
              : "Sign in as someone else"}
      </Button>
    </>
  );
}

// The hidden emergency sign-in (only with /login?fallback=1): a plain email +
// password form against POST /auth/login. Works with either SSO mode in front.
// Errors come back as safe messages (and a lockout message after repeated
// failures); success drops the account straight into the query cache so the app
// shell doesn't have to re-fetch it.
function PasswordSignInForm() {
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
    <form onSubmit={handleSubmit} className="mt-6 space-y-3 border-t pt-5 text-left">
      <p className="text-center text-xs text-muted-foreground">Emergency sign-in</p>
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
    </form>
  );
}

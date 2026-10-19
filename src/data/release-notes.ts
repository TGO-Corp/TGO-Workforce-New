// What the Dashboard's "What's new" card shows: a plain, newest-first list of
// releases, each with a few user-facing lines. Written by hand (not generated
// from commit messages) so it reads like release notes, not a change log.
//
// To announce an update: add a new entry at the TOP of RELEASE_NOTES — bump the
// version (a calendar version, YYYY.MM.DD), give it a short title, and list what
// changed as "new" / "improved" / "fixed" lines. The card reappears for everyone
// who had dismissed the previous version, since dismissal is remembered per
// version (see components/dashboard/whats-new-card.tsx).

export type ReleaseNoteKind = "new" | "improved" | "fixed";

export type ReleaseNote = {
  /** Calendar version, YYYY.MM.DD — also what "dismissed" is remembered against. */
  version: string;
  /** ISO date (YYYY-MM-DD) the update went out. */
  date: string;
  title: string;
  items: { kind: ReleaseNoteKind; text: string }[];
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "2026.10.19",
    date: "2026-10-19",
    title: "Notifications module",
    items: [
      {
        kind: "new",
        text: "A Notifications page in the sidebar, with a live unread count: search your inbox, filter to unread, mark items read or unread, and remove them.",
      },
      {
        kind: "new",
        text: "Clear read notifications or clear everything in one go (with a confirmation first).",
      },
      { kind: "improved", text: "The bell menu now has a View all notifications link." },
    ],
  },
  {
    version: "2026.10.14",
    date: "2026-10-14",
    title: "Dashboard and navigation refresh",
    items: [
      {
        kind: "improved",
        text: "The Dashboard has a tighter layout, with the milestone cards on top and a new Needs attention panel listing pending work across the modules you can open.",
      },
      { kind: "improved", text: "A cleaner, calmer sidebar." },
      { kind: "new", text: "A TGO Gateway Portal link in the sidebar." },
      {
        kind: "improved",
        text: "Office captions now read Philippines Hub and Columbia Hub.",
      },
    ],
  },
  {
    version: "2026.10.13",
    date: "2026-10-13",
    title: "Notifications at the top right",
    items: [
      {
        kind: "improved",
        text: "Pop-up messages (saved, removed, errors) now appear at the upper right, just below the navbar.",
      },
    ],
  },
  {
    version: "2026.10.12",
    date: "2026-10-12",
    title: "Faster lists and account clean-up",
    items: [
      {
        kind: "new",
        text: "User Management can now remove an account, with a confirmation first.",
      },
      {
        kind: "new",
        text: "Every HMO Management tab has search, filters and pagination.",
      },
      {
        kind: "improved",
        text: "Activity Logs searches, filters and pages on the server, so older entries are always reachable however long the audit trail gets.",
      },
      {
        kind: "fixed",
        text: "Employee and award lists now always load in full instead of cutting off at a fixed size.",
      },
    ],
  },
  {
    version: "2026.10.09",
    date: "2026-10-09",
    title: "Sign-in and session updates",
    items: [
      {
        kind: "improved",
        text: "Sign-in goes straight through the TGO Gateway; signing out brings you back to the Gateway login, ready to return to Workforce.",
      },
      { kind: "new", text: "A Hard refresh button in the navbar clears cached data and reloads." },
      { kind: "improved", text: "Double tap (or double click) to skip the welcome intro." },
      {
        kind: "improved",
        text: "Active Sessions shows each person's module with its icon.",
      },
    ],
  },
  {
    version: "2026.10.08",
    date: "2026-10-08",
    title: "Saved filters and live sessions",
    items: [
      {
        kind: "new",
        text: "Anniversaries and Birthdays can be arranged by month, and your filters are saved to your account.",
      },
      {
        kind: "new",
        text: "Active Sessions updates live and shows which module each person is in.",
      },
      {
        kind: "new",
        text: "A loading screen appears when a Super Admin switches roles, and failed sign-ins now show the email that was used.",
      },
    ],
  },
  {
    version: "2026.10.07",
    date: "2026-10-07",
    title: "Welcome and Settings",
    items: [
      {
        kind: "new",
        text: "A welcome banner on the Dashboard with shortcuts to Settings, and an optional intro video after you sign in (switch it off in Settings).",
      },
      { kind: "improved", text: "A redesigned Settings page that saves from a single bar." },
      {
        kind: "fixed",
        text: "Anniversaries that fell earlier this month stay visible under Next 30 days.",
      },
    ],
  },
  {
    version: "2026.10.05",
    date: "2026-10-05",
    title: "Viewer dashboard and permissions",
    items: [
      {
        kind: "new",
        text: "Viewers get a personal overview with their own metrics and charts.",
      },
      {
        kind: "new",
        text: "Activity Logs and Onboarding New Hires now have their own permissions in the matrix, hidden from Viewers by default.",
      },
    ],
  },
];

export const LATEST_RELEASE = RELEASE_NOTES[0]!;

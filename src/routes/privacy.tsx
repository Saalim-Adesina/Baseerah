import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * DRAFT — NOT LEGAL ADVICE. Must be reviewed by a lawyer before publication.
 *
 * Two parts of this page are load-bearing for Google OAuth verification and
 * must stay accurate to the code, not aspirational:
 *
 *  1. The "Google user data" section. Google's API Services User Data Policy
 *     requires an affirmative Limited Use statement for restricted scopes.
 *     `gmail.readonly` is a restricted scope.
 *  2. The third-party transfer disclosure. Deck attachments read from Gmail are
 *     sent to Azure Document Intelligence for text extraction and to Azure
 *     OpenAI for screening. An assessor will compare this text against the
 *     actual data flow, so it is written from `src/server/gmail.server.ts` and
 *     `src/lib/azure.server.ts` rather than from a template.
 *
 * If the data flow changes, this page changes with it.
 */

const LAST_UPDATED = "22 August 2026";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Baseerah" },
      {
        name: "description",
        content:
          "How Baseerah handles your deal data, your mailbox and your account information, including our Limited Use commitments for Google user data.",
      },
    ],
  }),
  component: PrivacyPolicy,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <p className="label-caps">Legal</p>
      <h1 className="mt-1 text-4xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>

      <div className="panel mt-6 px-5 py-4 text-sm">
        <p className="font-medium">Draft pending legal review</p>
        <p className="mt-1 text-muted-foreground">
          This document describes the product&rsquo;s actual data handling accurately, but it has
          not yet been reviewed by a lawyer. Do not rely on it as a final legal instrument.
        </p>
      </div>

      <Section title="Who we are">
        <p>
          Baseerah (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides software that screens startup
          investment opportunities against an investor&rsquo;s own written thesis. This policy
          covers the Baseerah web application at baseerah.dev.
        </p>
        <p>
          Questions about this policy or your data: <strong>privacy@baseerah.dev</strong>.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          <strong>Account information.</strong> Your email address, name, firm name and investor
          type, collected when you register and during onboarding. Authentication is handled by
          Supabase Auth; if you sign in with Google we receive your email address, name and profile
          picture from Google, and nothing else.
        </p>
        <p>
          <strong>Deal data.</strong> Companies, founders, meeting notes, deck text, your written
          investment thesis, screening results, memos and chat threads — everything you create or
          upload in the product.
        </p>
        <p>
          <strong>Mailbox data, only if you connect a mailbox.</strong> Described in detail below.
        </p>
        <p>
          <strong>Billing information.</strong> Subscription status and plan, via Polar. We do not
          receive or store your card details.
        </p>
      </Section>

      <Section title="Google user data">
        <p>
          Connecting a Gmail account is entirely optional and the product is fully usable without
          it. If you do connect one, we request three scopes:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <code className="font-mono text-xs">userinfo.email</code> and{" "}
            <code className="font-mono text-xs">userinfo.profile</code> — to identify which mailbox
            is connected and display it back to you.
          </li>
          <li>
            <code className="font-mono text-xs">gmail.readonly</code> — to read messages that carry
            a pitch deck attachment, and to download that attachment.
          </li>
        </ul>
        <p>
          <strong>What we actually read.</strong> We do not read your mailbox generally. Every scan
          is filtered by a fixed search query that returns only messages which have an attachment,
          where that attachment is a PDF, PPTX, PPT or DOCX, excluding spam and trash, within a
          recent time window. For each matching message we read the subject, sender, timestamp,
          snippet, and the contents of the first supported attachment. You choose how many messages
          each scan may examine.
        </p>
        <p>
          <strong>What we store.</strong> An encrypted Google refresh token, so scans can run
          without asking you to sign in again. It is encrypted with AES-256-GCM before it is written
          to our database. Message content is not stored unless you explicitly import a message as a
          deal, in which case the extracted deck text and the message&rsquo;s subject, sender and
          identifier are saved to your account.
        </p>
        <p>
          <strong>Write access.</strong> None. The scope we request is read-only. We cannot send,
          delete, label or modify anything in your mailbox.
        </p>
        <p>
          <strong>Revoking access.</strong> Disconnect from Settings at any time. We revoke the
          token with Google and delete our stored copy. You can also revoke it directly at{" "}
          <a
            className="underline underline-offset-4"
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          . Deals you already imported remain in your account until you delete them.
        </p>
      </Section>

      <Section title="Limited Use">
        <p className="rounded-lg border border-border bg-surface p-4 text-foreground">
          Baseerah&rsquo;s use and transfer of information received from Google APIs to any other
          app will adhere to the{" "}
          <a
            className="underline underline-offset-4"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>Concretely, that means:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>We do not use Google user data for advertising, and we never sell it.</li>
          <li>
            We do not use Google user data to develop, improve or train generalised artificial
            intelligence models.
          </li>
          <li>
            No human at Baseerah reads your Google user data, except with your explicit consent for
            a specific issue you have raised, where required by law, or for security purposes such
            as investigating abuse. Our AI subprocessor, Microsoft, may review flagged content under
            its own abuse-monitoring controls, as described below — that review is a security
            purpose and is the only circumstance in which a person outside Baseerah may see this
            content.
          </li>
          <li>
            We transfer Google user data only as necessary to provide the feature you asked for, to
            comply with the law, or as part of a merger or acquisition with your consent.
          </li>
        </ul>
      </Section>

      <Section title="Third parties who process your data">
        <p>
          We do not sell data. These are the processors involved in delivering the product, and what
          each one sees:
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Microsoft Azure AI Document Intelligence</strong> — receives deck attachments,
            including those downloaded from a connected mailbox, to convert them into text. This is
            necessary because a PDF or PowerPoint file cannot be screened without first being read.
          </li>
          <li>
            <strong>Microsoft Azure OpenAI Service</strong> — receives the extracted deck text and
            the deal details in order to produce the screening analysis, memo or pass email you
            requested. Azure OpenAI does not use customer data submitted through the service to
            train or improve any Microsoft or third-party models.
            <br />
            Microsoft operates automated abuse monitoring on this service: prompts and responses are
            retained by Microsoft for up to 30 days and may be reviewed by authorised Microsoft
            personnel where automated systems flag a potential policy violation. This is an
            abuse-prevention and security control operated by Microsoft, not by us — no Baseerah
            employee can access that content, and it is not used for advertising, profiling or model
            training.
          </li>
          <li>
            <strong>Supabase</strong> — database, authentication and file storage.
          </li>
          <li>
            <strong>Polar</strong> — subscription billing. Receives your email address; card details
            go to their payment processor, not to us.
          </li>
          <li>
            <strong>Resend</strong> — delivers account emails such as confirmation and password
            reset.
          </li>
          <li>
            <strong>Vercel</strong> — application hosting.
          </li>
        </ul>
        <p>
          These transfers exist solely to provide features you have asked for. None of them use your
          data for their own purposes or for advertising.
        </p>
      </Section>

      <Section title="Retention and deletion">
        <p>
          Account and deal data is kept while your account is open. Delete an individual deal at any
          time from the pipeline and it is removed from the database. Disconnecting a mailbox
          immediately deletes the stored refresh token.
        </p>
        <p>
          To delete your account entirely, email <strong>privacy@baseerah.dev</strong>. We remove
          your account data within 30 days, excluding records we are legally required to retain,
          such as billing records.
        </p>
      </Section>

      <Section title="Security">
        <p>
          All traffic is encrypted in transit with TLS. Google refresh tokens are encrypted at rest
          with AES-256-GCM using a key held only in server-side configuration and never sent to the
          browser. Tenant separation is enforced in the database itself through row-level security,
          so one account cannot read another&rsquo;s rows even in the event of an application bug.
        </p>
        <p>
          No system is perfectly secure. If you believe you have found a vulnerability, please write
          to <strong>security@baseerah.dev</strong>.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, export or delete
          your personal data, and to object to certain processing. Contact{" "}
          <strong>privacy@baseerah.dev</strong> and we will respond within the period the applicable
          law requires.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we change how we handle your data we will update this page and revise the date above.
          Material changes affecting Google user data will be notified to you in the product before
          they take effect.
        </p>
      </Section>

      <div className="mt-12 flex gap-4 text-sm">
        <Link to="/" className="underline underline-offset-4">
          Home
        </Link>
        <Link to="/terms" className="underline underline-offset-4">
          Terms of Service
        </Link>
      </div>
    </main>
  );
}

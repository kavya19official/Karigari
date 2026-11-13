# Karigari: setup in 6 steps

1. **Supabase project**: create a free project at supabase.com.
2. **Database**: Supabase -> SQL Editor -> New query -> paste ALL of `supabase/schema.sql` -> Run.
   (It is safe to run again. It is the only SQL file you need.)
3. **Keys**: copy `.env.example` to `.env.local`. In Supabase click "Connect" (or Project Settings -> API Keys)
   and fill in the Project URL, the anon key and the service_role key. Add `GEMINI_API_KEY` for the AI agents.
4. **Run**: `npm install` then `npm run dev`, open http://localhost:3000
5. **Test**: sign up (any email, password of 6+ characters), sign out, sign in. Add a product as a seller.
6. **Deploy (optional)**: push to GitHub, import the repo in Vercel, add the same variables plus `CRON_SECRET`,
   and run `npm run build` locally first to catch errors.

Login is built in (no Supabase Auth, no emails, no dashboard settings). Accounts are stored in the
`app_users` table; the Google and Microsoft sign-in buttons were removed.

Demo-only limits: nothing verifies that an email belongs to the person, the login is remembered in the browser,
and most tables have Row Level Security off. Tighten these before real users.

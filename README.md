# Copy Paster

Save terminal commands and copy them on any computer.

Live page: https://patios.github.io/Copy-paster/

The page stays locked until you enter the same password as the kids schedule page. It can be remembered on that device for 30 days.

Commands are stored privately in Supabase. Create an account once, then sign in with that email and password on each computer. The app uses the public Supabase project URL and publishable key in [`config.js`](config.js); it never uses a service-role key.

## One-time Supabase setup

1. Open Supabase Dashboard → **SQL Editor** → **New query**.
2. Copy and run all of [`supabase.sql`](supabase.sql). It creates the table and Row Level Security policies that ensure each signed-in user can only access their own commands. To share one command by link, also run [`share.sql`](share.sql) once. That adds a token and a function which returns only the shared command.
3. Open **Authentication** → **URL Configuration** and set the Site URL to `https://patios.github.io/Copy-paster/`. Add that same URL to Redirect URLs.
4. Under **Authentication** → **Providers** → **Email**, keep Email enabled. Turn off **Confirm email** if you want to create the account without an inbox message.
5. Deploy these files to GitHub Pages, create the account once, then sign in with the same email and password on each computer.

The old `commands.json` data is no longer used. Export it from the old page, then use **Import** after signing in to migrate it.

Do not store passwords, API tokens, or other secrets in commands.

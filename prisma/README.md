# Prisma migration

This project uses Prisma ORM 7. The database URL for Prisma commands is configured in `prisma.config.ts` and comes from `DIRECT_URL`; `schema.prisma` contains the PostgreSQL model.

Set real connection strings in the local `.env` file, then run:

```sh
npm run db:status
npm run db:migrate
```

`DIRECT_URL` must be the Supabase PostgreSQL session-mode connection string for migrations. Do not commit `.env`, and do not put a Supabase `service_role` key in the mobile app. The SQL migration also enables RLS and adds the table to Supabase Realtime.

## Initial administrator

Create the Auth user in the Supabase Dashboard under **Authentication → Users → Add user**, using `mauriciotestesdev@gmail.com`. Confirm the email and set a password with at least 8 characters, including uppercase, lowercase, and a number. The database RLS policy grants record access only to that confirmed account. Do not send the password in chat or commit it to the repository.
